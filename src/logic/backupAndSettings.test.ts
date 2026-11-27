import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockWriteFile = vi.hoisted(() => vi.fn(async () => ({ uri: 'file:///cache/backup.json' })));
const mockShare = vi.hoisted(() => vi.fn(async () => ({ activityType: 'test' })));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: mockWriteFile },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: mockShare },
}));

import { db, resetDatabase, type DBUser } from '../db';
import {
  DEFAULT_AUTO_BACKUP_CONFIG,
  applyAutoBackupRetention,
  executeAutoBackup,
  getAutoBackupRecords,
  isScheduledAutoBackupDue,
  saveAutoBackupConfig,
} from './autoBackup';
import {
  DEFAULT_NOTIFICATIONS_CONFIG,
  getNotificationsConfig,
  isQuietHoursActive,
  saveNotificationsConfig,
} from './notifications';
import {
  createBackup,
  createBackupJson,
  computeSha256,
  computeSha256Sync,
  verifyBackup,
  verifyBackupPayload,
  recordVerifiedBackup,
  getBackupStatus,
  getBackupHistory,
  restoreBackup,
  generateAndVerifyBackup,
  saveBackup,
  saveBackupDirectoryHandle,
  getSavedBackupDirectoryHandle,
  _resetBackupDirectoryHandleForTesting,
  isDirectoryPickerSupported,
  pickBackupDirectory,
  writeBackupToDirectoryHandle,
  type BackupPayload,
} from './backup';
import { shouldRunAutoLock } from '../App';
import {
  setApprovalPin,
  validateStaffPin,
  _resetApprovalStoreForTesting,
  DEFAULT_APPROVAL_RULES,
  type ApprovalActionCategory,
  type ApprovalRuleType,
} from './approvals';
import { hashPin } from './pin';
import { getDiscountLimit, DEFAULT_DISCOUNT_LIMIT_PERCENT } from './billing';

