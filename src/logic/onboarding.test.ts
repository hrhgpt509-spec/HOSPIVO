import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  INTRO_SEEN_KEY,
  INTRO_SLIDE_COUNT,
  hasSeenIntro,
  markIntroSeen,
  resolveBootScreen,
  nextScreen,
  countActiveStaff,
} from './onboarding';

describe('first-launch intro flag', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await db.users.clear();
  });

  it('is not seen on a fresh device, and persists once completed or skipped', async () => {
    expect(await hasSeenIntro()).toBe(false);
    await markIntroSeen();
    expect(await hasSeenIntro()).toBe(true);
    expect((await db.settings.get(INTRO_SEEN_KEY))?.value).toBe(true);
  });

  it('has exactly 3 slides', () => {
    expect(INTRO_SLIDE_COUNT).toBe(3);
  });

  it('shows intro only before first setup; returning users skip straight to login', () => {
    expect(resolveBootScreen({ shopCount: 0, introSeen: false })).toBe('intro');
    expect(resolveBootScreen({ shopCount: 0, introSeen: true })).toBe('setup');
    expect(resolveBootScreen({ shopCount: 1, introSeen: false })).toBe('login');
    expect(resolveBootScreen({ shopCount: 1, introSeen: true })).toBe('login');
  });
});

describe('shop selector navigation flow', () => {
  beforeEach(async () => {
    await db.users.clear();
  });

  it('routes intro -> setup -> Select Your Shop -> Who is using? and back via Switch Shop / Add Shop', () => {
    expect(nextScreen('intro_done')).toBe('setup');
    expect(nextScreen('setup_complete')).toBe('shop_select');
    expect(nextScreen('shop_entered')).toBe('login');
    expect(nextScreen('switch_shop')).toBe('shop_select');
    expect(nextScreen('add_shop')).toBe('setup');
    expect(nextScreen('cancel_add_shop')).toBe('shop_select');
  });

  it('counts only active staff profiles for the shop card', async () => {
    await db.users.bulkAdd([
      { id: 'owner', name: 'Owner A', role: 'owner', pinHash: 'h', pinSalt: 's', active: true },
      { id: 's1', name: 'Staff A', role: 'cashier', pinHash: 'h', pinSalt: 's', active: true },
      { id: 's2', name: 'Staff B', role: 'cashier', pinHash: 'h', pinSalt: 's', active: false },
    ]);
    expect(await countActiveStaff()).toBe(2);
  });
});
