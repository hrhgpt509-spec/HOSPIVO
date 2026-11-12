import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  buildWhatsAppBillText,
  buildWhatsAppBillUrl,
  calculateCashChange,
  computeReturnableUnitsPerItem,
  searchBills,
  validateSplitPayment,
} from './billingFlow';
import { finalizeBill, processBillReturn } from './billing';
import { batchStock } from './stock';

const TEST_USER = { id: 'cashier-1', name: 'Raju', role: 'cashier' };
const TEST_OWNER = { id: 'owner-1', name: 'Owner', role: 'owner' };

describe('billingFlow.ts payment, WhatsApp, and end-to-end return tests', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('calculates whole-paise cash change and prevents finishing when cash < total', () => {
    // Total Rs 182 (18200 paise), Received Rs 200 (20000 paise) -> Change Rs 18 (1800 paise)
    const exactOk = calculateCashChange(18200, 18200);
    expect(exactOk.valid).toBe(true);
    expect(exactOk.changePaise).toBe(0);
    expect(exactOk.shortagePaise).toBe(0);

    const withChange = calculateCashChange(18200, 20000);
    expect(withChange.valid).toBe(true);
    expect(withChange.changePaise).toBe(1800);
    expect(withChange.shortagePaise).toBe(0);

    const short = calculateCashChange(18200, 15000);
    expect(short.valid).toBe(false);
    expect(short.changePaise).toBe(0);
    expect(short.shortagePaise).toBe(3200);
  });

  it('validates Aadha-Aadha split payment must equal exact totalPaise', () => {
    expect(validateSplitPayment(18200, 10000, 8200)).toEqual({
      valid: true,
      remainingPaise: 0,
    });

    expect(validateSplitPayment(18200, 10000, 8000)).toEqual({
      valid: false,
      remainingPaise: 200,
    });

    expect(validateSplitPayment(18200, -100, 18300).valid).toBe(false);
    expect(validateSplitPayment(18200, 100.5, 18099.5).valid).toBe(false);
  });

  it('builds plain-text WhatsApp bill receipt and wa.me URL safely offline', () => {
    const msg = buildWhatsAppBillText(
      {
        billNo: '2026-27/0001',
        date: '2026-11-12',
        totalPaise: 18200,
        paymentMode: 'cash',
      },
      [
        {
          medicineName: 'Crocin 500',
          unitMode: 'pack',
          qtyInput: 2,
          lineTotalPaise: 6400,
        },
        {
          medicineName: 'Azithral 500',
          unitMode: 'pack',
          qtyInput: 1,
          lineTotalPaise: 11800,
        },
      ],
      'Shree Medical Store',
      {
        greeting: 'Thank you for visiting!',
        billLabel: 'Bill No',
        dateLabel: 'Date',
        itemsHeading: 'Medicines:',
        totalLabel: 'Total',
        modeLabel: 'Payment',
        stripWord: 'Strip',
        looseWord: 'Loose',
        thanks: 'Get well soon!',
      }
    );

    expect(msg).toContain('*Shree Medical Store*');
    expect(msg).toContain('Bill No: #2026-27/0001');
    expect(msg).toContain('Crocin 500 (2 Strip)');
    expect(msg).toContain('*Total: Rs. 182*');
    expect(msg).toContain('Payment: CASH');

    // Phone with 10 digits gets 91 prefix
    const urlWithPhone = buildWhatsAppBillUrl('9826011223', msg);
    expect(urlWithPhone.startsWith('https://wa.me/919826011223?text=')).toBe(true);

    // No phone uses wa.me/?text=
    const urlNoPhone = buildWhatsAppBillUrl('', msg);
    expect(urlNoPhone.startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('completes a bill end-to-end, searches old bills, and processes a partial sales return restoring exact batch stock', async () => {
    const medId = Number(
      await db.medicines.add({
        name: 'Crocin 500',
        strength: '500mg',
        form: 'Tablet',
        salt: 'Paracetamol',
        company: 'GSK',
        gstPercent: 12,
        hsn: '3004',
        mrpPaise: 3200,
        unitsPerPack: 10,
        shortCode: 'C1',
        barcode: '890123456',
        shelf: 'S-04',
        scheduleType: 'none',
        minStockUnits: 10,
        active: true,
      })
    );

    const batchId = Number(
      await db.batches.add({
        medicineId: medId,
        batchNo: 'B-2231',
        expiry: '2027-08-31',
        purchaseRatePaise: 2000,
        mrpPaise: 3200,
        shelf: 'S-04',
      })
    );

    await db.stockMovements.add({
      batchId,
      medicineId: medId,
      type: 'purchase',
      qtyUnits: 50,
      reference: 'INV-1',
      who: 'Owner',
      at: new Date().toISOString(),
    });

    // 1. Finalize sale of 2 strips (20 tablets) = Rs 64
    const saleResult = await finalizeBill(
      {
        lines: [{ medicineId: medId, unitMode: 'pack', qtyInput: 2 }],
        paymentMode: 'cash',
        cashReceivedPaise: 10000,
        customerName: 'Ramesh Kumar',
        customerPhone: '9826011223',
        date: '2026-11-12',
      },
      TEST_USER,
      { today: '2026-11-12' }
    );

    expect(saleResult.bill.totalPaise).toBe(6400);
    expect(saleResult.bill.changePaise).toBe(3600);
    expect(await batchStock(batchId)).toBe(30); // 50 - 20

    // 2. Old bills search finds by billNo, name, or phone
    const allBills = await db.bills.toArray();
    expect(searchBills(allBills, '0001')).toHaveLength(1);
    expect(searchBills(allBills, 'Ramesh')).toHaveLength(1);
    expect(searchBills(allBills, '98260')).toHaveLength(1);
    expect(searchBills(allBills, 'Unknown')).toHaveLength(0);

    // 3. Compute returnable units before any return
    const items = await db.billItems.where('billId').equals(saleResult.billId).toArray();
    const prevReturns = await db.billReturns
      .where('originalBillId')
      .equals(saleResult.billId)
      .toArray();
    const returnableBefore = computeReturnableUnitsPerItem(items, prevReturns);
    expect(returnableBefore[items[0].id!]).toBe(20);

    // 4. Partial sales return: return 5 loose tablets to exact same batch
    const retResult = await processBillReturn(
      {
        originalBillId: saleResult.billId,
        items: [{ billItemId: items[0].id!, returnUnits: 5 }],
        refundMode: 'cash',
        reason: 'Customer returned 5 tablets',
      },
      TEST_OWNER
    );

    expect(retResult.newBillStatus).toBe('returned_partial');
    expect(retResult.totalRefundPaise).toBe(1600); // 5/20 * 6400 = 1600
    expect(await batchStock(batchId)).toBe(35); // 30 + 5 restored to exact same batch!

    const updatedBill = await db.bills.get(saleResult.billId);
    expect(updatedBill?.status).toBe('returned_partial');

    // Returnable units reduced accordingly (20 - 5 = 15)
    const returnsAfter = await db.billReturns
      .where('originalBillId')
      .equals(saleResult.billId)
      .toArray();
    const returnableAfter = computeReturnableUnitsPerItem(items, returnsAfter);
    expect(returnableAfter[items[0].id!]).toBe(15);
  });
});

