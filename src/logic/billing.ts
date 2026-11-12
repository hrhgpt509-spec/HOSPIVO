import {
  db,
  type Bill,
  type BillItem,
  type BillReturn,
  type BillStatus,
  type DBUser,
  type HeldBill,
  type Medicine,
  type PaymentMode,
  type RefundMode,
  type UnitMode,
} from '../db';
import { addAudit } from '../db/audit';
import type { ApprovalActionCategory } from './approvals';
import { batchStock, isExpired, parseDateOnly, pickBatchesForSale } from './stock';

export const DEFAULT_DISCOUNT_LIMIT_PERCENT = 5;

/**
 * Reads the owner-configured discount limit percentage from settings.
 * Defaults to 5% and persists that default in db.settings if not already set.
 */
export async function getDiscountLimitPercent(): Promise<number> {
  try {
    const item = await db.settings.get('discount_limit');
    if (item && typeof item.value === 'number' && !isNaN(item.value) && item.value >= 0) {
      return item.value;
    }
    await db.settings.put({ key: 'discount_limit', value: DEFAULT_DISCOUNT_LIMIT_PERCENT });
  } catch {
    // Fallback if database is unavailable
  }
  return DEFAULT_DISCOUNT_LIMIT_PERCENT;
}

/**
 * Computes unit selling price in whole paise for pack vs loose mode.
 */
export function computeUnitPricePaise(
  mrpPaise: number,
  unitsPerPack: number,
  unitMode: UnitMode
): number {
  const safeUnitsPerPack = Math.max(1, Math.round(unitsPerPack));
  if (unitMode === 'pack') {
    return Math.round(mrpPaise);
  }
  return Math.round(mrpPaise / safeUnitsPerPack);
}

/**
 * Converts input quantity (packs or loose units) into smallest units (loose tablets).
 */
export function computeQtyUnits(
  qtyInput: number,
  unitsPerPack: number,
  unitMode: UnitMode
): number {
  const safeUnitsPerPack = Math.max(1, Math.round(unitsPerPack));
  if (unitMode === 'pack') {
    return Math.round(qtyInput * safeUnitsPerPack);
  }
  return Math.round(qtyInput);
}

/**
 * Extracts MRP-inclusive taxable value and GST amount in whole paise.
 * taxable = Math.round((afterDiscount * 100) / (100 + gstPercent))
 * gst = afterDiscount - taxable
 */
export function extractInclusiveGst(
  afterDiscountPaise: number,
  gstPercent: number
): { taxablePaise: number; gstPaise: number } {
  const safeAmount = Math.max(0, Math.round(afterDiscountPaise));
  const safeGst = Math.max(0, gstPercent || 0);
  if (safeGst === 0) {
    return { taxablePaise: safeAmount, gstPaise: 0 };
  }
  const taxablePaise = Math.round((safeAmount * 100) / (100 + safeGst));
  const gstPaise = safeAmount - taxablePaise;
  return { taxablePaise, gstPaise };
}

export interface BillLineInput {
  medicineId: number;
  medicineName?: string;
  mrpPaise: number;
  unitsPerPack: number;
  gstPercent: number;
  unitMode: UnitMode;
  qtyInput: number;
  itemDiscountPercent?: number;
  itemDiscountPaise?: number;
  isScheduleH?: boolean;
  patientName?: string;
  doctorName?: string;
  prescriptionChecked?: boolean;
}

export interface ComputedBillLine {
  medicineId: number;
  unitMode: UnitMode;
  qtyInput: number;
  qtyUnits: number;
  unitsPerPack: number;
  mrpPaise: number;
  unitPricePaise: number;
  grossPaise: number;
  itemDiscountPaise: number;
  billDiscountSharePaise: number;
  discountPaise: number;
  effectiveDiscountPercent: number;
  gstPercent: number;
  taxablePaise: number;
  gstPaise: number;
  lineTotalPaise: number;
  isScheduleH: boolean;
  patientName: string;
  doctorName: string;
  prescriptionChecked: boolean;
}

export interface BillTotalsResult {
  lines: ComputedBillLine[];
  subtotalPaise: number;
  discountPaise: number;
  effectiveDiscountPercent: number;
  taxablePaise: number;
  gstPaise: number;
  netBeforeRoundOffPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  requiresApproval: boolean;
  approvalCategory?: ApprovalActionCategory;
}

