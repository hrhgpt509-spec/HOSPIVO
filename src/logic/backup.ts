import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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
  checksum?: string;
}

export interface BackupVerificationResult {
  isValid: boolean;
  error?: string;
  metadata?: BackupMetadata;
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

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Synchronous FIPS 180-4 SHA-256 hex digest helper (produces identical output to Web Crypto SHA-256).
 */
export function computeSha256Sync(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const totalLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Computes SHA-256 digest of given string using Web Crypto API (with synchronous SHA-256 fallback).
 */
export async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return computeSha256Sync(text);
}

/**
 * Canonical serializer for backup payload content (meta + tables) to ensure
 * deterministic hashing across platforms. Strips `checksum` from `meta` before serializing.
 */
export function serializeBackupContent(meta: BackupMetadata, tables: Record<string, unknown[]>): string {
  const { checksum: _ignored, ...cleanMeta } = meta;
  return JSON.stringify({ meta: cleanMeta, tables });
}

/**
 * Exports all database tables and generates a signed backup payload with SHA-256 checksum
 * stored both at the top-level and inside the metadata manifest (`meta.checksum`).
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

  const baseMeta: BackupMetadata = {
    version: 1,
    app: 'Hospivo',
    appVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    shopName,
    shopId,
    tablesCount,
  };

  const contentStr = serializeBackupContent(baseMeta, tables);
  const checksum = await computeSha256(contentStr);
  const meta: BackupMetadata = {
    ...baseMeta,
    checksum,
  };

  return {
    meta,
    tables,
    checksum,
  };
}

/**
 * Exports all database tables as a formatted JSON string with `checksum` included in the metadata manifest.
 */
export async function createBackupJson(customShopName?: string): Promise<string> {
  const payload = await createBackup(customShopName);
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses a backup JSON string, re-computes the SHA-256 hash of its payload,
 * and compares it against the stored manifest checksum to catch corruption or tampering before restore.
 */
export function verifyBackupPayload(jsonString: string): BackupVerificationResult {
  if (typeof jsonString !== 'string' || jsonString.trim().length === 0) {
    return { isValid: false, error: 'Backup payload must be a non-empty JSON string' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { isValid: false, error: 'Corrupted backup JSON: unable to parse payload' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false, error: 'Invalid backup format: root must be a JSON object' };
  }

  const meta: BackupMetadata | undefined = parsed.meta || parsed.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { isValid: false, error: 'Missing backup metadata manifest' };
  }

  if (meta.app !== 'Hospivo' || typeof meta.version !== 'number') {
    return { isValid: false, error: 'Invalid backup metadata: unrecognized application signature or version' };
  }

  if (!parsed.tables || typeof parsed.tables !== 'object' || Array.isArray(parsed.tables)) {
    return { isValid: false, error: 'Missing backup tables data' };
  }

  const manifestChecksum = meta.checksum;
  const rootChecksum = parsed.checksum;
  const storedChecksum = manifestChecksum ?? rootChecksum;

  if (
    !storedChecksum ||
    typeof storedChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(storedChecksum)
  ) {
    return { isValid: false, error: 'Missing or invalid SHA-256 checksum in backup manifest' };
  }

  if (
    manifestChecksum !== undefined &&
    rootChecksum !== undefined &&
    manifestChecksum !== rootChecksum
  ) {
    return { isValid: false, error: 'Checksum mismatch between metadata manifest and backup payload' };
  }

  const contentStr = serializeBackupContent(meta, parsed.tables);
  const computedChecksum = computeSha256Sync(contentStr);

  if (computedChecksum !== storedChecksum.toLowerCase()) {
    return {
      isValid: false,
      error: 'Checksum mismatch: backup payload has been corrupted or tampered with',
    };
  }

  return {
    isValid: true,
    metadata: {
      ...meta,
      checksum: computedChecksum,
    },
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

  const effectiveChecksum = candidate.checksum ?? candidate.meta.checksum;
  if (!effectiveChecksum || typeof effectiveChecksum !== 'string' || effectiveChecksum.length !== 64) {
    return { valid: false, error: 'invalid_checksum_format' };
  }

  const contentStr = serializeBackupContent(candidate.meta, candidate.tables);
  const expectedHash = await computeSha256(contentStr);

  if (
    expectedHash !== effectiveChecksum ||
    (candidate.checksum !== undefined && expectedHash !== candidate.checksum) ||
    (candidate.meta.checksum !== undefined && expectedHash !== candidate.meta.checksum)
  ) {
    return { valid: false, error: 'checksum_mismatch' };
  }

  const normalizedPayload: BackupPayload = {
    ...(candidate as BackupPayload),
    meta: {
      ...candidate.meta,
      checksum: expectedHash,
    },
    checksum: expectedHash,
  };

  return { valid: true, payload: normalizedPayload };
}

/**
 * Returns canonical backup filename: hospivo-backup-YYYY-MM-DD.json
 */
export function getBackupFilename(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `hospivo-backup-${yyyy}-${mm}-${dd}.json`;
}

/**
 * Step A (Generate & Verify in memory):
 * Builds the JSON payload from all Dexie tables and verifies its SHA-256 hash in memory.
 * Does NOT write lastBackupAt, backup history, or backup_created audit entries yet.
 */
export async function generateAndVerifyBackup(customShopName?: string): Promise<BackupPayload> {
  const payload = await createBackup(customShopName);
  const verification = await verifyBackup(payload);
  if (!verification.valid || !verification.payload) {
    throw new Error(`Backup verification failed: ${verification.error || 'invalid_payload'}`);
  }
  return verification.payload;
}

/**
 * Checks if the Native File System Access API (showDirectoryPicker) is supported.
 */
export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).showDirectoryPicker === 'function'
  );
}

