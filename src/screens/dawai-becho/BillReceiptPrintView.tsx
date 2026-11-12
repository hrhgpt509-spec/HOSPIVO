import React from 'react';
import type { Bill, BillItem } from '../../db';
import { useTranslation } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { formatRupees } from '../../logic/money';

export type PrintFormat = 'a4' | 'thermal';

interface BillReceiptPrintViewProps {
  bill: Bill | null;
  items: BillItem[];
  format: PrintFormat;
}

export const BillReceiptPrintView: React.FC<BillReceiptPrintViewProps> = ({
  bill,
  items,
  format,
}) => {
  const { t } = useTranslation();
  const { shop } = useShop();

  if (!bill) return null;

  const isThermal = format === 'thermal';

  return (
    <div
      id="hospivo-print-area"
      className={`hidden bg-white text-black font-sans ${
        isThermal ? 'max-w-[80mm] mx-auto p-3 text-xs' : 'max-w-[210mm] mx-auto p-8 text-sm'
      }`}
    >
      {/* Shop Header */}
      <div className="text-center border-b-2 border-black pb-3 mb-3">
        <div className={`${isThermal ? 'text-base' : 'text-2xl'} font-extrabold uppercase`}>
          {shop?.name || ''}
        </div>
        {shop?.address && <div className="text-xs mt-0.5">{shop.address}</div>}
        {shop?.phone && <div className="text-xs">{shop.phone}</div>}
        {shop?.gstNo && (
          <div className="text-xs font-semibold">
            {t('billing_flow.receipt_gstin_prefix')} {shop.gstNo}
          </div>
        )}
        {shop?.drugLicenceNos && (
          <div className="text-xs">
            {t('billing_flow.receipt_dl_prefix')} {shop.drugLicenceNos}
          </div>
        )}
        <div className="font-bold tracking-wider uppercase mt-2 text-xs border border-black inline-block px-2 py-0.5">
          {t('billing_flow.receipt_tax_invoice')}
        </div>
      </div>

      {/* Bill Meta */}
      <div className="flex justify-between flex-wrap gap-2 border-b border-dashed border-black pb-2 mb-2 text-xs">
        <div>
          <div>
            <strong>{t('billing_flow.wa_bill_label')}:</strong> #{bill.billNo}
          </div>
          <div>
            <strong>{t('billing_flow.wa_date_label')}:</strong> {bill.date}
          </div>
          <div>
            <strong>{t('billing_flow.receipt_mode')}:</strong> {bill.paymentMode.toUpperCase()}
          </div>
        </div>
        <div className="text-right">
          {bill.customerName && (
            <div>
              <strong>{t('billing_flow.receipt_patient')}</strong> {bill.customerName}
            </div>
          )}
          {bill.customerPhone && <div>{bill.customerPhone}</div>}
          {bill.doctorName && (
            <div>
              <strong>{t('billing_flow.receipt_doctor')}</strong> {bill.doctorName}
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full border-collapse mb-3">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 font-bold">{t('billing_flow.receipt_col_item')}</th>
            {!isThermal && <th className="py-1 font-bold">{t('billing_flow.receipt_col_batch')}</th>}
            <th className="py-1 font-bold text-center">{t('billing_flow.receipt_col_qty')}</th>
            <th className="py-1 font-bold text-right">{t('billing_flow.receipt_col_amt')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td className="py-1 pr-2">
                <div className="font-semibold">{item.medicineName}</div>
                {isThermal && (
                  <div className="text-[10px]">
                    {item.batchNo} ({item.expiry.slice(0, 7)})
                  </div>
                )}
              </td>
              {!isThermal && (
                <td className="py-1 text-xs">
                  {item.batchNo} · {item.expiry.slice(0, 7)}
                </td>
              )}
              <td className="py-1 text-center">
                {item.qtyInput}{' '}
                {item.unitMode === 'pack'
                  ? t('dawai_becho.unit_strip')
                  : t('dawai_becho.unit_loose')}
              </td>
              <td className="py-1 text-right font-semibold">
                {formatRupees(item.lineTotalPaise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals & GST Summary */}
      <div className="border-t-2 border-black pt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <span>{t('dawai_becho.summary_subtotal')}:</span>
          <span>{formatRupees(bill.subtotalPaise)}</span>
        </div>
        {bill.discountPaise > 0 && (
          <div className="flex justify-between">
            <span>{t('dawai_becho.summary_discount')}:</span>
            <span>-{formatRupees(bill.discountPaise)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{t('billing_flow.receipt_taxable')}:</span>
          <span>{formatRupees(bill.taxablePaise)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('billing_flow.receipt_gst_total')}:</span>
          <span>{formatRupees(bill.gstPaise)}</span>
        </div>
        {bill.roundOffPaise !== 0 && (
          <div className="flex justify-between">
            <span>{t('dawai_becho.summary_round_off')}:</span>
            <span>
              {bill.roundOffPaise > 0 ? '+' : ''}
              {formatRupees(bill.roundOffPaise)}
            </span>
          </div>
        )}
        <div
          className={`flex justify-between font-extrabold border-t border-black pt-1.5 mt-1 ${
            isThermal ? 'text-base' : 'text-lg'
          }`}
        >
          <span>{t('dawai_becho.summary_total')}:</span>
          <span>{formatRupees(bill.totalPaise)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-4 pt-2 border-t border-dashed border-black text-xs">
        <div>{t('billing_flow.wa_thanks')}</div>
      </div>
    </div>
  );
};

