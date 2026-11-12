import React from 'react';
import type { Medicine } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { formatRupees } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import { formatMedicineStock } from '../../logic/medicineSearch';

interface MedicineCatalogPanelProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  totalMedicinesCount: number;
  filteredMedicines: Medicine[];
  validStockMap: Record<number, number>;
  onSelectMedicine: (med: Medicine) => void;
  onReturnHome: () => void;
}

export const MedicineCatalogPanel: React.FC<MedicineCatalogPanelProps> = ({
  searchInputRef,
  searchQuery,
  onSearchChange,
  onSearchKeyDown,
  totalMedicinesCount,
  filteredMedicines,
  validStockMap,
  onSelectMedicine,
  onReturnHome,
}) => {
  const { t } = useTranslation();
  const returnHomeBtn = tButton('home.return_home_btn');

  return (
    <div className="lg:col-span-7 flex flex-col gap-space-md min-h-0 h-full">
      {/* Big Auto-Focused Search Input Card */}
      <div className="h-[60px] shrink-0 bg-surface-container-lowest rounded-2xl shadow-sm px-space-md flex items-center justify-between border-2 border-primary/40 focus-within:border-primary focus-within:shadow-md transition-all">
        <div className="flex items-center gap-space-sm flex-1 min-w-0">
          <Icon name="search" className="text-primary text-[28px] shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            {...textFieldProps('free', searchQuery, onSearchChange)}
            onKeyDown={onSearchKeyDown}
            placeholder={t('dawai_becho.search_placeholder')}
            className="w-full bg-transparent border-none outline-none font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label={tButton('common.btn_clear').main}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant cursor-pointer shrink-0"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          )}
        </div>

        <button
          type="button"
          aria-label={t('dawai_becho.scan_aria')}
          onClick={() => searchInputRef.current?.focus()}
          className="w-11 h-11 rounded-xl bg-surface-container flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-colors cursor-pointer shrink-0 ml-2"
        >
          <Icon name="barcode_scanner" className="text-[26px]" />
        </button>
      </div>

      {/* Search Results List (rows >= 60px tall) */}
      <div className="flex flex-col gap-space-sm flex-1 overflow-y-auto min-h-0 pr-0.5">
        {totalMedicinesCount === 0 ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <EmptyState
              title={t('dawai_becho.empty_medicines_title')}
              subtitle={t('dawai_becho.empty_medicines_sub')}
              actionLabel={returnHomeBtn.main}
              actionSubLabel={returnHomeBtn.sub}
              onAction={onReturnHome}
              hintText=""
            />
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-10 text-center text-on-surface-variant border border-outline-variant/40">
            <Icon name="search_off" className="text-[44px] text-outline mb-2" />
            <p className="font-title-hinglish font-bold text-on-surface">
              {t('dawai_becho.no_search_results')}
            </p>
          </div>
        ) : (
          filteredMedicines.map((med) => {
            const stockUnits = med.id ? validStockMap[med.id] || 0 : 0;
            const isOut = stockUnits <= 0;
            const stockDisplay = formatMedicineStock(
              stockUnits,
              med.unitsPerPack,
              t('medicine.pack_unit'),
              t('medicine.loose_unit')
            );

            return (
              <div
                key={med.id || med.shortCode || med.name}
                onClick={() => onSelectMedicine(med)}
                className={`min-h-[74px] py-2.5 bg-surface-container-lowest rounded-2xl shadow-sm px-space-md sm:px-space-lg flex items-center justify-between gap-3 cursor-pointer transition-all border shrink-0 ${
                  isOut
                    ? 'border-error/30 hover:bg-error-container/15'
                    : 'border-outline-variant/30 hover:bg-surface-container-low'
                }`}
              >
                <div className="flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold leading-tight truncate">
                      {med.name} {med.strength}
                    </span>
                    {(med.scheduleType === 'H' || med.scheduleType === 'H1') && (
                      <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed text-xs font-bold">
                        {t('dawai_becho.sch_badge', { type: med.scheduleType })}
                      </span>
                    )}
                    {isOut && (
                      <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container text-xs font-bold">
                        {t('dawai_becho.out_of_stock_badge')}
                      </span>
                    )}
                  </div>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant mt-0.5">
                    {med.shelf ? `${med.shelf} ${t('dawai_becho.shelf_suffix')} · ` : ''}
                    <span className={isOut ? 'text-error font-bold' : ''}>{stockDisplay}</span>
                    {' · '}
                    <span className="font-bold text-primary">{formatRupees(med.mrpPaise)}</span>
                  </span>
                </div>

                <button
                  type="button"
                  aria-label={`Add ${med.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMedicine(med);
                  }}
                  className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    isOut
                      ? 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error'
                      : 'bg-surface-container-high text-primary hover:bg-primary hover:text-on-primary'
                  }`}
                >
                  <Icon name={isOut ? 'swap_horiz' : 'add'} className="text-[28px]" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

