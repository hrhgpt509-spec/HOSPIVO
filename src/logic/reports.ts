import {
  db,
  type AuditLogEntry,
  type Batch,
  type Bill,
  type BillItem,
  type BillReturn,
  type Customer,
  type DailyClosing,
  type DBUser,
  type Medicine,
  type Purchase,
  type PurchaseLine,
  type StockMovement,
  type Supplier,
  type UdhaarPayment,
  type UserRole,
} from '../db';
import { canSeeProfit, canSeePurchasePrice } from './roles';
import { expiryBucket, isReorderNeeded, parseDateOnly } from './stock';
import { computeUdhaarLedgers, getBillUdhaarPaise } from './udhaar';

export type ReportPreset = 'today' | 'month' | 'custom';

export interface ReportDateRange {
  preset: ReportPreset;
  startDate?: string;
  endDate?: string;
}

export type RoleUser =
  | DBUser
  | { id?: string; name?: string; role?: UserRole | string }
  | null
  | undefined;

export function resolveDateBounds(
  range: ReportDateRange,
  today?: Date | string
): { startDate: string; endDate: string; todayStr: string } {
  const todayStr = parseDateOnly(today);
  const [yStr, mStr] = todayStr.split('-');

  if (range.preset === 'today') {
    return { startDate: todayStr, endDate: todayStr, todayStr };
  }
  if (range.preset === 'month') {
    return { startDate: `${yStr}-${mStr}-01`, endDate: todayStr, todayStr };
  }
  return {
    startDate: (range.startDate || '').split('T')[0],
    endDate: (range.endDate || '').split('T')[0],
    todayStr,
  };
}