/**
 * Pure calculation for line items, item/whole-bill discounts, approval threshold,
 * MRP-inclusive GST extraction, and nearest-rupee round-off in whole paise.
 */
export function calculateBillTotals(
  lines: BillLineInput[],
  wholeBillDiscountPercent = 0,
  maxDiscountLimit = DEFAULT_DISCOUNT_LIMIT_PERCENT
): BillTotalsResult {
  const safeWholeDiscount = Math.max(0, Math.min(100, wholeBillDiscountPercent || 0));

  let subtotalPaise = 0;
  let totalItemDiscountPaise = 0;

  const intermediate = lines.map((line) => {
    const safeUnitsPerPack = Math.max(1, Math.round(line.unitsPerPack));
    const unitPricePaise = computeUnitPricePaise(line.mrpPaise, safeUnitsPerPack, line.unitMode);
    const qtyUnits = computeQtyUnits(line.qtyInput, safeUnitsPerPack, line.unitMode);
    const grossPaise = Math.round(line.qtyInput * unitPricePaise);

    let itemDiscountPaise = 0;
    if (line.itemDiscountPaise !== undefined && line.itemDiscountPaise > 0) {
      itemDiscountPaise = Math.min(grossPaise, Math.round(line.itemDiscountPaise));
    } else if (line.itemDiscountPercent !== undefined && line.itemDiscountPercent > 0) {
      itemDiscountPaise = Math.min(
        grossPaise,
        Math.round((grossPaise * line.itemDiscountPercent) / 100)
      );
    }

    const afterItemDiscount = Math.max(0, grossPaise - itemDiscountPaise);
    subtotalPaise += grossPaise;
    totalItemDiscountPaise += itemDiscountPaise;

    return {
      line,
      safeUnitsPerPack,
      unitPricePaise,
      qtyUnits,
      grossPaise,
      itemDiscountPaise,
      afterItemDiscount,
    };
  });

  const subtotalAfterItemDiscounts = Math.max(0, subtotalPaise - totalItemDiscountPaise);
  const targetBillDiscountPaise =
    safeWholeDiscount > 0
      ? Math.min(
          subtotalAfterItemDiscounts,
          Math.round((subtotalAfterItemDiscounts * safeWholeDiscount) / 100)
        )
      : 0;

  let remainingBillDiscount = targetBillDiscountPaise;
  const nonZeroIndices = intermediate
    .map((item, idx) => (item.afterItemDiscount > 0 ? idx : -1))
    .filter((idx) => idx >= 0);
  const lastNonZeroIdx = nonZeroIndices.length > 0 ? nonZeroIndices[nonZeroIndices.length - 1] : -1;

  let totalTaxablePaise = 0;
  let totalGstPaise = 0;
  let netBeforeRoundOffPaise = 0;
  let anyLineExceedsLimit = false;

  const computedLines: ComputedBillLine[] = intermediate.map((item, idx) => {
    let billDiscountSharePaise = 0;
    if (targetBillDiscountPaise > 0 && item.afterItemDiscount > 0) {
      if (idx === lastNonZeroIdx) {
        billDiscountSharePaise = Math.min(item.afterItemDiscount, remainingBillDiscount);
      } else {
        billDiscountSharePaise = Math.min(
          item.afterItemDiscount,
          Math.round((item.afterItemDiscount * safeWholeDiscount) / 100)
        );
      }
      remainingBillDiscount -= billDiscountSharePaise;
    }

    const totalLineDiscountPaise = item.itemDiscountPaise + billDiscountSharePaise;
    const afterDiscountPaise = Math.max(0, item.grossPaise - totalLineDiscountPaise);
    const effectiveLineDiscountPercent =
      item.grossPaise > 0 ? (totalLineDiscountPaise * 100) / item.grossPaise : 0;

    if (effectiveLineDiscountPercent > maxDiscountLimit + 1e-6) {
      anyLineExceedsLimit = true;
    }

    const { taxablePaise, gstPaise } = extractInclusiveGst(
      afterDiscountPaise,
      item.line.gstPercent
    );

    totalTaxablePaise += taxablePaise;
    totalGstPaise += gstPaise;
    netBeforeRoundOffPaise += afterDiscountPaise;

    return {
      medicineId: item.line.medicineId,
      unitMode: item.line.unitMode,
      qtyInput: item.line.qtyInput,
      qtyUnits: item.qtyUnits,
      unitsPerPack: item.safeUnitsPerPack,
      mrpPaise: Math.round(item.line.mrpPaise),
      unitPricePaise: item.unitPricePaise,
      grossPaise: item.grossPaise,
      itemDiscountPaise: item.itemDiscountPaise,
      billDiscountSharePaise,
      discountPaise: totalLineDiscountPaise,
      effectiveDiscountPercent: Number(effectiveLineDiscountPercent.toFixed(2)),
      gstPercent: item.line.gstPercent || 0,
      taxablePaise,
      gstPaise,
      lineTotalPaise: afterDiscountPaise,
      isScheduleH: Boolean(item.line.isScheduleH),
      patientName: (item.line.patientName || '').trim(),
      doctorName: (item.line.doctorName || '').trim(),
      prescriptionChecked: Boolean(item.line.prescriptionChecked),
    };
  });

  const totalDiscountPaise = totalItemDiscountPaise + (targetBillDiscountPaise - remainingBillDiscount);
  const effectiveDiscountPercent =
    subtotalPaise > 0 ? Number(((totalDiscountPaise * 100) / subtotalPaise).toFixed(2)) : 0;

  // Nearest-rupee round-off (to nearest 100 paise)
  const totalPaise = Math.round(netBeforeRoundOffPaise / 100) * 100;
  const roundOffPaise = totalPaise - netBeforeRoundOffPaise;

  const requiresApproval =
    effectiveDiscountPercent > maxDiscountLimit ||
    safeWholeDiscount > maxDiscountLimit ||
    anyLineExceedsLimit;

  return {
    lines: computedLines,
    subtotalPaise,
    discountPaise: totalDiscountPaise,
    effectiveDiscountPercent,
    taxablePaise: totalTaxablePaise,
    gstPaise: totalGstPaise,
    netBeforeRoundOffPaise,
    roundOffPaise,
    totalPaise,
    requiresApproval,
    approvalCategory: requiresApproval ? 'discount_above_limit' : undefined,
  };
}

