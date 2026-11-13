import { db, type Medicine, type Batch, type StockMovement, type DBUser } from '../db';
import { addAudit } from '../db/audit';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface ShelfMedicineItem {
  id: number;
  name: string;
  shortCode: string;
  barcode: string;
  company: string;
  unitsPerPack: number;
  shelf: string;
  totalUnits: number;
  totalPacks: number;
  latestBatch?: string;
  latestExpiry?: string;
  mrpPaise?: number;
}

export interface ShelfGroup {
  shelf: string;
  displayShelf: string;
  isUnassigned: boolean;
  medicines: ShelfMedicineItem[];
  totalMedicines: number;
  totalStockPacks: number;
  totalStockUnits: number;
}

export type SheetFormat = '24' | '40' | '65' | '100' | 'thermal';

export interface StickerPrintItem {
  medicineId: number;
  name: string;
  shortCode: string;
  barcode: string;
  company: string;
  shelf: string;
  mrpPaise?: number;
  batchNo?: string;
  expiry?: string;
  quantity: number;
}

export interface StickerFieldToggles {
  showShopName: boolean;
  showMrp: boolean;
  showBatchExpiry: boolean;
  showShelf: boolean;
}

// ---------------------------------------------------------------------------
// CODE-128 BARCODE GENERATOR (100% OFFLINE, ZERO CDN/DEPENDENCY)
// ---------------------------------------------------------------------------

// Standard Code 128 widths table (0 to 106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'                               // 100-106
];

const START_B = 104;
const STOP = 106;

export interface BarcodeSvgOptions {
  height?: number;
  barWidth?: number;
  includeText?: boolean;
  quietZone?: number;
  className?: string;
}

/**
 * Generates an SVG string representation of a Code-128 barcode (Subset B).
 * Fully offline, pure TypeScript, zero network or CDN dependency.
 */
export function generateCode128Svg(text: string, options: BarcodeSvgOptions = {}): string {
  const cleanText = (text || '0000').trim();
  const height = options.height ?? 36;
  const barWidth = options.barWidth ?? 1.5;
  const includeText = options.includeText ?? true;
  const quietModules = options.quietZone ?? 10;
  const className = options.className ?? '';

  // Filter or map valid ASCII characters (32 to 126)
  const values: number[] = [];
  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      values.push(code - 32);
    } else {
      // replace unencodable char with '?' (char code 63 -> value 31)
      values.push(31);
    }
  }

  // Calculate Checksum: (START_B + sum(i * value_i)) % 103
  let checksum = START_B;
  for (let i = 0; i < values.length; i++) {
    checksum += (i + 1) * values[i];
  }
  const checkValue = checksum % 103;

  // Pattern sequence: Start B, Values, Checksum, Stop
  const sequence = [START_B, ...values, checkValue, STOP];

  const quietWidth = quietModules * barWidth;
  let currentX = quietWidth;
  const rects: string[] = [];

  for (const symbolVal of sequence) {
    const pattern = CODE128_PATTERNS[symbolVal];
    if (!pattern) continue;

    for (let j = 0; j < pattern.length; j++) {
      const w = parseInt(pattern[j], 10) * barWidth;
      const isBar = j % 2 === 0;
      if (isBar) {
        rects.push(`<rect x="${currentX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="currentColor" />`);
      }
      currentX += w;
    }
  }

  const totalWidth = currentX + quietWidth;
  const totalHeight = height + (includeText ? 15 : 0);

  const escapedText = cleanText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const textElement = includeText
    ? `<text x="${(totalWidth / 2).toFixed(1)}" y="${(height + 12).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="currentColor">${escapedText}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth.toFixed(1)} ${totalHeight.toFixed(1)}" class="${className}" preserveAspectRatio="xMidYMid meet" style="display:block;max-width:100%;height:auto;">${rects.join('')}${textElement}</svg>`;
}

// ---------------------------------------------------------------------------
// SHELF QR / RACK TAG SVG GENERATOR
// ---------------------------------------------------------------------------

