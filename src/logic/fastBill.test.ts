import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Medicine } from '../db';
import {
  resolveScanCode,
  getTopSellingMedicines,
  calculateFastBillTotals,
  buildFastBillDraft,
  type FastBillCartItem,
} from './fastBill';

async function seedMedicine(
  overrides: Partial<Medicine> = {},
  batches: Array<{ batchNo: string; expiry: string; qtyUnits: number; purchaseRatePaise?: number; mrpPaise?: number }> = []
): Promise<{ medicineId: number; batchIds: number[] }> {
  const medId = Number(
    await db.medicines.add({
      name: 'Test Medicine',
      strength: '500mg',
      form: 'Tablet',
      salt: 'Test Salt',
      company: 'Test Pharma',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 3200,
      unitsPerPack: 10,
      shortCode: 'T1',
      barcode: '890100000001',
      shelf: 'S-01',
      scheduleType: 'none',
      minStockUnits: 10,
      active: true,
      ...overrides,
    })
  );

  const batchIds: number[] = [];
  for (const b of batches) {
    const batchId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: b.batchNo,
        expiry: b.expiry,
        purchaseRatePaise: b.purchaseRatePaise ?? 2000,
        mrpPaise: b.mrpPaise ?? (overrides.mrpPaise ?? 3200),
        shelf: overrides.shelf ?? 'S-01',
        createdAt: new Date().toISOString(),
      })
    );
    batchIds.push(batchId);

    if (b.qtyUnits > 0) {
      await db.stockMovements.add({
        batchId,
        medicineId: medId,
        type: 'purchase',
        qtyUnits: b.qtyUnits,
        reference: 'test',
        who: 'system',
        at: new Date().toISOString(),
      });
    }
  }

  return { medicineId: medId, batchIds };
}

