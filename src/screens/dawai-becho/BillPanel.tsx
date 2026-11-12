import React, { useState } from 'react';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import type { BillTotalsResult } from '../../logic/billing';
import type { CartItem } from './types';
import type { UnitMode } from '../../db';

interface BillPanelProps {
  nextBillNo: string;
  cart: CartItem[];
  totals: BillTotalsResult;
  heldCount: number;
  customerName: string;
  customerPhone: string;
  doctorName: string;
  wholeBillDiscountPercent: number;
  onCustomerNameChange: (val: string) => void;
  onCustomerPhoneChange: (val: string) => void;
  onDoctorNameChange: (val: string) => void;
  onWholeBillDiscountChange: (val: number) => void;
  onToggleUnitMode: (lineId: string, nextMode: UnitMode) => void;
  onChangeQty: (lineId: string, delta: number) => void;
  onChangeItemDiscount: (lineId: string, discountPct: number) => void;
  onHoldBill: () => void;
  onOpenHeldBills: () => void;
  onUndoLastItem: () => void;
  onNewBill: () => void;
  onOpenOldBills: () => void;
  onOpenReturns: () => void;
  onProceedToPayment: () => void;
  isMobileSheet?: boolean;
  onCloseMobileSheet?: () => void;
}

function formatShortExpiry(isoExpiry: string): string {
  if (!isoExpiry) return '';
  const parts = isoExpiry.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0].slice(-2)}`;
  }
  return isoExpiry;
}

export const BillPanel: React.FC<BillPanelProps> = ({
  nextBillNo,
  cart,
  totals,
  heldCount,
  customerName,
  customerPhone,
  doctorName,
  wholeBillDiscountPercent,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onDoctorNameChange,
  onWholeBillDiscountChange,
  onToggleUnitMode,
  onChangeQty,
  onChangeItemDiscount,
  onHoldBill,
  onOpenHeldBills,
  onUndoLastItem,
  onNewBill,
  onOpenOldBills,
  onOpenReturns,
  onProceedToPayment,
  isMobileSheet = false,
  onCloseMobileSheet,
}) => {
  const { t } = useTranslation();
  const [showMetaInputs, setShowMetaInputs] = useState<boolean>(false);

  const btnHold = tButton('dawai_becho.btn_hold');
  const btnMakeBill = tButton('dawai_becho.btn_make_bill');
  const btnNewBill = tButton('dawai_becho.btn_new_bill');
  const btnOldBills = tButton('dawai_becho.btn_old_bills');
  const btnReturns = tButton('dawai_becho.btn_returns');
  const btnUndo = tButton('dawai_becho.btn_undo_last');

  return (
    <div className="flex flex-col gap-space-sm h-full min-h-0">
      {/* 1. Bill Panel Card */}
      <div className="flex-1 bg-surface-container-lowest rounded-2xl shadow-md p-space-md lg:p-space-lg flex flex-col justify-between min-h-0 border border-outline-variant/40">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-space-xs border-b border-outline-variant/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold truncate">
              {t('dawai_becho.bill_header_prefix')} #{nextBillNo}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant shrink-0">
              {t('dawai_becho.items_count', { count: cart.length })}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {heldCount > 0 && (
              <button
                type="button"
                onClick={onOpenHeldBills}
                className="h-12 min-h-[48px] px-3 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed font-bold text-sm flex items-center gap-1.5 hover:brightness-95 cursor-pointer transition-all"
              >
                <Icon name="receipt_long" className="text-[18px]" />
                <span>{t('dawai_becho.btn_held_list', { count: heldCount })}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowMetaInputs((prev) => !prev)}
              aria-label={t('dawai_becho.customer_name_placeholder')}
              className={`h-12 px-3 rounded-xl flex items-center gap-1 font-bold text-sm transition-colors cursor-pointer ${
                showMetaInputs || customerName || doctorName || wholeBillDiscountPercent > 0
                  ? 'bg-primary-fixed text-on-primary-fixed'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              <Icon name="person_add" className="text-[20px]" />
              <span>%</span>
            </button>

            <button
              type="button"
              onClick={onHoldBill}
              className="min-h-[56px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface transition-all cursor-pointer active:scale-95"
            >
              <Icon name="pause_circle" className="text-[22px] text-tertiary" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-label-sub-english text-sm font-bold">{btnHold.main}</span>
                {btnHold.sub && (
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {btnHold.sub}
                  </span>
                )}
              </div>
            </button>

            {isMobileSheet && onCloseMobileSheet && (
              <button
                type="button"
                onClick={onCloseMobileSheet}
                aria-label="Close"
                className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <Icon name="expand_more" className="text-[28px]" />
              </button>
            )}
          </div>
        </div>

        {/* Optional Customer / Doctor / Bill Discount Bar */}
        {showMetaInputs && (
          <div className="py-2.5 px-3 my-2 rounded-xl bg-surface-container-low border border-outline-variant/50 grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <input
              {...textFieldProps('name', customerName, onCustomerNameChange)}
              type="text"
              placeholder={t('dawai_becho.customer_name_placeholder')}
              className="h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              {...textFieldProps('phone', customerPhone, onCustomerPhoneChange)}
              type="text"
              placeholder={t('dawai_becho.customer_phone_placeholder')}
              className="h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              {...textFieldProps('name', doctorName, onDoctorNameChange)}
              type="text"
              placeholder={t('dawai_becho.doctor_name_placeholder')}
              className="h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="h-11 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-on-surface-variant shrink-0">
                {t('dawai_becho.bill_discount_label')}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={wholeBillDiscountPercent || ''}
                placeholder="0"
                onChange={(e) => {
                  const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  onWholeBillDiscountChange(val);
                }}
                className="w-16 text-right bg-transparent font-bold text-on-surface text-base focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Bill Items List */}
        <div className="flex-1 flex flex-col gap-space-sm py-space-xs min-h-0 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 text-on-surface-variant gap-2">
              <Icon name="shopping_cart" className="text-[48px] text-outline/60" />
              <span className="font-title-hinglish text-lg font-bold text-on-surface">
                {t('dawai_becho.empty_cart_title')}
              </span>
              <span className="font-body-md text-sm max-w-xs">
                {t('dawai_becho.empty_cart_sub')}
              </span>
            </div>
          ) : (
            cart.map((item, idx) => {
              const computed = totals.lines[idx];
              const upp = Math.max(1, item.medicine.unitsPerPack || 1);
              const batchText = item.allocations
                .map((a) => `${a.batchNo} (${formatShortExpiry(a.expiry)})`)
                .join(', ');

              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-space-sm flex flex-col gap-2 transition-all border ${
                    item.isHighlighted
                      ? 'bg-primary-fixed/40 border-primary shadow-sm'
                      : 'bg-surface-container-low border-outline-variant/40'
                  }`}
                >
                  {/* Top Row: Name, Batch, Price */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-body-md text-body-md font-bold text-on-surface leading-tight">
                          {item.medicine.name} {item.medicine.strength}
                        </span>
                        {(item.medicine.scheduleType === 'H' ||
                          item.medicine.scheduleType === 'H1') && (
                          <span className="px-1.5 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-bold">
                            {t('dawai_becho.sch_badge', { type: item.medicine.scheduleType })}
                          </span>
                        )}
                      </div>
                      <span className="font-label-sub-english text-xs text-on-surface-variant mt-0.5">
                        {t('dawai_becho.batch_exp_prefix')} {batchText}
                        {item.medicine.shelf ? ` · ${item.medicine.shelf}` : ''}
                      </span>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-title-hinglish text-title-hinglish text-on-surface font-extrabold">
                        {computed ? formatRupees(computed.lineTotalPaise) : formatRupees(0)}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">
                        {computed ? formatRupees(computed.unitPricePaise) : ''}{' '}
                        {item.unitMode === 'pack'
                          ? t('dawai_becho.per_strip_suffix')
                          : t('dawai_becho.per_unit_suffix')}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Control Row: Strip/Loose Toggle, Item Disc, Stepper */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/30 flex-wrap">
                    <div className="flex items-center gap-2">
                      {/* Strip / Loose Segmented Toggle */}
                      {upp > 1 ? (
                        <div className="flex bg-surface-container-lowest rounded-xl p-0.5 border border-outline-variant/60 h-11 items-center">
                          <button
                            type="button"
                            onClick={() => onToggleUnitMode(item.id, 'pack')}
                            className={`h-full px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              item.unitMode === 'pack'
                                ? 'bg-primary text-on-primary shadow-sm'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            {t('dawai_becho.unit_strip')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleUnitMode(item.id, 'loose')}
                            className={`h-full px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              item.unitMode === 'loose'
                                ? 'bg-primary text-on-primary shadow-sm'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            {t('dawai_becho.unit_loose')}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-container text-on-surface-variant">
                          {t('dawai_becho.unit_loose')}
                        </span>
                      )}

                      {/* Compact Item Discount % */}
                      <div className="h-11 px-2 rounded-xl bg-surface-container-lowest border border-outline-variant/60 flex items-center gap-1">
                        <span className="text-[11px] font-bold text-on-surface-variant">
                          {t('dawai_becho.item_discount_label')}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={item.itemDiscountPercent || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            onChangeItemDiscount(item.id, val);
                          }}
                          className="w-10 text-right bg-transparent text-xs font-bold text-on-surface focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Quantity Stepper (>= 56px on mobile, 44px-56px crisp touch targets) */}
                    <div className="flex items-center gap-1.5 bg-surface-container-lowest rounded-xl p-1 shadow-sm border border-outline-variant/40">
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.id, -1)}
                        aria-label="Decrease quantity"
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-surface-container-low text-on-surface flex items-center justify-center font-bold text-xl hover:bg-surface-container-high active:scale-95 transition-all cursor-pointer"
                      >
                        −
                      </button>
                      <span className="font-title-hinglish text-lg font-bold w-8 text-center text-on-surface">
                        {item.qtyInput}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.id, 1)}
                        aria-label="Increase quantity"
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg bg-primary-fixed/40 text-primary flex items-center justify-center font-bold text-xl hover:bg-primary hover:text-on-primary active:scale-95 transition-all cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom of Bill Panel: Live Totals & Bill Banao CTA */}
        <div className="flex flex-col gap-space-xs pt-space-xs border-t border-outline-variant/30 shrink-0">
          {/* Subtotal / Discount / Round-off breakdown when cart is non-empty */}
          {cart.length > 0 && (
            <div className="flex flex-col gap-0.5 px-2 text-xs font-semibold text-on-surface-variant">
              <div className="flex justify-between">
                <span>{t('dawai_becho.summary_subtotal')}</span>
                <span>{formatRupees(totals.subtotalPaise)}</span>
              </div>
              {totals.discountPaise > 0 && (
                <div
                  className={`flex justify-between ${
                    totals.requiresApproval ? 'text-tertiary font-bold' : 'text-primary'
                  }`}
                >
                  <span>
                    {t('dawai_becho.summary_discount')} ({totals.effectiveDiscountPercent}%)
                    {totals.requiresApproval ? ' • PIN' : ''}
                  </span>
                  <span>-{formatRupees(totals.discountPaise)}</span>
                </div>
              )}
              {totals.roundOffPaise !== 0 && (
                <div className="flex justify-between">
                  <span>{t('dawai_becho.summary_round_off')}</span>
                  <span>
                    {totals.roundOffPaise > 0 ? '+' : ''}
                    {formatRupees(totals.roundOffPaise)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Prominent Total display (>= 36px always visible) */}
          <div className="flex items-baseline justify-between bg-surface-container-low rounded-xl px-space-md py-2">
            <span className="font-title-hinglish text-title-hinglish text-on-surface-variant font-bold">
              {t('dawai_becho.summary_total')}
            </span>
            <span className="font-display-total text-[36px] sm:text-[42px] leading-[44px] font-extrabold text-primary">
              {formatRupees(totals.totalPaise)}
            </span>
          </div>

          {/* Big green button (>= 56px tall) */}
          <button
            type="button"
            onClick={onProceedToPayment}
            className="w-full h-16 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary shadow-lg flex items-center justify-center gap-space-md active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Icon name="receipt_long" className="text-[32px]" />
            <div className="flex flex-col items-start justify-center leading-none">
              <span className="font-button-text text-button-text font-bold leading-tight">
                {btnMakeBill.main}
              </span>
              {btnMakeBill.sub && (
                <span className="font-label-sub-english text-label-sub-english text-primary-fixed leading-tight">
                  {btnMakeBill.sub}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* 2. Under the Bill Panel Action Row (all >= 56px tall) */}
      <div className="grid grid-cols-4 gap-space-xs shrink-0">
        {/* Wapas (Undo last item) */}
        <button
          type="button"
          onClick={onUndoLastItem}
          className="h-14 min-h-[56px] rounded-xl bg-surface-container-lowest hover:bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/40 flex flex-col items-center justify-center px-1 transition-all cursor-pointer active:scale-95"
        >
          <span className="font-label-sub-english text-sm sm:text-base font-bold leading-tight">
            {btnUndo.main}
          </span>
          {btnUndo.sub && (
            <span className="text-[11px] text-on-surface-variant leading-none">{btnUndo.sub}</span>
          )}
        </button>

        {/* Naya Bill */}
        <button
          type="button"
          onClick={onNewBill}
          className="h-14 min-h-[56px] rounded-xl bg-surface-container-lowest hover:bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/40 flex flex-col items-center justify-center px-1 transition-all cursor-pointer active:scale-95"
        >
          <span className="font-label-sub-english text-sm sm:text-base font-bold leading-tight">
            {btnNewBill.main}
          </span>
          {btnNewBill.sub && (
            <span className="text-[11px] text-on-surface-variant leading-none">
              {btnNewBill.sub}
            </span>
          )}
        </button>

        {/* Purane Bill */}
        <button
          type="button"
          onClick={onOpenOldBills}
          className="h-14 min-h-[56px] rounded-xl bg-surface-container-lowest hover:bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/40 flex flex-col items-center justify-center px-1 transition-all cursor-pointer active:scale-95"
        >
          <span className="font-label-sub-english text-sm sm:text-base font-bold leading-tight">
            {btnOldBills.main}
          </span>
          {btnOldBills.sub && (
            <span className="text-[11px] text-on-surface-variant leading-none">
              {btnOldBills.sub}
            </span>
          )}
        </button>

        {/* Wapsi */}
        <button
          type="button"
          onClick={onOpenReturns}
          className="h-14 min-h-[56px] rounded-xl bg-surface-container-lowest hover:bg-surface-container-high text-on-surface shadow-sm border border-outline-variant/40 flex flex-col items-center justify-center px-1 transition-all cursor-pointer active:scale-95"
        >
          <span className="font-label-sub-english text-sm sm:text-base font-bold leading-tight">
            {btnReturns.main}
          </span>
          {btnReturns.sub && (
            <span className="text-[11px] text-on-surface-variant leading-none">
              {btnReturns.sub}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};

