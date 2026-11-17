import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { textFieldProps } from '../../logic/format';

export type BillDiscountMode = 'percent' | 'paise';

interface BillDiscountRowProps {
  appliedPercent: number;
  appliedPaise: number;
  subtotalPaise: number;
  requiresApproval: boolean;
  onApply: (mode: BillDiscountMode, value: number) => void;
  onRemove: () => void;
}

/** "12.5" -> 1250 (whole paise, no floating point). Returns null if not a valid amount. */
export function rupeesTextToPaise(text: string): number | null {
  const clean = text.trim();
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === '' || clean === '.') return null;
  const [whole, frac = ''] = clean.split('.');
  return Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
}

function paiseToText(paise: number): string {
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

export const BillDiscountRow: React.FC<BillDiscountRowProps> = ({
  appliedPercent,
  appliedPaise,
  subtotalPaise,
  requiresApproval,
  onApply,
  onRemove,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<BillDiscountMode>('paise');
  const [text, setText] = useState('');

  // Keep the box in step with the discount that is really applied (hold/resume, new bill, etc.)
  useEffect(() => {
    if (appliedPaise > 0) {
      setMode('paise');
      setText(paiseToText(appliedPaise));
    } else if (appliedPercent > 0) {
      setMode('percent');
      setText(String(appliedPercent));
    } else {
      setText('');
    }
  }, [appliedPercent, appliedPaise]);

  const hasApplied = appliedPaise > 0 || appliedPercent > 0;

  const handleApply = () => {
    if (text.trim() === '') {
      onRemove();
      return;
    }
    if (mode === 'percent') {
      const pct = Number(text);
      if (!Number.isFinite(pct) || pct <= 0) {
        onRemove();
        return;
      }
      onApply('percent', Math.min(100, pct));
    } else {
      const paise = rupeesTextToPaise(text);
      if (paise === null || paise <= 0) {
        onRemove();
        return;
      }
      onApply('paise', Math.min(subtotalPaise, paise));
    }
  };

  const modeBtn = (value: BillDiscountMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`h-11 min-w-[44px] px-3 rounded-lg text-sm font-bold cursor-pointer transition-colors ${
        mode === value
          ? 'bg-primary text-on-primary'
          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2 px-2 pb-1">
      <span className="text-xs font-bold text-on-surface-variant shrink-0">
        {t('dawai_becho.bill_disc_row_label')}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {modeBtn('paise', t('dawai_becho.bill_disc_mode_rs'))}
        {modeBtn('percent', t('dawai_becho.bill_disc_mode_pct'))}
      </div>
      <input
        {...textFieldProps('free', text, (val) => setText(val.replace(/[^0-9.]/g, '')))}
        type="text"
        inputMode="decimal"
        placeholder="0"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
          }
        }}
        className="h-11 min-w-0 flex-1 px-3 text-right rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={handleApply}
        className="h-11 px-3 rounded-lg bg-primary text-on-primary text-sm font-bold cursor-pointer active:scale-95 transition-all shrink-0"
      >
        {t('dawai_becho.bill_disc_apply')}
      </button>
      {hasApplied && (
        <button
          type="button"
          onClick={onRemove}
          className="h-11 px-3 rounded-lg bg-surface-container text-on-surface-variant text-sm font-bold cursor-pointer hover:bg-surface-container-high shrink-0"
        >
          {t('dawai_becho.bill_disc_remove')}
        </button>
      )}
      {requiresApproval && hasApplied && (
        <span className="text-[11px] font-bold text-tertiary shrink-0">
          {t('dawai_becho.bill_disc_needs_pin')}
        </span>
      )}
    </div>
  );
};
