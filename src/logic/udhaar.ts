import {
  db,
  type Bill,
  type BillReturn,
  type Customer,
  type RegularReminder,
  type UdhaarPayment,
  type UdhaarPaymentMode,
} from '../db';
import { addAudit } from '../db/audit';
import { enqueueSyncItem } from './cloudSync';
import { filterDigits, formatField } from './format';
import { formatRupees } from './money';
import { parseDateOnly } from './stock';

export function normalizePhoneKey(phone: string): string {
  const digits = filterDigits(phone || '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function makeCustomerKey(phone: string, name: string): string {
  const p = normalizePhoneKey(phone);
  if (p) return `p:${p}`;
  return `n:${(name || '').trim().toLowerCase()}`;
}

export function getBillUdhaarPaise(bill: Bill): number {
  if (bill.paymentMode === 'udhaar') {
    return Math.max(0, bill.totalPaise || 0);
  }
  if (bill.paymentMode === 'split' && bill.splitDetails) {
    try {
      const parsed = JSON.parse(bill.splitDetails) as { udhaarPaise?: number };
      return Math.max(0, Math.round(parsed.udhaarPaise || 0));
    } catch {
      return 0;
    }
  }
  return 0;
}

function diffDaysUtc(fromDateStr: string, toDateStr: string): number {
  const [fY, fM, fD] = fromDateStr.split('T')[0].split('-').map(Number);
  const [tY, tM, tD] = toDateStr.split('T')[0].split('-').map(Number);
  if (!fY || !fM || !fD || !tY || !tM || !tD) return 0;
  const fUtc = Date.UTC(fY, fM - 1, fD);
  const tUtc = Date.UTC(tY, tM - 1, tD);
  return Math.round((tUtc - fUtc) / (1000 * 60 * 60 * 24));
}

export interface CustomerLedgerEntry {
  key: string;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  address: string;
  creditLimitPaise: number;
  totalUdhaarBillsPaise: number;
  totalUdhaarReturnsPaise: number;
  totalPaymentsPaise: number;
  pendingBalancePaise: number;
  daysPending: number;
  oldestUnpaidDate: string | null;
  lastActivityDate: string;
  bills: Bill[];
  payments: UdhaarPayment[];
}

export interface UdhaarLedgerResult {
  allCustomers: CustomerLedgerEntry[];
  pendingCustomers: CustomerLedgerEntry[];
  totalOutstandingPaise: number;
}

/**
 * Computes net Udhaar balance per customer:
 *   pendingBalance = sum(completed 'udhaar' / split udhaar bills)
 *                    - sum('udhaar_adjust' billReturns)
 *                    - sum(udhaarPayments)
 * Also computes daysPending from the oldest unpaid Udhaar bill using FIFO aging.
 */
export function computeUdhaarLedgers(params: {
  customers: Customer[];
  bills: Bill[];
  billReturns: BillReturn[];
  udhaarPayments: UdhaarPayment[];
  today?: Date | string;
}): UdhaarLedgerResult {
  const { customers, bills, billReturns, udhaarPayments, today } = params;
  const todayStr = parseDateOnly(today);

  interface Bucket {
    key: string;
    customer?: Customer;
    customerName: string;
    customerPhone: string;
    address: string;
    creditLimitPaise: number;
    udhaarBills: Array<{ bill: Bill; udhaarPaise: number }>;
    allBills: Bill[];
    returnsPaise: number;
    payments: UdhaarPayment[];
    paymentsPaise: number;
    lastActivityDate: string;
  }

  const buckets = new Map<string, Bucket>();
  const customerIdToKey = new Map<number, string>();
  const billIdToKey = new Map<number, string>();

  const ensureBucket = (phone: string, name: string): Bucket => {
    const key = makeCustomerKey(phone, name);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        address: '',
        creditLimitPaise: 0,
        udhaarBills: [],
        allBills: [],
        returnsPaise: 0,
        payments: [],
        paymentsPaise: 0,
        lastActivityDate: '',
      };
      buckets.set(key, bucket);
    }
    if (!bucket.customerName && name.trim()) {
      bucket.customerName = name.trim();
    }
    if (!bucket.customerPhone && phone.trim()) {
      bucket.customerPhone = phone.trim();
    }
    return bucket;
  };

  // 1. Seed from customers table
  for (const c of customers) {
    if (!c.name.trim() && !c.phone.trim()) continue;
    const bucket = ensureBucket(c.phone, c.name);
    bucket.customer = c;
    bucket.customerName = c.name;
    bucket.customerPhone = c.phone;
    bucket.address = c.address || '';
    bucket.creditLimitPaise = Math.max(0, c.creditLimitPaise || 0);
    if (c.id !== undefined) {
      customerIdToKey.set(c.id, bucket.key);
    }
  }

  // 2. Process bills
  for (const bill of bills) {
    if (!bill.customerName.trim() && !bill.customerPhone.trim()) continue;
    const bucket = ensureBucket(bill.customerPhone, bill.customerName);
    bucket.allBills.push(bill);
    if (bill.id !== undefined) {
      billIdToKey.set(bill.id, bucket.key);
    }
    const billDate = (bill.date || bill.createdAt || '').split('T')[0];
    if (billDate > bucket.lastActivityDate) {
      bucket.lastActivityDate = billDate;
    }

    const udhaarPaise = getBillUdhaarPaise(bill);
    if (udhaarPaise > 0) {
      bucket.udhaarBills.push({ bill, udhaarPaise });
    }
  }

  // 3. Process udhaar_adjust sales returns linked to original bill
  for (const ret of billReturns) {
    if (ret.refundMode !== 'udhaar_adjust') continue;
    const key = billIdToKey.get(ret.originalBillId);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.returnsPaise += Math.max(0, ret.totalRefundPaise || 0);
      const retDate = (ret.createdAt || '').split('T')[0];
      if (retDate > bucket.lastActivityDate) {
        bucket.lastActivityDate = retDate;
      }
    }
  }

  // 4. Process append-only udhaarPayments
  for (const pay of udhaarPayments) {
    let bucket: Bucket | undefined;
    if (pay.customerId !== undefined) {
      const key = customerIdToKey.get(pay.customerId);
      if (key) bucket = buckets.get(key);
    }
    if (!bucket) {
      if (!pay.customerName.trim() && !pay.customerPhone.trim()) continue;
      bucket = ensureBucket(pay.customerPhone, pay.customerName);
    }
    bucket.payments.push(pay);
    bucket.paymentsPaise += Math.max(0, pay.amountPaise || 0);
    const payDate = (pay.createdAt || '').split('T')[0];
    if (payDate > bucket.lastActivityDate) {
      bucket.lastActivityDate = payDate;
    }
  }

  // 5. Build ledger entries with FIFO aging
  const allCustomers: CustomerLedgerEntry[] = [];

  for (const b of buckets.values()) {
    const totalUdhaarBillsPaise = b.udhaarBills.reduce((s, x) => s + x.udhaarPaise, 0);
    const pendingBalancePaise = Math.max(
      0,
      totalUdhaarBillsPaise - b.returnsPaise - b.paymentsPaise
    );

    // FIFO aging: walk oldest udhaar bills and consume total credits (returns + payments)
    const sortedUdhaarBills = [...b.udhaarBills].sort((x, y) => {
      const dx = (x.bill.date || x.bill.createdAt || '').split('T')[0];
      const dy = (y.bill.date || y.bill.createdAt || '').split('T')[0];
      if (dx !== dy) return dx.localeCompare(dy);
      return (x.bill.id || 0) - (y.bill.id || 0);
    });

    let remainingCredits = b.returnsPaise + b.paymentsPaise;
    let oldestUnpaidDate: string | null = null;

    if (pendingBalancePaise > 0) {
      for (const item of sortedUdhaarBills) {
        if (remainingCredits >= item.udhaarPaise) {
          remainingCredits -= item.udhaarPaise;
          continue;
        }
        oldestUnpaidDate = (item.bill.date || item.bill.createdAt || todayStr).split('T')[0];
        break;
      }
    }

    const daysPending =
      oldestUnpaidDate !== null ? Math.max(0, diffDaysUtc(oldestUnpaidDate, todayStr)) : 0;

    allCustomers.push({
      key: b.key,
      customerId: b.customer?.id,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      address: b.address,
      creditLimitPaise: b.creditLimitPaise,
      totalUdhaarBillsPaise,
      totalUdhaarReturnsPaise: b.returnsPaise,
      totalPaymentsPaise: b.paymentsPaise,
      pendingBalancePaise,
      daysPending,
      oldestUnpaidDate,
      lastActivityDate: b.lastActivityDate,
      bills: [...b.allBills].sort(
        (x, y) => (y.createdAt || '').localeCompare(x.createdAt || '') || (y.id || 0) - (x.id || 0)
      ),
      payments: [...b.payments].sort(
        (x, y) => (y.createdAt || '').localeCompare(x.createdAt || '') || (y.id || 0) - (x.id || 0)
      ),
    });
  }

  // Sort biggest pending balance first, then longest pending, then name
  allCustomers.sort((a, b) => {
    if (b.pendingBalancePaise !== a.pendingBalancePaise) {
      return b.pendingBalancePaise - a.pendingBalancePaise;
    }
    if (b.daysPending !== a.daysPending) {
      return b.daysPending - a.daysPending;
    }
    return a.customerName.localeCompare(b.customerName);
  });

  const pendingCustomers = allCustomers.filter((c) => c.pendingBalancePaise > 0);
  const totalOutstandingPaise = pendingCustomers.reduce(
    (sum, c) => sum + c.pendingBalancePaise,
    0
  );

  return {
    allCustomers,
    pendingCustomers,
    totalOutstandingPaise,
  };
}

