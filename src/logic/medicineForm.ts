import type { Medicine, ScheduleType } from '../db';
import { findDuplicateMedicines } from './stock';

export interface MedicineFormData {
  name: string;
  strength: string;
  form: string;
  salt: string;
  company: string;
  gstPercent: number | null; // null if unselected
  hsn: string;
  mrpRupees: string; // user input in rupees (e.g. "31.50")
  unitsPerPack: string; // user input string (e.g. "15")
  shortCode: string;
  barcode: string;
  shelf: string;
  scheduleType: ScheduleType;
  minStockUnits: string; // user input string (e.g. "10")
  packPhoto?: string;
}

export interface MedicineFormErrors {
  name?: string;
  mrpRupees?: string;
  unitsPerPack?: string;
  shortCode?: string;
  barcode?: string;
}

/**
 * Validates a medicine form data against business rules.
 */
export function validateMedicineForm(
  data: MedicineFormData,
  existingMedicines: Medicine[],
  currentMedicineId?: number
): MedicineFormErrors {
  const errors: MedicineFormErrors = {};

  // 1. Name is required
  if (!data.name.trim()) {
    errors.name = 'err_name_required';
  }

  // 2. MRP is required, typed in rupees, must be > 0
  const mrpTrim = data.mrpRupees.trim();
  const mrpNum = parseFloat(mrpTrim);
  if (!mrpTrim || isNaN(mrpNum) || mrpNum <= 0) {
    errors.mrpRupees = 'err_mrp_invalid';
  }

  // 3. Units per pack is required, whole number >= 1
  const unitsTrim = data.unitsPerPack.trim();
  const unitsNum = Number(unitsTrim);
  if (!unitsTrim || isNaN(unitsNum) || !Number.isInteger(unitsNum) || unitsNum < 1) {
    errors.unitsPerPack = 'err_units_invalid';
  }

  // 4. Short code must be unique
  const codeTrim = data.shortCode.trim().toLowerCase();
  if (codeTrim) {
    const isDuplicateCode = existingMedicines.some(
      (m) =>
        m.id !== currentMedicineId &&
        m.active !== false &&
        m.shortCode?.trim().toLowerCase() === codeTrim
    );
    if (isDuplicateCode) {
      errors.shortCode = 'err_short_code_duplicate';
    }
  }

  // 5. Barcode, if typed, must be unique
  const barcodeTrim = data.barcode.trim().toLowerCase();
  if (barcodeTrim) {
    const isDuplicateBarcode = existingMedicines.some(
      (m) =>
        m.id !== currentMedicineId &&
        m.active !== false &&
        m.barcode?.trim().toLowerCase() === barcodeTrim
    );
    if (isDuplicateBarcode) {
      errors.barcode = 'err_barcode_duplicate';
    }
  }

  return errors;
}

/**
 * Checks for duplicate medicines when creating a new medicine.
 */
export async function checkDuplicateMedicine(
  name: string,
  strength: string,
  company: string
): Promise<Medicine[]> {
  return findDuplicateMedicines(name, strength, company);
}

/**
 * Computes changed field names with old and new values for audit logging.
 */
export function computeMedicineChanges(
  oldMed: Medicine,
  newMed: Partial<Medicine>
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  const keys = Object.keys(newMed) as (keyof Medicine)[];

  for (const key of keys) {
    if (key === 'id' || key === 'createdAt') continue;
    const oldVal = oldMed[key];
    const newVal = newMed[key];

    if (oldVal !== newVal) {
      changes[key] = {
        old: oldVal !== undefined ? oldVal : null,
        new: newVal !== undefined ? newVal : null,
      };
    }
  }

  return changes;
}

/**
 * Compresses an image file down to ~100 KB using an HTML Canvas.
 */
export async function compressImageToDataUrl(
  file: File,
  maxDimension = 800,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
