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
