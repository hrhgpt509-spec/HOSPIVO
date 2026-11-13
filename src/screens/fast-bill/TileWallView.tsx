import React, { useState } from 'react';
import {
  type TopSellingMedicine,
  type FastBillCartItem,
  calculateFastBillTotals,
  togglePinnedMedicineId,
  getPinnedMedicineIds,
} from '../../logic/fastBill';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { t } from '../../i18n';

interface TileWallViewProps {
  topMedicines: TopSellingMedicine[];
  cartItems: FastBillCartItem[];
  onAddMedicine: (medicine: TopSellingMedicine) => void;
  onRemoveItem: (index: number) => void;
  onClearBill: () => void;
  onProceedToReviewOrCheckout: () => void;
  onScanOrCodeSubmit: (code: string) => void;
  onRefreshTop: () => void;
}

export const TileWallView: React.FC<TileWallViewProps> = ({
  topMedicines,
  cartItems,
  onAddMedicine,
  onRemoveItem,
  onClearBill,
  onProceedToReviewOrCheckout,
  onScanOrCodeSubmit,
  onRefreshTop,
}) => {
  const [typedCode, setTypedCode] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const pinnedIds = getPinnedMedicineIds();

  const totals = calculateFastBillTotals(cartItems);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedCode.trim()) return;
    onScanOrCodeSubmit(typedCode.trim());
    setTypedCode('');
  };

  const filteredMedicines = topMedicines.filter((m) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.trim().toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.genericName && m.genericName.toLowerCase().includes(q)) ||
      (m.shortCode && m.shortCode.toLowerCase().includes(q)) ||
      (m.shelf && m.shelf.toLowerCase().includes(q))
    );
  });

  const handleTogglePin = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    togglePinnedMedicineId(id);
    onRefreshTop();
  };

  return (
    <div className="flex flex-col lg:flex-row w-full h-full gap-space-md min-h-0">
      {/* LEFT / MAIN AREA (72% width) */}
      <div className="flex flex-col w-full lg:w-[72%] h-full justify-between gap-space-sm min-h-0">
        {/* Header & Quick Code Bar */}
        <div className="flex flex-col gap-space-xs shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-space-xs">
            <div className="flex flex-col">
              <h1 className="font-headline-lg text-xl md:text-2xl text-on-surface font-extrabold tracking-tight leading-none">
                {t('fast_bill.tile_wall.title')}
              </h1>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium mt-0.5">
                {t('fast_bill.tile_wall.subtitle')}
              </span>
            </div>
            <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-xs rounded-xl shadow-xs border border-outline-variant/30">
              <Icon name="touch_app" className="text-primary text-[22px]" />
              <span className="font-body-md text-sm md:text-base font-semibold text-primary">
                {t('fast_bill.tile_wall.single_tap_add')}
              </span>
            </div>
          </div>

          {/* Quick Search / Scan / Short Code Input */}
          <div className="flex flex-wrap md:flex-nowrap items-center gap-space-sm">
            <form onSubmit={handleCodeSubmit} className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value)}
                  placeholder={t('fast_bill.tile_wall.search_placeholder')}
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-surface-container-lowest border-2 border-outline-variant/60 font-body-md text-base text-on-surface outline-none focus:border-primary shadow-xs transition-colors"
                />
                <div className="absolute left-3 top-3 text-outline">
                  <Icon name="qr_code_scanner" className="text-[20px]" />
                </div>
              </div>
              <button
                type="submit"
                className="h-12 px-4 rounded-xl bg-primary hover:bg-primary-container active:scale-[0.99] text-on-primary font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Icon name="add" className="text-[20px]" />
                <span>Enter ↵</span>
              </button>
            </form>

            <div className="w-full md:w-56 relative shrink-0">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter wall..."
                className="w-full h-12 pl-9 pr-3 rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-sm text-on-surface outline-none focus:border-primary shadow-xs"
              />
              <div className="absolute left-3 top-3.5 text-outline">
                <Icon name="search" className="text-[18px]" />
              </div>
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-3 top-3 text-outline hover:text-error"
                >
                  <Icon name="cancel" className="text-[16px]" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Medicines Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {filteredMedicines.length === 0 ? (
            <div className="w-full h-64 flex flex-col items-center justify-center text-center p-space-lg bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
              <Icon name="search_off" className="text-outline text-[48px] mb-2" />
              <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                Dawai nahi mili
              </span>
              <span className="text-sm text-on-surface-variant mt-1">
                Bar code ya naya naam search karein
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-space-sm pb-2">
              {filteredMedicines.map((med) => {
                const isPinned = pinnedIds.includes(med.id);
                const isOut = med.inStockUnits <= 0;

                return (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => onAddMedicine(med)}
                    className={`group flex flex-col justify-between p-space-sm rounded-2xl shadow-xs hover:shadow-md transition-all active:scale-95 text-left min-h-[130px] border cursor-pointer relative overflow-hidden ${
                      isOut
                        ? 'bg-surface-container-low opacity-60 border-error/30'
                        : isPinned
                        ? 'bg-surface-container-lowest border-primary/50'
                        : 'bg-surface-container-lowest border-outline-variant/30 hover:border-primary/40'
                    }`}
                  >
                    {/* Top Row: Icon + Price Badge + Pin */}
                    <div className="flex items-start justify-between w-full">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
                          isOut
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-primary-fixed flex items-center justify-center text-on-primary-fixed'
                        }`}
                      >
                        <Icon
                          name={
                            med.category === 'Syrup'
                              ? 'liquor'
                              : med.category === 'Injection'
                              ? 'vaccines'
                              : 'medication'
                          }
                          className="text-[22px]"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="font-body-md text-sm md:text-base font-extrabold text-primary bg-primary-fixed-dim/20 px-2 py-0.5 rounded-lg">
                          {formatRupees(med.mrp)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleTogglePin(e, med.id)}
                          className={`p-1 rounded-md transition-colors ${
                            isPinned
                              ? 'text-primary'
                              : 'text-outline-variant hover:text-primary opacity-0 group-hover:opacity-100'
                          }`}
                          title={
                            isPinned
                              ? t('fast_bill.tile_wall.unpin_tile')
                              : t('fast_bill.tile_wall.pin_tile')
                          }
                        >
                          <Icon
                            name={isPinned ? 'star' : 'star_border'}
                            filled={isPinned}
                            className="text-[18px]"
                          />
                        </button>
                      </div>
                    </div>

                    {/* Middle / Bottom info */}
                    <div className="mt-2">
                      <h3 className="font-title-hinglish text-sm md:text-base text-on-surface font-bold leading-tight group-hover:text-primary transition-colors truncate">
                        {med.name}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-on-surface-variant mt-0.5">
                        <span className="truncate max-w-[120px]">
                          {med.genericName || med.shortCode || '—'}
                        </span>
                        {med.shelf && (
                          <span className="bg-surface-container px-1.5 py-0.5 rounded text-[11px] font-bold text-outline">
                            {med.shelf}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-medium mt-1">
                        {isOut ? (
                          <span className="text-error font-bold">Khatam</span>
                        ) : (
                          <span className="text-primary font-semibold">
                            {med.inStockPacks} pks ({med.inStockUnits} tabs)
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN (28% width - Live Bill Panel) */}
      <div className="flex flex-col w-full lg:w-[28%] h-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md justify-between border border-outline-variant/30 gap-space-sm min-h-0">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-space-xs shrink-0">
          <div className="flex items-center gap-space-xs">
            <Icon name="receipt_long" className="text-primary text-[28px]" />
            <div className="flex flex-col">
              <h2 className="font-headline-md text-lg md:text-xl text-on-surface font-bold leading-none">
                {t('fast_bill.tile_wall.live_bill')}
              </h2>
              <span className="font-label-sub-english text-xs text-on-surface-variant">
                {t('fast_bill.tile_wall.live_bill_sub')}
              </span>
            </div>
          </div>
          <div className="px-space-sm py-1 bg-primary-fixed rounded-full flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-label-sub-english text-xs font-bold text-on-primary-fixed">
              {t('fast_bill.tile_wall.items_badge', { count: cartItems.length })}
            </span>
          </div>
        </div>

        {/* Itemized Bill List */}
        <div className="flex flex-col gap-space-xs flex-1 overflow-y-auto py-space-xs my-space-xs pr-1 divide-y divide-surface-container-high min-h-0">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-space-md text-outline">
              <Icon name="shopping_cart" className="text-[36px] opacity-40 mb-2" />
              <span className="text-sm font-medium">Koi dawai nahi jodi</span>
              <span className="text-xs text-on-surface-variant mt-0.5">
                Tile tap karein ya scan karein
              </span>
            </div>
          ) : (
            cartItems.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-space-xs hover:bg-surface-container rounded-xl transition-colors pt-2"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-body-md text-sm md:text-base font-bold text-on-surface leading-snug truncate">
                    {item.medicineName}
                  </span>
                  <span className="font-label-sub-english text-xs text-on-surface-variant">
                    {item.quantity}{' '}
                    {item.unitType === 'strip'
                      ? t('fast_bill.tile_wall.per_strip')
                      : t('fast_bill.tile_wall.per_unit')}{' '}
                    · {item.batchNo}
                  </span>
                </div>
                <div className="flex items-center gap-space-xs shrink-0">
                  <span className="font-body-md text-sm md:text-base font-extrabold text-on-surface">
                    {formatRupees(item.lineTotalPaise)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(idx)}
                    className="text-on-surface-variant hover:text-error transition-colors p-1"
                    title="Remove item"
                  >
                    <Icon name="cancel" className="text-[20px]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Financial Calculation Block */}
        <div className="shrink-0 flex flex-col gap-space-xs pt-space-xs border-t border-outline-variant/30">
          {/* Summary Card */}
          <div className="flex flex-col bg-surface rounded-xl p-space-sm gap-1">
            <div className="flex justify-between items-center">
              <span className="font-label-sub-english text-xs text-on-surface-variant">
                {t('fast_bill.tile_wall.live_bill_sub')}
              </span>
              <span className="font-label-sub-english text-xs text-on-surface-variant font-medium">
                Net Amount
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-headline-md text-base md:text-lg text-on-surface font-extrabold">
                Total:
              </span>
              <span className="font-display-total text-2xl md:text-3xl text-primary font-black tracking-tight leading-none">
                {formatRupees(totals.totalPaise)}
              </span>
            </div>
          </div>

          {/* Primary Action Button: "Bill Banao" */}
          <button
            type="button"
            disabled={cartItems.length === 0}
            onClick={onProceedToReviewOrCheckout}
            className="w-full h-16 rounded-2xl bg-[#1B8F4A] hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed text-on-primary flex items-center justify-center gap-space-sm shadow-md active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Icon name="receipt" className="text-[32px] text-white" />
            <div className="flex flex-col items-start leading-none">
              <span className="font-title-hinglish text-title-hinglish font-bold text-white tracking-wide">
                {t('fast_bill.tile_wall.make_bill')}
              </span>
              <span className="font-label-sub-english text-xs text-on-primary-container font-medium mt-0.5">
                {t('fast_bill.tile_wall.make_bill_sub')} (Enter ↵)
              </span>
            </div>
          </button>

          {/* Quick Clear Cart */}
          <div className="flex justify-between items-center px-1 pt-1">
            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={onClearBill}
              className="flex items-center gap-1 font-label-sub-english text-xs text-on-surface-variant hover:text-error disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Icon name="delete_sweep" className="text-[18px]" />
              <span>{t('fast_bill.tile_wall.clear_bill')}</span>
            </button>
            <span className="font-label-sub-english text-xs text-on-surface-variant">
              Rush Mode Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
