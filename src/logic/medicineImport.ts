import { db, type Medicine, type ScheduleType } from '../db';
import { addAudit } from '../db/audit';
import { capitalizeWords, formatField } from './format';
import { rupeesToPaise } from './money';
import { shortCodeFor } from './stock';
import { BUILT_IN_PRODUCT_TYPES, normalizeTypeName } from './productTypes';

export interface ParsedMedicineRow {
  rowIndex: number;
  raw: Record<string, string>;
  name: string;
  strength: string;
  form: string;
  salt: string;
  company: string;
  mrpPaise: number;
  mrpRupees: number;
  unitsPerPack: number;
  gstPercent: number;
  hsn: string;
  barcode: string;
  shelf: string;
  scheduleType: ScheduleType;
  minStockUnits: number;
  status: 'valid' | 'duplicate' | 'error';
  errorMessage?: string;
  matchedMedicineId?: number;
}

export interface ValidationSummary {
  parsedRows: ParsedMedicineRow[];
  validCount: number;
  duplicateCount: number;
  errorCount: number;
}

/**
 * Generates sample CSV template header and 1 example row.
 * Does not write anything to the database.
 */
export function generateSampleCsv(): string {
  const headers = [
    'Name',
    'Strength',
    'Form',
    'Salt',
    'Company',
    'MRP',
    'UnitsPerPack',
    'GSTPercent',
    'HSN',
    'Barcode',
    'Shelf',
    'ScheduleType',
    'MinStockPacks',
  ].join(',');

  const exampleRow = [
    'Crocin 650 Advance',
    '650mg',
    'Tablet',
    'Paracetamol',
    'GlaxoSmithKline',
    '31.50',
    '15',
    '12',
    '30049099',
    '8901117002138',
    'S-04',
    'none',
    '5',
  ].join(',');

  return `${headers}\r\n${exampleRow}\r\n`;
}

/**
 * Triggers a native browser file download for the sample CSV template.
 */
