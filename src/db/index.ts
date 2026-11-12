import Dexie, { type EntityTable } from 'dexie';
import type { ApprovalActionCategory, ApprovalRuleType } from '../logic/approvals';

export interface Shop {
  id?: number;
  name: string;
  ownerName: string;
  address: string;
  phone: string;
  gstNo: string;
  drugLicenceNos: string;
  mode: 'local' | 'cloud';
}

export type UserRole = 'owner' | 'cashier' | 'runner';

export interface DBUser {
  id: string;
  name: string;
  role: UserRole;
  pinHash: string;
  pinSalt: string;
  pinLength?: number;
  active: boolean;
  createdAt?: string;
}

export interface SettingsMap {
  discount_limit: number; // percentage, e.g. 10
  auto_lock_minutes: number; // default 5
  approval_rules: Record<ApprovalActionCategory, ApprovalRuleType>;
  pinLength: number; // default 4
  [key: string]: unknown;
}

export interface SettingItem {
  key: string;
  value: unknown;
}

export interface AuditLogEntry {
  id?: number;
  timestamp: string;
  who: string;
  action: string;
  record: string;
  details: string;
}

// -------------------------------------------------------------
// Medicines & Stock Tables (Phase 2 Data Foundation)
// -------------------------------------------------------------

export type ScheduleType = 'none' | 'H' | 'H1';

export interface Medicine {
  id?: number;
  name: string;
  strength: string; // e.g. "650mg"
  form: string; // e.g. "tablet", "capsule", "syrup"
  salt: string; // e.g. "Paracetamol"
  company: string; // e.g. "Micro Labs Ltd"
  gstPercent: number; // e.g. 12
  hsn: string; // e.g. "3004"
  mrpPaise: number; // whole paise per pack
  unitsPerPack: number; // loose count per pack (e.g. 15 tablets)
  shortCode: string; // unique, e.g. "C1", "D2"
  barcode: string; // e.g. "8901117002138"
  shelf: string; // e.g. "S-04"
  scheduleType: ScheduleType;
  minStockUnits: number; // in smallest units (loose tablets)
  packPhoto?: string; // optional image / base64
  active: boolean;
  createdAt?: string;
}

export interface Batch {
  id?: number;
  medicineId: number;
  batchNo: string;
  // Expiry date stored as the LAST day of the entered month (e.g. "2027-08-31" for 08/2027)
  expiry: string;
  purchaseRatePaise: number; // whole paise per pack
  mrpPaise: number; // whole paise per pack
  shelf: string;
  createdAt?: string;
}

export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'customer_return'
  | 'supplier_return'
  | 'correction'
  | 'expiry_writeoff';

export interface StockMovement {
  id?: number;
  batchId: number;
  medicineId: number;
  type: StockMovementType;
  // Signed integer in the SMALLEST unit (e.g. loose tablets): positive = stock added, negative = stock reduced
  qtyUnits: number;
  reference: string; // invoice no, bill no, or reason
  who: string; // person or system
  at: string; // ISO timestamp
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  gstNo: string;
  address: string;
  createdAt?: string;
}

export interface PurchaseLine {
  id?: number;
  purchaseId?: number;
  medicineId: number;
  batchNo: string;
  expiry: string; // Last day of entered month (YYYY-MM-DD)
  packs: number;
  freePacks: number;
  purchaseRatePaise: number;
  mrpPaise: number;
}

export interface Purchase {
  id?: number;
  supplierId: number;
  invoiceNo: string;
  date: string; // YYYY-MM-DD
  invoicePhoto: string; // compressed image
  verified: boolean;
  lines?: PurchaseLine[];
  createdAt?: string;
}export interface ProductType {
  id?: number;
  name: string;
  active: boolean;
  createdAt?: string;
}

// -------------------------------------------------------------
// Phase 3: Billing, Hold Bills & Sales Returns
// -------------------------------------------------------------

export type PaymentMode = 'cash' | 'upi' | 'udhaar' | 'split';
export type BillStatus = 'completed' | 'returned_partial' | 'returned_full';
export type UnitMode = 'pack' | 'loose';
export type RefundMode = 'cash' | 'udhaar_adjust';

