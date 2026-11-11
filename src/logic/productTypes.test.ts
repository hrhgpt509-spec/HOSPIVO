import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Medicine } from '../db';
import {
  addProductType,
  getActiveProductTypes,
  validateProductTypeName,
  formatProductType,
  BUILT_IN_PRODUCT_TYPES,
} from './productTypes';

describe('productTypes logic & Dexie persistence', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('adds a new product type and writes audit log with name only', async () => {
    const created = await addProductType('Serum', 'Ramesh');
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Serum');
    expect(created.active).toBe(true);

    const fromDb = await db.productTypes.get(created.id!);
    expect(fromDb).toBeDefined();
    expect(fromDb?.name).toBe('Serum');

    const audit = await db.auditLog.filter((a) => a.action === 'product_type_created').first();
    expect(audit).toBeDefined();
    expect(audit?.action).toBe('product_type_created');
    expect(audit?.record).toBe('Serum');
    expect(audit?.who).toBe('Ramesh');
  });

  it('rejects duplicates against built-in types whatever the capitals and spaces', () => {
    // English variations
    expect(validateProductTypeName('tablet').valid).toBe(false);
    expect(validateProductTypeName('  TABLET  ').valid).toBe(false);
    expect(validateProductTypeName('  TaBLet ').valid).toBe(false);
    expect(validateProductTypeName('Syrup').valid).toBe(false);
    expect(validateProductTypeName('  cApSulE ').valid).toBe(false);
    expect(validateProductTypeName('  injection  ').valid).toBe(false);
    expect(validateProductTypeName('ointment / cream').valid).toBe(false);
    expect(validateProductTypeName('drops').valid).toBe(false);

    // Hindi variations
    expect(validateProductTypeName('टैबलेट').valid).toBe(false);
    expect(validateProductTypeName('  सिरप  ').valid).toBe(false);
    expect(validateProductTypeName('कैप्सूल').valid).toBe(false);
    expect(validateProductTypeName('इंजेक्शन').valid).toBe(false);

    const dupRes = validateProductTypeName('  TABLET  ');
    expect(dupRes.error).toBe('duplicate');
    expect(dupRes.errorKey).toBe('medicine_form.type_already_exists');
  });

  it('rejects duplicates against custom types whatever the capitals and spaces', async () => {
    await addProductType('Serum', 'Owner');
    const existing = await getActiveProductTypes();

    expect(validateProductTypeName('serum', existing).valid).toBe(false);
    expect(validateProductTypeName('  SERUM  ', existing).valid).toBe(false);
    expect(validateProductTypeName('  seRUm  ', existing).valid).toBe(false);

    const res = validateProductTypeName('  SERUM  ', existing);
    expect(res.error).toBe('duplicate');
    expect(res.errorKey).toBe('medicine_form.type_already_exists');

    await expect(addProductType('  serum  ', 'Owner')).rejects.toThrow('type_already_exists');
  });

  it('rejects 1-character and 31-character names, accepts 2 to 30 characters', () => {
    // 1-character name
    const oneChar = validateProductTypeName('A');
    expect(oneChar.valid).toBe(false);
    expect(oneChar.error).toBe('length');
    expect(oneChar.errorKey).toBe('medicine_form.type_length_error');

    // 31-character name
    const thirtyOneChar = validateProductTypeName('A'.repeat(31));
    expect(thirtyOneChar.valid).toBe(false);
    expect(thirtyOneChar.error).toBe('length');
    expect(thirtyOneChar.errorKey).toBe('medicine_form.type_length_error');

    // Valid: 2-character name
    const twoChar = validateProductTypeName('IV');
    expect(twoChar.valid).toBe(true);
    expect(twoChar.formattedName).toBe('IV');

    // Valid: 30-character name
    const thirtyChar = validateProductTypeName('Surgical Instrument Pack 12345');
    expect(thirtyChar.formattedName.length).toBeLessThanOrEqual(30);
    expect(thirtyChar.valid).toBe(true);
  });

  it('auto-capitalises words and collapses spaces', () => {
    const res = validateProductTypeName('  medical   surgical   kit  ');
    expect(res.valid).toBe(true);
    expect(res.formattedName).toBe('Medical Surgical Kit');
  });

  it('preserves custom type on saved medicine', async () => {
    await addProductType('Serum', 'Owner');

    const newMed: Medicine = {
      name: 'Anti-Venom Serum',
      strength: '10ml',
      form: 'Serum',
      salt: 'Anti-Venom',
      company: 'Bharat Serums',
      gstPercent: 12,
      hsn: '3002',
      mrpPaise: 50000,
      unitsPerPack: 1,
      shortCode: 'AV1',
      barcode: '8901234567890',
      shelf: 'Cold-1',
      scheduleType: 'none',
      minStockUnits: 5,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const id = await db.medicines.add(newMed);
    const loaded = await db.medicines.get(id);

    expect(loaded).toBeDefined();
    expect(loaded?.form).toBe('Serum');
  });

  it('formats custom types as typed and built-ins through t()', () => {
    const mockT = (key: string) => {
      if (key === 'medicine_form.form_tablet') return 'टैबलेट';
      if (key === 'medicine_form.form_syrup') return 'सिरप';
      return '';
    };

    // Built-in types translated
    expect(formatProductType('Tablet', mockT)).toBe('टैबलेट');
    expect(formatProductType('Syrup', mockT)).toBe('सिरप');

    // Custom types returned verbatim as typed
    expect(formatProductType('Serum', mockT)).toBe('Serum');
    expect(formatProductType('Surgical Item', mockT)).toBe('Surgical Item');

    // Empty fallback
    expect(formatProductType('', mockT)).toBe('');
  });

  it('lists built-in types first, never copied into productTypes table', async () => {
    expect(BUILT_IN_PRODUCT_TYPES).toEqual([
      'Tablet',
      'Syrup',
      'Capsule',
      'Injection',
      'Ointment / Cream',
      'Drops',
    ]);

    // Table starts completely empty (no built-in rows copied)
    const count = await db.productTypes.count();
    expect(count).toBe(0);

    // After adding custom type, only that custom type exists in table
    await addProductType('Serum', 'Owner');
    const tableRows = await db.productTypes.toArray();
    expect(tableRows.length).toBe(1);
    expect(tableRows[0].name).toBe('Serum');
  });
});
