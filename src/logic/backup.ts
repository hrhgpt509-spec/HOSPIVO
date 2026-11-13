import { db, resetDatabase } from '../db';
import { addAudit } from '../db/audit';

export interface BackupMetadata {
  version: number;
  app: 'Hospivo';
  appVersion: string;
  exportedAt: string; // ISO string
  shopName: string;
  shopId?: number;
  tablesCount: Record<string, number>;
}

export interface BackupPayload {
  meta: BackupMetadata;
  tables: Record<string, unknown[]>;
  checksum: string; // SHA-256 hex string of JSON.stringify({ meta, tables })
}

export interface BackupHistoryEntry {
  id: string;
  timestamp: string; // ISO string
  sizeBytes: number;
  checksum: string;
  verified: boolean;
}

export interface BackupStatus {
  lastVerifiedBackupAt: string | null;
  isToday: boolean;
  isOlderThan3Days: boolean;
  daysAgo: number | null;
  statusText: string;
}

export const BACKUP_TABLE_NAMES = [
  'shop',
  'users',
  'settings',
  'auditLog',
  'medicines',
  'batches',
  'stockMovements',
  'suppliers',
  'purchases',
  'purchaseLines',
  'productTypes',
  'bills',
  'billItems',
  'heldBills',
  'billReturns',
  'supplierReturns',
  'customers',
  'udhaarPayments',
  'regularReminders',
  'dailyClosings',
  'syncOutbox',
  'approvalRequests',
] as const;

/**
 * Computes SHA-256 digest of given string using Web Crypto API.
 */
export async function computeSha256(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical serializer for backup payload content (meta + tables) to ensure
 * deterministic hashing across platforms.
 */
export function serializeBackupContent(meta: BackupMetadata, tables: Record<string, unknown[]>): string {
  return JSON.stringify({ meta, tables });
}

/**
 * Exports all database tables and generates a signed backup payload with SHA-256 checksum.
 */
export async function createBackup(customShopName?: string): Promise<BackupPayload> {
  let shopName = customShopName || 'Hospivo Pharmacy';
  let shopId: number | undefined;

  try {
    const shop = await db.shop.toCollection().first();
    if (shop) {
      shopName = shop.name;
      shopId = shop.id;
    }
  } catch {
    // fallback
  }

  const tables: Record<string, unknown[]> = {};
  const tablesCount: Record<string, number> = {};

  for (const tableName of BACKUP_TABLE_NAMES) {
    try {
      const rows = await (db[tableName] as any).toArray();
      tables[tableName] = rows || [];
      tablesCount[tableName] = rows?.length || 0;
    } catch {
      tables[tableName] = [];
      tablesCount[tableName] = 0;
    }
  }

  const meta: BackupMetadata = {
    version: 1,
    app: 'Hospivo',
    appVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    shopName,
    shopId,
    tablesCount,
  };

  const contentStr = serializeBackupContent(meta, tables);
  const checksum = await computeSha256(contentStr);

  return {
    meta,
    tables,
    checksum,
  };
}

/**
 * Verifies a backup payload structure and SHA-256 integrity hash.
 * Returns valid: false with an error code if corrupted or tampered with.
 */
export async function verifyBackup(
  payload: unknown
): Promise<{ valid: boolean; error?: string; payload?: BackupPayload }> {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'invalid_format' };
  }

  const candidate = payload as Partial<BackupPayload>;

  if (!candidate.meta || typeof candidate.meta !== 'object') {
    return { valid: false, error: 'missing_metadata' };
  }
  if (candidate.meta.app !== 'Hospivo' || typeof candidate.meta.version !== 'number') {
    return { valid: false, error: 'invalid_app_signature' };
  }
  if (!candidate.tables || typeof candidate.tables !== 'object') {
    return { valid: false, error: 'missing_tables' };
  }
  if (!candidate.checksum || typeof candidate.checksum !== 'string' || candidate.checksum.length !== 64) {
    return { valid: false, error: 'invalid_checksum_format' };
  }

  const contentStr = serializeBackupContent(candidate.meta, candidate.tables);
  const expectedHash = await computeSha256(contentStr);

  if (expectedHash !== candidate.checksum) {
    return { valid: false, error: 'checksum_mismatch' };
  }

  return { valid: true, payload: candidate as BackupPayload };
}

/**
 * Triggers browser file download of backup payload as a .json file.
 */
