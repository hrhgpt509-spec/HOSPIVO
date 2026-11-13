import React from 'react';
import { type FastBillCartItem, calculateFastBillTotals } from '../../logic/fastBill';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { t } from '../../i18n';

interface FinalReviewViewProps {
  billNumberLabel: string;
  items: FastBillCartItem[];
  onWapas: () => void;
  onPayNow: () => void;
  onQuickCash: () => void;
  onQuickUpi: () => void;
  onRemoveItem: (index: number) => void;
  onChangeBatch: (index: number) => void;
}

export const FinalReviewView: React.FC<FinalReviewViewProps> = ({
  billNumberLabel,
  items,
  onWapas,
  onPayNow,
  onQuickCash,
  onQuickUpi,
  onRemoveItem,
  onChangeBatch,
}) => {
  const totals = calculateFastBillTotals(items);

  return (
    <section className="w-full lg:w-[70%] h-full flex flex-col min-h-0">
      <div className="w-full h-full bg-surface-container-lowest rounded-2xl shadow-sm flex flex-col justify-between p-space-lg border border-outline-variant/30 gap-space-sm overflow-hidden">
        {/* Header inside Right Card */}
        <div className="flex items-center justify-between pb-space-xs shrink-0">
          <div className="flex items-center gap-space-md">
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
              {billNumberLabel}
            </h1>
            <span className="bg-primary-container text-on-primary font-body-lg text-body-lg px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-xs">
              <Icon name="verified" className="text-[22px]" />
              <span>
                {t('fast_bill.confirm_card.verification_done', {
                  current: items.length,
                  total: items.length,
                })}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-1.5 rounded-xl border border-outline-variant/20">
            <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
              {t('fast_bill.confirm_card.verification_pct', { pct: 100 })}
            </span>
            <div className="w-24 md:w-32 h-3 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary w-full"></div>
            </div>
          </div>
        </div>

        {/* Medicines Table Header */}
        <div className="grid grid-cols-12 gap-space-sm py-2 px-space-md bg-surface-container rounded-lg font-headline-md text-sm md:text-base text-on-surface font-bold shrink-0 mt-space-xs">
          <div className="col-span-1 text-on-surface-variant">
            {t('fast_bill.final_review.item_header_num')}
          </div>
          <div className="col-span-6">
            {t('fast_bill.final_review.item_header_med')}
          </div>
          <div className="col-span-2 text-center">
            {t('fast_bill.final_review.item_header_qty')}
          </div>
          <div className="col-span-3 text-right">
            {t('fast_bill.final_review.item_header_amt')}
          </div>
        </div>

        {/* Medicines List */}
        <div className="flex flex-col divide-y divide-surface-container-high flex-1 min-h-0 overflow-y-auto py-1 pr-1">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="grid grid-cols-12 gap-space-sm items-center px-space-md py-2 hover:bg-surface-container-low rounded-lg transition-colors group"
            >
              <span className="col-span-1 font-body-lg text-body-lg font-bold text-on-surface-variant">
                {idx + 1}
              </span>
              <div className="col-span-6 flex flex-col min-w-0">
                <span className="font-body-lg text-body-lg font-bold text-on-surface truncate">
                  {item.medicineName}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant text-xs">
                    {t('fast_bill.confirm_card.batch_exp', {
                      batch: item.batchNo,
                      exp: item.expiry,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeBatch(idx)}
                    className="text-xs text-primary underline opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Batch
                  </button>
                </div>
              </div>
              <div className="col-span-2 text-center">
                <span className="font-body-lg text-body-lg font-bold bg-surface-container px-3 py-1 rounded-lg">
                  {item.quantity}{' '}
                  {item.unitType === 'strip'
                    ? t('fast_bill.tile_wall.per_strip')
                    : t('fast_bill.tile_wall.per_unit')}
                </span>
              </div>
              <div className="col-span-3 text-right flex items-center justify-end gap-2">
                <span className="font-headline-md text-headline-md font-bold text-on-surface">
                  {formatRupees(item.lineTotalPaise)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveItem(idx)}
                  className="text-outline hover:text-error p-1 rounded transition-colors opacity-60 hover:opacity-100"
                  title="Remove item"
                >
                  <Icon name="cancel" className="text-[20px]" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Summary & Action Trigger Block */}
        <div className="shrink-0 bg-surface-container-low rounded-xl p-space-md mt-space-xs flex flex-col gap-space-sm border border-outline-variant/20">
          {/* Total Callout */}
          <div className="flex items-center justify-between px-space-sm">
            <div className="flex flex-col">
              <span className="font-title-hinglish text-title-hinglish text-on-surface-variant">
                {t('fast_bill.final_review.total_payable')}
              </span>
              <span className="font-label-sub-english text-label-sub-english text-primary font-bold">
                {t('fast_bill.final_review.includes_gst')} •{' '}
                {t('fast_bill.items_count', { count: items.length })}
              </span>
            </div>
            <div className="font-display-total text-3xl md:text-4xl text-on-surface tracking-tight font-black">
              TOTAL {formatRupees(totals.totalPaise)}
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap md:flex-nowrap items-center gap-space-md">
            {/* Wapas Button */}
            <button
              type="button"
              onClick={onWapas}
              className="h-16 px-space-lg rounded-[16px] bg-surface-container-highest hover:bg-surface-dim active:translate-y-0.5 transition-all text-on-surface flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              <Icon name="arrow_back" className="text-[26px]" />
              <span className="font-body-md text-body-md font-bold">
                {t('fast_bill.final_review.wapas')}
              </span>
            </button>

            {/* One-tap Exact Cash Button */}
            <button
              type="button"
              onClick={onQuickCash}
              className="h-16 px-space-md rounded-[16px] bg-primary/10 hover:bg-primary/20 text-primary active:scale-[0.99] font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
              title="1-tap Exact Cash"
            >
              <Icon name="payments" className="text-[24px]" />
              <div className="flex flex-col items-start leading-none text-left">
                <span className="text-base font-bold">
                  {t('fast_bill.final_review.one_tap_cash')}
                </span>
                <span className="text-xs font-medium text-primary/80">
                  {formatRupees(totals.totalPaise)}
                </span>
              </div>
            </button>

            {/* One-tap UPI Button */}
            <button
              type="button"
              onClick={onQuickUpi}
              className="h-16 px-space-md rounded-[16px] bg-secondary/10 hover:bg-secondary/20 text-secondary active:scale-[0.99] font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
              title="1-tap UPI"
            >
              <Icon name="qr_code" className="text-[24px]" />
              <div className="flex flex-col items-start leading-none text-left">
                <span className="text-base font-bold">
                  {t('fast_bill.final_review.one_tap_upi')}
                </span>
                <span className="text-xs font-medium text-secondary/80">
                  {formatRupees(totals.totalPaise)}
                </span>
              </div>
            </button>

            {/* Primary Button: Payment Karo */}
            <button
              type="button"
              onClick={onPayNow}
              className="h-16 flex-1 rounded-[16px] bg-primary hover:bg-primary-container active:translate-y-0.5 transition-all text-on-primary flex items-center justify-between px-space-lg cursor-pointer shadow-md min-w-[200px]"
            >
              <div className="flex items-center gap-space-md">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Icon name="payments" className="text-[26px]" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-button-text text-button-text leading-none">
                    {t('fast_bill.final_review.pay_now')}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-primary-fixed leading-tight">
                    {t('fast_bill.final_review.pay_now_sub')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-sm">
                <span className="bg-black/20 text-on-primary font-label-sub-english text-label-sub-english px-3 py-1 rounded-lg font-bold">
                  Enter ↵
                </span>
                <Icon name="arrow_forward" className="text-[30px]" />
              </div>
            </button>
          </div>

          {/* Keyboard Shortcuts Hint Bar */}
          <div className="flex items-center justify-between pt-1 text-on-surface-variant font-label-sub-english text-label-sub-english px-space-xs text-xs">
            <div className="flex items-center gap-1.5">
              <span className="bg-surface-container-highest px-2 py-0.5 rounded font-bold text-on-surface">
                Enter
              </span>
              <span>= Payment</span>
            </div>
            <div className="h-3 w-px bg-outline-variant"></div>
            <div className="flex items-center gap-1.5">
              <span className="bg-surface-container-highest px-2 py-0.5 rounded font-bold text-on-surface">
                ←
              </span>
              <span>= Wapas</span>
            </div>
            <div className="h-3 w-px bg-outline-variant"></div>
            <div className="flex items-center gap-1.5">
              <span className="bg-surface-container-highest px-2 py-0.5 rounded font-bold text-on-surface">
                Delete
              </span>
              <span>= Hatao</span>
            </div>
            <div className="h-3 w-px bg-outline-variant"></div>
            <div className="flex items-center gap-1.5">
              <span className="bg-surface-container-highest px-2 py-0.5 rounded font-bold text-on-surface">
                B
              </span>
              <span>= Batch badlo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
