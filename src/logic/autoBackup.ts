import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { db } from '../db';
import {
  generateAndVerifyBackup,
  getBackupFilename,
  getSavedBackupDirectoryHandle,
  recordVerifiedBackup,
  serializeBackupContent,
  computeSha256,
  writeBackupToDirectoryHandle,
  type BackupPayload,
} from './backup';

export type AutoBackupTriggerMode =
  | 'off'
  | 'after_change'
  | 'interval'
  | 'scheduled'
  | 'on_close_day';

export type AutoBackupIntervalMinutes = 15 | 30 | 60 | 360 | 720;
export type AutoBackupScheduleFrequency = 'daily' | 'weekly';
export type AutoBackupRetentionCount = 5 | 10 | 20 | 30;

export interface AutoBackupConfig {
  triggerMode: AutoBackupTriggerMode;
  intervalMinutes: AutoBackupIntervalMinutes;
  scheduleFrequency: AutoBackupScheduleFrequency;
  scheduleDayOfWeek: number; // 0 = Sun .. 6 = Sat
  scheduleTime: string; // 'HH:MM'
  retentionCount: AutoBackupRetentionCount;
  lastAutoBackupAt: string | null;
  lastAutoBackupStatus: 'never' | 'success' | 'error';
  lastAutoBackupError?: string | null;
}

export interface AutoBackupFileRecord {
  filename: string;
  exportedAt: string;
  checksum: string;
  nativePath?: string;
}

export const AUTO_BACKUP_CONFIG_KEY = 'auto_backup_config';
export const AUTO_BACKUP_RECORDS_KEY = 'auto_backup_records';
export const AUTO_BACKUP_DEBOUNCE_MS = 20_000;

export const DEFAULT_AUTO_BACKUP_CONFIG: AutoBackupConfig = {
  triggerMode: 'off',
  intervalMinutes: 60,
  scheduleFrequency: 'daily',
  scheduleDayOfWeek: 0,
  scheduleTime: '22:00',
  retentionCount: 10,
  lastAutoBackupAt: null,
  lastAutoBackupStatus: 'never',
  lastAutoBackupError: null,
};

export async function getAutoBackupConfig(): Promise<AutoBackupConfig> {
  try {
    const item = await db.settings.get(AUTO_BACKUP_CONFIG_KEY);
    if (item && item.value && typeof item.value === 'object') {
      return {
        ...DEFAULT_AUTO_BACKUP_CONFIG,
        ...(item.value as Partial<AutoBackupConfig>),
      };
    }
  } catch {
    // Fallback
  }
  return { ...DEFAULT_AUTO_BACKUP_CONFIG };
}

export async function saveAutoBackupConfig(
  updates: Partial<AutoBackupConfig>
): Promise<AutoBackupConfig> {
  const current = await getAutoBackupConfig();
  const next: AutoBackupConfig = { ...current, ...updates };
  await db.settings.put({ key: AUTO_BACKUP_CONFIG_KEY, value: next });
  return next;
}