/**
 * Prompts user to pick a real directory using window.showDirectoryPicker.
 * Returns { handle, folderName } or null if cancelled / unsupported.
 */
export async function pickBackupDirectory(): Promise<{ handle: any; folderName: string } | null> {
  if (!isDirectoryPickerSupported()) {
    return null;
  }
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    if (!handle) return null;
    return { handle, folderName: handle.name || 'Selected Folder' };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

let _memoryBackupDirectoryHandle: any = null;

/**
 * Reset in-memory backup directory handle (used in tests / database reset).
 */
export function _resetBackupDirectoryHandleForTesting(): void {
  _memoryBackupDirectoryHandle = null;
}

/**
 * Saves a FileSystemDirectoryHandle (and folder name) in Dexie settings.
 */
export async function saveBackupDirectoryHandle(handle: any): Promise<void> {
  if (!handle) return;
  _memoryBackupDirectoryHandle = handle;
  try {
    await db.settings.put({ key: 'backup_dir_handle', value: handle });
  } catch {
    // structuredClone in fake-indexeddb or non-supporting engines may reject JS function mocks
  }
  if (handle.name) {
    try {
      await db.settings.put({ key: 'backup_dir_name', value: handle.name });
    } catch {
      // ignore
    }
  }
}

/**
 * Retrieves the saved FileSystemDirectoryHandle from Dexie settings.
 */
export async function getSavedBackupDirectoryHandle(): Promise<any | null> {
  if (_memoryBackupDirectoryHandle) {
    return _memoryBackupDirectoryHandle;
  }
  try {
    const entry = await db.settings.get('backup_dir_handle');
    if (entry && entry.value) {
      _memoryBackupDirectoryHandle = entry.value;
      return entry.value;
    }
  } catch (err) {
    console.error('Failed to get saved backup directory handle:', err);
  }
  return null;
}

/**
 * Writes a verified backup JSON file directly into a FileSystemDirectoryHandle,
 * ensuring the SHA-256 checksum is embedded inside the metadata manifest.
 */
export async function writeBackupToDirectoryHandle(
  dirHandle: any,
  payload: BackupPayload,
  filename?: string
): Promise<{ success: boolean; filename: string }> {
  if (!dirHandle || typeof dirHandle.getFileHandle !== 'function') {
    throw new Error('Invalid directory handle');
  }
  const contentStr = serializeBackupContent(payload.meta, payload.tables);
  const checksum = payload.checksum || payload.meta?.checksum || (await computeSha256(contentStr));
  const payloadWithManifestChecksum: BackupPayload = {
    ...payload,
    meta: {
      ...payload.meta,
      checksum,
    },
    checksum,
  };
  const fallbackDate = payloadWithManifestChecksum.meta?.exportedAt
    ? new Date(payloadWithManifestChecksum.meta.exportedAt)
    : new Date();
  const name = filename || getBackupFilename(fallbackDate);
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  const jsonStr = JSON.stringify(payloadWithManifestChecksum, null, 2);
  await writable.write(jsonStr);
  await writable.close();
  return { success: true, filename: name };
}

/**
 * Checks if the Native File System Access API (showSaveFilePicker) is supported.
 */
export function isSaveFilePickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';
}

