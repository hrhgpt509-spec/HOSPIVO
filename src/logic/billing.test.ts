import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Medicine } from '../db';
import {
  DEFAULT_DISCOUNT_LIMIT_PERCENT,
  calculateBillTotals,
  computeQtyUnits,
  computeUnitPricePaise,
  extractInclusiveGst,
  finalizeBill,
  findInStockSubstitutes,
  generateNextBillNo,
  getDiscountLimitPercent,
  getIndianFinancialYear,
  processBillReturn,
} from './billing';
import { batchStock, medicineStock } from './stock';

const CASHIER_USER = {
  id: 'cashier-1',
  name: 'Ramesh',
  role: 'cashier',
};

const OWNER_USER = {
  id: 'owner-1',
  name: 'Dr. Sharma',
  role: 'owner',
};

async function seedMedicineWithBatch(
  medOverrides: Partial<Medicine> = {},
  batches: Array<{ batchNo: string; expiry: string; qtyUnits: number }> = []
): Promise<{ medicineId: number; batchIds: number[] }> {
  const medId = Number(
    await db.medicines.add({
      name: 'Paracetamol',
      strength: '650mg',
      form: 'Tablet',
      salt: 'Paracetamol',
      company: 'Micro Labs',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 3000, // Rs 30.00 per pack
      unitsPerPack: 15, // Rs 2.00 (200 paise) per tablet
      shortCode: 'P1',
      barcode: '890100000001',
      shelf: 'S-01',
      scheduleType: 'none',
      minStockUnits: 15,
      active: true,
      ...medOverrides,
    })
  );

  const batchIds: number[] = [];
  for (const b of batches) {
    const batchId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: b.batchNo,
        expiry: b.expiry,
        purchaseRatePaise: 2000,
        mrpPaise: medOverrides.mrpPaise ?? 3000,
        shelf: medOverrides.shelf ?? 'S-01',
      })
    );
    batchIds.push(batchId);

    if (b.qtyUnits !== 0) {
      await db.stockMovements.add({
        batchId,
        medicineId: medId,
        type: 'purchase',
        qtyUnits: b.qtyUnits,
        reference: 'INV-INIT',
        who: 'Owner',
        at: new Date().toISOString(),
      });
    }
  }

  return { medicineId: medId, batchIds };
}

