import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Bill, type BillReturn, type UdhaarPayment } from '../db';
import {
  buildDinBandWhatsAppText,
  buildDinBandWhatsAppUrl,
  computeDayClosingSummary,
  computeDenominationTotalPaise,
  emptyDenominationCounts,
  evaluateCashMismatch,
  saveDailyClosing,
} from './dinBand';

function makeBill(overrides: Partial<Bill>): Bill {
  return {
    billNo: '2026-27/0001',
    financialYear: '2026-27',
    date: '2026-11-12',
    customerName: 'Walk-in',
    customerPhone: '',
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

describe('dinBand daily closing logic', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('computes expected cash accurately (opening + cash sales + split cash + cash udhaar - cash returns)', () => {
    const today = '2026-11-12';
    const bills: Bill[] = [
      // Cash sale: Rs 500 (50000 paise)
      makeBill({ id: 1, billNo: '2026-27/0001', paymentMode: 'cash', totalPaise: 50000 }),
      // Split sale: Rs 300 cash + Rs 200 UPI = Rs 500 total
      makeBill({
        id: 2,
        billNo: '2026-27/0002',
        paymentMode: 'split',
        totalPaise: 50000,
        cashReceivedPaise: 30000,
        splitDetails: JSON.stringify({ cashPaise: 30000, upiPaise: 20000, udhaarPaise: 0 }),
      }),
      // Pure UPI sale: Rs 400
      makeBill({ id: 3, billNo: '2026-27/0003', paymentMode: 'upi', totalPaise: 40000 }),
      // Udhaar sale: Rs 250
      makeBill({ id: 4, billNo: '2026-27/0004', paymentMode: 'udhaar', totalPaise: 25000 }),
      // Yesterday's bill (must NOT be counted today)
      makeBill({
        id: 5,
        billNo: '2026-27/0000',
        date: '2026-11-11',
        createdAt: '2026-11-11T18:00:00Z',
        paymentMode: 'cash',
        totalPaise: 99900,
      }),
    ];

    const udhaarPayments: UdhaarPayment[] = [
      // Cash Udhaar collected today: Rs 150
      {
        id: 1,
        customerName: 'Ramesh',
        customerPhone: '9820111223',
        amountPaise: 15000,
        mode: 'cash',
        note: '',
        receivedBy: 'Raju',
        createdAt: '2026-11-12T12:00:00Z',
      },
      // UPI Udhaar collected today: Rs 100 (does NOT enter cash drawer)
      {
        id: 2,
        customerName: 'Sunita',
        customerPhone: '9811233445',
        amountPaise: 10000,
        mode: 'upi',
        note: '',
        receivedBy: 'Raju',
        createdAt: '2026-11-12T13:00:00Z',
      },
    ];

    const billReturns: BillReturn[] = [
      // Cash refund today: Rs 50
      {
        id: 1,
        returnNo: 'RET-1',
        originalBillId: 1,
        originalBillNo: '2026-27/0001',
        refundMode: 'cash',
        totalRefundPaise: 5000,
        itemsJson: '[]',
        reason: 'Returned strip',
        approvedBy: 'Owner',
        createdAt: '2026-11-12T15:00:00Z',
      },
      // Udhaar adjustment return today: Rs 40 (does NOT reduce cash drawer)
      {
        id: 2,
        returnNo: 'RET-2',
        originalBillId: 4,
        originalBillNo: '2026-27/0004',
        refundMode: 'udhaar_adjust',
        totalRefundPaise: 4000,
        itemsJson: '[]',
        reason: 'Udhaar adjust',
        approvedBy: 'Owner',
        createdAt: '2026-11-12T16:00:00Z',
      },
    ];

    const summary = computeDayClosingSummary({
      bills,
      billReturns,
      udhaarPayments,
      batches: [],
      stockMovements: [],
      openingCashPaise: 100000, // Rs 1,000 opening cash
      date: today,
    });

    // Opening 1000 + Cash bills 500 + Split cash 300 + Cash udhaar 150 - Cash return 50 = Rs 1,900 (190000 paise)
    expect(summary.expectedCashPaise).toBe(190000);
    expect(summary.cashSalesPaise).toBe(80000); // 500 + 300
    expect(summary.upiSalesPaise).toBe(60000); // 400 + 200
    expect(summary.udhaarSalesPaise).toBe(25000);
    expect(summary.totalSalesPaise).toBe(165000);
    expect(summary.totalBillsCount).toBe(4);
    expect(summary.cashUdhaarCollectedPaise).toBe(15000);
    expect(summary.upiUdhaarCollectedPaise).toBe(10000);
    expect(summary.totalUdhaarCollectedPaise).toBe(25000);
    expect(summary.cashReturnsPaise).toBe(5000);
    expect(summary.totalReturnsPaise).toBe(9000);

    // Denomination helper check
    const counts = {
      ...emptyDenominationCounts(),
      d500: 3, // 1500
      d200: 1, // 200
      d100: 1, // 100
      d50: 1, // 50
      coinsRupees: 50, // 50
    };
    const denomTotal = computeDenominationTotalPaise(counts);
    expect(denomTotal.totalPaise).toBe(190000);
    expect(denomTotal.noteCount).toBe(6);
  });

  it('prevents marking mismatched closing as completed without authorization and allows pending_auth', async () => {
    const mismatch = evaluateCashMismatch(1824000, 1810000);
    expect(mismatch).toEqual({
      differencePaise: -14000,
      kind: 'short',
      absPaise: 14000,
    });

    // Must throw if trying to save mismatched closing as 'completed' without approvalVerified
    await expect(
      saveDailyClosing({
        date: '2026-11-12',
        openingCashPaise: 0,
        expectedCashPaise: 1824000,
        countedCashPaise: 1810000,
        denominationJson: '{}',
        counterPhoto: '',
        status: 'completed',
        approvalVerified: false,
        closedBy: 'Raju',
      })
    ).rejects.toThrow(/without authorization/i);

    // Saving as pending_auth succeeds and writes 'din_band_pending_auth' audit entry
    const pending = await saveDailyClosing({
      date: '2026-11-12',
      openingCashPaise: 0,
      expectedCashPaise: 1824000,
      countedCashPaise: 1810000,
      denominationJson: '{}',
      counterPhoto: '',
      status: 'pending_auth',
      closedBy: 'Raju',
    });
    expect(pending.status).toBe('pending_auth');
    expect(pending.differencePaise).toBe(-14000);

    const pendingAudits = await db.auditLog
      .where('action')
      .equals('din_band_pending_auth')
      .toArray();
    expect(pendingAudits).toHaveLength(1);

    // Saving mismatched closing with approvalVerified: true succeeds as 'completed'
    const authorized = await saveDailyClosing({
      date: '2026-11-12',
      openingCashPaise: 0,
      expectedCashPaise: 1824000,
      countedCashPaise: 1810000,
      denominationJson: '{}',
      counterPhoto: '',
      status: 'completed',
      approvalVerified: true,
      authorizedBy: 'Approval PIN',
      closedBy: 'Raju',
    });
    expect(authorized.status).toBe('completed');
    expect(authorized.authorizedBy).toBe('Approval PIN');

    const savedAudits = await db.auditLog.where('action').equals('din_band_saved').toArray();
    expect(savedAudits).toHaveLength(1);
  });

  it('generates WhatsApp report text in current language without any profit or margin leakage', () => {
    const summary = computeDayClosingSummary({
      bills: [makeBill({ id: 1, paymentMode: 'cash', totalPaise: 1240000 })],
      billReturns: [],
      udhaarPayments: [],
      batches: [],
      stockMovements: [],
      openingCashPaise: 0,
      date: '2026-11-12',
    });

    const msg = buildDinBandWhatsAppText({
      shopName: 'Test Pharmacy',
      summary,
      countedCashPaise: 1240000,
      status: 'completed',
      labels: {
        heading: 'Daily Closing Report',
        dateLabel: 'Date',
        totalSalesLabel: "Today's Total Sales",
        billsLabel: 'Bills',
        cashSalesLabel: 'Cash Sales',
        upiSalesLabel: 'UPI / Online',
        udhaarSalesLabel: 'New Credit',
        udhaarCollectedLabel: 'Credit Collected',
        returnsLabel: 'Returns',
        expectedCashLabel: 'Expected Cash',
        countedCashLabel: 'Counted Cash',
        differenceLabel: 'Difference',
        statusLabel: 'Cash Match',
        statusCompletedText: 'Day Closed',
        statusPendingText: 'Pending Authorization',
      },
    });

    expect(msg).toContain('Test Pharmacy');
    expect(msg).toContain('2026-11-12');
    expect(msg).toContain('12,400');
    expect(msg.toLowerCase()).not.toContain('profit');
    expect(msg.toLowerCase()).not.toContain('purchase');
    expect(msg.toLowerCase()).not.toContain('margin');

    const url = buildDinBandWhatsAppUrl(msg);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
  });
});

