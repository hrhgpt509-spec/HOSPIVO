import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Bill, type BillReturn, type Customer, type UdhaarPayment } from '../db';
import {
  aggregateDoctorReferralSales,
  buildUdhaarWhatsAppUrl,
  checkCustomerCreditLimit,
  computeNextDueDate,
  computeUdhaarLedgers,
  getReminderUrgency,
  isYaadDilaoEligible,
  recordUdhaarPayment,
  saveCustomerProfile,
  saveRegularReminder,
} from './udhaar';

function makeBill(overrides: Partial<Bill>): Bill {
  return {
    billNo: '2026-27/0001',
    financialYear: '2026-27',
    date: '2026-11-01',
    customerName: 'Ramesh Kumar',
    customerPhone: '9820111223',
    doctorName: '',
    subtotalPaise: 10000,
    discountPaise: 0,
    discountPercent: 0,
    roundOffPaise: 0,
    totalPaise: 10000,
    taxablePaise: 8929,
    gstPaise: 1071,
    paymentMode: 'udhaar',
    cashReceivedPaise: 0,
    changePaise: 0,
    status: 'completed',
    cashierId: 'c1',
    cashierName: 'Raju',
    createdAt: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

describe('udhaar, customers, regular reminders & doctor referral report', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('computes Udhaar balance (bills - udhaar_adjust returns - payments), FIFO daysPending, and sorts biggest first', () => {
    const today = '2026-11-12';
    const customers: Customer[] = [
      {
        id: 1,
        name: 'Ramesh Kumar',
        phone: '9820111223',
        address: 'Ward 7',
        creditLimitPaise: 150000,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'Sunita Devi',
        phone: '9811233445',
        address: 'Main Market',
        creditLimitPaise: 0,
        createdAt: '2026-10-05T00:00:00Z',
        updatedAt: '2026-10-05T00:00:00Z',
      },
    ];

    const bills: Bill[] = [
      // Ramesh: Rs 500 on Oct 20 + Rs 1000 on Nov 09 = Rs 1500 total Udhaar
      makeBill({
        id: 1,
        billNo: '2026-27/0001',
        date: '2026-10-20',
        customerName: 'Ramesh Kumar',
        customerPhone: '9820111223',
        totalPaise: 50000,
      }),
      makeBill({
        id: 2,
        billNo: '2026-27/0002',
        date: '2026-11-09',
        customerName: 'Ramesh Kumar',
        customerPhone: '9820111223',
        totalPaise: 100000,
      }),
      // Sunita: Rs 1200 on Nov 01 (11 days pending)
      makeBill({
        id: 3,
        billNo: '2026-27/0003',
        date: '2026-11-01',
        customerName: 'Sunita Devi',
        customerPhone: '9811233445',
        totalPaise: 120000,
      }),
      // Cash bill should NOT count as Udhaar
      makeBill({
        id: 4,
        billNo: '2026-27/0004',
        date: '2026-11-10',
        customerName: 'Walk In',
        customerPhone: '9000000000',
        paymentMode: 'cash',
        totalPaise: 50000,
      }),
    ];

    // Ramesh returned Rs 200 (udhaar_adjust) and paid Rs 400 -> total credits Rs 600 >= Oct 20 Rs 500 bill!
    // So Ramesh's remaining Rs 900 comes from Nov 09 (3 days pending).
    const billReturns: BillReturn[] = [
      {
        id: 1,
        returnNo: 'RET-1',
        originalBillId: 1,
        originalBillNo: '2026-27/0001',
        refundMode: 'udhaar_adjust',
        totalRefundPaise: 20000,
        itemsJson: '[]',
        reason: 'Partial return',
        approvedBy: 'Owner',
        createdAt: '2026-10-25T10:00:00Z',
      },
    ];

    const udhaarPayments: UdhaarPayment[] = [
      {
        id: 1,
        customerId: 1,
        customerName: 'Ramesh Kumar',
        customerPhone: '9820111223',
        amountPaise: 40000,
        mode: 'cash',
        note: '',
        receivedBy: 'Raju',
        createdAt: '2026-11-10T10:00:00Z',
      },
    ];

    const res = computeUdhaarLedgers({
      customers,
      bills,
      billReturns,
      udhaarPayments,
      today,
    });

    // Pending sorted biggest first: Sunita (Rs 1,200) > Ramesh (Rs 900)
    expect(res.pendingCustomers.map((c) => [c.customerName, c.pendingBalancePaise, c.daysPending])).toEqual([
      ['Sunita Devi', 120000, 11],
      ['Ramesh Kumar', 90000, 3],
    ]);
    expect(res.totalOutstandingPaise).toBe(210000);

    // Credit limit check for Ramesh (limit 150000, current 90000): new 70000 bill -> 160000 > 150000
    const limitCheck = checkCustomerCreditLimit({
      customerPhone: '9820111223',
      customerName: 'Ramesh Kumar',
      newUdhaarPaise: 70000,
      customers,
      bills,
      billReturns,
      udhaarPayments,
    });
    expect(limitCheck.exceeded).toBe(true);
    expect(limitCheck.excessPaise).toBe(10000);
  });

  it('enforces >7 days Yaad Dilao eligibility rule and builds WhatsApp URLs', () => {
    expect(isYaadDilaoEligible(0)).toBe(false);
    expect(isYaadDilaoEligible(7)).toBe(false);
    expect(isYaadDilaoEligible(8)).toBe(true);
    expect(isYaadDilaoEligible(18)).toBe(true);

    const url = buildUdhaarWhatsAppUrl('9820111223', 'Hello balance Rs. 1,500');
    expect(url).toBe('https://wa.me/919820111223?text=Hello%20balance%20Rs.%201%2C500');
  });

  it('records append-only Paisa Mila payment and writes udhaar_payment_received audit log', async () => {
    const cust = await saveCustomerProfile({
      name: 'Mohan Lal',
      phone: '9425066778',
      address: 'Station Road',
      creditLimitPaise: 200000,
      actorName: 'Owner',
    });

    const payment = await recordUdhaarPayment({
      customerId: cust.id,
      customerName: 'Mohan Lal',
      customerPhone: '9425066778',
      amountPaise: 50000,
      mode: 'upi',
      note: 'GPay counter',
      receivedBy: 'Raju',
    });

    expect(payment.id).toBeDefined();
    expect(payment.amountPaise).toBe(50000);

    // Append-only enforcement
    await expect(db.udhaarPayments.update(payment.id!, { amountPaise: 100 })).rejects.toThrow(
      /append-only/i
    );

    const audits = await db.auditLog
      .where('action')
      .equals('udhaar_payment_received')
      .toArray();
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toContain('Mohan Lal');
  });

  it('computes regular reminder nextDueDate, urgency, and persists schedule', async () => {
    expect(computeNextDueDate('2026-11-01', 30)).toBe('2026-12-01');
    expect(computeNextDueDate('2028-02-01', 30)).toBe('2028-03-02'); // leap year

    expect(getReminderUrgency('2026-11-11', '2026-11-12')).toBe('overdue');
    expect(getReminderUrgency('2026-11-12', '2026-11-12')).toBe('today');
    expect(getReminderUrgency('2026-11-13', '2026-11-12')).toBe('tomorrow');
    expect(getReminderUrgency('2026-11-20', '2026-11-12')).toBe('upcoming');

    const saved = await saveRegularReminder({
      customerName: 'Ramesh Kumar',
      customerPhone: '9820111223',
      medicineId: 5,
      medicineName: 'Telma 40',
      packDays: 30,
      lastDispensedDate: '2026-10-14',
      actorName: 'Raju',
    });

    expect(saved.nextDueDate).toBe('2026-11-13');
    expect(saved.active).toBe(true);
  });

  it('aggregates doctor referral sales without empty doctors and with zero commission', () => {
    const bills: Bill[] = [
      makeBill({
        id: 1,
        billNo: '2026-27/0001',
        date: '2026-11-12',
        doctorName: 'Dr. Verma',
        paymentMode: 'cash',
        totalPaise: 100000,
      }),
      makeBill({
        id: 2,
        billNo: '2026-27/0002',
        date: '2026-11-10',
        doctorName: 'dr. verma',
        paymentMode: 'upi',
        totalPaise: 50000,
      }),
      makeBill({
        id: 3,
        billNo: '2026-27/0003',
        date: '2026-11-11',
        doctorName: 'Dr. Gupta',
        paymentMode: 'cash',
        totalPaise: 200000,
      }),
      makeBill({
        id: 4,
        billNo: '2026-27/0004',
        date: '2026-11-12',
        doctorName: '   ', // Empty doctor name ignored
        paymentMode: 'cash',
        totalPaise: 99000,
      }),
      makeBill({
        id: 5,
        billNo: '2026-27/0005',
        date: '2026-10-01', // Last month -> excluded from 'month' preset
        doctorName: 'Dr. Khan',
        paymentMode: 'cash',
        totalPaise: 300000,
      }),
    ];

    const monthSummary = aggregateDoctorReferralSales(bills, { preset: 'month' }, '2026-11-12');
    expect(monthSummary.doctors).toEqual([
      { doctorName: 'Dr. Gupta', billCount: 1, totalSalesPaise: 200000 },
      { doctorName: 'Dr. Verma', billCount: 2, totalSalesPaise: 150000 },
    ]);
    expect(monthSummary.totalBills).toBe(3);
    expect(monthSummary.totalSalesPaise).toBe(350000);
    // Strict no-commission check
    for (const d of monthSummary.doctors) {
      expect('commission' in d).toBe(false);
    }

    const todaySummary = aggregateDoctorReferralSales(bills, { preset: 'today' }, '2026-11-12');
    expect(todaySummary.doctors).toEqual([
      { doctorName: 'Dr. Verma', billCount: 1, totalSalesPaise: 100000 },
    ]);
  });
});

