import React from 'react';
import { type FastBillCartItem } from '../../logic/fastBill';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { t } from '../../i18n';

interface ConfirmCardViewProps {
  billNumberLabel: string;
  item: FastBillCartItem;
  itemIndex: number;
  totalItems: number;
  onUpdateQuantity: (qty: number) => void;
  onToggleUnit: () => void;
  onConfirmAndNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onRemoveItem: () => void;
  onChangeBatch: () => void;
}

export const ConfirmCardView: React.FC<ConfirmCardViewProps> = ({
  billNumberLabel,
  item,
  itemIndex,
  totalItems,
  onUpdateQuantity,
  onToggleUnit,
  onConfirmAndNext,
  onBack,
  onSkip,
  onRemoveItem,
  onChangeBatch,
}) => {
  const progressPct = totalItems > 0 ? Math.round(((itemIndex + 1) / totalItems) * 100) : 0;
  const isStrip = item.unitType === 'strip';
  const unitLabel = isStrip
    ? t('fast_bill.tile_wall.per_strip')
    : t('fast_bill.tile_wall.per_unit');

  return (
    <section className="w-full lg:w-[70%] h-full flex flex-col min-h-0">
      <div className="w-full h-full bg-surface-container-lowest rounded-2xl shadow-sm flex flex-col justify-between p-space-lg border border-outline-variant/30 gap-space-md overflow-y-auto">
        {/* Header & Progress */}
        <div className="flex flex-col gap-space-sm shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
              {billNumberLabel}
            </span>
            <span className="font-body-lg text-body-lg font-bold text-primary bg-surface-container-low px-space-md py-1 rounded-xl">
              {t('fast_bill.confirm_card.medicine_progress', {
                current: itemIndex + 1,
                total: totalItems,
              })}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            ></div>
          </div>
        </div>

        {/* Medicine Details Section */}
        <div className="flex flex-col md:flex-row items-center gap-space-lg bg-surface-container-low/60 p-space-lg rounded-2xl shrink-0">
          {/* Photo Placeholder (200x200px) */}
          <div className="w-36 h-36 md:w-[200px] md:h-[200px] rounded-xl overflow-hidden bg-surface-container-high flex-shrink-0 relative shadow-sm flex items-center justify-center">
            <div className="absolute inset-0 bg-primary/5 flex items-center justify-center pointer-events-none">
              <Icon name="medication" className="text-primary text-[56px] opacity-40" />
            </div>
            {item.isScheduleH && (
              <div className="absolute top-2 left-2 bg-[#C25700] text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                Rx Schedule H
              </div>
            )}
          </div>

          {/* Medicine Metadata */}
          <div className="flex flex-col justify-between h-auto md:h-[200px] py-1 flex-1 w-full gap-space-xs">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-numpad-number text-2xl md:text-3xl text-on-surface leading-tight font-extrabold tracking-tight">
                  {item.medicineName}
                </span>
                {item.shelf && (
                  <span className="px-space-md py-1 bg-surface-container-highest text-on-surface-variant font-body-lg text-body-lg font-bold rounded-lg shadow-xs shrink-0">
                    {t('fast_bill.confirm_card.shelf_label', { shelf: item.shelf })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-body-md text-body-md text-on-surface-variant font-medium">
                  {t('fast_bill.confirm_card.batch_exp', {
                    batch: item.batchNo,
                    exp: item.expiry,
                  })}
                </span>
                <button
                  type="button"
                  onClick={onChangeBatch}
                  className="px-2 py-0.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-md transition-colors"
                >
                  [B] {t('fast_bill.batch_modal.title')}
                </button>
              </div>
              {item.salt && (
                <span className="text-sm text-outline font-medium">{item.salt}</span>
              )}
            </div>

            <div className="flex items-baseline justify-between pt-space-xs border-t border-outline-variant/30 mt-2">
              <div className="flex items-center gap-space-xs text-primary font-headline-md text-headline-md font-bold">
                <Icon name="payments" className="text-[26px]" />
                <span>
                  {formatRupees(item.mrpPaise)}{' '}
                  {isStrip
                    ? t('fast_bill.tile_wall.per_strip')
                    : t('fast_bill.tile_wall.per_unit')}
                </span>
              </div>
              <span className="font-label-sub-english text-label-sub-english text-outline">
                {t('fast_bill.confirm_card.mrp_inclusive')}
              </span>
            </div>
          </div>
        </div>

        {/* Quantity / Verification Section */}
        <div className="flex flex-col md:flex-row items-center justify-between px-space-lg py-space-md bg-surface rounded-2xl gap-space-md shrink-0">
          {/* Scan Status */}
          <div className="flex items-center gap-space-md w-full md:w-auto">
            <div className="w-14 h-14 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center shadow-sm shrink-0">
              <Icon name="check_circle" className="text-[32px]" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md text-on-surface font-extrabold leading-tight">
                {t('fast_bill.confirm_card.scan_scanned', { count: item.quantity })}
              </span>
              <span className="font-label-sub-english text-label-sub-english text-primary font-medium flex items-center gap-1">
                <Icon name="qr_code_scanner" className="text-[18px]" />
                <span>
                  {t('fast_bill.confirm_card.scan_matched', { code: item.batchNo })}
                </span>
              </span>
            </div>
          </div>

          {/* Quantity Controls & Total */}
          <div className="flex items-center justify-between md:justify-end gap-space-lg w-full md:w-auto">
            {/* Unit Toggle */}
            <button
              type="button"
              onClick={onToggleUnit}
              className="h-14 px-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-sm flex flex-col items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Toggle Strip / Loose [L]"
            >
              <span>{isStrip ? 'Strip [L]' : 'Goli [L]'}</span>
              <span className="text-[11px] text-on-surface-variant font-normal">
                {isStrip ? `(${item.unitsPerPack} tabs)` : 'Loose'}
              </span>
            </button>

            {/* Stepper + Input */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdateQuantity(Math.max(1, item.quantity - 1))}
                className="w-12 h-14 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-95 text-on-surface font-black text-2xl flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                -
              </button>
              <div className="flex flex-col items-center">
                <input
                  id="quantity-input"
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      onUpdateQuantity(val);
                    }
                  }}
                  className="w-24 h-14 text-center font-display-total text-2xl md:text-3xl text-primary bg-surface-container-lowest rounded-xl shadow-xs border-3 border-primary outline-none focus:ring-4 focus:ring-primary/20 transition-all font-black"
                />
                <span className="text-xs text-on-surface-variant font-medium mt-0.5">
                  {unitLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onUpdateQuantity(item.quantity + 1)}
                className="w-12 h-14 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-95 text-on-surface font-black text-2xl flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                +
              </button>
            </div>

            {/* Big Total */}
            <div className="flex flex-col items-end pl-space-md shrink-0">
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant uppercase tracking-wider font-bold">
                {t('fast_bill.confirm_card.total_amount')}
              </span>
              <span className="font-display-total text-2xl md:text-3xl text-primary font-black leading-none tracking-tight">
                {formatRupees(item.lineTotalPaise)}
              </span>
            </div>
          </div>
        </div>

        {/* Big Confirm Trigger Button */}
        <div className="w-full shrink-0">
          <button
            type="button"
            onClick={onConfirmAndNext}
            className="w-full h-16 rounded-2xl bg-primary hover:bg-primary-container active:scale-[0.99] text-on-primary shadow-md flex items-center justify-between px-space-xl transition-all cursor-pointer"
          >
            <div className="flex items-center gap-space-sm">
              <Icon name="verified" className="text-[32px]" />
              <span className="font-button-text text-button-text tracking-wide">
                {t('fast_bill.confirm_card.confirm_and_next')}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-on-primary/20 px-space-md py-1.5 rounded-xl">
              <span className="font-label-sub-english text-label-sub-english font-bold">
                {t('fast_bill.confirm_card.press_enter')}
              </span>
            </div>
          </button>
        </div>

        {/* POS Keyboard Shortcuts Bar */}
        <div className="w-full shrink-0">
          <div className="flex flex-wrap items-center justify-between px-space-md py-2 rounded-xl bg-surface-container-high/60 gap-2">
            <button
              type="button"
              onClick={onConfirmAndNext}
              className="flex items-center gap-1.5 font-label-sub-english text-label-sub-english font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-bold rounded shadow-xs text-xs">
                Enter
              </kbd>
              <span>{t('fast_bill.shortcuts.enter_next')}</span>
            </button>

            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 font-label-sub-english text-label-sub-english font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-bold rounded shadow-xs text-xs">
                ←
              </kbd>
              <span>{t('fast_bill.shortcuts.left_back')}</span>
            </button>

            <button
              type="button"
              onClick={onSkip}
              className="flex items-center gap-1.5 font-label-sub-english text-label-sub-english font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-bold rounded shadow-xs text-xs">
                S
              </kbd>
              <span>{t('fast_bill.shortcuts.s_skip')}</span>
            </button>

            <button
              type="button"
              onClick={onToggleUnit}
              className="flex items-center gap-1.5 font-label-sub-english text-label-sub-english font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-bold rounded shadow-xs text-xs">
                L
              </kbd>
              <span>{t('fast_bill.shortcuts.l_loose')}</span>
            </button>

            <button
              type="button"
              onClick={onRemoveItem}
              className="flex items-center gap-1.5 font-label-sub-english text-label-sub-english font-medium text-error hover:opacity-80 transition-opacity cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-error text-on-error font-bold rounded shadow-xs text-xs">
                Delete
              </kbd>
              <span>{t('fast_bill.shortcuts.del_remove')}</span>
            </button>

            <button
              type="button"
              onClick={onChangeBatch}
              className="flex items-center gap-1.5 font-label-sub-english text-label-sub-english font-medium text-on-surface hover:text-primary transition-colors cursor-pointer"
            >
              <kbd className="px-2 py-0.5 bg-inverse-surface text-inverse-on-surface font-bold rounded shadow-xs text-xs">
                B
              </kbd>
              <span>{t('fast_bill.shortcuts.b_batch')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
