import { describe, it, expect } from 'vitest';
import type {
  AuditLogEntry,
  Batch,
  Bill,
  BillItem,
  BillReturn,
  Medicine,
  Purchase,
  PurchaseLine,
  StockMovement,
  Supplier,
} from '../db';
import {
  buildGstSummaryReport,
  buildPurchaseRegister,
  buildSalesReport,
  buildScheduleHRegister,
  computeHomeLiveCounters,
  computeOwnerDashboardMetrics,
  filterAuditLogEntries,
} from './reports';

const OWNER = { id: 'o1', name: 'Sunil', role: 'owner' };
const CASHIER = { id: 'c1', name: 'Raju', role: 'cashier' };

function makeBill(overrides: Partial<Bill>): Bill {
  return {
    billNo: '2026-27/0001',
    financialYear: '2026-27',
    date: '2026-11-12',
    customerName: 'Ramesh',
    customerPhone: '9820111223',
    doctorName: '',
    subtotalPaise: 10000,
    discountPaise: 0,
    discountPercent: 0,
    roundOffPaise: 0,
    totalPaise: 10000,
    taxablePaise: 8929,
    gstPaise: 1071,
    paymentMode: 'cash',
    cashReceivedPaise: 10000,
    changePaise: 0,
    status: 'completed',
    cashierId: 'c1',
    cashierName: 'Raju',
    createdAt: '2026-11-12T10:00:00Z',
    ...overrides,
  };
}

function makeBillItem(overrides: Partial<BillItem>): BillItem {
  return {
    id: 1,
    billId: 1,
    medicineId: 1,
    batchId: 1,
    medicineName: 'Crocin 500',
    batchNo: 'B1',
    expiry: '2027-06-30',
    unitMode: 'pack',
    qtyInput: 1,
    qtyUnits: 10,
    unitsPerPack: 10,
    mrpPaise: 10000,
    unitPricePaise: 1000,
    discountPaise: 0,
    gstPercent: 12,
    taxablePaise: 8929,
    gstPaise: 1071,
    lineTotalPaise: 10000,
    isScheduleH: false,
    patientName: '',
    doctorName: '',
    prescriptionChecked: false,
    ...overrides,
  };
}

