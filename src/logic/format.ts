/**
 * Auto-capitalization and field formatting helpers for Hospivo.
 *
 * Rules:
 * 1. While typing, make the first letter of every word a capital.
 *    Do NOT lowercase other letters. A letter after an apostrophe is NOT capitalized (women's stays women's).
 * 2. GST and drug licence numbers: convert to UPPERCASE while typing.
 * 3. Phone: digits only.
 */

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
  return input.toUpperCase();
}

export function filterDigits(input: string): string {
  return input.replace(/\D/g, '');
}
