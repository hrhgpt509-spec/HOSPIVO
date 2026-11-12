import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Medicine } from '../db';
import {
  parseCsv,
  validateAndClassifyRows,
  saveImportedMedicines,
  generateSampleCsv,
} from './medicineImport';

describe('medicineImport logic and tests', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('generates sample CSV template header and 1 example row', () => {
    const csv = generateSampleCsv();
    expect(csv).toContain('Name,Strength,Form,Salt,Company,MRP,UnitsPerPack');
    expect(csv).toContain('Crocin 650 Advance,650mg,Tablet,Paracetamol,GlaxoSmithKline,31.50,15');
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0][0]).toBe('Name');
    expect(parsed[1][0]).toBe('Crocin 650 Advance');
  });

  it('parses valid CSV rows, converting MRP rupees to paise, and computing minStockUnits', () => {
    const csvText = `Name,Strength,Form,Company,MRP,UnitsPerPack,MinStockPacks,GSTPercent,Shelf
Crocin 650,650mg,Tablet,GSK,31.50,15,4,12,S-04
Azithral 500,500mg,Tablet,Alembic,132,10,2,0,S-01`;

    const parsed = parseCsv(csvText);
    expect(parsed).toHaveLength(3);

    const result = validateAndClassifyRows(parsed, []);
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(0);

    const crocin = result.parsedRows[0];
    expect(crocin.name).toBe('Crocin 650');
    expect(crocin.mrpRupees).toBe(31.5);
    expect(crocin.mrpPaise).toBe(3150);
    expect(crocin.unitsPerPack).toBe(15);
    expect(crocin.minStockUnits).toBe(60); // 4 * 15
    expect(crocin.gstPercent).toBe(12);
    expect(crocin.shelf).toBe('S-04');
    expect(crocin.status).toBe('valid');

    const azithral = result.parsedRows[1];
    expect(azithral.name).toBe('Azithral 500');
    expect(azithral.mrpRupees).toBe(132);
    expect(azithral.mrpPaise).toBe(13200);
    expect(azithral.unitsPerPack).toBe(10);
    expect(azithral.minStockUnits).toBe(20); // 2 * 10
    expect(azithral.gstPercent).toBe(0);
    expect(azithral.status).toBe('valid');
  });

  it('rejects rows with missing name, invalid MRP/unitsPerPack, invalid GST slab, or duplicate barcode', () => {
    const existingMedicines: Medicine[] = [
      {
        id: 1,
        name: 'Dolo 650',
        strength: '650mg',
        form: 'Tablet',
        salt: 'Paracetamol',
        company: 'Micro Labs',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3000,
        unitsPerPack: 15,
        shortCode: 'D1',
        barcode: '8901117002138',
        shelf: 'S-01',
        scheduleType: 'none',
        minStockUnits: 30,
        active: true,
      },
    ];

    const invalidCsv = `Name,Strength,Form,MRP,UnitsPerPack,GSTPercent,Barcode
,500mg,Tablet,20.00,10,12,BAR1
Valid Name,500mg,Tablet,-5.00,10,12,BAR2
Zero MRP,500mg,Tablet,0,10,12,BAR3
Bad Units,500mg,Tablet,25.00,0,12,BAR4
Invalid GST,500mg,Tablet,50.00,10,28,BAR5
Existing Barcode,500mg,Tablet,50.00,10,12,8901117002138
Duplicate Barcode 1,500mg,Tablet,50.00,10,12,BAR-DUP
Duplicate Barcode 2,500mg,Tablet,50.00,10,12,BAR-DUP`;

    const parsed = parseCsv(invalidCsv);
    const result = validateAndClassifyRows(parsed, existingMedicines);

    expect(result.errorCount).toBe(7);
    expect(result.validCount).toBe(1); // Row 6 is valid, Row 7 is duplicate barcode

    expect(result.parsedRows[0].errorMessage).toContain('name is required');
    expect(result.parsedRows[1].errorMessage).toContain('MRP must be greater than 0');
    expect(result.parsedRows[2].errorMessage).toContain('MRP must be greater than 0');
    expect(result.parsedRows[3].errorMessage).toContain('Units per pack must be at least 1');
    expect(result.parsedRows[4].errorMessage).toContain('GST percent must be 0, 5, 12, or 18%');
    expect(result.parsedRows[5].errorMessage).toContain('already exists in database');
    expect(result.parsedRows[7].errorMessage).toContain('Duplicate barcode');
    expect(result.parsedRows[7].errorMessage).toContain('within file');
  });

  it('flags rows matching existing medicines as duplicate', () => {
    const existingMedicines: Medicine[] = [
      {
        id: 1,
        name: 'Crocin 650 Advance',
        strength: '650mg',
        form: 'Tablet',
        salt: 'Paracetamol',
        company: 'GSK',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3150,
        unitsPerPack: 15,
        shortCode: 'C1',
        barcode: '8901117002138',
        shelf: 'S-04',
        scheduleType: 'none',
        minStockUnits: 30,
        active: true,
      },
    ];

    const csvText = `Name,Strength,Form,Company,MRP,UnitsPerPack
Crocin 650 Advance,650mg,Tablet,GSK,35.00,15
Naya Paracetamol,500mg,Tablet,Cipla,20.00,10`;

    const parsed = parseCsv(csvText);
    const result = validateAndClassifyRows(parsed, existingMedicines);

    expect(result.validCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.errorCount).toBe(0);

    expect(result.parsedRows[0].status).toBe('duplicate');
    expect(result.parsedRows[0].matchedMedicineId).toBe(1);
    expect(result.parsedRows[1].status).toBe('valid');
  });

  it('saving valid rows generates unique short codes, auto-creates custom forms, and writes medicines_imported audit entry', async () => {
    // Pre-populate with a medicine using short code 'C1'
    await db.medicines.add({
      name: 'Calpol 500',
      strength: '500mg',
      form: 'Tablet',
      salt: 'Paracetamol',
      company: 'GSK',
      gstPercent: 12,
      hsn: '3004',
      mrpPaise: 2000,
      unitsPerPack: 10,
      shortCode: 'C1',
      barcode: '890000000001',
      shelf: 'S-01',
      scheduleType: 'none',
      minStockUnits: 10,
      active: true,
    });

    const csvText = `Name,Strength,Form,Company,MRP,UnitsPerPack,Shelf
Crocin 650,650mg,Serum,GSK,35.00,10,S-02
Dolo 650,650mg,Tablet,Micro,30.00,15,S-03`;

    const parsed = parseCsv(csvText);
    const validated = validateAndClassifyRows(parsed, await db.medicines.toArray());

    const result = await saveImportedMedicines(validated.parsedRows, 'Owner User');
    expect(result.importedCount).toBe(2);
    expect(result.newCount).toBe(2);

    const allMeds = await db.medicines.toArray();
    expect(allMeds).toHaveLength(3);

    const crocin = allMeds.find((m) => m.name === 'Crocin 650');
    expect(crocin).toBeDefined();
    // Calpol had C1, so Crocin gets C2
    expect(crocin?.shortCode).toBe('C2');
    expect(crocin?.form).toBe('Serum');

    const dolo = allMeds.find((m) => m.name === 'Dolo 650');
    expect(dolo).toBeDefined();
    expect(dolo?.shortCode).toBe('D1');

    // Custom product type 'Serum' was auto-created in db.productTypes
    const customTypes = await db.productTypes.toArray();
    expect(customTypes.some((t) => t.name === 'Serum')).toBe(true);

    // Audit log recorded single 'medicines_imported' entry
    const auditLogs = await db.auditLog.toArray();
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('medicines_imported');
    expect(auditLogs[0].who).toBe('Owner User');
    expect(auditLogs[0].record).toBe('2 medicines');
  });
});
