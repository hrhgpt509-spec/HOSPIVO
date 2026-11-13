import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type Medicine } from '../db';
import {
  validateMedicineForm,
  computeMedicineChanges,
  minStockUnitsToPacks,
  alertPacksToMinUnits,
  type MedicineFormData,
} from './medicineForm';
import { findDuplicateMedicines } from './stock';

const SAMPLE_EXISTING_MEDICINES: Medicine[] = [
  {
    id: 1,
    name: 'Crocin',
    strength: '650 mg',
    form: 'Tablet',
    salt: 'Paracetamol',
    company: 'GSK',
    gstPercent: 12,
    hsn: '300490',
    mrpPaise: 3150,
    unitsPerPack: 15,
    shortCode: 'C1',
    barcode: '8901117002138',
    shelf: 'S-04',
    scheduleType: 'none',
    minStockUnits: 10,
    active: true,
  },
  {
    id: 2,
    name: 'Dolo',
    strength: '650 mg',
    form: 'Tablet',
    salt: 'Paracetamol',
    company: 'Micro Labs',
    gstPercent: 12,
    hsn: '300490',
    mrpPaise: 3400,
    unitsPerPack: 15,
    shortCode: 'D1',
    barcode: '8901117005555',
    shelf: 'S-02',
    scheduleType: 'none',
    minStockUnits: 30,
    active: true,
  },
];

const DEFAULT_VALID_FORM: MedicineFormData = {
  name: 'Azithral',
  strength: '500 mg',
  form: 'Tablet',
  salt: 'Azithromycin',
  company: 'Alembic',
  gstPercent: 12,
  hsn: '300490',
  mrpRupees: '120.50',
  unitsPerPack: '5',
  shortCode: 'A1',
  barcode: '8902228001122',
  shelf: 'S-01',
  scheduleType: 'H',
  minStockUnits: '10',
};

