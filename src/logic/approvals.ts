import { db, type DBUser } from '../db';
import { getPinLengthSetting, hashPin, validatePin, verifyPin } from './pin';
import { addAudit } from '../db/audit';

export type ApprovalActionCategory =
  | 'delete_or_correct_bill'
  | 'price_change'
  | 'discount_above_limit'
  | 'stock_correction'
  | 'cash_mismatch';

export type ApprovalRuleType =
  | 'local_pin'
  | 'remote_approval'
  | 'blocked_offline';

export interface ActionApprovalRule {
  category: ApprovalActionCategory;
  labelKey: string;
  rule: ApprovalRuleType;
}

// Defaults as in 07b design: Stock sudhaar = "blocked_offline", other four = "local_pin" (Ijazat PIN)
export const DEFAULT_APPROVAL_RULES: Record<ApprovalActionCategory, ApprovalRuleType> = {
  delete_or_correct_bill: 'local_pin',
  price_change: 'local_pin',
  discount_above_limit: 'local_pin',
  stock_correction: 'blocked_offline',
  cash_mismatch: 'local_pin',
};

export const DEFAULT_APPROVAL_RULES_LIST: ActionApprovalRule[] = [
  {
    category: 'delete_or_correct_bill',
    labelKey: 'setup.step8_rule_delete_bill',
    rule: 'local_pin',
  },
  {
    category: 'price_change',
    labelKey: 'setup.step8_rule_price_change',
    rule: 'local_pin',
  },
  {
    category: 'discount_above_limit',
    labelKey: 'setup.step8_rule_discount_limit',
    rule: 'local_pin',
  },
  {
    category: 'stock_correction',
    labelKey: 'setup.step8_rule_stock_correction',
    rule: 'blocked_offline',
  },
  {
    category: 'cash_mismatch',
    labelKey: 'setup.step8_rule_cash_mismatch',
    rule: 'local_pin',
  },
];

export interface StoredApprovalPin {
  hash: string;
  salt: string;
}

export interface ApprovalPinLockState {
  failedAttempts: number;
  lockedUntil: number | null;
}

export type ApprovalPinErrorCode =
  | 'approval_pin_length'
  | 'approval_pin_mismatch'
  | 'approval_pin_same_as_owner_or_staff'
  | 'approval_pin_same_as_current';

export interface SetApprovalPinResult {
  ok: boolean;
  error?: ApprovalPinErrorCode | string;
}

export type StaffPinErrorCode =
  | 'staff_pin_length'
  | 'staff_pin_same_as_owner'
  | 'staff_pin_same_as_approval'
  | 'staff_pin_duplicate';

export interface ValidateStaffPinResult {
  ok: boolean;
  error?: StaffPinErrorCode;
}

export type VerifyApprovalPinResult =
  | { ok: true; status: 'ok' }
  | { ok: false; status: 'wrong'; triesLeft: number }
  | { ok: false; status: 'locked'; minutesLeft: number };

// Fallback in-memory storage for test/headless environments without IndexedDB
const memorySettings = new Map<string, unknown>();
let memoryUsers: DBUser[] = [];

export function _resetApprovalStoreForTesting() {
  memorySettings.clear();
  memoryUsers = [];
}

export function _seedUserForTesting(user: DBUser) {
  memoryUsers.push(user);
}

async function getSetting<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') {
    return memorySettings.get(key) as T | undefined;
  }
  try {
    const item = await db.settings.get(key);
    return (item?.value as T | undefined) ?? (memorySettings.get(key) as T | undefined);
  } catch {
    return memorySettings.get(key) as T | undefined;
  }
}

async function setSetting(key: string, value: unknown): Promise<void> {
  memorySettings.set(key, value);
  if (typeof indexedDB !== 'undefined') {
    try {
      await db.settings.put({ key, value });
    } catch {
      // ignore
    }
  }
}

async function getAllUsers(): Promise<DBUser[]> {
  if (typeof indexedDB === 'undefined') {
    return memoryUsers;
  }
  try {
    const dbUsers = await db.users.toArray();
    return dbUsers.length > 0 ? dbUsers : memoryUsers;
  } catch {
    return memoryUsers;
  }
}

async function recordAudit(who: string, action: string, record: string, details: string) {
  if (typeof indexedDB !== 'undefined') {
    try {
      await addAudit(who, action, record, details);
    } catch {
      // ignore
    }
  }
}

/**
 * Validates an Approval PIN candidate.
 * Returns error codes instead of sentences.
 */
