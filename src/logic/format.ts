import React from 'react';

/**
 * Auto-capitalization and field formatting helpers for Hospivo.
 *
 * Rules:
 * - "name" (shop, owner, staff, supplier, customer, doctor, medicine name, company, salt, address, shelf, product type):
 *   the first letter of every word is a capital; other letters are NOT changed ("ABC pharma" becomes "ABC Pharma");
 *   a letter after an apostrophe is not capitalised ("women's" stays "women's").
 *   Devanagari (Hindi script) text is never changed.
 * - "code" (GST number, drug licence numbers, batch number, invoice number, barcode, HSN, short code):
 *   UPPERCASE letters and digits, spaces removed, keep "-" and "/".
 * - "phone": digits only.
 * - "free": exactly as typed (search boxes, notes, strength like "500 mg").
 *
 * All formatting is idempotent (formatting twice gives the same result).
 */

export type FieldKind = 'name' | 'code' | 'phone' | 'free';

export function capitalizeWords(input: string): string {
  let result = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prevChar = i > 0 ? input[i - 1] : '';

    const isLetter = /\p{L}/u.test(char);

    if (isLetter) {
      // A letter is at the start of a word if it is at index 0 or preceded by a non-letter
      // EXCEPT when preceded by an apostrophe (' or ’) where it stays lowercase / unchanged
      const isStartOfWord =
        i === 0 || (!/\p{L}/u.test(prevChar) && prevChar !== "'" && prevChar !== '’');

      if (isStartOfWord) {
        result += char.toUpperCase();
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }
  return result;
}

export function toUpperAlphanumeric(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9\-/]/g, '');
}

export function filterDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function formatField(kind: FieldKind, value: string): string {
  if (!value) return value;
  switch (kind) {
    case 'name':
      return capitalizeWords(value);
    case 'code':
      return toUpperAlphanumeric(value);
    case 'phone':
      return filterDigits(value);
    case 'free':
    default:
      return value;
  }
}

export interface TextFieldProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  autoCapitalize?: 'words' | 'characters' | 'none' | 'off';
  inputMode?: 'tel' | 'numeric' | 'decimal' | 'text';
  pattern?: string;
  autoComplete: string;
}

/**
 * Checks whether a numeric/digit field has exceeded its maximum allowed length
 * without blocking typing, backspace, or editing.
 */
export function getNumericLimitStatus(
  value: string,
  maxLength: number
): { exceeded: boolean; currentLength: number; maxLength: number } {
  const digits = filterDigits(value || '');
  return {
    exceeded: digits.length > maxLength,
    currentLength: digits.length,
    maxLength,
  };
}

/**
 * Standard mobile/Android numeric keyboard attributes.
 */
export function numericInputProps(kind: 'integer' | 'decimal' | 'phone'): {
  inputMode: 'numeric' | 'decimal' | 'tel';
  pattern?: string;
} {
  if (kind === 'decimal') {
    return { inputMode: 'decimal' };
  }
  if (kind === 'phone') {
    return { inputMode: 'tel', pattern: '[0-9]*' };
  }
  return { inputMode: 'numeric', pattern: '[0-9]*' };
}

export interface TextFieldOptions {
  maxLength?: number;
  onLimitExceeded?: () => void;
}

/**
 * Formats an input value according to `kind` and enforces a strict `maxLength` cap.
 * Triggers `onLimitExceeded` whenever the formatted value exceeds `maxLength`.
 */
export function applyCappedInput(
  kind: FieldKind,
  rawValue: string,
  maxLength?: number,
  onLimitExceeded?: () => void
): string {
  const formatted = formatField(kind, rawValue);
  if (maxLength !== undefined && formatted.length > maxLength) {
    onLimitExceeded?.();
    return formatted.slice(0, maxLength);
  }
  return formatted;
}

/**
 * React hook for transient above-field red limit warnings when typing/pasting
 * beyond a field's hard character or digit cap.
 */
export function useLimitWarning(autoHideMs = 3500): {
  exceeded: boolean;
  trigger: () => void;
  clear: () => void;
} {
  const [exceeded, setExceeded] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clear = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setExceeded(false);
  }, []);

  const trigger = React.useCallback(() => {
    setExceeded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (autoHideMs > 0) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setExceeded(false);
      }, autoHideMs);
    }
  }, [autoHideMs]);

  return { exceeded, trigger, clear };
}

/**
 * Returns props for controlled text inputs / textareas to enforce consistent formatting
 * while preserving the user's cursor position when typing or editing in the middle.
 */
export function textFieldProps(
  kind: FieldKind,
  value: string,
  setValue: (val: string) => void,
  options?: TextFieldOptions
): TextFieldProps {
  let autoCapitalize: TextFieldProps['autoCapitalize'];
  let inputMode: TextFieldProps['inputMode'];
  let pattern: TextFieldProps['pattern'];

  if (kind === 'name') {
    autoCapitalize = 'words';
  } else if (kind === 'code') {
    autoCapitalize = 'characters';
  }

  if (kind === 'phone') {
    inputMode = 'numeric';
    pattern = '[0-9]*';
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const raw = target.value;
    const start = target.selectionStart ?? raw.length;
    const beforeCursor = raw.slice(0, start);
    const formattedBefore = formatField(kind, beforeCursor);
    const maxLen = options?.maxLength;
    const newCursor = maxLen !== undefined ? Math.min(formattedBefore.length, maxLen) : formattedBefore.length;

    const formatted = applyCappedInput(kind, raw, maxLen, options?.onLimitExceeded);
    setValue(formatted);

    // Keep cursor where it was instead of jumping to the end
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        try {
          target.setSelectionRange(newCursor, newCursor);
        } catch {
          // Safe on inputs that don't support setSelectionRange
        }
      });
    } else {
      try {
        target.setSelectionRange(newCursor, newCursor);
      } catch {
        // Safe
      }
    }
  };

  return {
    value: value ?? '',
    onChange,
    autoCapitalize,
    inputMode,
    ...(pattern ? { pattern } : {}),
    autoComplete: 'off',
  };
}
