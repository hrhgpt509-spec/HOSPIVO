import { db, type Medicine, type Batch, type PaymentMode } from '../db';
import { batchStock, isExpired } from './stock';
import { findInStockSubstitutes, type SubstituteMedicineInfo, type BillDraft, type BillDraftLine } from './billing';

export interface TopSellingMedicine {
  id: number;
  name: string;
  genericName?: string;
  unitsPerPack: number;
  mrp: number; // in paise per pack
  shelf?: string;
  totalUnitsSold: number;
  inStockUnits: number;
  inStockPacks: number;
  scheduleType?: 'none' | 'H' | 'H1' | 'X';
  shortCode?: string;
  barcode?: string;
  category?: string;
}

export type ResolveScanResult =
  | {
      kind: 'special';
      command: 'next_bill' | 'undo' | 'cancel_bill';
    }
  | {
      kind: 'matched';
      medicine: Medicine;
      availableUnits: number;
      batch: Batch;
      isScheduleH: boolean;
    }
  | {
      kind: 'out_of_stock';
      medicine: Medicine;
      substitutes: SubstituteMedicineInfo[];
    }
  | {
      kind: 'ambiguous';
      code: string;
      medicines: Medicine[];
    }
  | {
      kind: 'not_found';
      code: string;
    };

export interface FastBillCartItem {
  id: string; // unique row id
  medicineId: number;
  medicineName: string;
  strength?: string;
  salt?: string;
  shelf?: string;
  batchId: number;
  batchNo: string;
  expiry: string;
  mrpPaise: number; // per pack
  unitsPerPack: number;
  unitType: 'strip' | 'loose';
  quantity: number; // packs or loose units
  qtyUnits: number; // calculated loose units
  lineTotalPaise: number;
  isScheduleH?: boolean;
  rxVerified?: boolean;
  patientName?: string;
  doctorName?: string;
  confirmed?: boolean;
}

export interface PendingFastBill {
  id: string;
  billNumberLabel: string;
  createdAt: number;
  status: 'scanning' | 'ready' | 'completed';
  items: FastBillCartItem[];
  currentItemIndex?: number;
}

const PINNED_KEY = 'hospivo_fast_bill_pinned';

export function getPinnedMedicineIds(): number[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function togglePinnedMedicineId(id: number): number[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const current = getPinnedMedicineIds();
    const idx = current.indexOf(id);
    let next: number[];
    if (idx >= 0) {
      next = current.filter((x) => x !== id);
    } else {
      next = [id, ...current];
    }
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

/**
 * Fetch top selling medicines up to `limit` (default 100).
 * Medicines sold in `billItems` are ordered by units sold descending.
 * Remaining active medicines are appended alphabetically.
 * Calculates valid non-expired stock for each.
 */
export async function getTopSellingMedicines(
  limit = 100,
  today?: Date | string
): Promise<TopSellingMedicine[]> {
  const [billItems, medicines, batches, movements] = await Promise.all([
    db.billItems.toArray(),
    db.medicines.toArray(),
    db.batches.toArray(),
    db.stockMovements.toArray(),
  ]);

  const salesMap = new Map<number, number>();
  for (const item of billItems) {
    salesMap.set(item.medicineId, (salesMap.get(item.medicineId) || 0) + item.qtyUnits);
  }

  const movementSumByBatch = new Map<number, number>();
  for (const mov of movements) {
    movementSumByBatch.set(mov.batchId, (movementSumByBatch.get(mov.batchId) || 0) + mov.qtyUnits);
  }

  const validStockByMed = new Map<number, number>();
  for (const b of batches) {
    if (b.id === undefined || isExpired(b, today)) continue;
    const stock = movementSumByBatch.get(b.id) || 0;
    if (stock > 0) {
      validStockByMed.set(b.medicineId, (validStockByMed.get(b.medicineId) || 0) + stock);
    }
  }

  const pinnedIds = getPinnedMedicineIds();
  const activeMeds = medicines.filter((m) => m.active !== false);

  const list: TopSellingMedicine[] = activeMeds.map((m) => {
    const totalUnitsSold = salesMap.get(m.id!) || 0;
    const inStockUnits = validStockByMed.get(m.id!) || 0;
    const unitsPerPack = Math.max(1, m.unitsPerPack || 1);
    const inStockPacks = Math.floor(inStockUnits / unitsPerPack);
    return {
      id: m.id!,
      name: m.name,
      genericName: m.salt,
      unitsPerPack,
      mrp: m.mrpPaise,
      shelf: m.shelf,
      totalUnitsSold,
      inStockUnits,
      inStockPacks,
      scheduleType: m.scheduleType,
      shortCode: m.shortCode,
      barcode: m.barcode,
      category: m.form,
    };
  });

  list.sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id);
    const bPinned = pinnedIds.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (b.totalUnitsSold !== a.totalUnitsSold) {
      return b.totalUnitsSold - a.totalUnitsSold;
    }
    return a.name.localeCompare(b.name);
  });

  return list.slice(0, limit);
}

