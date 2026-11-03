import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type Medicine, type Supplier, type DBUser } from '../db';
import { savePurchase, getReviewData, findDuplicatePurchase, type PurchaseDraft } from './purchase';
import { scaledSize } from './image';

const SAMPLE_SUPPLIER: Supplier = {
  id: 1,
  name: 'Sharma Agencies',
  phone: '+91 98260 12345',
  gstNo: '27AABCU9603R1ZM',
  address: 'Indore, MP',
};

const SAMPLE_MEDICINE: Medicine = {
  id: 10,
  name: 'Crocin',
  strength: '500 mg',
  form: 'Tablet',
  salt: 'Paracetamol',
  company: 'GSK',
  gstPercent: 12,
  hsn: '300490',
  mrpPaise: 3200, // 32.00
  unitsPerPack: 10,
  shortCode: 'C1',
  barcode: '8901117002138',
  shelf: 'S-04',
  scheduleType: 'none',
  minStockUnits: 20,
  active: true,
};

const SAMPLE_MEDICINE_2: Medicine = {
  id: 20,
  name: 'Dolo',
  strength: '650 mg',
  form: 'Tablet',
  salt: 'Paracetamol',
  company: 'Micro Labs',
  gstPercent: 12,
  hsn: '300490',
  mrpPaise: 3100, // 31.00
  unitsPerPack: 15,
  shortCode: 'D1',
  barcode: '8901117005555',
  shelf: 'S-02',
  scheduleType: 'none',
  minStockUnits: 30,
  active: true,
};

const OWNER_USER: DBUser = {
  id: 'user-1',
  name: 'Sunil Kumar',
  role: 'owner',
  pinHash: 'hash',
  pinSalt: 'salt',
  active: true,
};

const STAFF_USER: DBUser = {
  id: 'user-2',
  name: 'Raju Chemist',
  role: 'cashier',
  pinHash: 'hash',
  pinSalt: 'salt',
  active: true,
};

