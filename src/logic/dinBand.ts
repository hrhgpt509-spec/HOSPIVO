import {
  db,
  type Batch,
  type Bill,
  type BillReturn,
  type DailyClosing,
  type DailyClosingStatus,
  type StockMovement,
  type UdhaarPayment,
} from '../db';
import { addAudit } from '../db/audit';
import { enqueueSyncItem } from './cloudSync';
import {
  DEFAULT_APPROVAL_RULES,
  type ApprovalActionCategory,
  type ApprovalRuleType,
} from './approvals';
import { formatRupees } from './money';
import { expiryBucket, parseDateOnly } from './stock';

export const DENOMINATION_VALUES = [2000, 500, 200, 100, 50, 20, 10] as const;

export interface DenominationCounts {
  d2000: number;
  d500: number;
  d200: number;
  d100: number;
  d50: number;
  d20: number;
  d10: number;
  coinsRupees: number;
}

export function emptyDenominationCounts(): DenominationCounts {
  return {
    d2000: 0,
    d500: 0,
    d200: 0,
    d100: 0,
    d50: 0,
    d20: 0,
    d10: 0,
    coinsRupees: 0,
  };
}

/**
 * Calculates whole-paise total and note count from denomination counts + coins (in whole rupees).
 */
export function computeDenominationTotalPaise(counts: DenominationCounts): {
  totalPaise: number;
  noteCount: number;
} {
  const safe = (n: number) => Math.max(0, Math.floor(n || 0));
  const c2000 = safe(counts.d2000);
  const c500 = safe(counts.d500);
  const c200 = safe(counts.d200);
  const c100 = safe(counts.d100);
  const c50 = safe(counts.d50);
  const c20 = safe(counts.d20);
  const c10 = safe(counts.d10);
  const coins = safe(counts.coinsRupees);

  const totalRupees =
    c2000 * 2000 +
    c500 * 500 +
    c200 * 200 +
    c100 * 100 +
    c50 * 50 +
    c20 * 20 +
    c10 * 10 +
    coins;

  return {
    totalPaise: totalRupees * 100,
    noteCount: c2000 + c500 + c200 + c100 + c50 + c20 + c10,
  };
}

export interface DayClosingSummary {
  date: string;
  openingCashPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  udhaarSalesPaise: number;
  totalSalesPaise: number;
  totalBillsCount: number;
  cashUdhaarCollectedPaise: number;
  upiUdhaarCollectedPaise: number;
  totalUdhaarCollectedPaise: number;
  cashReturnsPaise: number;
  udhaarReturnsPaise: number;
  totalReturnsPaise: number;
  expectedCashPaise: number;
  expiryAlert30DaysCount: number;
}

/**
 * Computes today's expected cash & operational sales summary in whole paise.
 * Expected Cash = Opening Cash + Cash Sales (cash + split cash) + Cash Udhaar Collected - Cash Returns.
 * Never reads or returns purchase prices or profit.
 */
