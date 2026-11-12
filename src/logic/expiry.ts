import {
  db,
  type Batch,
  type DBUser,
  type Medicine,
  type Purchase,
  type PurchaseLine,
  type StockMovement,
  type Supplier,
  type SupplierReturn,
  type SupplierReturnStatus,
  type UserRole,
} from '../db';
import { addAudit } from '../db/audit';
import { canSeePurchasePrice } from './roles';
import { expiryBucket, parseDateOnly } from './stock';

export type ExpiryTabBucket = '30' | '60' | '90' | 'expired';

export interface ExpiryBatchItem {
  batchId: number;
  medicineId: number;
  medicineName: string;
  medicineStrength: string;
  batchNo: string;
  expiry: string;
  expiryMonthYear: string;
  bucket: ExpiryTabBucket;
  daysRemaining: number;
  qtyUnits: number;
  unitsPerPack: number;
  packs: number;
  looseUnits: number;
  shelf: string;
  suggestedSupplierId?: number;
  suggestedSupplierName?: string;
  purchaseRatePaise?: number;
}

export interface ExpiryLossMonth {
  yearMonth: string; // YYYY-MM
  year: number;
  month: number; // 1..12
  lossPaise: number;
}

export interface ExpiryLossSummary {
  totalLossPaise: number;
  months: ExpiryLossMonth[];
}

export interface SupplierReturnView {
  id?: number;
  supplierId: number;
  supplierName: string;
  medicineId: number;
  medicineName: string;
  batchId: number;
  batchNo: string;
  expiry: string;
  expiryMonthYear: string;
  qtyUnits: number;
  unitsPerPack: number;
  status: SupplierReturnStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  purchaseRatePaise?: number;
}

export type RoleUser = DBUser | { id?: string; name?: string; role?: UserRole | string } | null | undefined;

/**
 * Formats an ISO expiry date (YYYY-MM-DD) as MM/YYYY.
 */
