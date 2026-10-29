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
  active: boolean;
  createdAt?: string;
}

export interface SettingsMap {
  discount_limit: number; // percentage, e.g. 10
  auto_lock_minutes: number; // default 5
  approval_rules: Record<ApprovalActionCategory, ApprovalRuleType>;
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

export class HospivoDatabase extends Dexie {
  shop!: EntityTable<Shop, 'id'>;
  users!: EntityTable<DBUser, 'id'>;
  settings!: EntityTable<SettingItem, 'key'>;
  auditLog!: EntityTable<AuditLogEntry, 'id'>;

  constructor() {
    super('HospivoDatabase');
    this.version(1).stores({
      shop: '++id, mode',
      users: 'id, role, active',
      settings: 'key',
      auditLog: '++id, timestamp, who, action, record',
    });

    // Make audit log strictly append-only at database level
    this.auditLog.hook('updating', () => {
      throw new Error('Audit log is append-only and cannot be updated.');
    });
    this.auditLog.hook('deleting', () => {
      throw new Error('Audit log is append-only and cannot be deleted.');
    });
  }
}

export const db = new HospivoDatabase();