export function downloadSampleCsvTemplate(): void {
  const content = generateSampleCsv();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'hospivo_medicine_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses raw CSV string into an array of string arrays.
 * Correctly handles quotes, commas inside quotes, escaped double quotes, and line breaks.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip LF after CR
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validates, formats, and classifies parsed CSV rows against database medicines.
 */
export function validateAndClassifyRows(
  csvRows: string[][],
  existingMedicines: Medicine[]
): ValidationSummary {
  if (!csvRows || csvRows.length <= 1) {
    return { parsedRows: [], validCount: 0, duplicateCount: 0, errorCount: 0 };
  }

  // 1. Map header indices
  const headers = csvRows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const headerMap: Record<string, number> = {};

  headers.forEach((h, idx) => {
    if (h.includes('name') || h === 'naam') headerMap['name'] = idx;
    else if (h.includes('strength') || h === 'power') headerMap['strength'] = idx;
    else if (h.includes('form') || h === 'type') headerMap['form'] = idx;
    else if (h.includes('salt') || h.includes('composition')) headerMap['salt'] = idx;
    else if (h.includes('company') || h.includes('manufacturer')) headerMap['company'] = idx;
    else if (h.includes('mrp') || h.includes('rate') || h.includes('price')) headerMap['mrp'] = idx;
    else if (h.includes('units') || h.includes('packsize')) headerMap['unitsPerPack'] = idx;
    else if (h.includes('gst')) headerMap['gstPercent'] = idx;
    else if (h.includes('hsn')) headerMap['hsn'] = idx;
    else if (h.includes('barcode')) headerMap['barcode'] = idx;
    else if (h.includes('shelf') || h.includes('rack')) headerMap['shelf'] = idx;
    else if (h.includes('schedule')) headerMap['scheduleType'] = idx;
    else if (h.includes('minstock') || h.includes('minpacks')) headerMap['minStockPacks'] = idx;
  });

  // Track existing barcodes and names
  const existingBarcodes = new Set<string>();
  for (const m of existingMedicines) {
    if (m.barcode) existingBarcodes.add(m.barcode.trim().toUpperCase());
  }

  const seenBarcodesInFile = new Set<string>();
  const seenFileMedicines = new Map<string, number>();

  const parsedRows: ParsedMedicineRow[] = [];
  let validCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let r = 1; r < csvRows.length; r++) {
    const row = csvRows[r];
    if (!row || row.every((c) => !c.trim())) continue;

    const getCol = (key: string): string => {
      const idx = headerMap[key];
      return idx !== undefined && row[idx] !== undefined ? row[idx].trim() : '';
    };

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = row[idx] || '';
    });

    const rawName = getCol('name');
    const rawStrength = getCol('strength');
    const rawForm = getCol('form');
    const rawSalt = getCol('salt');
    const rawCompany = getCol('company');
    const rawMrp = getCol('mrp');
    const rawUnits = getCol('unitsPerPack');
    const rawGst = getCol('gstPercent');
    const rawHsn = getCol('hsn');
    const rawBarcode = getCol('barcode');
    const rawShelf = getCol('shelf');
    const rawSchedule = getCol('scheduleType');
    const rawMinStock = getCol('minStockPacks');

    const formattedName = capitalizeWords(rawName.trim());
    const formattedStrength = rawStrength.trim();
    const formattedForm = rawForm ? capitalizeWords(rawForm.trim()) : 'Tablet';
    const formattedSalt = rawSalt ? capitalizeWords(rawSalt.trim()) : '';
    const formattedCompany = rawCompany ? capitalizeWords(rawCompany.trim()) : '';
    const formattedShelf = formatField('code', rawShelf.trim());
    const formattedHsn = formatField('code', rawHsn.trim());
    const formattedBarcode = formatField('code', rawBarcode.trim());

    // Schedule type
    let scheduleType: ScheduleType = 'none';
    const schLower = rawSchedule.trim().toLowerCase();
    if (schLower === 'h1') scheduleType = 'H1';
    else if (schLower === 'h') scheduleType = 'H';

    let rowStatus: 'valid' | 'duplicate' | 'error' = 'valid';
    let errorMessage: string | undefined;

    // 1. Name validation
    if (!formattedName) {
      rowStatus = 'error';
      errorMessage = 'Medicine name is required';
    }

    // 2. MRP validation
    const mrpFloat = parseFloat(rawMrp.replace(/[^-0-9.]/g, ''));
    if (rowStatus !== 'error' && (isNaN(mrpFloat) || mrpFloat <= 0)) {
      rowStatus = 'error';
      errorMessage = 'MRP must be greater than 0';
    }
    const mrpPaise = rupeesToPaise(isNaN(mrpFloat) ? 0 : mrpFloat);

    // 3. UnitsPerPack validation
    let unitsPerPack = parseInt(rawUnits.replace(/[^0-9]/g, ''), 10);
    if (isNaN(unitsPerPack) || unitsPerPack < 1) {
      if (!rawUnits) {
        unitsPerPack = 1; // sensible default if omitted
      } else if (rowStatus !== 'error') {
        rowStatus = 'error';
        errorMessage = 'Units per pack must be at least 1';
      }
    }

    // 4. GSTPercent validation (must be 0, 5, 12, or 18 if provided)
    let gstPercent = 0;
    if (rawGst) {
      const parsedGst = parseFloat(rawGst.replace(/[^0-9.]/g, ''));
      if (![0, 5, 12, 18].includes(parsedGst)) {
        if (rowStatus !== 'error') {
          rowStatus = 'error';
          errorMessage = 'GST percent must be 0, 5, 12, or 18%';
        }
      } else {
        gstPercent = parsedGst;
      }
    }

    // 5. Barcode uniqueness
    if (rowStatus !== 'error' && formattedBarcode) {
      if (existingBarcodes.has(formattedBarcode)) {
        rowStatus = 'error';
        errorMessage = `Barcode ${formattedBarcode} already exists in database`;
      } else if (seenBarcodesInFile.has(formattedBarcode)) {
        rowStatus = 'error';
        errorMessage = `Duplicate barcode ${formattedBarcode} within file`;
      } else {
        seenBarcodesInFile.add(formattedBarcode);
      }
    }

    // 6. MinStockUnits
    const minPacks = parseInt(rawMinStock.replace(/[^0-9]/g, ''), 10) || 0;
    const minStockUnits = Math.max(0, minPacks) * (unitsPerPack || 1);

    // 7. Duplicate check against existing DB and earlier file rows
    let matchedMedicineId: number | undefined;
    if (rowStatus !== 'error') {
      const normName = formattedName.toLowerCase();
      const normStrength = formattedStrength.toLowerCase();
      const normCompany = formattedCompany.toLowerCase();

      // Check DB medicines
      const existingMatch = existingMedicines.find((m) => {
        const mName = m.name.toLowerCase();
        const mStrength = m.strength.toLowerCase();
        const mCompany = m.company.toLowerCase();
        return (
          (mName === normName && mStrength === normStrength && normStrength.length > 0) ||
          (mName === normName && mCompany === normCompany && normCompany.length > 0) ||
          mName === normName
        );
      });

      const fileKey = `${normName}|${normStrength}`;
      if (existingMatch) {
        rowStatus = 'duplicate';
        matchedMedicineId = existingMatch.id;
      } else if (seenFileMedicines.has(fileKey)) {
        rowStatus = 'duplicate';
      } else {
        seenFileMedicines.set(fileKey, r);
      }
    }

    if (rowStatus === 'error') {
      errorCount++;
    } else if (rowStatus === 'duplicate') {
      duplicateCount++;
    } else {
      validCount++;
    }

    parsedRows.push({
      rowIndex: r,
      raw,
      name: formattedName,
      strength: formattedStrength,
      form: formattedForm,
      salt: formattedSalt,
      company: formattedCompany,
      mrpPaise,
      mrpRupees: mrpFloat || 0,
      unitsPerPack: unitsPerPack || 1,
      gstPercent,
      hsn: formattedHsn,
      barcode: formattedBarcode,
      shelf: formattedShelf,
      scheduleType,
      minStockUnits,
      status: rowStatus,
      errorMessage,
      matchedMedicineId,
    });
  }

  return {
    parsedRows,
    validCount,
    duplicateCount,
    errorCount,
  };
}

