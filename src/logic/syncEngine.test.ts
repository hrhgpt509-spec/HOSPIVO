import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db';
import { supabase } from '../lib/supabase';
import {
  enqueueSyncItem,
  runSyncCycle,
  saveCloudConfig,
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
      // 1. Must include valid id
      expect(event.id).toBeDefined();
      expect(typeof event.id === 'number' || typeof event.id === 'string').toBe(true);

      // 2. Must include required shop & entity columns
      expect(event.shop_id).toBe('shop-uuid-1234');
      expect(event.shop_sync_id).toBe('HOSP-TEST-SYNC');
      expect(['medicine', 'staff']).toContain(event.entity_type);
      expect(event.entity_id).toBeDefined();

      // 3. Must include payload_json and client_created_at
      expect(typeof event.payload_json).toBe('string');
      expect(typeof event.client_created_at).toBe('string');

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
});
