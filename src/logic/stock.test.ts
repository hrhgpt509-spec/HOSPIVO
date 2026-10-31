import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  formatExpiryToLastDay,
  isExpired,
  expiryBucket,
  batchStock,
  medicineStock,
  pickBatchesForSale,
  shortCodeFor,
  recordPurchaseLineStock,
  recordStockCorrection,
  findDuplicateMedicines,
  lowStock,
} from './stock';

describe('stock.ts stock and inventory foundation tests', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('formats month and year to the last day of the entered month', () => {
    expect(formatExpiryToLastDay('08/2027')).toBe('2027-08-31');
    expect(formatExpiryToLastDay('02/2028')).toBe('2028-02-29'); // Leap year
    expect(formatExpiryToLastDay('02/2027')).toBe('2027-02-28'); // Non-leap year
    expect(formatExpiryToLastDay('2027-08')).toBe('2027-08-31');
    expect(formatExpiryToLastDay('2027-08-31')).toBe('2027-08-31');
  });

  it('expiryBucket gives the right bucket for 29, 31, 59, 61, 89, 91 days and expired', () => {
    const today = '2027-01-01';

    // Expired
    expect(expiryBucket({ expiry: '2026-12-31' }, today)).toBe('expired');

    // 29 days remaining
    expect(expiryBucket({ expiry: '2027-01-30' }, today)).toBe('30');

    // 31 days remaining
    expect(expiryBucket({ expiry: '2027-02-01' }, today)).toBe('60');

    // 59 days remaining
    expect(expiryBucket({ expiry: '2027-03-01' }, today)).toBe('60');

    // 61 days remaining
    expect(expiryBucket({ expiry: '2027-03-03' }, today)).toBe('90');

    // 89 days remaining
    expect(expiryBucket({ expiry: '2027-03-31' }, today)).toBe('90');

    // 91 days remaining
    expect(expiryBucket({ expiry: '2027-04-02' }, today)).toBe('none');
  });

  it('isExpired correctly determines expiry strictly after the last day', () => {
    const batch = { expiry: '2027-08-31' };
    // On the last day of the month it is NOT expired (valid through 31 Aug 2027)
    expect(isExpired(batch, '2027-08-31')).toBe(false);
    // On the day after, it is expired
    expect(isExpired(batch, '2027-09-01')).toBe(true);
  });

  it('short codes are unique and increment by running number', async () => {
    expect(await shortCodeFor('Crocin', [])).toBe('C1');
    expect(await shortCodeFor('Crocin', ['C1', 'C2'])).toBe('C3');
    expect(await shortCodeFor('Dolo', ['D1', 'D4'])).toBe('D5');
    expect(await shortCodeFor('Amoxicillin', ['A1', 'C1'])).toBe('A2');
  });

  it('earliest-expiry batch is picked first', async () => {
    const medId = Number(
      await db.medicines.add({
        name: 'Paracetamol',
        strength: '500mg',
        form: 'tablet',
        salt: 'Paracetamol',
        company: 'Cipla',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3000,
        unitsPerPack: 10,
        shortCode: 'P1',
        barcode: '123456',
        shelf: 'S-01',
        scheduleType: 'none',
        minStockUnits: 20,
        active: true,
      })
    );

    // Batch 1 expires later (2027-11-30)
    const b1Id = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'B-LATER',
        expiry: '2027-11-30',
        purchaseRatePaise: 2000,
        mrpPaise: 3000,
        shelf: 'S-01',
      })
    );
    await db.stockMovements.add({
      batchId: b1Id,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 50,
      reference: 'INV-1',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    // Batch 2 expires sooner (2027-05-31)
    const b2Id = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'B-SOONER',
        expiry: '2027-05-31',
        purchaseRatePaise: 2000,
        mrpPaise: 3000,
        shelf: 'S-01',
      })
    );
    await db.stockMovements.add({
      batchId: b2Id,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 50,
      reference: 'INV-2',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    const result = await pickBatchesForSale(medId, 30, '2027-01-01');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allocations.length).toBe(1);
      // Sooner expiring batch was chosen first
      expect(result.allocations[0].batch.batchNo).toBe('B-SOONER');
      expect(result.allocations[0].qtyUnits).toBe(30);
    }
  });

  it('an expired batch is never picked', async () => {
    const medId = Number(
      await db.medicines.add({
        name: 'Azithromycin',
        strength: '500mg',
        form: 'tablet',
        salt: 'Azithromycin',
        company: 'Cipla',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 12000,
        unitsPerPack: 5,
        shortCode: 'A1',
        barcode: '789012',
        shelf: 'S-02',
        scheduleType: 'H',
        minStockUnits: 10,
        active: true,
      })
    );

    // Batch Expired (2026-12-31)
    const expBatchId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'B-EXPIRED',
        expiry: '2026-12-31',
        purchaseRatePaise: 8000,
        mrpPaise: 12000,
        shelf: 'S-02',
      })
    );
    await db.stockMovements.add({
      batchId: expBatchId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 100,
      reference: 'INV-OLD',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    // Batch Valid (2027-10-31)
    const validBatchId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'B-VALID',
        expiry: '2027-10-31',
        purchaseRatePaise: 8000,
        mrpPaise: 12000,
        shelf: 'S-02',
      })
    );
    await db.stockMovements.add({
      batchId: validBatchId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 20,
      reference: 'INV-NEW',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    // Request 15 units on 2027-01-01
    const result = await pickBatchesForSale(medId, 15, '2027-01-01');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allocations.length).toBe(1);
      expect(result.allocations[0].batch.batchNo).toBe('B-VALID');
      expect(result.allocations[0].qtyUnits).toBe(15);
    }

    // Requesting more than the valid batch (e.g. 25 units) fails even though expired has 100
    const failResult = await pickBatchesForSale(medId, 25, '2027-01-01');
    expect(failResult.ok).toBe(false);
    if (!failResult.ok) {
      expect(failResult.availableUnits).toBe(20);
      expect(failResult.requestedUnits).toBe(25);
    }
  });

  it('a sale is split across two batches when needed', async () => {
    const medId = 100;

    const b1Id = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'BATCH-1',
        expiry: '2027-04-30',
        purchaseRatePaise: 1000,
        mrpPaise: 1500,
        shelf: 'S-01',
      })
    );
    await db.stockMovements.add({
      batchId: b1Id,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 20,
      reference: 'INV-1',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    const b2Id = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'BATCH-2',
        expiry: '2027-08-31',
        purchaseRatePaise: 1000,
        mrpPaise: 1500,
        shelf: 'S-01',
      })
    );
    await db.stockMovements.add({
      batchId: b2Id,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 50,
      reference: 'INV-2',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    const result = await pickBatchesForSale(medId, 35, '2027-01-01');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allocations.length).toBe(2);
      expect(result.allocations[0].batch.batchNo).toBe('BATCH-1');
      expect(result.allocations[0].qtyUnits).toBe(20);
      expect(result.allocations[1].batch.batchNo).toBe('BATCH-2');
      expect(result.allocations[1].qtyUnits).toBe(15);
      expect(result.totalAllocatedUnits).toBe(35);
    }
  });

  it('selling more than stock is refused without negative stock', async () => {
    const medId = 200;
    const bId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'BATCH-ONLY',
        expiry: '2027-06-30',
        purchaseRatePaise: 1000,
        mrpPaise: 1500,
        shelf: 'S-01',
      })
    );
    await db.stockMovements.add({
      batchId: bId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 15,
      reference: 'INV-1',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    const result = await pickBatchesForSale(medId, 25, '2027-01-01');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('insufficient_stock');
      expect(result.availableUnits).toBe(15);
      expect(result.requestedUnits).toBe(25);
    }
  });

  it('free packs add to stock in smallest units', async () => {
    const medId = 300;
    const bId = 301;
    // 10 packs purchased + 2 free packs; 10 units per pack = 120 units
    await recordPurchaseLineStock(medId, bId, 10, 2, 10, 'INV-99', 'Owner');

    const stock = await batchStock(bId);
    expect(stock).toBe(120);

    const medStock = await medicineStock(medId);
    expect(medStock).toBe(120);
  });

  it('a correction does not edit old movements and appends a new record', async () => {
    const medId = 400;
    const bId = 401;

    // Movement 1: purchase 50 units
    const m1 = Number(
      await db.stockMovements.add({
        batchId: bId,
        medicineId: medId,
        type: 'purchase',
        qtyUnits: 50,
        reference: 'INV-INITIAL',
        who: 'Owner',
        at: new Date().toISOString(),
      })
    );

    // Record correction: 5 units damaged -> -5
    const correctionMovement = await recordStockCorrection(
      bId,
      medId,
      -5,
      '5 loose tablets damaged',
      'Owner'
    );

    expect(correctionMovement.qtyUnits).toBe(-5);
    expect(correctionMovement.type).toBe('correction');

    // Movement 1 still exists untouched
    const storedM1 = await db.stockMovements.get(m1);
    expect(storedM1?.qtyUnits).toBe(50);

    // Total stock reflects 45
    const finalStock = await batchStock(bId);
    expect(finalStock).toBe(45);
  });

  it('any attempt to edit or delete a stock movement fails', async () => {
    const movementId = Number(
      await db.stockMovements.add({
        batchId: 501,
        medicineId: 500,
        type: 'purchase',
        qtyUnits: 100,
        reference: 'INV-TEST',
        who: 'Owner',
        at: new Date().toISOString(),
      })
    );

    // Attempt updating must throw
    await expect(
      db.stockMovements.update(movementId, { qtyUnits: 999 })
    ).rejects.toThrow('Stock movements are append-only and cannot be updated.');

    // Attempt deleting must throw
    await expect(
      db.stockMovements.delete(movementId)
    ).rejects.toThrow('Stock movements are append-only and cannot be deleted.');
  });

  it('findDuplicateMedicines detects likely duplicates by name/strength or name/company', async () => {
    await db.medicines.add({
      name: 'Dolo',
      strength: '650mg',
      form: 'tablet',
      salt: 'Paracetamol',
      company: 'Micro Labs Ltd',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 3150,
      unitsPerPack: 15,
      shortCode: 'D1',
      barcode: '8901117002138',
      shelf: 'S-01',
      scheduleType: 'none',
      minStockUnits: 30,
      active: true,
    });

    // Exact name + strength match
    const dup1 = await findDuplicateMedicines('dolo', '650mg', 'Other Pharma');
    expect(dup1.length).toBe(1);
    expect(dup1[0].name).toBe('Dolo');

    // Name + company match
    const dup2 = await findDuplicateMedicines('DOLO', '500mg', 'Micro Labs Ltd');
    expect(dup2.length).toBe(1);

    // Completely different medicine
    const dup3 = await findDuplicateMedicines('Metformin', '500mg', 'USV Ltd');
    expect(dup3.length).toBe(0);
  });

  it('lowStock identifies medicines at or below minStockUnits', async () => {
    const medId = Number(
      await db.medicines.add({
        name: 'Cetirizine',
        strength: '10mg',
        form: 'tablet',
        salt: 'Cetirizine',
        company: 'Cipla',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 2000,
        unitsPerPack: 10,
        shortCode: 'C1',
        barcode: '998877',
        shelf: 'S-03',
        scheduleType: 'none',
        minStockUnits: 50,
        active: true,
      })
    );

    const bId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'B-CET',
        expiry: '2028-01-31',
        purchaseRatePaise: 1200,
        mrpPaise: 2000,
        shelf: 'S-03',
      })
    );

    // Stock = 30 units (below minStockUnits of 50)
    await db.stockMovements.add({
      batchId: bId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 30,
      reference: 'INV-CET',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    const lowStockItems = await lowStock();
    expect(lowStockItems.length).toBe(1);
    expect(lowStockItems[0].medicine.name).toBe('Cetirizine');
    expect(lowStockItems[0].currentStockUnits).toBe(30);
  });
});