/**
 * Generates an SVG string representation of a shelf rack QR/anchor tag.
 * Clean, bold, high contrast for rack identification.
 */
export function generateShelfQrSvg(shelfCode: string, options: { size?: number; className?: string } = {}): string {
  const size = options.size ?? 120;
  const className = options.className ?? '';
  const cleanCode = (shelfCode || 'S-01').trim().toUpperCase();

  // Deterministically generate pseudo module patterns from shelfCode hash
  let hash = 0;
  for (let i = 0; i < cleanCode.length; i++) {
    hash = (hash << 5) - hash + cleanCode.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="${className}" style="display:block;width:${size}px;height:${size}px;" fill="currentColor">
  <!-- Top-left Anchor -->
  <rect x="5" y="5" width="28" height="28" rx="2" />
  <rect x="9" y="9" width="20" height="20" rx="1" fill="#ffffff" />
  <rect x="13" y="13" width="12" height="12" rx="1" />
  <!-- Top-right Anchor -->
  <rect x="67" y="5" width="28" height="28" rx="2" />
  <rect x="71" y="9" width="20" height="20" rx="1" fill="#ffffff" />
  <rect x="75" y="13" width="12" height="12" rx="1" />
  <!-- Bottom-left Anchor -->
  <rect x="5" y="67" width="28" height="28" rx="2" />
  <rect x="9" y="71" width="20" height="20" rx="1" fill="#ffffff" />
  <rect x="13" y="75" width="12" height="12" rx="1" />
  <!-- Center & Data Matrix Grid -->
  <rect x="38" y="8" width="6" height="${(posHash % 3 + 2) * 4}" />
  <rect x="48" y="8" width="8" height="12" />
  <rect x="38" y="24" width="8" height="8" />
  <rect x="8" y="38" width="14" height="6" />
  <rect x="26" y="38" width="6" height="14" />
  <rect x="38" y="38" width="12" height="12" />
  <rect x="54" y="38" width="8" height="8" />
  <rect x="68" y="38" width="10" height="6" />
  <rect x="84" y="38" width="8" height="14" />
  <rect x="38" y="56" width="6" height="10" />
  <rect x="50" y="52" width="14" height="6" />
  <rect x="70" y="50" width="12" height="12" />
  <rect x="86" y="58" width="6" height="8" />
  <rect x="38" y="72" width="14" height="6" />
  <rect x="58" y="68" width="8" height="16" />
  <rect x="72" y="68" width="12" height="8" />
  <rect x="42" y="84" width="8" height="8" />
  <rect x="76" y="82" width="16" height="10" />
</svg>`;
}

// ---------------------------------------------------------------------------
// SHELF GROUPING & CALCULATION LOGIC
// ---------------------------------------------------------------------------

/**
 * Natural comparison function for shelf codes:
 * e.g., "S-01", "S-02", "S-10", "A-1", "B-2".
 */
export function compareShelfCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Groups active medicines by normalized shelf location.
 * Shelves with no code assigned are grouped under "UNASSIGNED".
 */
export function groupMedicinesByShelf(
  medicines: Medicine[],
  batches: Batch[] = [],
  movements: StockMovement[] = []
): ShelfGroup[] {
  // Pre-aggregate movements by medicineId
  const unitsByMed = new Map<number, number>();
  for (const m of movements) {
    unitsByMed.set(m.medicineId, (unitsByMed.get(m.medicineId) || 0) + m.qtyUnits);
  }

  // Pre-aggregate latest batch info by medicineId
  const batchesByMed = new Map<number, Batch[]>();
  for (const b of batches) {
    const list = batchesByMed.get(b.medicineId) || [];
    list.push(b);
    batchesByMed.set(b.medicineId, list);
  }

  const groupsMap = new Map<string, ShelfMedicineItem[]>();

  for (const med of medicines) {
    if (med.active === false) continue;

    const rawShelf = (med.shelf || '').trim();
    const isUnassigned = rawShelf === '';
    const shelfKey = isUnassigned ? 'UNASSIGNED' : rawShelf.toUpperCase();

    const totalUnits = unitsByMed.get(med.id ?? -1) ?? 0;
    const unitsPerPack = med.unitsPerPack > 0 ? med.unitsPerPack : 1;
    const totalPacks = Math.floor(Math.max(0, totalUnits) / unitsPerPack);

    // Latest batch info
    const medBatches = batchesByMed.get(med.id ?? -1) || [];
    medBatches.sort((x, y) => (y.expiry || '').localeCompare(x.expiry || ''));
    const latest = medBatches[0];

    const item: ShelfMedicineItem = {
      id: med.id ?? 0,
      name: med.name,
      shortCode: med.shortCode || '',
      barcode: med.barcode || med.shortCode || '',
      company: med.company || '',
      unitsPerPack,
      shelf: isUnassigned ? '' : shelfKey,
      totalUnits,
      totalPacks,
      latestBatch: latest?.batchNo,
      latestExpiry: latest?.expiry,
      mrpPaise: latest?.mrpPaise,
    };

    const existing = groupsMap.get(shelfKey) || [];
    existing.push(item);
    groupsMap.set(shelfKey, existing);
  }

  const result: ShelfGroup[] = [];

  for (const [shelfKey, items] of groupsMap.entries()) {
    const isUnassigned = shelfKey === 'UNASSIGNED';
    // Sort medicines by name
    items.sort((a, b) => a.name.localeCompare(b.name));

    const totalMedicines = items.length;
    const totalStockPacks = items.reduce((acc, m) => acc + m.totalPacks, 0);
    const totalStockUnits = items.reduce((acc, m) => acc + m.totalUnits, 0);

    result.push({
      shelf: shelfKey,
      displayShelf: isUnassigned ? 'Unassigned' : shelfKey,
      isUnassigned,
      medicines: items,
      totalMedicines,
      totalStockPacks,
      totalStockUnits,
    });
  }

  // Sort groups: named shelves sorted naturally, UNASSIGNED always last
  result.sort((a, b) => {
    if (a.isUnassigned) return 1;
    if (b.isUnassigned) return -1;
    return compareShelfCodes(a.shelf, b.shelf);
  });

  return result;
}

/**
 * Updates a medicine's shelf location in Dexie, updates its batches,
 * and appends an immutable audit log entry.
 */
export async function updateMedicineShelf(
  medicineId: number,
  newShelf: string,
  user?: DBUser | null
): Promise<void> {
  const medicine = await db.medicines.get(medicineId);
  if (!medicine) {
    throw new Error(`Medicine #${medicineId} not found`);
  }

  const normalizedShelf = newShelf.trim().toUpperCase();
  const previousShelf = (medicine.shelf || '').trim().toUpperCase();

  await db.transaction('rw', db.medicines, db.batches, db.auditLog, async () => {
    // 1. Update medicine shelf
    await db.medicines.update(medicineId, {
      shelf: normalizedShelf,
    });

    // 2. Also update batches for this medicine
    const batches = await db.batches.where('medicineId').equals(medicineId).toArray();
    for (const b of batches) {
      if (b.id) {
        await db.batches.update(b.id, { shelf: normalizedShelf });
      }
    }

    // 3. Write audit log entry
    await addAudit(
      user?.name || 'Owner',
      'medicine_shelf_updated',
      `Medicine #${medicineId} (${medicine.name})`,
      JSON.stringify({
        medicineId,
        medicineName: medicine.name,
        previousShelf: previousShelf || 'None',
        newShelf: normalizedShelf || 'None',
      })
    );
  });
}

/**
 * Expands selected sticker items by their specified quantities
 * so each label can be rendered into a slot on an A4 sheet or thermal roll.
 */
export function expandStickerItems(items: StickerPrintItem[]): StickerPrintItem[] {
  const result: StickerPrintItem[] = [];
  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    for (let i = 0; i < qty; i++) {
      result.push({ ...item, quantity: 1 });
    }
  }
  return result;
}