describe('Backup, Staff PIN & Settings Logic', () => {
  beforeEach(async () => {
    await resetDatabase();
    _resetApprovalStoreForTesting();
    _resetBackupDirectoryHandleForTesting();
  });

  describe('Backup Export, SHA-256 Verification & Restore', () => {
    it('creates a backup with valid metadata, tables, and a 64-char SHA-256 checksum', async () => {
      // Seed a user and shop record
      const { hash, salt } = await hashPin('1234');
      await db.users.add({
        id: 'owner',
        name: 'Owner Tester',
        role: 'owner',
        pinHash: hash,
        pinSalt: salt,
        active: true,
      });

      await db.shop.add({
        name: 'Shree Test Pharmacy',
        ownerName: 'Owner Tester',
        address: '123 Market Road',
        phone: '9876543210',
        gstNo: '27AAAAA0000A1Z5',
        drugLicenceNos: 'DL-1234',
        mode: 'local',
      });

      const backup = await createBackup('Shree Test Pharmacy');

      expect(backup.meta.app).toBe('Hospivo');
      expect(backup.meta.version).toBe(1);
      expect(backup.meta.shopName).toBe('Shree Test Pharmacy');
      expect(backup.tables.users.length).toBeGreaterThan(0);
      expect(backup.tables.shop.length).toBe(1);
      expect(backup.checksum).toMatch(/^[a-f0-9]{64}$/);

      // Untampered payload must verify successfully
      const verification = await verifyBackup(backup);
      expect(verification.valid).toBe(true);
      expect(verification.payload).toBeDefined();
    });

    it('rejects tampered or corrupted backup payloads', async () => {
      const backup = await createBackup('Test Med');

      // Tamper 1: change checksum
      const tamperedChecksum: BackupPayload = {
        ...backup,
        checksum: '0000000000000000000000000000000000000000000000000000000000000000',
      };
      const res1 = await verifyBackup(tamperedChecksum);
      expect(res1.valid).toBe(false);
      expect(res1.error).toBe('checksum_mismatch');

      // Tamper 2: modify table data without updating checksum
      const tamperedData: BackupPayload = {
        ...backup,
        tables: {
          ...backup.tables,
          medicines: [{ id: 999, name: 'Injected Drug' }],
        },
      };
      const res2 = await verifyBackup(tamperedData);
      expect(res2.valid).toBe(false);
      expect(res2.error).toBe('checksum_mismatch');

      // Tamper 3: wrong app signature
      const wrongApp = {
        ...backup,
        meta: { ...backup.meta, app: 'OtherPOS' },
      };
      const res3 = await verifyBackup(wrongApp);
      expect(res3.valid).toBe(false);
      expect(res3.error).toBe('invalid_app_signature');
    });

    it('records verified backup and computes truthful backup status', async () => {
      // Initially, no backup exists
      const initialStatus = await getBackupStatus();
      expect(initialStatus.lastVerifiedBackupAt).toBeNull();
      expect(initialStatus.isToday).toBe(false);
      expect(initialStatus.isOlderThan3Days).toBe(true);

      // Create & record verified backup
      const backup = await createBackup('Test Store');
      await recordVerifiedBackup(backup, 'owner_test');

      const updatedStatus = await getBackupStatus();
      expect(updatedStatus.lastVerifiedBackupAt).toBe(backup.meta.exportedAt);
      expect(updatedStatus.isToday).toBe(true);
      expect(updatedStatus.isOlderThan3Days).toBe(false);
      expect(updatedStatus.daysAgo).toBe(0);

      // History should record the entry
      const history = await getBackupHistory();
      expect(history.length).toBe(1);
      expect(history[0].checksum).toBe(backup.checksum);
      expect(history[0].verified).toBe(true);

      // Audit log should record 'backup_created'
      const audit = await db.auditLog.where('action').equals('backup_created').toArray();
      expect(audit.length).toBe(1);
      expect(audit[0].who).toBe('owner_test');
    });

    it('cancelling the file save (AbortError) does NOT update backup status to "Today" or write a backup_created audit entry', async () => {
      // Mock window.showSaveFilePicker to simulate user clicking Cancel in file picker
      const abortErr = new Error('The user aborted a request.');
      abortErr.name = 'AbortError';
      (globalThis as any).window = {
        showSaveFilePicker: vi.fn().mockRejectedValue(abortErr),
      };

      try {
        // Verify initial status: no backup taken
        const initialStatus = await getBackupStatus();
        expect(initialStatus.isToday).toBe(false);
        expect(initialStatus.lastVerifiedBackupAt).toBeNull();

        // Step A: Generate & verify in memory WITHOUT writing to Dexie
        const payload = await generateAndVerifyBackup('Cancel Test Shop');
        expect(payload).toBeDefined();

        const statusAfterGen = await getBackupStatus();
        expect(statusAfterGen.isToday).toBe(false);
        expect(statusAfterGen.lastVerifiedBackupAt).toBeNull();
        let auditCount = await db.auditLog.where('action').equals('backup_created').count();
        expect(auditCount).toBe(0);

        // Step B: Save to disk -> user cancels
        const result = await saveBackup(payload, 'owner');
        expect(result.status).toBe('cancelled');

        // Verify backup status was NOT updated to Today
        const statusAfterCancel = await getBackupStatus();
        expect(statusAfterCancel.isToday).toBe(false);
        expect(statusAfterCancel.lastVerifiedBackupAt).toBeNull();

        // Verify no 'backup_created' audit entry was written
        auditCount = await db.auditLog.where('action').equals('backup_created').count();
        expect(auditCount).toBe(0);
      } finally {
        delete (globalThis as any).window;
      }
    });

    it('completing the file save DOES update backup status to "Today" and writes the backup_created audit entry', async () => {
      // Mock window.showSaveFilePicker with valid writable stream
      const writeMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const createWritableMock = vi.fn().mockResolvedValue({
        write: writeMock,
        close: closeMock,
      });
      (globalThis as any).window = {
        showSaveFilePicker: vi.fn().mockResolvedValue({
          createWritable: createWritableMock,
        }),
      };

      try {
        // Step A: Generate & verify in memory
        const payload = await generateAndVerifyBackup('Complete Test Shop');

        // Step B: Save to disk and commit
        const result = await saveBackup(payload, 'owner_tester');
        expect(result.status).toBe('saved');
        expect(createWritableMock).toHaveBeenCalled();
        expect(writeMock).toHaveBeenCalled();
        expect(closeMock).toHaveBeenCalled();

        // Verify backup status DOES update to Today
        const status = await getBackupStatus();
        expect(status.isToday).toBe(true);
        expect(status.lastVerifiedBackupAt).toBe(payload.meta.exportedAt);

        // Verify 'backup_created' audit entry is written
        const auditEntries = await db.auditLog.where('action').equals('backup_created').toArray();
        expect(auditEntries.length).toBe(1);
        expect(auditEntries[0].action).toBe('backup_created');
        expect(auditEntries[0].who).toBe('owner_tester');
      } finally {
        delete (globalThis as any).window;
      }
    });

    it('handles fallback download mode when showSaveFilePicker is not supported without updating status until confirmed', async () => {
      // Ensure window has no showSaveFilePicker
      delete (globalThis as any).window;

      const payload = await generateAndVerifyBackup('Fallback Shop');
      const result = await saveBackup(payload, 'owner');

      // Should return needs_confirmation without writing database
      expect(result.status).toBe('needs_confirmation');

      let status = await getBackupStatus();
      expect(status.isToday).toBe(false);
      let auditCount = await db.auditLog.where('action').equals('backup_created').count();
      expect(auditCount).toBe(0);

      // Confirmation commits the record
      await recordVerifiedBackup(payload, 'owner');

      status = await getBackupStatus();
      expect(status.isToday).toBe(true);
      auditCount = await db.auditLog.where('action').equals('backup_created').count();
      expect(auditCount).toBe(1);
    });

    it('saveBackup writes directly to saved directory handle if present and commits backup', async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const getFileHandleMock = vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue({
          write: writeMock,
          close: closeMock,
        }),
      });
      const mockDirHandle = {
        name: 'Saved Pharmacy Backups',
        getFileHandle: getFileHandleMock,
        queryPermission: vi.fn().mockResolvedValue('granted'),
      };

      await saveBackupDirectoryHandle(mockDirHandle);
      const retrieved = await getSavedBackupDirectoryHandle();
      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('Saved Pharmacy Backups');

      const payload = await generateAndVerifyBackup('Direct Dir Shop');
      const result = await saveBackup(payload, 'owner_dir_tester');
      expect(result.status).toBe('saved');
      expect(getFileHandleMock).toHaveBeenCalled();
      expect(writeMock).toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalled();

      const status = await getBackupStatus();
      expect(status.isToday).toBe(true);
      expect(status.lastVerifiedBackupAt).toBe(payload.meta.exportedAt);

      const audits = await db.auditLog.where('action').equals('backup_created').toArray();
      const lastAudit = audits[audits.length - 1];
      expect(lastAudit.who).toBe('owner_dir_tester');
    });

    it('restores database cleanly from a verified backup payload', async () => {
      // 1. Seed initial data
      const { hash: oHash, salt: oSalt } = await hashPin('1234');
      await db.users.add({
        id: 'owner',
        name: 'Original Owner',
        role: 'owner',
        pinHash: oHash,
        pinSalt: oSalt,
        active: true,
      });

      // 2. Take backup
      const backup = await createBackup('Restore Test Shop');

      // 3. Mutate database (e.g. add extra user)
      const { hash: sHash, salt: sSalt } = await hashPin('5678');
      await db.users.add({
        id: 'staff_temp',
        name: 'Temporary Staff',
        role: 'cashier',
        pinHash: sHash,
        pinSalt: sSalt,
        active: true,
      });
      expect(await db.users.count()).toBe(2);

      // 4. Restore from backup
      const restoreRes = await restoreBackup(backup, 'tester');
      expect(restoreRes.success).toBe(true);

      // Temporary staff should be gone, restoring exact state
      const users = await db.users.toArray();
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Original Owner');
    });
  });

  describe('Staff PIN Collision Checks', () => {
    it('enforces PIN collision rules against Owner PIN, Approval PIN, and existing staff PINs', async () => {
      // 1. Set Owner PIN to '1234'
      const { hash: oHash, salt: oSalt } = await hashPin('1234');
      const ownerUser: DBUser = {
        id: 'owner',
        name: 'Owner User',
        role: 'owner',
        pinHash: oHash,
        pinSalt: oSalt,
        active: true,
      };
      await db.users.add(ownerUser);

      // 2. Set Approval PIN to '9876'
      await setApprovalPin('9876');

      // 3. Add existing active Staff with PIN '5555'
      const { hash: sHash, salt: sSalt } = await hashPin('5555');
      const staffUser: DBUser = {
        id: 'staff_1',
        name: 'Raju Sharma',
        role: 'cashier',
        pinHash: sHash,
        pinSalt: sSalt,
        active: true,
      };
      await db.users.add(staffUser);

      // Test A: Wrong length (e.g. 2 digits instead of 4)
      const resLen = await validateStaffPin('12');
      expect(resLen.ok).toBe(false);
      expect(resLen.error).toBe('staff_pin_length');

      // Test B: Collides with Owner PIN ('1234')
      const resOwner = await validateStaffPin('1234');
      expect(resOwner.ok).toBe(false);
      expect(resOwner.error).toBe('staff_pin_same_as_owner');

      // Test C: Collides with Approval PIN ('9876')
      const resApproval = await validateStaffPin('9876');
      expect(resApproval.ok).toBe(false);
      expect(resApproval.error).toBe('staff_pin_same_as_approval');

      // Test D: Collides with existing Staff PIN ('5555')
      const resDup = await validateStaffPin('5555');
      expect(resDup.ok).toBe(false);
      expect(resDup.error).toBe('staff_pin_duplicate');

      // Test E: Completely unique valid PIN ('4321')
      const resOk = await validateStaffPin('4321');
      expect(resOk.ok).toBe(true);
      expect(resOk.error).toBeUndefined();

      // Test F: Editing staff_1 allows keeping their own PIN when targetUserId is staff_1
      const resSelf = await validateStaffPin('5555', undefined, undefined, 4, 'staff_1');
      expect(resSelf.ok).toBe(true);
    });
  });

  describe('Owner Settings & Approval Rules', () => {
    it('reads and updates discount limit percentage', async () => {
      // Default is 5%
      const defaultLimit = await getDiscountLimit();
      expect(defaultLimit).toBe(DEFAULT_DISCOUNT_LIMIT_PERCENT);

      // Update to 15%
      await db.settings.put({ key: 'discount_limit', value: 15 });
      const updatedLimit = await getDiscountLimit();
      expect(updatedLimit).toBe(15);
    });

    it('saves and reads approval rules configuration matrix', async () => {
      // Default: stock_correction is 'blocked_offline', others 'local_pin'
      expect(DEFAULT_APPROVAL_RULES.stock_correction).toBe('blocked_offline');
      expect(DEFAULT_APPROVAL_RULES.delete_or_correct_bill).toBe('local_pin');

      // Change delete_or_correct_bill to 'blocked_offline'
      const customRules: Record<ApprovalActionCategory, ApprovalRuleType> = {
        ...DEFAULT_APPROVAL_RULES,
        delete_or_correct_bill: 'blocked_offline',
      };

      await db.settings.put({ key: 'approval_rules', value: customRules });

      const stored = await db.settings.get('approval_rules');
      expect(stored).toBeDefined();
      expect((stored?.value as Record<string, string>).delete_or_correct_bill).toBe('blocked_offline');
    });
  });

  describe('Auto-Lock Screen Gating & Real Backup Folder Integration', () => {
    it('disables auto-lock on Who is using? PIN screen and Setup Wizard, enabling it ONLY on home when user is logged in', () => {
      const mockUser = { name: 'Ramesh', role: 'owner' as const };

      // Never run on setup screen
      expect(shouldRunAutoLock('setup', null)).toBe(false);
      expect(shouldRunAutoLock('setup', mockUser)).toBe(false);

      // Never run on login / "Who is using?" screen (even when staff card is tapped)
      expect(shouldRunAutoLock('login', null)).toBe(false);
      expect(shouldRunAutoLock('login', mockUser)).toBe(false);

      // On home screen, only run when user is logged in
      expect(shouldRunAutoLock('home', null)).toBe(false);
      expect(shouldRunAutoLock('home', mockUser)).toBe(true);
    });

    it('handles native directory picker detection and direct handle writing', async () => {
      // In node/vitest environment, showDirectoryPicker is undefined unless polyfilled
      expect(typeof isDirectoryPickerSupported()).toBe('boolean');

      // Writing to an invalid/null handle rejects cleanly
      const backup = await generateAndVerifyBackup('Test Shop');
      await expect(writeBackupToDirectoryHandle(null, backup)).rejects.toThrow('Invalid directory handle');

      // Mock Directory Handle test
      let writtenContent = '';
      let closed = false;
      const mockWritable = {
        write: vi.fn(async (content: string) => {
          writtenContent = content;
        }),
        close: vi.fn(async () => {
          closed = true;
        }),
      };
      const mockDirHandle = {
        name: 'My Backups Folder',
        getFileHandle: vi.fn(async (filename: string, opts: any) => ({
          createWritable: vi.fn(async () => mockWritable),
        })),
      };

      const result = await writeBackupToDirectoryHandle(mockDirHandle, backup, 'custom-backup.json');
      expect(result.success).toBe(true);
      expect(result.filename).toBe('custom-backup.json');
      expect(mockDirHandle.getFileHandle).toHaveBeenCalledWith('custom-backup.json', { create: true });
      expect(mockWritable.write).toHaveBeenCalled();
      expect(mockWritable.close).toHaveBeenCalled();
      expect(closed).toBe(true);
      expect(writtenContent).toContain('"app": "Hospivo"');

      // Written JSON must include checksum inside metadata manifest and pass verifyBackupPayload
      const parsedWritten = JSON.parse(writtenContent);
      expect(parsedWritten.meta.checksum).toMatch(/^[a-f0-9]{64}$/);
      const verifyWritten = verifyBackupPayload(writtenContent);
      expect(verifyWritten.isValid).toBe(true);
      expect(verifyWritten.metadata?.shopName).toBe('Test Shop');
      expect(verifyWritten.metadata?.checksum).toBe(parsedWritten.meta.checksum);
    });
  });

  describe('Cryptographic Checksum & verifyBackupPayload (JSON String Verification)', () => {
    it('embeds SHA-256 checksum in metadata manifest via createBackupJson and passes verifyBackupPayload', async () => {
      await db.shop.add({
        name: 'Arogya Medical Store',
        ownerName: 'Vikram',
        address: 'MG Road',
        phone: '9988776655',
        gstNo: '27AAAAA1111A1Z5',
        drugLicenceNos: 'DL-9988',
        mode: 'local',
      });

      const jsonStr = await createBackupJson('Arogya Medical Store');
      const parsed = JSON.parse(jsonStr);

      expect(parsed.meta).toBeDefined();
      expect(parsed.meta.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(parsed.checksum).toBe(parsed.meta.checksum);

      // Web Crypto digest and synchronous digest must match identically
      const webCryptoDigest = await computeSha256('hospivo-integrity-check');
      const syncDigest = computeSha256Sync('hospivo-integrity-check');
      expect(syncDigest).toBe(webCryptoDigest);

      const verification = verifyBackupPayload(jsonStr);
      expect(verification.isValid).toBe(true);
      expect(verification.error).toBeUndefined();
      expect(verification.metadata).toBeDefined();
      expect(verification.metadata?.shopName).toBe('Arogya Medical Store');
      expect(verification.metadata?.checksum).toBe(parsed.meta.checksum);
    });

    it('fails verifyBackupPayload gracefully with descriptive errors when JSON is corrupted or tampered', async () => {
      const validJson = await createBackupJson('Integrity Test Shop');

      // 1. Empty or malformed JSON string
      const emptyRes = verifyBackupPayload('');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toMatch(/non-empty/i);

      const corruptedRes = verifyBackupPayload('{ "meta": { "app": "Hospivo"');
      expect(corruptedRes.isValid).toBe(false);
      expect(corruptedRes.error).toMatch(/corrupted|parse/i);

      // 2. Tampered table contents inside JSON string
      const tamperedTableObj = JSON.parse(validJson);
      tamperedTableObj.tables.medicines = [{ id: 1, name: 'Tampered Medicine', mrpPaise: 100 }];
      const tamperedTableRes = verifyBackupPayload(JSON.stringify(tamperedTableObj));
      expect(tamperedTableRes.isValid).toBe(false);
      expect(tamperedTableRes.error).toMatch(/checksum mismatch|corrupted|tampered/i);

      // 3. Tampered metadata field (shopName changed without updating hash)
      const tamperedMetaObj = JSON.parse(validJson);
      tamperedMetaObj.meta.shopName = 'Hacked Shop Name';
      const tamperedMetaRes = verifyBackupPayload(JSON.stringify(tamperedMetaObj));
      expect(tamperedMetaRes.isValid).toBe(false);
      expect(tamperedMetaRes.error).toMatch(/checksum mismatch|corrupted|tampered/i);

      // 4. Tampered manifest checksum directly
      const tamperedHashObj = JSON.parse(validJson);
      const fakeHash = 'a'.repeat(64);
      tamperedHashObj.meta.checksum = fakeHash;
      tamperedHashObj.checksum = fakeHash;
      const tamperedHashRes = verifyBackupPayload(JSON.stringify(tamperedHashObj));
      expect(tamperedHashRes.isValid).toBe(false);
      expect(tamperedHashRes.error).toMatch(/checksum mismatch/i);

      // 5. Missing checksum in manifest
      const missingChecksumObj = JSON.parse(validJson);
      delete missingChecksumObj.meta.checksum;
      delete missingChecksumObj.checksum;
      const missingChecksumRes = verifyBackupPayload(JSON.stringify(missingChecksumObj));
      expect(missingChecksumRes.isValid).toBe(false);
      expect(missingChecksumRes.error).toMatch(/missing or invalid sha-256 checksum/i);
    });

    it('saves and shares backup natively on Capacitor Android without failing as cancelled', async () => {
      const { Capacitor } = await import('@capacitor/core');
      mockWriteFile.mockClear();
      mockShare.mockClear();

      const nativeSpy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

      try {
        const payload = await createBackup('Native Test Pharmacy');
        const result = await saveBackup(payload);
        expect(result.status).toBe('saved');
        expect(mockWriteFile).toHaveBeenCalled();
        expect(mockShare).toHaveBeenCalled();
        const status = await getBackupStatus();
        expect(status.lastVerifiedBackupAt).toBeTruthy();
      } finally {
        nativeSpy.mockRestore();
      }
    });
  });

  describe('Auto-Backup Scheduling & Retention & Notification Settings', () => {
    it('evaluates daily and weekly scheduled auto-backup due times accurately', () => {
      const dailyCfg = {
        ...DEFAULT_AUTO_BACKUP_CONFIG,
        triggerMode: 'scheduled' as const,
        scheduleFrequency: 'daily' as const,
        scheduleTime: '21:30',
        lastAutoBackupAt: null,
      };
      // Before 21:30 -> not due
      expect(isScheduledAutoBackupDue(dailyCfg, new Date(2026, 4, 10, 21, 15, 0))).toBe(false);
      // At/after 21:30 with no prior backup -> due
      expect(isScheduledAutoBackupDue(dailyCfg, new Date(2026, 4, 10, 21, 35, 0))).toBe(true);
      // Already backed up after today's 21:30 -> not due again today
      const alreadyToday = {
        ...dailyCfg,
        lastAutoBackupAt: new Date(2026, 4, 10, 21, 31, 0).toISOString(),
      };
      expect(isScheduledAutoBackupDue(alreadyToday, new Date(2026, 4, 10, 23, 0, 0))).toBe(false);

      // Weekly on Sunday (day 0)
      const weeklyCfg = {
        ...dailyCfg,
        scheduleFrequency: 'weekly' as const,
        scheduleDayOfWeek: 0,
      };
      // Monday (2026-05-11 is Monday) -> not due
      expect(isScheduledAutoBackupDue(weeklyCfg, new Date(2026, 4, 11, 22, 0, 0))).toBe(false);
      // Sunday (2026-05-10 is Sunday) after 21:30 -> due
      expect(isScheduledAutoBackupDue(weeklyCfg, new Date(2026, 4, 10, 22, 0, 0))).toBe(true);
    });

    it('enforces rolling backup retention and prunes older auto-backups', async () => {
      await db.shop.add({
        name: 'Auto Backup Store',
        ownerName: 'Owner',
        address: 'Main',
        phone: '9999999999',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'local',
        shopSyncId: 'HOSP-AUTO-1111',
      });
      await saveAutoBackupConfig({
        ...DEFAULT_AUTO_BACKUP_CONFIG,
        triggerMode: 'interval',
        retentionCount: 5,
      });

      // Newest-first order, matching executeAutoBackup's prepending
      const records = Array.from({ length: 7 }, (_, i) => ({
        id: `ab-${6 - i}`,
        fileName: `hospivo_auto_2026-05-0${7 - i}.json`,
        createdAt: new Date(2026, 4, 7 - i, 10, 0, 0).toISOString(),
        trigger: 'interval' as const,
        checksum: `chk-${6 - i}`,
      }));
      const pruned = await applyAutoBackupRetention(records, 5);
      expect(pruned).toHaveLength(5);
      expect(pruned[0].id).toBe('ab-6');

      const res = await executeAutoBackup('manual');
      expect(res.success).toBe(true);
      const savedRecords = await getAutoBackupRecords();
      expect(savedRecords.length).toBeGreaterThanOrEqual(1);
    });

    it('saves notification settings and evaluates overnight quiet hours', async () => {
      await saveNotificationsConfig({
        ...DEFAULT_NOTIFICATIONS_CONFIG,
        enabled: true,
        expiryWindowDays: 60,
        quietHours: { enabled: true, start: '22:30', end: '08:00' },
      });
      const loaded = await getNotificationsConfig();
      expect(loaded.enabled).toBe(true);
      expect(loaded.expiryWindowDays).toBe(60);

      // 23:15 is inside 22:30 -> 08:00
      expect(isQuietHoursActive(loaded, new Date(2026, 4, 10, 23, 15, 0))).toBe(true);
      // 06:30 is inside 22:30 -> 08:00
      expect(isQuietHoursActive(loaded, new Date(2026, 4, 10, 6, 30, 0))).toBe(true);
      // 14:00 is outside quiet hours
      expect(isQuietHoursActive(loaded, new Date(2026, 4, 10, 14, 0, 0))).toBe(false);
    });
  });
});
