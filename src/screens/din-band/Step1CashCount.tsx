import React, { useState, useCallback } from 'react';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { formatRupees, rupeesToPaise } from '../../logic/money';
import { useNumpadKeyboard } from '../../logic/useNumpadKeyboard';
import {
  DENOMINATION_VALUES,
  computeDenominationTotalPaise,
  type DenominationCounts,
} from '../../logic/dinBand';

interface Step1CashCountProps {
  openingCashStr: string;
  onChangeOpeningCashStr: (val: string) => void;
  denominations: DenominationCounts;
  onChangeDenominations: (next: DenominationCounts) => void;
  directCashStr: string;
  onChangeDirectCashStr: (val: string) => void;
  countMode: 'denominations' | 'direct';
  onChangeCountMode: (mode: 'denominations' | 'direct') => void;
  countedCashPaise: number;
  expectedCashPaise: number;
  onBack: () => void;
  onNext: () => void;
}

type DenomKey = Exclude<keyof DenominationCounts, 'coinsRupees'>;

export const Step1CashCount: React.FC<Step1CashCountProps> = ({
  openingCashStr,
  onChangeOpeningCashStr,
  denominations,
  onChangeDenominations,
  directCashStr,
  onChangeDirectCashStr,
  countMode,
  onChangeCountMode,
  countedCashPaise,
  expectedCashPaise,
  onBack,
  onNext,
}) => {
  const { t } = useTranslation();
  const [, setFocusedField] = useState<'direct' | 'none'>('none');

  const denomTotals = computeDenominationTotalPaise(denominations);
  const isExactMatch = countedCashPaise === expectedCashPaise;

  const updateDenom = (key: keyof DenominationCounts, raw: number) => {
    const clean = Math.max(0, Math.floor(raw || 0));
    onChangeCountMode('denominations');
    onChangeDenominations({
      ...denominations,
      [key]: clean,
    });
  };

  const handleNumpadDigit = useCallback(
    (digit: string) => {
      onChangeCountMode('direct');
      const next =
        countMode !== 'direct' || directCashStr === '0'
          ? digit
          : directCashStr.length >= 7
            ? directCashStr
            : directCashStr + digit;
      onChangeDirectCashStr(next);
    },
    [countMode, directCashStr, onChangeCountMode, onChangeDirectCashStr]
  );

  const handleNumpadBackspace = useCallback(() => {
    onChangeCountMode('direct');
    if (countMode !== 'direct') {
      const currentRupeesStr = String(Math.round(countedCashPaise / 100));
      onChangeDirectCashStr(
        currentRupeesStr.length <= 1 ? '0' : currentRupeesStr.slice(0, -1)
      );
      return;
    }
    onChangeDirectCashStr(
      directCashStr.length <= 1 ? '0' : directCashStr.slice(0, -1)
    );
  }, [countMode, countedCashPaise, directCashStr, onChangeCountMode, onChangeDirectCashStr]);

  const handleNumpadClear = useCallback(() => {
    onChangeCountMode('direct');
    onChangeDirectCashStr('0');
  }, [onChangeCountMode, onChangeDirectCashStr]);

  useNumpadKeyboard({
    onDigit: handleNumpadDigit,
    onBackspace: handleNumpadBackspace,
    onClear: handleNumpadClear,
    onEnter: onNext,
  });

  const backBtn = tButton('suppliers.btn_back');
  const nextBtn = tButton('din_band.btn_next_milan');

  return (
    <div className="flex flex-col flex-1 justify-between gap-space-sm min-h-0">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md flex-1 min-h-0">
        {/* LEFT COLUMN: Opening Cash + Note Denomination Counter */}
        <div className="lg:col-span-6 bg-surface-container-lowest rounded-2xl shadow-sm p-space-md flex flex-col justify-between gap-3 border border-outline-variant/30">
          {/* Opening Cash Row */}
          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/40 flex items-center justify-between gap-3">
            <label className="font-title-hinglish text-base font-bold text-on-surface flex items-center gap-2">
              <Icon name="savings" className="text-primary text-2xl" />
              <span>{t('din_band.opening_cash_label')}</span>
            </label>
            <input
              type="number"
              min={0}
              value={openingCashStr}
              onChange={(e) => onChangeOpeningCashStr(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={() => setFocusedField('none')}
              className="w-36 h-12 px-3 text-right rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface font-headline-md text-xl font-extrabold focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Header & Mode Switch */}
          <div className="flex items-center justify-between">
            <span className="font-title-hinglish text-lg text-on-surface font-bold">
              {t('din_band.mode_denominations')}
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeCountMode(countMode === 'denominations' ? 'direct' : 'denominations')
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                countMode === 'denominations'
                  ? 'bg-primary-fixed text-on-primary-fixed'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <Icon name="calculate" className="text-base" />
              <span>
                {countMode === 'denominations'
                  ? t('din_band.mode_denominations')
                  : t('din_band.mode_direct')}
              </span>
            </button>
          </div>

          {/* Denomination Rows (2000, 500, 200, 100, 50, 20, 10, Coins) */}
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[380px] pr-1">
            {DENOMINATION_VALUES.map((val) => {
              const key = `d${val}` as DenomKey;
              const qty = denominations[key];
              const lineTotal = rupeesToPaise(qty * val);
              return (
                <div
                  key={val}
                  className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low transition-colors gap-2"
                >
                  <span className="w-24 font-bold text-on-surface text-base shrink-0">
                    {t('din_band.note_label', { val })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateDenom(key, qty - 1)}
                      className="w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-container-high font-extrabold text-lg text-on-surface flex items-center justify-center cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={qty === 0 ? '' : String(qty)}
                      placeholder="0"
                      onChange={(e) =>
                        updateDenom(key, Number(e.target.value.replace(/[^0-9]/g, '')))
                      }
                      className="w-16 h-10 text-center rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => updateDenom(key, qty + 1)}
                      className="w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-container-high font-extrabold text-lg text-on-surface flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-28 text-right font-bold text-on-surface text-base shrink-0">
                    {formatRupees(lineTotal)}
                  </span>
                </div>
              );
            })}

            {/* Coins in Rs */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container-low/60 gap-2">
              <span className="font-bold text-on-surface text-base">
                {t('din_band.coins_label')}
              </span>
              <input
                type="number"
                min={0}
                value={denominations.coinsRupees === 0 ? '' : String(denominations.coinsRupees)}
                placeholder="0"
                onChange={(e) =>
                  updateDenom('coinsRupees', Number(e.target.value.replace(/[^0-9]/g, '')))
                }
                className="w-28 h-10 px-3 text-right rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Denomination Total Strip */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-container text-on-surface">
            <div className="flex items-center gap-2">
              <Icon name="payments" className="text-primary text-2xl" />
              <span className="font-bold text-sm sm:text-base">
                {t('din_band.total_notes_summary', { count: denomTotals.noteCount })}
              </span>
            </div>
            <span className="font-title-hinglish text-lg font-extrabold text-primary">
              {formatRupees(denomTotals.totalPaise)}
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Grand Total Display Card + Large 3x4 Numpad */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-space-sm">
          {/* Gina hua cash Total Display Card */}
          <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-space-md border border-outline-variant/40 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-title-hinglish text-xl text-on-surface font-bold">
                  {t('din_band.counted_cash_title')}
                </span>
                <span className="text-sm text-on-surface-variant">
                  {t('din_band.counted_cash_sub')}
                </span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
                <Icon name="account_balance_wallet" className="text-[26px]" />
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/40">
              <span className="font-display-total text-[36px] sm:text-[44px] text-primary font-black tracking-tight leading-none">
                {formatRupees(countedCashPaise)}
              </span>
              {isExactMatch && (
                <span className="px-3 py-1 rounded-lg bg-primary-fixed text-on-primary-fixed font-bold text-xs sm:text-sm">
                  {t('din_band.diff_exact')}
                </span>
              )}
            </div>
          </div>

          {/* Tactile Numpad Grid */}
          <div className="grid grid-cols-3 gap-2 flex-1 min-h-[260px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleNumpadDigit(digit)}
                className="min-h-[60px] rounded-xl bg-surface-container-lowest hover:bg-surface-container shadow-sm border border-outline-variant/30 flex items-center justify-center font-numpad-number text-2xl sm:text-[32px] font-bold text-on-surface transition-all active:translate-y-0.5 cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleNumpadClear}
              className="min-h-[60px] rounded-xl bg-surface-container-low hover:bg-surface-container-high shadow-sm border border-outline-variant/30 flex flex-col items-center justify-center text-error transition-all active:translate-y-0.5 cursor-pointer"
            >
              <span className="text-2xl sm:text-[28px] font-extrabold leading-none">C</span>
              <span className="text-xs text-on-surface-variant font-medium">
                {tButton('common.btn_clear').main}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleNumpadDigit('0')}
              className="min-h-[60px] rounded-xl bg-surface-container-lowest hover:bg-surface-container shadow-sm border border-outline-variant/30 flex items-center justify-center font-numpad-number text-2xl sm:text-[32px] font-bold text-on-surface transition-all active:translate-y-0.5 cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleNumpadBackspace}
              aria-label={t('common.backspace')}
              className="min-h-[60px] rounded-xl bg-surface-container-low hover:bg-surface-container-high shadow-sm border border-outline-variant/30 flex items-center justify-center text-on-surface transition-all active:translate-y-0.5 cursor-pointer"
            >
              <Icon name="backspace" className="text-[28px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between pt-2 gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-14 min-h-[56px] px-space-lg rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface shadow-sm border border-outline-variant/40 flex items-center gap-2 transition-all cursor-pointer"
        >
          <Icon name="arrow_back" className="text-[26px] text-on-surface-variant" />
          <div className="flex flex-col text-left leading-none">
            <span className="font-button-text text-lg font-bold">{backBtn.main}</span>
            {backBtn.sub && (
              <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="h-14 min-h-[56px] px-space-xl rounded-xl bg-primary hover:bg-primary-container text-on-primary shadow-lg flex items-center gap-3 transition-all cursor-pointer"
        >
          <div className="flex flex-col text-right leading-none">
            <span className="font-button-text text-lg font-bold">{nextBtn.main}</span>
            {nextBtn.sub && (
              <span className="text-xs text-primary-fixed pt-0.5">{nextBtn.sub}</span>
            )}
          </div>
          <Icon name="arrow_forward" className="text-[26px]" />
        </button>
      </div>
    </div>
  );
};

