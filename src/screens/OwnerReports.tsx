import React, { useState, useEffect, useMemo } from 'react';
import {
  db,
  type Bill,
  type BillItem,
  type BillReturn,
  type DBUser,
  type Purchase,
  type PurchaseLine,
  type Shop,
  type Supplier,
} from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { EmptyState } from '../components/EmptyState';
import { formatRupees } from '../logic/money';
import { isOwner } from '../logic/roles';
import { triggerFeedback } from '../logic/feedback';
import {
  buildGstSummaryCsv,
  buildGstSummaryReport,
  buildPurchaseRegister,
  buildPurchaseRegisterCsv,
  buildSalesReport,
  buildSalesReportCsv,
  buildScheduleHCsv,
  buildScheduleHRegister,
  type ReportPreset,
} from '../logic/reports';

type ReportTab = 'sales' | 'gst' | 'purchase' | 'schedule_h';

interface OwnerReportsProps {
  onReturnHome: () => void;
  onBackToOwnerMenu: () => void;
  onOpenReferralReport: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OwnerReports: React.FC<OwnerReportsProps> = ({
  onReturnHome,
  onBackToOwnerMenu,
  onOpenReferralReport,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [preset, setPreset] = useState<ReportPreset>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [bills, setBills] = useState<Bill[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billReturns, setBillReturns] = useState<BillReturn[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const ownerAllowed = isOwner(currentUser);
  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || t('common.role_owner');

  useEffect(() => {
    if (!ownerAllowed) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    Promise.all([
      db.bills.toArray(),
      db.billItems.toArray(),
      db.billReturns.toArray(),
      db.purchases.toArray(),
      db.purchaseLines.toArray(),
      db.suppliers.toArray(),
    ])
      .then(([b, bi, br, p, pl, sup]) => {
        setBills(b);
        setBillItems(bi);
        setBillReturns(br);
        setPurchases(p);
        setPurchaseLines(pl);
        setSuppliers(sup);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [ownerAllowed]);

  const dateRange = useMemo(
    () => ({ preset, startDate, endDate }),
    [preset, startDate, endDate]
  );

  const salesReport = useMemo(
    () => buildSalesReport(bills, dateRange),
    [bills, dateRange]
  );

  const gstReport = useMemo(
    () =>
      buildGstSummaryReport({
        bills,
        billItems,
        billReturns,
        range: dateRange,
      }),
    [bills, billItems, billReturns, dateRange]
  );

  const purchaseRegister = useMemo(
    () =>
      buildPurchaseRegister({
        user: currentUser,
        purchases,
        purchaseLines,
        suppliers,
        range: dateRange,
      }),
    [currentUser, purchases, purchaseLines, suppliers, dateRange]
  );

  const scheduleHReport = useMemo(
    () =>
      buildScheduleHRegister({
        bills,
        billItems,
        range: dateRange,
      }),
    [bills, billItems, dateRange]
  );

  const handleExportCsv = () => {
    try {
      let csv = '';
      if (activeTab === 'sales') {
        csv = buildSalesReportCsv(salesReport);
      } else if (activeTab === 'gst') {
        csv = buildGstSummaryCsv(gstReport);
      } else if (activeTab === 'purchase') {
        csv = buildPurchaseRegisterCsv(purchaseRegister);
      } else {
        csv = buildScheduleHCsv(scheduleHReport);
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `hospivo-${activeTab}-${preset}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerFeedback('success', t('owner_reports.toast_csv_saved'));
    } catch (err) {
      console.error('Failed to export CSV:', err);
      triggerFeedback('error', t('errors.generic_error'));
    }
  };

  const homeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('suppliers.btn_back');
  const tabSalesBtn = tButton('owner_reports.tab_sales');
  const tabGstBtn = tButton('owner_reports.tab_gst');
  const tabPurchaseBtn = tButton('owner_reports.tab_purchase');
  const tabScheduleHBtn = tButton('owner_reports.tab_schedule_h');
  const referralBtn = tButton('owner_reports.btn_referral_report');
  const printBtn = tButton('owner_reports.btn_print');
  const csvBtn = tButton('owner_reports.btn_export_csv');

  const tabs: Array<{ key: ReportTab; label: { main: string; sub?: string }; icon: string }> = [
    { key: 'sales', label: tabSalesBtn, icon: 'point_of_sale' },
    { key: 'gst', label: tabGstBtn, icon: 'receipt_long' },
    { key: 'purchase', label: tabPurchaseBtn, icon: 'shopping_cart_checkout' },
    { key: 'schedule_h', label: tabScheduleHBtn, icon: 'medical_services' },
  ];

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30 print:hidden">
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
              className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
      <main className="w-full pt-20 flex-1 bg-surface p-gutter print:pt-0 print:p-0">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto gap-space-md">
          {!ownerAllowed ? (
            <div className="py-12">
              <EmptyState
                title={t('owner_dashboard.owner_only_error')}
                subtitle={t('owner_reports.page_sub')}
                icon="lock"
                actionLabel={backBtn.main}
                onAction={onReturnHome}
              />
            </div>
          ) : (
            <>
              {/* Title Bar + Date Filter + Referral Link */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
                <div>
                  <h1 className="font-headline-lg text-2xl sm:text-[28px] font-extrabold text-on-surface leading-tight">
                    {t('owner_reports.page_title')}
                  </h1>
                  <p className="text-sm sm:text-base text-on-surface-variant">
                    {t('owner_reports.page_sub')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
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

                  <button
                    type="button"
                    onClick={onOpenReferralReport}
                    className="h-14 min-h-[56px] px-4 rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/50 text-on-surface font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Icon name="stethoscope" className="text-primary text-2xl" />
                    <div className="flex flex-col text-left leading-none">
                      <span className="text-sm sm:text-base">{referralBtn.main}</span>
                      {referralBtn.sub && (
                        <span className="text-xs text-on-surface-variant pt-0.5">
                          {referralBtn.sub}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* 4 Report Tabs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
                {tabs.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`min-h-[60px] px-4 py-2.5 rounded-2xl flex items-center gap-3 transition-all cursor-pointer text-left border ${
                        active
                          ? 'bg-primary text-on-primary border-primary shadow-md'
                          : 'bg-surface-container-lowest text-on-surface border-outline-variant/40 hover:bg-surface-container-low shadow-sm'
                      }`}
                    >
                      <Icon name={tab.icon} className="text-[26px] shrink-0" />
                      <div className="flex flex-col min-w-0 leading-none">
                        <span className="font-title-hinglish text-base sm:text-lg font-bold truncate">
                          {tab.label.main}
                        </span>
                        {tab.label.sub && (
                          <span className="text-xs opacity-85 pt-1 truncate">{tab.label.sub}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Printable Report Table Card */}
              <div
                id="hospivo-print-area"
                className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg overflow-x-auto"
              >
                <div className="hidden print:block mb-4 border-b pb-2">
                  <div className="text-xl font-bold">{shopName}</div>
                  <div className="text-sm">
                    {tabs.find((x) => x.key === activeTab)?.label.main}
                  </div>
                </div>

                {isLoading ? (
                  <div className="p-8 text-center text-on-surface-variant font-semibold">
                    {t('stock_dekho.loading_stock')}
                  </div>
                ) : (
                  <>
                    {/* TAB 1: SALES REPORT */}
                    {activeTab === 'sales' &&
                      (salesReport.rows.length === 0 ? (
                        <div className="p-8 text-center text-on-surface-variant font-medium">
                          {t('owner_reports.empty_rows')}
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/50 text-xs sm:text-sm text-on-surface-variant uppercase">
                              <th className="py-3 px-2">{t('owner_reports.col_bill_no')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_date')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_customer')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_mode')}</th>
                              <th className="py-3 px-2 text-right">{t('owner_reports.col_taxable')}</th>
                              <th className="py-3 px-2 text-right">{t('owner_reports.col_gst')}</th>
                              <th className="py-3 px-2 text-right">{t('owner_reports.col_total')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_status')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20 text-sm sm:text-base">
                            {salesReport.rows.map((r) => (
                              <tr key={r.id || r.billNo} className="hover:bg-surface-container-low/50">
                                <td className="py-3 px-2 font-bold text-on-surface">{r.billNo}</td>
                                <td className="py-3 px-2 text-on-surface-variant">{r.date}</td>
                                <td className="py-3 px-2 text-on-surface">{r.customerName || '—'}</td>
                                <td className="py-3 px-2 uppercase font-semibold">{r.paymentMode}</td>
                                <td className="py-3 px-2 text-right">{formatRupees(r.taxablePaise)}</td>
                                <td className="py-3 px-2 text-right">{formatRupees(r.gstPaise)}</td>
                                <td className="py-3 px-2 text-right font-bold text-primary">
                                  {formatRupees(r.totalPaise)}
                                </td>
                                <td className="py-3 px-2 text-xs font-bold uppercase">{r.status}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-outline-variant font-extrabold bg-surface-container-low">
                              <td className="py-3 px-2" colSpan={4}>
                                {t('owner_reports.col_total')} ({salesReport.rows.length})
                              </td>
                              <td className="py-3 px-2 text-right">
                                {formatRupees(salesReport.totalTaxablePaise)}
                              </td>
                              <td className="py-3 px-2 text-right">
                                {formatRupees(salesReport.totalGstPaise)}
                              </td>
                              <td className="py-3 px-2 text-right text-primary">
                                {formatRupees(salesReport.totalSalesPaise)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      ))}

                    {/* TAB 2: GST SUMMARY */}
                    {activeTab === 'gst' && (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-outline-variant/50 text-xs sm:text-sm text-on-surface-variant uppercase">
                            <th className="py-3 px-2">{t('owner_reports.col_gst_slab')}</th>
                            <th className="py-3 px-2 text-right">{t('owner_reports.col_taxable')}</th>
                            <th className="py-3 px-2 text-right">{t('owner_reports.col_cgst')}</th>
                            <th className="py-3 px-2 text-right">{t('owner_reports.col_sgst')}</th>
                            <th className="py-3 px-2 text-right">{t('owner_reports.col_total_tax')}</th>
                            <th className="py-3 px-2 text-right">{t('owner_reports.col_invoice_val')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20 text-sm sm:text-base">
                          {gstReport.slabs.map((s) => (
                            <tr key={s.gstPercent} className="hover:bg-surface-container-low/50">
                              <td className="py-3 px-2 font-bold text-on-surface">{s.gstPercent}%</td>
                              <td className="py-3 px-2 text-right">{formatRupees(s.taxablePaise)}</td>
                              <td className="py-3 px-2 text-right">{formatRupees(s.cgstPaise)}</td>
                              <td className="py-3 px-2 text-right">{formatRupees(s.sgstPaise)}</td>
                              <td className="py-3 px-2 text-right font-bold text-secondary">
                                {formatRupees(s.totalTaxPaise)}
                              </td>
                              <td className="py-3 px-2 text-right font-bold text-primary">
                                {formatRupees(s.invoiceValuePaise)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-outline-variant font-extrabold bg-surface-container-low">
                            <td className="py-3 px-2">{t('owner_reports.col_total')}</td>
                            <td className="py-3 px-2 text-right">
                              {formatRupees(gstReport.totalTaxablePaise)}
                            </td>
                            <td className="py-3 px-2 text-right">
                              {formatRupees(gstReport.totalCgstPaise)}
                            </td>
                            <td className="py-3 px-2 text-right">
                              {formatRupees(gstReport.totalSgstPaise)}
                            </td>
                            <td className="py-3 px-2 text-right text-secondary">
                              {formatRupees(gstReport.totalTaxPaise)}
                            </td>
                            <td className="py-3 px-2 text-right text-primary">
                              {formatRupees(gstReport.totalInvoiceValuePaise)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {/* TAB 3: PURCHASE REGISTER */}
                    {activeTab === 'purchase' &&
                      (purchaseRegister.rows.length === 0 ? (
                        <div className="p-8 text-center text-on-surface-variant font-medium">
                          {t('owner_reports.empty_rows')}
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/50 text-xs sm:text-sm text-on-surface-variant uppercase">
                              <th className="py-3 px-2">{t('owner_reports.col_date')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_supplier')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_invoice_no')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_gstin')}</th>
                              <th className="py-3 px-2 text-center">{t('owner_reports.col_items')}</th>
                              <th className="py-3 px-2 text-right">{t('owner_reports.col_total')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_verified')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20 text-sm sm:text-base">
                            {purchaseRegister.rows.map((r) => (
                              <tr key={r.purchaseId} className="hover:bg-surface-container-low/50">
                                <td className="py-3 px-2 text-on-surface-variant">{r.date}</td>
                                <td className="py-3 px-2 font-bold text-on-surface">
                                  {r.supplierName || '—'}
                                </td>
                                <td className="py-3 px-2 font-semibold">{r.invoiceNo}</td>
                                <td className="py-3 px-2 text-on-surface-variant">
                                  {r.supplierGstNo || '—'}
                                </td>
                                <td className="py-3 px-2 text-center font-bold">{r.itemsCount}</td>
                                <td className="py-3 px-2 text-right font-bold text-primary">
                                  {formatRupees(r.totalAmountPaise)}
                                </td>
                                <td className="py-3 px-2">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                      r.verified
                                        ? 'bg-primary-fixed text-on-primary-fixed'
                                        : 'bg-surface-container-high text-on-surface-variant'
                                    }`}
                                  >
                                    {r.verified
                                      ? t('owner_reports.verified_yes')
                                      : t('owner_reports.verified_no')}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-outline-variant font-extrabold bg-surface-container-low">
                              <td className="py-3 px-2" colSpan={5}>
                                {t('owner_reports.col_total')} ({purchaseRegister.rows.length})
                              </td>
                              <td className="py-3 px-2 text-right text-primary">
                                {formatRupees(purchaseRegister.totalAmountPaise)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      ))}

                    {/* TAB 4: SCHEDULE H / H1 REGISTER */}
                    {activeTab === 'schedule_h' &&
                      (scheduleHReport.length === 0 ? (
                        <div className="p-8 text-center text-on-surface-variant font-medium">
                          {t('owner_reports.empty_rows')}
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/50 text-xs sm:text-sm text-on-surface-variant uppercase">
                              <th className="py-3 px-2">{t('owner_reports.col_date')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_bill_no')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_patient')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_doctor')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_rx_seen')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_medicine')}</th>
                              <th className="py-3 px-2">{t('owner_reports.col_batch')}</th>
                              <th className="py-3 px-2 text-right">{t('owner_reports.col_qty')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20 text-sm sm:text-base">
                            {scheduleHReport.map((r) => (
                              <tr key={r.billItemId} className="hover:bg-surface-container-low/50">
                                <td className="py-3 px-2 text-on-surface-variant">{r.date}</td>
                                <td className="py-3 px-2 font-bold text-on-surface">{r.billNo}</td>
                                <td className="py-3 px-2 font-semibold">{r.patientName || '—'}</td>
                                <td className="py-3 px-2">{r.doctorName || '—'}</td>
                                <td className="py-3 px-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                      r.prescriptionChecked
                                        ? 'bg-primary-fixed text-on-primary-fixed'
                                        : 'bg-error-container text-on-error-container'
                                    }`}
                                  >
                                    {r.prescriptionChecked
                                      ? t('owner_reports.rx_yes')
                                      : t('owner_reports.rx_no')}
                                  </span>
                                </td>
                                <td className="py-3 px-2 font-bold text-on-surface">
                                  {r.medicineName}
                                </td>
                                <td className="py-3 px-2">{r.batchNo}</td>
                                <td className="py-3 px-2 text-right font-bold">
                                  {r.qtyInput}{' '}
                                  {r.unitMode === 'pack'
                                    ? t('medicine.packs_unit')
                                    : t('medicine.loose_unit')}{' '}
                                  ({r.qtyUnits})
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ))}
                  </>
                )}
              </div>

              {/* Bottom Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 print:hidden">
                <button
                  type="button"
                  onClick={onBackToOwnerMenu}
                  className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Icon name="arrow_back" className="text-2xl" />
                  <span>{backBtn.main}</span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="h-14 min-h-[56px] px-5 rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Icon name="print" className="text-2xl text-primary" />
                    <span>{printBtn.main}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="h-14 min-h-[56px] px-6 rounded-2xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <Icon name="table_chart" className="text-2xl" />
                    <span>{csvBtn.main}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