/**
 * WhatsApp "Yaad Dilao" rule: enabled ONLY when daysPending > 7.
 */
export function isYaadDilaoEligible(daysPending: number): boolean {
  return daysPending > 7;
}

export function buildWhatsAppPhone(phone: string): string {
  const digits = filterDigits(phone || '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export function buildUdhaarWhatsAppUrl(phone: string, message: string): string {
  const formattedPhone = buildWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  if (formattedPhone) {
    return `https://wa.me/${formattedPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export interface CreditLimitCheckResult {
  exceeded: boolean;
  creditLimitPaise: number;
  currentPendingPaise: number;
  projectedBalancePaise: number;
  excessPaise: number;
}

/**
 * Checks if adding `newUdhaarPaise` on credit for this customer would exceed their saved creditLimitPaise.
 */
export function checkCustomerCreditLimit(params: {
  customerPhone: string;
  customerName: string;
  newUdhaarPaise: number;
  customers: Customer[];
  bills: Bill[];
  billReturns: BillReturn[];
  udhaarPayments: UdhaarPayment[];
}): CreditLimitCheckResult {
  const {
    customerPhone,
    customerName,
    newUdhaarPaise,
    customers,
    bills,
    billReturns,
    udhaarPayments,
  } = params;

  const targetKey = makeCustomerKey(customerPhone, customerName);
  const ledgers = computeUdhaarLedgers({
    customers,
    bills,
    billReturns,
    udhaarPayments,
  });

  const entry = ledgers.allCustomers.find((c) => c.key === targetKey);
  const creditLimitPaise = entry?.creditLimitPaise || 0;
  const currentPendingPaise = entry?.pendingBalancePaise || 0;
  const projectedBalancePaise = currentPendingPaise + Math.max(0, newUdhaarPaise);

  if (creditLimitPaise > 0 && projectedBalancePaise > creditLimitPaise) {
    return {
      exceeded: true,
      creditLimitPaise,
      currentPendingPaise,
      projectedBalancePaise,
      excessPaise: projectedBalancePaise - creditLimitPaise,
    };
  }

  return {
    exceeded: false,
    creditLimitPaise,
    currentPendingPaise,
    projectedBalancePaise,
    excessPaise: 0,
  };
}

/**
 * Computes nextDueDate by adding packDays to lastDispensedDate (YYYY-MM-DD).
 */
export function computeNextDueDate(lastDispensedDate: string, packDays: number): string {
  const cleanDate = (lastDispensedDate || '').split('T')[0];
  const [y, m, d] = cleanDate.split('-').map(Number);
  const safeDays = Math.max(1, Math.floor(packDays || 1));
  if (!y || !m || !d) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + safeDays);
    return parseDateOnly(fallback);
  }
  const nextUtc = new Date(Date.UTC(y, m - 1, d + safeDays));
  const ny = nextUtc.getUTCFullYear();
  const nm = String(nextUtc.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(nextUtc.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export type ReminderUrgency = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

export function getReminderUrgency(
  nextDueDate: string,
  today?: Date | string
): ReminderUrgency {
  const todayStr = parseDateOnly(today);
  const diff = diffDaysUtc(todayStr, nextDueDate);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return 'upcoming';
}

export type DoctorDatePreset = 'today' | 'week' | 'month' | 'all';

export interface DoctorReferralFilter {
  preset: DoctorDatePreset;
  startDate?: string;
  endDate?: string;
}

export interface DoctorReferralRow {
  doctorName: string;
  billCount: number;
  totalSalesPaise: number;
}

export interface DoctorReferralSummary {
  doctors: DoctorReferralRow[];
  totalBills: number;
  totalSalesPaise: number;
}

/**
 * Aggregates completed bills grouped by doctorName (ignoring empty doctor names).
 * Sales per doctor ONLY — never calculates or mentions commission.
 */
export function aggregateDoctorReferralSales(
  bills: Bill[],
  filter: DoctorReferralFilter,
  today?: Date | string
): DoctorReferralSummary {
  const todayStr = parseDateOnly(today);
  const [tY, tM, tD] = todayStr.split('-').map(Number);

  let startBound = '';
  let endBound = todayStr;

  if (filter.preset === 'today') {
    startBound = todayStr;
    endBound = todayStr;
  } else if (filter.preset === 'week') {
    const dt = new Date(Date.UTC(tY, tM - 1, tD - 6));
    startBound = dt.toISOString().split('T')[0];
    endBound = todayStr;
  } else if (filter.preset === 'month') {
    startBound = `${tY}-${String(tM).padStart(2, '0')}-01`;
    endBound = todayStr;
  } else {
    startBound = filter.startDate || '';
    endBound = filter.endDate || '';
  }

  const map = new Map<string, DoctorReferralRow>();

  for (const bill of bills) {
    if (bill.status !== 'completed' && bill.status !== 'returned_partial') continue;
    const rawDoc = (bill.doctorName || '').trim();
    if (!rawDoc) continue;

    const billDate = (bill.date || bill.createdAt || '').split('T')[0];
    if (startBound && billDate < startBound) continue;
    if (endBound && billDate > endBound) continue;

    const key = rawDoc.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.billCount += 1;
      existing.totalSalesPaise += Math.max(0, bill.totalPaise || 0);
    } else {
      map.set(key, {
        doctorName: rawDoc,
        billCount: 1,
        totalSalesPaise: Math.max(0, bill.totalPaise || 0),
      });
    }
  }

  const doctors = Array.from(map.values()).sort((a, b) => {
    if (b.totalSalesPaise !== a.totalSalesPaise) {
      return b.totalSalesPaise - a.totalSalesPaise;
    }
    return b.billCount - a.billCount;
  });

  const totalBills = doctors.reduce((s, d) => s + d.billCount, 0);
  const totalSalesPaise = doctors.reduce((s, d) => s + d.totalSalesPaise, 0);

  return {
    doctors,
    totalBills,
    totalSalesPaise,
  };
}

/**
 * Generates CSV content for the Doctor Referral Sales Report (no commission column).
 */
export function buildReferralCsv(summary: DoctorReferralSummary): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ['Doctor Name,Bills,Total Sales (Rs)'];
  for (const row of summary.doctors) {
    lines.push(
      [escape(row.doctorName), String(row.billCount), (row.totalSalesPaise / 100).toFixed(2)].join(
        ','
      )
    );
  }
  lines.push(
    [escape('Total'), String(summary.totalBills), (summary.totalSalesPaise / 100).toFixed(2)].join(
      ','
    )
  );
  return lines.join('\r\n');
}

export async function loadUdhaarDashboardData(today?: Date | string) {
  const [customers, bills, billReturns, udhaarPayments, regularReminders] = await Promise.all([
    db.customers.toArray(),
    db.bills.toArray(),
    db.billReturns.toArray(),
    db.udhaarPayments.toArray(),
    db.regularReminders.toArray(),
  ]);

  const ledgers = computeUdhaarLedgers({
    customers,
    bills,
    billReturns,
    udhaarPayments,
    today,
  });

  return {
    ...ledgers,
    regularReminders,
    customers,
  };
}

export interface RecordUdhaarPaymentInput {
  customerId?: number;
  customerName: string;
  customerPhone: string;
  amountPaise: number;
  mode: UdhaarPaymentMode;
  note?: string;
  receivedBy: string;
}

/**
 * Records a partial or full Udhaar payment cleanly in an append-only transaction.
 */
export async function recordUdhaarPayment(
  input: RecordUdhaarPaymentInput
): Promise<UdhaarPayment> {
  const amountPaise = Math.round(input.amountPaise);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const name = formatField('name', input.customerName || '');
  const phone = formatField('phone', input.customerPhone || '');
  if (!name && !phone) {
    throw new Error('Customer name or phone is required');
  }

  const actor = (input.receivedBy || 'User').trim() || 'User';
  const note = formatField('free', input.note || '');
  const now = new Date().toISOString();

  return await db.transaction('rw', [db.customers, db.udhaarPayments, db.auditLog], async () => {
    let customerId = input.customerId;
    if (!customerId && phone) {
      const normalized = normalizePhoneKey(phone);
      const allCusts = await db.customers.toArray();
      const matched = allCusts.find((c) => normalizePhoneKey(c.phone) === normalized);
      if (matched?.id !== undefined) {
        customerId = matched.id;
      } else {
        customerId = (await db.customers.add({
          name: name || phone,
          phone: normalized || phone,
          address: '',
          createdAt: now,
          updatedAt: now,
        })) as number;
      }
    }

    const paymentRecord: UdhaarPayment = {
      customerId,
      customerName: name || phone,
      customerPhone: phone,
      amountPaise,
      mode: input.mode,
      note,
      receivedBy: actor,
      createdAt: now,
    };

    const paymentId = (await db.udhaarPayments.add(paymentRecord)) as number;

    await addAudit(
      actor,
      'udhaar_payment_received',
      `UdhaarPayment #${paymentId}`,
      `Received ${formatRupees(amountPaise)} via ${input.mode} from ${paymentRecord.customerName}`
    );

    enqueueSyncItem('udhaar_payment', paymentId, paymentRecord).catch(() => {});

    return { ...paymentRecord, id: paymentId };
  });
}