export function formatExpiryMonthYear(expiryStr: string): string {
  const datePart = (expiryStr || '').split('T')[0];
  const parts = datePart.split('-');
  if (parts.length >= 2 && parts[0].length === 4) {
    return `${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return expiryStr;
}

/**
 * Computes signed integer days from today to the batch's expiry date.
 * Negative values mean already expired.
 */
export function daysUntilExpiry(expiryStr: string, today?: Date | string): number {
  const todayStr = parseDateOnly(today);
  const expPart = (expiryStr || '').split('T')[0];
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const [eY, eM, eD] = expPart.split('-').map(Number);
  if (!tY || !tM || !tD || !eY || !eM || !eD) return 0;

  const tUtc = Date.UTC(tY, tM - 1, tD);
  const eUtc = Date.UTC(eY, eM - 1, eD);
  return Math.round((eUtc - tUtc) / (1000 * 60 * 60 * 24));
}

function getTwelveMonthsAgoDateStr(todayStr: string): string {
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const prevYear = tY - 1;
  const maxDayInMonth = new Date(prevYear, tM, 0).getDate();
  const clampedDay = Math.min(tD, maxDayInMonth);
  return `${prevYear}-${String(tM).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function unitsLossPaise(qtyUnits: number, purchaseRatePaise: number, unitsPerPack: number): number {
  if (qtyUnits <= 0 || purchaseRatePaise <= 0) return 0;
  const upp = Math.max(1, unitsPerPack || 1);
  return Math.round((qtyUnits * purchaseRatePaise) / upp);
}

/**
 * Builds the list of batches in the 30/60/90/expired expiry buckets that still have > 0 units in stock.
 * Strips purchaseRatePaise for non-owner users.
 */
export function buildExpiryBatchItems(params: {
  batches: Batch[];
  medicines: Medicine[];
  stockMovements: StockMovement[];
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  suppliers: Supplier[];
  user: RoleUser;
  today?: Date | string;
}): ExpiryBatchItem[] {
  const {
    batches,
    medicines,
    stockMovements,
    purchases,
    purchaseLines,
    suppliers,
    user,
    today,
  } = params;

  const showRates = canSeePurchasePrice(user);

  const medMap = new Map<number, Medicine>();
  for (const m of medicines) {
    if (m.id !== undefined) medMap.set(m.id, m);
  }

  const stockByBatch = new Map<number, number>();
  for (const mv of stockMovements) {
    stockByBatch.set(mv.batchId, (stockByBatch.get(mv.batchId) || 0) + mv.qtyUnits);
  }

  const supplierMap = new Map<number, Supplier>();
  for (const s of suppliers) {
    if (s.id !== undefined) supplierMap.set(s.id, s);
  }

  const purchaseMap = new Map<number, Purchase>();
  for (const p of purchases) {
    if (p.id !== undefined) purchaseMap.set(p.id, p);
  }

  // Index purchase lines by "medicineId::batchNoLower" keeping the latest purchase
  const latestPurchaseByMedBatch = new Map<string, Purchase>();
  for (const line of purchaseLines) {
    if (!line.purchaseId) continue;
    const purchase = purchaseMap.get(line.purchaseId);
    if (!purchase) continue;

    const key = `${line.medicineId}::${line.batchNo.trim().toLowerCase()}`;
    const existing = latestPurchaseByMedBatch.get(key);
    if (
      !existing ||
      purchase.date > existing.date ||
      (purchase.date === existing.date && (purchase.id || 0) > (existing.id || 0))
    ) {
      latestPurchaseByMedBatch.set(key, purchase);
    }
  }

  const result: ExpiryBatchItem[] = [];

  for (const batch of batches) {
    if (batch.id === undefined) continue;
    const qtyUnits = stockByBatch.get(batch.id) || 0;
    if (qtyUnits <= 0) continue;

    const bucket = expiryBucket(batch, today);
    if (bucket === 'none') continue;

    const med = medMap.get(batch.medicineId);
    if (!med) continue;

    const upp = Math.max(1, med.unitsPerPack || 1);
    const packs = Math.floor(qtyUnits / upp);
    const looseUnits = qtyUnits % upp;

    const key = `${batch.medicineId}::${batch.batchNo.trim().toLowerCase()}`;
    const matchedPurchase = latestPurchaseByMedBatch.get(key);
    const matchedSupplier = matchedPurchase
      ? supplierMap.get(matchedPurchase.supplierId)
      : undefined;

    const item: ExpiryBatchItem = {
      batchId: batch.id,
      medicineId: batch.medicineId,
      medicineName: med.name,
      medicineStrength: med.strength || '',
      batchNo: batch.batchNo,
      expiry: batch.expiry,
      expiryMonthYear: formatExpiryMonthYear(batch.expiry),
      bucket,
      daysRemaining: daysUntilExpiry(batch.expiry, today),
      qtyUnits,
      unitsPerPack: upp,
      packs,
      looseUnits,
      shelf: batch.shelf || med.shelf || '',
      suggestedSupplierId: matchedSupplier?.id,
      suggestedSupplierName: matchedSupplier?.name,
    };

    if (showRates) {
      item.purchaseRatePaise = batch.purchaseRatePaise;
    }

    result.push(item);
  }

  result.sort((a, b) => {
    const expCmp = a.expiry.localeCompare(b.expiry);
    if (expCmp !== 0) return expCmp;
    return a.medicineName.localeCompare(b.medicineName);
  });

  return result;
}

/**
 * Calculates owner-only expiry loss summary over the last 12 months
 * (expired remaining stock + expiry_writeoff stock movements valued at batch purchaseRatePaise).
 * Strictly returns null for non-owner users.
 */
export function calculateExpiryLossSummary(params: {
  batches: Batch[];
  medicines: Medicine[];
  stockMovements: StockMovement[];
  user: RoleUser;
  today?: Date | string;
}): ExpiryLossSummary | null {
  const { batches, medicines, stockMovements, user, today } = params;

  if (!canSeePurchasePrice(user)) {
    return null;
  }

  const todayStr = parseDateOnly(today);
  const startDateStr = getTwelveMonthsAgoDateStr(todayStr);

  const medMap = new Map<number, Medicine>();
  for (const m of medicines) {
    if (m.id !== undefined) medMap.set(m.id, m);
  }

  const batchMap = new Map<number, Batch>();
  for (const b of batches) {
    if (b.id !== undefined) batchMap.set(b.id, b);
  }

  const stockByBatch = new Map<number, number>();
  for (const mv of stockMovements) {
    stockByBatch.set(mv.batchId, (stockByBatch.get(mv.batchId) || 0) + mv.qtyUnits);
  }

  const lossByYearMonth = new Map<string, number>();

  const addLossForMonth = (yearMonth: string, lossPaise: number) => {
    if (!/^\d{4}-\d{2}$/.test(yearMonth) || lossPaise <= 0) return;
    lossByYearMonth.set(yearMonth, (lossByYearMonth.get(yearMonth) || 0) + lossPaise);
  };

  // 1. Unsold expired batches whose expiry fell in the last 12 months
  for (const batch of batches) {
    if (batch.id === undefined) continue;
    const qtyUnits = stockByBatch.get(batch.id) || 0;
    if (qtyUnits <= 0) continue;

    if (expiryBucket(batch, todayStr) !== 'expired') continue;
    const expDate = batch.expiry.split('T')[0];
    if (expDate < startDateStr) continue;

    const med = medMap.get(batch.medicineId);
    const upp = Math.max(1, med?.unitsPerPack || 1);
    const loss = unitsLossPaise(qtyUnits, batch.purchaseRatePaise, upp);
    addLossForMonth(expDate.slice(0, 7), loss);
  }

  // 2. Explicit expiry write-off movements in the last 12 months
  for (const mv of stockMovements) {
    if (mv.type !== 'expiry_writeoff' || mv.qtyUnits >= 0) continue;
    const mvDate = (mv.at || '').split('T')[0];
    if (mvDate < startDateStr || mvDate > todayStr) continue;

    const batch = batchMap.get(mv.batchId);
    if (!batch) continue;
    const med = medMap.get(mv.medicineId);
    const upp = Math.max(1, med?.unitsPerPack || 1);
    const loss = unitsLossPaise(Math.abs(mv.qtyUnits), batch.purchaseRatePaise, upp);
    addLossForMonth(mvDate.slice(0, 7), loss);
  }

  const months: ExpiryLossMonth[] = Array.from(lossByYearMonth.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([yearMonth, lossPaise]) => {
      const [yStr, mStr] = yearMonth.split('-');
      return {
        yearMonth,
        year: Number(yStr),
        month: Number(mStr),
        lossPaise,
      };
    });

  const totalLossPaise = months.reduce((acc, m) => acc + m.lossPaise, 0);

  return { totalLossPaise, months };
}

/**
 * Sanitizes SupplierReturn records for view display, omitting purchaseRatePaise for counter staff.
 */
export function formatSupplierReturnViews(
  returns: SupplierReturn[],
  medicines: Medicine[],
  user: RoleUser
): SupplierReturnView[] {
  const showRates = canSeePurchasePrice(user);
  const medMap = new Map<number, Medicine>();
  for (const m of medicines) {
    if (m.id !== undefined) medMap.set(m.id, m);
  }

  return [...returns]
    .sort((a, b) => {
      const cmp = (b.createdAt || '').localeCompare(a.createdAt || '');
      if (cmp !== 0) return cmp;
      return (b.id || 0) - (a.id || 0);
    })
    .map((r) => {
      const med = medMap.get(r.medicineId);
      const view: SupplierReturnView = {
        id: r.id,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        medicineId: r.medicineId,
        medicineName: r.medicineName,
        batchId: r.batchId,
        batchNo: r.batchNo,
        expiry: r.expiry,
        expiryMonthYear: formatExpiryMonthYear(r.expiry),
        qtyUnits: r.qtyUnits,
        unitsPerPack: Math.max(1, med?.unitsPerPack || 1),
        status: r.status,
        note: r.note,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
      if (showRates) {
        view.purchaseRatePaise = r.purchaseRatePaise;
      }
      return view;
    });
}

/**
 * Loads all data needed by the Expiry & Supplier Returns screen.
 */
export async function loadExpiryDashboardData(user: RoleUser, today?: Date | string) {
  const [batches, medicines, stockMovements, purchases, purchaseLines, suppliers, supplierReturns] =
    await Promise.all([
      db.batches.toArray(),
      db.medicines.toArray(),
      db.stockMovements.toArray(),
      db.purchases.toArray(),
      db.purchaseLines.toArray(),
      db.suppliers.orderBy('name').toArray(),
      db.supplierReturns.toArray(),
    ]);

  const items = buildExpiryBatchItems({
    batches,
    medicines,
    stockMovements,
    purchases,
    purchaseLines,
    suppliers,
    user,
    today,
  });

  const lossSummary = calculateExpiryLossSummary({
    batches,
    medicines,
    stockMovements,
    user,
    today,
  });

  const returns = formatSupplierReturnViews(supplierReturns, medicines, user);

  return {
    items,
    lossSummary,
    returns,
    suppliers,
  };
}

export interface CreateSupplierReturnInput {
  batchId: number;
  supplierId: number;
  qtyUnits: number;
  note?: string;
  actorName: string;
}

/**
 * Creates a supplier return atomically in one Dexie transaction:
 * 1. Inserts supplierReturn with status 'pending'
 * 2. Appends negative 'supplier_return' movement in stockMovements
 * 3. Logs fixed English audit entry 'supplier_return_created' without purchase rates
 */
export async function createSupplierReturn(
  input: CreateSupplierReturnInput
): Promise<SupplierReturn> {
  const qtyUnits = Math.floor(input.qtyUnits);
  if (!Number.isFinite(qtyUnits) || qtyUnits <= 0) {
    throw new Error('Return quantity must be at least 1 unit');
  }
  if (!input.supplierId || input.supplierId <= 0) {
    throw new Error('Supplier must be selected');
  }

  return await db.transaction(
    'rw',
    [db.batches, db.medicines, db.suppliers, db.stockMovements, db.supplierReturns, db.auditLog],
    async () => {
      const batch = await db.batches.get(input.batchId);
      if (!batch || batch.id === undefined) {
        throw new Error('Batch not found');
      }

      const medicine = await db.medicines.get(batch.medicineId);
      if (!medicine || medicine.id === undefined) {
        throw new Error('Medicine not found');
      }

      const supplier = await db.suppliers.get(input.supplierId);
      if (!supplier || supplier.id === undefined) {
        throw new Error('Supplier not found');
      }

      const movements = await db.stockMovements.where('batchId').equals(batch.id).toArray();
      const availableUnits = movements.reduce((acc, m) => acc + m.qtyUnits, 0);
      if (qtyUnits > availableUnits) {
        throw new Error('Return quantity exceeds available batch stock');
      }

      const now = new Date().toISOString();
      const note = (input.note || '').trim();
      const actor = (input.actorName || 'User').trim() || 'User';

      const newReturn: SupplierReturn = {
        supplierId: supplier.id,
        supplierName: supplier.name,
        medicineId: medicine.id,
        medicineName: medicine.strength ? `${medicine.name} ${medicine.strength}` : medicine.name,
        batchId: batch.id,
        batchNo: batch.batchNo,
        expiry: batch.expiry,
        qtyUnits,
        purchaseRatePaise: batch.purchaseRatePaise,
        status: 'pending',
        note,
        createdAt: now,
        updatedAt: now,
      };

      const returnId = (await db.supplierReturns.add(newReturn)) as number;

      await db.stockMovements.add({
        batchId: batch.id,
        medicineId: medicine.id,
        type: 'supplier_return',
        qtyUnits: -qtyUnits,
        reference: `SUP-RET-${returnId}`,
        who: actor,
        at: now,
      });

      await addAudit(
        actor,
        'supplier_return_created',
        `SupplierReturn #${returnId}`,
        `Created supplier return of ${qtyUnits} units for ${medicine.name} batch ${batch.batchNo} to ${supplier.name}`
      );

      return { ...newReturn, id: returnId };
    }
  );
}

/**
 * Updates a supplier return status ('pending' | 'sent' | 'credit_received' | 'rejected')
 * and logs 'supplier_return_status_updated' to auditLog (no purchase rates).
 */
export async function updateSupplierReturnStatus(params: {
  returnId: number;
  status: SupplierReturnStatus;
  actorName: string;
}): Promise<SupplierReturn> {
  const { returnId, status, actorName } = params;
  const actor = (actorName || 'User').trim() || 'User';

  return await db.transaction('rw', [db.supplierReturns, db.auditLog], async () => {
    const existing = await db.supplierReturns.get(returnId);
    if (!existing || existing.id === undefined) {
      throw new Error('Supplier return record not found');
    }

    if (existing.status === status) {
      return existing;
    }

    const now = new Date().toISOString();
    await db.supplierReturns.update(returnId, {
      status,
      updatedAt: now,
    });

    await addAudit(
      actor,
      'supplier_return_status_updated',
      `SupplierReturn #${returnId}`,
      `Updated supplier return status for ${existing.medicineName} batch ${existing.batchNo} from ${existing.status} to ${status}`
    );

    return {
      ...existing,
      status,
      updatedAt: now,
    };
  });
}