export interface SaveImportResult {
  importedCount: number;
  newCount: number;
  updatedCount: number;
}

/**
 * Saves all valid and duplicate rows to the database in a single atomic transaction.
 * Skips error rows. Generates unique shortCode for each new medicine.
 * Auto-creates custom product types if not built-in or existing.
 * Writes a single audit log entry 'medicines_imported'.
 */
export async function saveImportedMedicines(
  parsedRows: ParsedMedicineRow[],
  who: string = 'Owner'
): Promise<SaveImportResult> {
  const rowsToSave = parsedRows.filter((r) => r.status !== 'error');
  if (rowsToSave.length === 0) {
    throw new Error('No valid medicine rows to import');
  }

  return await db.transaction(
    'rw',
    [db.medicines, db.productTypes, db.auditLog],
    async () => {
      const allExisting = await db.medicines.toArray();
      const usedShortCodes = allExisting.map((m) => m.shortCode).filter(Boolean);

      // Existing product types
      const dbTypes = await db.productTypes.toArray();
      const existingTypeNames = new Set(
        [
          ...BUILT_IN_PRODUCT_TYPES.map((t) => normalizeTypeName(t)),
          ...dbTypes.map((t) => normalizeTypeName(t.name)),
        ]
      );

      let newCount = 0;
      let updatedCount = 0;

      for (const row of rowsToSave) {
        // Auto-create custom product type if new
        if (row.form) {
          const norm = normalizeTypeName(row.form);
          if (!existingTypeNames.has(norm)) {
            await db.productTypes.add({
              name: row.form,
              active: true,
              createdAt: new Date().toISOString(),
            });
            existingTypeNames.add(norm);
          }
        }

        if (row.status === 'duplicate' && row.matchedMedicineId) {
          // Update existing medicine
          await db.medicines.update(row.matchedMedicineId, {
            mrpPaise: row.mrpPaise,
            unitsPerPack: row.unitsPerPack,
            shelf: row.shelf || undefined,
            minStockUnits: row.minStockUnits || undefined,
          });
          updatedCount++;
        } else {
          // Add new medicine with unique shortCode
          const shortCode = await shortCodeFor(row.name, usedShortCodes);
          usedShortCodes.push(shortCode);

          await db.medicines.add({
            name: row.name,
            strength: row.strength,
            form: row.form,
            salt: row.salt,
            company: row.company,
            gstPercent: row.gstPercent,
            hsn: row.hsn,
            mrpPaise: row.mrpPaise,
            unitsPerPack: row.unitsPerPack,
            shortCode,
            barcode: row.barcode,
            shelf: row.shelf,
            scheduleType: row.scheduleType,
            minStockUnits: row.minStockUnits,
            active: true,
            createdAt: new Date().toISOString(),
          });
          newCount++;
        }
      }

      const totalImported = newCount + updatedCount;
      await addAudit(
        who,
        'medicines_imported',
        `${totalImported} medicines`,
        `Imported ${totalImported} medicines from CSV (${newCount} new, ${updatedCount} updated)`
      );

      return {
        importedCount: totalImported,
        newCount,
        updatedCount,
      };
    }
  );
}