export interface Bill {
  id?: number;
  billNo: string; // e.g. "2026-27/0001"
  financialYear: string; // e.g. "2026-27"
  date: string; // YYYY-MM-DD
  customerName: string;
  customerPhone: string;
  doctorName: string;
  subtotalPaise: number;
  discountPaise: number;
  discountPercent: number;
  roundOffPaise: number;
  totalPaise: number;
  taxablePaise: number;
  gstPaise: number;
  paymentMode: PaymentMode;
  cashReceivedPaise: number;
  changePaise: number;
  splitDetails?: string;
  status: BillStatus;
  cashierId: string;
  cashierName: string;
  createdAt: string;
}

export interface BillItem {
  id?: number;
  billId: number;
  medicineId: number;
  batchId: number;
  medicineName: string;
  batchNo: string;
  expiry: string;
  unitMode: UnitMode;
  qtyInput: number;
  qtyUnits: number;
  unitsPerPack: number;
  mrpPaise: number;
  unitPricePaise: number;
  discountPaise: number;
  gstPercent: number;
  taxablePaise: number;
  gstPaise: number;
  lineTotalPaise: number;
  isScheduleH: boolean;
  patientName: string;
  doctorName: string;
  prescriptionChecked: boolean;
}

export interface HeldBill {
  id?: number;
  label: string;
  itemsJson: string;
  discountPercent: number;
  customerName: string;
  doctorName: string;
  heldBy: string;
  heldAt: string;
}

export interface BillReturn {
  id?: number;
  returnNo: string;
  originalBillId: number;
  originalBillNo: string;
  refundMode: RefundMode;
  totalRefundPaise: number;
  itemsJson: string;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

// -------------------------------------------------------------
// Phase 4: Expiry & Supplier Returns
// -------------------------------------------------------------

export type SupplierReturnStatus = 'pending' | 'sent' | 'credit_received' | 'rejected';

export interface SupplierReturn {
  id?: number;
  supplierId: number;
  supplierName: string;
  medicineId: number;
  medicineName: string;
  batchId: number;
  batchNo: string;
  expiry: string;
  qtyUnits: number;
  purchaseRatePaise: number;
  status: SupplierReturnStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------
// Phase 4: Customers, Udhaar Ledger & Regular Reminders
// -------------------------------------------------------------

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  address: string;
  creditLimitPaise?: number;
  createdAt: string;
  updatedAt: string;
}

export type UdhaarPaymentMode = 'cash' | 'upi';

export interface UdhaarPayment {
  id?: number;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  amountPaise: number;
  mode: UdhaarPaymentMode;
  note: string;
  receivedBy: string;
  createdAt: string;
}

export interface RegularReminder {
  id?: number;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  medicineId: number;
  medicineName: string;
  packDays: number;
  lastDispensedDate: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  active: boolean;
}

// -------------------------------------------------------------
// Phase 5: Din Band (Daily Closing)
// -------------------------------------------------------------

export type DailyClosingStatus = 'completed' | 'pending_auth';

export interface DailyClosing {
  id?: number;
  date: string; // YYYY-MM-DD
  openingCashPaise: number;
  expectedCashPaise: number;
  countedCashPaise: number;
  differencePaise: number;
  denominationJson: string;
  counterPhoto: string;
  status: DailyClosingStatus;
  authorizedBy: string;
  closedBy: string;
  notes: string;
  createdAt: string;
}

export class HospivoDatabase extends Dexie {
  shop!: EntityTable<Shop, 'id'>;
  users!: EntityTable<DBUser, 'id'>;
  settings!: EntityTable<SettingItem, 'key'>;
  auditLog!: EntityTable<AuditLogEntry, 'id'>;

  // Stock & Inventory Tables
  medicines!: EntityTable<Medicine, 'id'>;
  batches!: EntityTable<Batch, 'id'>;
  stockMovements!: EntityTable<StockMovement, 'id'>;
  suppliers!: EntityTable<Supplier, 'id'>;
  purchases!: EntityTable<Purchase, 'id'>;
  purchaseLines!: EntityTable<PurchaseLine, 'id'>;
  productTypes!: EntityTable<ProductType, 'id'>;

