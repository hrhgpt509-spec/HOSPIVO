import { db, type Supplier, type Purchase, type PurchaseLine, type Medicine } from '../db';
import { addAudit } from '../db/audit';
import { canSeePurchasePrice } from './roles';
import { formatField } from './format';

/**
 * Filter suppliers by name, phone, or GST number case-insensitively.
 */
export function filterSuppliers(suppliers: Supplier[], query: string): Supplier[] {
  const q = query.trim().toLowerCase();
  if (!q) return suppliers;

  return suppliers.filter((s) => {
    const nameMatch = s.name.toLowerCase().includes(q);
    const phoneMatch = s.phone ? s.phone.toLowerCase().includes(q) : false;
    const gstMatch = s.gstNo ? s.gstNo.toLowerCase().includes(q) : false;
    return nameMatch || phoneMatch || gstMatch;
  });
}

/**
 * Get all purchases for a supplier, sorted newest first (by date descending, then id descending).
 */
export function getPurchasesForSupplier(purchases: Purchase[], supplierId: number): Purchase[] {
  return purchases
    .filter((p) => p.supplierId === supplierId)
    .sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return (b.id || 0) - (a.id || 0);
    });
}

/**
 * Count total purchases for a supplier.
 */
export function getSupplierPurchaseCount(purchases: Purchase[], supplierId: number): number {
  return purchases.filter((p) => p.supplierId === supplierId).length;
}

/**
 * Calculate total purchase amount in paise for an owner view.
 */
export function getSupplierTotalPurchasesPaise(
  purchases: Purchase[],
  purchaseLines: PurchaseLine[],
  supplierId: number
): number {
  const supplierPurchaseIds = new Set(
    purchases.filter((p) => p.supplierId === supplierId).map((p) => p.id)
  );

  let totalPaise = 0;
  for (const line of purchaseLines) {
    if (line.purchaseId && supplierPurchaseIds.has(line.purchaseId)) {
      totalPaise += line.packs * line.purchaseRatePaise;
    }
  }
  return totalPaise;
}

export interface SupplierInvoiceLineForOwner {
  id?: number;
  medicineId: number;
  medicineName: string;
  batchNo: string;
  expiry: string;
  packs: number;
  freePacks: number;
  purchaseRatePaise: number;
  lineTotalPaise: number;
}

export interface SupplierInvoiceLineForStaff {
  id?: number;
  medicineId: number;
  medicineName: string;
  batchNo: string;
  expiry: string;
  packs: number;
  freePacks: number;
}

export interface SupplierInvoiceDetailOwner {
  purchaseId: number;
  supplierId: number;
  invoiceNo: string;
  date: string;
  invoicePhoto: string;
  verified: boolean;
  lines: SupplierInvoiceLineForOwner[];
  totalPacks: number;
  totalFreePacks: number;
  totalPaise: number;
  canSeeRates: true;
}

export interface SupplierInvoiceDetailStaff {
  purchaseId: number;
  supplierId: number;
  invoiceNo: string;
  date: string;
  invoicePhoto: string;
  verified: boolean;
  lines: SupplierInvoiceLineForStaff[];
  totalPacks: number;
  totalFreePacks: number;
  canSeeRates: false;
}

export type SupplierInvoiceDetail = SupplierInvoiceDetailOwner | SupplierInvoiceDetailStaff;

/**
 * Formats invoice detail data strictly respecting role privacy rules:
 * - Counter staff NEVER receive rates, line amounts, or invoice totals.
 * - Owner receives full line rates and totals.
 */