export interface SaveCustomerProfileInput {
  id?: number;
  name: string;
  phone: string;
  address?: string;
  creditLimitPaise?: number;
  actorName: string;
}

/**
 * Creates or updates a customer profile in `db.customers` with formatted fields and unique phone check.
 */
export async function saveCustomerProfile(input: SaveCustomerProfileInput): Promise<Customer> {
  const name = formatField('name', input.name || '');
  const phone = normalizePhoneKey(input.phone || '');
  const address = formatField('free', input.address || '');
  const creditLimitPaise =
    input.creditLimitPaise !== undefined && input.creditLimitPaise > 0
      ? Math.round(input.creditLimitPaise)
      : 0;
  const actor = (input.actorName || 'Owner').trim() || 'Owner';

  if (!name) {
    throw new Error('Customer name is required');
  }
  if (!phone || phone.length < 7) {
    throw new Error('Valid customer phone is required');
  }

  const now = new Date().toISOString();

  return await db.transaction('rw', [db.customers, db.auditLog], async () => {
    const existingAll = await db.customers.toArray();
    const phoneConflict = existingAll.find(
      (c) => normalizePhoneKey(c.phone) === phone && c.id !== input.id
    );
    if (phoneConflict) {
      throw new Error('A customer with this phone number already exists');
    }

    if (input.id !== undefined) {
      const existing = await db.customers.get(input.id);
      if (!existing) {
        throw new Error('Customer not found');
      }
      await db.customers.update(input.id, {
        name,
        phone,
        address,
        creditLimitPaise,
        updatedAt: now,
      });
      await addAudit(
        actor,
        'customer_updated',
        `Customer #${input.id}`,
        `Updated customer profile for ${name}`
      );
      return {
        ...existing,
        name,
        phone,
        address,
        creditLimitPaise,
        updatedAt: now,
      };
    }

    const newCustomer: Customer = {
      name,
      phone,
      address,
      creditLimitPaise,
      createdAt: now,
      updatedAt: now,
    };
    const newId = (await db.customers.add(newCustomer)) as number;
    await addAudit(
      actor,
      'customer_created',
      `Customer #${newId}`,
      `Created customer profile for ${name}`
    );
    return { ...newCustomer, id: newId };
  });
}

