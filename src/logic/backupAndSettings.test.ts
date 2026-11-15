import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, resetDatabase, type DBUser } from '../db';
import {
  createBackup,
  verifyBackup,
  recordVerifiedBackup,
  getBackupStatus,
  getBackupHistory,
  restoreBackup,
  generateAndVerifyBackup,
  saveBackup,
  type BackupPayload,
} from './backup';
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
});
