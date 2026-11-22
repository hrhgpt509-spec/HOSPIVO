import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, runWithSyncWorkspaceBypass } from '../db';
import { supabase } from '../lib/supabase';
import {
  getAvailableShops,
  switchActiveShop,
  prepareNewShopSetup,
  cancelNewShopSetup,
  registerCurrentShopInDirectory,
} from './multiShop';
import {
  signOutOwner,
  verifyEmailOtp,
  resolveCloudSignInChoice,
  provisionCloudShop,
  listCloudShopsForUser,
} from './cloudAuth';
import { subscribeFeedback } from './feedback';

function createMockArrayQueryChain(resolvedData: any[] = []) {
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

async function wipeAllDbForTest() {
  await runWithSyncWorkspaceBypass(async () => {
    await Promise.all([
      db.shop.clear(),
      db.users.clear(),
      db.settings.clear(),
      db.auditLog.clear(),
      db.medicines.clear(),
      db.batches.clear(),
      db.stockMovements.clear(),
      db.suppliers.clear(),
      db.purchases.clear(),
      db.purchaseLines.clear(),
      db.productTypes.clear(),
      db.bills.clear(),
      db.billItems.clear(),
      db.heldBills.clear(),
      db.billReturns.clear(),
      db.supplierReturns.clear(),
      db.customers.clear(),
      db.udhaarPayments.clear(),
      db.regularReminders.clear(),
      db.dailyClosings.clear(),
      db.syncOutbox.clear(),
      db.approvalRequests.clear(),
    ]);
  });
}

describe('strict account/shop isolation & multi-shop management', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await wipeAllDbForTest();
  });

  it('strictly isolates Account A data (bills, stock, staff, Udhaar, auditLog, settings) when signing out and signing into new Account B with "Keep Separate"', async () => {
    // Device-global flags that MUST survive account switch
    await db.settings.put({ key: 'intro_seen', value: true });
    await db.settings.put({ key: 'language', value: 'en' });

    // Seed Account A's active cloud shop + full operational data + shop settings
    await db.settings.put({ key: 'cloud_enabled', value: true });
    await db.settings.put({ key: 'cloud_shop_uuid', value: 'shop-acct-A' });
    await db.settings.put({ key: 'shop_sync_id', value: 'HOSP-AAAA-1111' });
    await db.settings.put({ key: 'owner_email', value: 'ownera@pharma.com' });
    await db.settings.put({ key: 'active_data_scope', value: 'cloud:shop-acct-A' });
    await db.settings.put({ key: 'discount_limit', value: 18 });
    await db.settings.put({ key: 'auto_lock_minutes', value: 12 });
    await db.settings.put({ key: 'pinLength', value: 6 });
    await db.settings.put({ key: 'approval_pin', value: { hash: 'secret-hash-A', salt: 'salt-A' } });

    await db.shop.add({
      name: 'Account A Pharmacy',
      ownerName: 'Owner A',
      address: 'Main Market A',
      phone: '9000000001',
      gstNo: '09AAAA0000A1Z1',
      drugLicenceNos: 'DL-A1',
      mode: 'cloud',
      cloudShopUuid: 'shop-acct-A',
      shopSyncId: 'HOSP-AAAA-1111',
      ownerEmail: 'ownera@pharma.com',
    });
    await db.users.bulkAdd([
      { id: 'owner', name: 'Owner A', role: 'owner', pinHash: 'h1', pinSalt: 's1', active: true },
      { id: 'staff_a', name: 'Suraj Dev', role: 'cashier', pinHash: 'h2', pinSalt: 's2', active: true },
    ]);
    const medId = Number(
      await db.medicines.add({
        name: 'Account A Med',
        strength: '500mg',
        form: 'tablet',
        salt: 'Salt A',
        company: 'Comp A',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 5000,
        unitsPerPack: 10,
        shortCode: 'A1',
        barcode: '',
        shelf: 'S-01',
        scheduleType: 'none',
        minStockUnits: 10,
        active: true,
      })
    );
    const batchId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'BATCH-A',
        expiry: '2028-12-31',
        purchaseRatePaise: 3000,
        mrpPaise: 5000,
        shelf: 'S-01',
      })
    );
    await db.stockMovements.add({
      batchId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 100,
      reference: 'PUR-A1',
      who: 'Owner A',
      at: '2026-11-20T10:00:00.000Z',
    });
    await db.bills.add({
      billNo: 'ACCT-A/0001',
      financialYear: '2026-27',
      date: '2026-11-20',
      customerName: 'Customer A',
      customerPhone: '9888888881',
      doctorName: '',
      subtotalPaise: 5000,
      discountPaise: 0,
      discountPercent: 0,
      roundOffPaise: 0,
      totalPaise: 5000,
      taxablePaise: 4464,
      gstPaise: 536,
      paymentMode: 'udhaar',
      cashReceivedPaise: 0,
      changePaise: 0,
      status: 'completed',
      cashierId: 'staff_a',
      cashierName: 'Suraj Dev',
      createdAt: '2026-11-20T11:00:00.000Z',
    });
    await db.customers.add({
      name: 'Customer A',
      phone: '9888888881',
      address: 'Lane A',
      createdAt: '2026-11-20T11:00:00.000Z',
      updatedAt: '2026-11-20T11:00:00.000Z',
    });
    await db.udhaarPayments.add({
      customerName: 'Customer A',
      customerPhone: '9888888881',
      amountPaise: 2000,
      mode: 'cash',
      note: 'Paid A',
      receivedBy: 'Owner A',
      createdAt: '2026-11-20T12:00:00.000Z',
    });
    await db.auditLog.add({
      timestamp: '2026-11-20T12:05:00.000Z',
      who: 'Owner A',
      action: 'bill_created',
      record: 'ACCT-A/0001',
      details: 'Account A secret audit',
    });

    await registerCurrentShopInDirectory('user-acct-A');

    // 1. Sign out of Account A
    vi.spyOn(supabase.auth, 'signOut').mockResolvedValueOnce({ error: null });
    await signOutOwner();

    // 2. Sign into new empty Account B (deferred prompt flow)
    vi.spyOn(supabase.auth, 'verifyOtp').mockResolvedValueOnce({
      data: { user: { id: 'user-acct-B', email: 'ownerb@pharma.com' } as any, session: {} as any },
      error: null,
    });
    vi.spyOn(supabase, 'from').mockImplementation(() => ({
      select: vi.fn().mockReturnValue(createMockArrayQueryChain([])),
    }) as any);

    const otpRes = await verifyEmailOtp('ownerb@pharma.com', '654321', { deferHydration: true });
    expect(otpRes.error).toBeNull();
    expect(otpRes.scenario).toBe('prompt_push_local_to_empty_cloud');

    // 3. Choose "Keep separate" (start_clean_cloud)
    const choiceRes = await resolveCloudSignInChoice({
      choice: 'start_clean_cloud',
      email: 'ownerb@pharma.com',
    });
    expect(choiceRes.startedCleanSetup).toBe(true);

    // 4. ZERO bleed-over from Account A across EVERY table and shop-scoped setting
    expect(await db.shop.count()).toBe(0);
    expect(await db.users.count()).toBe(0);
    expect(await db.medicines.count()).toBe(0);
    expect(await db.batches.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.bills.count()).toBe(0);
    expect(await db.customers.count()).toBe(0);
    expect(await db.udhaarPayments.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(0);

    expect(await db.settings.get('discount_limit')).toBeUndefined();
    expect(await db.settings.get('auto_lock_minutes')).toBeUndefined();
    expect(await db.settings.get('pinLength')).toBeUndefined();
    expect(await db.settings.get('approval_pin')).toBeUndefined();
    expect(await db.settings.get('shop_sync_id')).toBeUndefined();
    expect(await db.settings.get('cloud_shop_uuid')).toBeUndefined();

    // Device-global preferences remain intact
    expect((await db.settings.get('intro_seen'))?.value).toBe(true);
    expect((await db.settings.get('language'))?.value).toBe('en');

    // 5. Account B creates its own brand-new shop -> never reuses Account A's shop or data
    const insertedShopRows: any[] = [];
    const pushedEvents: any[] = [];

    await db.shop.add({
      name: 'Account B Fresh Store',
      ownerName: 'Owner B',
      address: 'Sector B',
      phone: '9000000002',
      gstNo: '',
      drugLicenceNos: '',
      mode: 'cloud',
      ownerEmail: 'ownerb@pharma.com',
    });
    await db.users.add({
      id: 'owner',
      name: 'Owner B',
      role: 'owner',
      pinHash: 'hb',
      pinSalt: 'sb',
      active: true,
    });

    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'user-acct-B', email: 'ownerb@pharma.com' } as any },
      error: null,
    });
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { user: { id: 'user-acct-B', email: 'ownerb@pharma.com' } } as any },
      error: null,
    });
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          insert: vi.fn().mockImplementation((row: any) => {
            insertedShopRows.push(row);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'shop-acct-B' }, error: null }),
              }),
            };
          }),
          select: vi.fn().mockReturnValue(
            createMockArrayQueryChain([
              { id: 'shop-acct-B', shop_name: 'Account B Fresh Store', shop_sync_id: 'HOSP-BBBB-2222' },
            ])
          ),
        } as any;
      }
      if (table === 'shop_members') {
        return {
          select: vi.fn().mockReturnValue(createMockArrayQueryChain([])),
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      if (table === 'hospivo_sync_events') {
        return {
          upsert: vi.fn().mockImplementation((evts: any[]) => {
            pushedEvents.push(...evts);
            return Promise.resolve({ error: null });
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue(createMockArrayQueryChain([])),
        } as any;
      }
      return { select: vi.fn().mockReturnValue(createMockArrayQueryChain([])) } as any;
    });

    const prov = await provisionCloudShop('Account B Fresh Store', 'HOSP-BBBB-2222', {
      forceCreateNew: true,
    });
    expect(prov.shopUuid).toBe('shop-acct-B');
    expect(insertedShopRows.length).toBe(1);
    expect(insertedShopRows[0].owner_user_id).toBe('user-acct-B');
    // Pushed events MUST NOT contain any Account A bill, medicine, or Suraj Dev
    expect(pushedEvents.some((e) => e.payload_json?.includes('ACCT-A/0001'))).toBe(false);
    expect(pushedEvents.some((e) => e.payload_json?.includes('Suraj Dev'))).toBe(false);

    // Account B's Shop Selector MUST show ONLY Account B's shop, NEVER Account A's shop!
    await registerCurrentShopInDirectory('user-acct-B');
    const availableForB = await getAvailableShops();
    expect(availableForB.shops.map((s) => s.name)).toEqual(['Account B Fresh Store']);
    expect(availableForB.shops.some((s) => s.cloudShopUuid === 'shop-acct-A')).toBe(false);
  });

  it('creates and switches between multiple shops with strict per-shop data isolation and zero popup toasts', async () => {
    const feedbackEvents: any[] = [];
    const unsubFeedback = subscribeFeedback((ev) => {
      if (ev) feedbackEvents.push(ev);
    });

    try {
      // 1. Setup Shop 1 (Local)
      await db.settings.put({ key: 'active_data_scope', value: 'local:HOSP-SHP1-0001' });
      await db.settings.put({ key: 'shop_sync_id', value: 'HOSP-SHP1-0001' });
      await db.settings.put({ key: 'discount_limit', value: 10 });
      await db.shop.add({
        name: 'Shop One Pharmacy',
        ownerName: 'Owner One',
        address: 'Road 1',
        phone: '9111111111',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'local',
        shopSyncId: 'HOSP-SHP1-0001',
      });
      await db.users.add({
        id: 'owner',
        name: 'Owner One',
        role: 'owner',
        pinHash: 'h1',
        pinSalt: 's1',
        active: true,
      });
      await db.bills.add({
        billNo: 'SHP1/0001',
        financialYear: '2026-27',
        date: '2026-11-22',
        customerName: 'Buyer One',
        customerPhone: '9111100001',
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
        cashierId: 'owner',
        cashierName: 'Owner One',
        createdAt: '2026-11-22T09:00:00.000Z',
      });
      await registerCurrentShopInDirectory();

      // 2. Tap "+ Add Another Shop" -> prepares clean isolated workspace
      await prepareNewShopSetup();
      expect(await db.shop.count()).toBe(0);
      expect(await db.bills.count()).toBe(0);
      expect(await db.users.count()).toBe(0);
      expect(await db.settings.get('discount_limit')).toBeUndefined();

      // 3. Complete Shop 2 setup
      await db.settings.put({ key: 'active_data_scope', value: 'local:HOSP-SHP2-0002' });
      await db.settings.put({ key: 'shop_sync_id', value: 'HOSP-SHP2-0002' });
      await db.settings.put({ key: 'discount_limit', value: 5 });
      await db.shop.add({
        name: 'Shop Two Medical',
        ownerName: 'Owner Two',
        address: 'Road 2',
        phone: '9222222222',
        gstNo: '',
        drugLicenceNos: '',
        mode: 'local',
        shopSyncId: 'HOSP-SHP2-0002',
      });
      await db.users.bulkAdd([
        { id: 'owner', name: 'Owner Two', role: 'owner', pinHash: 'h2', pinSalt: 's2', active: true },
        { id: 's2', name: 'Staff Two', role: 'cashier', pinHash: 'h3', pinSalt: 's3', active: true },
      ]);
      await db.bills.add({
        billNo: 'SHP2/0001',
        financialYear: '2026-27',
        date: '2026-11-22',
        customerName: 'Buyer Two',
        customerPhone: '9222200002',
        doctorName: '',
        subtotalPaise: 25000,
        discountPaise: 0,
        discountPercent: 0,
        roundOffPaise: 0,
        totalPaise: 25000,
        taxablePaise: 22321,
        gstPaise: 2679,
        paymentMode: 'upi',
        cashReceivedPaise: 25000,
        changePaise: 0,
        status: 'completed',
        cashierId: 's2',
        cashierName: 'Staff Two',
        createdAt: '2026-11-22T10:00:00.000Z',
      });
      await registerCurrentShopInDirectory();

      // 4. Verify Shop Selector lists BOTH shops with accurate staff counts
      const list = await getAvailableShops();
      expect(list.shops.length).toBe(2);
      const shop1Entry = list.shops.find((s) => s.name === 'Shop One Pharmacy')!;
      const shop2Entry = list.shops.find((s) => s.name === 'Shop Two Medical')!;
      expect(shop1Entry.staffCount).toBe(1);
      expect(shop2Entry.staffCount).toBe(2);

      // 5. Switch to Shop 1 -> ONLY Shop 1 data & settings are active
      await switchActiveShop(shop1Entry);
      expect((await db.shop.toCollection().first())?.name).toBe('Shop One Pharmacy');
      expect((await db.bills.toArray()).map((b) => b.billNo)).toEqual(['SHP1/0001']);
      expect((await db.users.toArray()).map((u) => u.name)).toEqual(['Owner One']);
      expect((await db.settings.get('discount_limit'))?.value).toBe(10);

      // 6. Switch back to Shop 2 -> ONLY Shop 2 data & settings are active
      await switchActiveShop(shop2Entry);
      expect((await db.shop.toCollection().first())?.name).toBe('Shop Two Medical');
      expect((await db.bills.toArray()).map((b) => b.billNo)).toEqual(['SHP2/0001']);
      expect((await db.users.toArray()).map((u) => u.name).sort()).toEqual(['Owner Two', 'Staff Two']);
      expect((await db.settings.get('discount_limit'))?.value).toBe(5);

      // 7. Starting "+ Add Another Shop" and cancelling restores Shop 2 cleanly
      await prepareNewShopSetup();
      expect(await db.shop.count()).toBe(0);
      const restored = await cancelNewShopSetup();
      expect(restored).toBe(true);
      expect((await db.shop.toCollection().first())?.name).toBe('Shop Two Medical');
      expect((await db.bills.toArray()).map((b) => b.billNo)).toEqual(['SHP2/0001']);

      // Completely silent — zero popup toasts!
      expect(feedbackEvents.length).toBe(0);
    } finally {
      unsubFeedback();
    }
  });

  it('lists and switches across multiple cloud shops for the same signed-in account cleanly', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { user: { id: 'usr-multi', email: 'chain@pharma.com' } } as any },
      error: null,
    });
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'shops') {
        return {
          select: vi.fn().mockReturnValue(
            createMockArrayQueryChain([
              { id: 'cloud-shop-1', shop_name: 'Chain Branch 1', shop_sync_id: 'HOSP-CHN1-1111' },
              { id: 'cloud-shop-2', shop_name: 'Chain Branch 2', shop_sync_id: 'HOSP-CHN2-2222' },
            ])
          ),
        } as any;
      }
      if (table === 'hospivo_sync_events') {
        return {
          select: vi.fn().mockReturnValue(
            createMockArrayQueryChain([
              {
                seq: 1,
                shop_id: 'cloud-shop-2',
                entity_type: 'staff',
                entity_id: 'owner',
                payload_json: JSON.stringify({
                  id: 'owner',
                  name: 'Branch 2 Manager',
                  role: 'owner',
                  pinHash: 'h',
                  pinSalt: 's',
                  active: true,
                }),
              },
            ])
          ),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue(createMockArrayQueryChain([])),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      } as any;
    });

    const remoteList = await listCloudShopsForUser('usr-multi');
    expect(remoteList.map((s) => s.id)).toEqual(['cloud-shop-1', 'cloud-shop-2']);

    // Start on Branch 1 with its own bill
    await db.settings.put({ key: 'cloud_enabled', value: true });
    await db.settings.put({ key: 'cloud_shop_uuid', value: 'cloud-shop-1' });
    await db.settings.put({ key: 'active_data_scope', value: 'cloud:cloud-shop-1' });
    await db.shop.add({
      name: 'Chain Branch 1',
      ownerName: 'Branch 1 Manager',
      address: '',
      phone: '',
      gstNo: '',
      drugLicenceNos: '',
      mode: 'cloud',
      cloudShopUuid: 'cloud-shop-1',
      shopSyncId: 'HOSP-CHN1-1111',
      ownerEmail: 'chain@pharma.com',
    });
    await db.bills.add({
      billNo: 'CHN1/0001',
      financialYear: '2026-27',
      date: '2026-11-22',
      customerName: 'Branch 1 Customer',
      customerPhone: '',
      doctorName: '',
      subtotalPaise: 3000,
      discountPaise: 0,
      discountPercent: 0,
      roundOffPaise: 0,
      totalPaise: 3000,
      taxablePaise: 2679,
      gstPaise: 321,
      paymentMode: 'cash',
      cashReceivedPaise: 3000,
      changePaise: 0,
      status: 'completed',
      cashierId: 'owner',
      cashierName: 'Branch 1 Manager',
      createdAt: '2026-11-22T08:00:00.000Z',
    });

    const avail = await getAvailableShops();
    expect(avail.shops.map((s) => s.cloudShopUuid)).toEqual(['cloud-shop-1', 'cloud-shop-2']);

    // Switch to Cloud Branch 2 -> hydrates Branch 2 staff, zero Branch 1 bills visible!
    const branch2 = avail.shops.find((s) => s.cloudShopUuid === 'cloud-shop-2')!;
    await switchActiveShop(branch2);

    expect((await db.shop.toCollection().first())?.cloudShopUuid).toBe('cloud-shop-2');
    expect(await db.bills.count()).toBe(0);
    expect((await db.users.get('owner'))?.name).toBe('Branch 2 Manager');
    expect((await db.settings.get('cloud_shop_uuid'))?.value).toBe('cloud-shop-2');
  });
});