export function validateApprovalPin(
  pin: string,
  confirmPin?: string,
  existingPinsToReject?: string[]
): { ok: boolean; error?: ApprovalPinErrorCode } {
  if (!/^\d+$/.test(pin) || pin.length !== 4) {
    return { ok: false, error: 'approval_pin_length' };
  }
  if (confirmPin !== undefined && pin !== confirmPin) {
    return { ok: false, error: 'approval_pin_mismatch' };
  }
  if (existingPinsToReject && existingPinsToReject.some((p) => p && p === pin)) {
    return { ok: false, error: 'approval_pin_same_as_owner_or_staff' };
  }
  return { ok: true };
}

/**
 * Validates a staff PIN candidate.
 * Returns error codes instead of sentences.
 * Validates against current PIN length, owner PIN, approval PIN, and other staff PINs.
 */
export async function validateStaffPin(
  pin: string,
  ownerPin?: string,
  existingStaffPins?: string[],
  expectedLength?: number,
  targetUserId?: string
): Promise<ValidateStaffPinResult> {
  const reqLen = expectedLength ?? (await getPinLengthSetting());
  if (!/^\d+$/.test(pin) || pin.length !== reqLen) {
    return { ok: false, error: 'staff_pin_length' };
  }
  if (ownerPin && pin === ownerPin) {
    return { ok: false, error: 'staff_pin_same_as_owner' };
  }
  if (existingStaffPins && existingStaffPins.includes(pin)) {
    return { ok: false, error: 'staff_pin_duplicate' };
  }
  const isSameAsApproval = await isPinEqualToApprovalPin(pin);
  if (isSameAsApproval) {
    return { ok: false, error: 'staff_pin_same_as_approval' };
  }

  // Check against DB users (Owner and existing active Staff)
  const users = await getAllUsers();
  for (const user of users) {
    if (targetUserId && user.id === targetUserId) continue;
    if (user.active === false && user.id !== 'owner') continue;
    if (user.pinHash && user.pinSalt) {
      const isMatch = await verifyPin(pin, user);
      if (isMatch) {
        if (user.role === 'owner') {
          return { ok: false, error: 'staff_pin_same_as_owner' };
        }
        return { ok: false, error: 'staff_pin_duplicate' };
      }
    }
  }

  return { ok: true };
}

/**
 * Sets the Approval PIN ("Ijazat PIN").
 * - Validates length (4 digits by default, numbers only).
 * - Must differ from Owner PIN and every staff PIN.
 * - Stores salted hash in settings (never plain text).
 */
export async function setApprovalPin(
  pin: string,
  existingPinsToReject?: string[]
): Promise<SetApprovalPinResult> {
  const validation = validatePin(pin);
  if (!validation.valid) {
    return { ok: false, error: 'approval_pin_length' };
  }

  // 1. Reject if candidate equals any plain PIN passed in (e.g. from setup wizard)
  if (existingPinsToReject && existingPinsToReject.some((p) => p && p === pin)) {
    return {
      ok: false,
      error: 'approval_pin_same_as_owner_or_staff',
    };
  }

  // 2. Reject if candidate equals Owner PIN or any staff PIN in database
  const users = await getAllUsers();
  for (const user of users) {
    if (user.pinHash && user.pinSalt) {
      const isMatch = await verifyPin(pin, user);
      if (isMatch) {
        return {
          ok: false,
          error: 'approval_pin_same_as_owner_or_staff',
        };
      }
    }
  }

  // Hash and save salted hash in settings
  const { hash, salt } = await hashPin(pin);
  await setSetting('approval_pin', { hash, salt });
  await setSetting('approval_pin_lock', { failedAttempts: 0, lockedUntil: null });

  return { ok: true };
}

/**
 * Verifies candidate PIN against stored Approval PIN.
 * - 3 wrong attempts lock for 5 minutes.
 * - Lock is saved in settings (persists across page refresh).
 * - Every wrong attempt, lock and successful verification is audit logged.
 */
