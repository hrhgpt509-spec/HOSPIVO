import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Batch, type Medicine, type Purchase, type PurchaseLine, type StockMovement, type Supplier } from '../db';
import { batchStock } from './stock';
import {
  buildExpiryBatchItems,
  calculateExpiryLossSummary,
  createSupplierReturn,
  formatSupplierReturnViews,
  loadExpiryDashboardData,
  updateSupplierReturnStatus,
} from './expiry';

const OWNER_USER = { id: 'owner-1', name: 'Sunil', role: 'owner' };
const CASHIER_USER = { id: 'cashier-1', name: 'Raju', role: 'cashier' };

describe('expiry & supplier returns logic', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('buckets >0-stock batches into 30/60/90/expired, attaches supplier, and strips rates for staff', () => {
    const today = '2026-11-01';
    const medicines: Medicine[] = [
      {
        id: 1,
        name: 'Crocin',
        strength: '500mg',
        form: 'tablet',
        salt: 'Paracetamol',
        company: 'GSK',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3000,
        unitsPerPack: 10,
        shortCode: 'C1',
        barcode: '8901',
        shelf: 'S-01',
        scheduleType: 'none',
        minStockUnits: 10,
        active: true,
      },
    ];
    const suppliers: Supplier[] = [
      { id: 10, name: 'Sharma Agencies', phone: '9876543210', gstNo: '09AAA', address: 'Main' },
    ];
    const purchases: Purchase[] = [
      {
        id: 100,
        supplierId: 10,
        invoiceNo: 'INV-100',
        date: '2026-01-10',
        invoicePhoto: '',
        verified: true,
      },
    ];
    const purchaseLines: PurchaseLine[] = [
      {
        id: 1,
        purchaseId: 100,
        medicineId: 1,
        batchNo: 'B30',
        expiry: '2026-11-30',
        packs: 2,
        freePacks: 0,
        purchaseRatePaise: 2000,
        mrpPaise: 3000,
      },
    ];
    const batches: Batch[] = [
      { id: 1, medicineId: 1, batchNo: 'BEXP', expiry: '2026-10-31', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
      { id: 2, medicineId: 1, batchNo: 'B30', expiry: '2026-11-30', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
      { id: 3, medicineId: 1, batchNo: 'B60', expiry: '2026-12-31', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
      { id: 4, medicineId: 1, batchNo: 'B90', expiry: '2027-01-25', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
      { id: 5, medicineId: 1, batchNo: 'BFAR', expiry: '2027-08-31', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
      { id: 6, medicineId: 1, batchNo: 'BZERO', expiry: '2026-11-20', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
    ];
    const stockMovements: StockMovement[] = [
      { id: 1, batchId: 1, medicineId: 1, type: 'purchase', qtyUnits: 12, reference: 'P1', who: 'Sunil', at: '2026-01-01T10:00:00Z' },
      { id: 2, batchId: 2, medicineId: 1, type: 'purchase', qtyUnits: 15, reference: 'P2', who: 'Sunil', at: '2026-01-10T10:00:00Z' },
      { id: 3, batchId: 3, medicineId: 1, type: 'purchase', qtyUnits: 10, reference: 'P3', who: 'Sunil', at: '2026-01-15T10:00:00Z' },
      { id: 4, batchId: 4, medicineId: 1, type: 'purchase', qtyUnits: 10, reference: 'P4', who: 'Sunil', at: '2026-01-20T10:00:00Z' },
      { id: 5, batchId: 5, medicineId: 1, type: 'purchase', qtyUnits: 20, reference: 'P5', who: 'Sunil', at: '2026-01-25T10:00:00Z' },
      { id: 6, batchId: 6, medicineId: 1, type: 'purchase', qtyUnits: 10, reference: 'P6', who: 'Sunil', at: '2026-01-26T10:00:00Z' },
      { id: 7, batchId: 6, medicineId: 1, type: 'sale', qtyUnits: -10, reference: 'S1', who: 'Raju', at: '2026-02-01T10:00:00Z' },
    ];

    const ownerItems = buildExpiryBatchItems({
      batches,
      medicines,
      stockMovements,
      purchases,
      purchaseLines,
      suppliers,
      user: OWNER_USER,
      today,
    });

    expect(ownerItems.map((i) => [i.batchNo, i.bucket])).toEqual([
      ['BEXP', 'expired'],
      ['B30', '30'],
      ['B60', '60'],
      ['B90', '90'],
    ]);

    const b30 = ownerItems.find((i) => i.batchNo === 'B30')!;
    expect(b30.expiryMonthYear).toBe('11/2026');
    expect(b30.packs).toBe(1);
    expect(b30.looseUnits).toBe(5);
    expect(b30.suggestedSupplierId).toBe(10);
    expect(b30.suggestedSupplierName).toBe('Sharma Agencies');
    expect(b30.purchaseRatePaise).toBe(2000);

    const staffItems = buildExpiryBatchItems({
      batches,
      medicines,
      stockMovements,
      purchases,
      purchaseLines,
      suppliers,
      user: CASHIER_USER,
      today,
    });

    expect(staffItems).toHaveLength(4);
    for (const item of staffItems) {
      expect(item.purchaseRatePaise).toBeUndefined();
      expect('purchaseRatePaise' in item).toBe(false);
    }
  });

  it('creates supplier return atomically, deducts batch stock via supplier_return movement, and logs audit without rates', async () => {
    const medId = (await db.medicines.add({
      name: 'Pan 40',
      strength: '40mg',
      form: 'tablet',
      salt: 'Pantoprazole',
      company: 'Alkem',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 15000,
      unitsPerPack: 15,
      shortCode: 'P1',
      barcode: '8902',
      shelf: 'D-11',
      scheduleType: 'none',
      minStockUnits: 15,
      active: true,
    })) as number;

    const batchId = (await db.batches.add({
      medicineId: medId,
      batchNo: 'P334',
      expiry: '2026-10-31',
      purchaseRatePaise: 9500,
      mrpPaise: 15000,
      shelf: 'D-11',
    })) as number;

    const supplierId = (await db.suppliers.add({
      name: 'Gupta Pharma',
      phone: '9988776655',
      gstNo: '09BBB',
      address: 'Market',
    })) as number;

    await db.stockMovements.add({
      batchId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 30,
      reference: 'INV-1',
      who: 'Sunil',
      at: '2026-01-01T10:00:00Z',
    });

    // Reject over-stock return
    await expect(
      createSupplierReturn({
        batchId,
        supplierId,
        qtyUnits: 35,
        actorName: 'Sunil',
      })
    ).rejects.toThrow(/exceeds available batch stock/i);

    const created = await createSupplierReturn({
      batchId,
      supplierId,
      qtyUnits: 15,
      note: 'Packed for pickup',
      actorName: 'Sunil',
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('pending');
    expect(created.qtyUnits).toBe(15);

    expect(await batchStock(batchId)).toBe(15);

    const movements = await db.stockMovements.where('batchId').equals(batchId).toArray();
    const retMv = movements.find((m) => m.type === 'supplier_return');
    expect(retMv).toBeDefined();
    expect(retMv!.qtyUnits).toBe(-15);

    const audits = await db.auditLog.where('action').equals('supplier_return_created').toArray();
    expect(audits).toHaveLength(1);
    expect(audits[0].details).not.toContain('9500');
    expect(audits[0].details).not.toContain('95');
  });

  it('updates supplier return status, logs supplier_return_status_updated, and omits rates for staff', async () => {
    const medId = (await db.medicines.add({
      name: 'Azithral',
      strength: '500mg',
      form: 'tablet',
      salt: 'Azithromycin',
      company: 'Alembic',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 12000,
      unitsPerPack: 5,
      shortCode: 'A1',
      barcode: '8903',
      shelf: 'B-07',
      scheduleType: 'H',
      minStockUnits: 10,
      active: true,
    })) as number;

    const batchId = (await db.batches.add({
      medicineId: medId,
      batchNo: 'AZ89',
      expiry: '2026-09-30',
      purchaseRatePaise: 7000,
      mrpPaise: 12000,
      shelf: 'B-07',
    })) as number;

    const supplierId = (await db.suppliers.add({
      name: 'Vardhman Healthcare',
      phone: '9112233445',
      gstNo: '09CCC',
      address: 'Road 2',
    })) as number;

    await db.stockMovements.add({
      batchId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 10,
      reference: 'INV-2',
      who: 'Sunil',
      at: '2026-01-01T10:00:00Z',
    });

    const ret = await createSupplierReturn({
      batchId,
      supplierId,
      qtyUnits: 10,
      actorName: 'Raju',
    });

    await updateSupplierReturnStatus({
      returnId: ret.id!,
      status: 'sent',
      actorName: 'Raju',
    });
    const finalRet = await updateSupplierReturnStatus({
      returnId: ret.id!,
      status: 'credit_received',
      actorName: 'Sunil',
    });
    expect(finalRet.status).toBe('credit_received');

    const statusAudits = await db.auditLog
      .where('action')
      .equals('supplier_return_status_updated')
      .toArray();
    expect(statusAudits).toHaveLength(2);
    expect(statusAudits[0].details).toContain('pending to sent');
    expect(statusAudits[1].details).toContain('sent to credit_received');
    expect(statusAudits[1].details).not.toContain('7000');

    const allReturns = await db.supplierReturns.toArray();
    const meds = await db.medicines.toArray();
    const staffViews = formatSupplierReturnViews(allReturns, meds, CASHIER_USER);
    expect(staffViews[0].purchaseRatePaise).toBeUndefined();
    expect('purchaseRatePaise' in staffViews[0]).toBe(false);

    const staffDash = await loadExpiryDashboardData(CASHIER_USER, '2026-11-12');
    expect(staffDash.lossSummary).toBeNull();
  });

  it('calculates owner-only 12-month expiry loss from expired stock & write-offs and returns null for staff', () => {
    const today = '2026-11-12';
    const medicines: Medicine[] = [
      {
        id: 1,
        name: 'Crocin',
        strength: '500mg',
        form: 'tablet',
        salt: 'Paracetamol',
        company: 'GSK',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3000,
        unitsPerPack: 10,
        shortCode: 'C1',
        barcode: '8901',
        shelf: 'S-01',
        scheduleType: 'none',
        minStockUnits: 10,
        active: true,
      },
    ];
    const batches: Batch[] = [
      // Expired Oct 2026: 15 units left * (2000 / 10) = 3000 paise (Rs 30)
      { id: 1, medicineId: 1, batchNo: 'B1', expiry: '2026-10-31', purchaseRatePaise: 2000, mrpPaise: 3000, shelf: 'S-01' },
      // Expired Sep 2026: 10 units purchased, all 10 written off -> 10 * (1500 / 10) = 1500 paise (Rs 15)
      { id: 2, medicineId: 1, batchNo: 'B2', expiry: '2026-09-30', purchaseRatePaise: 1500, mrpPaise: 2500, shelf: 'S-01' },
      // Too old (> 12 months ago): should NOT be included
      { id: 3, medicineId: 1, batchNo: 'B3', expiry: '2025-10-31', purchaseRatePaise: 5000, mrpPaise: 6000, shelf: 'S-01' },
    ];
    const stockMovements: StockMovement[] = [
      { batchId: 1, medicineId: 1, type: 'purchase', qtyUnits: 15, reference: 'P1', who: 'Sunil', at: '2026-01-01T00:00:00Z' },
      { batchId: 2, medicineId: 1, type: 'purchase', qtyUnits: 10, reference: 'P2', who: 'Sunil', at: '2026-01-01T00:00:00Z' },
      { batchId: 2, medicineId: 1, type: 'expiry_writeoff', qtyUnits: -10, reference: 'WR1', who: 'Sunil', at: '2026-09-30T18:00:00Z' },
      { batchId: 3, medicineId: 1, type: 'purchase', qtyUnits: 10, reference: 'P3', who: 'Sunil', at: '2025-01-01T00:00:00Z' },
    ];

    const staffLoss = calculateExpiryLossSummary({
      batches,
      medicines,
      stockMovements,
      user: CASHIER_USER,
      today,
    });
    expect(staffLoss).toBeNull();

    const ownerLoss = calculateExpiryLossSummary({
      batches,
      medicines,
      stockMovements,
      user: OWNER_USER,
      today,
    });
    expect(ownerLoss).not.toBeNull();
    expect(ownerLoss!.totalLossPaise).toBe(4500); // Rs 30 + Rs 15 = Rs 45 (4500 paise)
    expect(ownerLoss!.months).toEqual([
      { yearMonth: '2026-10', year: 2026, month: 10, lossPaise: 3000 },
      { yearMonth: '2026-09', year: 2026, month: 9, lossPaise: 1500 },
    ]);
  });
});

