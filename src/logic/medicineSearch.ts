import type { Medicine } from '../db';

/**
 * Searches a list of medicines by query.
 * Case-insensitive substring matching against:
 * - name
 * - strength
 * - shortCode
 * - company
 * - shelf
 * - barcode
 * - salt
 */
export function searchMedicines(medicines: Medicine[], query: string): Medicine[] {
  const q = query.trim().toLowerCase();
  if (!q) return medicines;

  return medicines.filter((m) => {
    const nameMatch = m.name?.toLowerCase().includes(q);
    const strengthMatch = m.strength?.toLowerCase().includes(q);
    const shortCodeMatch = m.shortCode?.toLowerCase().includes(q);
    const companyMatch = m.company?.toLowerCase().includes(q);
    const shelfMatch = m.shelf?.toLowerCase().includes(q);
    const barcodeMatch = m.barcode?.toLowerCase().includes(q);
    const saltMatch = m.salt?.toLowerCase().includes(q);

    return (
      Boolean(nameMatch) ||
      Boolean(strengthMatch) ||
      Boolean(shortCodeMatch) ||
      Boolean(companyMatch) ||
      Boolean(shelfMatch) ||
      Boolean(barcodeMatch) ||
      Boolean(saltMatch)
    );
  });
}

/**
 * Formats medicine stock count in packs and loose units.
 * Stock units is in the smallest unit (loose units).
 */
export function formatMedicineStock(
  stockUnits: number,
  unitsPerPack: number,
  packLabel = 'pack',
  looseLabel = 'loose'
): string {
  if (stockUnits <= 0) {
    return `0 ${packLabel}`;
  }

  const upp = Math.max(1, unitsPerPack || 1);
  if (upp === 1) {
    return `${stockUnits} ${packLabel}`;
  }

  const packs = Math.floor(stockUnits / upp);
  const loose = stockUnits % upp;

  if (packs > 0 && loose > 0) {
    return `${packs} ${packLabel}, ${loose} ${looseLabel}`;
  }
  if (packs > 0) {
    return `${packs} ${packLabel}`;
  }
  return `${loose} ${looseLabel}`;
}
