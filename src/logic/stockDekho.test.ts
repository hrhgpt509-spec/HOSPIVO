import { describe, it, expect } from 'vitest';
import {
  filterStockSummaries,
  groupLowStockBySupplier,
  buildWhatsAppShoppingList,
  sanitizeBatchForUser,
} from './stockDekho';
import type { Medicine, Batch, Purchase, PurchaseLine, Supplier, DBUser } from '../db';
import { isOutOfStock, isLowStock, isReorderNeeded } from './stock';

describe('stockDekho logic & filters', () => {
  const sampleItems = [
    {
      medicine: { id: 1, name: 'Crocin 500', minStockUnits: 20 } as Medicine,
      currentStockUnits: 85,
      minStockUnits: 20,
    },
    {
      medicine: { id: 2, name: 'Azithral 500', minStockUnits: 50 } as Medicine,
      currentStockUnits: 42,
      minStockUnits: 50,
    },
    {
      medicine: { id: 3, name: 'Pan 40', minStockUnits: 10 } as Medicine,
      currentStockUnits: 0,
      minStockUnits: 10,
    },
    {
      medicine: { id: 4, name: 'Expired Medicine', minStockUnits: 10 } as Medicine,
      currentStockUnits: -2,
      minStockUnits: 10,
    },
  ];

  it('filters stock by all, low, and out', () => {
    // 1. All filter: returns all items
    const all = filterStockSummaries(sampleItems, 'all');
    expect(all).toHaveLength(4);

    // 2. Low stock filter: stock > 0 and stock <= minStockUnits
    const low = filterStockSummaries(sampleItems, 'low');
    expect(low).toHaveLength(1);
    expect(low[0].medicine.name).toBe('Azithral 500');

    // 3. Out of stock filter: stock <= 0
    const out = filterStockSummaries(sampleItems, 'out');
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.medicine.name)).toEqual(['Pan 40', 'Expired Medicine']);
  });

  it('checks isOutOfStock directly', () => {
    expect(isOutOfStock(0)).toBe(true);
    expect(isOutOfStock(-5)).toBe(true);
    expect(isOutOfStock(1)).toBe(false);
  });

  it('checks isLowStock and isReorderNeeded with pack thresholds', () => {
    // 200 packs alert = 20,000 units (100 units/pack)
    const alertUnits = 20000;

    // Below threshold (e.g. Lulinat at 196 packs = 19,600 units)
    expect(isLowStock(19600, alertUnits)).toBe(true);
    expect(isReorderNeeded(19600, alertUnits)).toBe(true);

    // Exactly at threshold
    expect(isLowStock(20000, alertUnits)).toBe(true);
    expect(isReorderNeeded(20000, alertUnits)).toBe(true);

    // Above threshold
    expect(isLowStock(20001, alertUnits)).toBe(false);
    expect(isReorderNeeded(20001, alertUnits)).toBe(false);

    // 0 units (Out of Stock like Ketorg / Pantop D)
    expect(isLowStock(0, alertUnits)).toBe(false); // Not low stock (is out of stock)
    expect(isOutOfStock(0)).toBe(true);
    expect(isReorderNeeded(0, alertUnits)).toBe(true); // But MUST be in reorder needed!

    // Medicine with minStockUnits = 0 (no alert configured)
    expect(isLowStock(50, 0)).toBe(false);
    expect(isReorderNeeded(50, 0)).toBe(false);
    expect(isReorderNeeded(0, 0)).toBe(true); // 0 stock always needs reorder
  });

  it('verifies Home reorder count matches outOfStock + lowStock counts', () => {
    const medsWithStock = [
      { name: 'Ketorg (Out of Stock)', stock: 0, minStock: 100 },
      { name: 'Pantop D (Out of Stock, no alert)', stock: 0, minStock: 0 },
      { name: 'Lulinat (Low Stock, 196 packs)', stock: 19600, minStock: 20000 },
      { name: 'Crocin (Normal Stock)', stock: 500, minStock: 100 },
    ];

    const outCount = medsWithStock.filter((m) => isOutOfStock(m.stock)).length;
    const lowCount = medsWithStock.filter((m) => isLowStock(m.stock, m.minStock)).length;
    const reorderCount = medsWithStock.filter((m) => isReorderNeeded(m.stock, m.minStock)).length;

    expect(outCount).toBe(2); // Ketorg + Pantop D
    expect(lowCount).toBe(1); // Lulinat
    expect(reorderCount).toBe(3); // Ketorg + Pantop D + Lulinat
    expect(reorderCount).toBe(outCount + lowCount);
  });

  it('groups low stock by last supplier and handles "Supplier pata nahi"', () => {
    const suppliers: Supplier[] = [
      { id: 10, name: 'Sharma Agencies', phone: '9876543210', gstNo: 'GST1', address: 'Katra Road' },
      { id: 20, name: 'Gupta Pharma', phone: '9876543211', gstNo: 'GST2', address: 'Aminabad' },
    ];

    const purchases: Purchase[] = [
      { id: 101, supplierId: 10, invoiceNo: 'INV-1', date: '2026-01-01', invoicePhoto: '', verified: true },
      { id: 102, supplierId: 20, invoiceNo: 'INV-2', date: '2026-02-15', invoicePhoto: '', verified: true },
    ];

    const purchaseLines: PurchaseLine[] = [
      // Med 1 was bought from Sharma in Jan, then from Gupta in Feb -> Gupta is latest
      { id: 1, purchaseId: 101, medicineId: 1, batchNo: 'B1', expiry: '2027-01-31', packs: 10, freePacks: 0, purchaseRatePaise: 1000, mrpPaise: 1500 },
      { id: 2, purchaseId: 102, medicineId: 1, batchNo: 'B2', expiry: '2027-02-28', packs: 10, freePacks: 0, purchaseRatePaise: 1000, mrpPaise: 1500 },
      // Med 2 was bought only from Sharma
      { id: 3, purchaseId: 101, medicineId: 2, batchNo: 'B3', expiry: '2027-01-31', packs: 5, freePacks: 0, purchaseRatePaise: 2000, mrpPaise: 2500 },
    ];

    const lowStockItems = [
      {
        medicine: { id: 1, name: 'Azithral 500', unitsPerPack: 10, minStockUnits: 20 } as Medicine,
        currentStockUnits: 5,
      },
      {
        medicine: { id: 2, name: 'Pan 40', unitsPerPack: 15, minStockUnits: 30 } as Medicine,
        currentStockUnits: 10,
      },
      {
        medicine: { id: 999, name: 'New Syrup', unitsPerPack: 1, minStockUnits: 5 } as Medicine,
        currentStockUnits: 1,
      },
    ];

    const groups = groupLowStockBySupplier(lowStockItems, purchases, purchaseLines, suppliers, 'Supplier pata nahi');

    // Expected groups:
    // Gupta Pharma -> Azithral 500 (most recent purchase was Feb 15 from Gupta)
    // Sharma Agencies -> Pan 40
    // Supplier pata nahi -> New Syrup (never purchased)
    expect(groups).toHaveLength(3);

    const guptaGroup = groups.find((g) => g.supplierName === 'Gupta Pharma');
    expect(guptaGroup).toBeDefined();
    expect(guptaGroup?.items[0].medicine.name).toBe('Azithral 500');

    const sharmaGroup = groups.find((g) => g.supplierName === 'Sharma Agencies');
    expect(sharmaGroup).toBeDefined();
    expect(sharmaGroup?.items[0].medicine.name).toBe('Pan 40');

    const unknownGroup = groups.find((g) => g.supplierName === 'Supplier pata nahi');
    expect(unknownGroup).toBeDefined();
    expect(unknownGroup?.items[0].medicine.name).toBe('New Syrup');
  });

  it('builds WhatsApp plain text shopping list using t()', () => {
    const groups = [
      {
        supplierName: 'Sharma Agencies',
        items: [
          {
            medicine: { name: 'Azithral 500', strength: '500mg' } as Medicine,
            currentStockUnits: 4,
            packsLeft: 4,
            looseLeft: 0,
            reorderPacks: 20,
          },
        ],
      },
      {
        supplierName: 'Supplier pata nahi',
        items: [
          {
            medicine: { name: 'Crocin', strength: '' } as Medicine,
            currentStockUnits: 2,
            packsLeft: 2,
            looseLeft: 0,
            reorderPacks: 10,
          },
        ],
      },
    ];

    const mockT = (key: string, params?: Record<string, string | number>) => {
      if (key === 'stock_dekho.whatsapp_title') return 'Shopping List - Hospivo';
      if (key === 'stock_dekho.whatsapp_packs_left') return `Bacha: ${params?.packs} packs`;
      return key;
    };

    const text = buildWhatsAppShoppingList(groups, mockT);

    expect(text).toContain('*Shopping List - Hospivo*');
    expect(text).toContain('*Sharma Agencies*');
    expect(text).toContain('• Azithral 500 500mg - Bacha: 4 packs');
    expect(text).toContain('*Supplier pata nahi*');
    expect(text).toContain('• Crocin - Bacha: 2 packs');
  });

  it('ensures staff user data for batch details contains NO purchase rate', () => {
    const batch: Batch = {
      id: 5,
      medicineId: 1,
      batchNo: 'B2231',
      expiry: '2026-11-30',
      purchaseRatePaise: 4500, // Rs. 45.00
      mrpPaise: 6000, // Rs. 60.00
      shelf: 'S-04',
    };

    const ownerUser: DBUser = {
      id: '1',
      name: 'Owner Sunil',
      role: 'owner',
      pinHash: '',
      pinSalt: '',
      active: true,
      createdAt: '',
    };

    const cashierUser: DBUser = {
      id: '2',
      name: 'Cashier Raju',
      role: 'cashier',
      pinHash: '',
      pinSalt: '',
      active: true,
      createdAt: '',
    };

    const runnerUser: DBUser = {
      id: '3',
      name: 'Runner Amit',
      role: 'runner',
      pinHash: '',
      pinSalt: '',
      active: true,
      createdAt: '',
    };

    // Owner CAN see purchaseRatePaise
    const ownerData = sanitizeBatchForUser(batch, 50, 10, ownerUser);
    expect(ownerData.purchaseRatePaise).toBe(4500);

    // Cashier CANNOT see purchaseRatePaise
    const cashierData = sanitizeBatchForUser(batch, 50, 10, cashierUser);
    expect(cashierData.purchaseRatePaise).toBeUndefined();
    expect('purchaseRatePaise' in cashierData).toBe(false);

    // Runner CANNOT see purchaseRatePaise
    const runnerData = sanitizeBatchForUser(batch, 50, 10, runnerUser);
    expect(runnerData.purchaseRatePaise).toBeUndefined();
    expect('purchaseRatePaise' in runnerData).toBe(false);

    // Null or undefined user CANNOT see purchaseRatePaise
    const anonymousData = sanitizeBatchForUser(batch, 50, 10, null);
    expect(anonymousData.purchaseRatePaise).toBeUndefined();
  });
});