describe('medicineForm validation and business rules', () => {
  beforeEach(async () => {
    await db.medicines.clear();
    for (const m of SAMPLE_EXISTING_MEDICINES) {
      await db.medicines.add({ ...m });
    }
  });

  it('detects missing name', () => {
    const invalidData: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      name: '   ',
    };
    const errors = validateMedicineForm(invalidData, SAMPLE_EXISTING_MEDICINES);
    expect(errors.name).toBe('err_name_required');
  });

  it('detects MRP 0 or negative', () => {
    const zeroMrp: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      mrpRupees: '0',
    };
    const errorsZero = validateMedicineForm(zeroMrp, SAMPLE_EXISTING_MEDICINES);
    expect(errorsZero.mrpRupees).toBe('err_mrp_invalid');

    const negativeMrp: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      mrpRupees: '-15.50',
    };
    const errorsNegative = validateMedicineForm(negativeMrp, SAMPLE_EXISTING_MEDICINES);
    expect(errorsNegative.mrpRupees).toBe('err_mrp_invalid');

    const emptyMrp: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      mrpRupees: '',
    };
    const errorsEmpty = validateMedicineForm(emptyMrp, SAMPLE_EXISTING_MEDICINES);
    expect(errorsEmpty.mrpRupees).toBe('err_mrp_invalid');
  });

  it('detects units per pack 0 or non-integer', () => {
    const zeroUnits: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      unitsPerPack: '0',
    };
    const errorsZero = validateMedicineForm(zeroUnits, SAMPLE_EXISTING_MEDICINES);
    expect(errorsZero.unitsPerPack).toBe('err_units_invalid');

    const fractionalUnits: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      unitsPerPack: '2.5',
    };
    const errorsFractional = validateMedicineForm(fractionalUnits, SAMPLE_EXISTING_MEDICINES);
    expect(errorsFractional.unitsPerPack).toBe('err_units_invalid');

    const emptyUnits: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      unitsPerPack: '',
    };
    const errorsEmpty = validateMedicineForm(emptyUnits, SAMPLE_EXISTING_MEDICINES);
    expect(errorsEmpty.unitsPerPack).toBe('err_units_invalid');
  });

  it('enforces unique short code (case-insensitive)', () => {
    const duplicateCodeData: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      shortCode: 'c1', // existing id 1 has C1
    };
    const errors = validateMedicineForm(duplicateCodeData, SAMPLE_EXISTING_MEDICINES);
    expect(errors.shortCode).toBe('err_short_code_duplicate');

    // Editing the same medicine should allow keeping its own code
    const ownErrors = validateMedicineForm(duplicateCodeData, SAMPLE_EXISTING_MEDICINES, 1);
    expect(ownErrors.shortCode).toBeUndefined();
  });

  it('enforces unique barcode across medicines', () => {
    const duplicateBarcodeData: MedicineFormData = {
      ...DEFAULT_VALID_FORM,
      barcode: '8901117002138', // belongs to Crocin
    };
    const errors = validateMedicineForm(duplicateBarcodeData, SAMPLE_EXISTING_MEDICINES);
    expect(errors.barcode).toBe('err_barcode_duplicate');

    // Editing the same medicine allows keeping its own barcode
    const ownErrors = validateMedicineForm(duplicateBarcodeData, SAMPLE_EXISTING_MEDICINES, 1);
    expect(ownErrors.barcode).toBeUndefined();
  });

  it('detects duplicate medicine warning via findDuplicateMedicines', async () => {
    // Exact duplicate name + strength
    const duplicates = await findDuplicateMedicines('Crocin', '650 mg', 'Other Company');
    expect(duplicates.length).toBeGreaterThanOrEqual(1);
    expect(duplicates[0].name).toBe('Crocin');

    // Duplicate name + company
    const dupCompany = await findDuplicateMedicines('Dolo', 'Different Power', 'Micro Labs');
    expect(dupCompany.length).toBeGreaterThanOrEqual(1);
    expect(dupCompany[0].name).toBe('Dolo');

    // Completely new medicine
    const noDup = await findDuplicateMedicines('Paracip', '500 mg', 'Cipla');
    expect(noDup).toHaveLength(0);
  });

  it('computes changes accurately for audit logging', () => {
    const oldMed = SAMPLE_EXISTING_MEDICINES[0];
    const newMed: Partial<Medicine> = {
      ...oldMed,
      mrpPaise: 3500, // changed from 3150
      shelf: 'S-09', // changed from S-04
    };
    const changes = computeMedicineChanges(oldMed, newMed);
    expect(Object.keys(changes)).toContain('mrpPaise');
    expect(Object.keys(changes)).toContain('shelf');
    expect(changes.mrpPaise.old).toBe(3150);
    expect(changes.mrpPaise.new).toBe(3500);
    expect(changes.shelf.old).toBe('S-04');
    expect(changes.shelf.new).toBe('S-09');
  });

  describe('Low Stock Alert pack <-> loose units conversion', () => {
    it('converts alert packs to loose units for database storage', () => {
      // 200 packs with 100 units/pack = 20,000 units
      expect(alertPacksToMinUnits('200', 100)).toBe(20000);
      expect(alertPacksToMinUnits(200, 100)).toBe(20000);

      // 10 packs with 15 units/pack = 150 units
      expect(alertPacksToMinUnits('10', 15)).toBe(150);

      // Default unitsPerPack fallback to 1
      expect(alertPacksToMinUnits('5', 0)).toBe(5);

      // Zero, empty, or negative returns 0
      expect(alertPacksToMinUnits('', 10)).toBe(0);
      expect(alertPacksToMinUnits('0', 10)).toBe(0);
      expect(alertPacksToMinUnits('-5', 10)).toBe(0);
      expect(alertPacksToMinUnits(undefined, 10)).toBe(0);
    });

    it('converts stored loose units to packs for form editing display', () => {
      // 20,000 units with 100 units/pack = 200 packs
      expect(minStockUnitsToPacks(20000, 100)).toBe(200);

      // 150 units with 15 units/pack = 10 packs
      expect(minStockUnitsToPacks(150, 15)).toBe(10);

      // Rounding handles loose remainders gracefully
      expect(minStockUnitsToPacks(195, 10)).toBe(20);

      // Zero or negative returns 0
      expect(minStockUnitsToPacks(0, 10)).toBe(0);
      expect(minStockUnitsToPacks(undefined, 10)).toBe(0);
    });
  });
});
