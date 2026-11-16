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
});
