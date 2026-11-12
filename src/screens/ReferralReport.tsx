import React, { useState, useEffect, useMemo } from 'react';
import { db, type Bill, type DBUser, type Shop } from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { EmptyState } from '../components/EmptyState';
import { formatRupees } from '../logic/money';
import { triggerFeedback } from '../logic/feedback';
import {
  aggregateDoctorReferralSales,
  buildReferralCsv,
  type DoctorDatePreset,
} from '../logic/udhaar';

interface ReferralReportProps {
  onReturnHome: () => void;
  onBack?: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const ReferralReport: React.FC<ReferralReportProps> = ({
  onReturnHome,
  onBack,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [bills, setBills] = useState<Bill[]>([]);
  const [preset, setPreset] = useState<DoctorDatePreset>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  useEffect(() => {
    setIsLoading(true);
    db.bills
      .toArray()
      .then((list) => setBills(list))
      .catch(() => setBills([]))
      .finally(() => setIsLoading(false));
  }, []);

  const summary = useMemo(
    () =>
      aggregateDoctorReferralSales(bills, {
        preset,
        startDate: preset === 'all' ? startDate : undefined,
        endDate: preset === 'all' ? endDate : undefined,
      }),
    [bills, preset, startDate, endDate]
  );

  const handleExportCsv = () => {
    try {
      const csv = buildReferralCsv(summary);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `hospivo-referral-sales-${preset}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerFeedback('success', t('referral_report.toast_csv_saved'));
    } catch (err) {
      console.error('Failed to export CSV:', err);
      triggerFeedback('error', t('errors.generic_error'));
    }
  };

  const homeBtn = tButton('home.return_home_btn');
  const todayBtn = tButton('referral_report.filter_today');
  const weekBtn = tButton('referral_report.filter_week');
  const monthBtn = tButton('referral_report.filter_month');
  const allBtn = tButton('referral_report.filter_all');
  const backBtn = tButton('suppliers.btn_back');
  const printBtn = tButton('referral_report.btn_print');
  const csvBtn = tButton('referral_report.btn_export_csv');

  const segmentButtons: Array<{ key: DoctorDatePreset; label: { main: string; sub?: string } }> = [
    { key: 'today', label: todayBtn },
    { key: 'week', label: weekBtn },
    { key: 'month', label: monthBtn },
    { key: 'all', label: allBtn },
  ];

  const barOpacities = ['bg-primary', 'bg-primary/80', 'bg-primary/60', 'bg-primary/45', 'bg-primary/30'];

  return (
    <div className="w-full min-h-screen bg-background font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg min-w-0">
            <div className="flex items-center gap-space-xs shrink-0">
              <Icon name="local_pharmacy" className="text-primary text-[32px]" />
              <span className="font-headline-lg text-headline-lg text-primary font-extrabold tracking-tight">
                HOSPIVO
              </span>
            </div>
            {shopName && (
              <>
                <div className="hidden md:block h-8 w-px bg-surface-container-highest" />
                <span className="hidden md:inline font-title-hinglish text-lg text-on-surface font-bold truncate">
                  {shopName}
                </span>
              </>
            )}
            <div className="hidden sm:inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high border border-outline-variant/60">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs sm:text-sm text-on-surface font-bold">{modeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{homeBtn.main}</span>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[24px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer" />

            <div className="hidden sm:flex items-center gap-2 pl-1">
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
      <main className="w-full pt-20 flex-1 bg-background p-gutter">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto justify-between gap-space-md">
          {/* Top Bar: Title & Segmented Period Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-surface-container-lowest px-space-lg py-space-md rounded-xl shadow-sm border border-outline-variant/30">
            <div className="flex flex-col justify-center">
              <h1 className="font-headline-lg text-2xl sm:text-[28px] text-on-surface font-extrabold leading-tight">
                {t('referral_report.page_title')}
              </h1>
              <span className="font-label-sub-english text-sm sm:text-base text-on-surface-variant font-medium">
                {t('referral_report.page_sub')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap p-1.5 bg-surface-container rounded-2xl gap-1" role="tablist">
                {segmentButtons.map((seg) => {
                  const active = preset === seg.key;
                  return (
                    <button
                      key={seg.key}
                      type="button"
                      onClick={() => setPreset(seg.key)}
                      className={`px-4 py-2 rounded-xl font-bold text-sm sm:text-base transition-all cursor-pointer ${
                        active
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {seg.label.main}
                    </button>
                  );
                })}
              </div>

              {preset === 'all' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-sm font-semibold"
                  />
                  <span className="text-on-surface-variant font-bold">—</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-sm font-semibold"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Main Card: Doctors Table & Proportion Bar */}
          <div className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm p-space-lg gap-space-md border border-outline-variant/30">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-4 sm:px-space-lg py-space-sm bg-surface-container rounded-lg text-on-surface-variant font-bold text-sm sm:text-base uppercase tracking-wide">
              <div className="col-span-6 flex items-center gap-2">
                <Icon name="stethoscope" className="text-primary text-[22px]" />
                <span>{t('referral_report.col_doctor')}</span>
              </div>
              <div className="col-span-3 flex items-center justify-center gap-1.5 text-center">
                <Icon name="receipt_long" className="text-primary text-[22px]" />
                <span>{t('referral_report.col_bills')}</span>
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1.5 text-right">
                <Icon name="payments" className="text-primary text-[22px]" />
                <span>{t('referral_report.col_sales')}</span>
              </div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-on-surface-variant font-semibold">
                {t('stock_dekho.loading_stock')}
              </div>
            ) : summary.doctors.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title={t('referral_report.empty_title')}
                  subtitle={t('referral_report.empty_sub')}
                  icon="stethoscope"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  {summary.doctors.map((doc) => (
                    <div
                      key={doc.doctorName}
                      className="grid grid-cols-12 px-4 sm:px-space-lg min-h-[64px] items-center rounded-lg hover:bg-surface-container-low transition-colors border-b border-outline-variant/20 last:border-b-0"
                    >
                      <div className="col-span-6 flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary-container/15 flex items-center justify-center text-primary font-headline-md text-lg font-extrabold shrink-0">
                          {doc.doctorName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-title-hinglish text-base sm:text-xl text-on-surface font-bold truncate">
                          {doc.doctorName}
                        </span>
                      </div>

                      <div className="col-span-3 flex items-center justify-center">
                        <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-surface-container font-headline-md text-lg font-bold text-on-surface">
                          {doc.billCount}
                        </span>
                      </div>

                      <div className="col-span-3 flex items-center justify-end">
                        <span className="font-headline-md text-lg sm:text-xl text-primary font-extrabold tracking-tight">
                          {formatRupees(doc.totalSalesPaise)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sales Distribution Bar */}
                {summary.totalSalesPaise > 0 && (
                  <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-2">
                    <div className="flex flex-wrap justify-between items-center gap-2 text-on-surface-variant text-sm sm:text-base">
                      <span className="font-bold text-on-surface">
                        {t('referral_report.proportion_title')}
                      </span>
                      <span>
                        {t('referral_report.proportion_summary', {
                          doctors: summary.doctors.length,
                          bills: summary.totalBills,
                          amount: formatRupees(summary.totalSalesPaise),
                        })}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-surface-container-highest overflow-hidden flex">
                      {summary.doctors.map((doc, idx) => {
                        const pct = (doc.totalSalesPaise / summary.totalSalesPaise) * 100;
                        return (
                          <div
                            key={doc.doctorName}
                            className={`h-full ${barOpacities[idx % barOpacities.length]}`}
                            style={{ width: `${pct.toFixed(1)}%` }}
                            title={`${doc.doctorName} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Info Notice Strip (Semantic Blue - sales only) */}
          <div className="w-full bg-secondary-fixed text-on-secondary-fixed px-space-lg py-space-md rounded-xl shadow-sm flex items-center gap-space-md">
            <Icon name="info" className="text-secondary text-[28px] shrink-0" />
            <p className="font-body-lg text-base sm:text-lg font-bold leading-normal m-0">
              {t('referral_report.notice_sales_only')}
            </p>
          </div>

          {/* Bottom Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <button
              type="button"
              onClick={onBack || onReturnHome}
              className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container-highest hover:bg-surface-container text-on-surface flex items-center gap-3 shadow-sm transition-all active:translate-y-0.5 cursor-pointer"
            >
              <Icon name="arrow_back" className="text-[26px]" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-title-hinglish text-lg font-bold">{backBtn.main}</span>
                {backBtn.sub && (
                  <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
                )}
              </div>
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface flex items-center gap-3 shadow-sm transition-all active:translate-y-0.5 cursor-pointer"
              >
                <Icon name="print" className="text-[26px] text-primary" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish text-lg font-bold">{printBtn.main}</span>
                  {printBtn.sub && (
                    <span className="text-xs text-on-surface-variant pt-0.5">{printBtn.sub}</span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={summary.doctors.length === 0}
                className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-primary hover:bg-primary-container text-on-primary flex items-center gap-3 shadow-md transition-all active:translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                <Icon name="table_view" className="text-[28px]" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish text-lg font-bold">{csvBtn.main}</span>
                  {csvBtn.sub && (
                    <span className="text-xs opacity-85 pt-0.5">{csvBtn.sub}</span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