function isInDateBounds(dateStr: string, startDate: string, endDate: string): boolean {
  const d = (dateStr || '').split('T')[0];
  if (!d) return false;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

export interface HomeLiveCounters {
  todaySalesPaise: number;
  todayBillsCount: number;
  expiring30Count: number;
  lowStockCount: number;
  combinedAlertsCount: number;
}

/**
 * Pure computation of Home live counters (safe for all roles; zero profit or purchase rates).
 */
export function computeHomeLiveCounters(params: {
  bills: Bill[];
  billReturns: BillReturn[];
  medicines: Medicine[];
  batches: Batch[];
  stockMovements: StockMovement[];
  today?: Date | string;
}): HomeLiveCounters {
  const { bills, billReturns, medicines, batches, stockMovements, today } = params;
  const todayStr = parseDateOnly(today);

  const todayBills = bills.filter((b) => (b.date || b.createdAt || '').split('T')[0] === todayStr);
  const grossTodayPaise = todayBills.reduce((sum, b) => sum + Math.max(0, b.totalPaise || 0), 0);

  const todayReturnsPaise = billReturns
    .filter((r) => (r.createdAt || '').split('T')[0] === todayStr)
    .reduce((sum, r) => sum + Math.max(0, r.totalRefundPaise || 0), 0);

  const todaySalesPaise = Math.max(0, grossTodayPaise - todayReturnsPaise);
  const todayBillsCount = todayBills.length;

  const stockByBatch = new Map<number, number>();
  const stockByMedicine = new Map<number, number>();
  for (const mv of stockMovements) {
    stockByBatch.set(mv.batchId, (stockByBatch.get(mv.batchId) || 0) + mv.qtyUnits);
    stockByMedicine.set(mv.medicineId, (stockByMedicine.get(mv.medicineId) || 0) + mv.qtyUnits);
  }

  let expiring30Count = 0;
  for (const batch of batches) {
    if (batch.id === undefined) continue;
    const qty = stockByBatch.get(batch.id) || 0;
    if (qty <= 0) continue;
    if (expiryBucket(batch, todayStr) === '30') {
      expiring30Count += 1;
    }
  }

  let lowStockCount = 0;
  for (const med of medicines) {
    if (!med.active || med.id === undefined) continue;
    const qty = stockByMedicine.get(med.id) || 0;
    if (isReorderNeeded(qty, med.minStockUnits || 0)) {
      lowStockCount += 1;
    }
  }

  return {
    todaySalesPaise,
    todayBillsCount,
    expiring30Count,
    lowStockCount,
    combinedAlertsCount: expiring30Count + lowStockCount,
  };
}

export async function loadHomeLiveCounters(today?: Date | string): Promise<HomeLiveCounters> {
  const [bills, billReturns, medicines, batches, stockMovements] = await Promise.all([
    db.bills.toArray(),
    db.billReturns.toArray(),
    db.medicines.toArray(),
    db.batches.toArray(),
    db.stockMovements.toArray(),
  ]);

  return computeHomeLiveCounters({
    bills,
    billReturns,
    medicines,
    batches,
    stockMovements,
    today,
  });
}

export interface OwnerDashboardMetrics {
  todaySalesPaise: number;
  todayBillsCount: number;
  monthSalesPaise: number;
  rangeSalesPaise: number;
  rangeBillsCount: number;
  estimatedProfitPaise: number;
  pendingUdhaarPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  udhaarSalesPaise: number;
  stockValueMrpPaise: number;
  stockValueCostPaise: number;
  expiring30Count: number;
  lowStockCount: number;
  topSellingMedicines: Array<{ medicineName: string; totalUnits: number; packs: number }>;
  expiringBatchesTop: Array<{ medicineName: string; batchNo: string; expiry: string }>;
  lowStockMedicinesTop: Array<{ medicineName: string; packsLeft: number; looseLeft: number }>;
  recentClosing: DailyClosing | null;
}

/**
 * Computes comprehensive Owner-only dashboard metrics in whole paise.
 * Strictly returns null for non-owner users so profit & purchase cost are never computed or exposed.
 */
export function computeOwnerDashboardMetrics(params: {
  user: RoleUser;
  bills: Bill[];
  billItems: BillItem[];
  billReturns: BillReturn[];
  udhaarPayments: UdhaarPayment[];
  customers: Customer[];
  medicines: Medicine[];
  batches: Batch[];
  stockMovements: StockMovement[];
  dailyClosings: DailyClosing[];
  range: ReportDateRange;
  today?: Date | string;
}): OwnerDashboardMetrics | null {
  const {
    user,
    bills,
    billItems,
    billReturns,
    udhaarPayments,
    customers,
    medicines,
    batches,
    stockMovements,
    dailyClosings,
    range,
    today,
  } = params;

  if (!canSeeProfit(user) || !canSeePurchasePrice(user)) {
    return null;
  }

  const { startDate, endDate, todayStr } = resolveDateBounds(range, today);
  const [yStr, mStr] = todayStr.split('-');
  const monthStart = `${yStr}-${mStr}-01`;

  const netSalesForWindow = (sDate: string, eDate: string) => {
    const windowBills = bills.filter((b) =>
      isInDateBounds(b.date || b.createdAt, sDate, eDate)
    );
    const gross = windowBills.reduce((s, b) => s + Math.max(0, b.totalPaise || 0), 0);
    const retSum = billReturns
      .filter((r) => isInDateBounds(r.createdAt, sDate, eDate))
      .reduce((s, r) => s + Math.max(0, r.totalRefundPaise || 0), 0);
    return {
      netPaise: Math.max(0, gross - retSum),
      bills: windowBills,
    };
  };

  const todayStats = netSalesForWindow(todayStr, todayStr);
  const monthStats = netSalesForWindow(monthStart, todayStr);
  const rangeStats = netSalesForWindow(startDate, endDate);

  let cashSalesPaise = 0;
  let upiSalesPaise = 0;
  let udhaarSalesPaise = 0;
  const rangeBillIds = new Set<number>();

  for (const bill of rangeStats.bills) {
    if (bill.id !== undefined) rangeBillIds.add(bill.id);
    if (bill.paymentMode === 'cash') {
      cashSalesPaise += Math.max(0, bill.totalPaise || 0);
    } else if (bill.paymentMode === 'upi') {
      upiSalesPaise += Math.max(0, bill.totalPaise || 0);
    } else if (bill.paymentMode === 'udhaar') {
      udhaarSalesPaise += Math.max(0, bill.totalPaise || 0);
    } else if (bill.paymentMode === 'split' && bill.splitDetails) {
      try {
        const parsed = JSON.parse(bill.splitDetails) as {
          cashPaise?: number;
          upiPaise?: number;
          udhaarPaise?: number;
        };
        cashSalesPaise += Math.max(0, Math.round(parsed.cashPaise || 0));
        upiSalesPaise += Math.max(0, Math.round(parsed.upiPaise || 0));
        udhaarSalesPaise += Math.max(0, Math.round(parsed.udhaarPaise || 0));
      } catch {
        // Ignore malformed JSON
      }
    }
  }

  const batchMap = new Map<number, Batch>();
  for (const b of batches) {
    if (b.id !== undefined) batchMap.set(b.id, b);
  }
  const medMap = new Map<number, Medicine>();
  for (const m of medicines) {
    if (m.id !== undefined) medMap.set(m.id, m);
  }

  // Build returned units per billItemId from all returns linked to rangeBills
  const returnedUnitsByItemId = new Map<number, number>();
  for (const ret of billReturns) {
    if (!rangeBillIds.has(ret.originalBillId)) continue;
    try {
      const entries = JSON.parse(ret.itemsJson) as Array<{
        billItemId: number;
        returnUnits: number;
      }>;
      for (const e of entries) {
        returnedUnitsByItemId.set(
          e.billItemId,
          (returnedUnitsByItemId.get(e.billItemId) || 0) + Math.max(0, e.returnUnits || 0)
        );
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  // Estimated Gross Profit = Net Selling Total - Batch Purchase Cost of net sold units
  let soldCostPaise = 0;
  const unitsByMedicine = new Map<string, { name: string; units: number; upp: number }>();

  for (const item of billItems) {
    if (!rangeBillIds.has(item.billId)) continue;
    const retUnits = item.id !== undefined ? returnedUnitsByItemId.get(item.id) || 0 : 0;
    const netUnits = Math.max(0, item.qtyUnits - retUnits);
    if (netUnits <= 0) continue;

    const batch = batchMap.get(item.batchId);
    const med = medMap.get(item.medicineId);
    const upp = Math.max(1, item.unitsPerPack || med?.unitsPerPack || 1);

    if (batch && batch.purchaseRatePaise > 0) {
      soldCostPaise += Math.round((netUnits * batch.purchaseRatePaise) / upp);
    }

    const prev = unitsByMedicine.get(item.medicineName) || {
      name: item.medicineName,
      units: 0,
      upp,
    };
    prev.units += netUnits;
    unitsByMedicine.set(item.medicineName, prev);
  }

  const grossRangePaise = rangeStats.bills.reduce(
    (s, b) => s + Math.max(0, b.totalPaise || 0),
    0
  );
  const returnsForRangeBillsPaise = billReturns
    .filter((r) => rangeBillIds.has(r.originalBillId))
    .reduce((s, r) => s + Math.max(0, r.totalRefundPaise || 0), 0);
  const netRangeForProfitPaise = Math.max(0, grossRangePaise - returnsForRangeBillsPaise);
  const estimatedProfitPaise = netRangeForProfitPaise - soldCostPaise;

  // Stock Valuation + Expiry + Low Stock
  const stockByBatch = new Map<number, number>();
  const stockByMedicine = new Map<number, number>();
  for (const mv of stockMovements) {
    stockByBatch.set(mv.batchId, (stockByBatch.get(mv.batchId) || 0) + mv.qtyUnits);
    stockByMedicine.set(mv.medicineId, (stockByMedicine.get(mv.medicineId) || 0) + mv.qtyUnits);
  }

  let stockValueMrpPaise = 0;
  let stockValueCostPaise = 0;
  const expiringBatchesTop: Array<{ medicineName: string; batchNo: string; expiry: string }> = [];

  for (const batch of batches) {
    if (batch.id === undefined) continue;
    const qty = stockByBatch.get(batch.id) || 0;
    if (qty <= 0) continue;

    const med = medMap.get(batch.medicineId);
    const upp = Math.max(1, med?.unitsPerPack || 1);
    const unitMrp = batch.mrpPaise || med?.mrpPaise || 0;
    stockValueMrpPaise += Math.round((qty * unitMrp) / upp);
    stockValueCostPaise += Math.round((qty * batch.purchaseRatePaise) / upp);

    if (expiryBucket(batch, todayStr) === '30') {
      expiringBatchesTop.push({
        medicineName: med ? `${med.name} ${med.strength}`.trim() : batch.batchNo,
        batchNo: batch.batchNo,
        expiry: batch.expiry,
      });
    }
  }
  expiringBatchesTop.sort((a, b) => a.expiry.localeCompare(b.expiry));

  const lowStockMedicinesTop: Array<{
    medicineName: string;
    packsLeft: number;
    looseLeft: number;
  }> = [];
  for (const med of medicines) {
    if (!med.active || med.id === undefined) continue;
    const qty = stockByMedicine.get(med.id) || 0;
    if (isReorderNeeded(qty, med.minStockUnits || 0)) {
      const upp = Math.max(1, med.unitsPerPack || 1);
      lowStockMedicinesTop.push({
        medicineName: `${med.name} ${med.strength}`.trim(),
        packsLeft: Math.floor(qty / upp),
        looseLeft: qty % upp,
      });
    }
  }

  const topSellingMedicines = Array.from(unitsByMedicine.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 5)
    .map((x) => ({
      medicineName: x.name,
      totalUnits: x.units,
      packs: Math.floor(x.units / Math.max(1, x.upp)),
    }));

  const udhaarLedgers = computeUdhaarLedgers({
    customers,
    bills,
    billReturns,
    udhaarPayments,
    today: todayStr,
  });

  const sortedClosings = [...dailyClosings].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  return {
    todaySalesPaise: todayStats.netPaise,
    todayBillsCount: todayStats.bills.length,
    monthSalesPaise: monthStats.netPaise,
    rangeSalesPaise: rangeStats.netPaise,
    rangeBillsCount: rangeStats.bills.length,
    estimatedProfitPaise,
    pendingUdhaarPaise: udhaarLedgers.totalOutstandingPaise,
    cashSalesPaise,
    upiSalesPaise,
    udhaarSalesPaise,
    stockValueMrpPaise,
    stockValueCostPaise,
    expiring30Count: expiringBatchesTop.length,
    lowStockCount: lowStockMedicinesTop.length,
    topSellingMedicines,
    expiringBatchesTop: expiringBatchesTop.slice(0, 5),
    lowStockMedicinesTop: lowStockMedicinesTop.slice(0, 5),
    recentClosing: sortedClosings[0] || null,
  };
}

// -------------------------------------------------------------
// Report 1: Sales Report
// -------------------------------------------------------------

export interface SalesReportRow {
  id: number;
  billNo: string;
  date: string;
  customerName: string;
  paymentMode: Bill['paymentMode'];
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
  status: Bill['status'];
  udhaarPortionPaise: number;
}

export interface SalesReportResult {
  rows: SalesReportRow[];
  totalTaxablePaise: number;
  totalGstPaise: number;
  totalSalesPaise: number;
}

export function buildSalesReport(
  bills: Bill[],
  range: ReportDateRange,
  today?: Date | string
): SalesReportResult {
  const { startDate, endDate } = resolveDateBounds(range, today);

  const filtered = bills
    .filter((b) => isInDateBounds(b.date || b.createdAt, startDate, endDate))
    .sort(
      (a, b) =>
        (b.date || '').localeCompare(a.date || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '') ||
        (b.id || 0) - (a.id || 0)
    );

  const rows: SalesReportRow[] = filtered.map((b) => ({
    id: b.id || 0,
    billNo: b.billNo,
    date: (b.date || b.createdAt || '').split('T')[0],
    customerName: b.customerName || '',
    paymentMode: b.paymentMode,
    taxablePaise: b.taxablePaise || 0,
    gstPaise: b.gstPaise || 0,
    totalPaise: b.totalPaise || 0,
    status: b.status,
    udhaarPortionPaise: getBillUdhaarPaise(b),
  }));

  return {
    rows,
    totalTaxablePaise: rows.reduce((s, r) => s + r.taxablePaise, 0),
    totalGstPaise: rows.reduce((s, r) => s + r.gstPaise, 0),
    totalSalesPaise: rows.reduce((s, r) => s + r.totalPaise, 0),
  };
}

// -------------------------------------------------------------
// Report 2: GST Summary Report (0%, 5%, 12%, 18%)
// -------------------------------------------------------------

export interface GstSlabRow {
  gstPercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalTaxPaise: number;
  invoiceValuePaise: number;
}

export interface GstSummaryResult {
  slabs: GstSlabRow[];
  totalTaxablePaise: number;
  totalCgstPaise: number;
  totalSgstPaise: number;
  totalTaxPaise: number;
  totalInvoiceValuePaise: number;
}

export function buildGstSummaryReport(params: {
  bills: Bill[];
  billItems: BillItem[];
  billReturns: BillReturn[];
  range: ReportDateRange;
  today?: Date | string;
}): GstSummaryResult {
  const { bills, billItems, billReturns, range, today } = params;
  const { startDate, endDate } = resolveDateBounds(range, today);

  const rangeBillIds = new Set(
    bills
      .filter((b) => isInDateBounds(b.date || b.createdAt, startDate, endDate))
      .map((b) => b.id)
      .filter((id): id is number => id !== undefined)
  );

  const returnedUnitsByItemId = new Map<number, number>();
  for (const ret of billReturns) {
    if (!rangeBillIds.has(ret.originalBillId)) continue;
    try {
      const entries = JSON.parse(ret.itemsJson) as Array<{
        billItemId: number;
        returnUnits: number;
      }>;
      for (const e of entries) {
        returnedUnitsByItemId.set(
          e.billItemId,
          (returnedUnitsByItemId.get(e.billItemId) || 0) + Math.max(0, e.returnUnits || 0)
        );
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  const slabTotals = new Map<number, { taxablePaise: number; gstPaise: number }>();
  for (const stdSlab of [0, 5, 12, 18]) {
    slabTotals.set(stdSlab, { taxablePaise: 0, gstPaise: 0 });
  }

  for (const item of billItems) {
    if (!rangeBillIds.has(item.billId)) continue;
    const retUnits = item.id !== undefined ? returnedUnitsByItemId.get(item.id) || 0 : 0;
    const remainingUnits = Math.max(0, item.qtyUnits - retUnits);
    if (remainingUnits <= 0 || item.qtyUnits <= 0) continue;

    const taxable =
      remainingUnits === item.qtyUnits
        ? item.taxablePaise
        : Math.round((item.taxablePaise * remainingUnits) / item.qtyUnits);
    const gst =
      remainingUnits === item.qtyUnits
        ? item.gstPaise
        : Math.round((item.gstPaise * remainingUnits) / item.qtyUnits);

    const slabKey = Number(item.gstPercent || 0);
    const prev = slabTotals.get(slabKey) || { taxablePaise: 0, gstPaise: 0 };
    prev.taxablePaise += taxable;
    prev.gstPaise += gst;
    slabTotals.set(slabKey, prev);
  }

  const slabs: GstSlabRow[] = Array.from(slabTotals.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gstPercent, val]) => {
      const cgstPaise = Math.floor(val.gstPaise / 2);
      const sgstPaise = val.gstPaise - cgstPaise;
      return {
        gstPercent,
        taxablePaise: val.taxablePaise,
        cgstPaise,
        sgstPaise,
        totalTaxPaise: val.gstPaise,
        invoiceValuePaise: val.taxablePaise + val.gstPaise,
      };
    });

  return {
    slabs,
    totalTaxablePaise: slabs.reduce((s, r) => s + r.taxablePaise, 0),
    totalCgstPaise: slabs.reduce((s, r) => s + r.cgstPaise, 0),
    totalSgstPaise: slabs.reduce((s, r) => s + r.sgstPaise, 0),
    totalTaxPaise: slabs.reduce((s, r) => s + r.totalTaxPaise, 0),
    totalInvoiceValuePaise: slabs.reduce((s, r) => s + r.invoiceValuePaise, 0),
  };
}

// -------------------------------------------------------------
// Report 3: Purchase Register (Owner-only)
// -------------------------------------------------------------

export interface PurchaseRegisterRow {
  purchaseId: number;
  date: string;
  supplierName: string;
  supplierGstNo: string;
  invoiceNo: string;
  itemsCount: number;
  totalAmountPaise: number;
  verified: boolean;
}

export interface PurchaseRegisterResult {
  rows: PurchaseRegisterRow[];
  totalAmountPaise: number;
}

export function buildPurchaseRegister(params: {
  user: RoleUser;
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  suppliers: Supplier[];
  range: ReportDateRange;
  today?: Date | string;
}): PurchaseRegisterResult {
  const { user, purchases, purchaseLines, suppliers, range, today } = params;
  if (!canSeePurchasePrice(user)) {
    return { rows: [], totalAmountPaise: 0 };
  }

  const { startDate, endDate } = resolveDateBounds(range, today);

  const supplierMap = new Map<number, Supplier>();
  for (const s of suppliers) {
    if (s.id !== undefined) supplierMap.set(s.id, s);
  }

  const linesByPurchase = new Map<number, PurchaseLine[]>();
  for (const l of purchaseLines) {
    if (!l.purchaseId) continue;
    const arr = linesByPurchase.get(l.purchaseId) || [];
    arr.push(l);
    linesByPurchase.set(l.purchaseId, arr);
  }

  const filtered = purchases
    .filter((p) => isInDateBounds(p.date || p.createdAt || '', startDate, endDate))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || 0) - (a.id || 0));

  const rows: PurchaseRegisterRow[] = filtered.map((p) => {
    const sup = supplierMap.get(p.supplierId);
    const lines = p.id !== undefined ? linesByPurchase.get(p.id) || [] : [];
    const totalAmountPaise = lines.reduce(
      (sum, l) => sum + Math.max(0, l.packs || 0) * Math.max(0, l.purchaseRatePaise || 0),
      0
    );
    return {
      purchaseId: p.id || 0,
      date: (p.date || '').split('T')[0],
      supplierName: sup?.name || '',
      supplierGstNo: sup?.gstNo || '',
      invoiceNo: p.invoiceNo,
      itemsCount: lines.length,
      totalAmountPaise,
      verified: Boolean(p.verified),
    };
  });

  return {
    rows,
    totalAmountPaise: rows.reduce((s, r) => s + r.totalAmountPaise, 0),
  };
}

// -------------------------------------------------------------
// Report 4: Schedule H / H1 Register
// -------------------------------------------------------------

export interface ScheduleHRow {
  billItemId: number;
  date: string;
  billNo: string;
  patientName: string;
  doctorName: string;
  prescriptionChecked: boolean;
  medicineName: string;
  batchNo: string;
  qtyInput: number;
  unitMode: BillItem['unitMode'];
  qtyUnits: number;
}

export function buildScheduleHRegister(params: {
  bills: Bill[];
  billItems: BillItem[];
  range: ReportDateRange;
  today?: Date | string;
}): ScheduleHRow[] {
  const { bills, billItems, range, today } = params;
  const { startDate, endDate } = resolveDateBounds(range, today);

  const billMap = new Map<number, Bill>();
  for (const b of bills) {
    if (b.id !== undefined && isInDateBounds(b.date || b.createdAt, startDate, endDate)) {
      billMap.set(b.id, b);
    }
  }

  const rows: ScheduleHRow[] = [];
  for (const item of billItems) {
    if (!item.isScheduleH) continue;
    const bill = billMap.get(item.billId);
    if (!bill) continue;

    rows.push({
      billItemId: item.id || 0,
      date: (bill.date || bill.createdAt || '').split('T')[0],
      billNo: bill.billNo,
      patientName: item.patientName || bill.customerName || '',
      doctorName: item.doctorName || bill.doctorName || '',
      prescriptionChecked: Boolean(item.prescriptionChecked),
      medicineName: item.medicineName,
      batchNo: item.batchNo,
      qtyInput: item.qtyInput,
      unitMode: item.unitMode,
      qtyUnits: item.qtyUnits,
    });
  }

  rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.billNo.localeCompare(a.billNo) ||
      b.billItemId - a.billItemId
  );

  return rows;
}

// -------------------------------------------------------------
// CSV Builders
// -------------------------------------------------------------

function csvEscape(v: string | number | boolean): string {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function paiseToRsDecimal(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function buildSalesReportCsv(result: SalesReportResult): string {
  const header = ['Bill No', 'Date', 'Customer', 'Mode', 'Taxable (Rs)', 'GST (Rs)', 'Total (Rs)', 'Status'].join(',');
  const lines = result.rows.map((r) =>
    [
      csvEscape(r.billNo),
      csvEscape(r.date),
      csvEscape(r.customerName),
      csvEscape(r.paymentMode),
      paiseToRsDecimal(r.taxablePaise),
      paiseToRsDecimal(r.gstPaise),
      paiseToRsDecimal(r.totalPaise),
      csvEscape(r.status),
    ].join(',')
  );
  return [header, ...lines].join('\r\n');
}

export function buildGstSummaryCsv(result: GstSummaryResult): string {
  const header = ['GST Slab (%)', 'Taxable Amount (Rs)', 'CGST (Rs)', 'SGST (Rs)', 'Total Tax (Rs)', 'Invoice Value (Rs)'].join(',');
  const lines = result.slabs.map((s) =>
    [
      `${s.gstPercent}%`,
      paiseToRsDecimal(s.taxablePaise),
      paiseToRsDecimal(s.cgstPaise),
      paiseToRsDecimal(s.sgstPaise),
      paiseToRsDecimal(s.totalTaxPaise),
      paiseToRsDecimal(s.invoiceValuePaise),
    ].join(',')
  );
  lines.push(
    [
      'Total',
      paiseToRsDecimal(result.totalTaxablePaise),
      paiseToRsDecimal(result.totalCgstPaise),
      paiseToRsDecimal(result.totalSgstPaise),
      paiseToRsDecimal(result.totalTaxPaise),
      paiseToRsDecimal(result.totalInvoiceValuePaise),
    ].join(',')
  );
  return [header, ...lines].join('\r\n');
}

export function buildPurchaseRegisterCsv(result: PurchaseRegisterResult): string {
  const header = ['Date', 'Supplier', 'Invoice No', 'GST No', 'Items', 'Total Amount (Rs)', 'Verified'].join(',');
  const lines = result.rows.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.supplierName),
      csvEscape(r.invoiceNo),
      csvEscape(r.supplierGstNo),
      String(r.itemsCount),
      paiseToRsDecimal(r.totalAmountPaise),
      r.verified ? 'Yes' : 'No',
    ].join(',')
  );
  return [header, ...lines].join('\r\n');
}

export function buildScheduleHCsv(rows: ScheduleHRow[]): string {
  const header = ['Date', 'Bill No', 'Patient Name', 'Doctor Name', 'Prescription Seen', 'Medicine', 'Batch No', 'Qty Units'].join(',');
  const lines = rows.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.billNo),
      csvEscape(r.patientName),
      csvEscape(r.doctorName),
      r.prescriptionChecked ? 'Yes' : 'No',
      csvEscape(r.medicineName),
      csvEscape(r.batchNo),
      String(r.qtyUnits),
    ].join(',')
  );
  return [header, ...lines].join('\r\n');
}

// -------------------------------------------------------------
// Audit Log Filter Helpers (Read-Only)
// -------------------------------------------------------------

export type AuditTimeFilter = 'all' | 'today' | 'week';

export function filterAuditLogEntries(
  entries: AuditLogEntry[],
  opts: { timeFilter: AuditTimeFilter; actionFilter: string; query: string },
  today?: Date | string
): AuditLogEntry[] {
  const todayStr = parseDateOnly(today);
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const weekAgoDate = new Date(Date.UTC(tY, tM - 1, tD - 6)).toISOString().split('T')[0];

  const q = opts.query.trim().toLowerCase();

  return [...entries]
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '') || (b.id || 0) - (a.id || 0))
    .filter((entry) => {
      const entryDate = (entry.timestamp || '').split('T')[0];
      if (opts.timeFilter === 'today' && entryDate !== todayStr) return false;
      if (opts.timeFilter === 'week' && (entryDate < weekAgoDate || entryDate > todayStr)) {
        return false;
      }
      if (opts.actionFilter && opts.actionFilter !== 'all' && entry.action !== opts.actionFilter) {
        return false;
      }
      if (q) {
        const hay = `${entry.who} ${entry.action} ${entry.record} ${entry.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
}