/**
 * Ensures a customer exists in `db.customers` when an Udhaar bill is saved.
 */
export async function ensureCustomerForUdhaarBill(name: string, phone: string): Promise<void> {
  const cleanName = formatField('name', name || '');
  const cleanPhone = normalizePhoneKey(phone || '');
  if (!cleanName || !cleanPhone) return;

  try {
    const existingAll = await db.customers.toArray();
    const matched = existingAll.find((c) => normalizePhoneKey(c.phone) === cleanPhone);
    if (!matched) {
      const now = new Date().toISOString();
      await db.customers.add({
        name: cleanName,
        phone: cleanPhone,
        address: '',
        creditLimitPaise: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch {
    // Non-blocking upsert
  }
}

export interface SaveRegularReminderInput {
  id?: number;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  medicineId: number;
  medicineName: string;
  packDays: number;
  lastDispensedDate: string;
  active?: boolean;
  actorName?: string;
}

export async function saveRegularReminder(
  input: SaveRegularReminderInput
): Promise<RegularReminder> {
  const packDays = Math.max(1, Math.floor(input.packDays || 30));
  const lastDispensedDate = parseDateOnly(input.lastDispensedDate);
  const nextDueDate = computeNextDueDate(lastDispensedDate, packDays);
  const actor = (input.actorName || 'User').trim() || 'User';

  const record: RegularReminder = {
    customerId: input.customerId,
    customerName: formatField('name', input.customerName || ''),
    customerPhone: normalizePhoneKey(input.customerPhone || '') || input.customerPhone.trim(),
    medicineId: input.medicineId,
    medicineName: input.medicineName.trim(),
    packDays,
    lastDispensedDate,
    nextDueDate,
    active: input.active ?? true,
  };

  return await db.transaction('rw', [db.regularReminders, db.auditLog], async () => {
    if (input.id !== undefined) {
      await db.regularReminders.update(input.id, record);
      await addAudit(
        actor,
        'regular_reminder_updated',
        `RegularReminder #${input.id}`,
        `Updated regular reminder for ${record.customerName} (${record.medicineName}, every ${packDays} days)`
      );
      return { ...record, id: input.id };
    }
    const newId = (await db.regularReminders.add(record)) as number;
    await addAudit(
      actor,
      'regular_reminder_created',
      `RegularReminder #${newId}`,
      `Added regular reminder for ${record.customerName} (${record.medicineName}, every ${packDays} days)`
    );
    return { ...record, id: newId };
  });
}

export async function toggleRegularReminderActive(id: number, active: boolean): Promise<void> {
  await db.regularReminders.update(id, { active });
}

