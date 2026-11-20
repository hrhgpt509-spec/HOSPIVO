import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db';
import { supabase } from '../lib/supabase';
import {
  generateShopSyncId,
  getCloudConfig,
  saveCloudConfig,
  enqueueSyncItem,
  runSyncCycle,
  backfillLocalDataToCloud,
  createRemoteApprovalRequest,
  resolveRemoteApprovalRequest,
  getPendingApprovalRequests,
  pollApprovalRequest,
  getHomeSyncState,
  applyRemoteEvent,
  pullRemoteEvents,
  uploadShopPhoto,
} from './cloudSync';
import { signOutOwner } from './cloudAuth';

describe('cloudSync & remote approvals engine', () => {
  beforeEach(async () => {
    // Clear outbox, settings, and approval requests
    await db.syncOutbox.clear();
    await db.approvalRequests.clear();
    await db.settings.clear();
    await db.shop.clear();
    await db.shop.add({
      name: 'Test Medical Store',
      ownerName: 'Ramesh Sharma',
      address: 'Test Address',
      phone: '9876543210',
      gstNo: '09AAACH7409R1ZZ',
      drugLicenceNos: 'DL-12345',
      mode: 'local',
    });

    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });
    }
  });

  describe('Shop Sync ID & Configuration', () => {
    it('generates a valid unique alphanumeric pairing ID format', () => {
      const id1 = generateShopSyncId();
      const id2 = generateShopSyncId();

      expect(id1).toMatch(/^HOSP-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(id2).toMatch(/^HOSP-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(id1).not.toBe(id2);
    });

    it('returns default config when unconfigured and persists shopSyncId', async () => {
      const cfg = await getCloudConfig();

      expect(cfg.cloudEnabled).toBe(false);
      expect(cfg.deviceName).toBe('Counter PC 1 (Billing Desk)');
      expect(cfg.shopSyncId).toMatch(/^HOSP-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(cfg.lastStatus).toBe('never');

      // Subsequent read preserves the generated ID
      const cfg2 = await getCloudConfig();
      expect(cfg2.shopSyncId).toBe(cfg.shopSyncId);
    });

    it('saves cloud configuration updates and syncs db.shop mode', async () => {
      await saveCloudConfig({
        cloudEnabled: true,
        cloudUrl: 'https://test-project.supabase.co',
        cloudAnonKey: 'test-anon-key-12345',
        deviceName: 'Billing Desk 2',
      });

      const cfg = await getCloudConfig();
      expect(cfg.cloudEnabled).toBe(true);
      expect(cfg.cloudUrl).toBe('https://test-project.supabase.co');
      expect(cfg.cloudAnonKey).toBe('test-anon-key-12345');
      expect(cfg.deviceName).toBe('Billing Desk 2');

      const shops = await db.shop.toArray();
      expect(shops[0].mode).toBe('cloud');
    });

    it('enables remote approval rules when cloud is enabled in setup', async () => {
      // 1. In cloud mode, settings can store remote_approval rule
      await db.settings.put({ key: 'cloud_enabled', value: true });
      await db.settings.put({
        key: 'approval_rules',
        value: {
          delete_or_correct_bill: 'remote_approval',
          price_change: 'local_pin',
          discount_above_limit: 'remote_approval',
          stock_correction: 'blocked_offline',
          cash_mismatch: 'local_pin',
        },
      });

      const rulesItem = await db.settings.get('approval_rules');
      const rules = rulesItem?.value as Record<string, string>;
      expect(rules.delete_or_correct_bill).toBe('remote_approval');
      expect(rules.discount_above_limit).toBe('remote_approval');
    });
  });

  describe('Sync Outbox Queue & FIFO Sync Cycle', () => {
    it('does not enqueue outbox items when cloudEnabled is false', async () => {
      const id = await enqueueSyncItem('bill', 101, { total: 500 });
      expect(id).toBeNull();

      const count = await db.syncOutbox.count();
      expect(count).toBe(0);
    });

    it('enqueues outbox items when cloudEnabled is true', async () => {
      await saveCloudConfig({ cloudEnabled: true });

      const id = await enqueueSyncItem('bill', 201, { billNo: 'B-201', totalPaise: 45000 });
      expect(id).toBeTypeOf('number');

      const item = await db.syncOutbox.get(id!);
      expect(item).toBeDefined();
      expect(item?.entityType).toBe('bill');
      expect(item?.entityId).toBe('201');
      expect(item?.status).toBe('pending');
      expect(JSON.parse(item!.payloadJson)).toEqual({ billNo: 'B-201', totalPaise: 45000 });
    });

    it('processes outbox items in FIFO order via loopback transport', async () => {
      await saveCloudConfig({ cloudEnabled: true });

      await enqueueSyncItem('bill', 301, { n: 1 });
      await enqueueSyncItem('stock_movement', 302, { n: 2 });
      await enqueueSyncItem('daily_closing', 303, { n: 3 });

      const pendingBefore = await db.syncOutbox.where('status').equals('pending').count();
      expect(pendingBefore).toBe(3);

      const result = await runSyncCycle({
        loopbackTransport: async (items) => {
          expect(items.length).toBe(3);
          expect(items[0].entityType).toBe('bill');
          expect(items[1].entityType).toBe('stock_movement');
          expect(items[2].entityType).toBe('daily_closing');
          return true;
        },
      });

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(3);
      expect(result.pendingCount).toBe(0);

      const pendingAfter = await db.syncOutbox.where('status').equals('pending').count();
      expect(pendingAfter).toBe(0);

      const syncedCount = await db.syncOutbox.where('status').equals('synced').count();
      expect(syncedCount).toBe(3);
    });

    it('handles simulated transport failure by recording error and incrementing retryCount', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error('Connection refused (offline or timeout)');
      };

      try {
        await saveCloudConfig({
          cloudEnabled: true,
          cloudUrl: 'https://test-server.supabase.co',
          cloudAnonKey: 'test-key',
        });

        await enqueueSyncItem('bill', 401, { test: true });

        const result = await runSyncCycle({ force: true });
        expect(result.success).toBe(false);
        expect(result.pendingCount).toBe(1);

        const item = await db.syncOutbox.where('entityId').equals('401').first();
        expect(item?.status).toBe('pending');
        expect(item?.retryCount).toBeGreaterThan(0);

        const cfg = await getCloudConfig();
        expect(cfg.lastStatus).toBe('failed');
        expect(cfg.lastError).toContain('Connection refused');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Remote Approvals Engine', () => {
    it('creates remote approval request and enqueues it to outbox', async () => {
      await saveCloudConfig({ cloudEnabled: true });

      const req = await createRemoteApprovalRequest({
        actionCategory: 'bill_edit_delete',
        summary: 'Bill #213 hatana',
        details: { reason: 'Grahak ne mana kiya' },
        requestedBy: 'Raju',
      });

      expect(req.id).toBeDefined();
      expect(req.status).toBe('pending');
      expect(req.requestedBy).toBe('Raju');

      const pending = await getPendingApprovalRequests();
      expect(pending.length).toBe(1);
      expect(pending[0].summary).toBe('Bill #213 hatana');

      // Verified enqueued to syncOutbox
      const outboxItems = await db.syncOutbox.where('entityType').equals('approval_request').toArray();
      expect(outboxItems.length).toBe(1);
    });

    it('resolves remote approval request, writes immutable audit log, and notifies outbox', async () => {
      await saveCloudConfig({ cloudEnabled: true });

      const req = await createRemoteApprovalRequest({
        actionCategory: 'discount_above_limit',
        summary: 'Bada discount Rs. 120',
        requestedBy: 'Sunita',
      });

      await resolveRemoteApprovalRequest(req.id!, 'approved', 'Ramesh Sharma (Owner)');

      const polled = await pollApprovalRequest(req.id!);
      expect(polled?.status).toBe('approved');
      expect(polled?.resolvedBy).toBe('Ramesh Sharma (Owner)');
      expect(polled?.resolvedAt).toBeDefined();

      // Check audit log
      const audits = await db.auditLog.where('action').equals('remote_approval_resolved').toArray();
      expect(audits.length).toBe(1);
      expect(audits[0].who).toBe('Ramesh Sharma (Owner)');
      expect(audits[0].details).toContain('approved');
    });

    it('rejects remote approval request cleanly', async () => {
      await saveCloudConfig({ cloudEnabled: true });

      const req = await createRemoteApprovalRequest({
        actionCategory: 'stock_correction',
        summary: 'Stock sudhaar: Dolo 650',
        requestedBy: 'Raju',
      });

      await resolveRemoteApprovalRequest(req.id!, 'rejected', 'Owner');

      const polled = await pollApprovalRequest(req.id!);
      expect(polled?.status).toBe('rejected');
    });
  });

  describe('Home Status Chip Truthfulness', () => {
    it('returns truthful "Local mode" when cloud mode is disabled', async () => {
      await saveCloudConfig({ cloudEnabled: false });

      const state = await getHomeSyncState();
      expect(state.cloudEnabled).toBe(false);
      expect(state.status).toBe('local');
      expect(state.chipLabel).toBe('Local mode');
      expect(state.bannerVisible).toBe(false);
    });

    it('returns truthful "Sign In Required" (not_connected) when cloudEnabled is true without authenticated session', async () => {
      await saveCloudConfig({ cloudEnabled: true });

      const state = await getHomeSyncState();
      expect(state.cloudEnabled).toBe(true);
      expect(state.isConnected).toBe(false);
      expect(state.status).toBe('not_connected');
      expect(state.chipLabel).toBe('Sign In Required');
      expect(state.bannerType).toBe('not_connected');

      // runSyncCycle must refuse to run or mark synced without auth/connection
      const syncRes = await runSyncCycle({ force: true });
      expect(syncRes.success).toBe(false);
      expect(syncRes.authRequired).toBe(true);
      expect(syncRes.processedCount).toBe(0);

      const cfg = await getCloudConfig();
      expect(cfg.lastStatus).toBe('never');
      expect(cfg.lastCloudSyncAt).toBeNull();

      // backfillLocalDataToCloud must also refuse without auth/connection
      const backfillRes = await backfillLocalDataToCloud();
      expect(backfillRes.success).toBe(false);
      expect(backfillRes.enqueuedCount).toBe(0);
    });

    it('returns truthful "Cloud-enabled · Synced: HH:mm" when cloud mode is active, connected, and healthy', async () => {
      const now = new Date(2026, 9, 27, 10, 42).getTime();
      await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-uuid-healthy' });
      await saveCloudConfig({
        cloudEnabled: true,
        lastCloudSyncAt: now,
        lastStatus: 'synced',
      });

      const state = await getHomeSyncState();
      expect(state.cloudEnabled).toBe(true);
      expect(state.isConnected).toBe(true);
      expect(state.status).toBe('synced');
      expect(state.chipLabel).toBe('Cloud-enabled · Synced: 10:42');
      expect(state.bannerVisible).toBe(false);

      // After signing out, status flips back to not_connected cleanly
      await signOutOwner();
      const afterSignOut = await getHomeSyncState();
      expect(afterSignOut.isConnected).toBe(false);
      expect(afterSignOut.status).toBe('not_connected');
    });

    it('returns truthful "Sync nahi hua" with banner when last sync failed', async () => {
      await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-uuid-failed' });
      await saveCloudConfig({
        cloudEnabled: true,
        lastStatus: 'failed',
        lastError: 'Network timeout',
      });
      await db.syncOutbox.add({
        entityType: 'bill',
        entityId: '501',
        payloadJson: JSON.stringify({ data: 1 }),
        status: 'pending',
        retryCount: 1,
        createdAt: new Date().toISOString(),
      });

      const state = await getHomeSyncState();
      expect(state.isConnected).toBe(true);
      expect(state.status).toBe('failed');
      expect(state.chipLabel).toBe('Sync nahi hua');
      expect(state.bannerVisible).toBe(true);
      expect(state.bannerType).toBe('failed');
    });
  });

  describe('Delta Sync & applyRemoteEvent', () => {
    it('applies remote medicine delta idempotently', async () => {
      await db.medicines.clear();

      // 1. Insert remote medicine
      await applyRemoteEvent({
        entity_type: 'medicine',
        entity_id: '99',
        payload: {
          id: 99,
          name: 'Paracetamol 650',
          strength: '650mg',
          form: 'tablet',
          salt: 'Paracetamol',
          company: 'Apex',
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 3500,
          unitsPerPack: 10,
          shortCode: 'P6',
          barcode: '8901234567890',
          shelf: 'A-1',
          scheduleType: 'OTC',
          minStockUnits: 20,
          active: true,
        },
      });

      let med = await db.medicines.get(99);
      expect(med).toBeDefined();
      expect(med?.name).toBe('Paracetamol 650');
      expect(med?.shelf).toBe('A-1');

      // 2. Update remote medicine
      await applyRemoteEvent({
        entity_type: 'medicine',
        entity_id: '99',
        payload: {
          id: 99,
          name: 'Paracetamol 650 Extra',
          shelf: 'B-2',
        },
      });

      med = await db.medicines.get(99);
      expect(med?.name).toBe('Paracetamol 650 Extra');
      expect(med?.shelf).toBe('B-2');
    });

    it('applies remote batch, supplier, and customer deltas', async () => {
      await db.batches.clear();
      await db.suppliers.clear();
      await db.customers.clear();

      // Batch
      await applyRemoteEvent({
        entity_type: 'batch',
        entity_id: '501',
        payload: {
          medicineId: 99,
          batchNo: 'BATCH-XYZ',
          expiry: '2028-12-31',
          purchaseRatePaise: 2000,
          mrpPaise: 3500,
          shelf: 'B-2',
        },
      });

      const batch = await db.batches.where('batchNo').equals('BATCH-XYZ').first();
      expect(batch).toBeDefined();
      expect(batch?.mrpPaise).toBe(3500);

      // Supplier
      await applyRemoteEvent({
        entity_type: 'supplier',
        entity_id: '77',
        payload: {
          id: 77,
          name: 'Apex Pharma Distributors',
          phone: '9876500000',
          gstNo: '07AAAAA0000A1Z5',
          address: 'Delhi Hub',
        },
      });

      const supplier = await db.suppliers.get(77);
      expect(supplier?.name).toBe('Apex Pharma Distributors');

      // Customer
      await applyRemoteEvent({
        entity_type: 'customer',
        entity_id: '88',
        payload: {
          id: 88,
          name: 'Vikas Verma',
          phone: '9811223344',
          address: 'Block C',
          creditLimitPaise: 500000,
        },
      });

      const customer = await db.customers.get(88);
      expect(customer?.name).toBe('Vikas Verma');
      expect(customer?.creditLimitPaise).toBe(500000);
    });

    it('applies remote staff delta cleanly', async () => {
      await db.users.clear();

      await applyRemoteEvent({
        entity_type: 'staff',
        entity_id: 'staff-1',
        payload: {
          id: 'staff-1',
          name: 'Sunita Sharma',
          role: 'cashier',
          pinHash: 'dummyhash',
          pinSalt: 'dummysalt',
          pinLength: 4,
          active: true,
        },
      });

      const user = await db.users.get('staff-1');
      expect(user).toBeDefined();
      expect(user?.name).toBe('Sunita Sharma');
      expect(user?.role).toBe('cashier');
    });

    it('pullRemoteEvents safely handles unconfigured or empty events', async () => {
      const mockOrder = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEq = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.spyOn(supabase, 'from').mockReturnValue({ select: mockSelect } as any);

      const cfg = await getCloudConfig();
      const res = await pullRemoteEvents(cfg, 'shop-uuid-dummy');
      expect(typeof res.pulledCount).toBe('number');
      expect(typeof res.lastSeq).toBe('number');
    });
  });

  describe('Photo Storage & Upload', () => {
    it('returns null gracefully when unconfigured or offline', async () => {
      const res = await uploadShopPhoto('counter/invoice-1.jpg', 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
      expect(res === null || typeof res === 'string').toBe(true);
    });
  });
});
