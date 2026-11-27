import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, runWithSyncWorkspaceBypass } from '../db';
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
  deduplicateLocalUsers,
  switchToCloudWorkspace,
  switchToLocalWorkspace,
  buildSyncEventId,
  startRealtimeSync,
  stopRealtimeSync,
  subscribeToSyncUpdates,
  initNetworkSyncListeners,
} from './cloudSync';
import { Capacitor } from '@capacitor/core';
import { finalizeBill } from './billing';
import { recordUdhaarPayment } from './udhaar';
import { subscribeFeedback } from './feedback';
import { signOutOwner } from './cloudAuth';
import {
  DEFAULT_APPROVAL_RULES,
  getApprovalRuleForCategory,
  shouldBlockProtectedActionOffline,
} from './approvals';

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

      // After signing out, cloud sync stops cleanly and device continues in Local Mode
      await signOutOwner();
      const afterSignOut = await getHomeSyncState();
      expect(afterSignOut.cloudEnabled).toBe(false);
      expect(afterSignOut.isConnected).toBe(false);
      expect(afterSignOut.status).toBe('local');
      expect(afterSignOut.chipLabel).toBe('Local mode');
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

  describe('Staff Deduplication, Workspace Separation & Silent Realtime Sync', () => {
    it('deduplicates staff by ID and matching name+role so Suraj Dev never duplicates across syncs', async () => {
      await db.users.clear();
      await db.users.put({
        id: 'staff_local_100',
        name: 'Suraj Dev',
        role: 'cashier',
        pinHash: 'local-hash',
        pinSalt: 'local-salt',
        pinLength: 4,
        active: true,
        createdAt: '2026-11-01T10:00:00.000Z',
      });

      // Incoming cloud event for same staff with a different device-generated ID
      await applyRemoteEvent({
        entity_type: 'staff',
        entity_id: 'staff_cloud_200',
        payload: {
          id: 'staff_cloud_200',
          name: 'Suraj Dev',
          role: 'cashier',
          pinHash: 'cloud-hash',
          pinSalt: 'cloud-salt',
          pinLength: 4,
          active: true,
          createdAt: '2026-11-02T10:00:00.000Z',
        },
      });

      let users = await db.users.toArray();
      expect(users.length).toBe(1);
      expect(users[0].id).toBe('staff_cloud_200');
      expect(users[0].name).toBe('Suraj Dev');

      // Even if pre-existing duplicate rows exist, deduplicateLocalUsers merges them down to 1
      await db.users.put({
        id: 'staff_dup_300',
        name: 'suraj dev ',
        role: 'cashier',
        pinHash: 'old-hash',
        pinSalt: 'old-salt',
        pinLength: 4,
        active: true,
        createdAt: '2026-10-01T10:00:00.000Z',
      });
      expect(await db.users.count()).toBe(2);

      const removed = await deduplicateLocalUsers();
      expect(removed).toBe(1);
      users = await db.users.toArray();
      expect(users.length).toBe(1);
      expect(users[0].id).toBe('staff_cloud_200');
    });

    it('separates local-only bills and staff from cloud workspace and restores local workspace cleanly', async () => {
      await db.users.clear();
      await db.bills.clear();
      await db.settings.delete('active_data_scope');
      await db.settings.delete('local_mode_snapshot');

      // Local-only staff and bill
      await db.users.put({
        id: 'staff_local_suraj',
        name: 'Suraj Dev',
        role: 'cashier',
        pinHash: 'h',
        pinSalt: 's',
        active: true,
      });
      await db.bills.add({
        billNo: 'LOCAL-2026/0001',
        financialYear: '2026-27',
        date: '2026-11-20',
        customerName: 'Local Walk-in',
        customerPhone: '',
        doctorName: '',
        subtotalPaise: 10000,
        discountPaise: 0,
        discountPercent: 0,
        roundOffPaise: 0,
        totalPaise: 10000,
        taxablePaise: 8929,
        gstPaise: 1071,
        paymentMode: 'cash',
        cashReceivedPaise: 10000,
        changePaise: 0,
        status: 'completed',
        cashierId: 'staff_local_suraj',
        cashierName: 'Suraj Dev',
        createdAt: '2026-11-20T10:00:00.000Z',
      });

      // Switch to existing cloud shop -> local bills & local staff must be isolated out
      const switched = await switchToCloudWorkspace('shop-cloud-abc', {
        name: 'Cloud Pharmacy',
        syncId: 'HOSP-CLD1-2222',
        ownerEmail: 'owner@cloud.com',
      });
      expect(switched.switched).toBe(true);
      expect(await db.bills.count()).toBe(0);
      expect(await db.users.count()).toBe(0);
      expect((await db.shop.toArray())[0]?.name).toBe('Cloud Pharmacy');

      // Apply cloud bill + cloud stock movement idempotently (even replayed twice without hook errors)
      const cloudBillEvt = {
        entity_type: 'bill',
        entity_id: '1',
        payload: {
          bill: {
            id: 1,
            billNo: 'CLOUD-2026/0001',
            financialYear: '2026-27',
            date: '2026-11-20',
            customerName: 'Laptop Customer',
            customerPhone: '9999999999',
            doctorName: '',
            subtotalPaise: 25000,
            discountPaise: 0,
            discountPercent: 0,
            roundOffPaise: 0,
            totalPaise: 25000,
            taxablePaise: 22321,
            gstPaise: 2679,
            paymentMode: 'udhaar',
            cashReceivedPaise: 0,
            changePaise: 0,
            status: 'completed',
            cashierId: 'owner',
            cashierName: 'Sunil Kumar',
            createdAt: '2026-11-20T11:00:00.000Z',
          },
          items: [],
          movements: [
            {
              id: 10,
              batchId: 5,
              medicineId: 2,
              type: 'sale',
              qtyUnits: -10,
              reference: 'CLOUD-2026/0001',
              who: 'Sunil Kumar',
              at: '2026-11-20T11:00:00.000Z',
            },
          ],
        },
      };
      await applyRemoteEvent(cloudBillEvt);
      await applyRemoteEvent(cloudBillEvt); // replay must not throw or duplicate

      const cloudBills = await db.bills.toArray();
      expect(cloudBills.length).toBe(1);
      expect(cloudBills[0].billNo).toBe('CLOUD-2026/0001');
      const cloudMovements = await db.stockMovements.filter((m) => m.reference === 'CLOUD-2026/0001').toArray();
      expect(cloudMovements.length).toBe(1);

      // Switching back to Local Mode restores local-only data cleanly
      const restored = await switchToLocalWorkspace();
      expect(restored.restored).toBe(true);
      const localBills = await db.bills.toArray();
      expect(localBills.length).toBe(1);
      expect(localBills[0].billNo).toBe('LOCAL-2026/0001');
    });

    it('generates collision-free sync event IDs for two devices sharing the same shopSyncId', () => {
      const idLaptop = buildSyncEventId('HOSP-SAME-SHOP', { id: 1, entityType: 'bill', entityId: '1' }, 'DEV-LAPTOP1');
      const idAndroid = buildSyncEventId('HOSP-SAME-SHOP', { id: 1, entityType: 'bill', entityId: '1' }, 'DEV-ANDROID');
      expect(idLaptop).not.toBe(idAndroid);
      expect(idLaptop).toMatch(/^HOSP-SAME-SHOP:bill:1:\d+$/);
      expect(idAndroid).toMatch(/^HOSP-SAME-SHOP:bill:1:\d+$/);
    });

    it('applies incoming Supabase Realtime postgres_changes silently with zero popup feedback', async () => {
      await db.medicines.clear();
      await db.settings.put({ key: 'cloud_enabled', value: true });
      await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-rt-999' });

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: { user: { id: 'usr-rt', email: 'rt@test.com' } } as any },
        error: null,
      });

      let capturedCallback: ((payload: any) => Promise<void>) | null = null;
      const mockChannel: any = {
        on: vi.fn().mockImplementation((_type: string, filter: any, cb: any) => {
          if (filter?.table === 'hospivo_sync_events') {
            capturedCallback = cb;
          }
          return mockChannel;
        }),
        subscribe: vi.fn().mockReturnValue({}),
      };
      vi.spyOn(supabase, 'channel').mockReturnValue(mockChannel);
      vi.spyOn(supabase, 'removeChannel').mockResolvedValue('ok' as any);

      const feedbackEvents: any[] = [];
      const unsubFeedback = subscribeFeedback((ev) => {
        if (ev) feedbackEvents.push(ev);
      });
      const syncNotified: string[][] = [];
      const unsubSync = subscribeToSyncUpdates((types) => syncNotified.push(types));

      try {
        const started = await startRealtimeSync('shop-rt-999');
        expect(started).toBe(true);
        expect(capturedCallback).not.toBeNull();

        await capturedCallback!({
          new: {
            seq: 42,
            shop_id: 'shop-rt-999',
            entity_type: 'medicine',
            entity_id: '777',
            payload_json: JSON.stringify({
              id: 777,
              name: 'Realtime Crocin 500',
              strength: '500mg',
              form: 'tablet',
              salt: 'Paracetamol',
              company: 'GSK',
              gstPercent: 12,
              hsn: '3004',
              mrpPaise: 2000,
              unitsPerPack: 15,
              shortCode: 'RC1',
              barcode: '',
              shelf: 'S-02',
              scheduleType: 'none',
              minStockUnits: 15,
              active: true,
            }),
          },
        });

        const med = await db.medicines.get(777);
        expect(med?.name).toBe('Realtime Crocin 500');
        expect((await db.settings.get('last_pulled_seq'))?.value).toBe(42);
        expect(syncNotified.some((t) => t.includes('medicine'))).toBe(true);
        // Must be completely silent: zero toast/popup feedback events!
        expect(feedbackEvents.length).toBe(0);
      } finally {
        unsubFeedback();
        unsubSync();
        stopRealtimeSync();
      }
    });
  });

  describe('Offline-First Queueing & Silent Auto-Flush on Reconnect', () => {
    it('queues bills, FEFO stock movements, Udhaar payments, and settings inside Dexie transactions while offline, then flushes silently when online returns', async () => {
      await runWithSyncWorkspaceBypass(async () => {
        await db.medicines.clear();
        await db.batches.clear();
        await db.stockMovements.clear();
        await db.bills.clear();
        await db.billItems.clear();
        await db.udhaarPayments.clear();
        await db.syncOutbox.clear();
      });

      await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-offline-1' });
      await saveCloudConfig({
        cloudEnabled: true,
        shopSyncId: 'HOSP-OFFL-1111',
      });

      // Seed medicine + FEFO batch + stock
      const medId = Number(
        await db.medicines.add({
          name: 'Offline Dolo 650',
          strength: '650mg',
          form: 'tablet',
          salt: 'Paracetamol',
          company: 'Micro Labs',
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 3000,
          unitsPerPack: 15,
          shortCode: 'OD1',
          barcode: '',
          shelf: 'S-01',
          scheduleType: 'none',
          minStockUnits: 15,
          active: true,
        })
      );
      const batchId = Number(
        await db.batches.add({
          medicineId: medId,
          batchNo: 'OFF-B1',
          expiry: '2028-12-31',
          purchaseRatePaise: 2000,
          mrpPaise: 3000,
          shelf: 'S-01',
        })
      );
      await db.stockMovements.add({
        batchId,
        medicineId: medId,
        type: 'purchase',
        qtyUnits: 150,
        reference: 'OPENING',
        who: 'Owner',
        at: '2026-11-20T09:00:00.000Z',
      });

      // Go OFFLINE
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      const feedbackEvents: any[] = [];
      const unsubFeedback = subscribeFeedback((ev) => {
        if (ev) feedbackEvents.push(ev);
      });

      try {
        // 1. Finalize a bill while offline (calls enqueueSyncItem INSIDE a Dexie transaction!)
        const sale = await finalizeBill(
          {
            lines: [
              {
                medicineId: medId,
                medicineName: 'Offline Dolo 650',
                unitMode: 'pack',
                qtyInput: 1,
                unitsPerPack: 15,
                mrpPaise: 3000,
                gstPercent: 12,
              },
            ],
            paymentMode: 'udhaar',
            customerName: 'Offline Customer',
            customerPhone: '9876543211',
            doctorName: '',
            cashReceivedPaise: 0,
            discountPercent: 0,
          },
          { id: 'owner', name: 'Owner', role: 'owner' }
        );
        expect(sale.totalPaise).toBe(3000);

        // 2. Record Udhaar payment while offline (also inside a Dexie transaction!)
        await recordUdhaarPayment({
          customerName: 'Offline Customer',
          customerPhone: '9876543211',
          amountPaise: 1000,
          mode: 'cash',
          note: 'Part payment offline',
          receivedBy: 'Owner',
        });

        // 3. Queue a settings update while offline
        await enqueueSyncItem('settings', 'discount_limit', {
          key: 'discount_limit',
          value: 12,
        });

        // Wait a tick for Dexie.ignoreTransaction outbox writes
        await new Promise((r) => setTimeout(r, 40));

        const queued = await db.syncOutbox.where('status').equals('pending').toArray();
        const queuedTypes = queued.map((q) => q.entityType);
        expect(queuedTypes).toContain('bill');
        expect(queuedTypes).toContain('stock_movement');
        expect(queuedTypes).toContain('udhaar_payment');
        expect(queuedTypes).toContain('settings');

        // Home status should report truthful offline + pending count
        const offlineState = await getHomeSyncState();
        expect(offlineState.status).toBe('offline');
        expect(offlineState.pendingCount).toBe(queued.length);

        // 4. Connectivity returns (simulate Capacitor Network plugin status change -> connected: true)
        let networkCb: ((status: { connected?: boolean }) => void) | null = null;
        const originalPlugins = (Capacitor as any).Plugins;
        (Capacitor as any).Plugins = {
          ...(originalPlugins || {}),
          Network: {
            addListener: vi.fn().mockImplementation((_ev: string, cb: any) => {
              networkCb = cb;
              return Promise.resolve({ remove: vi.fn() });
            }),
          },
        };

        const pushedEvents: any[] = [];
        vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
          data: { session: { user: { id: 'usr-off', email: 'off@test.com' } } as any },
          error: null,
        });
        vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
          if (table === 'hospivo_sync_events') {
            return {
              upsert: vi.fn().mockImplementation((events: any[]) => {
                pushedEvents.push(...events);
                return Promise.resolve({ error: null });
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gt: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            } as any;
          }
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          } as any;
        });

        const cleanupListeners = initNetworkSyncListeners();
        try {
          Object.defineProperty(navigator, 'onLine', {
            value: true,
            configurable: true,
            writable: true,
          });
          expect(networkCb).not.toBeNull();
          networkCb!({ connected: true });

          // Wait briefly for silent async flush
          await new Promise((r) => setTimeout(r, 400));

          const remainingPending = await db.syncOutbox.where('status').equals('pending').count();
          expect(remainingPending).toBe(0);
          expect(pushedEvents.map((e) => e.entity_type)).toEqual(
            expect.arrayContaining(['bill', 'stock_movement', 'udhaar_payment', 'settings'])
          );

          // Must flush completely silently — zero popup toasts!
          expect(feedbackEvents.length).toBe(0);
        } finally {
          cleanupListeners();
          (Capacitor as any).Plugins = originalPlugins;
        }
      } finally {
        unsubFeedback();
      }
    });

    it('wires Excess Discount Remote Approval rule without blind offline blocking and resolves live', async () => {
      await db.settings.put({
        key: 'approval_rules',
        value: {
          ...DEFAULT_APPROVAL_RULES,
          discount_above_limit: 'remote_approval',
        },
      });
      await db.settings.put({ key: 'cloud_enabled', value: true });
      await db.settings.put({ key: 'shop_sync_id', value: 'HOSP-APPR-1111' });

      const rule = await getApprovalRuleForCategory('discount_above_limit');
      expect(rule).toBe('remote_approval');
      // Remote Approval must NOT blindly block even when offline (PIN fallback handles offline)
      expect(shouldBlockProtectedActionOffline(rule, false)).toBe(false);
      // Only blocked_offline blocks when offline
      expect(shouldBlockProtectedActionOffline('blocked_offline', false)).toBe(true);
      expect(shouldBlockProtectedActionOffline('blocked_offline', true)).toBe(false);

      const created = await createRemoteApprovalRequest({
        actionCategory: 'discount_above_limit',
        summary: 'Bill #101: 12% discount (Rs. 120) on Rs. 1000',
        details: { deviceName: 'Counter PC 1', shopSyncId: 'HOSP-APPR-1111' },
        requestedBy: 'Ravi',
      });
      expect(created.status).toBe('pending');
      expect((await getPendingApprovalRequests()).some((r) => r.id === created.id)).toBe(true);

      // Owner resolves remotely -> unlocks immediately
      await resolveRemoteApprovalRequest(created.id!, 'approved', 'Owner');
      const polled = await pollApprovalRequest(created.id!);
      expect(polled?.status).toBe('approved');
    });
  });
});