export function computeDayClosingSummary(params: {
  bills: Bill[];
  billReturns: BillReturn[];
  udhaarPayments: UdhaarPayment[];
  batches: Batch[];
  stockMovements: StockMovement[];
  openingCashPaise: number;
  date?: Date | string;
}): DayClosingSummary {
  const {
    bills,
    billReturns,
    udhaarPayments,
    batches,
    stockMovements,
    openingCashPaise,
    date,
  } = params;

  const targetDate = parseDateOnly(date);
  const safeOpening = Math.max(0, Math.round(openingCashPaise || 0));

  let cashSalesPaise = 0;
  let upiSalesPaise = 0;
  let udhaarSalesPaise = 0;
  let totalBillsCount = 0;

  for (const bill of bills) {
    const billDate = (bill.date || bill.createdAt || '').split('T')[0];
    if (billDate !== targetDate) continue;

    totalBillsCount += 1;

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
        // Ignore malformed splitDetails JSON
      }
    }
  }

  let cashUdhaarCollectedPaise = 0;
  let upiUdhaarCollectedPaise = 0;
  for (const pay of udhaarPayments) {
    const payDate = (pay.createdAt || '').split('T')[0];
    if (payDate !== targetDate) continue;
    if (pay.mode === 'cash') {
      cashUdhaarCollectedPaise += Math.max(0, pay.amountPaise || 0);
    } else if (pay.mode === 'upi') {
      upiUdhaarCollectedPaise += Math.max(0, pay.amountPaise || 0);
    }
  }

  let cashReturnsPaise = 0;
  let udhaarReturnsPaise = 0;
  for (const ret of billReturns) {
    const retDate = (ret.createdAt || '').split('T')[0];
    if (retDate !== targetDate) continue;
    if (ret.refundMode === 'cash') {
      cashReturnsPaise += Math.max(0, ret.totalRefundPaise || 0);
    } else if (ret.refundMode === 'udhaar_adjust') {
      udhaarReturnsPaise += Math.max(0, ret.totalRefundPaise || 0);
    }
  }

  const expectedCashPaise =
    safeOpening + cashSalesPaise + cashUdhaarCollectedPaise - cashReturnsPaise;

  // Count active (>0 stock) batches in 30-day expiry window
  const stockByBatch = new Map<number, number>();
  for (const mv of stockMovements) {
    stockByBatch.set(mv.batchId, (stockByBatch.get(mv.batchId) || 0) + mv.qtyUnits);
  }
  let expiryAlert30DaysCount = 0;
  for (const batch of batches) {
    if (batch.id === undefined) continue;
    const qty = stockByBatch.get(batch.id) || 0;
    if (qty <= 0) continue;
    if (expiryBucket(batch, targetDate) === '30') {
      expiryAlert30DaysCount += 1;
    }
  }

  return {
    date: targetDate,
    openingCashPaise: safeOpening,
    cashSalesPaise,
    upiSalesPaise,
    udhaarSalesPaise,
    totalSalesPaise: cashSalesPaise + upiSalesPaise + udhaarSalesPaise,
    totalBillsCount,
    cashUdhaarCollectedPaise,
    upiUdhaarCollectedPaise,
    totalUdhaarCollectedPaise: cashUdhaarCollectedPaise + upiUdhaarCollectedPaise,
    cashReturnsPaise,
    udhaarReturnsPaise,
    totalReturnsPaise: cashReturnsPaise + udhaarReturnsPaise,
    expectedCashPaise,
    expiryAlert30DaysCount,
  };
}

export interface CashMismatchEvaluation {
  differencePaise: number;
  kind: 'match' | 'short' | 'excess';
  absPaise: number;
}

export function evaluateCashMismatch(
  expectedCashPaise: number,
  countedCashPaise: number
): CashMismatchEvaluation {
  const diff = Math.round(countedCashPaise) - Math.round(expectedCashPaise);
  if (diff === 0) {
    return { differencePaise: 0, kind: 'match', absPaise: 0 };
  }
  return {
    differencePaise: diff,
    kind: diff < 0 ? 'short' : 'excess',
    absPaise: Math.abs(diff),
  };
}

/**
 * Reads the configured offline approval rule for 'cash_mismatch'.
 */