describe('reports & owner dashboard analytics', () => {
  it('groups GST slabs cleanly with exact CGST + SGST split and return deduction', () => {
    const bills: Bill[] = [
      makeBill({ id: 1, date: '2026-11-12' }),
      makeBill({ id: 2, billNo: '2026-27/0002', date: '2026-11-12', totalPaise: 5000 }),
    ];
    const billItems: BillItem[] = [
      // 12% slab with odd GST 1071 paise -> CGST 535 + SGST 536 = 1071
      makeBillItem({
        id: 10,
        billId: 1,
        qtyUnits: 10,
        gstPercent: 12,
        taxablePaise: 8929,
        gstPaise: 1071,
      }),
      // 5% slab: 2 packs sold (20 units), 1 pack (10 units) returned -> net 50%
      makeBillItem({
        id: 11,
        billId: 2,
        qtyUnits: 20,
        gstPercent: 5,
        taxablePaise: 4762,
        gstPaise: 238,
      }),
    ];
    const billReturns: BillReturn[] = [
      {
        id: 1,
        returnNo: 'RET-1',
        originalBillId: 2,
        originalBillNo: '2026-27/0002',
        refundMode: 'cash',
        totalRefundPaise: 2500,
        itemsJson: JSON.stringify([{ billItemId: 11, returnUnits: 10 }]),
        reason: 'Return',
        approvedBy: 'Owner',
        createdAt: '2026-11-12T12:00:00Z',
      },
    ];

    const gst = buildGstSummaryReport({
      bills,
      billItems,
      billReturns,
      range: { preset: 'today' },
      today: '2026-11-12',
    });

    const slab5 = gst.slabs.find((s) => s.gstPercent === 5)!;
    expect(slab5.taxablePaise).toBe(2381);
    expect(slab5.totalTaxPaise).toBe(119);
    expect(slab5.cgstPaise + slab5.sgstPaise).toBe(119);

    const slab12 = gst.slabs.find((s) => s.gstPercent === 12)!;
    expect(slab12.taxablePaise).toBe(8929);
    expect(slab12.cgstPaise).toBe(535);
    expect(slab12.sgstPaise).toBe(536);
    expect(slab12.cgstPaise + slab12.sgstPaise).toBe(1071);

    expect(gst.totalTaxPaise).toBe(1071 + 119);
  });

  it('filters Schedule H / H1 register lines only and excludes regular medicines', () => {
    const bills: Bill[] = [
      makeBill({ id: 1, billNo: '2026-27/0001', date: '2026-11-12' }),
      makeBill({ id: 2, billNo: '2026-27/0002', date: '2026-10-01' }), // outside today
    ];
    const billItems: BillItem[] = [
      makeBillItem({
        id: 1,
        billId: 1,
        medicineName: 'Crocin 500',
        isScheduleH: false,
      }),
      makeBillItem({
        id: 2,
        billId: 1,
        medicineName: 'Azithral 500',
        batchNo: 'AZ99',
        qtyInput: 5,
        unitMode: 'loose',
        qtyUnits: 5,
        isScheduleH: true,
        patientName: 'Suresh',
        doctorName: 'Dr. Verma',
        prescriptionChecked: true,
      }),
      makeBillItem({
        id: 3,
        billId: 2,
        medicineName: 'Augmentin 625',
        isScheduleH: true,
      }),
    ];

    const rows = buildScheduleHRegister({
      bills,
      billItems,
      range: { preset: 'today' },
      today: '2026-11-12',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      billNo: '2026-27/0001',
      medicineName: 'Azithral 500',
      patientName: 'Suresh',
      doctorName: 'Dr. Verma',
      prescriptionChecked: true,
      qtyUnits: 5,
    });
  });

  it('computes net sales minus returns and Owner-only gross profit in whole paise; returns null for staff', () => {
    const today = '2026-11-12';
    const medicines: Medicine[] = [
      {
        id: 1,
        name: 'Crocin',
        strength: '500mg',
        form: 'tablet',
        salt: 'Paracetamol',
        company: 'GSK',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 10000,
        unitsPerPack: 10,
        shortCode: 'C1',
        barcode: '8901',
        shelf: 'S-01',
        scheduleType: 'none',
        minStockUnits: 20, // 10 remaining -> low stock
        active: true,
      },
    ];
    const batches: Batch[] = [
      // Purchase rate Rs 60 (6000 paise) per pack of 10 -> Rs 6/unit
      {
        id: 1,
        medicineId: 1,
        batchNo: 'B1',
        expiry: '2026-11-25', // within 30 days of 2026-11-12!
        purchaseRatePaise: 6000,
        mrpPaise: 10000,
        shelf: 'S-01',
      },
    ];
    const stockMovements: StockMovement[] = [
      { id: 1, batchId: 1, medicineId: 1, type: 'purchase', qtyUnits: 20, reference: 'P1', who: 'Sunil', at: '2026-11-01T10:00:00Z' },
      { id: 2, batchId: 1, medicineId: 1, type: 'sale', qtyUnits: -15, reference: 'B1', who: 'Raju', at: '2026-11-12T10:00:00Z' },
      { id: 3, batchId: 1, medicineId: 1, type: 'customer_return', qtyUnits: 5, reference: 'R1', who: 'Raju', at: '2026-11-12T12:00:00Z' },
    ];
    // Sold 15 units for Rs 150 (15000 paise), returned 5 units for Rs 50 (5000 paise) -> Net sold 10 units = Rs 100 (10000 paise)
    // Batch cost of 10 units @ 6000/10 = Rs 60 (6000 paise) -> Estimated profit = Rs 40 (4000 paise)!
    const bills: Bill[] = [
      makeBill({ id: 1, date: today, totalPaise: 15000, paymentMode: 'cash' }),
    ];
    const billItems: BillItem[] = [
      makeBillItem({ id: 1, billId: 1, batchId: 1, qtyUnits: 15, unitsPerPack: 10, lineTotalPaise: 15000 }),
    ];
    const billReturns: BillReturn[] = [
      {
        id: 1,
        returnNo: 'RET-1',
        originalBillId: 1,
        originalBillNo: '2026-27/0001',
        refundMode: 'cash',
        totalRefundPaise: 5000,
        itemsJson: JSON.stringify([{ billItemId: 1, returnUnits: 5 }]),
        reason: 'Return',
        approvedBy: 'Owner',
        createdAt: `${today}T12:00:00Z`,
      },
    ];

    // Non-owner staff gets null from Owner Dashboard & empty Purchase Register
    expect(
      computeOwnerDashboardMetrics({
        user: CASHIER,
        bills,
        billItems,
        billReturns,
        udhaarPayments: [],
        customers: [],
        medicines,
        batches,
        stockMovements,
        dailyClosings: [],
        range: { preset: 'today' },
        today,
      })
    ).toBeNull();

    const staffPurchaseReg = buildPurchaseRegister({
      user: CASHIER,
      purchases: [{ id: 1, supplierId: 1, invoiceNo: 'INV-1', date: today, invoicePhoto: '', verified: true }] as Purchase[],
      purchaseLines: [{ purchaseId: 1, medicineId: 1, batchNo: 'B1', expiry: '2027-01-31', packs: 2, freePacks: 0, purchaseRatePaise: 6000, mrpPaise: 10000 }] as PurchaseLine[],
      suppliers: [{ id: 1, name: 'Sharma', phone: '999', gstNo: '09AAA', address: '' }] as Supplier[],
      range: { preset: 'today' },
      today,
    });
    expect(staffPurchaseReg.rows).toHaveLength(0);

    // Owner gets full metrics
    const ownerMetrics = computeOwnerDashboardMetrics({
      user: OWNER,
      bills,
      billItems,
      billReturns,
      udhaarPayments: [],
      customers: [],
      medicines,
      batches,
      stockMovements,
      dailyClosings: [],
      range: { preset: 'today' },
      today,
    })!;
    expect(ownerMetrics.todaySalesPaise).toBe(10000);
    expect(ownerMetrics.estimatedProfitPaise).toBe(4000);
    expect(ownerMetrics.stockValueMrpPaise).toBe(10000); // 10 remaining units * 10000/10
    expect(ownerMetrics.stockValueCostPaise).toBe(6000); // 10 remaining units * 6000/10
    expect(ownerMetrics.expiring30Count).toBe(1);
    expect(ownerMetrics.lowStockCount).toBe(1);

    // Home live counters (safe for all roles)
    const homeCounters = computeHomeLiveCounters({
      bills,
      billReturns,
      medicines,
      batches,
      stockMovements,
      today,
    });
    expect(homeCounters.todaySalesPaise).toBe(10000);
    expect(homeCounters.todayBillsCount).toBe(1);
    expect(homeCounters.expiring30Count).toBe(1);
    expect(homeCounters.lowStockCount).toBe(1);
    expect(homeCounters.combinedAlertsCount).toBe(2);

    // Sales report & Audit Log filter check
    const salesRep = buildSalesReport(bills, { preset: 'today' }, today);
    expect(salesRep.rows).toHaveLength(1);

    const logs: AuditLogEntry[] = [
      { id: 1, timestamp: `${today}T10:00:00Z`, who: 'Raju', action: 'bill_created', record: 'Bill #1', details: 'Created bill' },
      { id: 2, timestamp: '2026-10-01T10:00:00Z', who: 'Owner', action: 'stock_correction', record: 'Batch B1', details: 'Adjusted' },
    ];
    expect(filterAuditLogEntries(logs, { timeFilter: 'today', actionFilter: 'all', query: '' }, today)).toHaveLength(1);
    expect(filterAuditLogEntries(logs, { timeFilter: 'all', actionFilter: 'stock_correction', query: 'b1' }, today)).toHaveLength(1);
  });

  it('counts 0-stock and low-stock pack threshold medicines in Home reorder counter', () => {
    const today = '2026-11-13';
    const testMeds: Medicine[] = [
      // 1. Ketorg: 0 stock, minStockUnits = 100 -> Out of Stock, must count
      { id: 1, name: 'Ketorg', minStockUnits: 100, active: true } as Medicine,
      // 2. Pantop D: 0 stock, minStockUnits = 0 -> Out of Stock, must count
      { id: 2, name: 'Pantop D', minStockUnits: 0, active: true } as Medicine,
      // 3. Lulinat: 196 packs of 100 (19,600 units), alert was 200 packs (20,000 units) -> Low Stock, must count
      { id: 3, name: 'Lulinat', unitsPerPack: 100, minStockUnits: 20000, active: true } as Medicine,
      // 4. Paracetamol: 50 packs of 10 (500 units), alert 20 packs (200 units) -> Normal, do not count
      { id: 4, name: 'Paracetamol', unitsPerPack: 10, minStockUnits: 200, active: true } as Medicine,
      // 5. Inactive medicine with 0 stock -> do not count
      { id: 5, name: 'Old Syrup', minStockUnits: 10, active: false } as Medicine,
    ];

    const testMovements: StockMovement[] = [
      { id: 1, batchId: 10, medicineId: 3, type: 'purchase', qtyUnits: 19600, reference: 'PO-1', who: 'Owner', at: today },
      { id: 2, batchId: 20, medicineId: 4, type: 'purchase', qtyUnits: 500, reference: 'PO-2', who: 'Owner', at: today },
    ];

    const counters = computeHomeLiveCounters({
      bills: [],
      billReturns: [],
      medicines: testMeds,
      batches: [],
      stockMovements: testMovements,
      today,
    });

    // Ketorg (0 stock) + Pantop D (0 stock) + Lulinat (19600 <= 20000) = 3
    expect(counters.lowStockCount).toBe(3);
  });
});