export async function getAutoBackupRecords(): Promise<AutoBackupFileRecord[]> {
  try {
    const item = await db.settings.get(AUTO_BACKUP_RECORDS_KEY);
    if (item && Array.isArray(item.value)) {
      return item.value as AutoBackupFileRecord[];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Keeps only the newest `retentionCount` auto-backup records and prunes older
 * native Android backup files when running on Capacitor.
 */
export async function applyAutoBackupRetention(
  records: AutoBackupFileRecord[],
  retentionCount: number
): Promise<AutoBackupFileRecord[]> {
  const limit = Math.max(1, retentionCount);
  if (records.length <= limit) {
    await db.settings.put({ key: AUTO_BACKUP_RECORDS_KEY, value: records });
    return records;
  }

  const kept = records.slice(0, limit);
  const pruned = records.slice(limit);

  if (Capacitor.isNativePlatform()) {
    for (const oldRec of pruned) {
      if (oldRec.nativePath) {
        await Filesystem.deleteFile({
          path: oldRec.nativePath,
          directory: Directory.Documents,
        }).catch(() => {});
      }
    }
  }

  await db.settings.put({ key: AUTO_BACKUP_RECORDS_KEY, value: kept });
  return kept;
}

/**
 * Pure check for whether a time-interval or daily/weekly scheduled auto-backup is due.
 */
export function isScheduledAutoBackupDue(
  config: AutoBackupConfig,
  now: Date = new Date()
): boolean {
  if (config.triggerMode === 'interval') {
    if (!config.lastAutoBackupAt) return true;
    const lastMs = Date.parse(config.lastAutoBackupAt);
    if (!Number.isFinite(lastMs)) return true;
    return now.getTime() - lastMs >= config.intervalMinutes * 60 * 1000;
  }

  if (config.triggerMode === 'scheduled') {
    const [targetH, targetM] = (config.scheduleTime || '22:00').split(':').map(Number);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = (targetH || 0) * 60 + (targetM || 0);
    if (nowMinutes < targetMinutes) return false;

    if (config.scheduleFrequency === 'weekly' && now.getDay() !== config.scheduleDayOfWeek) {
      return false;
    }

    if (config.lastAutoBackupAt) {
      const last = new Date(config.lastAutoBackupAt);
      const sameDay =
        last.getFullYear() === now.getFullYear() &&
        last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate();
      if (sameDay) return false;
    }

    return true;
  }

  return false;
}

let autoBackupInFlight: Promise<{ success: boolean; filename?: string; error?: string }> | null =
  null;

/**
 * Silently generates, verifies (SHA-256), saves, and prunes an automatic backup.
 * Never shows popup toasts or blocks counter billing.
 */
export async function executeAutoBackup(
  reason: string
): Promise<{ success: boolean; filename?: string; error?: string }> {
  if (autoBackupInFlight) return autoBackupInFlight;

  autoBackupInFlight = (async () => {
    try {
      const [config, shop] = await Promise.all([
        getAutoBackupConfig(),
        db.shop.toCollection().first(),
      ]);
      if (!shop) {
        return { success: false, error: 'no_shop' };
      }

      const payload = await generateAndVerifyBackup(shop.name || 'Hospivo');
      const contentStr = serializeBackupContent(payload.meta, payload.tables);
      const checksum =
        payload.checksum || payload.meta?.checksum || (await computeSha256(contentStr));
      const verifiedPayload: BackupPayload = {
        ...payload,
        meta: { ...payload.meta, checksum },
        checksum,
      };

      const exportedDate = verifiedPayload.meta?.exportedAt
        ? new Date(verifiedPayload.meta.exportedAt)
        : new Date();
      const baseName = getBackupFilename(exportedDate);
      const autoFilename = `auto_${baseName}`;
      let nativePath: string | undefined;

      if (Capacitor.isNativePlatform()) {
        nativePath = `Hospivo/${autoFilename}`;
        await Filesystem.writeFile({
          path: nativePath,
          data: JSON.stringify(verifiedPayload, null, 2),
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
      } else {
        const dirHandle = await getSavedBackupDirectoryHandle();
        if (dirHandle && typeof dirHandle.getFileHandle === 'function') {
          let granted = true;
          if (typeof dirHandle.queryPermission === 'function') {
            const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
            granted = perm === 'granted';
          }
          if (granted) {
            await writeBackupToDirectoryHandle(dirHandle, verifiedPayload, autoFilename);
          }
        }
      }

      await recordVerifiedBackup(verifiedPayload, `auto_backup:${reason}`);

      const existingRecords = await getAutoBackupRecords();
      const newRecord: AutoBackupFileRecord = {
        filename: autoFilename,
        exportedAt: verifiedPayload.meta.exportedAt,
        checksum,
        ...(nativePath ? { nativePath } : {}),
      };
      await applyAutoBackupRetention([newRecord, ...existingRecords], config.retentionCount);

      await saveAutoBackupConfig({
        lastAutoBackupAt: verifiedPayload.meta.exportedAt,
        lastAutoBackupStatus: 'success',
        lastAutoBackupError: null,
      });

      return { success: true, filename: autoFilename };
    } catch (err: any) {
      await saveAutoBackupConfig({
        lastAutoBackupStatus: 'error',
        lastAutoBackupError: err?.message || 'Auto-backup failed',
      }).catch(() => {});
      return { success: false, error: err?.message || 'Auto-backup failed' };
    } finally {
      autoBackupInFlight = null;
    }
  })();

  return autoBackupInFlight;
}

let afterChangeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced trigger (20s) for `triggerMode === 'after_change'` so counter billing stays fast.
 */
export function scheduleAutoBackupAfterChange(): void {
  if (afterChangeTimer) {
    clearTimeout(afterChangeTimer);
  }
  afterChangeTimer = setTimeout(() => {
    afterChangeTimer = null;
    void getAutoBackupConfig().then((cfg) => {
      if (cfg.triggerMode === 'after_change') {
        void executeAutoBackup('after_change');
      }
    });
  }, AUTO_BACKUP_DEBOUNCE_MS);
}

export async function triggerAutoBackupOnCloseDay(): Promise<void> {
  const cfg = await getAutoBackupConfig();
  if (cfg.triggerMode === 'on_close_day') {
    await executeAutoBackup('on_close_day');
  }
}

export function initAutoBackupScheduler(): () => void {
  const check = () => {
    void getAutoBackupConfig().then((cfg) => {
      if (isScheduledAutoBackupDue(cfg, new Date())) {
        void executeAutoBackup(cfg.triggerMode);
      }
    });
  };

  const initialTimer = setTimeout(check, 5000);
  const interval = setInterval(check, 60_000);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
    if (afterChangeTimer) {
      clearTimeout(afterChangeTimer);
      afterChangeTimer = null;
    }
  };
}