/**
 * Saves backup file using window.showSaveFilePicker (Chrome/Edge desktop).
 * Returns { success: true, cancelled: false } on completion,
 * or { success: false, cancelled: true } if user cancelled (AbortError).
 */
export async function saveBackupWithFilePicker(
  payload: BackupPayload,
  filename?: string
): Promise<{ success: boolean; cancelled: boolean }> {
  if (!isSaveFilePickerSupported()) {
    throw new Error('showSaveFilePicker is not supported in this browser');
  }

  const fallbackDate = payload.meta?.exportedAt ? new Date(payload.meta.exportedAt) : new Date();
  const suggestedName = filename || getBackupFilename(fallbackDate);
  const jsonStr = JSON.stringify(payload, null, 2);

  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'JSON Backup File',
          accept: {
            'application/json': ['.json'],
          },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(jsonStr);
    await writable.close();

    return { success: true, cancelled: false };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, cancelled: true };
    }
    throw err;
  }
}

/**
 * Triggers browser file download of backup payload as a .json file.
 */
export function downloadBackupFile(payload: BackupPayload, filename?: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const fallbackDate = payload.meta?.exportedAt ? new Date(payload.meta.exportedAt) : new Date();
  const downloadName = filename || getBackupFilename(fallbackDate);

  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface SaveBackupResult {
  status: 'saved' | 'cancelled' | 'needs_confirmation';
}

/**
 * Native Capacitor Android/iOS backup export:
 * Writes verified JSON to Documents/Hospivo (when permitted) and Cache,
 * then opens the native Android Share sheet so the user can save or send it.
 */
async function saveBackupNative(
  payload: BackupPayload,
  who = 'owner',
  filename?: string
): Promise<SaveBackupResult> {
  const contentStr = serializeBackupContent(payload.meta, payload.tables);
  const checksum = payload.checksum || payload.meta?.checksum || (await computeSha256(contentStr));
  const payloadWithChecksum: BackupPayload = {
    ...payload,
    meta: {
      ...payload.meta,
      checksum,
    },
    checksum,
  };

  const fallbackDate = payloadWithChecksum.meta?.exportedAt
    ? new Date(payloadWithChecksum.meta.exportedAt)
    : new Date();
  const fileName = filename || getBackupFilename(fallbackDate);
  const jsonStr = JSON.stringify(payloadWithChecksum, null, 2);

  let savedToDocuments = false;
  let shareUri = '';

  try {
    const docRes = await Filesystem.writeFile({
      path: `Hospivo/${fileName}`,
      data: jsonStr,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    savedToDocuments = true;
    shareUri = docRes.uri;
  } catch (err) {
    console.warn('Documents write failed on native platform, falling back to Cache:', err);
  }

  try {
    const cacheRes = await Filesystem.writeFile({
      path: fileName,
      data: jsonStr,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    if (cacheRes.uri) {
      shareUri = cacheRes.uri;
    }
  } catch (err) {
    console.warn('Cache write failed on native platform:', err);
  }

  if (shareUri) {
    try {
      await Share.share({
        title: fileName,
        text: 'Hospivo Backup',
        url: shareUri,
        dialogTitle: fileName,
      });
      await recordVerifiedBackup(payloadWithChecksum, who);
      return { status: 'saved' };
    } catch (shareErr: any) {
      const msg = String(shareErr?.message || '').toLowerCase();
      const isCancelled = shareErr?.name === 'AbortError' || msg.includes('cancel');
      if (savedToDocuments) {
        await recordVerifiedBackup(payloadWithChecksum, who);
        return { status: 'saved' };
      }
      if (isCancelled) {
        return { status: 'cancelled' };
      }
      throw shareErr;
    }
  }

  if (savedToDocuments) {
    await recordVerifiedBackup(payloadWithChecksum, who);
    return { status: 'saved' };
  }

  throw new Error('Could not write backup file on device');
}

/**
 * Step B (Save to disk & conditional commit):
 * 0. On Capacitor native Android/iOS, export via Filesystem + Share.
 * 1. Checks for a saved FileSystemDirectoryHandle in IndexedDB (from Setup or Settings)
 *    and writes directly to that folder if permission is granted.
 * 2. If no saved handle, prompts with showDirectoryPicker if supported.
 * 3. If directory picker is unavailable, prompts with showSaveFilePicker.
 * 4. Otherwise triggers browser download and returns { status: 'needs_confirmation' }.
 */
export async function saveBackup(
  payload: BackupPayload,
  who = 'owner',
  filename?: string
): Promise<SaveBackupResult> {
  if (Capacitor.isNativePlatform()) {
    return saveBackupNative(payload, who, filename);
  }
  // 1. Try saved directory handle first
  try {
    const savedHandle = await getSavedBackupDirectoryHandle();
    if (savedHandle && typeof savedHandle.getFileHandle === 'function') {
      let hasPerm = true;
      if (typeof savedHandle.queryPermission === 'function') {
        const status = await savedHandle.queryPermission({ mode: 'readwrite' });
        if (status !== 'granted') {
          if (typeof savedHandle.requestPermission === 'function') {
            const req = await savedHandle.requestPermission({ mode: 'readwrite' });
            hasPerm = req === 'granted';
          } else {
            hasPerm = false;
          }
        }
      }
      if (hasPerm) {
        await writeBackupToDirectoryHandle(savedHandle, payload, filename);
        await recordVerifiedBackup(payload, who);
        return { status: 'saved' };
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    console.warn('Could not write to saved directory handle, falling back:', err);
  }

  // 2. If no saved directory handle, prompt user to pick backup directory
  if (isDirectoryPickerSupported()) {
    try {
      const picked = await pickBackupDirectory();
      if (!picked) {
        return { status: 'cancelled' };
      }
      await saveBackupDirectoryHandle(picked.handle);
      await writeBackupToDirectoryHandle(picked.handle, payload, filename);
      await recordVerifiedBackup(payload, who);
      return { status: 'saved' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      console.warn('Directory picker failed, trying saveFilePicker:', err);
    }
  }

  // 3. Fallback to showSaveFilePicker
  if (isSaveFilePickerSupported()) {
    try {
      const pickerRes = await saveBackupWithFilePicker(payload, filename);
      if (pickerRes.cancelled) {
        return { status: 'cancelled' };
      }
      if (pickerRes.success) {
        await recordVerifiedBackup(payload, who);
        return { status: 'saved' };
      }
      return { status: 'cancelled' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      throw err;
    }
  } else {
    // 4. Fallback: trigger browser download without committing yet
    downloadBackupFile(payload, filename);
    return { status: 'needs_confirmation' };
  }
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
    await db.settings.put({ key: 'lastBackupAt', value: timestamp });

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
      'backup_created',
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
    } else {
      const alt = await db.settings.get('lastBackupAt');
      if (alt && typeof alt.value === 'string') {
        lastVerifiedBackupAt = alt.value;
      }
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
    await db.settings.put({
      key: 'lastBackupAt',
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

const HOSPIVO_BACKUP_FILE_RE = /^(auto_)?hospivo.*\.json$/i;

/**
 * Best-effort deletion of all locally saved Hospivo backup files on this device
 * (Capacitor Android Documents/Data/Cache folders + Web File System Access API directory handle).
 * Never throws so device revocation wipe can always proceed cleanly.
 */
export async function deleteAllLocalBackupFiles(): Promise<void> {
  const knownFilenames = new Set<string>();
  const knownNativePaths = new Set<string>();
  try {
    const autoRecItem = await db.settings.get('auto_backup_records');
    if (autoRecItem && Array.isArray(autoRecItem.value)) {
      for (const rec of autoRecItem.value as Array<{ filename?: string; nativePath?: string }>) {
        if (rec?.filename) knownFilenames.add(rec.filename);
        if (rec?.nativePath) knownNativePaths.add(rec.nativePath);
      }
    }
    const historyItem = await db.settings.get('backup_history');
    if (historyItem && Array.isArray(historyItem.value)) {
      for (const rec of historyItem.value as Array<{ filename?: string }>) {
        if (rec?.filename) knownFilenames.add(rec.filename);
      }
    }
  } catch {
    // Ignore DB read errors
  }

  if (Capacitor.isNativePlatform()) {
    const dirsToScan = [Directory.Documents, Directory.Data, Directory.Cache].filter(Boolean);

    for (const nativePath of knownNativePaths) {
      for (const dir of dirsToScan) {
        await Filesystem.deleteFile({ path: nativePath, directory: dir }).catch(() => {});
      }
    }

    for (const dir of dirsToScan) {
      try {
        if (typeof Filesystem.readdir === 'function') {
          const subRes = await Filesystem.readdir({ path: 'Hospivo', directory: dir }).catch(() => null);
          const subFiles = Array.isArray(subRes?.files) ? subRes.files : [];
          for (const entry of subFiles) {
            const name = typeof entry === 'string' ? entry : entry?.name;
            if (name) {
              await Filesystem.deleteFile({ path: `Hospivo/${name}`, directory: dir }).catch(() => {});
            }
          }
        }
        if (typeof Filesystem.rmdir === 'function') {
          await Filesystem.rmdir({ path: 'Hospivo', directory: dir, recursive: true }).catch(() => {});
        }
        if (typeof Filesystem.readdir === 'function') {
          const rootRes = await Filesystem.readdir({ path: '', directory: dir }).catch(() => null);
          const rootFiles = Array.isArray(rootRes?.files) ? rootRes.files : [];
          for (const entry of rootFiles) {
            const name = typeof entry === 'string' ? entry : entry?.name;
            if (name && (HOSPIVO_BACKUP_FILE_RE.test(name) || knownFilenames.has(name))) {
              await Filesystem.deleteFile({ path: name, directory: dir }).catch(() => {});
            }
          }
        }
      } catch {
        // Non-fatal: missing directory or OS permission restriction
      }
    }
  }

  try {
    const dirHandle = await getSavedBackupDirectoryHandle();
    if (dirHandle && typeof dirHandle.removeEntry === 'function') {
      const filesToDelete = new Set<string>(knownFilenames);
      if (typeof dirHandle.values === 'function') {
        try {
          for await (const entry of dirHandle.values()) {
            const name = entry?.name;
            if (name && (HOSPIVO_BACKUP_FILE_RE.test(name) || knownFilenames.has(name))) {
              filesToDelete.add(name);
            }
          }
        } catch {
          // Ignore iteration errors / revoked handle permissions
        }
      } else if (typeof dirHandle.entries === 'function') {
        try {
          for await (const [, entry] of dirHandle.entries()) {
            const name = entry?.name;
            if (name && (HOSPIVO_BACKUP_FILE_RE.test(name) || knownFilenames.has(name))) {
              filesToDelete.add(name);
            }
          }
        } catch {
          // Ignore iteration errors
        }
      }

      for (const fileName of filesToDelete) {
        await dirHandle.removeEntry(fileName).catch(() => {});
      }
    }
  } catch {
    // Non-fatal
  } finally {
    _resetBackupDirectoryHandleForTesting();
  }
}
