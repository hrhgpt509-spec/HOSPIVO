import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { en } from './en';
import { hinglish } from './hinglish';
import { t, tButton, setLanguage, getLanguage } from './index';

function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !('main' in value)) {
      keys = keys.concat(getAllKeys(value as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys.sort();
}

describe('i18n language catalogs and fallback tests', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  it('en.ts and hinglish.ts have exactly the same keys across all sections', () => {
    const enKeys = getAllKeys(en as unknown as Record<string, unknown>);
    const hinglishKeys = getAllKeys(hinglish as unknown as Record<string, unknown>);

    expect(enKeys).toEqual(hinglishKeys);
  });

  it('defaults to English and returns English translations', () => {
    expect(getLanguage()).toBe('en');
    expect(t('login.who_is_using')).toBe('Who is using?');
    expect(t('setup.step1_title')).toBe('Enter your shop details');
    expect(t('home.stat_sales')).toBe("Today's Sales");
  });

  it('switches to Hinglish and returns Hinglish translations', async () => {
    await setLanguage('hinglish');
    expect(getLanguage()).toBe('hinglish');
    expect(t('login.who_is_using')).toBe('Kaun hai?');
    expect(t('setup.step1_title')).toBe('Apni dukan ki jankari dalein');
    expect(t('home.stat_sales')).toBe('Aaj ki bikri');
  });

  it('two-line buttons provide main and sub in Hinglish, and hide sub in English', async () => {
    // English mode
    await setLanguage('en');
    const enBtn = tButton('home.tile_dawai_becho');
    expect(enBtn.main).toBe('Sell Medicine');
    expect(enBtn.sub).toBe('');

    // Hinglish mode
    await setLanguage('hinglish');
    const hBtn = tButton('home.tile_dawai_becho');
    expect(hBtn.main).toBe('Dawai Becho');
    expect(hBtn.sub).toBe('Sell');
  });

  it('falls back to English when a key is missing in another language', async () => {
    await setLanguage('hinglish');
    // If a non-existent or deleted key is tested, falls back to English or returns key
    // Let's test with a simulated key path present only in en
    (hinglish.errors as any).test_only_key = undefined;
    (en.errors as any).test_only_key = 'English fallback text';

    expect(t('errors.test_only_key')).toBe('English fallback text');

    // Clean up simulated test key
    delete (en.errors as any).test_only_key;
    delete (hinglish.errors as any).test_only_key;
  });

  it('interpolates parameters correctly in both languages', async () => {
    await setLanguage('en');
    expect(t('login.lockout_msg', { minutes: 2, seconds: 120 })).toBe(
      'Try again in 2 min (120s)'
    );

    await setLanguage('hinglish');
    expect(t('login.lockout_msg', { minutes: 2, seconds: 120 })).toBe(
      '2 minute baad try karein (120s)'
    );
  });
});