  // Phase 3: Billing Tables
  bills!: EntityTable<Bill, 'id'>;
  billItems!: EntityTable<BillItem, 'id'>;
  heldBills!: EntityTable<HeldBill, 'id'>;
  billReturns!: EntityTable<BillReturn, 'id'>;

  // Phase 4: Expiry & Supplier Returns
  supplierReturns!: EntityTable<SupplierReturn, 'id'>;

  // Phase 4: Customers, Udhaar & Regular Reminders
  customers!: EntityTable<Customer, 'id'>;
  udhaarPayments!: EntityTable<UdhaarPayment, 'id'>;
  regularReminders!: EntityTable<RegularReminder, 'id'>;

  // Phase 5: Din Band (Daily Closing)
  dailyClosings!: EntityTable<DailyClosing, 'id'>;

  constructor() {
    super('HospivoDatabase');
    this.version(1).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
    });

    // Version 2: Medicines, Batches, Stock Movements, Suppliers, Purchases
    this.version(2).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
      medicines: '++id, name, shortCode, barcode, company, active, shelf',
      batches: '++id, medicineId, batchNo, expiry, [medicineId+batchNo]',
      stockMovements: '++id, batchId, medicineId, type, at',
      suppliers: '++id, name, phone',
      purchases: '++id, supplierId, invoiceNo, date, verified',
      purchaseLines: '++id, purchaseId, medicineId, batchNo',
    });

    // Version 3: Custom Product Types
    this.version(3).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
      medicines: '++id, name, shortCode, barcode, company, active, shelf',
      batches: '++id, medicineId, batchNo, expiry, [medicineId+batchNo]',
      stockMovements: '++id, batchId, medicineId, type, at',
      suppliers: '++id, name, phone',
      purchases: '++id, supplierId, invoiceNo, date, verified',
      purchaseLines: '++id, purchaseId, medicineId, batchNo',
      productTypes: '++id, name, active',
    });

    // Version 4: Phase 3 Billing, Hold Bills & Sales Returns
    this.version(4).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
      medicines: '++id, name, shortCode, barcode, company, active, shelf',
      batches: '++id, medicineId, batchNo, expiry, [medicineId+batchNo]',
      stockMovements: '++id, batchId, medicineId, type, at',
      suppliers: '++id, name, phone',
      purchases: '++id, supplierId, invoiceNo, date, verified',
      purchaseLines: '++id, purchaseId, medicineId, batchNo',
      productTypes: '++id, name, active',
      bills: '++id, &billNo, financialYear, date, status, paymentMode, cashierId, createdAt',
      billItems: '++id, billId, medicineId, batchId',
      heldBills: '++id, heldAt',
      billReturns: '++id, &returnNo, originalBillId, originalBillNo, createdAt',
    });

    // Version 5: Phase 4 Supplier Returns
    this.version(5).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
      medicines: '++id, name, shortCode, barcode, company, active, shelf',
      batches: '++id, medicineId, batchNo, expiry, [medicineId+batchNo]',
      stockMovements: '++id, batchId, medicineId, type, at',
      suppliers: '++id, name, phone',
      purchases: '++id, supplierId, invoiceNo, date, verified',
      purchaseLines: '++id, purchaseId, medicineId, batchNo',
      productTypes: '++id, name, active',
      bills: '++id, &billNo, financialYear, date, status, paymentMode, cashierId, createdAt',
      billItems: '++id, billId, medicineId, batchId',
      heldBills: '++id, heldAt',
      billReturns: '++id, &returnNo, originalBillId, originalBillNo, createdAt',
      supplierReturns: '++id, supplierId, medicineId, batchId, status, createdAt',
    });

    // Version 6: Phase 4 Customers, Udhaar Payments & Regular Reminders
    this.version(6).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
      medicines: '++id, name, shortCode, barcode, company, active, shelf',
      batches: '++id, medicineId, batchNo, expiry, [medicineId+batchNo]',
      stockMovements: '++id, batchId, medicineId, type, at',
      suppliers: '++id, name, phone',
      purchases: '++id, supplierId, invoiceNo, date, verified',
      purchaseLines: '++id, purchaseId, medicineId, batchNo',
      productTypes: '++id, name, active',
      bills: '++id, &billNo, financialYear, date, status, paymentMode, cashierId, createdAt',
      billItems: '++id, billId, medicineId, batchId',
      heldBills: '++id, heldAt',
      billReturns: '++id, &returnNo, originalBillId, originalBillNo, createdAt',
      supplierReturns: '++id, supplierId, medicineId, batchId, status, createdAt',
      customers: '++id, &phone, name, createdAt',
      udhaarPayments: '++id, customerId, customerPhone, createdAt',
      regularReminders: '++id, customerId, customerPhone, medicineId, nextDueDate, active',
    });

    // Version 7: Phase 5 Din Band (Daily Closing)
    this.version(7).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
      medicines: '++id, name, shortCode, barcode, company, active, shelf',
      batches: '++id, medicineId, batchNo, expiry, [medicineId+batchNo]',
      stockMovements: '++id, batchId, medicineId, type, at',
      suppliers: '++id, name, phone',
      purchases: '++id, supplierId, invoiceNo, date, verified',
      purchaseLines: '++id, purchaseId, medicineId, batchNo',
      productTypes: '++id, name, active',
      bills: '++id, &billNo, financialYear, date, status, paymentMode, cashierId, createdAt',
      billItems: '++id, billId, medicineId, batchId',
      heldBills: '++id, heldAt',
      billReturns: '++id, &returnNo, originalBillId, originalBillNo, createdAt',
      supplierReturns: '++id, supplierId, medicineId, batchId, status, createdAt',
      customers: '++id, &phone, name, createdAt',
      udhaarPayments: '++id, customerId, customerPhone, createdAt',
      regularReminders: '++id, customerId, customerPhone, medicineId, nextDueDate, active',
      dailyClosings: '++id, date, status, createdAt',
    });

    // Make audit log strictly append-only at database level
    this.auditLog.hook('updating', () => {
      throw new Error('Audit log is append-only and cannot be updated.');
    });
    this.auditLog.hook('deleting', () => {
      throw new Error('Audit log is append-only and cannot be deleted.');
    });

    // Make stock movements strictly append-only at database level
    this.stockMovements.hook('updating', () => {
      throw new Error('Stock movements are append-only and cannot be updated.');
    });
    this.stockMovements.hook('deleting', () => {
      throw new Error('Stock movements are append-only and cannot be deleted.');
    });

    // Make bills immutable once completed (except updating status during return) and prevent deletion
    this.bills.hook('updating', (modifications) => {
      const mods = modifications as Partial<Bill>;
      const keys = Object.keys(modifications);
      const isStatusOnly =
        keys.length === 1 &&
        keys[0] === 'status' &&
        (mods.status === 'returned_partial' || mods.status === 'returned_full');
      if (!isStatusOnly) {
        throw new Error('Finished bills cannot be edited in place.');
      }
    });
    this.bills.hook('deleting', () => {
      throw new Error('Finished bills cannot be deleted.');
    });

    // Make bill items strictly immutable and non-deletable
    this.billItems.hook('updating', () => {
      throw new Error('Bill items cannot be edited after finalization.');
    });
    this.billItems.hook('deleting', () => {
      throw new Error('Bill items cannot be deleted.');
    });

    // Make Udhaar payments strictly append-only at database level
    this.udhaarPayments.hook('updating', () => {
      throw new Error('Udhaar payments are append-only and cannot be updated.');
    });
    this.udhaarPayments.hook('deleting', () => {
      throw new Error('Udhaar payments are append-only and cannot be deleted.');
    });
  }
}

export const db = new HospivoDatabase();

/**
 * Safely resets database by closing connections first to avoid
 * "Another connection wants to delete database" warnings.
 */
export async function resetDatabase(): Promise<void> {
  db.close();
  await db.delete();
  await db.open();
}
