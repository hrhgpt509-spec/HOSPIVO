import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { DBUser, Shop, Supplier } from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { EmptyState } from '../components/EmptyState';
import { formatRupees } from '../logic/money';
import { canSeePurchasePrice } from '../logic/roles';
import { formatMedicineStock } from '../logic/medicineSearch';
import {
  loadExpiryDashboardData,
  type ExpiryBatchItem,
  type ExpiryLossSummary,
  type ExpiryTabBucket,
  type SupplierReturnView,
} from '../logic/expiry';
import { SupplierReturnModal } from './expiry/SupplierReturnModal';
import { SupplierReturnsTracker } from './expiry/SupplierReturnsTracker';

interface ExpiryProps {
  onReturnHome: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Expiry: React.FC<ExpiryProps> = ({
  onReturnHome,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t, language } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [activeTab, setActiveTab] = useState<ExpiryTabBucket>('30');
  const [viewMode, setViewMode] = useState<'list' | 'tracker'>('list');

  const [items, setItems] = useState<ExpiryBatchItem[]>([]);
  const [lossSummary, setLossSummary] = useState<ExpiryLossSummary | null>(null);
  const [returns, setReturns] = useState<SupplierReturnView[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [returnTarget, setReturnTarget] = useState<ExpiryBatchItem | null>(null);

  const isOwnerUser = canSeePurchasePrice(currentUser);
  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await loadExpiryDashboardData(currentUser);
      setItems(data.items);
      setLossSummary(data.lossSummary);
      setReturns(data.returns);
      setSuppliers(data.suppliers);
    } catch (err) {
      console.error('Failed to load expiry data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const countsByBucket = useMemo(() => {
    const counts: Record<ExpiryTabBucket, number> = {
      '30': 0,
      '60': 0,
      '90': 0,
      expired: 0,
    };
    for (const item of items) {
      counts[item.bucket] += 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(
    () => items.filter((item) => item.bucket === activeTab),
    [items, activeTab]
  );

  const pendingReturnsCount = useMemo(
    () => returns.filter((r) => r.status === 'pending' || r.status === 'sent').length,
    [returns]
  );

  const formatMonthLabel = (year: number, month: number): string => {
    try {
      const dt = new Date(year, month - 1, 1);
      const locale = language === 'hi' ? 'hi-IN-u-nu-latn' : 'en-IN';
      return new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(dt);
    } catch {
      return `${String(month).padStart(2, '0')}/${year}`;
    }
  };

  if (viewMode === 'tracker') {
    return (
      <SupplierReturnsTracker
        returns={returns}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnHome={onReturnHome}
        onBack={() => setViewMode('list')}
        onUpdated={refreshData}
      />
    );
  }

  const homeBtn = tButton('home.return_home_btn');
  const trackerBtn = tButton('expiry.btn_return_tracker');
  const tab30Btn = tButton('expiry.tab_30');
  const tab60Btn = tButton('expiry.tab_60');
  const tab90Btn = tButton('expiry.tab_90');
  const tabExpBtn = tButton('expiry.tab_expired');
  const blockedBadge = tButton('expiry.blocked_badge');
  const returnSupplierBtn = tButton('expiry.btn_return_to_supplier');
  const backBtn = tButton('suppliers.btn_back');

  const showOwnerLoss = isOwnerUser && lossSummary !== null;

  return (
    <div className="w-full min-h-screen bg-background font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg min-w-0">
            <div className="flex items-center gap-space-sm shrink-0">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm">
                <Icon name="local_pharmacy" className="text-[24px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-md text-headline-md tracking-tight text-primary leading-none font-extrabold">
                  HOSPIVO
                </span>
                <span className="text-xs text-on-surface-variant font-medium">
                  {t('expiry.page_title')}
                </span>
              </div>
            </div>

            {shopName && (
              <>
                <div className="hidden md:block h-8 w-[2px] bg-surface-container-highest" />
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface leading-snug truncate font-bold">
                    {shopName}
                  </span>
                  <div className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
                    <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                    <span>{modeLabel}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="home" className="text-[20px]" />
              <div className="flex flex-col leading-tight text-left">
                <span className="text-sm sm:text-base font-bold">{homeBtn.main}</span>
                {homeBtn.sub && (
                  <span className="text-[11px] opacity-85 hidden sm:inline">{homeBtn.sub}</span>
                )}
              </div>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer" />

            <div className="hidden sm:flex items-center gap-space-sm pl-space-xs py-1 pr-space-sm rounded-lg bg-surface-container-low">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="font-title-hinglish text-sm font-bold text-on-surface">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-20 flex-1 bg-background flex flex-col">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto flex-1 justify-between px-gutter py-space-md gap-space-md">
          <div className="flex flex-col gap-space-md flex-1 min-h-0">
            {/* Title Bar + Return Tracker Button + Critical Stat Pill */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-space-md">
                <div className="w-14 h-14 rounded-2xl bg-error flex items-center justify-center text-on-error shadow-sm shrink-0">
                  <Icon name="event_busy" className="text-[32px]" />
                </div>
                <div className="flex flex-col">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface leading-tight font-extrabold">
                    {t('expiry.page_title')}
                  </h1>
                  <p className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {t('expiry.page_sub')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-space-sm">
                {/* 30-day critical pill */}
                <div className="flex items-center gap-space-sm bg-surface-container px-space-md py-2 rounded-2xl shadow-sm">
                  <Icon name="crisis_alert" className="text-error text-[26px]" />
                  <div className="flex flex-col text-left sm:text-right">
                    <span className="font-title-hinglish text-base sm:text-lg text-on-surface font-bold leading-tight">
                      {t('expiry.critical_window_stat', { count: countsByBucket['30'] })}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {t('expiry.critical_window_sub')}
                    </span>
                  </div>
                </div>

                {/* Supplier Return Tracker Navigation Button */}
                <button
                  type="button"
                  onClick={() => setViewMode('tracker')}
                  className="h-14 min-h-[56px] px-space-md rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/60 text-on-surface shadow-sm flex items-center gap-space-sm cursor-pointer transition-all"
                >
                  <Icon name="local_shipping" className="text-[26px] text-primary" />
                  <div className="flex flex-col text-left leading-none">
                    <span className="font-title-hinglish text-base font-bold text-on-surface">
                      {trackerBtn.main}
                    </span>
                    {trackerBtn.sub && (
                      <span className="text-xs text-on-surface-variant pt-0.5">
                        {trackerBtn.sub}
                      </span>
                    )}
                  </div>
                  <span className="ml-1 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-sm font-extrabold">
                    {pendingReturnsCount > 0 ? pendingReturnsCount : returns.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Four Big Colour-Coded Tabs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm sm:gap-space-md shrink-0">
              {/* Tab 1: 30 din (Red) */}
              <button
                type="button"
                onClick={() => setActiveTab('30')}
                className={`min-h-[76px] rounded-2xl p-space-sm flex items-center justify-between transition-all active:scale-[0.98] text-left cursor-pointer ${
                  activeTab === '30'
                    ? 'bg-error-container text-on-error-container shadow-md ring-2 ring-error'
                    : 'bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-error text-on-error flex items-center justify-center shrink-0">
                    <Icon name="alarm_on" className="text-[26px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-title-hinglish text-lg sm:text-xl font-bold leading-none truncate">
                      {tab30Btn.main}
                    </span>
                    {tab30Btn.sub && (
                      <span className="text-xs opacity-85 pt-1 truncate">{tab30Btn.sub}</span>
                    )}
                  </div>
                </div>
                <div
                  className={`px-2.5 py-1 rounded-xl font-title-hinglish text-lg font-extrabold shrink-0 ${
                    activeTab === '30'
                      ? 'bg-error text-on-error'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {countsByBucket['30']}
                </div>
              </button>

              {/* Tab 2: 60 din (Orange) */}
              <button
                type="button"
                onClick={() => setActiveTab('60')}
                className={`min-h-[76px] rounded-2xl p-space-sm flex items-center justify-between transition-all active:scale-[0.98] text-left cursor-pointer ${
                  activeTab === '60'
                    ? 'bg-tertiary-fixed text-on-tertiary-fixed shadow-md ring-2 ring-tertiary'
                    : 'bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0">
                    <Icon name="warning" className="text-[26px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-title-hinglish text-lg sm:text-xl font-bold leading-none truncate">
                      {tab60Btn.main}
                    </span>
                    {tab60Btn.sub && (
                      <span className="text-xs opacity-85 pt-1 truncate">{tab60Btn.sub}</span>
                    )}
                  </div>
                </div>
                <div
                  className={`px-2.5 py-1 rounded-xl font-title-hinglish text-lg font-extrabold shrink-0 ${
                    activeTab === '60'
                      ? 'bg-tertiary text-on-tertiary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {countsByBucket['60']}
                </div>
              </button>

              {/* Tab 3: 90 din (Early warning Yellow) */}
              <button
                type="button"
                onClick={() => setActiveTab('90')}
                className={`min-h-[76px] rounded-2xl p-space-sm flex items-center justify-between transition-all active:scale-[0.98] text-left cursor-pointer ${
                  activeTab === '90'
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-100 shadow-md ring-2 ring-amber-500'
                    : 'bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shrink-0">
                    <Icon name="schedule" className="text-[26px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-title-hinglish text-lg sm:text-xl font-bold leading-none truncate">
                      {tab90Btn.main}
                    </span>
                    {tab90Btn.sub && (
                      <span className="text-xs opacity-85 pt-1 truncate">{tab90Btn.sub}</span>
                    )}
                  </div>
                </div>
                <div
                  className={`px-2.5 py-1 rounded-xl font-title-hinglish text-lg font-extrabold shrink-0 ${
                    activeTab === '90'
                      ? 'bg-amber-500 text-amber-950'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {countsByBucket['90']}
                </div>
              </button>

              {/* Tab 4: Expire ho gaya (Black / Dark Slate) */}
              <button
                type="button"
                onClick={() => setActiveTab('expired')}
                className={`min-h-[76px] rounded-2xl p-space-sm flex items-center justify-between transition-all active:scale-[0.98] text-left cursor-pointer ${
                  activeTab === 'expired'
                    ? 'bg-inverse-surface text-inverse-on-surface shadow-md ring-2 ring-error'
                    : 'bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-error text-on-error flex items-center justify-center shrink-0">
                    <Icon name="block" className="text-[26px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-title-hinglish text-lg sm:text-xl font-bold leading-none truncate">
                      {tabExpBtn.main}
                    </span>
                    {tabExpBtn.sub && (
                      <span className="text-xs opacity-80 pt-1 truncate">{tabExpBtn.sub}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-error text-on-error font-title-hinglish text-lg font-extrabold shrink-0">
                  {countsByBucket.expired > 0 && (
                    <span className="w-2 h-2 rounded-full bg-on-error animate-ping" />
                  )}
                  <span>{countsByBucket.expired}</span>
                </div>
              </button>
            </div>

            {/* Split Content: List (8 cols for Owner, 12 cols for Staff) + Owner-Only Loss Summary (4 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md flex-1 min-h-0">
              {/* Left Section: Batch List */}
              <div
                className={`${
                  showOwnerLoss ? 'lg:col-span-8' : 'lg:col-span-12'
                } flex flex-col gap-space-xs min-h-0`}
              >
                {isLoading ? (
                  <div className="p-8 rounded-2xl bg-surface-container-lowest text-center text-on-surface-variant font-semibold">
                    {t('stock_dekho.loading_stock')}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="py-6">
                    <EmptyState
                      title={t('expiry.empty_bucket_title')}
                      subtitle={t('expiry.empty_bucket_sub')}
                      icon={activeTab === 'expired' ? 'verified' : 'event_available'}
                    />
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isExp = item.bucket === 'expired';
                    const badgeClass =
                      item.bucket === 'expired' || item.bucket === '30'
                        ? 'bg-error-container text-on-error-container'
                        : item.bucket === '60'
                          ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                          : 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-100';

                    const iconWrapClass =
                      item.bucket === 'expired' || item.bucket === '30'
                        ? 'bg-error-container text-error'
                        : item.bucket === '60'
                          ? 'bg-tertiary-fixed text-tertiary'
                          : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300';

                    return (
                      <div
                        key={item.batchId}
                        className="min-h-[72px] bg-surface-container-lowest rounded-2xl px-space-md py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:shadow-md transition-shadow border border-outline-variant/30"
                      >
                        <div className="flex items-center gap-space-md min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconWrapClass}`}
                          >
                            <Icon
                              name={isExp ? 'block' : 'medication'}
                              className="text-[24px]"
                            />
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-title-hinglish text-lg sm:text-xl text-on-surface font-bold leading-tight truncate">
                                {item.medicineName} {item.medicineStrength}
                              </span>
                              {isExp ? (
                                <span
                                  className={`px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 ${badgeClass}`}
                                >
                                  <span>{blockedBadge.main}</span>
                                  {blockedBadge.sub && (
                                    <span className="opacity-80 font-medium">
                                      · {blockedBadge.sub}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-xs sm:text-sm font-bold ${badgeClass}`}
                                >
                                  {item.daysRemaining === 0
                                    ? t('expiry.days_left_today')
                                    : t('expiry.days_left_badge', { days: item.daysRemaining })}
                                </span>
                              )}
                            </div>

                            <span className="text-sm sm:text-base text-on-surface-variant leading-tight mt-1">
                              {t('expiry.batch_prefix')} {item.batchNo} · {t('expiry.exp_prefix')}{' '}
                              {item.expiryMonthYear} ·{' '}
                              <strong className="text-on-surface">
                                {formatMedicineStock(
                                  item.qtyUnits,
                                  item.unitsPerPack,
                                  t('medicine.packs_unit'),
                                  t('medicine.loose_unit')
                                )}
                              </strong>
                              {item.shelf
                                ? ` · ${t('expiry.shelf_suffix', { shelf: item.shelf })}`
                                : ''}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setReturnTarget(item)}
                          className="h-14 min-h-[56px] sm:min-w-[220px] px-space-md rounded-2xl bg-primary hover:bg-primary-container text-on-primary shadow-sm active:translate-y-0.5 transition-all flex items-center justify-center gap-space-sm shrink-0 cursor-pointer"
                        >
                          <Icon name="assignment_return" className="text-[26px]" />
                          <div className="flex flex-col items-start leading-none text-left">
                            <span className="font-title-hinglish text-base sm:text-lg text-on-primary font-bold">
                              {returnSupplierBtn.main}
                            </span>
                            {returnSupplierBtn.sub && (
                              <span className="text-xs text-on-primary/80 pt-0.5">
                                {returnSupplierBtn.sub}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Section: Owner-Only Monthly Expiry Loss Card (26b_Expiry_Expired.html) */}
              {showOwnerLoss && (
                <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl shadow-sm p-space-md border border-outline-variant/40 flex flex-col justify-between gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-space-sm mb-space-sm pb-space-xs border-b border-outline-variant/30">
                      <div className="w-10 h-10 rounded-lg bg-error-container text-error flex items-center justify-center shrink-0">
                        <Icon name="trending_down" className="text-[24px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-headline-md text-xl text-on-surface font-bold leading-tight">
                          {t('expiry.loss_card_title')}
                        </span>
                        <span className="text-xs sm:text-sm text-on-surface-variant">
                          {t('expiry.loss_card_sub')}
                        </span>
                      </div>
                    </div>

                    {lossSummary.months.length === 0 ? (
                      <div className="p-4 rounded-xl bg-surface-container-low text-sm text-on-surface-variant font-medium text-center">
                        {t('expiry.loss_none')}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
                        {lossSummary.months.map((m) => (
                          <div
                            key={m.yearMonth}
                            className="h-14 px-space-sm rounded-xl bg-surface-container-low flex items-center justify-between shrink-0"
                          >
                            <div className="flex items-center gap-space-xs min-w-0">
                              <Icon
                                name="calendar_month"
                                className="text-on-surface-variant text-[20px]"
                              />
                              <span className="font-body-lg text-base sm:text-lg text-on-surface font-semibold truncate">
                                {formatMonthLabel(m.year, m.month)}
                              </span>
                            </div>
                            <span className="font-title-hinglish text-lg text-error font-bold shrink-0">
                              {formatRupees(m.lossPaise)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Highlight Total Loss Box */}
                  <div className="p-space-sm rounded-xl bg-error-container text-on-error-container flex items-center justify-between">
                    <div className="flex items-center gap-space-xs">
                      <Icon name="report_problem" className="text-[26px] text-error" />
                      <span className="font-title-hinglish text-lg font-bold text-on-error-container">
                        {t('expiry.loss_total_label')}
                      </span>
                    </div>
                    <span className="font-headline-lg text-2xl font-extrabold text-error">
                      {formatRupees(lossSummary.totalLossPaise)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Bar: Owner-Only Loss Reminder + Back Button */}
          <div className="min-h-[64px] w-full bg-surface-container-lowest rounded-2xl shadow-sm px-space-lg py-2.5 flex flex-wrap items-center justify-between gap-3 border border-outline-variant/30 shrink-0">
            {showOwnerLoss ? (
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center text-error shrink-0">
                  <Icon name="history" className="text-[24px]" />
                </div>
                <span className="font-title-hinglish text-base sm:text-xl text-on-surface font-bold">
                  {t('expiry.loss_footer_label')}{' '}
                  <span className="text-error">{formatRupees(lossSummary.totalLossPaise)}</span>
                </span>
              </div>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onReturnHome}
              className="h-14 min-h-[56px] px-space-lg rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface shadow-sm active:translate-y-0.5 transition-all flex items-center gap-space-xs shrink-0 cursor-pointer"
            >
              <Icon name="arrow_back" className="text-[26px] text-on-surface" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-title-hinglish text-lg font-bold text-on-surface">
                  {backBtn.main}
                </span>
                {backBtn.sub && (
                  <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </main>

      {/* Supplier Return Confirmation Modal */}
      <SupplierReturnModal
        isOpen={returnTarget !== null}
        item={returnTarget}
        suppliers={suppliers}
        currentUser={currentUser}
        onClose={() => setReturnTarget(null)}
        onSaved={() => {
          setReturnTarget(null);
          void refreshData();
        }}
      />
    </div>
  );
};
