import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db';
import { supabase } from '../lib/supabase';
import {
  enqueueSyncItem,
  runSyncCycle,
  saveCloudConfig,
  toClientCreatedAtEpochMs,
  parseEventCreatedAt,
  backfillLocalDataToCloud,
  buildSyncEventId,
  retryFailedSyncItems,
  getHomeSyncState,
  SYNC_BATCH_SIZE,
  MAX_SYNC_RETRIES,
} from './syncEngine';

function createMockQueryChain(resolvedData: any[] = []) {
  const query: any = {
    eq: vi.fn().mockImplementation(() => query),
    gt: vi.fn().mockImplementation(() => query),
    order: vi.fn().mockImplementation(() => query),
    limit: vi.fn().mockImplementation(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData[0] || null, error: null }),
    then: (resolve: any) => Promise.resolve({ data: resolvedData, error: null }).then(resolve),
  };
  return query;
}

describe('syncEngine - hospivo_sync_events schema alignment', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.settings.clear();
    await db.syncOutbox.clear();
    await db.medicines.clear();
    await db.users.clear();

    await saveCloudConfig({
      cloudEnabled: true,
      shopSyncId: 'HOSP-TEST-SYNC',
    });
    await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-uuid-1234' });
  });

  it('pushes outbox items to hospivo_sync_events with ONLY valid schema columns', async () => {
    const pushedBatches: any[][] = [];

    // Spy on supabase.from to intercept hospivo_sync_events upsert
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'hospivo_sync_events') {
        return {
          upsert: vi.fn().mockImplementation((events: any[]) => {
            pushedBatches.push(events);
            return Promise.resolve({ error: null });
          }),
          insert: vi.fn().mockImplementation((events: any[]) => {
            pushedBatches.push(events);
            return Promise.resolve({ error: null });
          }),
          select: vi.fn().mockReturnValue(createMockQueryChain([])),
        };
      }
      return {
        select: vi.fn().mockReturnValue(createMockQueryChain([])),
      };
    });
    vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

    // Enqueue 2 items (medicine and staff)
    await enqueueSyncItem('medicine', 101, {
      name: 'Paracetamol 650mg',
      shortCode: 'P1',
    });
    await enqueueSyncItem('staff', 'owner', {
      name: 'Dr. Owner',
      role: 'owner',
    });

    const pendingCount = await db.syncOutbox.count();
    expect(pendingCount).toBe(2);

    // Run sync cycle
    const result = await runSyncCycle({ force: true });
    expect(result.success).toBe(true);

    // Verify pushed event structure
    expect(pushedBatches.length).toBeGreaterThan(0);
    const pushedEvents = pushedBatches.flat();
    expect(pushedEvents.length).toBe(2);

    for (const event of pushedEvents) {
      // 1. Must include valid id (string format)
      expect(event.id).toBeDefined();
      expect(typeof event.id).toBe('string');

      // 2. Must include required shop & entity columns
      expect(event.shop_id).toBe('shop-uuid-1234');
      expect(event.shop_sync_id).toBe('HOSP-TEST-SYNC');
      expect(['medicine', 'staff']).toContain(event.entity_type);
      expect(event.entity_id).toBeDefined();

      // 3. Must include payload_json and numeric bigint epoch ms client_created_at
      expect(typeof event.payload_json).toBe('string');
      expect(typeof event.client_created_at).toBe('number');
      expect(event.client_created_at).toBeGreaterThan(0);

      // 4. Must NOT include non-existent columns (device_id, device_name, duplicate payload)
      expect(event).not.toHaveProperty('device_id');
      expect(event).not.toHaveProperty('device_name');
      expect(event).not.toHaveProperty('payload');

      // 5. Exact keys assertion (Zero extra or missing columns)
      const exactKeys = Object.keys(event).sort();
      expect(exactKeys).toEqual([
        'client_created_at',
        'entity_id',
        'entity_type',
        'id',
        'payload_json',
        'shop_id',
        'shop_sync_id',
      ]);
    }
  });

  describe('timestamp conversions for bigint client_created_at', () => {
    it('converts ISO string, epoch number, and dates to epoch integer milliseconds', () => {
      const iso = '2026-11-16T09:37:05.910Z';
      const expectedEpoch = Date.parse(iso);
      expect(toClientCreatedAtEpochMs(iso)).toBe(expectedEpoch);
      expect(toClientCreatedAtEpochMs(expectedEpoch)).toBe(expectedEpoch);
      expect(toClientCreatedAtEpochMs(1710000000123.456)).toBe(1710000000123);
      expect(toClientCreatedAtEpochMs(undefined)).toBeGreaterThan(0);
    });

    it('parses numeric epoch milliseconds or ISO strings back to ISO strings', () => {
      const iso = '2026-11-16T09:37:05.910Z';
      const epoch = Date.parse(iso);
      expect(parseEventCreatedAt(epoch)).toBe(new Date(epoch).toISOString());
      expect(parseEventCreatedAt(String(epoch))).toBe(new Date(epoch).toISOString());
      expect(parseEventCreatedAt(iso)).toBe(iso);
    });
  });

  describe('backfillLocalDataToCloud', () => {
    it('scans pre-existing local medicines, batches, customers, and staff users and pushes them to hospivo_sync_events', async () => {
      // 1. Populate pre-existing records directly in local Dexie tables WITHOUT queueing in syncOutbox
      await db.medicines.put({
        id: 1,
        name: 'Amoxicillin 500mg',
        strength: '500mg',
        form: 'capsule',
        salt: 'Amoxicillin',
        company: 'Cipla',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 12000,
        unitsPerPack: 10,
        shortCode: 'A1',
        barcode: '8901234567890',
        shelf: 'S-01',
        scheduleType: 'H',
        minStockUnits: 20,
        active: true,
        createdAt: '2026-11-01T10:00:00.000Z',
      });

      await db.batches.put({
        id: 10,
        medicineId: 1,
        batchNo: 'AMX-001',
        expiry: '2027-12-31',
        purchaseRatePaise: 8000,
        mrpPaise: 12000,
        shelf: 'S-01',
        createdAt: '2026-11-01T10:05:00.000Z',
      });

      await db.users.put({
        id: 'owner',
        name: 'Dr. Ramesh Sharma',
        role: 'owner',
        pinHash: 'dummy-hash',
        pinSalt: 'dummy-salt',
        active: true,
        createdAt: '2026-11-01T09:00:00.000Z',
      });
      await db.settings.put({
        key: 'approval_pin',
        value: { hash: 'approval-hash', salt: 'approval-salt' },
      });

      await db.customers.put({
        id: 5,
        name: 'Rajesh Kumar',
        phone: '9876543210',
        address: 'Ranchi',
        createdAt: '2026-11-01T11:00:00.000Z',
        updatedAt: '2026-11-01T11:00:00.000Z',
      });

      // Confirm outbox is initially empty
      expect(await db.syncOutbox.count()).toBe(0);

      // Track pushed batches to hospivo_sync_events
      const pushedBatches: any[][] = [];
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'hospivo_sync_events') {
          return {
            upsert: vi.fn().mockImplementation((events: any[]) => {
              pushedBatches.push(events);
              return Promise.resolve({ error: null });
            }),
            insert: vi.fn().mockImplementation((events: any[]) => {
              pushedBatches.push(events);
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnValue(createMockQueryChain([])),
          };
        }
        return {
          select: vi.fn().mockReturnValue(createMockQueryChain([])),
        };
      });
      vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

      // Execute backfill
      const result = await backfillLocalDataToCloud();
      expect(result.success).toBe(true);
      expect(result.enqueuedCount).toBeGreaterThanOrEqual(4);

      // Verify events pushed to hospivo_sync_events
      expect(pushedBatches.length).toBeGreaterThan(0);
      const flatEvents = pushedBatches.flat();
      expect(flatEvents.length).toBeGreaterThanOrEqual(4);

      // Check medicine event
      const medEvent = flatEvents.find((e) => e.entity_type === 'medicine' && e.entity_id === '1');
      expect(medEvent).toBeDefined();
      expect(medEvent.shop_id).toBe('shop-uuid-1234');
      expect(medEvent.shop_sync_id).toBe('HOSP-TEST-SYNC');
      expect(typeof medEvent.client_created_at).toBe('number');
      const medPayload = JSON.parse(medEvent.payload_json);
      expect(medPayload.name).toBe('Amoxicillin 500mg');

      // Check batch event
      const batchEvent = flatEvents.find((e) => e.entity_type === 'batch' && e.entity_id === '10');
      expect(batchEvent).toBeDefined();
      expect(batchEvent.entity_id).toBe('10');
      const batchPayload = JSON.parse(batchEvent.payload_json);
      expect(batchPayload.batchNo).toBe('AMX-001');

      // Check staff user event (bundled with approval PIN)
      const staffEvent = flatEvents.find((e) => e.entity_type === 'staff' && e.entity_id === 'owner');
      expect(staffEvent).toBeDefined();
      const staffPayload = JSON.parse(staffEvent.payload_json);
      expect(staffPayload.name).toBe('Dr. Ramesh Sharma');
      expect(staffPayload.approvalPin?.hash).toBe('approval-hash');

      // Check customer event
      const custEvent = flatEvents.find((e) => e.entity_type === 'customer' && e.entity_id === '5');
      expect(custEvent).toBeDefined();
      const custPayload = JSON.parse(custEvent.payload_json);
      expect(custPayload.name).toBe('Rajesh Kumar');

      // Verify that all outbox items are now marked synced
      const pendingAfter = await db.syncOutbox.where('status').equals('pending').count();
      expect(pendingAfter).toBe(0);
      const syncedAfter = await db.syncOutbox.where('status').equals('synced').count();
      expect(syncedAfter).toBeGreaterThanOrEqual(4);
    });
  });

  describe('buildSyncEventId - globally unique idempotent event IDs', () => {
    it('formats event ID deterministically and avoids collisions across devices and entities', () => {
      const idDeviceA = buildSyncEventId('HOSP-AAAA-1111', {
        id: 1,
        entityType: 'bill',
        entityId: '101',
      });
      const idDeviceB = buildSyncEventId('HOSP-BBBB-2222', {
        id: 1,
        entityType: 'bill',
        entityId: '101',
      });
      const idDifferentEntity = buildSyncEventId('HOSP-AAAA-1111', {
        id: 1,
        entityType: 'medicine',
        entityId: '101',
      });
      const idDifferentEntityId = buildSyncEventId('HOSP-AAAA-1111', {
        id: 1,
        entityType: 'bill',
        entityId: '102',
      });
      const idDifferentOutboxId = buildSyncEventId('HOSP-AAAA-1111', {
        id: 2,
        entityType: 'bill',
        entityId: '101',
      });

      expect(idDeviceA).toBe('HOSP-AAAA-1111:bill:101:1');
      expect(idDeviceB).toBe('HOSP-BBBB-2222:bill:101:1');
      expect(idDeviceA).not.toBe(idDeviceB);
      expect(idDeviceA).not.toBe(idDifferentEntity);
      expect(idDeviceA).not.toBe(idDifferentEntityId);
      expect(idDeviceA).not.toBe(idDifferentOutboxId);

      // Idempotent when called repeatedly for the same shop and outbox row
      expect(
        buildSyncEventId('HOSP-AAAA-1111', { id: 1, entityType: 'bill', entityId: '101' })
      ).toBe(idDeviceA);

      // Fallback suffix when item.id is missing
      const fallbackId = buildSyncEventId('HOSP-AAAA-1111', {
        entityType: 'bill',
        entityId: '101',
      });
      expect(fallbackId).toMatch(/^HOSP-AAAA-1111:bill:101:\d+$/);
    });
  });

  describe('chunked outbox batching (SYNC_BATCH_SIZE = 50)', () => {
    it('slices > 50 queued items into sequential chunks of 50 via Supabase push', async () => {
      expect(SYNC_BATCH_SIZE).toBe(50);

      const pushedBatches: any[][] = [];
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'hospivo_sync_events') {
          return {
            upsert: vi.fn().mockImplementation((events: any[]) => {
              pushedBatches.push(events);
              return Promise.resolve({ error: null });
            }),
            insert: vi.fn().mockImplementation((events: any[]) => {
              pushedBatches.push(events);
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnValue(createMockQueryChain([])),
          };
        }
        return {
          select: vi.fn().mockReturnValue(createMockQueryChain([])),
        };
      });
      vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

      // Queue 120 items directly into db.syncOutbox
      const nowIso = new Date().toISOString();
      const rows = Array.from({ length: 120 }, (_, i) => ({
        entityType: 'medicine' as const,
        entityId: String(i + 1),
        payloadJson: JSON.stringify({ id: i + 1, name: `Medicine ${i + 1}` }),
        status: 'pending' as const,
        retryCount: 0,
        createdAt: nowIso,
      }));
      await db.syncOutbox.bulkAdd(rows);

      const result = await runSyncCycle({ force: true });
      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(120);
      expect(result.pendingCount).toBe(0);
      expect(result.failedCount).toBe(0);

      // Must push sequentially in chunks of [50, 50, 20]
      expect(pushedBatches.map((b) => b.length)).toEqual([50, 50, 20]);

      // All 120 event IDs must be unique and use buildSyncEventId
      const allIds = pushedBatches.flat().map((e) => e.id);
      expect(new Set(allIds).size).toBe(120);
      expect(allIds[0]).toMatch(/^HOSP-TEST-SYNC:medicine:1:\d+$/);

      const syncedCount = await db.syncOutbox.where('status').equals('synced').count();
      expect(syncedCount).toBe(120);
    });

    it('slices > 50 items in fallback REST push and preserves synced progress on partial batch failure', async () => {
      // Clear cloud_shop_uuid so runSyncCycle uses fallback REST transport
      await db.settings.delete('cloud_shop_uuid');
      await saveCloudConfig({
        cloudEnabled: true,
        cloudUrl: 'https://rest-fallback.example.supabase.co',
        cloudAnonKey: 'rest-anon-key',
        shopSyncId: 'HOSP-REST-9999',
      });

      const restBatches: any[][] = [];
      let callCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: any, init?: RequestInit) => {
        callCount++;
        const parsed = JSON.parse(String(init?.body || '[]'));
        restBatches.push(parsed);
        if (callCount === 2) {
          return { ok: false, status: 503 } as Response;
        }
        return { ok: true, status: 201, json: async () => [] } as Response;
      }) as any;

      try {
        const nowIso = new Date().toISOString();
        const rows = Array.from({ length: 110 }, (_, i) => ({
          entityType: 'bill' as const,
          entityId: String(i + 1),
          payloadJson: JSON.stringify({ billNo: `B-${i + 1}` }),
          status: 'pending' as const,
          retryCount: 0,
          createdAt: nowIso,
        }));
        await db.syncOutbox.bulkAdd(rows);

        const result = await runSyncCycle({ force: true });
        expect(result.success).toBe(false);
        expect(result.processedCount).toBe(50);
        expect(result.pendingCount).toBe(60);
        expect(result.lastError).toContain('503');

        // Chunk 1 (50) succeeded, Chunk 2 (50) attempted & failed, Chunk 3 (10) not attempted yet
        expect(restBatches.map((b) => b.length)).toEqual([50, 50]);
        expect(restBatches[0][0].id).toMatch(/^HOSP-REST-9999:bill:1:\d+$/);

        const synced = await db.syncOutbox.where('status').equals('synced').count();
        expect(synced).toBe(50);

        const pendingRows = await db.syncOutbox.where('status').equals('pending').sortBy('id');
        expect(pendingRows.length).toBe(60);
        expect(pendingRows[0].retryCount).toBe(1);
        expect(pendingRows[49].retryCount).toBe(1);
        expect(pendingRows[50].retryCount).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('dead-letter transition and retryFailedSyncItems recovery', () => {
    it('transitions poisoned items to failed after MAX_SYNC_RETRIES and recovers via retryFailedSyncItems()', async () => {
      expect(MAX_SYNC_RETRIES).toBe(10);

      let shouldFail = true;
      const pushedBatches: any[][] = [];

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'hospivo_sync_events') {
          return {
            upsert: vi.fn().mockImplementation((events: any[]) => {
              pushedBatches.push(events);
              if (shouldFail) {
                return Promise.resolve({ error: { message: '400 Poisoned Payload' } });
              }
              return Promise.resolve({ error: null });
            }),
            insert: vi.fn().mockImplementation((events: any[]) => {
              if (shouldFail) {
                return Promise.resolve({ error: { message: '400 Poisoned Payload' } });
              }
              pushedBatches.push(events);
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnValue(createMockQueryChain([])),
          };
        }
        return {
          select: vi.fn().mockReturnValue(createMockQueryChain([])),
        };
      });
      vi.spyOn(supabase, 'from').mockImplementation(mockFrom as any);

      const poisonedId = await db.syncOutbox.add({
        entityType: 'bill',
        entityId: 'poison-1',
        payloadJson: JSON.stringify({ corrupt: true }),
        status: 'pending',
        retryCount: 0,
        createdAt: new Date().toISOString(),
      });

      // Attempts 1 through MAX_SYNC_RETRIES - 1 keep item as 'pending'
      for (let attempt = 1; attempt < MAX_SYNC_RETRIES; attempt++) {
        const res = await runSyncCycle({ force: true });
        expect(res.success).toBe(false);
        expect(res.pendingCount).toBe(1);
        expect(res.failedCount).toBe(0);

        const item = await db.syncOutbox.get(poisonedId);
        expect(item?.status).toBe('pending');
        expect(item?.retryCount).toBe(attempt);
        expect(item?.lastError).toBe('400 Poisoned Payload');
      }

      // Attempt MAX_SYNC_RETRIES transitions item to 'failed' (dead-lettered)
      const deadLetterRes = await runSyncCycle({ force: true });
      expect(deadLetterRes.success).toBe(false);
      expect(deadLetterRes.pendingCount).toBe(0);
      expect(deadLetterRes.failedCount).toBe(1);

      const deadItem = await db.syncOutbox.get(poisonedId);
      expect(deadItem?.status).toBe('failed');
      expect(deadItem?.retryCount).toBe(MAX_SYNC_RETRIES);
      expect(deadItem?.lastError).toBe('400 Poisoned Payload');

      const stateBeforeRetry = await getHomeSyncState();
      expect(stateBeforeRetry.failedCount).toBe(1);
      expect(stateBeforeRetry.status).toBe('failed');

      // Healthy new item syncs cleanly without being stalled by the dead-lettered item
      shouldFail = false;
      pushedBatches.length = 0;

      const healthyId = await db.syncOutbox.add({
        entityType: 'medicine',
        entityId: 'healthy-2',
        payloadJson: JSON.stringify({ name: 'Dolo 650' }),
        status: 'pending',
        retryCount: 0,
        createdAt: new Date().toISOString(),
      });

      const healthyRes = await runSyncCycle({ force: true });
      expect(healthyRes.success).toBe(true);
      expect(healthyRes.processedCount).toBe(1);
      expect(healthyRes.pendingCount).toBe(0);
      expect(healthyRes.failedCount).toBe(1);
      expect(pushedBatches.flat().map((e) => e.entity_id)).toEqual(['healthy-2']);

      const healthyItem = await db.syncOutbox.get(healthyId);
      expect(healthyItem?.status).toBe('synced');

      // Recover dead-lettered items via retryFailedSyncItems()
      const resetCount = await retryFailedSyncItems();
      expect(resetCount).toBe(1);

      const resetItem = await db.syncOutbox.get(poisonedId);
      expect(resetItem?.status).toBe('pending');
      expect(resetItem?.retryCount).toBe(0);
      expect(resetItem?.lastError).toBeUndefined();

      // Calling retryFailedSyncItems again when none are failed returns 0
      expect(await retryFailedSyncItems()).toBe(0);

      // Re-run sync cycle to complete recovery
      pushedBatches.length = 0;
      const recoveredRes = await runSyncCycle({ force: true });
      expect(recoveredRes.success).toBe(true);
      expect(recoveredRes.processedCount).toBe(1);
      expect(recoveredRes.pendingCount).toBe(0);
      expect(recoveredRes.failedCount).toBe(0);
      expect(pushedBatches.flat().map((e) => e.entity_id)).toEqual(['poison-1']);

      const finalItem = await db.syncOutbox.get(poisonedId);
      expect(finalItem?.status).toBe('synced');

      const stateAfterRecovery = await getHomeSyncState();
      expect(stateAfterRecovery.failedCount).toBe(0);
      expect(stateAfterRecovery.status).toBe('synced');
    });
  });
});
