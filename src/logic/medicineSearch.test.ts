import { describe, it, expect } from 'vitest';
import type { Medicine } from '../db';
import { searchMedicines, formatMedicineStock } from './medicineSearch';

const SAMPLE_MEDICINES: Medicine[] = [
  {
    id: 1,
    name: 'Crocin',
    strength: '500mg',
    form: 'tablet',
    salt: 'Paracetamol',
    company: 'GSK',
    gstPercent: 12,
    hsn: '3004',
    mrpPaise: 2450,
    unitsPerPack: 10,
    shortCode: 'C1',
    barcode: '8901117002138',
    shelf: 'S-04',
    scheduleType: 'none',
    minStockUnits: 20,
    active: true,
  },
  {
    id: 2,
    name: 'Dolo',
    strength: '650mg',
    form: 'tablet',
    salt: 'Paracetamol',
    company: 'Micro Labs',
    gstPercent: 12,
    hsn: '3004',
    mrpPaise: 3400,
    unitsPerPack: 15,
    shortCode: 'D1',
    barcode: '8901117005555',
    shelf: 'S-02',
    scheduleType: 'none',
    minStockUnits: 30,
    active: true,
  },
  {
    id: 3,
    name: 'Azithral',
    strength: '500mg',
    form: 'tablet',
    salt: 'Azithromycin',
    company: 'Alembic',
    gstPercent: 12,
    hsn: '3004',
    mrpPaise: 13200,
    unitsPerPack: 5,
    shortCode: 'A1',
    barcode: '8902228001122',
    shelf: 'S-01',
    scheduleType: 'H',
    minStockUnits: 10,
    active: true,
  },
];

describe('medicineSearch tests', () => {
  it('matches part of a name (case-insensitive)', () => {
    const results = searchMedicines(SAMPLE_MEDICINES, 'croc');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Crocin');

    const resultsUpper = searchMedicines(SAMPLE_MEDICINES, 'DOLO');
    expect(resultsUpper).toHaveLength(1);
    expect(resultsUpper[0].name).toBe('Dolo');
  });

  it('matches by short code', () => {
    const results = searchMedicines(SAMPLE_MEDICINES, 'c1');
    expect(results).toHaveLength(1);
    expect(results[0].shortCode).toBe('C1');

    const resultsA1 = searchMedicines(SAMPLE_MEDICINES, 'A1');
    expect(resultsA1).toHaveLength(1);
    expect(resultsA1[0].name).toBe('Azithral');
  });

  it('matches by barcode', () => {
    const results = searchMedicines(SAMPLE_MEDICINES, '8901117002138');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Crocin');

    // Partial barcode
    const partial = searchMedicines(SAMPLE_MEDICINES, '005555');
    expect(partial).toHaveLength(1);
    expect(partial[0].name).toBe('Dolo');
  });

  it('returns empty array when there is no match', () => {
    const results = searchMedicines(SAMPLE_MEDICINES, 'xyznonexistent');
    expect(results).toHaveLength(0);
  });

  it('matches by company and shelf', () => {
    const companyResults = searchMedicines(SAMPLE_MEDICINES, 'Alembic');
    expect(companyResults).toHaveLength(1);
    expect(companyResults[0].name).toBe('Azithral');

    const shelfResults = searchMedicines(SAMPLE_MEDICINES, 'S-04');
    expect(shelfResults).toHaveLength(1);
    expect(shelfResults[0].name).toBe('Crocin');
  });

  it('returns all medicines when query is empty or spaces', () => {
    expect(searchMedicines(SAMPLE_MEDICINES, '')).toHaveLength(3);
    expect(searchMedicines(SAMPLE_MEDICINES, '   ')).toHaveLength(3);
  });

  it('formats stock correctly in packs and loose units', () => {
    expect(formatMedicineStock(25, 10, 'pack', 'loose')).toBe('2 pack, 5 loose');
    expect(formatMedicineStock(20, 10, 'pack', 'loose')).toBe('2 pack');
    expect(formatMedicineStock(4, 10, 'pack', 'loose')).toBe('4 loose');
    expect(formatMedicineStock(0, 10, 'pack', 'loose')).toBe('0 pack');
  });
});