export async function verifyApprovalPin(pin: string): Promise<VerifyApprovalPinResult> {
  const now = Date.now();
  const lockData = (await getSetting<ApprovalPinLockState>('approval_pin_lock')) || {
    failedAttempts: 0,
    lockedUntil: null,
  };

  // Check if currently locked
  if (lockData.lockedUntil && now < lockData.lockedUntil) {
    const minutesLeft = Math.max(1, Math.ceil((lockData.lockedUntil - now) / 60000));
    return { ok: false, status: 'locked', minutesLeft };
  }

  const stored = await getSetting<StoredApprovalPin>('approval_pin');
  if (!stored || !stored.hash || !stored.salt) {
    return { ok: false, status: 'wrong', triesLeft: 0 };
  }

  const { hash } = await hashPin(pin, stored.salt);
  const isMatch = hash === stored.hash;

  if (isMatch) {
    // Reset attempts on success
    await setSetting('approval_pin_lock', { failedAttempts: 0, lockedUntil: null });
    await recordAudit('system', 'approval_pin_success', 'approval', 'Approval PIN verified successfully');
    return { ok: true, status: 'ok' };
  }

  // Handle wrong attempt
  // If lock had expired previously, reset counter to 0 before incrementing
  const previousAttempts = lockData.lockedUntil && now >= lockData.lockedUntil ? 0 : lockData.failedAttempts;
  const newAttempts = previousAttempts + 1;

  if (newAttempts >= 3) {
    const lockedUntil = now + 5 * 60 * 1000; // 5 minutes lock
    await setSetting('approval_pin_lock', { failedAttempts: newAttempts, lockedUntil });
    await recordAudit(
      'system',
      'approval_pin_locked',
      'approval',
      'Approval PIN locked for 5 minutes after 3 failed attempts'
    );
    return { ok: false, status: 'locked', minutesLeft: 5 };
  }

  await setSetting('approval_pin_lock', { failedAttempts: newAttempts, lockedUntil: null });
  await recordAudit(
    'system',
    'approval_pin_wrong',
    'approval',
    `Wrong Approval PIN attempt (${newAttempts}/3)`
  );
  return { ok: false, status: 'wrong', triesLeft: 3 - newAttempts };
}

/**
 * Checks whether a candidate PIN matches the stored Approval PIN.
 * Used when adding or changing staff PINs to enforce uniqueness.
 */
export async function isPinEqualToApprovalPin(candidatePin: string): Promise<boolean> {
  const stored = await getSetting<StoredApprovalPin>('approval_pin');
  if (!stored || !stored.hash || !stored.salt) return false;
  const { hash } = await hashPin(candidatePin, stored.salt);
  return hash === stored.hash;
}

/**
 * Reads the active per-store approval rule for a given protected action category.
 */
export async function getApprovalRuleForCategory(
  category: ApprovalActionCategory
): Promise<ApprovalRuleType> {
  const rules = await getSetting<Partial<Record<ApprovalActionCategory, ApprovalRuleType>>>('approval_rules');
  if (rules && rules[category]) {
    return rules[category]!;
  }
  return DEFAULT_APPROVAL_RULES[category] || 'local_pin';
}

/**
 * Returns true ONLY when the store rule is `blocked_offline` and the device is offline.
 * Never blocks `remote_approval` or `local_pin` rules.
 */
export function shouldBlockProtectedActionOffline(
  rule: ApprovalRuleType,
  isOnline: boolean = typeof navigator === 'undefined' ? true : navigator.onLine
): boolean {
  return rule === 'blocked_offline' && !isOnline;
}

export type ExcessDiscountGateDecision =
  | 'owner_confirm'
  | 'blocked_offline'
  | 'approval_required';

/**
 * Determines how an above-limit discount should be gated based on user role:
 * - Owner: bypasses PIN, offline block, and remote approval -> shows simple confirmation.
 * - Staff: respects store rule (offline block vs. Permission PIN / Remote Approval).
 */
export function resolveExcessDiscountGate(
  user: DBUser | { id?: string; name?: string; role?: string; isOwner?: boolean } | null | undefined,
  rule: ApprovalRuleType,
  isOnline: boolean = typeof navigator === 'undefined' ? true : navigator.onLine
): ExcessDiscountGateDecision {
  if (user?.role === 'owner' || (user as { isOwner?: boolean } | null | undefined)?.isOwner === true) {
    return 'owner_confirm';
  }
  if (shouldBlockProtectedActionOffline(rule, isOnline)) {
    return 'blocked_offline';
  }
  return 'approval_required';
}

export const PERMISSION_PIN_ALERTS_KEY = 'permission_pin_security_alerts';

export interface PermissionPinSecurityAlert {
  id: string;
  operatorName: string;
  billId?: number;
  billNo: string;
  totalPaise: number;
  discountPaise: number;
  discountPercent: number;
  createdAt: string;
  dismissed: boolean;
  resolvedAt?: string;
}

/**
 * Returns active (non-dismissed) Permission PIN security alerts for the store, newest first.
 */