export async function getCashMismatchApprovalRule(): Promise<ApprovalRuleType> {
  try {
    const item = await db.settings.get('approval_rules');
    const rules = item?.value as Partial<Record<ApprovalActionCategory, ApprovalRuleType>> | undefined;
    if (rules && rules.cash_mismatch) {
      return rules.cash_mismatch;
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_APPROVAL_RULES.cash_mismatch;
}

export interface SaveDailyClosingInput {
  date: string;
  openingCashPaise: number;
  expectedCashPaise: number;
  countedCashPaise: number;
  denominationJson: string;
  counterPhoto: string;
  status: DailyClosingStatus;
  approvalVerified?: boolean;
  authorizedBy?: string;
  closedBy: string;
  notes?: string;
}

/**
 * Persists a DailyClosing record and writes a fixed English audit entry
 * ('din_band_saved' or 'din_band_pending_auth').
 * Strictly refuses to mark a mismatched closing as 'completed' without authorization.
 */
export async function saveDailyClosing(input: SaveDailyClosingInput): Promise<DailyClosing> {
  const expectedCashPaise = Math.round(input.expectedCashPaise);
  const countedCashPaise = Math.round(input.countedCashPaise);
  const differencePaise = countedCashPaise - expectedCashPaise;

  if (differencePaise !== 0 && input.status === 'completed' && !input.approvalVerified) {
    throw new Error('Mismatched cash closing cannot be marked completed without authorization');
  }

  const now = new Date().toISOString();
  const closedBy = (input.closedBy || 'User').trim() || 'User';
  const authorizedBy =
    differencePaise === 0
      ? ''
      : input.status === 'completed'
        ? (input.authorizedBy || 'Approval PIN').trim()
        : '';

  const record: DailyClosing = {
    date: input.date,
    openingCashPaise: Math.max(0, Math.round(input.openingCashPaise)),
    expectedCashPaise,
    countedCashPaise,
    differencePaise,
    denominationJson: input.denominationJson || '{}',
    counterPhoto: input.counterPhoto || '',
    status: input.status,
    authorizedBy,
    closedBy,
    notes: (input.notes || '').trim(),
    createdAt: now,
  };

  const saved = await db.transaction('rw', [db.dailyClosings, db.auditLog], async () => {
    const id = (await db.dailyClosings.add(record)) as number;

    const auditAction =
      record.status === 'completed' ? 'din_band_saved' : 'din_band_pending_auth';
    const auditDetails =
      record.status === 'completed'
        ? `Saved completed day closing for ${record.date} (difference: ${formatRupees(differencePaise)})`
        : `Saved pending day closing count for ${record.date} awaiting authorization (difference: ${formatRupees(differencePaise)})`;

    await addAudit(closedBy, auditAction, `DailyClosing #${id}`, auditDetails);

    return { ...record, id };
  });

  enqueueSyncItem('daily_closing', saved.id!, saved).catch(() => {});

  return saved;
}

export async function loadDinBandData(openingCashPaise = 0, date?: Date | string) {
  const [bills, billReturns, udhaarPayments, batches, stockMovements, mismatchRule, todayClosings] =
    await Promise.all([
      db.bills.toArray(),
      db.billReturns.toArray(),
      db.udhaarPayments.toArray(),
      db.batches.toArray(),
      db.stockMovements.toArray(),
      getCashMismatchApprovalRule(),
      db.dailyClosings.orderBy('createdAt').reverse().toArray(),
    ]);

  const summary = computeDayClosingSummary({
    bills,
    billReturns,
    udhaarPayments,
    batches,
    stockMovements,
    openingCashPaise,
    date,
  });

  return {
    summary,
    mismatchRule,
    todayClosings: todayClosings.filter((c) => c.date === summary.date),
  };
}

export interface DinBandWhatsAppLabels {
  heading: string;
  dateLabel: string;
  totalSalesLabel: string;
  billsLabel: string;
  cashSalesLabel: string;
  upiSalesLabel: string;
  udhaarSalesLabel: string;
  udhaarCollectedLabel: string;
  returnsLabel: string;
  expectedCashLabel: string;
  countedCashLabel: string;
  differenceLabel: string;
  statusLabel: string;
  statusCompletedText: string;
  statusPendingText: string;
}

/**
 * Formats end-of-day report text for WhatsApp in the current language.
 * Strictly contains NO profit or purchase rate figures.
 */
export function buildDinBandWhatsAppText(params: {
  shopName: string;
  summary: DayClosingSummary;
  countedCashPaise: number;
  status: DailyClosingStatus;
  labels: DinBandWhatsAppLabels;
}): string {
  const { shopName, summary, countedCashPaise, status, labels } = params;
  const diff = evaluateCashMismatch(summary.expectedCashPaise, countedCashPaise);
  const diffText =
    diff.differencePaise === 0
      ? formatRupees(0)
      : diff.differencePaise < 0
        ? `-${formatRupees(diff.absPaise)}`
        : `+${formatRupees(diff.absPaise)}`;

  const lines = [
    shopName ? `${shopName} — ${labels.heading}` : labels.heading,
    `${labels.dateLabel}: ${summary.date}`,
    `-------------------------`,
    `${labels.totalSalesLabel}: ${formatRupees(summary.totalSalesPaise)} (${labels.billsLabel}: ${summary.totalBillsCount})`,
    `${labels.cashSalesLabel}: ${formatRupees(summary.cashSalesPaise)}`,
    `${labels.upiSalesLabel}: ${formatRupees(summary.upiSalesPaise)}`,
    `${labels.udhaarSalesLabel}: ${formatRupees(summary.udhaarSalesPaise)}`,
    `${labels.udhaarCollectedLabel}: ${formatRupees(summary.totalUdhaarCollectedPaise)}`,
    `${labels.returnsLabel}: ${formatRupees(summary.totalReturnsPaise)}`,
    `-------------------------`,
    `${labels.expectedCashLabel}: ${formatRupees(summary.expectedCashPaise)}`,
    `${labels.countedCashLabel}: ${formatRupees(countedCashPaise)}`,
    `${labels.differenceLabel}: ${diffText}`,
    `${labels.statusLabel}: ${status === 'completed' ? labels.statusCompletedText : labels.statusPendingText}`,
  ];

  return lines.join('\n');
}

export function buildDinBandWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

