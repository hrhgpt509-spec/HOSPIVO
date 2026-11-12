import { db, type Batch, type Medicine, type StockMovement } from '../db';

/**
 * Hospivo Stock & Inventory Logic
 *
 * Rules:
 * - All stock is stored in the SMALLEST unit (e.g. loose tablets).
 * - Packs = units / unitsPerPack.
 * - Money is whole paise.
 * - Stock movements are append-only.
 * - Batch expiry is valid through the LAST day of the entered month.
 */

/**
 * Converts a month/year entry into an ISO date representing the LAST day of the month.
 * Examples:
 * - "08/2027" -> "2027-08-31"
 * - "02/2028" -> "2028-02-29" (leap year)
 * - "2027-08" -> "2027-08-31"
 */
export function formatExpiryToLastDay(monthYear: string): string {
  const clean = monthYear.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  let month = 0;
  let year = 0;

  if (clean.includes('/') || clean.includes('-')) {
    const parts = clean.split(/[/ -]/);
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      month = parseInt(parts[0], 10);
      year = parseInt(parts[1], 10);
      if (year < 100) year += 2000;
    }
  }

  if (!month || !year || month < 1 || month > 12) {
    throw new Error(`Invalid expiry format: ${monthYear}`);
  }

  // Day 0 of next month is the last day of this month
  const lastDay = new Date(year, month, 0).getDate();
  const mStr = String(month).padStart(2, '0');
  const dStr = String(lastDay).padStart(2, '0');
  return `${year}-${mStr}-${dStr}`;
}

