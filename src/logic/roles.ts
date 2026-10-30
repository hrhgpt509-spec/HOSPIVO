import type { DBUser, UserRole } from '../db';

/**
 * Role checking helpers for Hospivo
 * Rules:
 * - Owner sees everything including profit and purchase price.
 * - Cashier: selling screens only; NO profit, NO purchase price,
 *   cannot edit MRP, cannot edit/delete a finished bill.
 * - Runner: scanner only.
 */

export function isOwner(
  user: DBUser | { role?: UserRole | string } | null | undefined
): boolean {
  return user?.role === 'owner';
}

export function canSeeProfit(
  user: DBUser | { role?: UserRole | string } | null | undefined
): boolean {
  return isOwner(user);
}

export function canSeePurchasePrice(
  user: DBUser | { role?: UserRole | string } | null | undefined
): boolean {
  return isOwner(user);
}
