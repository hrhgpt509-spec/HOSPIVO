import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Supplier, type Purchase, type PurchaseLine, type Medicine } from '../db';
import {
  filterSuppliers,
  getPurchasesForSupplier,
  getSupplierPurchaseCount,
  getSupplierTotalPurchasesPaise,
  formatSupplierInvoiceDetail,
  togglePurchaseVerified,
  saveSupplier,
} from './suppliers';

describe('suppliers.ts logic & tests', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  const sampleSuppliers: Supplier[] = [
    {
      id: 1,
      name: 'Sharma Agencies',
      phone: '9826011223',
      gstNo: '07AAAAA0000A1Z5',
      address: 'Dawa Bazaar',
    },
    {
      id: 2,
      name: 'Gupta Pharma',
      phone: '9811144556',
      gstNo: '07BBBBB1111B1Z2',
      address: 'Central Market',
    },
    {
      id: 3,
      name: 'Vardhman Healthcare',
      phone: '9425077889',
      gstNo: '07CCCCC2222C1Z9',
      address: 'Main Road',
    },
  ];

  it('filters suppliers by name, phone, or GST number case-insensitively', () => {
    // Exact & partial name
    expect(filterSuppliers(sampleSuppliers, 'sharma')).toHaveLength(1);
    expect(filterSuppliers(sampleSuppliers, 'PHARMA')).toHaveLength(1);

    // Phone search
    expect(filterSuppliers(sampleSuppliers, '98260')).toHaveLength(1);
    expect(filterSuppliers(sampleSuppliers, '98260')[0].id).toBe(1);

    // GST search
    expect(filterSuppliers(sampleSuppliers, '07CCCCC')).toHaveLength(1);
    expect(filterSuppliers(sampleSuppliers, '07CCCCC')[0].id).toBe(3);

    // Empty or spaces returns all
    expect(filterSuppliers(sampleSuppliers, '   ')).toHaveLength(3);

    // Non-matching
    expect(filterSuppliers(sampleSuppliers, 'NonExistent')).toHaveLength(0);
  });

  it('groups and sorts purchases for a specific supplier newest first', () => {
    const samplePurchases: Purchase[] = [
      {
        id: 101,
        supplierId: 1,
        invoiceNo: 'INV-01',
        date: '2024-10-10',
        invoicePhoto: 'data:image/jpeg;base64,abc',
        verified: false,
      },
      {
        id: 102,
        supplierId: 2,
        invoiceNo: 'INV-02',
        date: '2024-10-12',
        invoicePhoto: 'data:image/jpeg;base64,abc',
        verified: true,
      },
      {
        id: 103,
        supplierId: 1,
        invoiceNo: 'INV-03',
        date: '2024-10-25',
        invoicePhoto: 'data:image/jpeg;base64,abc',
        verified: false,
      },
    ];

    const supplier1Purchases = getPurchasesForSupplier(samplePurchases, 1);
    expect(supplier1Purchases).toHaveLength(2);
    // Newest date first
    expect(supplier1Purchases[0].id).toBe(103);
    expect(supplier1Purchases[1].id).toBe(101);

    expect(getSupplierPurchaseCount(samplePurchases, 1)).toBe(2);
    expect(getSupplierPurchaseCount(samplePurchases, 2)).toBe(1);
    expect(getSupplierPurchaseCount(samplePurchases, 3)).toBe(0);

    const sampleLines: PurchaseLine[] = [
      {
        purchaseId: 101,
        medicineId: 1,
        batchNo: 'B1',
        expiry: '2026-10-31',
        packs: 5,
        freePacks: 0,
        purchaseRatePaise: 10000,
        mrpPaise: 15000,
      },
      {
        purchaseId: 103,
        medicineId: 1,
        batchNo: 'B2',
        expiry: '2026-11-30',
        packs: 2,
        freePacks: 0,
        purchaseRatePaise: 20000,
        mrpPaise: 25000,
      },
      {
        purchaseId: 102, // supplier 2
        medicineId: 2,
        batchNo: 'B3',
        expiry: '2026-12-31',
        packs: 1,
        freePacks: 0,
        purchaseRatePaise: 50000,
        mrpPaise: 60000,
      },
    ];

    expect(getSupplierTotalPurchasesPaise(samplePurchases, sampleLines, 1)).toBe(90000); // (5*10000) + (2*20000)
    expect(getSupplierTotalPurchasesPaise(samplePurchases, sampleLines, 2)).toBe(50000);
  });

  it('marking a purchase as verified updates the record and writes the purchase_verified audit entry without price data', async () => {
    const purchaseId = Number(
      await db.purchases.add({
        supplierId: 1,
        invoiceNo: 'INV-2024-8841',
        date: '2024-10-14',
        invoicePhoto: 'data:image/jpeg;base64,abc',
        verified: false,
      })
    );

    // Toggle to verified
    await togglePurchaseVerified(purchaseId, true, 'Dr. Raju');

    const updated = await db.purchases.get(purchaseId);
    expect(updated?.verified).toBe(true);

    const auditLogs = await db.auditLog.toArray();
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('purchase_verified');
    expect(auditLogs[0].record).toBe(String(purchaseId));
    expect(auditLogs[0].who).toBe('Dr. Raju');
    expect(auditLogs[0].details).toContain('verified');
    // Ensure no price, rate, or paise is recorded
    expect(auditLogs[0].details).not.toContain('Rs.');
    expect(auditLogs[0].details).not.toContain('paise');
    expect(auditLogs[0].details).not.toContain('rate');
  });

  it('staff view helper strictly excludes all purchase rates, line amounts, and invoice totals', () => {
    const purchase: Purchase = {
      id: 50,
      supplierId: 1,
      invoiceNo: 'INV-888',
      date: '2024-10-14',
      invoicePhoto: 'photo-url',
      verified: true,
    };

    const lines: PurchaseLine[] = [
      {
        id: 1,
        purchaseId: 50,
        medicineId: 10,
        batchNo: 'B-101',
        expiry: '2026-12-31',
        packs: 10,
        freePacks: 2,
        purchaseRatePaise: 15000, // 150 Rs
        mrpPaise: 20000,
      },
    ];

    const medicines: Medicine[] = [
      {
        id: 10,
        name: 'Paracetamol 500mg',
        mrpPaise: 20000,
        unitsPerPack: 10,
        active: true,
      } as unknown as Medicine,
    ];

    const staffUser = { id: 'staff1', name: 'Ramesh', role: 'cashier' };
    const staffData = formatSupplierInvoiceDetail(purchase, lines, medicines, staffUser);

    expect(staffData.canSeeRates).toBe(false);
    expect((staffData as any).totalPaise).toBeUndefined();
    expect(staffData.lines[0]).not.toHaveProperty('purchaseRatePaise');
    expect(staffData.lines[0]).not.toHaveProperty('lineTotalPaise');

    // On the other hand, Owner sees rates and total
    const ownerUser = { id: 'owner1', name: 'Owner', role: 'owner' };
    const ownerData = formatSupplierInvoiceDetail(purchase, lines, medicines, ownerUser);

    expect(ownerData.canSeeRates).toBe(true);
    if (ownerData.canSeeRates) {
      expect(ownerData.totalPaise).toBe(150000); // 10 * 15000
      expect(ownerData.lines[0].purchaseRatePaise).toBe(15000);
      expect(ownerData.lines[0].lineTotalPaise).toBe(150000);
    }
  });

  it('saves new and updated suppliers with formatField auto-capitalization and audit logging', async () => {
    // 1. Create supplier
    const id = await saveSupplier(
      {
        name: 'sharma pharma agencies',
        phone: '9826011223',
        gstNo: '07aaaaa0000a1z5',
        address: 'dawa market, shop 2',
      },
      'Admin User'
    );

    const saved = await db.suppliers.get(id);
    expect(saved?.name).toBe('Sharma Pharma Agencies');
    expect(saved?.phone).toBe('9826011223');
    expect(saved?.gstNo).toBe('07AAAAA0000A1Z5');

    let logs = await db.auditLog.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('supplier_created');
    expect(logs[0].record).toBe('Sharma Pharma Agencies');

    // 2. Update supplier
    await saveSupplier(
      {
        id,
        name: 'Sharma Pharma Agencies Pvt Ltd',
        phone: '9826011223',
      },
      'Admin User'
    );

    const updated = await db.suppliers.get(id);
    expect(updated?.name).toBe('Sharma Pharma Agencies Pvt Ltd');

    logs = await db.auditLog.toArray();
    expect(logs).toHaveLength(2);
    expect(logs[1].action).toBe('supplier_updated');
  });
});
