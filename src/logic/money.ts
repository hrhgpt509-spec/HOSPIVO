/**
 * Money helper for Hospivo.
 * Engineering rule: money is stored as whole paise (integers), never decimals/floats.
 * 1 Rupee = 100 Paise.
 */

/**
 * Converts a rupee amount (which may have decimal points) to whole paise (integer).
 */
export function rupeesToPaise(rupees: number): number {
  if (isNaN(rupees)) return 0;
  return Math.round(rupees * 100);
}

/**
 * Converts whole paise (integer) to rupees (number).
 */
export function paiseToRupees(paise: number): number {
  if (isNaN(paise)) return 0;
  return paise / 100;
}

/**
 * Formats paise into Indian currency format (e.g. Rs. 12,400 or Rs. 12,400.50).
 */
export function formatRupees(paise: number): string {
  if (isNaN(paise)) return 'Rs. 0';

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = absPaise / 100;

  const hasPaise = absPaise % 100 !== 0;

  const formattedNumber = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });

  return `${isNegative ? '-' : ''}Rs. ${formattedNumber}`;
}