/**
 * Returns the Indian Financial Year label (April 1 to March 31) for a date.
 * Examples:
 * - "2026-04-01" -> "2026-27"
 * - "2027-03-31" -> "2026-27"
 * - "2026-03-31" -> "2025-26"
 */
export function getIndianFinancialYear(dateInput?: Date | string): string {
  const dateStr = parseDateOnly(dateInput);
  const [yearStr, monthStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String(startYear + 1).slice(-2);
  return `${startYear}-${endYearShort}`;
}

/**
 * Generates the next sequential bill number for the active Indian financial year,
 * e.g. "2026-27/0001".
 */
export async function generateNextBillNo(
  dateInput?: Date | string
): Promise<{ billNo: string; financialYear: string }> {
  const financialYear = getIndianFinancialYear(dateInput);
  const fyBills = await db.bills.where('financialYear').equals(financialYear).toArray();

  let maxSeq = 0;
  for (const bill of fyBills) {
    const parts = bill.billNo.split('/');
    const seqNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seqNum) && seqNum > maxSeq) {
      maxSeq = seqNum;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return {
    billNo: `${financialYear}/${nextSeq}`,
    financialYear,
  };
}

/**
 * Generates the next sequential sales return number, e.g. "RET-2026-27/0001".
 */
export async function generateNextReturnNo(dateInput?: Date | string): Promise<string> {
  const financialYear = getIndianFinancialYear(dateInput);
  const returns = await db.billReturns.toArray();
  const prefix = `RET-${financialYear}/`;

  let maxSeq = 0;
  for (const ret of returns) {
    if (ret.returnNo.startsWith(prefix)) {
      const seqStr = ret.returnNo.slice(prefix.length);
      const seqNum = parseInt(seqStr, 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export interface SubstituteMedicineInfo {
  id: number;
  name: string;
  strength: string;
  stockUnits: number;
  mrpPaise: number;
  shelf: string;
  unitsPerPack: number;
}

/**
 * Finds other active medicines with matching non-empty salt/composition
 * that currently have > 0 non-expired stock.
 */
export async function findInStockSubstitutes(
  medicineId: number,
  today?: Date | string
): Promise<SubstituteMedicineInfo[]> {
  const target = await db.medicines.get(medicineId);
  if (!target || !target.salt?.trim()) {
    return [];
  }

  const targetSalt = target.salt.trim().toLowerCase();
  const allMeds = await db.medicines.toArray();
  const candidates = allMeds.filter(
    (m) =>
      m.id !== undefined &&
      m.id !== medicineId &&
      m.active !== false &&
      m.salt?.trim().toLowerCase() === targetSalt
  );

  const results: SubstituteMedicineInfo[] = [];

  for (const med of candidates) {
    const batches = await db.batches.where('medicineId').equals(med.id!).toArray();
    let nonExpiredStock = 0;

    for (const batch of batches) {
      if (batch.id === undefined || isExpired(batch, today)) {
        continue;
      }
      const stock = await batchStock(batch.id);
      if (stock > 0) {
        nonExpiredStock += stock;
      }
    }

    if (nonExpiredStock > 0) {
      results.push({
        id: med.id!,
        name: med.name,
        strength: med.strength,
        stockUnits: nonExpiredStock,
        mrpPaise: med.mrpPaise,
        shelf: med.shelf,
        unitsPerPack: med.unitsPerPack,
      });
    }
  }

  results.sort((a, b) => b.stockUnits - a.stockUnits || a.name.localeCompare(b.name));
  return results;
}

export interface BillDraftLine {
  medicineId: number;
  unitMode: UnitMode;
  qtyInput: number;
  itemDiscountPercent?: number;
  itemDiscountPaise?: number;
  patientName?: string;
  doctorName?: string;
  prescriptionChecked?: boolean;
}

export interface BillDraft {
  lines: BillDraftLine[];
  wholeBillDiscountPercent?: number;
  customerName?: string;
  customerPhone?: string;
  doctorName?: string;
  paymentMode: PaymentMode;
  cashReceivedPaise?: number;
  splitDetails?: string;
  date?: string;
}

export interface FinalizeBillResult {
  billId: number;
  billNo: string;
  financialYear: string;
  totalPaise: number;
  itemsCount: number;
  bill: Bill;
  billItems: BillItem[];
}

/**
 * Validates Schedule H / H1 prescription metadata for a line item.
 */
export function hasValidScheduleHMetadata(
  medicine: Pick<Medicine, 'scheduleType'>,
  line: Pick<BillDraftLine, 'patientName' | 'doctorName' | 'prescriptionChecked'>
): boolean {
  if (medicine.scheduleType !== 'H' && medicine.scheduleType !== 'H1') {
    return true;
  }
  return Boolean(
    line.patientName?.trim() &&
      line.doctorName?.trim() &&
      line.prescriptionChecked === true
  );
}

/**
 * Splits a single computed cart line across its FEFO-allocated batches while
 * preserving exact whole-paise totals.
 */
function splitLineAcrossAllocations(
  computedLine: ComputedBillLine,
  medicineName: string,
  allocations: Array<{ batchId: number; batchNo: string; expiry: string; qtyUnits: number }>
): Omit<BillItem, 'id' | 'billId'>[] {
  const totalUnits = computedLine.qtyUnits;

  if (allocations.length === 1) {
    const alloc = allocations[0];
    return [
      {
        medicineId: computedLine.medicineId,
        batchId: alloc.batchId,
        medicineName,
        batchNo: alloc.batchNo,
        expiry: alloc.expiry,
        unitMode: computedLine.unitMode,
        qtyInput: computedLine.qtyInput,
        qtyUnits: alloc.qtyUnits,
        unitsPerPack: computedLine.unitsPerPack,
        mrpPaise: computedLine.mrpPaise,
        unitPricePaise: computedLine.unitPricePaise,
        discountPaise: computedLine.discountPaise,
        gstPercent: computedLine.gstPercent,
        taxablePaise: computedLine.taxablePaise,
        gstPaise: computedLine.gstPaise,
        lineTotalPaise: computedLine.lineTotalPaise,
        isScheduleH: computedLine.isScheduleH,
        patientName: computedLine.patientName,
        doctorName: computedLine.doctorName,
        prescriptionChecked: computedLine.prescriptionChecked,
      },
    ];
  }

  let remDiscount = computedLine.discountPaise;
  let remTaxable = computedLine.taxablePaise;
  let remGst = computedLine.gstPaise;
  let remLineTotal = computedLine.lineTotalPaise;

  return allocations.map((alloc, idx) => {
    const isLast = idx === allocations.length - 1;
    const shareDiscount = isLast
      ? remDiscount
      : Math.round((computedLine.discountPaise * alloc.qtyUnits) / totalUnits);
    const shareTaxable = isLast
      ? remTaxable
      : Math.round((computedLine.taxablePaise * alloc.qtyUnits) / totalUnits);
    const shareGst = isLast
      ? remGst
      : Math.round((computedLine.gstPaise * alloc.qtyUnits) / totalUnits);
    const shareTotal = isLast
      ? remLineTotal
      : Math.round((computedLine.lineTotalPaise * alloc.qtyUnits) / totalUnits);

    remDiscount -= shareDiscount;
    remTaxable -= shareTaxable;
    remGst -= shareGst;
    remLineTotal -= shareTotal;

    const allocQtyInput =
      computedLine.unitMode === 'loose'
        ? alloc.qtyUnits
        : Number((alloc.qtyUnits / computedLine.unitsPerPack).toFixed(2));

    return {
      medicineId: computedLine.medicineId,
      batchId: alloc.batchId,
      medicineName,
      batchNo: alloc.batchNo,
      expiry: alloc.expiry,
      unitMode: computedLine.unitMode,
      qtyInput: allocQtyInput,
      qtyUnits: alloc.qtyUnits,
      unitsPerPack: computedLine.unitsPerPack,
      mrpPaise: computedLine.mrpPaise,
      unitPricePaise: computedLine.unitPricePaise,
      discountPaise: shareDiscount,
      gstPercent: computedLine.gstPercent,
      taxablePaise: shareTaxable,
      gstPaise: shareGst,
      lineTotalPaise: shareTotal,
      isScheduleH: computedLine.isScheduleH,
      patientName: computedLine.patientName,
      doctorName: computedLine.doctorName,
      prescriptionChecked: computedLine.prescriptionChecked,
    };
  });
}

/**
 * Atomically finalizes a bill:
 * - Validates lines, Schedule H/H1 prescription details, and discount approval.
 * - Allocates batches via pickBatchesForSale (FEFO, never expired, never negative stock).
 * - Writes bill, billItems, negative 'sale' stockMovements, and 'bill_created' audit entry.
 */
export async function finalizeBill(
  draft: BillDraft,
  user: DBUser | { id?: string; name?: string; role?: string } | null | undefined,
  options?: { today?: Date | string; approvalVerified?: boolean }
): Promise<FinalizeBillResult> {
  if (!draft.lines || draft.lines.length === 0) {
    throw new Error('empty_bill_lines');
  }

  for (const line of draft.lines) {
    if (!Number.isInteger(line.qtyInput) || line.qtyInput < 1) {
      throw new Error('invalid_line_quantity');
    }
  }

  const maxDiscountLimit = await getDiscountLimitPercent();
  const billDate = parseDateOnly(draft.date || options?.today);
  const cashierId = user?.id || 'cashier';
  const cashierName = user?.name || (user?.role === 'owner' ? 'Owner' : 'Cashier');

  return db.transaction(
    'rw',
    [db.bills, db.billItems, db.batches, db.stockMovements, db.medicines, db.auditLog, db.settings],
    async () => {
      const lineInputs: BillLineInput[] = [];
      const medicineById = new Map<number, Medicine>();

      for (const line of draft.lines) {
        const med = await db.medicines.get(line.medicineId);
        if (!med || med.active === false) {
          throw new Error(`medicine_not_found:${line.medicineId}`);
        }
        medicineById.set(line.medicineId, med);

        if (!hasValidScheduleHMetadata(med, line)) {
          throw new Error(`schedule_h_prescription_required:${med.name}`);
        }

        const isScheduleH = med.scheduleType === 'H' || med.scheduleType === 'H1';
        lineInputs.push({
          medicineId: line.medicineId,
          medicineName: med.name,
          mrpPaise: med.mrpPaise,
          unitsPerPack: med.unitsPerPack,
          gstPercent: med.gstPercent,
          unitMode: line.unitMode,
          qtyInput: line.qtyInput,
          itemDiscountPercent: line.itemDiscountPercent,
          itemDiscountPaise: line.itemDiscountPaise,
          isScheduleH,
          patientName: line.patientName,
          doctorName: line.doctorName,
          prescriptionChecked: line.prescriptionChecked,
        });
      }

      const totals = calculateBillTotals(
        lineInputs,
        draft.wholeBillDiscountPercent || 0,
        maxDiscountLimit
      );

      if (totals.requiresApproval && !options?.approvalVerified) {
        throw new Error('discount_above_limit');
      }

      // Payment checks
      let cashReceivedPaise = Math.round(draft.cashReceivedPaise ?? 0);
      let changePaise = 0;
      if (draft.paymentMode === 'cash') {
        cashReceivedPaise = Math.round(draft.cashReceivedPaise ?? totals.totalPaise);
        if (cashReceivedPaise < totals.totalPaise) {
          throw new Error('insufficient_cash_received');
        }
        changePaise = cashReceivedPaise - totals.totalPaise;
      }

      // Batch allocations via pickBatchesForSale (FEFO, never expired, never negative stock)
      // Track cumulative allocations per medicine in case the same medicine appears on multiple lines
      const reservedByBatch = new Map<number, number>();
      const reservedByMed = new Map<number, number>();
      const preparedBillItems: Omit<BillItem, 'id' | 'billId'>[] = [];
      const pendingMovements: Array<{ batchId: number; medicineId: number; qtyUnits: number }> = [];

      for (const compLine of totals.lines) {
        const med = medicineById.get(compLine.medicineId)!;
        const alreadyReservedMed = reservedByMed.get(compLine.medicineId) || 0;

        const pickResult = await pickBatchesForSale(
          compLine.medicineId,
          compLine.qtyUnits + alreadyReservedMed,
          options?.today || billDate
        );

        if (!pickResult.ok) {
          throw new Error(`insufficient_stock:${med.name}`);
        }

        const lineAllocations: Array<{
          batchId: number;
          batchNo: string;
          expiry: string;
          qtyUnits: number;
        }> = [];
        let needed = compLine.qtyUnits;

        for (const alloc of pickResult.allocations) {
          if (needed <= 0) break;
          const batchId = alloc.batch.id!;
          const alreadyFromBatch = reservedByBatch.get(batchId) || 0;
          const newlyAvailable = alloc.qtyUnits - alreadyFromBatch;
          if (newlyAvailable <= 0) continue;

          const take = Math.min(newlyAvailable, needed);
          lineAllocations.push({
            batchId,
            batchNo: alloc.batch.batchNo,
            expiry: alloc.batch.expiry,
            qtyUnits: take,
          });
          reservedByBatch.set(batchId, alreadyFromBatch + take);
          pendingMovements.push({
            batchId,
            medicineId: compLine.medicineId,
            qtyUnits: -take,
          });
          needed -= take;
        }

        if (needed > 0) {
          throw new Error(`insufficient_stock:${med.name}`);
        }

        reservedByMed.set(compLine.medicineId, alreadyReservedMed + compLine.qtyUnits);

        const itemRows = splitLineAcrossAllocations(compLine, med.name, lineAllocations);
        preparedBillItems.push(...itemRows);
      }

      const { billNo, financialYear } = await generateNextBillNo(billDate);
      const nowIso = new Date().toISOString();

      const billToSave: Bill = {
        billNo,
        financialYear,
        date: billDate,
        customerName: (draft.customerName || '').trim(),
        customerPhone: (draft.customerPhone || '').trim(),
        doctorName: (draft.doctorName || '').trim(),
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        discountPercent: totals.effectiveDiscountPercent,
        roundOffPaise: totals.roundOffPaise,
        totalPaise: totals.totalPaise,
        taxablePaise: totals.taxablePaise,
        gstPaise: totals.gstPaise,
        paymentMode: draft.paymentMode,
        cashReceivedPaise,
        changePaise,
        splitDetails: draft.splitDetails,
        status: 'completed',
        cashierId,
        cashierName,
        createdAt: nowIso,
      };

      const billId = Number(await db.bills.add(billToSave));
      billToSave.id = billId;

      const savedBillItems: BillItem[] = [];
      for (const item of preparedBillItems) {
        const fullItem: BillItem = { ...item, billId };
        const itemId = Number(await db.billItems.add(fullItem));
        savedBillItems.push({ ...fullItem, id: itemId });
      }

      for (const mv of pendingMovements) {
        await db.stockMovements.add({
          batchId: mv.batchId,
          medicineId: mv.medicineId,
          type: 'sale',
          qtyUnits: mv.qtyUnits,
          reference: billNo,
          who: cashierName,
          at: nowIso,
        });
      }

      await addAudit(
        cashierName,
        'bill_created',
        billNo,
        `Bill ${billNo} finalized (${savedBillItems.length} items, mode: ${draft.paymentMode})`
      );

      return {
        billId,
        billNo,
        financialYear,
        totalPaise: totals.totalPaise,
        itemsCount: savedBillItems.length,
        bill: billToSave,
        billItems: savedBillItems,
      };
    }
  );
}

export interface ReturnLineInput {
  billItemId: number;
  returnUnits: number;
}

export interface BillReturnDraft {
  originalBillId: number;
  items: ReturnLineInput[];
  refundMode: RefundMode;
  reason: string;
  approvedBy?: string;
}

export interface ProcessReturnResult {
  billReturnId: number;
  returnNo: string;
  totalRefundPaise: number;
  newBillStatus: BillStatus;
}

interface StoredReturnItemRecord {
  billItemId: number;
  medicineId: number;
  batchId: number;
  returnUnits: number;
  refundPaise: number;
}

/**
 * Processes a sales return atomically:
 * - Validates returned units <= sold units minus previously returned units.
 * - Appends positive 'customer_return' stockMovements into the EXACT SAME batchId.
 * - Inserts a new billReturn record and updates bill.status to 'returned_partial' or 'returned_full'.
 * - Records an audit log entry 'bill_returned'.
 */
export async function processBillReturn(
  draft: BillReturnDraft,
  user: DBUser | { id?: string; name?: string; role?: string } | null | undefined
): Promise<ProcessReturnResult> {
  if (!draft.items || draft.items.length === 0) {
    throw new Error('empty_return_items');
  }

  const whoName = user?.name || (user?.role === 'owner' ? 'Owner' : 'Cashier');
  const approvedBy = (draft.approvedBy || whoName).trim();

  return db.transaction(
    'rw',
    [db.bills, db.billItems, db.billReturns, db.stockMovements, db.auditLog],
    async () => {
      const originalBill = await db.bills.get(draft.originalBillId);
      if (!originalBill) {
        throw new Error('bill_not_found');
      }

      const originalItems = await db.billItems
        .where('billId')
        .equals(draft.originalBillId)
        .toArray();
      const itemMap = new Map<number, BillItem>();
      let totalSoldUnits = 0;
      for (const item of originalItems) {
        if (item.id !== undefined) {
          itemMap.set(item.id, item);
        }
        totalSoldUnits += item.qtyUnits;
      }

      // Sum previously returned quantities per billItemId and previously refunded paise
      const prevReturns = await db.billReturns
        .where('originalBillId')
        .equals(draft.originalBillId)
        .toArray();

      const alreadyReturnedByItem = new Map<number, number>();
      let totalPrevReturnedUnits = 0;
      let totalPrevRefundedPaise = 0;

      for (const ret of prevReturns) {
        totalPrevRefundedPaise += ret.totalRefundPaise;
        try {
          const parsed: StoredReturnItemRecord[] = JSON.parse(ret.itemsJson);
          for (const rec of parsed) {
            const prev = alreadyReturnedByItem.get(rec.billItemId) || 0;
            alreadyReturnedByItem.set(rec.billItemId, prev + rec.returnUnits);
            totalPrevReturnedUnits += rec.returnUnits;
          }
        } catch {
          // ignore malformed historical json if any
        }
      }

      // Check duplicate billItemId within the same return request too
      const requestedInThisReturn = new Map<number, number>();
      let totalCurrentReturnUnits = 0;
      let totalRefundPaise = 0;
      const storedItems: StoredReturnItemRecord[] = [];
      const movementsToWrite: Array<{ batchId: number; medicineId: number; qtyUnits: number }> = [];

      for (const reqItem of draft.items) {
        if (!Number.isInteger(reqItem.returnUnits) || reqItem.returnUnits < 1) {
          throw new Error('invalid_return_quantity');
        }
        const origItem = itemMap.get(reqItem.billItemId);
        if (!origItem) {
          throw new Error(`bill_item_not_found:${reqItem.billItemId}`);
        }

        const alreadyReturned =
          (alreadyReturnedByItem.get(reqItem.billItemId) || 0) +
          (requestedInThisReturn.get(reqItem.billItemId) || 0);
        const remainingReturnable = origItem.qtyUnits - alreadyReturned;

        if (reqItem.returnUnits > remainingReturnable) {
          throw new Error(`return_exceeds_sold:${origItem.medicineName}`);
        }

        requestedInThisReturn.set(
          reqItem.billItemId,
          (requestedInThisReturn.get(reqItem.billItemId) || 0) + reqItem.returnUnits
        );

        const refundPaise =
          reqItem.returnUnits === origItem.qtyUnits
            ? origItem.lineTotalPaise
            : Math.round((origItem.lineTotalPaise * reqItem.returnUnits) / origItem.qtyUnits);

        totalRefundPaise += refundPaise;
        totalCurrentReturnUnits += reqItem.returnUnits;

        storedItems.push({
          billItemId: reqItem.billItemId,
          medicineId: origItem.medicineId,
          batchId: origItem.batchId,
          returnUnits: reqItem.returnUnits,
          refundPaise,
        });

        movementsToWrite.push({
          batchId: origItem.batchId,
          medicineId: origItem.medicineId,
          qtyUnits: reqItem.returnUnits,
        });
      }

      const maxAllowedRefundPaise = Math.max(0, originalBill.totalPaise - totalPrevRefundedPaise);
      if (totalRefundPaise > maxAllowedRefundPaise) {
        totalRefundPaise = maxAllowedRefundPaise;
      }

      const totalReturnedAfter = totalPrevReturnedUnits + totalCurrentReturnUnits;
      const newBillStatus: BillStatus =
        totalReturnedAfter >= totalSoldUnits ? 'returned_full' : 'returned_partial';

      const returnNo = await generateNextReturnNo(originalBill.date);
      const nowIso = new Date().toISOString();

      const billReturnId = Number(
        await db.billReturns.add({
          returnNo,
          originalBillId: originalBill.id!,
          originalBillNo: originalBill.billNo,
          refundMode: draft.refundMode,
          totalRefundPaise,
          itemsJson: JSON.stringify(storedItems),
          reason: (draft.reason || '').trim() || 'Customer return',
          approvedBy,
          createdAt: nowIso,
        } satisfies BillReturn)
      );

      for (const mv of movementsToWrite) {
        await db.stockMovements.add({
          batchId: mv.batchId,
          medicineId: mv.medicineId,
          type: 'customer_return',
          qtyUnits: mv.qtyUnits,
          reference: returnNo,
          who: whoName,
          at: nowIso,
        });
      }

      // Allowed update by Dexie hook: status only -> 'returned_partial' | 'returned_full'
      await db.bills.update(originalBill.id!, { status: newBillStatus });

      await addAudit(
        whoName,
        'bill_returned',
        originalBill.billNo,
        `Return ${returnNo} for Bill ${originalBill.billNo}: ${totalCurrentReturnUnits} units (${draft.refundMode})`
      );

      return {
        billReturnId,
        returnNo,
        totalRefundPaise,
        newBillStatus,
      };
    }
  );
}

/**
 * Saves a held bill for resuming later.
 */
export async function holdBill(
  input: Omit<HeldBill, 'id' | 'heldAt'>
): Promise<number> {
  return Number(
    await db.heldBills.add({
      ...input,
      heldAt: new Date().toISOString(),
    })
  );
}

export async function getHeldBills(): Promise<HeldBill[]> {
  return db.heldBills.orderBy('heldAt').reverse().toArray();
}

export async function deleteHeldBill(id: number): Promise<void> {
  await db.heldBills.delete(id);
}
