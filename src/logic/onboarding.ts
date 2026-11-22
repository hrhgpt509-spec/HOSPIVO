import { db } from '../db';

/** Local flag (db.settings key) set once the first-launch Welcome Intro is completed or skipped. */
export const INTRO_SEEN_KEY = 'intro_seen';
export const INTRO_SLIDE_COUNT = 3;

export async function hasSeenIntro(): Promise<boolean> {
  try {
    const item = await db.settings.get(INTRO_SEEN_KEY);
    return item?.value === true;
  } catch {
    // If storage is unreadable, never block the user behind the intro
    return true;
  }
}

export async function markIntroSeen(): Promise<void> {
  try {
    await db.settings.put({ key: INTRO_SEEN_KEY, value: true });
  } catch {
    // Non-blocking
  }
}

export type BootScreen = 'intro' | 'setup' | 'login';

/**
 * First launch (no shop yet and intro not seen) -> intro.
 * No shop but intro seen -> setup. Returning users with a shop -> login (fast unlock).
 */
export function resolveBootScreen(params: { shopCount: number; introSeen: boolean }): BootScreen {
  if (params.shopCount > 0) return 'login';
  return params.introSeen ? 'setup' : 'intro';
}

export type ShopFlowEvent =
  | 'intro_done'
  | 'setup_complete'
  | 'shop_entered'
  | 'switch_shop'
  | 'add_shop'
  | 'cancel_add_shop';
export type ShopFlowScreen = 'setup' | 'shop_select' | 'login';

/** Navigation map: setup -> Select Your Shop -> Who is using? (and back via Switch Shop / Add Shop). */
export function nextScreen(event: ShopFlowEvent): ShopFlowScreen {
  switch (event) {
    case 'intro_done':
    case 'add_shop':
      return 'setup';
    case 'setup_complete':
    case 'switch_shop':
    case 'cancel_add_shop':
      return 'shop_select';
    case 'shop_entered':
    default:
      return 'login';
  }
}

/** Number of active staff/owner profiles on this device for the current shop. */
export async function countActiveStaff(): Promise<number> {
  try {
    return await db.users.filter((u) => u.active !== false).count();
  } catch {
    return 0;
  }
}