/**
 * Resolves a scan string or typed short code against medicines & commands.
 */
export async function resolveScanCode(
  code: string,
  today?: Date | string
): Promise<ResolveScanResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { kind: 'not_found', code: '' };
  }

  const upper = trimmed.toUpperCase();
  if (upper === 'NEXT' || upper === 'NEXT_BILL' || upper === 'NEXT BILL') {
    return { kind: 'special', command: 'next_bill' };
  }
  if (upper === 'UNDO' || upper === 'WAPAS') {
    return { kind: 'special', command: 'undo' };
  }
  if (upper === 'CANCEL' || upper === 'CANCEL_BILL' || upper === 'KHATAM') {
    return { kind: 'special', command: 'cancel_bill' };
  }

  const lower = trimmed.toLowerCase();
  const allMeds = await db.medicines.toArray();
  const activeMeds = allMeds.filter((m) => m.active !== false);

  const matches = activeMeds.filter(
    (m) =>
      (m.barcode && m.barcode.trim().toLowerCase() === lower) ||
      (m.shortCode && m.shortCode.trim().toLowerCase() === lower)
  );

  if (matches.length === 0) {
    const nameMatches = activeMeds.filter((m) => m.name.trim().toLowerCase() === lower);
    if (nameMatches.length > 0) {
      matches.push(...nameMatches);
    }
  }

  if (matches.length === 0) {
    return { kind: 'not_found', code: trimmed };
  }
  if (matches.length > 1) {
    return { kind: 'ambiguous', code: trimmed, medicines: matches };
  }

  const target = matches[0];
  const batches = await db.batches.where('medicineId').equals(target.id!).toArray();

  const validBatchesWithStock: { batch: Batch; stockUnits: number }[] = [];
  let totalStockUnits = 0;

  for (const b of batches) {
    if (b.id === undefined || isExpired(b, today)) continue;
    const stock = await batchStock(b.id);
    if (stock > 0) {
      validBatchesWithStock.push({ batch: b, stockUnits: stock });
      totalStockUnits += stock;
    }
  }

  if (totalStockUnits <= 0) {
    const substitutes = await findInStockSubstitutes(target.id!, today);
    return {
      kind: 'out_of_stock',
      medicine: target,
      substitutes,
    };
  }

  // FEFO: earliest expiry first
  validBatchesWithStock.sort((a, b) => a.batch.expiry.localeCompare(b.batch.expiry));
  const primaryBatch = validBatchesWithStock[0].batch;
  const isScheduleH = target.scheduleType === 'H' || target.scheduleType === 'H1';

  return {
    kind: 'matched',
    medicine: target,
    availableUnits: totalStockUnits,
    batch: primaryBatch,
    isScheduleH,
  };
}

/**
 * Calculates subtotal, roundoff, and grand total in paise for fast bill items.
 */
export function calculateFastBillTotals(items: FastBillCartItem[]): {
  subtotalPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  itemCount: number;
  totalPacks: number;
} {
  const subtotalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  const remainder = subtotalPaise % 100;
  let roundOffPaise = 0;
  if (remainder >= 50) {
    roundOffPaise = 100 - remainder;
  } else if (remainder > 0) {
    roundOffPaise = -remainder;
  }
  const totalPaise = subtotalPaise + roundOffPaise;
  const itemCount = items.length;
  const totalPacks = items.reduce(
    (sum, item) =>
      sum + (item.unitType === 'strip' ? item.quantity : item.quantity / item.unitsPerPack),
    0
  );
  return { subtotalPaise, roundOffPaise, totalPaise, itemCount, totalPacks };
}

/**
 * Convert FastBill items into BillDraft for `finalizeBill`.
 */
export function buildFastBillDraft(
  items: FastBillCartItem[],
  paymentMode: PaymentMode = 'cash',
  cashReceivedPaise?: number,
  options?: { customerName?: string; customerPhone?: string; doctorName?: string }
): BillDraft {
  const lines: BillDraftLine[] = items.map((item) => ({
    medicineId: item.medicineId,
    unitMode: item.unitType === 'loose' ? 'loose' : 'pack',
    qtyInput: item.quantity,
    patientName: item.patientName,
    doctorName: item.doctorName,
    prescriptionChecked: item.rxVerified,
  }));

  return {
    lines,
    paymentMode,
    cashReceivedPaise,
    customerName: options?.customerName,
    customerPhone: options?.customerPhone,
    doctorName: options?.doctorName,
  };
}
