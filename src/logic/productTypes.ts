import { db, type ProductType } from '../db';
import { addAudit } from '../db/audit';
import { formatField } from './format';

export type { ProductType };

export const BUILT_IN_PRODUCT_TYPES = [
  'Tablet',
  'Syrup',
  'Capsule',
  'Injection',
  'Ointment / Cream',
  'Drops',
] as const;

export type BuiltInProductType = (typeof BUILT_IN_PRODUCT_TYPES)[number];

export const BUILT_IN_TYPE_KEYS: Record<string, string> = {
  Tablet: 'medicine_form.form_tablet',
  Syrup: 'medicine_form.form_syrup',
  Capsule: 'medicine_form.form_capsule',
  Injection: 'medicine_form.form_injection',
  'Ointment / Cream': 'medicine_form.form_ointment',
  Drops: 'medicine_form.form_drops',
};

// Built-in names in English, Hindi (Devanagari), and Hinglish (lowercase, normalized)
const BUILT_IN_VARIANTS: string[] = [
  'tablet',
  'टैबलेट',
  'syrup',
  'सिरप',
  'capsule',
  'कैप्सूल',
  'injection',
  'इंजेक्शन',
  'ointment / cream',
  'ऑइंटमेंट / क्रीम',
  'ointment/cream',
  'ointment',
  'cream',
  'ऑइंटमेंट',
  'क्रीम',
  'drops',
  'ड्रॉप्स',
];

export function normalizeTypeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Shows a custom type as typed and a built-in type through t().
 */
export function formatProductType(type: string, t: (key: string) => string): string {
  if (!type) return '';
  const key = BUILT_IN_TYPE_KEYS[type];
  if (key) {
    const translated = t(key);
    return translated || type;
  }
  return type;
}

export interface ValidationResult {
  valid: boolean;
  error?: 'length' | 'duplicate';
  errorKey?: string;
  formattedName: string;
}

/**
 * Validates product type name:
 * - 2 to 30 characters
 * - Duplicate check against built-in types (all 3 languages) and custom types
 */
export function validateProductTypeName(
  name: string,
  existingCustomTypes: (string | ProductType)[] = []
): ValidationResult {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const formattedName = formatField('name', trimmed);

  if (formattedName.length < 2 || formattedName.length > 30) {
    return {
      valid: false,
      error: 'length',
      errorKey: 'medicine_form.type_length_error',
      formattedName,
    };
  }

  const normalized = normalizeTypeName(formattedName);

  // Check against built-ins (English, Hindi, Hinglish)
  if (BUILT_IN_VARIANTS.some((v) => normalizeTypeName(v) === normalized)) {
    return {
      valid: false,
      error: 'duplicate',
      errorKey: 'medicine_form.type_already_exists',
      formattedName,
    };
  }

  // Check against custom types
  const isDuplicateCustom = existingCustomTypes.some((item) => {
    const val = typeof item === 'string' ? item : item.name;
    return normalizeTypeName(val) === normalized;
  });

  if (isDuplicateCustom) {
    return {
      valid: false,
      error: 'duplicate',
      errorKey: 'medicine_form.type_already_exists',
      formattedName,
    };
  }

  return {
    valid: true,
    formattedName,
  };
}

export async function getActiveProductTypes(): Promise<ProductType[]> {
  try {
    const types = await db.productTypes.filter((pt) => pt.active !== false).toArray();
    types.sort((a, b) => (a.id || 0) - (b.id || 0));
    return types;
  } catch {
    return [];
  }
}

export async function addProductType(name: string, who: string = 'Owner'): Promise<ProductType> {
  const existing = await getActiveProductTypes();
  const validation = validateProductTypeName(name, existing);
  if (!validation.valid) {
    throw new Error(validation.error === 'duplicate' ? 'type_already_exists' : 'type_length_error');
  }

  const newType: ProductType = {
    name: validation.formattedName,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const id = await db.productTypes.add(newType);
  newType.id = id as number;

  await addAudit(who, 'product_type_created', validation.formattedName, validation.formattedName);

  return newType;
}
