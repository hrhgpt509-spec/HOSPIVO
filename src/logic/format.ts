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
  inputMode?: 'tel' | 'text';
  autoComplete: string;
}

/**
 * Returns props for controlled text inputs / textareas to enforce consistent formatting
 * while preserving the user's cursor position when typing or editing in the middle.
 */
export function textFieldProps(
  kind: FieldKind,
  value: string,
  setValue: (val: string) => void
): TextFieldProps {
  let autoCapitalize: TextFieldProps['autoCapitalize'];
  let inputMode: TextFieldProps['inputMode'];

  if (kind === 'name') {
    autoCapitalize = 'words';
  } else if (kind === 'code') {
    autoCapitalize = 'characters';
  }

  if (kind === 'phone') {
    inputMode = 'tel';
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const raw = target.value;
    const start = target.selectionStart ?? raw.length;
    const beforeCursor = raw.slice(0, start);
    const formattedBefore = formatField(kind, beforeCursor);
    const newCursor = formattedBefore.length;

    const formatted = formatField(kind, raw);
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
    autoComplete: 'off',
  };
}
