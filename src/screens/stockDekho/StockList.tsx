import React, { useState, useMemo } from 'react';
import type { Medicine, DBUser, Shop } from '../../db';
import { useTranslation } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { EmptyState } from '../../components/EmptyState';
import { textFieldProps } from '../../logic/format';
import { searchMedicines, formatMedicineStock } from '../../logic/medicineSearch';
import { filterStockSummaries, type StockFilter, type MedicineStockSummary } from '../../logic/stockDekho';
import { useIsCompactViewport } from '../../logic/useViewport';

interface StockListProps {
  stockSummaries: MedicineStockSummary[];
  onSelectMedicine: (medicine: Medicine) => void;
  onOpenShoppingList: () => void;
  onReturnHome: () => void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const StockList: React.FC<StockListProps> = ({
  stockSummaries,
  onSelectMedicine,
  onOpenShoppingList,
  onReturnHome,
  currentUser,
  shop,
  theme,
  onToggleTheme,
}) => {
  const { t, shouldShowSub } = useTranslation();
  const { name: hookShopName } = useShop();
  const [activeFilter, setActiveFilter] = useState<StockFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Counts for the 3 tabs
  const allCount = stockSummaries.length;
  const lowCount = useMemo(
    () => stockSummaries.filter((s) => s.status === 'low').length,
    [stockSummaries]
  );
  const outCount = useMemo(
    () => stockSummaries.filter((s) => s.status === 'out').length,
    [stockSummaries]
  );

  // Apply tab filter first
  const tabFilteredSummaries = useMemo(() => {
    return filterStockSummaries(
      stockSummaries.map((s) => ({
        ...s,
        minStockUnits: s.medicine.minStockUnits ?? 0,
      })),
      activeFilter
    );
  }, [stockSummaries, activeFilter]);

  // Search filter
  const displayedSummaries = useMemo(() => {
    if (!searchQuery.trim()) {
      return tabFilteredSummaries;
    }
    const matchingMeds = searchMedicines(
      tabFilteredSummaries.map((s) => s.medicine),
      searchQuery
    );
    const matchingIds = new Set(matchingMeds.map((m) => m.id));
    return tabFilteredSummaries.filter((s) => s.medicine.id !== undefined && matchingIds.has(s.medicine.id));
  }, [tabFilteredSummaries, searchQuery]);

  const shopName = hookShopName || shop?.name || '';
  const userRole = currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier');
  const userName = currentUser?.name || userRole;

  const tabAll = {
    main: t('stock_dekho.tab_all.main'),
    sub: t('stock_dekho.tab_all.sub'),
  };
  const tabLow = {
    main: t('stock_dekho.tab_low.main'),
    sub: t('stock_dekho.tab_low.sub'),
  };
  const tabOut = {
    main: t('stock_dekho.tab_out.main'),
    sub: t('stock_dekho.tab_out.sub'),
  };
  const shoppingListBtn = {
    main: t('stock_dekho.btn_shopping_list.main'),
    sub: t('stock_dekho.btn_shopping_list.sub'),
  };

  const isCompactViewport = useIsCompactViewport();

  if (isCompactViewport) {
    return (
      <div className="w-full min-h-dvh bg-surface font-body-md text-on-surface antialiased flex flex-col overflow-x-hidden select-none">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-40 bg-surface-container-lowest/95 backdrop-blur-md border-b border-outline-variant/30 px-3 py-2.5 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onReturnHome}
              aria-label={t('common.btn_home.main')}
              className="min-w-[48px] min-h-[48px] rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer shrink-0"
              type="button"
            >
              <Icon name="arrow_back" className="text-[24px]" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="font-title-hinglish font-bold text-base text-on-surface truncate">
                {t('stock_dekho.screen_title')}
              </h1>
              <span className="text-xs text-on-surface-variant truncate">
                {t('stock_dekho.items_count', { count: displayedSummaries.length })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onOpenShoppingList}
              type="button"
              className="min-h-[48px] px-3 rounded-xl bg-tertiary-fixed text-tertiary font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Icon name="local_shipping" className="text-[20px]" />
              <span>{shoppingListBtn.main}</span>
              {lowCount + outCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-tertiary text-on-tertiary text-[10px] font-bold">
                  {lowCount + outCount}
                </span>
              )}
            </button>

            <button
              onClick={onToggleTheme}
              aria-label={t('common.toggle_theme')}
              className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
              type="button"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
            </button>
          </div>
        </header>

        {/* Search Bar */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative w-full min-h-[52px] flex items-center">
            <div className="absolute left-3.5 flex items-center pointer-events-none text-outline">
              <Icon name="search" className="text-[22px]" />
            </div>
            <input
              {...textFieldProps('free', searchQuery, setSearchQuery)}
              id="compactStockSearchInput"
              placeholder={t('stock_dekho.search_placeholder')}
              className="w-full h-[52px] pl-11 pr-11 bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/40 shadow-xs text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
                type="button"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            ) : (
              <div className="absolute right-3.5 text-outline pointer-events-none">
                <Icon name="barcode_scanner" className="text-[22px] text-primary" />
              </div>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-3 pb-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveFilter('all')}
            className={`min-h-[48px] px-4 rounded-full font-bold text-xs flex items-center gap-2 shrink-0 cursor-pointer transition-colors ${
              activeFilter === 'all'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30'
            }`}
            type="button"
          >
            <span>{tabAll.main}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] ${
                activeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-surface-container text-on-surface'
              }`}
            >
              {allCount}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('low')}
            className={`min-h-[48px] px-4 rounded-full font-bold text-xs flex items-center gap-2 shrink-0 cursor-pointer transition-colors ${
              activeFilter === 'low'
                ? 'bg-tertiary text-on-tertiary shadow-xs'
                : 'bg-surface-container-lowest text-tertiary border border-outline-variant/30'
            }`}
            type="button"
          >
            <Icon name="warning" className="text-[16px]" filled />
            <span>{tabLow.main}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] ${
                activeFilter === 'low' ? 'bg-white/20 text-white' : 'bg-surface-container text-tertiary'
              }`}
            >
              {lowCount}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('out')}
            className={`min-h-[48px] px-4 rounded-full font-bold text-xs flex items-center gap-2 shrink-0 cursor-pointer transition-colors ${
              activeFilter === 'out'
                ? 'bg-error text-on-error shadow-xs'
                : 'bg-surface-container-lowest text-error border border-outline-variant/30'
            }`}
            type="button"
          >
            <Icon name="block" className="text-[16px]" filled />
            <span>{tabOut.main}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] ${
                activeFilter === 'out' ? 'bg-white/20 text-white' : 'bg-surface-container text-error'
              }`}
            >
              {outCount}
            </span>
          </button>
        </div>

        {/* Medicine List */}
        <div className="flex-1 px-3 pb-6 flex flex-col gap-2">
          {displayedSummaries.length === 0 ? (
            <div className="my-8">
              <EmptyState title={t('stock_dekho.empty_title')} subtitle={t('stock_dekho.empty_sub')} hintText="" />
            </div>
          ) : (
            displayedSummaries.map((summary) => {
              const med = summary.medicine;
              const formattedStock = formatMedicineStock(
                summary.currentStockUnits,
                med.unitsPerPack || 1,
                t('medicine.packs_unit'),
                t('medicine.loose_unit')
              );
              return (
                <div
                  key={med.id}
                  onClick={() => onSelectMedicine(med)}
                  className="w-full min-h-[60px] p-3 bg-surface-container-lowest hover:bg-surface-container-low rounded-2xl shadow-xs border border-outline-variant/30 flex items-center justify-between gap-2.5 cursor-pointer active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        summary.status === 'low'
                          ? 'bg-tertiary-fixed text-tertiary'
                          : summary.status === 'out'
                          ? 'bg-error-container text-error'
                          : 'bg-surface-container text-primary'
                      }`}
                    >
                      <Icon
                        name={
                          summary.status === 'low'
                            ? 'warning'
                            : summary.status === 'out'
                            ? 'block'
                            : 'medication'
                        }
                        className="text-[20px]"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-on-surface truncate">
                          {med.name}
                          {med.strength ? ` ${med.strength}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium mt-0.5 truncate">
                        <span
                          className={
                            summary.status === 'out'
                              ? 'text-error font-bold'
                              : summary.status === 'low'
                              ? 'text-tertiary font-bold'
                              : 'text-primary font-bold'
                          }
                        >
                          {formattedStock}
                        </span>
                        {med.shelf && (
                          <>
                            <span>•</span>
                            <span className="truncate">{med.shelf}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {summary.status === 'out' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-error-container text-error">
                        {t('stock_dekho.badge_out_of_stock')}
                      </span>
                    )}
                    {summary.status === 'low' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-tertiary-fixed text-tertiary">
                        {t('stock_dekho.badge_low_stock')}
                      </span>
                    )}
                    <Icon name="chevron_right" className="text-outline text-[22px]" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col select-none">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30">
        <div className="h-20 w-full max-w-[1440px] mx-auto px-gutter flex items-center justify-between">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-sm cursor-pointer" onClick={onReturnHome}>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <Icon name="local_pharmacy" className="text-on-primary text-[24px]" />
              </div>
              <span className="font-headline-md text-headline-md font-bold tracking-tight text-primary">
                {t('common.app_name')}
              </span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-outline-variant" />
            <div className="hidden sm:flex flex-col">
              <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight">
                {shopName}
              </span>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none">
                {t('common.counter_pos')}
              </span>
            </div>
            <div className="hidden md:inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container border border-outline-variant">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface font-semibold">
                {t('common.local_mode')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-xs sm:gap-space-md">
            <button
              onClick={onReturnHome}
              className="px-3 sm:px-space-md py-2 transition-all bg-primary-container text-on-primary-container font-bold rounded-lg shadow-sm flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <Icon name="home" className="text-[20px]" />
              <span className="hidden xs:inline sm:inline">{t('common.btn_home.main')}</span>
            </button>

            <button
              onClick={onToggleTheme}
              aria-label={t('common.toggle_theme')}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer"
              type="button"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
            </button>

            <FullscreenButton />

            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="hidden sm:flex flex-col text-right">
                <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight">
                  {userName}
                </span>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none">
                  {userRole}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Icon name="person" className="text-on-primary text-[18px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-20 bg-surface flex-1">
        <div className="flex flex-col w-full px-gutter py-space-sm max-w-[1360px] mx-auto select-none">
          {/* 1. Header Row */}
          <div className="flex flex-wrap items-baseline justify-between gap-y-2 mb-space-sm">
            <div className="flex items-baseline gap-space-sm">
              <h1 className="font-display-total text-[28px] sm:text-[32px] leading-[36px] sm:leading-[38px] font-extrabold text-on-surface tracking-tight">
                {t('stock_dekho.screen_title')}
              </h1>
              {shouldShowSub(t('stock_dekho.screen_title'), t('stock_dekho.screen_sub')) && (
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                  {t('stock_dekho.screen_sub')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-space-md">
              <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sub-english text-label-sub-english">
                <Icon name="inventory_2" className="text-[20px] text-primary" filled />
                <span className="font-bold text-on-surface">
                  {t('stock_dekho.items_count', { count: displayedSummaries.length })}
                </span>
                <span className="text-outline">·</span>
                <span>{t('stock_dekho.updated_now')}</span>
              </div>

              {/* Shopping List Button */}
              <button
                onClick={onOpenShoppingList}
                type="button"
                className="h-[44px] px-space-md rounded-xl bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed-dim transition-all flex items-center gap-space-xs shadow-sm cursor-pointer"
              >
                <Icon name="local_shipping" className="text-[20px] text-tertiary" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish text-sm font-bold text-tertiary">
                    {shoppingListBtn.main}
                  </span>
                  {shouldShowSub(shoppingListBtn.main, shoppingListBtn.sub) && (
                    <span className="text-[11px] text-on-tertiary-fixed-variant">
                      {shoppingListBtn.sub}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* 2. Large Search Box */}
          <div className="relative w-full h-[60px] mb-space-sm">
            <div className="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none">
              <Icon name="search" className="text-outline text-[28px]" />
            </div>
            <input
              {...textFieldProps('free', searchQuery, setSearchQuery)}
              autoFocus
              className="w-full h-full pl-[56px] pr-[116px] sm:pr-[140px] bg-surface-container-lowest text-on-surface font-title-hinglish text-title-hinglish rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-primary/40 border border-outline-variant/30 transition-all placeholder:text-outline placeholder:font-normal"
              id="stockSearchInput"
              placeholder={t('stock_dekho.search_placeholder')}
              type="text"
            />
            <div className="absolute inset-y-0 right-3 flex items-center gap-space-xs">
              <button
                className="h-[44px] px-space-sm flex items-center gap-space-xs bg-surface-container hover:bg-surface-container-high rounded-xl text-on-surface transition-colors cursor-pointer"
                title={t('stock_dekho.btn_scan')}
                type="button"
                onClick={() => {
                  const input = document.getElementById('stockSearchInput');
                  if (input) input.focus();
                }}
              >
                <Icon name="barcode_scanner" className="text-primary text-[22px]" />
                <span className="font-label-sub-english text-label-sub-english font-bold">
                  {t('stock_dekho.btn_scan')}
                </span>
              </button>
            </div>
          </div>

          {/* 3. Filter Tabs */}
          <div className="grid grid-cols-3 gap-2 sm:gap-space-md mb-space-sm">
            {/* Sab (All items) */}
            <button
              className={`min-h-[54px] px-2.5 sm:px-space-md py-1.5 rounded-2xl shadow-sm flex items-center justify-between gap-1 transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low border border-outline-variant/30'
              }`}
              onClick={() => setActiveFilter('all')}
              type="button"
            >
              <div className="flex items-center gap-1.5 sm:gap-space-sm min-w-0">
                <Icon name="apps" className="hidden sm:inline-flex text-[24px] shrink-0" />
                <div className="flex flex-col text-left leading-none min-w-0">
                  <span className="font-title-hinglish text-sm sm:text-title-hinglish font-bold truncate">
                    {tabAll.main}
                  </span>
                  {shouldShowSub(tabAll.main, tabAll.sub) && (
                    <span className="font-label-sub-english text-[11px] sm:text-label-sub-english opacity-90 mt-0.5 truncate">
                      {tabAll.sub}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`font-title-hinglish text-xs sm:text-title-hinglish font-bold px-2 sm:px-2.5 py-0.5 rounded-lg shrink-0 ${
                  activeFilter === 'all' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container text-on-surface'
                }`}
              >
                {allCount}
              </span>
            </button>

            {/* Kam Stock */}
            <button
              className={`min-h-[54px] px-2.5 sm:px-space-md py-1.5 rounded-2xl shadow-sm flex items-center justify-between gap-1 transition-all cursor-pointer ${
                activeFilter === 'low'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low border border-outline-variant/30'
              }`}
              onClick={() => setActiveFilter('low')}
              type="button"
            >
              <div className="flex items-center gap-1.5 sm:gap-space-sm min-w-0">
                <div className="hidden sm:flex w-8 h-8 rounded-xl bg-tertiary-fixed items-center justify-center text-tertiary shrink-0">
                  <Icon name="warning" className="text-[20px]" filled />
                </div>
                <div className="flex flex-col text-left leading-none min-w-0">
                  <span
                    className={`font-title-hinglish text-sm sm:text-title-hinglish font-bold truncate ${
                      activeFilter === 'low' ? 'text-on-primary' : 'text-tertiary'
                    }`}
                  >
                    {tabLow.main}
                  </span>
                  {shouldShowSub(tabLow.main, tabLow.sub) && (
                    <span
                      className={`font-label-sub-english text-[11px] sm:text-label-sub-english mt-0.5 truncate ${
                        activeFilter === 'low' ? 'opacity-90' : 'text-on-surface-variant'
                      }`}
                    >
                      {tabLow.sub}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`font-title-hinglish text-xs sm:text-title-hinglish font-bold px-2 sm:px-2.5 py-0.5 rounded-lg shrink-0 ${
                  activeFilter === 'low' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container text-tertiary'
                }`}
              >
                {lowCount}
              </span>
            </button>

            {/* Khatam */}
            <button
              className={`min-h-[54px] px-2.5 sm:px-space-md py-1.5 rounded-2xl shadow-sm flex items-center justify-between gap-1 transition-all cursor-pointer ${
                activeFilter === 'out'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low border border-outline-variant/30'
              }`}
              onClick={() => setActiveFilter('out')}
              type="button"
            >
              <div className="flex items-center gap-1.5 sm:gap-space-sm min-w-0">
                <div className="hidden sm:flex w-8 h-8 rounded-xl bg-error-container flex items-center justify-center text-error shrink-0">
                  <Icon name="block" className="text-[20px]" filled />
                </div>
                <div className="flex flex-col text-left leading-none min-w-0">
                  <span
                    className={`font-title-hinglish text-sm sm:text-title-hinglish font-bold truncate ${
                      activeFilter === 'out' ? 'text-on-primary' : 'text-error'
                    }`}
                  >
                    {tabOut.main}
                  </span>
                  {shouldShowSub(tabOut.main, tabOut.sub) && (
                    <span
                      className={`font-label-sub-english text-[11px] sm:text-label-sub-english mt-0.5 truncate ${
                        activeFilter === 'out' ? 'opacity-90' : 'text-on-surface-variant'
                      }`}
                    >
                      {tabOut.sub}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`font-title-hinglish text-xs sm:text-title-hinglish font-bold px-2 sm:px-2.5 py-0.5 rounded-lg shrink-0 ${
                  activeFilter === 'out' ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container text-error'
                }`}
              >
                {outCount}
              </span>
            </button>
          </div>

          {/* 4. Medicine Rows (strictly >= 60px height each, 72px tall in design) */}
          {displayedSummaries.length === 0 ? (
            <div className="my-8">
              <EmptyState title={t('stock_dekho.empty_title')} subtitle={t('stock_dekho.empty_sub')} hintText="" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5" id="medicineList">
              {displayedSummaries.map((summary) => {
                const med = summary.medicine;
                const formattedStock = formatMedicineStock(
                  summary.currentStockUnits,
                  med.unitsPerPack || 1,
                  t('medicine.packs_unit'),
                  t('medicine.loose_unit')
                );

                const statusBadge = (() => {
                  if (summary.status === 'out') {
                    return (
                      <span className="font-label-sub-english text-label-sub-english font-bold px-3 py-1 rounded-full bg-error-container text-error">
                        {t('stock_dekho.badge_out_of_stock')}
                      </span>
                    );
                  }
                  if (summary.status === 'low') {
                    return (
                      <span className="font-label-sub-english text-label-sub-english font-bold px-3 py-1 rounded-full bg-tertiary-fixed text-tertiary">
                        {t('stock_dekho.badge_low_stock')}
                      </span>
                    );
                  }
                  return (
                    <span className="font-label-sub-english text-label-sub-english font-bold px-3 py-1 rounded-full bg-surface-container text-primary">
                      {t('stock_dekho.badge_in_stock')}
                    </span>
                  );
                })();

                return (
                  <div
                    key={med.id}
                    onClick={() => onSelectMedicine(med)}
                    className="medicine-card group w-full min-h-[60px] py-2 sm:py-0 sm:h-[72px] px-space-sm sm:px-space-lg bg-surface-container-lowest hover:bg-surface-container-low/70 rounded-2xl shadow-sm border border-outline-variant/20 flex items-center justify-between gap-2 cursor-pointer transition-all duration-150 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-space-sm sm:gap-space-md min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          summary.status === 'low'
                            ? 'bg-tertiary-fixed text-tertiary group-hover:bg-tertiary group-hover:text-on-tertiary'
                            : summary.status === 'out'
                            ? 'bg-error-container text-error'
                            : 'bg-surface-container text-primary group-hover:bg-primary group-hover:text-on-primary'
                        }`}
                      >
                        <Icon
                          name={
                            summary.status === 'low'
                              ? 'warning'
                              : summary.status === 'out'
                              ? 'block'
                              : 'medication'
                          }
                          className="text-[22px]"
                        />
                      </div>

                      <div className="flex flex-col justify-center min-w-0">
                        <div className="flex items-center gap-space-xs">
                          <span className="font-title-hinglish text-title-hinglish font-bold text-on-surface truncate">
                            {med.name}
                            {med.strength ? ` ${med.strength}` : ''}
                          </span>
                          {summary.status === 'low' && (
                            <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
                          )}
                          {summary.status === 'out' && (
                            <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                          )}
                        </div>
                        <span className="font-body-md text-body-md text-on-surface-variant font-medium leading-tight truncate">
                          {med.shelf
                            ? t('stock_dekho.total_stock_at_shelf', {
                                stock: formattedStock,
                                shelf: med.shelf,
                              })
                            : t('stock_dekho.total_stock_no_shelf', {
                                stock: formattedStock,
                              })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-space-sm pl-space-md shrink-0">
                      {statusBadge}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:bg-surface-container transition-colors">
                        <Icon
                          name="chevron_right"
                          className="text-outline group-hover:text-primary text-[24px] transition-transform group-hover:translate-x-0.5"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
