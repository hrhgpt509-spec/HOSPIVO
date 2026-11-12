import type { Medicine, Batch, Purchase, PurchaseLine, Supplier, DBUser, UserRole } from '../db';
import { canSeePurchasePrice } from './roles';
import { expiryBucket, type ExpiryBucket, isLowStock, isOutOfStock } from './stock';

export type StockFilter = 'all' | 'low' | 'out';

export interface MedicineStockSummary {
  medicine: Medicine;
  currentStockUnits: number;
  totalPacks: number;
  looseUnits: number;
  status: 'normal' | 'low' | 'out';
}

export interface BatchStockDetail {
  id?: number;
  batchNo: string;
  expiry: string;
  expiryBucket: ExpiryBucket;
  qtyUnits: number;
  packs: number;
  looseUnits: number;
  shelf: string;
  isExpired: boolean;
  purchaseRatePaise?: number; // ONLY present if canSeePurchasePrice(user) is true
}

export interface SupplierLowStockGroup {
  supplierId?: number;
  supplierName: string;
  supplierDetails?: string;
  items: Array<{
    medicine: Medicine;
    currentStockUnits: number;
    packsLeft: number;
    looseLeft: number;
    reorderPacks: number;
  }>;
}

/**
 * Filter stock items by tab:
 * - 'all': all medicines
 * - 'low': current stock is low (> 0 and <= minStockUnits)
 * - 'out': out of stock (<= 0)
 */
export function filterStockSummaries<T extends { currentStockUnits: number; minStockUnits: number }>(
  items: T[],
  filter: StockFilter
): T[] {
  if (filter === 'low') {
    return items.filter((item) => isLowStock(item.currentStockUnits, item.minStockUnits));
  }
  if (filter === 'out') {
    return items.filter((item) => isOutOfStock(item.currentStockUnits));
  }
  return items;
}

/**
 * Strips sensitive purchase rates for non-owner staff users.
 */
export function sanitizeBatchForUser(
  batch: Batch,
  batchUnits: number,
  unitsPerPack: number,
  user: DBUser | { role?: UserRole | string } | null | undefined,
  today?: Date | string
): BatchStockDetail {
  const upp = Math.max(1, unitsPerPack || 1);
  const packs = Math.floor(batchUnits / upp);
  const looseUnits = batchUnits % upp;
  const bucket = expiryBucket(batch, today);
  const expired = bucket === 'expired';

  const detail: BatchStockDetail = {
    id: batch.id,
    batchNo: batch.batchNo,
    expiry: batch.expiry,
    expiryBucket: bucket,
    qtyUnits: batchUnits,
    packs,
    looseUnits,
    shelf: batch.shelf || '',
    isExpired: expired,
  };

  if (canSeePurchasePrice(user)) {
    detail.purchaseRatePaise = batch.purchaseRatePaise;
  }

  return detail;
}

/**
 * Groups low stock medicines by the supplier of each medicine's most recent purchase.
 * Medicines never purchased go under "Supplier pata nahi" (or localized fallback).
 */
export function groupLowStockBySupplier(
  lowStockItems: Array<{ medicine: Medicine; currentStockUnits: number }>,
  purchases: Purchase[],
  purchaseLines: PurchaseLine[],
  suppliers: Supplier[],
  unknownSupplierLabel: string = 'Supplier pata nahi'
): SupplierLowStockGroup[] {
  const supplierMap = new Map<number, Supplier>();
  for (const s of suppliers) {
    if (s.id !== undefined) {
      supplierMap.set(s.id, s);
    }
  }

  const purchaseMap = new Map<number, Purchase>();
  for (const p of purchases) {
    if (p.id !== undefined) {
      purchaseMap.set(p.id, p);
    }
  }

  const linesByMed = new Map<number, PurchaseLine[]>();
  for (const line of purchaseLines) {
    const list = linesByMed.get(line.medicineId) || [];
    list.push(line);
    linesByMed.set(line.medicineId, list);
  }

  const groupMap = new Map<number, SupplierLowStockGroup>();

  for (const item of lowStockItems) {
    const medId = item.medicine.id;
    let lastSupplierId: number | undefined;

    if (medId !== undefined) {
      const lines = linesByMed.get(medId) || [];
      let latestPurchase: Purchase | undefined;

      for (const line of lines) {
        if (line.purchaseId !== undefined) {
          const p = purchaseMap.get(line.purchaseId);
          if (p) {
            if (!latestPurchase) {
              latestPurchase = p;
            } else {
              if (
                p.date > latestPurchase.date ||
                (p.date === latestPurchase.date && (p.id ?? 0) > (latestPurchase.id ?? 0))
              ) {
                latestPurchase = p;
              }
            }
          }
        }
      }

      if (latestPurchase && latestPurchase.supplierId !== undefined) {
        lastSupplierId = latestPurchase.supplierId;
      }
    }

    const upp = Math.max(1, item.medicine.unitsPerPack || 1);
    const packsLeft = Math.floor(item.currentStockUnits / upp);
    const looseLeft = item.currentStockUnits % upp;
    const minPacks = Math.ceil((item.medicine.minStockUnits || 10) / upp);
    const reorderPacks = Math.max(1, minPacks * 2 - packsLeft);

    const groupKey = lastSupplierId !== undefined && supplierMap.has(lastSupplierId) ? lastSupplierId : -1;

    let group = groupMap.get(groupKey);
    if (!group) {
      if (groupKey !== -1) {
        const supp = supplierMap.get(groupKey)!;
        group = {
          supplierId: supp.id,
          supplierName: supp.name,
          supplierDetails: [supp.address, supp.phone].filter(Boolean).join(' • '),
          items: [],
        };
      } else {
        group = {
          supplierName: unknownSupplierLabel,
          items: [],
        };
      }
      groupMap.set(groupKey, group);
    }

    group.items.push({
      medicine: item.medicine,
      currentStockUnits: item.currentStockUnits,
      packsLeft,
      looseLeft,
      reorderPacks,
    });
  }

  const result: SupplierLowStockGroup[] = [];
  let unknownGroup: SupplierLowStockGroup | undefined;

  for (const [key, group] of groupMap.entries()) {
    if (key === -1) {
      unknownGroup = group;
    } else {
      result.push(group);
    }
  }

  if (unknownGroup && unknownGroup.items.length > 0) {
    result.push(unknownGroup);
  }

  return result;
}

/**
 * Builds plain-text shopping list for WhatsApp sharing.
 */
export function buildWhatsAppShoppingList(
  groups: SupplierLowStockGroup[],
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const lines: string[] = [];
  lines.push(`*${t('stock_dekho.whatsapp_title')}*`);
  lines.push('');

  for (const group of groups) {
    lines.push(`*${group.supplierName}*`);
    for (const item of group.items) {
      const medName = item.medicine.name + (item.medicine.strength ? ` ${item.medicine.strength}` : '');
      const leftText = t('stock_dekho.whatsapp_packs_left', {
        packs: item.packsLeft,
      });
      lines.push(`• ${medName} - ${leftText}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
