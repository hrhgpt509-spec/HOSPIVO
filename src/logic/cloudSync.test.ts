import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  generateShopSyncId,
  getCloudConfig,
  saveCloudConfig,
  enqueueSyncItem,
  runSyncCycle,
  createRemoteApprovalRequest,
  resolveRemoteApprovalRequest,
  getPendingApprovalRequests,
  pollApprovalRequest,
  getHomeSyncState,
} from './cloudSync';

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

    it('returns truthful "Cloud-enabled · Synced: HH:mm" when cloud mode is active and healthy', async () => {
      const now = new Date(2026, 9, 27, 10, 42).getTime();
      await saveCloudConfig({
        cloudEnabled: true,
        lastCloudSyncAt: now,
        lastStatus: 'synced',
      });

      const state = await getHomeSyncState();
      expect(state.cloudEnabled).toBe(true);
      expect(state.status).toBe('synced');
      expect(state.chipLabel).toBe('Cloud-enabled · Synced: 10:42');
      expect(state.bannerVisible).toBe(false);
    });

    it('returns truthful "Sync nahi hua" with banner when last sync failed', async () => {
      await saveCloudConfig({
        cloudEnabled: true,
        lastStatus: 'failed',
        lastError: 'Network timeout',
      });
      await enqueueSyncItem('bill', 501, { data: 1 });

      const state = await getHomeSyncState();
      expect(state.status).toBe('failed');
      expect(state.chipLabel).toBe('Sync nahi hua');
      expect(state.bannerVisible).toBe(true);
      expect(state.bannerType).toBe('failed');
    });
  });
});