describe('Fast Bill Logic Engine', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('resolves exact barcode match with valid stock and earliest batch', async () => {
    await seedMedicine(
      {
        name: 'Crocin Advance 500',
        barcode: '8901234567890',
        shortCode: 'C1',
        shelf: 'S-04',
      },
      [
        { batchNo: 'B1', expiry: '2027-10', qtyUnits: 50 },
        { batchNo: 'B2', expiry: '2027-05', qtyUnits: 30 }, // earlier expiry
      ]
    );

    const res = await resolveScanCode('8901234567890', '2026-11-13');
    expect(res.kind).toBe('matched');
    if (res.kind === 'matched') {
      expect(res.medicine.name).toBe('Crocin Advance 500');
      expect(res.availableUnits).toBe(80);
      expect(res.batch.batchNo).toBe('B2'); // FEFO
      expect(res.isScheduleH).toBe(false);
    }
  });

  it('resolves case-insensitive shortCode and flags Schedule H', async () => {
    await seedMedicine(
      {
        name: 'Azithral 500',
        unitsPerPack: 3,
        mrpPaise: 11900,
        shortCode: 'A5',
        shelf: 'A-12',
        scheduleType: 'H',
      },
      [{ batchNo: 'AZ-01', expiry: '2028-01', qtyUnits: 30 }]
    );

    const res = await resolveScanCode('a5', '2026-11-13');
    expect(res.kind).toBe('matched');
    if (res.kind === 'matched') {
      expect(res.medicine.name).toBe('Azithral 500');
      expect(res.isScheduleH).toBe(true);
    }
  });

  it('handles special runner commands NEXT, UNDO, CANCEL', async () => {
    expect(await resolveScanCode('NEXT')).toEqual({ kind: 'special', command: 'next_bill' });
    expect(await resolveScanCode('next_bill')).toEqual({ kind: 'special', command: 'next_bill' });
    expect(await resolveScanCode('UNDO')).toEqual({ kind: 'special', command: 'undo' });
    expect(await resolveScanCode('CANCEL')).toEqual({ kind: 'special', command: 'cancel_bill' });
  });

  it('handles out of stock with composition substitutes', async () => {
    await seedMedicine(
      {
        name: 'Azithral 500',
        salt: 'Azithromycin 500mg',
        shortCode: 'AZ1',
      },
      [] // 0 stock
    );

    await seedMedicine(
      {
        name: 'Azee 500',
        salt: 'Azithromycin 500mg',
        shortCode: 'AZ2',
        shelf: 'S-02',
      },
      [{ batchNo: 'AZ2-B1', expiry: '2028-05', qtyUnits: 30 }]
    );

    const res = await resolveScanCode('AZ1', '2026-11-13');
    expect(res.kind).toBe('out_of_stock');
    if (res.kind === 'out_of_stock') {
      expect(res.medicine.name).toBe('Azithral 500');
      expect(res.substitutes.length).toBe(1);
      expect(res.substitutes[0].name).toBe('Azee 500');
      expect(res.substitutes[0].stockUnits).toBe(30);
    }
  });

  it('returns not_found for unknown scan codes', async () => {
    const res = await resolveScanCode('UNKNOWN_CODE_999');
    expect(res.kind).toBe('not_found');
    if (res.kind === 'not_found') {
      expect(res.code).toBe('UNKNOWN_CODE_999');
    }
  });

  it('ranks top selling medicines by units sold and calculates non-expired stock', async () => {
    const { medicineId: medA } = await seedMedicine(
      { name: 'Pan 40', unitsPerPack: 10, mrpPaise: 7800 },
      [{ batchNo: 'PN1', expiry: '2028-01', qtyUnits: 100 }]
    );
    const { medicineId: medB } = await seedMedicine(
      { name: 'Dolo 650', unitsPerPack: 15, mrpPaise: 3200 },
      [{ batchNo: 'DL1', expiry: '2028-01', qtyUnits: 100 }]
    );

    // Med B sold 100 units, Med A sold 20 units
    await db.billItems.bulkAdd([
      {
        billId: 1,
        medicineId: medB,
        batchId: 1,
        medicineName: 'Dolo 650',
        batchNo: 'DL1',
        expiry: '2028-01',
        qtyUnits: 100,
        unitMode: 'pack',
        qtyInput: 6,
        unitsPerPack: 15,
        mrpPaise: 3200,
        unitPricePaise: 3200,
        discountPaise: 0,
        gstPercent: 12,
        taxablePaise: 2800,
        gstPaise: 336,
        lineTotalPaise: 3136,
        isScheduleH: false,
        patientName: '',
        doctorName: '',
        prescriptionChecked: false,
      },
      {
        billId: 1,
        medicineId: medA,
        batchId: 2,
        medicineName: 'Pan 40',
        batchNo: 'PN1',
        expiry: '2028-01',
        qtyUnits: 20,
        unitMode: 'pack',
        qtyInput: 2,
        unitsPerPack: 10,
        mrpPaise: 7800,
        unitPricePaise: 7800,
        discountPaise: 0,
        gstPercent: 12,
        taxablePaise: 7000,
        gstPaise: 840,
        lineTotalPaise: 7840,
        isScheduleH: false,
        patientName: '',
        doctorName: '',
        prescriptionChecked: false,
      },
    ]);

    const top = await getTopSellingMedicines(10, '2026-11-13');
    expect(top.length).toBe(2);
    expect(top[0].name).toBe('Dolo 650');
    expect(top[0].totalUnitsSold).toBe(100);
    expect(top[1].name).toBe('Pan 40');
    expect(top[1].totalUnitsSold).toBe(20);
  });

  it('calculates fast bill totals with nearest rupee rounding', () => {
    const items: FastBillCartItem[] = [
      {
        id: '1',
        medicineId: 1,
        medicineName: 'Dolo 650',
        batchId: 1,
        batchNo: 'B1',
        expiry: '2027-10',
        mrpPaise: 3240,
        unitsPerPack: 10,
        unitType: 'strip',
        quantity: 1,
        qtyUnits: 10,
        lineTotalPaise: 3240,
      },
      {
        id: '2',
        medicineId: 2,
        medicineName: 'Limcee',
        batchId: 2,
        batchNo: 'B2',
        expiry: '2027-12',
        mrpPaise: 2280,
        unitsPerPack: 15,
        unitType: 'strip',
        quantity: 1,
        qtyUnits: 15,
        lineTotalPaise: 2280,
      },
    ];

    const totals = calculateFastBillTotals(items);
    expect(totals.subtotalPaise).toBe(5520);
    expect(totals.roundOffPaise).toBe(-20);
    expect(totals.totalPaise).toBe(5500);
    expect(totals.itemCount).toBe(2);
  });

  it('builds a valid BillDraft ready for finalizeBill', () => {
    const items: FastBillCartItem[] = [
      {
        id: '1',
        medicineId: 10,
        medicineName: 'Azithral 500',
        batchId: 1,
        batchNo: 'AZ',
        expiry: '2027-10',
        mrpPaise: 11900,
        unitsPerPack: 3,
        unitType: 'strip',
        quantity: 2,
        qtyUnits: 6,
        lineTotalPaise: 23800,
        isScheduleH: true,
        rxVerified: true,
        patientName: 'Ramesh',
        doctorName: 'Dr. Gupta',
      },
    ];

    const draft = buildFastBillDraft(items, 'cash', 23800);
    expect(draft.paymentMode).toBe('cash');
    expect(draft.cashReceivedPaise).toBe(23800);
    expect(draft.lines.length).toBe(1);
    expect(draft.lines[0].medicineId).toBe(10);
    expect(draft.lines[0].qtyInput).toBe(2);
    expect(draft.lines[0].prescriptionChecked).toBe(true);
    expect(draft.lines[0].patientName).toBe('Ramesh');
  });
});