export function formatSupplierInvoiceDetail(
  purchase: Purchase,
  lines: PurchaseLine[],
  medicines: Medicine[],
  user: any
): SupplierInvoiceDetail {
  const isPrivileged = canSeePurchasePrice(user);
  const medMap = new Map<number, Medicine>();
  for (const m of medicines) {
    if (m.id) medMap.set(m.id, m);
  }

  let totalPacks = 0;
  let totalFreePacks = 0;

  for (const l of lines) {
    totalPacks += l.packs;
    totalFreePacks += l.freePacks;
  }

  if (isPrivileged) {
    let totalPaise = 0;
    const ownerLines: SupplierInvoiceLineForOwner[] = lines.map((l) => {
      const lineTotalPaise = l.packs * l.purchaseRatePaise;
      totalPaise += lineTotalPaise;
      const med = medMap.get(l.medicineId);
      return {
        id: l.id,
        medicineId: l.medicineId,
        medicineName: med?.name || `Medicine #${l.medicineId}`,
        batchNo: l.batchNo,
        expiry: l.expiry,
        packs: l.packs,
        freePacks: l.freePacks,
        purchaseRatePaise: l.purchaseRatePaise,
        lineTotalPaise,
      };
    });

    return {
      purchaseId: purchase.id || 0,
      supplierId: purchase.supplierId,
      invoiceNo: purchase.invoiceNo,
      date: purchase.date,
      invoicePhoto: purchase.invoicePhoto,
      verified: !!purchase.verified,
      lines: ownerLines,
      totalPacks,
      totalFreePacks,
      totalPaise,
      canSeeRates: true,
    };
  }

  // Counter staff: strictly omit purchaseRatePaise, lineTotalPaise, totalPaise
  const staffLines: SupplierInvoiceLineForStaff[] = lines.map((l) => {
    const med = medMap.get(l.medicineId);
    return {
      id: l.id,
      medicineId: l.medicineId,
      medicineName: med?.name || `Medicine #${l.medicineId}`,
      batchNo: l.batchNo,
      expiry: l.expiry,
      packs: l.packs,
      freePacks: l.freePacks,
    };
  });

  return {
    purchaseId: purchase.id || 0,
    supplierId: purchase.supplierId,
    invoiceNo: purchase.invoiceNo,
    date: purchase.date,
    invoicePhoto: purchase.invoicePhoto,
    verified: !!purchase.verified,
    lines: staffLines,
    totalPacks,
    totalFreePacks,
    canSeeRates: false,
  };
}

/**
 * Toggles verified status on a purchase and writes audit log entry.
 * Note: Never log purchase rates or amounts in audit log!
 */
export async function togglePurchaseVerified(
  purchaseId: number,
  nextVerified: boolean,
  who: string
): Promise<void> {
  const purchase = await db.purchases.get(purchaseId);
  if (!purchase) {
    throw new Error('Purchase not found');
  }

  await db.purchases.update(purchaseId, {
    verified: nextVerified,
  });

  await addAudit(
    who || 'Owner',
    'purchase_verified',
    String(purchaseId),
    `Invoice ${purchase.invoiceNo} marked as ${nextVerified ? 'verified' : 'unverified'}`
  );
}

/**
 * Validates and saves (create or update) a supplier in the database with audit logging.
 */
export async function saveSupplier(
  data: {
    id?: number;
    name: string;
    phone?: string;
    gstNo?: string;
    address?: string;
  },
  who: string
): Promise<number> {
  const formattedName = formatField('name', data.name?.trim() || '');
  if (!formattedName) {
    throw new Error('Supplier name is required');
  }

  const formattedPhone = formatField('phone', data.phone || '');
  const formattedGst = formatField('code', data.gstNo || '');
  const formattedAddress = formatField('free', data.address || '');

  if (data.id) {
    await db.suppliers.update(data.id, {
      name: formattedName,
      phone: formattedPhone,
      gstNo: formattedGst,
      address: formattedAddress,
    });

    await addAudit(
      who || 'User',
      'supplier_updated',
      formattedName,
      `Updated supplier ${formattedName}`
    );

    return data.id;
  }

  const newId = await db.suppliers.add({
    name: formattedName,
    phone: formattedPhone,
    gstNo: formattedGst,
    address: formattedAddress,
    createdAt: new Date().toISOString(),
  });

  await addAudit(
    who || 'User',
    'supplier_created',
    formattedName,
    `Created new supplier ${formattedName}`
  );

  return Number(newId);
}

