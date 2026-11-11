import { describe, it, expect, vi } from 'vitest';
import {
  capitalizeWords,
  toUpperAlphanumeric,
  filterDigits,
  formatField,
  textFieldProps,
} from './format';

describe('format.ts logic tests', () => {
  describe('capitalizeWords', () => {
    it('capitalizes first letter of every word and keeps existing capitals', () => {
      expect(capitalizeWords('abc pharma')).toBe('Abc Pharma');
      expect(capitalizeWords('ABC pharma')).toBe('ABC Pharma');
      expect(capitalizeWords('maa durga medical hall')).toBe('Maa Durga Medical Hall');
      expect(capitalizeWords('Dolo 650MG')).toBe('Dolo 650MG');
    });

    it('handles apostrophes without capitalising the letter after it', () => {
      expect(capitalizeWords("women's")).toBe("Women's");
      expect(capitalizeWords("women’s")).toBe("Women’s");
      expect(capitalizeWords("old women's college road, near kranti hotel")).toBe(
        "Old Women's College Road, Near Kranti Hotel"
      );
    });

    it('handles double spaces and preserves them', () => {
      expect(capitalizeWords('ABC  pharma')).toBe('ABC  Pharma');
      expect(capitalizeWords('shree   medical   store')).toBe('Shree   Medical   Store');
    });

    it('leaves Devanagari (Hindi script) text unchanged', () => {
      const devanagari = 'श्री मेडिकल स्टोर';
      expect(capitalizeWords(devanagari)).toBe(devanagari);
      expect(capitalizeWords('पैरासिटामोल 500 एमजी')).toBe('पैरासिटामोल 500 एमजी');
    });

    it('is idempotent (formatting twice gives the same result)', () => {
      const sample = "ABC  pharma's dolo 650MG";
      const once = capitalizeWords(sample);
      const twice = capitalizeWords(once);
      expect(twice).toBe(once);
    });
  });

  describe('code formatting (toUpperAlphanumeric)', () => {
    it('upper-cases letters, removes spaces, and keeps - and /', () => {
      expect(toUpperAlphanumeric('09aaaaa0000a1z5')).toBe('09AAAAA0000A1Z5');
      expect(toUpperAlphanumeric('up-mrt-20b/8892')).toBe('UP-MRT-20B/8892');
      expect(toUpperAlphanumeric('up - mrt - 20b / 8892')).toBe('UP-MRT-20B/8892');
      expect(toUpperAlphanumeric('inv# 102/b-9')).toBe('INV102/B-9');
      expect(toUpperAlphanumeric('batch abc 123')).toBe('BATCHABC123');
    });

    it('is idempotent (formatting twice gives the same result)', () => {
      const sample = 'up-mrt-20b/8892 abc';
      const once = toUpperAlphanumeric(sample);
      const twice = toUpperAlphanumeric(once);
      expect(twice).toBe(once);
    });
  });

  describe('phone formatting (filterDigits)', () => {
    it('keeps digits only', () => {
      expect(filterDigits('9006286255')).toBe('9006286255');
      expect(filterDigits('900-628-6255')).toBe('9006286255');
      expect(filterDigits('Phone: +91 90062 86255')).toBe('919006286255');
      expect(filterDigits('(022) 2345-6789')).toBe('02223456789');
    });

    it('is idempotent (formatting twice gives the same result)', () => {
      const sample = '+91 98765-43210';
      const once = filterDigits(sample);
      const twice = filterDigits(once);
      expect(twice).toBe(once);
    });
  });

  describe('formatField dispatcher', () => {
    it('dispatches properly to each kind', () => {
      expect(formatField('name', 'shree pharma')).toBe('Shree Pharma');
      expect(formatField('code', 'gst 09abc123/z-1')).toBe('GST09ABC123/Z-1');
      expect(formatField('phone', '+91 999 888 7777')).toBe('919998887777');
      expect(formatField('free', '  500 mg note  ')).toBe('  500 mg note  ');
    });
  });

  describe('textFieldProps helper', () => {
    it('returns expected attributes for each field kind', () => {
      const fn = vi.fn();

      const nameProps = textFieldProps('name', 'test', fn);
      expect(nameProps.value).toBe('test');
      expect(nameProps.autoCapitalize).toBe('words');
      expect(nameProps.inputMode).toBeUndefined();
      expect(nameProps.autoComplete).toBe('off');

      const codeProps = textFieldProps('code', 'test', fn);
      expect(codeProps.autoCapitalize).toBe('characters');
      expect(codeProps.inputMode).toBeUndefined();
      expect(codeProps.autoComplete).toBe('off');

      const phoneProps = textFieldProps('phone', '123', fn);
      expect(phoneProps.autoCapitalize).toBeUndefined();
      expect(phoneProps.inputMode).toBe('tel');
      expect(phoneProps.autoComplete).toBe('off');

      const freeProps = textFieldProps('free', 'anything', fn);
      expect(freeProps.autoCapitalize).toBeUndefined();
      expect(freeProps.inputMode).toBeUndefined();
      expect(freeProps.autoComplete).toBe('off');
    });

    it('formats value on onChange and preserves cursor position', () => {
      let currentVal = '';
      const setValue = (val: string) => {
        currentVal = val;
      };

      const setSelectionRangeMock = vi.fn();
      const mockInput = {
        value: 'abc pharma',
        selectionStart: 4,
        selectionEnd: 4,
        setSelectionRange: setSelectionRangeMock,
      };

      const props = textFieldProps('name', currentVal, setValue);
      props.onChange({
        currentTarget: mockInput as unknown as HTMLInputElement,
      } as React.ChangeEvent<HTMLInputElement>);

      expect(currentVal).toBe('Abc Pharma');
      // Cursor was at position 4 ("abc ") -> formatted before cursor is "Abc " (length 4)
      expect(setSelectionRangeMock).toHaveBeenCalledWith(4, 4);
    });

    it('adjusts cursor in code fields when spaces are removed', () => {
      let currentVal = '';
      const setValue = (val: string) => {
        currentVal = val;
      };

      const setSelectionRangeMock = vi.fn();
      // User types "ab c" with cursor right after space at pos 3
      const mockInput = {
        value: 'ab c',
        selectionStart: 3,
        selectionEnd: 3,
        setSelectionRange: setSelectionRangeMock,
      };

      const props = textFieldProps('code', currentVal, setValue);
      props.onChange({
        currentTarget: mockInput as unknown as HTMLInputElement,
      } as React.ChangeEvent<HTMLInputElement>);

      expect(currentVal).toBe('ABC');
      // "ab " before cursor formats to "AB" (length 2), so cursor stays at 2
      expect(setSelectionRangeMock).toHaveBeenCalledWith(2, 2);
    });
  });
});