describe('Purchase logic and atomic saving', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();

    await db.suppliers.add({ ...SAMPLE_SUPPLIER });
    await db.medicines.add({ ...SAMPLE_MEDICINE });
    await db.medicines.add({ ...SAMPLE_MEDICINE_2 });
  });

  it('stock rises by (packs + free packs) x unitsPerPack and type is "purchase"', async () => {
    const draft: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-101',
      invoiceDate: '24/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-1',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 20,
          freePacks: 1,
          purchaseRatePaise: 2400, // Rs. 24
          mrpPaise: 3200,
        },
      ],
    };

    const res = await savePurchase(draft, OWNER_USER);
    expect(res.purchaseId).toBeGreaterThan(0);

    const movements = await db.stockMovements.toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('purchase');
    // (20 packs + 1 free) * 10 units = 210 units
    expect(movements[0].qtyUnits).toBe(210);
  });

  it('free packs add stock but no cost (line amount and total are whole paise)', async () => {
    const draft: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-102',
      invoiceDate: '24/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-1',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 20,
          freePacks: 2, // 2 free packs
          purchaseRatePaise: 2400, // Rs. 24 per pack
          mrpPaise: 3200,
        },
      ],
    };

    const res = await savePurchase(draft, OWNER_USER);
    // Cost must be 20 * 2400 = 48000 paise (Rs. 480), free packs cost 0
    expect(res.totalPaise).toBe(48000);
    expect(Number.isInteger(res.totalPaise)).toBe(true);

    const movement = (await db.stockMovements.toArray())[0];
    // Stock is (20 + 2) * 10 = 220 units
    expect(movement.qtyUnits).toBe(220);
  });

  it('an identical batch merges into the existing batch', async () => {
    // 1st purchase creating batch B2231
    const draft1: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-103',
      invoiceDate: '24/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-1',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 10,
          freePacks: 0,
          purchaseRatePaise: 2400,
          mrpPaise: 3200,
        },
      ],
    };
    await savePurchase(draft1, OWNER_USER);

    const initialBatches = await db.batches.toArray();
    expect(initialBatches).toHaveLength(1);
    const initialBatchId = initialBatches[0].id;

    // 2nd purchase with identical medicine, batch, expiry, MRP, rate
    const draft2: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-104',
      invoiceDate: '25/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-2',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 15,
          freePacks: 0,
          purchaseRatePaise: 2400,
          mrpPaise: 3200,
        },
      ],
    };
    await savePurchase(draft2, OWNER_USER);

    const afterBatches = await db.batches.toArray();
    // Still exactly 1 batch, reused initialBatchId
    expect(afterBatches).toHaveLength(1);
    expect(afterBatches[0].id).toBe(initialBatchId);

    // But stockMovements has 2 records linking to the same batchId
    const movements = await db.stockMovements.toArray();
    expect(movements).toHaveLength(2);
    expect(movements[0].batchId).toBe(initialBatchId);
    expect(movements[1].batchId).toBe(initialBatchId);
  });

  it('a different rate or MRP creates a new batch', async () => {
    // 1st purchase creating batch B2231 with rate 2400
    const draft1: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-105',
      invoiceDate: '24/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-1',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 10,
          freePacks: 0,
          purchaseRatePaise: 2400,
          mrpPaise: 3200,
        },
      ],
    };
    await savePurchase(draft1, OWNER_USER);

    // 2nd purchase with same batchNo but different rate (2600)
    const draft2: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-106',
      invoiceDate: '25/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-2',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 15,
          freePacks: 0,
          purchaseRatePaise: 2600, // Different rate!
          mrpPaise: 3200,
        },
      ],
    };
    await savePurchase(draft2, OWNER_USER);

    const batches = await db.batches.toArray();
    // Must be 2 separate batches!
    expect(batches).toHaveLength(2);
    expect(batches[0].purchaseRatePaise).toBe(2400);
    expect(batches[1].purchaseRatePaise).toBe(2600);
  });

  it('a failing line saves nothing at all (all or nothing transaction)', async () => {
    const invalidDraft: PurchaseDraft = {
      supplierId: 1,
      invoiceNo: 'INV-FAIL',
      invoiceDate: '24/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-1',
          medicineId: 10,
          medicineName: 'Crocin',
          unitsPerPack: 10,
          batchNo: 'GOOD1',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 10,
          freePacks: 0,
          purchaseRatePaise: 2400,
          mrpPaise: 3200,
        },
        {
          id: 'line-2',
          medicineId: 20,
          medicineName: 'Dolo',
          unitsPerPack: 15,
          batchNo: '', // Invalid empty batch!
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 10,
          freePacks: 0,
          purchaseRatePaise: 2400,
          mrpPaise: 3100,
        },
      ],
    };

    await expect(savePurchase(invalidDraft, OWNER_USER)).rejects.toThrow();

    // Verify completely nothing was saved
    expect(await db.purchases.count()).toBe(0);
    expect(await db.purchaseLines.count()).toBe(0);
    expect(await db.batches.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('a staff user review data contains no rate or amount', () => {
    const draft: PurchaseDraft = {
      supplierId: 1,
      supplierName: 'Sharma Agencies',
      invoiceNo: 'INV-STAFF',
      invoiceDate: '24/10/2024',
      invoicePhoto: 'data:image/jpeg;base64,sample',
      lines: [
        {
          id: 'line-1',
          medicineId: 10,
          medicineName: 'Crocin 500',
          unitsPerPack: 10,
          batchNo: 'B2231',
          expiryMonthYear: '08/27',
          expiryDate: '2027-08-31',
          packs: 20,
          freePacks: 1,
          purchaseRatePaise: 2400,
          mrpPaise: 3200,
        },
      ],
    };

    // Owner view
    const ownerView = getReviewData(draft, OWNER_USER);
    expect(ownerView.canSeeRates).toBe(true);
    if (ownerView.canSeeRates) {
      expect(ownerView.totalPaise).toBe(48000);
      expect(ownerView.lines[0].purchaseRatePaise).toBe(2400);
      expect(ownerView.lines[0].lineAmountPaise).toBe(48000);
    }

    // Staff view
    const staffView = getReviewData(draft, STAFF_USER);
    expect(staffView.canSeeRates).toBe(false);
    expect((staffView as any).totalPaise).toBeUndefined();
    expect((staffView.lines[0] as any).purchaseRatePaise).toBeUndefined();
    expect((staffView.lines[0] as any).lineAmountPaise).toBeUndefined();
    expect(staffView.lines[0].packs).toBe(20);
    expect(staffView.lines[0].freePacks).toBe(1);
    expect(staffView.lines[0].mrpPaise).toBe(3200);
  });

  it('findDuplicatePurchase detects existing purchases without blocking silently', async () => {
    await db.purchases.add({
      supplierId: 1,
      invoiceNo: 'INV-2024-001',
      date: '2024-10-24',
      invoicePhoto: 'data:image/jpeg;base64,photo',
      verified: false,
    });

    const found = await findDuplicatePurchase(1, 'inv-2024-001 ');
    expect(found).toBeDefined();
    expect(found?.invoiceNo).toBe('INV-2024-001');

    const notFound = await findDuplicatePurchase(1, 'INV-DIFF');
    expect(notFound).toBeUndefined();

    const differentSupplier = await findDuplicatePurchase(2, 'INV-2024-001');
    expect(differentSupplier).toBeUndefined();
  });

  it('scaledSize scales down images preserving aspect ratio with max 1600 px longest side', () => {
    // Landscape > 1600
    const landscape = scaledSize(3200, 2400, 1600);
    expect(landscape.width).toBe(1600);
    expect(landscape.height).toBe(1200);

    // Portrait > 1600
    const portrait = scaledSize(1200, 2400, 1600);
    expect(portrait.width).toBe(800);
    expect(portrait.height).toBe(1600);

    // Smaller than 1600: unchanged
    const small = scaledSize(800, 600, 1600);
    expect(small.width).toBe(800);
    expect(small.height).toBe(600);
  });
});

