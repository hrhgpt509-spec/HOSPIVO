import { useState, useEffect } from 'react';
import { en } from './en';
import { hi } from './hi';
import { hinglish } from './hinglish';
import type { Language, ButtonLabel, TranslationSchema } from './types';
import { db } from '../db';

export * from './types';
export { en } from './en';
export { hi } from './hi';
export { hinglish } from './hinglish';

const catalogs: Record<Language, TranslationSchema> = {
  en,
  hi,
  hinglish,
};

// Default language is 'en' for new shops
let currentLanguage: Language = 'en';

type LanguageListener = (lang: Language) => void;
const listeners = new Set<LanguageListener>();

// Try to initialize language from database settings
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  db.settings
    .get('language')
    .then((item) => {
      if (item && (item.value === 'en' || item.value === 'hi' || item.value === 'hinglish')) {
        currentLanguage = item.value as Language;
        if (typeof document !== 'undefined') {
          document.documentElement.lang = currentLanguage;
        }
        listeners.forEach((l) => l(currentLanguage));
      }
    })
    .catch(() => {});
}

export function getLanguage(): Language {
  return currentLanguage;
}

export async function setLanguage(lang: Language): Promise<void> {
  currentLanguage = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  listeners.forEach((l) => l(lang));

  if (typeof indexedDB !== 'undefined') {
    try {
      await db.settings.put({ key: 'language', value: lang });
    } catch {
      // In test/mock environment, silently ignore storage error
    }
  }
}

/**
 * Traverses an object using a dot-delimited key path.
 */
function resolvePath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
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

/**
 * Interpolates variables formatted as {varName} inside translated strings.
 */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let result = text;
  for (const [key, val] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
  }
  return result;
}

/**
 * In English mode, hides the second line (sub label) if it duplicates the main title/label.
 * Hinglish and Hindi keep both lines.
 */
export function shouldShowSub(
  main?: string,
  sub?: string,
  lang: Language = currentLanguage
): boolean {
  if (!sub || !sub.trim()) return false;
  if (lang !== 'en') return true;
  if (!main || !main.trim()) return true;

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/^step\s+\d+(\s+of\s+\d+)?[:\s-]*/i, '')
      .replace(/^[0-9]+[a-z]?[.:)]\s*/, '')
      .replace(/[()[\]{}.,:;'"!?-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normMain = normalize(main);
  const normSub = normalize(sub);

  if (!normSub) return false;
  if (normMain === normSub) return false;

  const cleanWords = (s: string) =>
    s
      .split(' ')
      .filter(Boolean)
      .map((w) => w.replace(/s$/, '')) // strip trailing 's' for basic plural
      .filter((w) => !['list', 'detail', 'details', 'info', 'information'].includes(w));

  const wordsMain = cleanWords(normMain);
  const wordsSub = cleanWords(normSub);

  if (wordsMain.length > 0 && wordsSub.length > 0) {
    const nonGenericSubWords = wordsSub.filter((w) => !wordsMain.includes(w));
    if (nonGenericSubWords.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Returns translated string or ButtonLabel.
 * Falls back to English ('en') if missing in current language.
 */
export function t<T = any>(key: string, params?: Record<string, string | number>): T {
  const primaryCatalog = catalogs[currentLanguage];
  let val = resolvePath(primaryCatalog, key);

  // Fallback to English if not found in primary catalog
  if (val === undefined && currentLanguage !== 'en') {
    val = resolvePath(catalogs.en, key);
  }

  // If still missing, return the key as fallback
  if (val === undefined) {
    return key as unknown as T;
  }

  // Handle two-line ButtonLabel { main, sub }
  if (typeof val === 'object' && val !== null && 'main' in val) {
    const btn = val as ButtonLabel;
    const mainText = interpolate(btn.main, params);
    const rawSub = btn.sub ? interpolate(btn.sub, params) : '';
    const subText = shouldShowSub(mainText, rawSub, currentLanguage) ? rawSub : '';
    return {
      main: mainText,
      sub: subText,
    } as unknown as T;
  }

  // Handle regular string
  if (typeof val === 'string') {
    return interpolate(val, params) as unknown as T;
  }

  return val as unknown as T;
}

/**
 * Shorthand helper specifically returning a ButtonLabel.
 */
export function tButton(key: string, params?: Record<string, string | number>): ButtonLabel {
  const result = t(key, params);
  if (typeof result === 'object' && result !== null && 'main' in result) {
    return result as ButtonLabel;
  }
  return { main: String(result), sub: '' };
}

/**
 * React hook subscribing to language changes.
 */
export function useTranslation() {
  const [lang, setLangState] = useState<Language>(currentLanguage);

  useEffect(() => {
    const listener: LanguageListener = (newLang) => {
      setLangState(newLang);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    t,
    tButton,
    shouldShowSub: (main?: string, sub?: string) => shouldShowSub(main, sub, lang),
    language: lang,
    setLanguage,
  };
}
