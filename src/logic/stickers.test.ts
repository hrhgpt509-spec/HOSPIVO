import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Medicine, type Batch, type StockMovement, type DBUser } from '../db';
import {
  generateCode128Svg,
  generateShelfQrSvg,
  compareShelfCodes,
  groupMedicinesByShelf,
  updateMedicineShelf,
  expandStickerItems,
  type StickerPrintItem,
} from './stickers';

describe('stickers.ts logic tests', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe('Code-128 SVG Barcode Generator', () => {
    it('generates a valid offline SVG for standard medicine barcodes', () => {
      const svg = generateCode128Svg('8901117002138');
      expect(svg).toContain('<svg');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('<rect');
      expect(svg).toContain('8901117002138');
      expect(svg).toContain('viewBox=');
    });

    it('generates SVG for short codes and runner command cards', () => {
      const svgNext = generateCode128Svg('RUNNER:NEXT');
      expect(svgNext).toContain('RUNNER:NEXT');
      expect(svgNext).toContain('<rect');

      const svgShort = generateCode128Svg('C1');
      expect(svgShort).toContain('C1');
    });

    it('handles empty string fallback gracefully', () => {
      const svg = generateCode128Svg('');
      expect(svg).toContain('<svg');
      expect(svg).toContain('0000');
    });

    it('respects includeText option', () => {
      const withoutText = generateCode128Svg('ABC123', { includeText: false });
      expect(withoutText).not.toContain('<text');

      const withText = generateCode128Svg('ABC123', { includeText: true });
      expect(withText).toContain('<text');
      expect(withText).toContain('ABC123');
    });
  });

  describe('Shelf QR SVG Generator', () => {
    it('generates a high-contrast rack anchor tag SVG', () => {
      const svg = generateShelfQrSvg('S-04');
      expect(svg).toContain('<svg');
      expect(svg).toContain('viewBox="0 0 100 100"');
      expect(svg).toContain('fill="#ffffff"'); // anchor cutout
    });
  });

  describe('Shelf Code Sorting', () => {
    it('sorts shelf codes naturally (S-01, S-02, S-10)', () => {
      const list = ['S-10', 'S-01', 'S-02', 'A-12', 'A-2'];
      list.sort(compareShelfCodes);
      expect(list).toEqual(['A-2', 'A-12', 'S-01', 'S-02', 'S-10']);
    });
  });

  describe('groupMedicinesByShelf', () => {
    it('groups active medicines by normalized shelf and calculates stock packs/units', () => {
      const medicines: Medicine[] = [
        {
          id: 1,
          name: 'Crocin 500',
          strength: '500mg',
          form: 'tablet',
          salt: 'Paracetamol',
          company: 'GSK',
          shortCode: 'C1',
          barcode: '8901117001',
          shelf: 's-04',
          unitsPerPack: 10,
          scheduleType: 'none',
          minStockUnits: 20,
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 3500,
          active: true,
        },
        {
          id: 2,
          name: 'Azithral 500',
          strength: '500mg',
          form: 'tablet',
          salt: 'Azithromycin',
          company: 'Alembic',
          shortCode: 'A1',
          barcode: '8901117002',
          shelf: 'S-01',
          unitsPerPack: 5,
          scheduleType: 'H',
          minStockUnits: 10,
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 5000,
          active: true,
        },
        {
          id: 3,
          name: 'Allegra 120mg',
          strength: '120mg',
          form: 'tablet',
          salt: 'Fexofenadine',
          company: 'Sanofi',
          shortCode: 'AL1',
          barcode: '8901117003',
          shelf: 'S-04',
          unitsPerPack: 10,
          scheduleType: 'none',
          minStockUnits: 10,
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 4000,
          active: true,
        },
        {
          id: 4,
          name: 'Unassigned Syrup',
          strength: '100ml',
          form: 'syrup',
          salt: 'Cough',
          company: 'Generic',
          shortCode: 'US1',
          barcode: '8901117004',
          shelf: '', // No shelf
          unitsPerPack: 1,
          scheduleType: 'none',
          minStockUnits: 5,
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 2500,
          active: true,
        },
        {
          id: 5,
          name: 'Inactive Med',
          strength: '500mg',
          form: 'tablet',
          salt: 'Inactive',
          company: 'Generic',
          shortCode: 'IN1',
          barcode: '8901117005',
          shelf: 'S-01',
          unitsPerPack: 10,
          scheduleType: 'none',
          minStockUnits: 5,
          gstPercent: 12,
          hsn: '3004',
          mrpPaise: 1000,
          active: false, // inactive should be skipped
        },
      ];

      const batches: Batch[] = [
        {
          id: 101,
          medicineId: 1,
          batchNo: 'B-CR-1',
          expiry: '2027-12',
          purchaseRatePaise: 2000,
          mrpPaise: 3500,
          shelf: 'S-04',
        },
      ];

      const movements: StockMovement[] = [
        {
          batchId: 101,
          medicineId: 1,
          type: 'purchase',
          qtyUnits: 45,
          at: new Date().toISOString(),
          reference: 'PUR-1',
          who: 'Admin',
        },
      ];

      const groups = groupMedicinesByShelf(medicines, batches, movements);

      // S-01, S-04, and UNASSIGNED
      expect(groups.length).toBe(3);
      expect(groups[0].shelf).toBe('S-01');
      expect(groups[0].medicines.length).toBe(1);
      expect(groups[0].medicines[0].name).toBe('Azithral 500');

      expect(groups[1].shelf).toBe('S-04');
      expect(groups[1].medicines.length).toBe(2);
      expect(groups[1].totalStockUnits).toBe(45);
      expect(groups[1].totalStockPacks).toBe(4); // 45 / 10 = 4 packs

      // UNASSIGNED must be at the very end
      expect(groups[2].isUnassigned).toBe(true);
      expect(groups[2].medicines.length).toBe(1);
      expect(groups[2].medicines[0].name).toBe('Unassigned Syrup');
    });
  });

  describe('updateMedicineShelf', () => {
    it('updates medicine shelf in Dexie, updates associated batches, and writes audit log', async () => {
      const medId = (await db.medicines.add({
        name: 'Crocin 500',
        strength: '500mg',
        form: 'tablet',
        salt: 'Paracetamol',
        company: 'GSK',
        shortCode: 'C1',
        barcode: '8901117001',
        shelf: 'S-04',
        unitsPerPack: 10,
        scheduleType: 'none',
        minStockUnits: 20,
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3000,
        active: true,
      })) as number;

      const batchId = (await db.batches.add({
        medicineId: medId,
        batchNo: 'B100',
        expiry: '2028-01',
        purchaseRatePaise: 2000,
        mrpPaise: 3000,
        shelf: 'S-04',
      })) as number;

      const mockUser: DBUser = {
        id: 'user_1',
        name: 'Sharma Ji',
        role: 'owner',
        pinHash: 'hash',
        pinSalt: 'salt',
        active: true,
      };

      await updateMedicineShelf(medId, 's-08', mockUser);

      // Verify medicine updated
      const updatedMed = await db.medicines.get(medId);
      expect(updatedMed?.shelf).toBe('S-08');

      // Verify batch updated
      const updatedBatch = await db.batches.get(batchId);
      expect(updatedBatch?.shelf).toBe('S-08');

      // Verify audit log entry
      const auditEntries = await db.auditLog.toArray();
      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0].action).toBe('medicine_shelf_updated');
      expect(auditEntries[0].who).toBe('Sharma Ji');
      expect(auditEntries[0].record).toContain(`Medicine #${medId}`);
      expect(auditEntries[0].details).toContain('S-08');
    });
  });

  describe('expandStickerItems', () => {
    it('expands items based on label quantity for sheets', () => {
      const items: StickerPrintItem[] = [
        {
          medicineId: 1,
          name: 'Crocin 500',
          shortCode: 'C1',
          barcode: '8901117001',
          company: 'GSK',
          shelf: 'S-04',
          quantity: 3,
        },
        {
          medicineId: 2,
          name: 'Dolo 650',
          shortCode: 'D1',
          barcode: '8901117002',
          company: 'Micro Labs',
          shelf: 'S-02',
          quantity: 2,
        },
      ];

      const expanded = expandStickerItems(items);
      expect(expanded.length).toBe(5);
      expect(expanded.filter((x) => x.medicineId === 1).length).toBe(3);
      expect(expanded.filter((x) => x.medicineId === 2).length).toBe(2);
      expect(expanded[0].quantity).toBe(1);
    });
  });
});
