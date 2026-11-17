import { db, type SupplierReturn, type SupplierReturnStatus, type StockMovement } from '../db';
import { addAudit } from '../db/audit';
import { enqueueSyncItem } from './cloudSync';
import { batchStock } from './stock';

export interface CreateSupplierReturnParams {
  supplierId: number;
  supplierName: string;
  medicineId: number;
  medicineName: string;
  batchId: number;
  batchNo: string;
  expiry: string;
  qtyUnits: number;
  purchaseRatePaise: number;
  note: string;
  who: string;
}

const VALID_STATUSES: SupplierReturnStatus[] = ['pending', 'sent', 'credit_received', 'rejected'];

/**
 * Debit note value in whole paise for a return line.
 * Purchase rate is per pack; quantity is in loose units. Result is a whole-paise integer.
 */
export function debitNotePaise(
  qtyUnits: number,
  purchaseRatePaise: number,
  unitsPerPack: number
): number {
  const upp = unitsPerPack > 0 ? unitsPerPack : 1;
  return Math.round((qtyUnits * purchaseRatePaise) / upp);
}

/**
 * Creates a supplier return: reduces batch stock via an append-only movement,
 * stores the return as 'pending', writes the audit log and queues sync.
 */
export async function createSupplierReturn(params: CreateSupplierReturnParams): Promise<number> {
  const { qtyUnits, purchaseRatePaise } = params;

  if (!Number.isInteger(qtyUnits) || qtyUnits <= 0) {
    throw new Error('Return quantity must be a whole number above zero');
  }
  if (!Number.isInteger(purchaseRatePaise) || purchaseRatePaise < 0) {
    throw new Error('Purchase rate must be whole paise');
  }

  const now = new Date().toISOString();

  const { returnId, record, movement, movementId } = await db.transaction(
    'rw',
    [db.supplierReturns, db.stockMovements, db.auditLog, db.batches],
    async () => {
      const batch = await db.batches.get(params.batchId);
      if (!batch || batch.medicineId !== params.medicineId) {
        throw new Error('Batch not found');
      }
      const available = await batchStock(params.batchId);
      if (qtyUnits > available) {
        throw new Error('Not enough stock in this batch');
      }

      const rec: SupplierReturn = {
        supplierId: params.supplierId,
        supplierName: params.supplierName,
        medicineId: params.medicineId,
        medicineName: params.medicineName,
        batchId: params.batchId,
        batchNo: params.batchNo,
        expiry: params.expiry,
        qtyUnits,
        purchaseRatePaise,
        status: 'pending',
        note: params.note,
        createdAt: now,
        updatedAt: now,
      };
      const id = (await db.supplierReturns.add(rec)) as number;

      const mov: StockMovement = {
        batchId: params.batchId,
        medicineId: params.medicineId,
        type: 'supplier_return',
        qtyUnits: -qtyUnits,
        reference: `supplier_return:${id}`,
        who: params.who,
        at: now,
      };
      const movId = (await db.stockMovements.add(mov)) as number;

      await addAudit(
        params.who,
        'supplier_return_created',
        `supplier_return:${id}`,
        `supplierId=${params.supplierId};batchId=${params.batchId};qtyUnits=${qtyUnits}`
      );

      return { returnId: id, record: { ...rec, id }, movement: mov, movementId: movId };
    }
  );

  enqueueSyncItem('stock_movement', movementId, {
    ...movement,
    id: movementId,
    supplierReturn: record,
  }).catch(() => {});

  return returnId;
}

/**
 * Moves a supplier return to a new status. Stock is not touched.
 */
export async function updateSupplierReturnStatus(
  returnId: number,
  status: SupplierReturnStatus,
  who: string
): Promise<void> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid status');
  }

  const updated = await db.transaction('rw', [db.supplierReturns, db.auditLog], async () => {
    const existing = await db.supplierReturns.get(returnId);
    if (!existing) {
      throw new Error('Supplier return not found');
    }
    const next: SupplierReturn = { ...existing, status, updatedAt: new Date().toISOString() };
    await db.supplierReturns.put(next);
    await addAudit(
      who,
      'supplier_return_status',
      `supplier_return:${returnId}`,
      `from=${existing.status};to=${status}`
    );
    return next;
  });

  enqueueSyncItem('stock_movement', `supplier_return_${returnId}`, {
    supplierReturn: updated,
  }).catch(() => {});
}

/**
 * Totals in whole paise. Pending = not yet credited ('pending' + 'sent').
 * Rejected returns count in neither total. count = all returns in scope.
 */
export async function getSupplierReturnsSummary(
  supplierId?: number
): Promise<{ totalPendingPaise: number; totalCreditReceivedPaise: number; count: number }> {
  const rows =
    supplierId === undefined
      ? await db.supplierReturns.toArray()
      : await db.supplierReturns.where('supplierId').equals(supplierId).toArray();

  const meds = await db.medicines.bulkGet([...new Set(rows.map((r) => r.medicineId))]);
  const uppById = new Map<number, number>();
  for (const m of meds) {
    if (m && m.id !== undefined) uppById.set(m.id, m.unitsPerPack);
  }

  let totalPendingPaise = 0;
  let totalCreditReceivedPaise = 0;
  for (const r of rows) {
    const value = debitNotePaise(r.qtyUnits, r.purchaseRatePaise, uppById.get(r.medicineId) ?? 1);
    if (r.status === 'pending' || r.status === 'sent') totalPendingPaise += value;
    else if (r.status === 'credit_received') totalCreditReceivedPaise += value;
  }
  return { totalPendingPaise, totalCreditReceivedPaise, count: rows.length };
}
