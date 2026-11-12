import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, type DBUser, type Shop } from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { EmptyState } from '../components/EmptyState';
import { formatRupees } from '../logic/money';
import { isOwner } from '../logic/roles';
import {
  computeOwnerDashboardMetrics,
  type OwnerDashboardMetrics,
  type ReportPreset,
} from '../logic/reports';

interface OwnerDashboardProps {
  onReturnHome: () => void;
  onBackToOwnerMenu: () => void;
  onOpenReports?: () => void;
  onOpenAuditLog?: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  onReturnHome,
  onBackToOwnerMenu,
  onOpenReports,
  onOpenAuditLog,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [preset, setPreset] = useState<ReportPreset>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [metrics, setMetrics] = useState<OwnerDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const ownerAllowed = isOwner(currentUser);
  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || t('common.role_owner');

  const refreshMetrics = useCallback(async () => {
    if (!ownerAllowed) {
      setMetrics(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [
        bills,
        billItems,
        billReturns,
        udhaarPayments,
        customers,
        medicines,
        batches,
        stockMovements,
        dailyClosings,
      ] = await Promise.all([
        db.bills.toArray(),
        db.billItems.toArray(),
        db.billReturns.toArray(),
        db.udhaarPayments.toArray(),
        db.customers.toArray(),
        db.medicines.toArray(),
        db.batches.toArray(),
        db.stockMovements.toArray(),
        db.dailyClosings.toArray(),
      ]);

      const computed = computeOwnerDashboardMetrics({
        user: currentUser,
        bills,
        billItems,
        billReturns,
        udhaarPayments,
        customers,
        medicines,
        batches,
        stockMovements,
        dailyClosings,
        range: { preset, startDate, endDate },
      });
      setMetrics(computed);
    } catch (err) {
      console.error('Failed to compute dashboard metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [ownerAllowed, currentUser, preset, startDate, endDate]);

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  const splitPercentages = useMemo(() => {
    if (!metrics) return { cash: 0, upi: 0, udhaar: 0 };
    const sum = metrics.cashSalesPaise + metrics.upiSalesPaise + metrics.udhaarSalesPaise;
    if (sum <= 0) return { cash: 0, upi: 0, udhaar: 0 };
    const cash = Math.round((metrics.cashSalesPaise / sum) * 100);
    const upi = Math.round((metrics.upiSalesPaise / sum) * 100);
    const udhaar = Math.max(0, 100 - cash - upi);
    return { cash, upi, udhaar };
  }, [metrics]);

  const homeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('suppliers.btn_back');
  const reportsBtn = tButton('owner_dashboard.btn_open_reports');
  const auditBtn = tButton('owner_dashboard.btn_open_audit');

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md min-w-0">
            <span className="text-primary font-headline-md text-2xl font-extrabold tracking-tight uppercase">
              HOSPIVO
            </span>
            {shopName && (
              <>
                <span className="hidden md:inline text-outline-variant text-xl">|</span>
                <span className="hidden md:inline font-title-hinglish text-lg text-on-surface font-bold truncate">
                  {shopName}
                </span>
              </>
            )}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs sm:text-sm text-on-surface-variant font-medium">
                {modeLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{homeBtn.main}</span>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer" />

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="text-sm font-bold text-on-surface">{userName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-20 flex-1 bg-surface p-gutter">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto gap-space-md">
          {!ownerAllowed ? (
            <div className="py-12">
              <EmptyState
                title={t('owner_dashboard.owner_only_error')}
                subtitle={t('owner_dashboard.page_sub')}
                icon="lock"
                actionLabel={backBtn.main}
                onAction={onReturnHome}
              />
            </div>
          ) : (
            <>
              {/* Title + Date Filter Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-baseline gap-space-xs">
                  <h1 className="font-headline-lg text-2xl sm:text-[28px] text-on-surface font-extrabold tracking-tight">
                    {t('owner_dashboard.page_title')}
                  </h1>
                  <span className="text-sm sm:text-base text-on-surface-variant font-medium">
                    {t('owner_dashboard.page_sub')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex p-1 bg-surface-container rounded-2xl gap-1">
                    {(['today', 'month', 'custom'] as ReportPreset[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPreset(p)}
                        className={`h-11 px-4 rounded-xl font-bold text-sm cursor-pointer transition-all ${
                          preset === p
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {p === 'today'
                          ? t('owner_dashboard.range_today')
                          : p === 'month'
                            ? t('owner_dashboard.range_month')
                            : t('owner_dashboard.range_custom')}
                      </button>
                    ))}
                  </div>

                  {preset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold"
                      />
                      <span className="font-bold text-on-surface-variant">—</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold"
                      />
                    </div>
                  )}
                </div>
              </div>

              {isLoading || !metrics ? (
                <div className="p-8 rounded-2xl bg-surface-container-lowest text-center text-on-surface-variant font-semibold">
                  {t('stock_dekho.loading_stock')}
                </div>
              ) : (
                <>
                  {/* Row 1: 4 Key Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
                    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
                      <div className="text-sm sm:text-base text-on-surface-variant font-medium">
                        {t('owner_dashboard.stat_today_sales')}
                      </div>
                      <div className="font-display-total-mobile text-3xl sm:text-[34px] text-on-surface font-extrabold tracking-tight mt-1">
                        {formatRupees(metrics.todaySalesPaise)}
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
                      <div className="text-sm sm:text-base text-on-surface-variant font-medium">
                        {preset === 'custom'
                          ? t('owner_dashboard.stat_range_sales')
                          : t('owner_dashboard.stat_month_sales')}
                      </div>
                      <div className="font-display-total-mobile text-3xl sm:text-[34px] text-on-surface font-extrabold tracking-tight mt-1">
                        {formatRupees(
                          preset === 'custom' ? metrics.rangeSalesPaise : metrics.monthSalesPaise
                        )}
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
                      <div className="text-sm sm:text-base text-on-surface-variant font-medium">
                        {t('owner_dashboard.stat_est_profit')}
                      </div>
                      <div className="font-display-total-mobile text-3xl sm:text-[34px] text-primary font-extrabold tracking-tight mt-1">
                        {formatRupees(metrics.estimatedProfitPaise)}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-1">
                        {t('owner_dashboard.stat_est_profit_sub')}
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/30 flex flex-col justify-between">
                      <div className="text-sm sm:text-base text-on-surface-variant font-medium">
                        {t('owner_dashboard.stat_pending_udhaar')}
                      </div>
                      <div className="font-display-total-mobile text-3xl sm:text-[34px] text-error font-extrabold tracking-tight mt-1">
                        {formatRupees(metrics.pendingUdhaarPaise)}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Cash / UPI / Udhaar Split Strip */}
                  <div className="bg-surface-container-lowest rounded-xl px-space-lg py-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="font-title-hinglish text-lg sm:text-xl text-on-surface font-bold">
                        {t('owner_dashboard.split_title')}
                      </span>

                      <div className="flex flex-wrap items-center gap-4 text-sm sm:text-base">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-primary shrink-0" />
                          <span className="text-on-surface-variant">Cash</span>
                          <span className="font-bold text-on-surface">
                            {formatRupees(metrics.cashSalesPaise)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-secondary shrink-0" />
                          <span className="text-on-surface-variant">UPI</span>
                          <span className="font-bold text-on-surface">
                            {formatRupees(metrics.upiSalesPaise)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-tertiary shrink-0" />
                          <span className="text-on-surface-variant">Udhaar</span>
                          <span className="font-bold text-on-surface">
                            {formatRupees(metrics.udhaarSalesPaise)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-surface-container">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${splitPercentages.cash}%` }}
                      />
                      <div
                        className="h-full bg-secondary transition-all"
                        style={{ width: `${splitPercentages.upi}%` }}
                      />
                      <div
                        className="h-full bg-tertiary transition-all"
                        style={{ width: `${splitPercentages.udhaar}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 2b: Stock Value (MRP & Cost) + Recent Din Band Status */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm text-on-surface-variant font-medium">
                          {t('owner_dashboard.stock_val_mrp')}
                        </span>
                        <span className="font-headline-md text-2xl font-extrabold text-on-surface">
                          {formatRupees(metrics.stockValueMrpPaise)}
                        </span>
                      </div>
                      <Icon name="inventory_2" className="text-primary text-3xl" />
                    </div>

                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm text-on-surface-variant font-medium">
                          {t('owner_dashboard.stock_val_cost')}
                        </span>
                        <span className="font-headline-md text-2xl font-extrabold text-secondary">
                          {formatRupees(metrics.stockValueCostPaise)}
                        </span>
                      </div>
                      <Icon name="payments" className="text-secondary text-3xl" />
                    </div>

                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-on-surface-variant font-medium">
                          {t('owner_dashboard.recent_closing_title')}
                        </span>
                        {metrics.recentClosing ? (
                          <span className="font-bold text-base text-on-surface truncate">
                            {metrics.recentClosing.date} ·{' '}
                            {formatRupees(metrics.recentClosing.countedCashPaise)}
                          </span>
                        ) : (
                          <span className="text-sm text-on-surface-variant">
                            {t('owner_dashboard.closing_none')}
                          </span>
                        )}
                      </div>
                      {metrics.recentClosing && (
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-bold shrink-0 ${
                            metrics.recentClosing.status === 'completed'
                              ? 'bg-primary-fixed text-on-primary-fixed'
                              : 'bg-error-container text-on-error-container'
                          }`}
                        >
                          {metrics.recentClosing.status === 'completed'
                            ? t('owner_dashboard.closing_completed')
                            : t('owner_dashboard.closing_pending')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Top Selling, Expiry Alert, Low Stock */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
                    {/* Top Selling */}
                    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-3">
                      <div className="font-title-hinglish text-lg text-on-surface font-bold">
                        {t('owner_dashboard.top_selling_title')}
                      </div>
                      {metrics.topSellingMedicines.length === 0 ? (
                        <div className="text-sm text-on-surface-variant py-4 text-center">
                          {t('owner_dashboard.top_selling_empty')}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {metrics.topSellingMedicines.map((item, idx) => (
                            <div
                              key={item.medicineName}
                              className="flex items-center justify-between py-2 bg-surface-container-low px-3 rounded-lg"
                            >
                              <span className="text-on-surface font-medium truncate">
                                {idx + 1}. {item.medicineName}
                              </span>
                              <span className="text-on-surface-variant font-bold shrink-0 ml-2">
                                {item.totalUnits} {t('medicine.loose_unit')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expiry Alerts */}
                    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="font-title-hinglish text-lg text-on-surface font-bold">
                          {t('owner_dashboard.expiry_alert_title')}
                        </span>
                        <span className="bg-tertiary-fixed text-on-tertiary-fixed text-xs font-bold px-2.5 py-1 rounded-full">
                          {t('owner_dashboard.expiry_in_30d', {
                            count: metrics.expiring30Count,
                          })}
                        </span>
                      </div>
                      {metrics.expiringBatchesTop.length === 0 ? (
                        <div className="text-sm text-on-surface-variant py-4 text-center">
                          {t('owner_dashboard.expiry_empty')}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {metrics.expiringBatchesTop.map((b) => (
                            <div
                              key={`${b.medicineName}-${b.batchNo}`}
                              className="flex items-center justify-between py-2 bg-surface-container-low px-3 rounded-lg"
                            >
                              <span className="text-on-surface font-medium truncate">
                                {b.medicineName} ({b.batchNo})
                              </span>
                              <span className="text-tertiary font-bold shrink-0 ml-2">
                                {b.expiry.slice(5, 7)}/{b.expiry.slice(0, 4)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Low Stock */}
                    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="font-title-hinglish text-lg text-on-surface font-bold">
                          {t('owner_dashboard.low_stock_title')}
                        </span>
                        <span className="bg-error-container text-on-error-container text-xs font-bold px-2.5 py-1 rounded-full">
                          {t('owner_dashboard.low_stock_count', {
                            count: metrics.lowStockCount,
                          })}
                        </span>
                      </div>
                      {metrics.lowStockMedicinesTop.length === 0 ? (
                        <div className="text-sm text-on-surface-variant py-4 text-center">
                          {t('owner_dashboard.low_stock_empty')}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {metrics.lowStockMedicinesTop.map((m) => (
                            <div
                              key={m.medicineName}
                              className="flex items-center justify-between py-2 bg-surface-container-low px-3 rounded-lg"
                            >
                              <span className="text-on-surface font-medium truncate">
                                {m.medicineName}
                              </span>
                              <span className="text-error font-bold shrink-0 ml-2">
                                {m.packsLeft} {t('medicine.packs_unit')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Bottom Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={onBackToOwnerMenu}
                  className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Icon name="arrow_back" className="text-2xl" />
                  <span>{backBtn.main}</span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  {onOpenAuditLog && (
                    <button
                      type="button"
                      onClick={onOpenAuditLog}
                      className="h-14 min-h-[56px] px-5 rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Icon name="verified_user" className="text-2xl text-primary" />
                      <div className="flex flex-col text-left leading-none">
                        <span>{auditBtn.main}</span>
                        {auditBtn.sub && (
                          <span className="text-xs text-on-surface-variant pt-0.5">
                            {auditBtn.sub}
                          </span>
                        )}
                      </div>
                    </button>
                  )}

                  {onOpenReports && (
                    <button
                      type="button"
                      onClick={onOpenReports}
                      className="h-14 min-h-[56px] px-6 rounded-2xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <Icon name="analytics" className="text-2xl" />
                      <div className="flex flex-col text-left leading-none">
                        <span>{reportsBtn.main}</span>
                        {reportsBtn.sub && (
                          <span className="text-xs text-primary-fixed pt-0.5">
                            {reportsBtn.sub}
                          </span>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