export function parseDateOnly(d?: Date | string): string {
  if (!d) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (typeof d === 'string') {
    return d.split('T')[0];
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns true if today is strictly after the batch expiry date.
 * A batch valid through 31 Aug 2027 is NOT expired on 31 Aug 2027.
 */
export function isExpired(
  batch: Pick<Batch, 'expiry'>,
  today?: Date | string
): boolean {
  const todayStr = parseDateOnly(today);
  const expiryStr = batch.expiry.split('T')[0];
  return todayStr > expiryStr;
}

export type ExpiryBucket = '30' | '60' | '90' | 'expired' | 'none';

/**
 * Returns the expiry alert bucket:
 * - 'expired': today is after batch expiry
 * - '30': 0 to 30 days remaining
 * - '60': 31 to 60 days remaining
 * - '90': 61 to 90 days remaining
 * - 'none': more than 90 days remaining
 */
export function expiryBucket(
  batch: Pick<Batch, 'expiry'>,
  today?: Date | string
): ExpiryBucket {
  const todayStr = parseDateOnly(today);
  const expiryStr = batch.expiry.split('T')[0];

  if (todayStr > expiryStr) {
    return 'expired';
  }

  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const [eY, eM, eD] = expiryStr.split('-').map(Number);

  const tUtc = Date.UTC(tY, tM - 1, tD);
  const eUtc = Date.UTC(eY, eM - 1, eD);

  const diffMs = eUtc - tUtc;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'expired';
  }
  if (diffDays <= 30) {
    return '30';
  }
  if (diffDays <= 60) {
    return '60';
  }
  if (diffDays <= 90) {
    return '90';
  }
  return 'none';
}

/**
 * Calculates current stock of a batch by summing its movements.
 */
export async function batchStock(batchId: number): Promise<number> {
  const movements = await db.stockMovements.where('batchId').equals(batchId).toArray();
  return movements.reduce((acc, m) => acc + m.qtyUnits, 0);
}

/**
 * Calculates current stock of a medicine by summing movements over all its batches.
 */
export async function medicineStock(medicineId: number): Promise<number> {
  const movements = await db.stockMovements.where('medicineId').equals(medicineId).toArray();
  return movements.reduce((acc, m) => acc + m.qtyUnits, 0);
}

export interface BatchAllocation {
  batch: Batch;
  qtyUnits: number;
}

export type PickBatchesResult =
  | {
      ok: true;
      allocations: BatchAllocation[];
      totalAllocatedUnits: number;
    }
  | {
      ok: false;
      error: 'insufficient_stock';
      availableUnits: number;
      requestedUnits: number;
    };

/**
 * Picks batches for sale:
 * - Earliest expiry first.
 * - NEVER includes expired batches or batches with zero stock.
 * - Splits across batches if one is not enough.
 * - Returns a clear "not enough stock" result instead of negative stock.
 */
export async function pickBatchesForSale(
  medicineId: number,
  qtyUnits: number,
  today?: Date | string
): Promise<PickBatchesResult> {
  if (qtyUnits <= 0) {
    return { ok: true, allocations: [], totalAllocatedUnits: 0 };
  }

  const batches = await db.batches.where('medicineId').equals(medicineId).toArray();

  const candidateBatches: Array<{ batch: Batch; availableUnits: number }> = [];
  let totalAvailableUnits = 0;

  for (const batch of batches) {
    if (batch.id === undefined) continue;
    if (isExpired(batch, today)) {
      continue; // NEVER include expired batches
    }
    const currentStock = await batchStock(batch.id);
    if (currentStock > 0) {
      candidateBatches.push({ batch, availableUnits: currentStock });
      totalAvailableUnits += currentStock;
    }
  }

  if (totalAvailableUnits < qtyUnits) {
    return {
      ok: false,
      error: 'insufficient_stock',
      availableUnits: totalAvailableUnits,
      requestedUnits: qtyUnits,
    };
  }

  // Sort earliest expiry first (ascending expiry date; if equal, earlier ID)
  candidateBatches.sort((a, b) => {
    if (a.batch.expiry !== b.batch.expiry) {
      return a.batch.expiry.localeCompare(b.batch.expiry);
    }
    return (a.batch.id ?? 0) - (b.batch.id ?? 0);
  });

  const allocations: BatchAllocation[] = [];
  let remainingNeeded = qtyUnits;

  for (const candidate of candidateBatches) {
    if (remainingNeeded <= 0) break;
    const take = Math.min(candidate.availableUnits, remainingNeeded);
    allocations.push({
      batch: candidate.batch,
      qtyUnits: take,
    });
    remainingNeeded -= take;
  }

  return {
    ok: true,
    allocations,
    totalAllocatedUnits: qtyUnits,
  };
}

export interface LowStockItem {
  medicine: Medicine;
  currentStockUnits: number;
}

/**
 * Checks if a stock quantity is out of stock (zero or negative).
 */
export function isOutOfStock(stockUnits: number): boolean {
  return stockUnits <= 0;
}

/**
 * Checks if a stock quantity is low (> 0 and <= minStockUnits).
 */
export function isLowStock(stockUnits: number, minStockUnits: number): boolean {
  return stockUnits > 0 && stockUnits <= minStockUnits;
}

/**
 * Returns medicines currently with zero or negative stock.
 */
export async function outOfStock(): Promise<LowStockItem[]> {
  const medicines = await db.medicines.toArray();
  const result: LowStockItem[] = [];

  for (const med of medicines) {
    if (med.id === undefined || !med.active) continue;
    const currentStock = await medicineStock(med.id);
    if (isOutOfStock(currentStock)) {
      result.push({
        medicine: med,
        currentStockUnits: currentStock,
      });
    }
  }

  return result;
}

/**
 * Returns medicines currently at or below their minStockUnits threshold.
 */
export async function lowStock(): Promise<LowStockItem[]> {
  const medicines = await db.medicines.toArray();
  const result: LowStockItem[] = [];

  for (const med of medicines) {
    if (med.id === undefined || !med.active) continue;
    const currentStock = await medicineStock(med.id);
    if (currentStock <= med.minStockUnits) {
      result.push({
        medicine: med,
        currentStockUnits: currentStock,
      });
    }
  }

  return result;
}

/**
 * Generates a unique short code for a medicine:
 * First letter plus a running number (e.g. C1, C2, A1).
 */
export async function shortCodeFor(
  name: string,
  existingCodes?: string[]
): Promise<string> {
  const trimmed = name.trim();
  const firstCharMatch = trimmed.match(/[a-zA-Z]/);
  const letter = firstCharMatch ? firstCharMatch[0].toUpperCase() : 'M';

  let codes = existingCodes;
  if (!codes) {
    const meds = await db.medicines.toArray();
    codes = meds.map((m) => m.shortCode).filter(Boolean);
  }

  const prefixRegex = new RegExp(`^${letter}(\\d+)$`, 'i');
  let maxNum = 0;

  for (const code of codes) {
    const match = code.trim().match(prefixRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `${letter}${maxNum + 1}`;
}

/**
 * Searches for likely duplicate medicines based on name, strength and company.
 */
export async function findDuplicateMedicines(
  name: string,
  strength: string,
  company: string
): Promise<Medicine[]> {
  const normName = name.trim().toLowerCase();
  const normStrength = strength.trim().toLowerCase();
  const normCompany = company.trim().toLowerCase();

  const all = await db.medicines.toArray();
  return all.filter((m) => {
    const mName = m.name.trim().toLowerCase();
    const mStrength = m.strength.trim().toLowerCase();
    const mCompany = m.company.trim().toLowerCase();

    if (mName === normName && mStrength === normStrength) {
      return true;
    }
    if (mName === normName && mCompany === normCompany) {
      return true;
    }
    return false;
  });
}

/**
 * Packs to smallest units (e.g. 10 packs of 15 tablets = 150 tablets).
 */
export function packsToUnits(packs: number, unitsPerPack: number): number {
  return Math.round(packs * unitsPerPack);
}

/**
 * Smallest units to packs.
 */
export function unitsToPacks(units: number, unitsPerPack: number): number {
  if (unitsPerPack <= 0) return 0;
  return units / unitsPerPack;
}

/**
 * Records purchase stock in the smallest units.
 * Free packs also add to stock!
 */
export async function recordPurchaseLineStock(
  medicineId: number,
  batchId: number,
  packs: number,
  freePacks: number,
  unitsPerPack: number,
  invoiceNo: string,
  who: string
): Promise<StockMovement> {
  const totalPacks = packs + freePacks;
  const qtyUnits = packsToUnits(totalPacks, unitsPerPack);

  const movement: StockMovement = {
    batchId,
    medicineId,
    type: 'purchase',
    qtyUnits,
    reference: `Purchase Invoice: ${invoiceNo} (${packs} packs + ${freePacks} free)`,
    who,
    at: new Date().toISOString(),
  };

  const id = await db.stockMovements.add(movement);
  return { ...movement, id };
}

/**
 * Records a stock correction movement (never edits old movements!).
 */
export async function recordStockCorrection(
  batchId: number,
  medicineId: number,
  diffQtyUnits: number,
  reason: string,
  who: string
): Promise<StockMovement> {
  const movement: StockMovement = {
    batchId,
    medicineId,
    type: 'correction',
    qtyUnits: diffQtyUnits,
    reference: `Correction: ${reason}`,
    who,
    at: new Date().toISOString(),
  };

  const id = await db.stockMovements.add(movement);
  return { ...movement, id };
}
