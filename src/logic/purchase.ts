import { db, type DBUser, type UserRole } from '../db';
import { canSeePurchasePrice } from './roles';

export interface PurchaseDraftLine {
  id: string; // temporary client UUID/id
  medicineId: number;
  medicineName: string;
  strength?: string;
  form?: string;
  unitsPerPack: number;
  shelf?: string;
  batchNo: string;
  expiryMonthYear: string; // e.g. "08/27" or "05/2028"
  expiryDate: string; // e.g. "2027-08-31" (last day of month)
  packs: number;
  freePacks: number;
  purchaseRatePaise: number;
  mrpPaise: number;
}

export interface PurchaseDraft {
  supplierId: number;
  supplierName?: string;
  supplierPhone?: string;
  invoiceNo: string;
  invoiceDate: string; // e.g. "24/10/2024"
  invoicePhoto: string; // compressed data URL
  lines: PurchaseDraftLine[];
}

export interface SavePurchaseResult {
  purchaseId: number;
  itemsCount: number;
  batchesCreatedOrUsed: number;
  totalPacksAdded: number;
  totalPaise: number;
}

export interface ReviewLineForOwner {
  id: string;
  medicineName: string;
  strength?: string;
  batchNo: string;
  expiryMonthYear: string;
  packs: number;
  freePacks: number;
  mrpPaise: number;
  purchaseRatePaise: number;
  lineAmountPaise: number;
}

export interface ReviewLineForStaff {
  id: string;
  medicineName: string;
  strength?: string;
  batchNo: string;
  expiryMonthYear: string;
  packs: number;
  freePacks: number;
  mrpPaise: number;
}

export interface OwnerReviewData {
  supplierName: string;
  supplierPhone?: string;
  invoiceNo: string;
  invoiceDate: string;
  invoicePhoto: string;
  lines: ReviewLineForOwner[];
  totalPacks: number;
  totalFreePacks: number;
  totalPaise: number;
  canSeeRates: true;
}

export interface StaffReviewData {
  supplierName: string;
  supplierPhone?: string;
  invoiceNo: string;
  invoiceDate: string;
  invoicePhoto: string;
  lines: ReviewLineForStaff[];
  totalPacks: number;
  totalFreePacks: number;
  canSeeRates: false;
}

export type ReviewData = OwnerReviewData | StaffReviewData;

/**
 * Returns review data structure tailored to user role permissions.
 * Staff members NEVER receive rates, line amounts, or invoice totals.
 */
export function getReviewData(
  draft: PurchaseDraft,
  user: DBUser | { role?: UserRole | string } | null | undefined
): ReviewData {
  const isPrivileged = canSeePurchasePrice(user);
  const supplierName = draft.supplierName || 'Distributor';
  const supplierPhone = draft.supplierPhone || '';
  const invoiceNo = draft.invoiceNo;
  const invoiceDate = draft.invoiceDate;
  const invoicePhoto = draft.invoicePhoto;

  let totalPacks = 0;
  let totalFreePacks = 0;

  for (const l of draft.lines) {
    totalPacks += l.packs;
    totalFreePacks += l.freePacks;
  }

  if (isPrivileged) {
    let totalPaise = 0;
    const lines: ReviewLineForOwner[] = draft.lines.map((l) => {
      const lineAmountPaise = l.packs * l.purchaseRatePaise; // free packs add no cost
      totalPaise += lineAmountPaise;
      return {
        id: l.id,
        medicineName: l.medicineName,
        strength: l.strength,
        batchNo: l.batchNo,
        expiryMonthYear: l.expiryMonthYear,
        packs: l.packs,
        freePacks: l.freePacks,
        mrpPaise: l.mrpPaise,
        purchaseRatePaise: l.purchaseRatePaise,
        lineAmountPaise,
      };
    });

    return {
      supplierName,
      supplierPhone,
      invoiceNo,
      invoiceDate,
      invoicePhoto,
      lines,
      totalPacks,
      totalFreePacks,
      totalPaise,
      canSeeRates: true,
    };
  }

  // Counter staff review: No purchaseRatePaise, no lineAmountPaise, no totalPaise
  const lines: ReviewLineForStaff[] = draft.lines.map((l) => ({
    id: l.id,
    medicineName: l.medicineName,
    strength: l.strength,
    batchNo: l.batchNo,
    expiryMonthYear: l.expiryMonthYear,
    packs: l.packs,
    freePacks: l.freePacks,
    mrpPaise: l.mrpPaise,
  }));

  return {
    supplierName,
    supplierPhone,
    invoiceNo,
    invoiceDate,
    invoicePhoto,
    lines,
    totalPacks,
    totalFreePacks,
    canSeeRates: false,
  };
}

/**
 * Saves everything in ONE atomic database transaction, all or nothing:
 * - A purchase and its purchaseLines (rates stored for both roles)
 * - Batches: if same medicineId + batchNo + expiry + mrpPaise + purchaseRatePaise exists, reuse that batch;
 *   otherwise create a new batch.
 * - StockMovements: 1 row of type "purchase" per line with (packs + free packs) x unitsPerPack units
 * - Audit entry: "purchase_saved" with purchaseId, supplierId, linesCount (no amounts, no rates)
 * If anything fails, save nothing (transaction rolls back).
 */
