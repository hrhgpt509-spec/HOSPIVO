import React, { useState, useEffect } from 'react';
import { type SubstituteMedicineInfo } from '../../logic/billing';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { t } from '../../i18n';

interface OutOfStockModalProps {
  isOpen: boolean;
  medicineName: string;
  salt?: string;
  substitutes: SubstituteMedicineInfo[];
  onSelectSubstitute: (substitute: SubstituteMedicineInfo) => void;
  onSkip: () => void;
}

export const OutOfStockModal: React.FC<OutOfStockModalProps> = ({
  isOpen,
  medicineName,
  salt,
  substitutes,
  onSelectSubstitute,
  onSkip,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [substitutes]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (substitutes.length > 0 && substitutes[selectedIndex]) {
          onSelectSubstitute(substitutes[selectedIndex]);
        } else {
          onSkip();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(substitutes.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const num = parseInt(e.key, 10) - 1;
        if (num >= 0 && num < substitutes.length) {
          setSelectedIndex(num);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, substitutes, selectedIndex, onSelectSubstitute, onSkip]);

  if (!isOpen) return null;

  const currentSelected = substitutes[selectedIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-space-md">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden border-t sm:border border-outline-variant/40 flex flex-col animate-in fade-in zoom-in-95 max-h-[92dvh] sm:max-h-[90dvh]">
        {/* Danger Banner */}
        <div className="w-full bg-error-container text-on-error-container p-4 sm:p-space-md flex flex-wrap items-center justify-between gap-2.5 shadow-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-error text-on-error flex items-center justify-center shrink-0 shadow-xs">
              <Icon name="error" filled className="text-[28px] sm:text-[32px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-md text-base sm:text-xl font-bold leading-tight break-words">
                {t('fast_bill.out_of_stock.banner_title', { name: medicineName })}
              </span>
              <span className="font-label-sub-english text-xs opacity-90 break-words">
                {salt || 'Medicine out of stock'}
              </span>
            </div>
          </div>
          <div className="px-space-sm py-1 bg-on-error-container/10 rounded-lg text-on-error-container font-label-sub-english text-xs font-bold shrink-0">
            {t('fast_bill.out_of_stock.zero_stock')}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-space-lg flex flex-col gap-space-md overflow-y-auto flex-1 min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-outline-variant/20">
            <span className="font-headline-md text-base md:text-lg text-on-surface font-bold">
              {t('fast_bill.out_of_stock.substitutes_callout')}
            </span>
            {salt && (
              <span className="font-label-sub-english text-xs text-primary font-bold break-words">
                {t('fast_bill.out_of_stock.generic_salt', { salt })}
              </span>
            )}
          </div>

          {substitutes.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant flex flex-col items-center justify-center">
              <Icon name="medication" className="text-[44px] opacity-40 mb-2" />
              <p className="text-base font-bold text-on-surface">
                Koi alternative uplabdh nahi hai
              </p>
              <p className="text-xs text-outline mt-1">
                Is composition ki doosri dawai stock mein nahi hai.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-space-sm" role="radiogroup">
              {substitutes.slice(0, 5).map((sub, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedIndex(idx)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    className={`cursor-pointer min-h-[76px] py-3 rounded-xl px-3.5 sm:px-space-lg flex items-center justify-between gap-2.5 shadow-xs transition-all border min-w-0 ${
                      isSelected
                        ? 'bg-surface-container-low ring-2 ring-primary border-primary shadow-sm'
                        : 'bg-surface border-outline-variant/30 hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-title-hinglish font-bold text-sm ${
                          isSelected
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {isSelected ? (
                          <Icon name="check" filled className="text-[20px]" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-headline-md text-sm sm:text-lg text-on-surface font-bold leading-tight break-words">
                            {sub.name}
                          </span>
                          {sub.strength && (
                            <span className="text-xs text-outline font-medium">
                              {sub.strength}
                            </span>
                          )}
                        </div>
                        <span className="font-label-sub-english text-xs text-on-surface-variant break-words">
                          {sub.shelf
                            ? t('fast_bill.out_of_stock.on_shelf', { shelf: sub.shelf })
                            : ''}{' '}
                          · {t('fast_bill.out_of_stock.available_pcs', { count: sub.stockUnits })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1 text-right shrink-0">
                      <span className="font-headline-md text-base sm:text-xl text-primary font-bold whitespace-nowrap">
                        {formatRupees(sub.mrpPaise)}
                      </span>
                      <span className="font-label-sub-english text-xs text-on-surface-variant whitespace-nowrap">
                        / {t('fast_bill.tile_wall.per_strip')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Buttons & Shortcuts Area */}
        <div className="px-4 sm:px-space-lg pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-container-low/50 border-t border-outline-variant/30 flex flex-col gap-space-sm shrink-0">
          <div className="grid grid-cols-12 gap-2.5 sm:gap-space-md">
            {/* Skip Button */}
            <button
              type="button"
              onClick={onSkip}
              className="col-span-5 sm:col-span-4 min-h-[56px] py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:translate-y-0.5 text-on-surface flex items-center justify-center gap-2 px-3 shadow-xs transition-all cursor-pointer min-w-0"
            >
              <Icon name="fast_forward" className="text-[22px] sm:text-[24px] text-on-surface-variant shrink-0" />
              <div className="flex flex-col items-start leading-tight min-w-0">
                <span className="font-title-hinglish text-sm font-bold text-on-surface truncate max-w-full">
                  {t('fast_bill.out_of_stock.skip')}
                </span>
                <span className="font-label-sub-english text-[11px] text-on-surface-variant pt-0.5 truncate max-w-full">
                  {t('fast_bill.out_of_stock.skip_sub')}
                </span>
              </div>
            </button>

            {/* Primary Green Chuno Button */}
            <button
              type="button"
              disabled={substitutes.length === 0}
              onClick={() => {
                if (currentSelected) {
                  onSelectSubstitute(currentSelected);
                } else {
                  onSkip();
                }
              }}
              className="col-span-7 sm:col-span-8 min-h-[56px] py-2 rounded-xl bg-primary hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-0.5 text-on-primary flex items-center justify-between gap-2 px-3 sm:px-space-lg shadow-md transition-all cursor-pointer min-w-0"
            >
              <div className="flex items-center gap-2 sm:gap-space-sm min-w-0 flex-1">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-on-primary/20 flex items-center justify-center shrink-0">
                  <Icon name="check_circle" filled className="text-[22px] sm:text-[26px] text-on-primary" />
                </div>
                <div className="flex flex-col items-start leading-tight text-left min-w-0">
                  <span className="font-button-text text-sm sm:text-lg text-on-primary font-bold truncate max-w-full">
                    {t('fast_bill.out_of_stock.choose', {
                      name: currentSelected?.name || 'Item',
                    })}
                  </span>
                  <span className="font-label-sub-english text-[11px] sm:text-xs text-primary-fixed pt-0.5 truncate max-w-full">
                    {t('fast_bill.out_of_stock.select_sub')}
                  </span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 bg-black/20 px-space-sm py-1.5 rounded-lg text-on-primary text-xs font-bold shrink-0">
                <span>Press ENTER ↵</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

