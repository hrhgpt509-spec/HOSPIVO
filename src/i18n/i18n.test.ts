/// <reference types="node" />
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { en } from './en';
import { hi } from './hi';
import { hinglish } from './hinglish';
import { t, tButton, setLanguage, getLanguage, shouldShowSub } from './index';

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

  it('en.ts, hi.ts, and hinglish.ts have exactly the same keys across all sections', () => {
    const enKeys = getAllKeys(en as unknown as Record<string, unknown>);
    const hiKeys = getAllKeys(hi as unknown as Record<string, unknown>);
    const hinglishKeys = getAllKeys(hinglish as unknown as Record<string, unknown>);

    expect(hiKeys).toEqual(enKeys);
    expect(hinglishKeys).toEqual(enKeys);
  });

  it('defaults to English and returns English translations', () => {
    expect(getLanguage()).toBe('en');
    expect(t('login.who_is_using')).toBe('Who is using?');
    expect(t('setup.step1_title')).toBe('Enter your shop details');
    expect(t('home.stat_sales')).toBe("Today's Sales");
  });

  it('switches to Hindi (Devanagari) and returns Hindi translations', async () => {
    await setLanguage('hi');
    expect(getLanguage()).toBe('hi');
    expect(t('login.who_is_using')).toBe('कौन हैं?');
    expect(t('setup.step1_title')).toBe('अपनी दुकान की जानकारी भरें');
    expect(t('home.stat_sales')).toBe('आज की बिक्री');
  });

  it('switches to Hinglish and returns Hinglish translations', async () => {
    await setLanguage('hinglish');
    expect(getLanguage()).toBe('hinglish');
    expect(t('login.who_is_using')).toBe('Kaun hai?');
    expect(t('setup.step1_title')).toBe('Apni dukan ki jankari dalein');
    expect(t('home.stat_sales')).toBe('Aaj ki bikri');
  });

  it('two-line buttons provide main in Hindi/Hinglish with English sub, and hide sub in English', async () => {
    // English mode
    await setLanguage('en');
    const enBtn = tButton('home.tile_dawai_becho');
    expect(enBtn.main).toBe('Sell Medicine');
    expect(enBtn.sub).toBe('');

    // Hindi (Devanagari) mode
    await setLanguage('hi');
    const hiBtn = tButton('home.tile_dawai_becho');
    expect(hiBtn.main).toBe('दवाई बेचो');
    expect(hiBtn.sub).toBe('Sell');

    // Hinglish mode
    await setLanguage('hinglish');
    const hBtn = tButton('home.tile_dawai_becho');
    expect(hBtn.main).toBe('Dawai Becho');
    expect(hBtn.sub).toBe('Sell');
  });

  it('falls back to English when a key is missing in another language', async () => {
    // Test fallback from Hindi
    await setLanguage('hi');
    (hi.errors as any).test_only_key = undefined;
    (en.errors as any).test_only_key = 'English fallback text';
    expect(t('errors.test_only_key')).toBe('English fallback text');

    // Test fallback from Hinglish
    await setLanguage('hinglish');
    (hinglish.errors as any).test_only_key = undefined;
    expect(t('errors.test_only_key')).toBe('English fallback text');

    // Clean up simulated test key
    delete (en.errors as any).test_only_key;
    delete (hi.errors as any).test_only_key;
    delete (hinglish.errors as any).test_only_key;
  });

  it('interpolates parameters correctly across all languages', async () => {
    await setLanguage('en');
    expect(t('login.lockout_msg', { minutes: 2, seconds: 120 })).toBe(
      'Try again in 2 min (120s)'
    );

    await setLanguage('hi');
    expect(t('login.lockout_msg', { minutes: 2, seconds: 120 })).toBe(
      '2 मिनट बाद कोशिश करें (120s)'
    );

    await setLanguage('hinglish');
    expect(t('login.lockout_msg', { minutes: 2, seconds: 120 })).toBe(
      '2 minute baad try karein (120s)'
    );
  });

  it('shouldShowSub suppresses duplicate sub-labels in English and preserves both in Hindi and Hinglish', async () => {
    // English mode: duplicate sub-labels should be hidden (return false)
    await setLanguage('en');
    expect(shouldShowSub('Step 3 of 4: Add Medicines', 'Add medicines', 'en')).toBe(false);
    expect(shouldShowSub('Medicine Details', 'Medicine details', 'en')).toBe(false);
    expect(shouldShowSub('Added Medicines', 'Added medicine list', 'en')).toBe(false);
    expect(shouldShowSub('Edit Medicine', '(Edit medicine)', 'en')).toBe(false);

    // Non-duplicates in English should still be shown (return true)
    expect(shouldShowSub('Step 1 of 4: Supplier', 'Choose supplier', 'en')).toBe(true);
    expect(shouldShowSub('Step 4 of 4: Review and Save', 'Review stock before saving', 'en')).toBe(true);

    // Hindi mode: always preserves both lines (return true)
    await setLanguage('hi');
    expect(shouldShowSub('कदम 3/4: दवाई जोड़ें', 'Add medicines', 'hi')).toBe(true);
    expect(shouldShowSub('दवाई की जानकारी', 'Medicine details', 'hi')).toBe(true);
    expect(shouldShowSub('जोड़ी गई दवाइयां', 'Added medicine list', 'hi')).toBe(true);
    expect(shouldShowSub('दवाई बदलें', '(Edit medicine)', 'hi')).toBe(true);

    // Hinglish mode: always preserves both lines (return true)
    await setLanguage('hinglish');
    expect(shouldShowSub('Step 3 of 4: Dawai jodo', 'Add medicines', 'hinglish')).toBe(true);
    expect(shouldShowSub('Dawai ki jaankari', 'Medicine details', 'hinglish')).toBe(true);
    expect(shouldShowSub('Jodi gayi dawaiyan', 'Added medicine list', 'hinglish')).toBe(true);
    expect(shouldShowSub('Dawai Badlein', '(Edit medicine)', 'hinglish')).toBe(true);
  });

  it('all t() and tButton() keys in src/screens and src/components exist in en, hi, and hinglish catalogs', () => {
    function resolveKeyPath(obj: unknown, keyPath: string): unknown {
      if (!obj || typeof obj !== 'object') return undefined;
      const parts = keyPath.split('.');
      let current: unknown = obj;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
      return current;
    }

    function getSourceFiles(dir: string): string[] {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(getSourceFiles(fullPath));
        } else if ((file.endsWith('.tsx') || file.endsWith('.ts')) && !file.includes('.test.')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const srcDir = path.resolve(process.cwd(), 'src');
    const screensFiles = getSourceFiles(path.join(srcDir, 'screens'));
    const componentsFiles = getSourceFiles(path.join(srcDir, 'components'));
    const allFiles = [...screensFiles, ...componentsFiles];

    expect(allFiles.length).toBeGreaterThan(0);

    const missingKeys: { file: string; key: string; missingIn: string[] }[] = [];
    const keyRegex = /\b(?:t|tButton)\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = keyRegex.exec(content)) !== null) {
        const key = match[1];
        const missingIn: string[] = [];

        if (resolveKeyPath(en, key) === undefined) {
          missingIn.push('en');
        }
        if (resolveKeyPath(hi, key) === undefined) {
          missingIn.push('hi');
        }
        if (resolveKeyPath(hinglish, key) === undefined) {
          missingIn.push('hinglish');
        }

        if (missingIn.length > 0) {
          const relPath = path.relative(srcDir, filePath).replace(/\\/g, '/');
          missingKeys.push({ file: relPath, key, missingIn });
        }
      }
    }

    if (missingKeys.length > 0) {
      const failureReport = missingKeys
        .map((m) => `${m.file}: key "${m.key}" is missing in [${m.missingIn.join(', ')}]`)
        .join('\n');
      expect.fail(`Found missing i18n keys in UI files:\n${failureReport}`);
    }
  });
});