describe('billing.ts Phase 3 core logic & DB engine', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('computes whole-paise line math (packs vs loose), inclusive GST extraction, and nearest-rupee round-off', () => {
    // Pack vs loose unit price
    expect(computeUnitPricePaise(3000, 15, 'pack')).toBe(3000);
    expect(computeUnitPricePaise(3000, 15, 'loose')).toBe(200);
    // Rounding loose unit price: 3150 / 15 = 210, 1000 / 3 = 333
    expect(computeUnitPricePaise(1000, 3, 'loose')).toBe(333);

    expect(computeQtyUnits(2, 15, 'pack')).toBe(30);
    expect(computeQtyUnits(7, 15, 'loose')).toBe(7);

    // MRP-inclusive GST extraction (12% GST on Rs 112.00 = 11200 paise -> 10000 taxable + 1200 GST)
    const gst = extractInclusiveGst(11200, 12);
    expect(gst.taxablePaise).toBe(10000);
    expect(gst.gstPaise).toBe(1200);

    // Bill totals with round-off:
    // Item 1: 1 pack @ 3140 paise (Rs 31.40), 12% GST -> round-off -40 paise -> total 3100 paise (Rs 31.00)
    const totalsDown = calculateBillTotals([
      {
        medicineId: 1,
        mrpPaise: 3140,
        unitsPerPack: 10,
        gstPercent: 12,
        unitMode: 'pack',
        qtyInput: 1,
      },
    ]);
    expect(totalsDown.netBeforeRoundOffPaise).toBe(3140);
    expect(totalsDown.roundOffPaise).toBe(-40);
    expect(totalsDown.totalPaise).toBe(3100);
    expect(totalsDown.taxablePaise + totalsDown.gstPaise).toBe(3140);
    expect(Number.isInteger(totalsDown.totalPaise)).toBe(true);

    // Item 2: 3 loose tablets of Rs 31.50/10 = 315 paise each -> 945 paise (Rs 9.45) + 1 pack Rs 30.10 (3010 paise)
    // Net = 3955 -> rounds up to 4000 paise (+45 paise)
    const totalsUp = calculateBillTotals([
      {
        medicineId: 1,
        mrpPaise: 3150,
        unitsPerPack: 10,
        gstPercent: 5,
        unitMode: 'loose',
        qtyInput: 3,
      },
      {
        medicineId: 2,
        mrpPaise: 3010,
        unitsPerPack: 10,
        gstPercent: 12,
        unitMode: 'pack',
        qtyInput: 1,
      },
    ]);
    expect(totalsUp.netBeforeRoundOffPaise).toBe(945 + 3010);
    expect(totalsUp.roundOffPaise).toBe(45);
    expect(totalsUp.totalPaise).toBe(4000);
  });

  it('flags discount > 5% (default limit) as requiresApproval discount_above_limit and initializes setting', async () => {
    const defaultLimit = await getDiscountLimitPercent();
    expect(defaultLimit).toBe(DEFAULT_DISCOUNT_LIMIT_PERCENT);
    const stored = await db.settings.get('discount_limit');
    expect(stored?.value).toBe(5);

    // 5% discount -> allowed without approval
    const allowed = calculateBillTotals(
      [
        {
          medicineId: 1,
          mrpPaise: 10000,
          unitsPerPack: 10,
          gstPercent: 12,
          unitMode: 'pack',
          qtyInput: 1,
        },
      ],
      5
    );
    expect(allowed.discountPaise).toBe(500);
    expect(allowed.requiresApproval).toBe(false);
    expect(allowed.approvalCategory).toBeUndefined();

    // 6% whole-bill discount -> requiresApproval
    const overWholeBill = calculateBillTotals(
      [
        {
          medicineId: 1,
          mrpPaise: 10000,
          unitsPerPack: 10,
          gstPercent: 12,
          unitMode: 'pack',
          qtyInput: 1,
        },
      ],
      6
    );
    expect(overWholeBill.discountPaise).toBe(600);
    expect(overWholeBill.requiresApproval).toBe(true);
    expect(overWholeBill.approvalCategory).toBe('discount_above_limit');

    // Item-level discount > 5% even if overall bill discount <= 5% -> requiresApproval
    const overItemDiscount = calculateBillTotals([
      {
        medicineId: 1,
        mrpPaise: 10000,
        unitsPerPack: 10,
        gstPercent: 12,
        unitMode: 'pack',
        qtyInput: 1,
        itemDiscountPercent: 10,
      },
      {
        medicineId: 2,
        mrpPaise: 50000,
        unitsPerPack: 10,
        gstPercent: 12,
        unitMode: 'pack',
        qtyInput: 1,
      },
    ]);
    expect(overItemDiscount.effectiveDiscountPercent).toBeLessThan(5);
    expect(overItemDiscount.requiresApproval).toBe(true);
    expect(overItemDiscount.approvalCategory).toBe('discount_above_limit');
  });

  it('rejects Schedule H / H1 medicine without complete prescription metadata', async () => {
    const { medicineId } = await seedMedicineWithBatch(
      { name: 'Augmentin 625', scheduleType: 'H', shortCode: 'A1' },
      [{ batchNo: 'AUG-01', expiry: '2028-12-31', qtyUnits: 30 }]
    );

    // Missing patientName, doctorName, prescriptionChecked
    await expect(
      finalizeBill(
        {
          lines: [{ medicineId, unitMode: 'pack', qtyInput: 1 }],
          paymentMode: 'cash',
        },
        CASHIER_USER,
        { today: '2026-11-12' }
      )
    ).rejects.toThrow('schedule_h_prescription_required');

    // Has names, but prescriptionChecked is false
    await expect(
      finalizeBill(
        {
          lines: [
            {
              medicineId,
              unitMode: 'pack',
              qtyInput: 1,
              patientName: 'Suresh',
              doctorName: 'Dr. Verma',
              prescriptionChecked: false,
            },
          ],
          paymentMode: 'cash',
        },
        CASHIER_USER,
        { today: '2026-11-12' }
      )
    ).rejects.toThrow('schedule_h_prescription_required');

    // No bills or stock movements written
    expect(await db.bills.count()).toBe(0);
    expect(await medicineStock(medicineId)).toBe(30);

    // Complete metadata succeeds
    const res = await finalizeBill(
      {
        lines: [
          {
            medicineId,
            unitMode: 'pack',
            qtyInput: 1,
            patientName: 'Suresh',
            doctorName: 'Dr. Verma',
            prescriptionChecked: true,
          },
        ],
        paymentMode: 'cash',
      },
      CASHIER_USER,
      { today: '2026-11-12' }
    );
    expect(res.billNo).toBe('2026-27/0001');
    expect(res.billItems[0].isScheduleH).toBe(true);
    expect(res.billItems[0].prescriptionChecked).toBe(true);
  });

  it('finalizeBill deducts stock FEFO across batches, blocks expired/insufficient stock, records audit, and enforces immutability', async () => {
    const { medicineId, batchIds } = await seedMedicineWithBatch(
      { name: 'Dolo 650', shortCode: 'D1', unitsPerPack: 15, mrpPaise: 3000 },
      [
        { batchNo: 'EXP-BATCH', expiry: '2026-10-31', qtyUnits: 50 }, // Expired on 2026-11-12!
        { batchNo: 'B-DEC26', expiry: '2026-12-31', qtyUnits: 10 }, // Earliest valid
        { batchNo: 'B-JUN27', expiry: '2027-06-30', qtyUnits: 20 }, // Second valid
      ]
    );

    const [expiredBatchId, earlyBatchId, laterBatchId] = batchIds;

    // Total non-expired valid stock is 30 (10 + 20), even though expired batch has 50.
    // Requesting 35 units must fail without deducting anything!
    await expect(
      finalizeBill(
        {
          lines: [{ medicineId, unitMode: 'loose', qtyInput: 35 }],
          paymentMode: 'cash',
        },
        CASHIER_USER,
        { today: '2026-11-12' }
      )
    ).rejects.toThrow('insufficient_stock');

    expect(await batchStock(expiredBatchId)).toBe(50);
    expect(await batchStock(earlyBatchId)).toBe(10);
    expect(await batchStock(laterBatchId)).toBe(20);
    expect(await db.bills.count()).toBe(0);

    // Selling 18 loose tablets should take all 10 from B-DEC26 and 8 from B-JUN27 (FEFO)
    const sale = await finalizeBill(
      {
        lines: [{ medicineId, unitMode: 'loose', qtyInput: 18 }],
        paymentMode: 'cash',
        cashReceivedPaise: 5000,
        date: '2026-11-12',
      },
      CASHIER_USER,
      { today: '2026-11-12' }
    );

    expect(sale.billNo).toBe('2026-27/0001');
    expect(sale.bill.totalPaise).toBe(3600); // 18 * 200 paise = 3600
    expect(sale.bill.changePaise).toBe(1400); // 5000 - 3600 = 1400
    expect(sale.billItems).toHaveLength(2);
    expect(sale.billItems[0].batchId).toBe(earlyBatchId);
    expect(sale.billItems[0].qtyUnits).toBe(10);
    expect(sale.billItems[1].batchId).toBe(laterBatchId);
    expect(sale.billItems[1].qtyUnits).toBe(8);

    // Verify batch stock
    expect(await batchStock(expiredBatchId)).toBe(50); // untouched
    expect(await batchStock(earlyBatchId)).toBe(0);
    expect(await batchStock(laterBatchId)).toBe(12);

    // Audit log check
    const logs = await db.auditLog.where('action').equals('bill_created').toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].record).toBe('2026-27/0001');

    // Immutability hook checks
    await expect(db.bills.delete(sale.billId)).rejects.toThrow('cannot be deleted');
    await expect(db.bills.update(sale.billId, { totalPaise: 100 })).rejects.toThrow(
      'cannot be edited'
    );
    await expect(db.billItems.delete(sale.billItems[0].id!)).rejects.toThrow(
      'cannot be deleted'
    );
    await expect(db.billItems.update(sale.billItems[0].id!, { qtyUnits: 1 })).rejects.toThrow(
      'cannot be edited'
    );
  });

  it('processBillReturn restores stock to the EXACT SAME batch and blocks over-returning', async () => {
    const { medicineId, batchIds } = await seedMedicineWithBatch(
      { name: 'Azithral 500', shortCode: 'A1', unitsPerPack: 5, mrpPaise: 13000 },
      [
        { batchNo: 'AZ-EARLY', expiry: '2027-01-31', qtyUnits: 10 },
        { batchNo: 'AZ-LATE', expiry: '2027-12-31', qtyUnits: 20 },
      ]
    );
    const [earlyBatchId, lateBatchId] = batchIds;

    // Sell 15 units -> 10 from AZ-EARLY, 5 from AZ-LATE
    const sale = await finalizeBill(
      {
        lines: [{ medicineId, unitMode: 'pack', qtyInput: 3 }], // 3 packs = 15 units
        paymentMode: 'upi',
        date: '2026-11-12',
      },
      CASHIER_USER,
      { today: '2026-11-12' }
    );

    expect(await batchStock(earlyBatchId)).toBe(0);
    expect(await batchStock(lateBatchId)).toBe(15);

    const firstBillItem = sale.billItems[0]; // batchId = earlyBatchId, qtyUnits = 10
    const secondBillItem = sale.billItems[1]; // batchId = lateBatchId, qtyUnits = 5

    // Partial return: 4 units from firstBillItem
    const ret1 = await processBillReturn(
      {
        originalBillId: sale.billId,
        items: [{ billItemId: firstBillItem.id!, returnUnits: 4 }],
        refundMode: 'cash',
        reason: 'Customer bought extra',
      },
      OWNER_USER
    );

    expect(ret1.newBillStatus).toBe('returned_partial');
    expect(ret1.returnNo).toBe('RET-2026-27/0001');
    // Stock restored specifically to earlyBatchId
    expect(await batchStock(earlyBatchId)).toBe(4);
    expect(await batchStock(lateBatchId)).toBe(15);

    const billAfterRet1 = await db.bills.get(sale.billId);
    expect(billAfterRet1?.status).toBe('returned_partial');

    // Attempt over-returning: firstBillItem sold 10, 4 already returned -> only 6 left. Trying 7 must reject!
    await expect(
      processBillReturn(
        {
          originalBillId: sale.billId,
          items: [{ billItemId: firstBillItem.id!, returnUnits: 7 }],
          refundMode: 'cash',
          reason: 'Invalid extra',
        },
        OWNER_USER
      )
    ).rejects.toThrow('return_exceeds_sold');

    // Remaining stock unchanged after failed return
    expect(await batchStock(earlyBatchId)).toBe(4);

    // Return remaining 6 of firstBillItem and all 5 of secondBillItem -> full return
    const ret2 = await processBillReturn(
      {
        originalBillId: sale.billId,
        items: [
          { billItemId: firstBillItem.id!, returnUnits: 6 },
          { billItemId: secondBillItem.id!, returnUnits: 5 },
        ],
        refundMode: 'udhaar_adjust',
        reason: 'Doctor changed prescription',
      },
      OWNER_USER
    );

    expect(ret2.newBillStatus).toBe('returned_full');
    expect(ret2.returnNo).toBe('RET-2026-27/0002');
    expect(await batchStock(earlyBatchId)).toBe(10);
    expect(await batchStock(lateBatchId)).toBe(20);

    const billAfterRet2 = await db.bills.get(sale.billId);
    expect(billAfterRet2?.status).toBe('returned_full');

    const auditReturns = await db.auditLog.where('action').equals('bill_returned').toArray();
    expect(auditReturns).toHaveLength(2);
  });

  it('finds in-stock non-expired composition substitutes and generates Indian FY bill numbers', async () => {
    expect(getIndianFinancialYear('2026-03-31')).toBe('2025-26');
    expect(getIndianFinancialYear('2026-04-01')).toBe('2026-27');
    expect(getIndianFinancialYear('2027-02-15')).toBe('2026-27');

    // Target medicine: Crocin (out of stock, salt = Paracetamol)
    const target = await seedMedicineWithBatch(
      { name: 'Crocin 650', salt: 'Paracetamol', shortCode: 'C1', shelf: 'S-01' },
      []
    );
    // Substitute 1: Dolo 650 (in stock, valid expiry, salt = Paracetamol)
    await seedMedicineWithBatch(
      { name: 'Dolo 650', salt: 'paracetamol ', shortCode: 'D1', shelf: 'S-02', mrpPaise: 3400 },
      [{ batchNo: 'D-1', expiry: '2027-05-31', qtyUnits: 25 }]
    );
    // Substitute 2: Calpol 650 (only expired stock, should NOT appear)
    await seedMedicineWithBatch(
      { name: 'Calpol 650', salt: 'Paracetamol', shortCode: 'C2', shelf: 'S-03' },
      [{ batchNo: 'C-EXP', expiry: '2026-01-31', qtyUnits: 40 }]
    );
    // Non-substitute: Pan 40 (different salt)
    await seedMedicineWithBatch(
      { name: 'Pan 40', salt: 'Pantoprazole', shortCode: 'P2', shelf: 'S-04' },
      [{ batchNo: 'P-1', expiry: '2027-08-31', qtyUnits: 30 }]
    );

    const subs = await findInStockSubstitutes(target.medicineId, '2026-11-12');
    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe('Dolo 650');
    expect(subs[0].stockUnits).toBe(25);
    expect(subs[0].shelf).toBe('S-02');
    expect(subs[0].mrpPaise).toBe(3400);

    // Bill numbering check for FY
    const next1 = await generateNextBillNo('2026-11-12');
    expect(next1).toEqual({ billNo: '2026-27/0001', financialYear: '2026-27' });
  });
});

