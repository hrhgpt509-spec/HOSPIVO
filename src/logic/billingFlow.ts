import { db, type Bill, type BillItem, type BillReturn } from '../db';
import { DEFAULT_APPROVAL_RULES, type ApprovalActionCategory, type ApprovalRuleType } from './approvals';
import { formatRupees } from './money';

export interface CashChangeResult {
  valid: boolean;
  changePaise: number;
  shortagePaise: number;
}

/**
 * Calculates whole-paise change for cash tendered vs bill total.
 */
export function calculateCashChange(
  totalPaise: number,
  cashReceivedPaise: number
): CashChangeResult {
  const safeTotal = Math.max(0, Math.round(totalPaise));
  const safeReceived = Math.max(0, Math.round(cashReceivedPaise));
  if (safeReceived >= safeTotal) {
    return {
      valid: true,
      changePaise: safeReceived - safeTotal,
      shortagePaise: 0,
    };
  }
  return {
    valid: false,
    changePaise: 0,
    shortagePaise: safeTotal - safeReceived,
  };
}

export interface SplitPaymentResult {
  valid: boolean;
  remainingPaise: number;
}

/**
 * Validates that Cash + UPI portions equal the exact bill total in whole paise.
 */
export function validateSplitPayment(
  totalPaise: number,
  cashPartPaise: number,
  upiPartPaise: number
): SplitPaymentResult {
  const safeTotal = Math.max(0, Math.round(totalPaise));
  if (
    !Number.isInteger(cashPartPaise) ||
    !Number.isInteger(upiPartPaise) ||
    cashPartPaise < 0 ||
    upiPartPaise < 0
  ) {
    return { valid: false, remainingPaise: safeTotal };
  }
  const sum = cashPartPaise + upiPartPaise;
  return {
    valid: sum === safeTotal,
    remainingPaise: safeTotal - sum,
  };
}

export interface WhatsAppBillLabels {
  greeting: string;
  billLabel: string;
  dateLabel: string;
  itemsHeading: string;
  totalLabel: string;
  modeLabel: string;
  stripWord: string;
  looseWord: string;
  thanks: string;
}

/**
 * Builds a clean plain-text bill receipt summary for WhatsApp sharing using t()-supplied labels.
 * Safe offline (no network calls).
 */
export function buildWhatsAppBillText(
  bill: Pick<Bill, 'billNo' | 'date' | 'totalPaise' | 'paymentMode'>,
  items: Array<Pick<BillItem, 'medicineName' | 'unitMode' | 'qtyInput' | 'lineTotalPaise'>>,
  shopName: string,
  labels: WhatsAppBillLabels
): string {
  const lines: string[] = [];
  if (shopName.trim()) {
    lines.push(`*${shopName.trim()}*`);
  }
  lines.push(labels.greeting);
  lines.push(`${labels.billLabel}: #${bill.billNo}`);
  lines.push(`${labels.dateLabel}: ${bill.date}`);
  lines.push('');
  lines.push(labels.itemsHeading);

  for (const item of items) {
    const unitLabel = item.unitMode === 'pack' ? labels.stripWord : labels.looseWord;
    lines.push(
      `• ${item.medicineName} (${item.qtyInput} ${unitLabel}) - ${formatRupees(item.lineTotalPaise)}`
    );
  }

  lines.push('');
  lines.push(`*${labels.totalLabel}: ${formatRupees(bill.totalPaise)}*`);
  lines.push(`${labels.modeLabel}: ${bill.paymentMode.toUpperCase()}`);
  lines.push(labels.thanks);

  return lines.join('\n');
}

/**
 * Builds an offline-safe https://wa.me link with prefilled message (and phone if available).
 */
export function buildWhatsAppBillUrl(phone: string | undefined, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const formattedPhone = digits.length === 10 ? `91${digits}` : digits;
  const encoded = encodeURIComponent(message);
  if (formattedPhone) {
    return `https://wa.me/${formattedPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/**
 * Filters bills by bill number, customer name, or customer phone, sorted newest first.
 */
export function searchBills(bills: Bill[], query: string): Bill[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? bills.filter((b) => {
        const noMatch = b.billNo?.toLowerCase().includes(q);
        const nameMatch = b.customerName?.toLowerCase().includes(q);
        const phoneMatch = b.customerPhone?.toLowerCase().includes(q);
        return Boolean(noMatch || nameMatch || phoneMatch);
      })
    : [...bills];

  filtered.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.createdAt || '').localeCompare(a.createdAt || '') || (b.id || 0) - (a.id || 0);
  });

  return filtered;
}

/**
 * Computes remaining returnable units (in smallest loose units) per billItemId,
 * capping at originally sold minus previously returned units.
 */
export function computeReturnableUnitsPerItem(
  originalItems: BillItem[],
  previousReturns: BillReturn[]
): Record<number, number> {
  const returnedByItem: Record<number, number> = {};

  for (const ret of previousReturns) {
    try {
      const parsed = JSON.parse(ret.itemsJson) as Array<{
        billItemId: number;
        returnUnits: number;
      }>;
      for (const entry of parsed) {
        returnedByItem[entry.billItemId] =
          (returnedByItem[entry.billItemId] || 0) + entry.returnUnits;
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  const returnable: Record<number, number> = {};
  for (const item of originalItems) {
    if (item.id === undefined) continue;
    const alreadyReturned = returnedByItem[item.id] || 0;
    returnable[item.id] = Math.max(0, item.qtyUnits - alreadyReturned);
  }

  return returnable;
}

/**
 * Reads the saved offline approval rule for 'delete_or_correct_bill' (Sales Return).
 */
export async function getBillReturnApprovalRule(): Promise<ApprovalRuleType> {
  try {
    const item = await db.settings.get('approval_rules');
    const rules = item?.value as Partial<Record<ApprovalActionCategory, ApprovalRuleType>> | undefined;
    if (rules && rules.delete_or_correct_bill) {
      return rules.delete_or_correct_bill;
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_APPROVAL_RULES.delete_or_correct_bill;
}

export interface UdhaarCustomerSummary {
  key: string;
  customerName: string;
  customerPhone: string;
  pendingUdhaarPaise: number;
}

/**
 * Aggregates existing Udhaar customers from past unpaid/credit bills for quick selection.
 */
export async function getExistingUdhaarCustomers(): Promise<UdhaarCustomerSummary[]> {
  const bills = await db.bills.toArray();
  const map = new Map<string, UdhaarCustomerSummary>();

  for (const bill of bills) {
    if (!bill.customerName && !bill.customerPhone) continue;

    let udhaarAmount = 0;
    if (bill.paymentMode === 'udhaar') {
      udhaarAmount = bill.totalPaise;
    } else if (bill.paymentMode === 'split' && bill.splitDetails) {
      try {
        const parsed = JSON.parse(bill.splitDetails) as { udhaarPaise?: number };
        udhaarAmount = parsed.udhaarPaise || 0;
      } catch {
        udhaarAmount = 0;
      }
    }

    const key = `${bill.customerPhone.trim()}|${bill.customerName.trim().toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.pendingUdhaarPaise += udhaarAmount;
    } else if (bill.customerName.trim() || bill.customerPhone.trim()) {
      map.set(key, {
        key,
        customerName: bill.customerName.trim(),
        customerPhone: bill.customerPhone.trim(),
        pendingUdhaarPaise: udhaarAmount,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.customerName.localeCompare(b.customerName)
  );
}
