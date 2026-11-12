import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { batchStock, medicineStock } from './stock';
import {
  applyStockCorrection,
  evaluateStockCorrectionRule,
  getStockCorrectionApprovalRule,
} from './stockCorrection';
import { DEFAULT_APPROVAL_RULES } from './approvals';

describe('stockCorrection.ts', () => {
  let medicineId: number;
  let batchId: number;

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();

    medicineId = (await db.medicines.add({
      name: 'Crocin',
      strength: '500mg',
      form: 'tablet',
      salt: 'Paracetamol',
      company: 'GSK',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 3000,
      unitsPerPack: 15,
      shortCode: 'C1',
      barcode: '8901234567890',
      shelf: 'S-04',
      scheduleType: 'none',
      minStockUnits: 15,
      active: true,
    })) as number;

    batchId = (await db.batches.add({
      medicineId,
      batchNo: 'B2231',
      expiry: '2027-08-31',
      purchaseRatePaise: 2150,
      mrpPaise: 3000,
      shelf: 'S-04',
    })) as number;

    await db.stockMovements.add({
      batchId,
      medicineId,
      type: 'purchase',
      qtyUnits: 30,
      reference: 'Purchase Invoice: INV-100',
      who: 'Owner',
      at: '2026-01-01T10:00:00.000Z',
    });
  });

  it('appends negative and positive correction movements and updates batchStock & medicineStock', async () => {
    const initialMovementsCount = await db.stockMovements.count();
    expect(await batchStock(batchId)).toBe(30);
    expect(await medicineStock(medicineId)).toBe(30);

    // Reduce by 7 units (damaged)
    const reduceRes = await applyStockCorrection({
      medicineId,
      medicineName: 'Crocin',
      batchId,
      batchNo: 'B2231',
      direction: 'reduce',
      deltaUnits: 7,
      reasonCode: 'damaged',
      note: 'blister torn',
      user: { name: 'Raju', role: 'cashier' },
    });

    expect(reduceRes.ok).toBe(true);
    if (reduceRes.ok) {
      expect(reduceRes.signedDelta).toBe(-7);
      expect(reduceRes.newBatchStock).toBe(23);
    }
    expect(await batchStock(batchId)).toBe(23);
    expect(await medicineStock(medicineId)).toBe(23);

    // Add 4 units (count mismatch found extra)
    const addRes = await applyStockCorrection({
      medicineId,
      medicineName: 'Crocin',
      batchId,
      batchNo: 'B2231',
      direction: 'add',
      deltaUnits: 4,
      reasonCode: 'count_mismatch',
      user: { name: 'Sunil', role: 'owner' },
    });

    expect(addRes.ok).toBe(true);
    if (addRes.ok) {
      expect(addRes.signedDelta).toBe(4);
      expect(addRes.newBatchStock).toBe(27);
    }
    expect(await batchStock(batchId)).toBe(27);
    expect(await medicineStock(medicineId)).toBe(27);

    // Existing movement is untouched; 2 new 'correction' movements were appended
    const allMovements = await db.stockMovements.toArray();
    expect(allMovements).toHaveLength(initialMovementsCount + 2);
    expect(allMovements[0].type).toBe('purchase');
    expect(allMovements[0].qtyUnits).toBe(30);
    expect(allMovements[1].type).toBe('correction');
    expect(allMovements[1].qtyUnits).toBe(-7);
    expect(allMovements[2].type).toBe('correction');
    expect(allMovements[2].qtyUnits).toBe(4);
  });

  it('rejects reducing stock below 0 without writing any movement or audit entry', async () => {
    const beforeMovements = await db.stockMovements.count();
    const beforeAudits = await db.auditLog.count();

    const res = await applyStockCorrection({
      medicineId,
      medicineName: 'Crocin',
      batchId,
      batchNo: 'B2231',
      direction: 'reduce',
      deltaUnits: 31, // Batch only has 30
      reasonCode: 'lost',
      user: { name: 'Raju', role: 'cashier' },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('insufficient_stock');
      expect(res.availableUnits).toBe(30);
    }

    expect(await batchStock(batchId)).toBe(30);
    expect(await db.stockMovements.count()).toBe(beforeMovements);
    expect(await db.auditLog.count()).toBe(beforeAudits);
  });

  it('records stock_correction audit entry in English without PIN or purchase price data', async () => {
    const res = await applyStockCorrection({
      medicineId,
      medicineName: 'Crocin',
      batchId,
      batchNo: 'B2231',
      direction: 'reduce',
      deltaUnits: 5,
      reasonCode: 'lost',
      note: 'missing from shelf',
      user: { name: 'Raju', role: 'cashier' },
    });

    expect(res.ok).toBe(true);

    const audits = await db.auditLog.toArray();
    expect(audits).toHaveLength(1);
    const entry = audits[0];

    expect(entry.action).toBe('stock_correction');
    expect(entry.who).toBe('Raju (cashier)');
    expect(entry.record).toBe('Crocin (B2231)');
    expect(entry.details).toContain('Crocin');
    expect(entry.details).toContain('B2231');
    expect(entry.details).toContain('-5 units');
    expect(entry.details).toContain('Lost / Missing - missing from shelf');

    // Never leaks PIN or purchase rate (2150 paise / Rs 21.50)
    expect(entry.details.toLowerCase()).not.toContain('pin');
    expect(entry.details).not.toContain('2150');
    expect(entry.details).not.toContain('21.5');
    expect(entry.details.toLowerCase()).not.toContain('price');
    expect(entry.details.toLowerCase()).not.toContain('rate');
  });

  it('respects blocked_offline vs local_pin approval rules', async () => {
    // Default rule (when nothing saved) is blocked_offline
    const defaultRule = await getStockCorrectionApprovalRule();
    expect(defaultRule).toBe('blocked_offline');
    expect(evaluateStockCorrectionRule(defaultRule)).toEqual({
      allowed: false,
      requiresPin: false,
      blocked: true,
    });

    // Explicitly saved as blocked_offline
    await db.settings.put({
      key: 'approval_rules',
      value: { ...DEFAULT_APPROVAL_RULES, stock_correction: 'blocked_offline' },
    });
    const blockedRule = await getStockCorrectionApprovalRule();
    expect(blockedRule).toBe('blocked_offline');
    expect(evaluateStockCorrectionRule(blockedRule).blocked).toBe(true);

    // Explicitly saved as local_pin (Approval PIN)
    await db.settings.put({
      key: 'approval_rules',
      value: { ...DEFAULT_APPROVAL_RULES, stock_correction: 'local_pin' },
    });
    const pinRule = await getStockCorrectionApprovalRule();
    expect(pinRule).toBe('local_pin');
    expect(evaluateStockCorrectionRule(pinRule)).toEqual({
      allowed: true,
      requiresPin: true,
      blocked: false,
    });
  });
});