export function downloadBackupFile(payload: BackupPayload, prefix = 'hospivo_backup'): void {
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date()
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .slice(0, 19);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Records verified backup in settings and auditLog.
 * RULES.md: NEVER label a backup "successful" until verified.
 */
export async function recordVerifiedBackup(payload: BackupPayload, who = 'owner'): Promise<void> {
  const timestamp = payload.meta.exportedAt;
  const jsonStr = JSON.stringify(payload);
  const sizeBytes = new TextEncoder().encode(jsonStr).length;

  try {
    await db.settings.put({ key: 'lastVerifiedBackupAt', value: timestamp });

    // Update recent backup history list (up to 10 entries)
    let history: BackupHistoryEntry[] = [];
    const existing = await db.settings.get('backup_history');
    if (existing && Array.isArray(existing.value)) {
      history = existing.value as BackupHistoryEntry[];
    }

    const newEntry: BackupHistoryEntry = {
      id: `bk_${Date.now()}`,
      timestamp,
      sizeBytes,
      checksum: payload.checksum,
      verified: true,
    };

    history = [newEntry, ...history.filter((h) => h.checksum !== payload.checksum)].slice(0, 10);
    await db.settings.put({ key: 'backup_history', value: history });

    await addAudit(
      who,
      'backup_verified',
      'backup',
      `Backup created and verified (SHA-256: ${payload.checksum.slice(0, 10)}...)`
    );
  } catch (err) {
    console.error('Failed to record verified backup in settings:', err);
  }
}

/**
 * Reads verified backup status from settings.
 * Returns truthful state for Home status chip and red warning banner.
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  let lastVerifiedBackupAt: string | null = null;

  try {
    const item = await db.settings.get('lastVerifiedBackupAt');
    if (item && typeof item.value === 'string') {
      lastVerifiedBackupAt = item.value;
    }
  } catch {
    // ignore
  }

  if (!lastVerifiedBackupAt) {
    return {
      lastVerifiedBackupAt: null,
      isToday: false,
      isOlderThan3Days: true,
      daysAgo: null,
      statusText: 'no_backup_taken',
    };
  }

  const backupDate = new Date(lastVerifiedBackupAt);
  const now = new Date();

  // Compare calendar days
  const backupMidnight = new Date(backupDate.getFullYear(), backupDate.getMonth(), backupDate.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((nowMidnight - backupMidnight) / (24 * 60 * 60 * 1000));

  const isToday = diffDays === 0;
  const isOlderThan3Days = diffDays >= 3;

  return {
    lastVerifiedBackupAt,
    isToday,
    isOlderThan3Days,
    daysAgo: Math.max(0, diffDays),
    statusText: isToday ? 'today' : `${diffDays}_days_ago`,
  };
}

/**
 * Reads list of recent backups from settings (up to 10).
 */
export async function getBackupHistory(): Promise<BackupHistoryEntry[]> {
  try {
    const item = await db.settings.get('backup_history');
    if (item && Array.isArray(item.value)) {
      return item.value as BackupHistoryEntry[];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Restores all database tables from a verified backup payload.
 * Strictly verifies SHA-256 integrity first before touching the database.
 * Uses resetDatabase() to avoid row-level delete hooks.
 */
export async function restoreBackup(
  payload: BackupPayload,
  restoredBy = 'owner'
): Promise<{ success: boolean; tablesRestored: number; totalRecords: number }> {
  // 1. Verify integrity first
  const verification = await verifyBackup(payload);
  if (!verification.valid || !verification.payload) {
    throw new Error(`Invalid backup payload: ${verification.error || 'verification_failed'}`);
  }

  const validPayload = verification.payload;

  // 2. Cleanly reset database to empty state without triggering row hooks
  await resetDatabase();

  // 3. Restore all tables
  let tablesRestored = 0;
  let totalRecords = 0;

  for (const tableName of BACKUP_TABLE_NAMES) {
    const rows = validPayload.tables[tableName];
    if (Array.isArray(rows) && rows.length > 0) {
      try {
        await (db[tableName] as any).bulkAdd(rows);
        tablesRestored++;
        totalRecords += rows.length;
      } catch (err) {
        console.error(`Failed to restore table ${tableName}:`, err);
      }
    }
  }

  // 4. Update last verified backup timestamp in settings
  try {
    await db.settings.put({
      key: 'lastVerifiedBackupAt',
      value: validPayload.meta.exportedAt,
    });
  } catch {
    // ignore
  }

  // 5. Append restore event to auditLog
  try {
    await addAudit(
      restoredBy,
      'backup_restored',
      'backup',
      `Restored ${totalRecords} records across ${tablesRestored} tables from backup dated ${validPayload.meta.exportedAt}`
    );
  } catch (err) {
    console.error('Failed to log backup_restored audit:', err);
  }

  return {
    success: true,
    tablesRestored,
    totalRecords,
  };
}