export async function getPermissionPinSecurityAlerts(): Promise<PermissionPinSecurityAlert[]> {
  const stored = await getSetting<PermissionPinSecurityAlert[]>(PERMISSION_PIN_ALERTS_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((a) => a && !a.dismissed);
}

/**
 * Records an owner security alert whenever a staff operator uses the Permission PIN
 * to authorize an excess discount on a bill, queues cloud sync, and fires an Android local alert.
 */
export async function recordPermissionPinDiscountAlert(params: {
  operatorName: string;
  billId?: number;
  billNo: string;
  totalPaise: number;
  discountPaise: number;
  discountPercent: number;
}): Promise<PermissionPinSecurityAlert> {
  const existing = (await getSetting<PermissionPinSecurityAlert[]>(PERMISSION_PIN_ALERTS_KEY)) || [];
  const alert: PermissionPinSecurityAlert = {
    id: `pin-alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    operatorName: params.operatorName || 'Staff',
    billId: params.billId,
    billNo: params.billNo,
    totalPaise: Math.round(params.totalPaise),
    discountPaise: Math.round(params.discountPaise),
    discountPercent: params.discountPercent,
    createdAt: new Date().toISOString(),
    dismissed: false,
  };

  const nextList = [alert, ...existing].slice(0, 20);
  await setSetting(PERMISSION_PIN_ALERTS_KEY, nextList);

  await recordAudit(
    alert.operatorName,
    'permission_pin_discount_alert',
    params.billNo,
    `Staff ${alert.operatorName} authorized ${params.discountPercent}% discount (${params.discountPaise}p) using Permission PIN`
  );

  try {
    const { enqueueSyncItem, emitSyncApplied } = await import('./cloudSync');
    await enqueueSyncItem('settings', PERMISSION_PIN_ALERTS_KEY, {
      key: PERMISSION_PIN_ALERTS_KEY,
      value: nextList,
    });
    emitSyncApplied(['settings']);
  } catch {
    // Non-fatal in isolated tests
  }

  try {
    const { notifyPermissionPinUsed } = await import('./notifications');
    await notifyPermissionPinUsed({
      operatorName: alert.operatorName,
      billNo: alert.billNo,
      discountPercent: alert.discountPercent,
    });
  } catch {
    // Non-fatal
  }

  return alert;
}

/**
 * Dismisses a specific Permission PIN security alert (or all active alerts if no ID given).
 */
export async function dismissPermissionPinSecurityAlert(alertId?: string): Promise<void> {
  const existing = (await getSetting<PermissionPinSecurityAlert[]>(PERMISSION_PIN_ALERTS_KEY)) || [];
  if (existing.length === 0) return;

  const now = new Date().toISOString();
  const nextList = existing.map((a) =>
    !alertId || a.id === alertId ? { ...a, dismissed: true, resolvedAt: a.resolvedAt || now } : a
  );
  await setSetting(PERMISSION_PIN_ALERTS_KEY, nextList);

  try {
    const { enqueueSyncItem, emitSyncApplied } = await import('./cloudSync');
    await enqueueSyncItem('settings', PERMISSION_PIN_ALERTS_KEY, {
      key: PERMISSION_PIN_ALERTS_KEY,
      value: nextList,
    });
    emitSyncApplied(['settings']);
  } catch {
    // Non-fatal
  }
}

/**
 * Rotates the store's Permission PIN ("Ijazat PIN") after validating:
 * - Matches required store PIN length (4 or 6 digits)
 * - Differs from current Permission PIN
 * - Differs from Owner PIN and every Staff PIN
 * Clears active Permission PIN security alerts and queues sync on success.
 */
export async function rotateApprovalPinWithValidation(
  newPin: string
): Promise<SetApprovalPinResult> {
  const reqLen = await getPinLengthSetting();
  if (!/^\d+$/.test(newPin) || newPin.length !== reqLen) {
    return { ok: false, error: 'approval_pin_length' };
  }

  if (await isPinEqualToApprovalPin(newPin)) {
    return { ok: false, error: 'approval_pin_same_as_current' };
  }

  // Enforce Owner PIN & Staff PIN uniqueness (supporting both 4 and 6 digit store PIN lengths)
  const users = await getAllUsers();
  for (const user of users) {
    if (user.pinHash && user.pinSalt) {
      const isMatch = await verifyPin(newPin, user);
      if (isMatch) {
        return { ok: false, error: 'approval_pin_same_as_owner_or_staff' };
      }
    }
  }

  const { hash, salt } = await hashPin(newPin);
  await setSetting('approval_pin', { hash, salt });
  await setSetting('approval_pin_lock', { failedAttempts: 0, lockedUntil: null });
  await dismissPermissionPinSecurityAlert();
  await recordAudit(
    'owner',
    'approval_pin_rotated',
    'settings',
    'Owner rotated Permission PIN from security notification'
  );

  try {
    const { enqueueSyncItem } = await import('./cloudSync');
    await enqueueSyncItem('settings', 'approval_pin', {
      key: 'approval_pin',
      value: { hash, salt },
    });
  } catch {
    // Non-fatal
  }

  return { ok: true };
}
