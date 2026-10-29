import { db, type DBUser } from '../db';
import { hashPin, validatePin, verifyPin } from './pin';
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
  label: string;
  labelHindi: string;
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
    label: 'Delete or correct finished bill',
    labelHindi: 'Bill hatana ya badalna',
    rule: 'local_pin',
  },
  {
    category: 'price_change',
    label: 'Price change',
    labelHindi: 'Daam badalna',
    rule: 'local_pin',
  },
  {
    category: 'discount_above_limit',
    label: 'Discount above limit',
    labelHindi: 'Bada discount',
    rule: 'local_pin',
  },
  {
    category: 'stock_correction',
    label: 'Stock correction',
    labelHindi: 'Stock sudhaar',
    rule: 'blocked_offline',
  },
  {
    category: 'cash_mismatch',
    label: 'Cash mismatch at Din Band',
    labelHindi: 'Din Band mein fark',
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

export interface SetApprovalPinResult {
  ok: boolean;
  error?: string;
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
 * Sets the Approval PIN ("Ijazat PIN").
 * - Validates length (4-6 digits, numbers only).
 * - Must differ from Owner PIN and every staff PIN.
 * - Stores salted hash in settings (never plain text).
 */
export async function setApprovalPin(
  pin: string,
  existingPinsToReject?: string[]
): Promise<SetApprovalPinResult> {
  const validation = validatePin(pin);
  if (!validation.valid) {
    return { ok: false, error: validation.error || 'Ijazat PIN 4 se 6 digits ka hona chahiye' };
  }

  // 1. Reject if candidate equals any plain PIN passed in (e.g. from setup wizard)
  if (existingPinsToReject && existingPinsToReject.some((p) => p && p === pin)) {
    return {
      ok: false,
      error: 'Ijazat PIN Malik ya Staff PIN se alag hona chahiye',
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
          error: 'Ijazat PIN Malik ya Staff PIN se alag hona chahiye',
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
    await recordAudit('system', 'approval_pin_success', 'approval', 'Ijazat PIN sahi daala gaya');
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
      '3 galat try ke baad Ijazat PIN 5 minute ke liye lock ho gaya'
    );
    return { ok: false, status: 'locked', minutesLeft: 5 };
  }

  await setSetting('approval_pin_lock', { failedAttempts: newAttempts, lockedUntil: null });
  await recordAudit(
    'system',
    'approval_pin_wrong',
    'approval',
    `Galat Ijazat PIN try (${newAttempts}/3)`
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