export async function savePurchase(
  draft: PurchaseDraft,
  user: DBUser | { id?: string; name?: string; role?: UserRole | string } | null | undefined
): Promise<SavePurchaseResult> {
  if (!draft.supplierId || draft.supplierId <= 0) {
    throw new Error('Supplier is required');
  }
  if (!draft.invoiceNo?.trim()) {
    throw new Error('Invoice number is required');
  }
  if (!draft.invoicePhoto?.trim()) {
    throw new Error('Invoice photo is required');
  }
  if (!draft.lines || draft.lines.length === 0) {
    throw new Error('At least one medicine line is required');
  }

  const userName = user?.name || (user?.role === 'owner' ? 'Owner' : 'Counter Admin');

  return await db.transaction(
    'rw',
    [db.purchases, db.purchaseLines, db.batches, db.stockMovements, db.auditLog],
    async () => {
      // 1. Create Purchase record
      const purchaseId = Number(
        await db.purchases.add({
          supplierId: draft.supplierId,
          invoiceNo: draft.invoiceNo.trim(),
          date: draft.invoiceDate.trim(),
          invoicePhoto: draft.invoicePhoto,
          verified: false,
          createdAt: new Date().toISOString(),
        })
      );

      let totalPacksAdded = 0;
      let totalPaise = 0;
      let newBatchesCount = 0;

      for (const line of draft.lines) {
        if (!line.medicineId) {
          throw new Error('Medicine ID missing on line');
        }
        if (!line.batchNo?.trim()) {
          throw new Error(`Batch number missing for ${line.medicineName}`);
        }
        if (line.packs < 0 || line.freePacks < 0 || line.packs + line.freePacks < 1) {
          throw new Error(`Packs must be at least 1 for ${line.medicineName}`);
        }
        if (line.mrpPaise <= 0) {
          throw new Error(`MRP must be greater than 0 for ${line.medicineName}`);
        }

        // 2. Add purchase line
        await db.purchaseLines.add({
          purchaseId,
          medicineId: line.medicineId,
          batchNo: line.batchNo.trim(),
          expiry: line.expiryDate,
          packs: line.packs,
          freePacks: line.freePacks,
          purchaseRatePaise: line.purchaseRatePaise,
          mrpPaise: line.mrpPaise,
        });

        // 3. Batches check:
        // If same medicine + batch number + expiry + MRP + purchase rate already exists, add to that batch;
        // otherwise create a new batch.
        const cleanBatchNo = line.batchNo.trim();
        const existingBatch = await db.batches
          .where('medicineId')
          .equals(line.medicineId)
          .filter(
            (b) =>
              b.batchNo.trim().toLowerCase() === cleanBatchNo.toLowerCase() &&
              b.expiry === line.expiryDate &&
              b.mrpPaise === line.mrpPaise &&
              b.purchaseRatePaise === line.purchaseRatePaise
          )
          .first();

        let batchId: number;
        if (existingBatch && existingBatch.id !== undefined) {
          batchId = existingBatch.id;
        } else {
          newBatchesCount++;
          batchId = Number(
            await db.batches.add({
              medicineId: line.medicineId,
              batchNo: cleanBatchNo,
              expiry: line.expiryDate,
              purchaseRatePaise: line.purchaseRatePaise,
              mrpPaise: line.mrpPaise,
              shelf: line.shelf || '',
              createdAt: new Date().toISOString(),
            })
          );
        }

        // 4. One stockMovements row of type "purchase" per line:
        // (packs + free packs) x unitsPerPack units
        const unitsPerPack = Math.max(1, line.unitsPerPack || 1);
        const qtyUnits = (line.packs + line.freePacks) * unitsPerPack;

        await db.stockMovements.add({
          batchId,
          medicineId: line.medicineId,
          type: 'purchase',
          qtyUnits,
          reference: `Purchase #${purchaseId} (${draft.invoiceNo})`,
          who: userName,
          at: new Date().toISOString(),
        });

        totalPacksAdded += line.packs + line.freePacks;
        totalPaise += line.packs * line.purchaseRatePaise; // free packs cost nothing
      }

      // 5. Audit entry "purchase_saved" with purchase id, supplier id and number of lines (no amounts, no rates)
      await db.auditLog.add({
        timestamp: new Date().toISOString(),
        who: userName,
        action: 'purchase_saved',
        record: `Purchase #${purchaseId}`,
        details: JSON.stringify({
          purchaseId,
          supplierId: draft.supplierId,
          linesCount: draft.lines.length,
        }),
      });

      return {
        purchaseId,
        itemsCount: draft.lines.length,
        batchesCreatedOrUsed: newBatchesCount || 1,
        totalPacksAdded,
        totalPaise,
      };
    }
  );
}
