import { db, type DBUser } from '../db';
import { verifyPin } from './pin';
import { addAudit } from '../db/audit';

export interface UserLoginLock {
  userId: string;
  failedAttempts: number;
  lockedUntil: number | null;
  isLocked: boolean;
  minutesLeft: number;
  secondsLeft: number;
}

export type LoginAttemptResult =
  | { ok: true; status: 'ok'; user: DBUser }
  | { ok: false; status: 'wrong'; attempts: number; triesLeft: number }
  | { ok: false; status: 'locked'; minutesLeft: number; secondsLeft: number };

// Fallback in-memory storage for test/headless environments
const memoryLocks = new Map<string, { userId: string; failedAttempts: number; lockedUntil: number | null }>();

export function _resetLoginLockForTesting() {
  memoryLocks.clear();
}

export async function getLoginLock(userId: string): Promise<UserLoginLock> {
  const key = `login_lock_${userId}`;
  let raw: { userId: string; failedAttempts: number; lockedUntil: number | null } | undefined;

  if (typeof indexedDB !== 'undefined') {
    try {
      const item = await db.settings.get(key);
      if (item && item.value) {
        raw = item.value as { userId: string; failedAttempts: number; lockedUntil: number | null };
      }
    } catch {
      // fallback to memory
    }
  }

  if (!raw) {
    raw = memoryLocks.get(key) || { userId, failedAttempts: 0, lockedUntil: null };
  }

  const now = Date.now();
  const isLocked = Boolean(raw.lockedUntil && now < raw.lockedUntil);
  const remainingMs = isLocked && raw.lockedUntil ? raw.lockedUntil - now : 0;
  const secondsLeft = isLocked ? Math.max(1, Math.ceil(remainingMs / 1000)) : 0;
  const minutesLeft = isLocked ? Math.max(1, Math.ceil(remainingMs / 60000)) : 0;

  return {
    userId,
    failedAttempts: raw.failedAttempts,
    lockedUntil: raw.lockedUntil,
    isLocked,
    minutesLeft,
    secondsLeft,
  };
}

export async function setLoginLock(
  userId: string,
  lock: { userId: string; failedAttempts: number; lockedUntil: number | null }
): Promise<void> {
  const key = `login_lock_${userId}`;
  const data = { userId: lock.userId, failedAttempts: lock.failedAttempts, lockedUntil: lock.lockedUntil };
  memoryLocks.set(key, data);
  if (typeof indexedDB !== 'undefined') {
    try {
      await db.settings.put({ key, value: data });
    } catch {
      // ignore
    }
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
 * Verifies user login PIN with 5-attempt / 2-minute lockout rule:
 * - 5 wrong PIN tries for the same user lock that user for 2 minutes.
 * - Lock is saved in the database so a page refresh does not clear it.
 * - Audit logs every wrong attempt, lockout, and successful login (never the PIN).
 * - A correct PIN resets the failed attempt count.
 */
export async function attemptUserLogin(
  user: DBUser,
  pin: string
): Promise<LoginAttemptResult> {
  const now = Date.now();
  const currentLock = await getLoginLock(user.id);

  // Check if currently locked
  if (currentLock.isLocked && currentLock.lockedUntil) {
    const remainingMs = currentLock.lockedUntil - now;
    const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));
    const minutesLeft = Math.max(1, Math.ceil(remainingMs / 60000));
    return { ok: false, status: 'locked', minutesLeft, secondsLeft };
  }

  // If previous lock has expired, reset counter before proceeding
  const baseAttempts = currentLock.lockedUntil && now >= currentLock.lockedUntil ? 0 : currentLock.failedAttempts;

  // Verify candidate PIN against user's salted hash
  const isMatch = await verifyPin(pin, user);

  if (isMatch) {
    // Reset lockout state on success
    await setLoginLock(user.id, { userId: user.id, failedAttempts: 0, lockedUntil: null });
    await recordAudit(user.name, 'login_success', 'user', 'Kamyab login');
    return { ok: true, status: 'ok', user };
  }

  // Wrong PIN attempt
  const attempts = baseAttempts + 1;

  if (attempts >= 5) {
    const lockedUntil = now + 2 * 60 * 1000; // 2 minutes lock
    await setLoginLock(user.id, { userId: user.id, failedAttempts: attempts, lockedUntil });
    await recordAudit(
      user.name,
      'login_locked',
      'user',
      '5 galat try ke baad 2 minute ke liye lock ho gaya'
    );
    return { ok: false, status: 'locked', minutesLeft: 2, secondsLeft: 120 };
  }

  await setLoginLock(user.id, { userId: user.id, failedAttempts: attempts, lockedUntil: null });
  await recordAudit(
    user.name,
    'login_wrong_pin',
    'user',
    `Galat PIN try (${attempts}/5)`
  );
  return { ok: false, status: 'wrong', attempts, triesLeft: 5 - attempts };
}
