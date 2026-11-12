import React from 'react';
import type { DailyClosingStatus } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import {
  buildDinBandWhatsAppText,
  buildDinBandWhatsAppUrl,
  evaluateCashMismatch,
  type DayClosingSummary,
} from '../../logic/dinBand';

interface Step4ReportProps {
  summary: DayClosingSummary;
  countedCashPaise: number;
  photoDataUrl: string;
  closingStatus: DailyClosingStatus;
  savedClosingId: number | null;
  notes: string;
  onChangeNotes: (val: string) => void;
  isSaving: boolean;
  onSaveClosing: () => void;
  onBack: () => void;
  onReturnHome: () => void;
}

export const Step4Report: React.FC<Step4ReportProps> = ({
  summary,
  countedCashPaise,
  photoDataUrl,
  closingStatus,
  savedClosingId,
  notes,
  onChangeNotes,
  isSaving,
  onSaveClosing,
  onBack,
  onReturnHome,
}) => {
  const { t } = useTranslation();
  const { name: shopName } = useShop();

  const diff = evaluateCashMismatch(summary.expectedCashPaise, countedCashPaise);
  const isSaved = savedClosingId !== null;
  const isPendingAuth = closingStatus === 'pending_auth';

  const handleSendWhatsApp = () => {
    try {
      const msg = buildDinBandWhatsAppText({
        shopName: shopName || '',
        summary,
        countedCashPaise,
        status: closingStatus,
        labels: {
          heading: t('din_band.wa_heading'),
          dateLabel: t('din_band.wa_date'),
          totalSalesLabel: t('din_band.report_sales_title'),
          billsLabel: t('din_band.tile_bills_count'),
          cashSalesLabel: t('din_band.tile_cash_sales'),
          upiSalesLabel: t('din_band.tile_upi_sales'),
          udhaarSalesLabel: t('din_band.tile_udhaar_sales'),
          udhaarCollectedLabel: t('din_band.tile_udhaar_collected'),
          returnsLabel: t('din_band.tile_returns'),
          expectedCashLabel: t('din_band.expected_label'),
          countedCashLabel: t('din_band.counted_label'),
          differenceLabel: t('din_band.diff_label'),
          statusLabel: t('din_band.tile_cash_diff'),
          statusCompletedText: t('din_band.status_completed_badge'),
          statusPendingText: t('din_band.status_pending_badge'),
        },
      });
      const url = buildDinBandWhatsAppUrl(msg);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp open failed:', err);
    }
  };

  const backBtn = tButton('suppliers.btn_back');
  const waBtn = tButton('din_band.btn_whatsapp_owner');
  const closeBtn = tButton('din_band.btn_close_day');
  const savePendingBtn = tButton('din_band.btn_save_pending');
  const doneHomeBtn = tButton('home.return_home_btn');

  return (
    <div className="flex flex-col flex-1 justify-between gap-space-md min-h-0">
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-between p-space-md sm:p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/30 gap-space-md">
        {/* Pending Auth Warning Banner (when saved as pending_auth) */}
        {isPendingAuth && (
          <div className="p-3.5 rounded-xl bg-error-container text-on-error-container border border-error/40 flex items-center gap-3">
            <Icon name="warning" className="text-error text-2xl shrink-0" />
            <span className="font-bold text-sm sm:text-base">
              {t('din_band.mismatch_incomplete_alert')}
            </span>
          </div>
        )}

        {/* Top Row: Aaj Ki Bikri Banner + Counter Photo Thumbnail */}
        <div className="flex flex-col lg:flex-row items-stretch gap-space-md">
          <div className="flex-1 rounded-xl bg-surface-container-low p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-space-md">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm shrink-0">
                <Icon name="currency_rupee" className="text-[34px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-title-hinglish text-lg sm:text-xl text-on-surface font-bold">
                  {t('din_band.report_sales_title')}
                </span>
                <span className="font-display-total text-[36px] sm:text-[44px] text-primary font-black leading-tight">
                  {formatRupees(summary.totalSalesPaise)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end justify-center">
              <span
                className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-1.5 ${
                  isPendingAuth
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-primary-fixed text-on-primary-fixed'
                }`}
              >
                <Icon name={isPendingAuth ? 'pending' : 'check_circle'} className="text-lg" />
                <span>
                  {isPendingAuth
                    ? t('din_band.status_pending_badge')
                    : isSaved
                      ? t('din_band.status_completed_badge')
                      : t('din_band.status_ready_close')}
                </span>
              </span>
              <span className="text-xs text-on-surface-variant mt-1">{summary.date}</span>
            </div>
          </div>

          {/* Counter Photo Thumbnail */}
          <div className="w-full lg:w-72 rounded-xl bg-surface-container-low p-3 flex items-center gap-3 shadow-sm shrink-0">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt={t('din_band.counter_photo_label')}
                className="w-20 h-20 rounded-lg object-cover shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                <Icon name="no_photography" className="text-3xl" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="font-title-hinglish text-base font-bold text-on-surface truncate">
                {t('din_band.counter_photo_label')}
              </span>
              <span className="text-xs text-on-surface-variant">
                {photoDataUrl ? t('din_band.step3_sub') : t('din_band.no_photo_label')}
              </span>
            </div>
          </div>
        </div>

        {/* Operational Metric Grid (NO profit, NO purchase rates) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <Icon name="payments" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-on-surface">
                {t('din_band.tile_cash_sales')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-on-surface font-extrabold">
              {formatRupees(summary.cashSalesPaise)}
            </span>
          </div>

          <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-secondary-fixed flex items-center justify-center text-secondary shrink-0">
                <Icon name="qr_code_scanner" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-on-surface">
                {t('din_band.tile_upi_sales')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-on-surface font-extrabold">
              {formatRupees(summary.upiSalesPaise)}
            </span>
          </div>

          <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0">
                <Icon name="menu_book" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-on-surface">
                {t('din_band.tile_udhaar_sales')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-on-surface font-extrabold">
              {formatRupees(summary.udhaarSalesPaise)}
            </span>
          </div>

          <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface shrink-0">
                <Icon name="receipt_long" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-on-surface">
                {t('din_band.tile_bills_count')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-on-surface font-extrabold">
              {summary.totalBillsCount}
            </span>
          </div>

          <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed shrink-0">
                <Icon name="account_balance_wallet" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-on-surface">
                {t('din_band.tile_udhaar_collected')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-primary font-extrabold">
              {formatRupees(summary.totalUdhaarCollectedPaise)}
            </span>
          </div>

          <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface shrink-0">
                <Icon name="assignment_return" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-on-surface">
                {t('din_band.tile_returns')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-on-surface font-extrabold">
              {formatRupees(summary.totalReturnsPaise)}
            </span>
          </div>

          <div className="rounded-xl bg-tertiary-fixed/40 p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-lg bg-tertiary-container flex items-center justify-center text-on-tertiary-container shrink-0">
                <Icon name="warning" className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold text-tertiary">
                {t('din_band.tile_expiry_alert')}
              </span>
            </div>
            <span className="font-headline-md text-xl text-tertiary font-extrabold">
              {summary.expiryAlert30DaysCount}
            </span>
          </div>

          <div
            className={`rounded-xl p-4 flex items-center justify-between shadow-sm ${
              diff.kind === 'match'
                ? 'bg-primary-fixed/40 text-primary'
                : 'bg-error-container text-error'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
                  diff.kind === 'match'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-error text-on-error'
                }`}
              >
                <Icon name={diff.kind === 'match' ? 'verified' : 'error'} className="text-2xl" />
              </div>
              <span className="font-title-hinglish text-base font-bold">
                {t('din_band.tile_cash_diff')}
              </span>
            </div>
            <span className="font-headline-md text-xl font-extrabold">
              {diff.kind === 'match'
                ? formatRupees(0)
                : diff.kind === 'short'
                  ? `-${formatRupees(diff.absPaise)}`
                  : `+${formatRupees(diff.absPaise)}`}
            </span>
          </div>
        </div>

        {/* Optional Note */}
        <input
          {...textFieldProps('free', notes, onChangeNotes)}
          type="text"
          disabled={isSaved}
          placeholder={t('din_band.notes_placeholder')}
          className="h-12 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
        />
      </div>

      {/* Bottom Action Bar */}
      <div className="w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 shrink-0">
        {!isSaved ? (
          <button
            type="button"
            onClick={onBack}
            disabled={isSaving}
            className="min-h-[56px] h-14 px-space-lg rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Icon name="arrow_back" className="text-[24px]" />
            <div className="flex flex-col text-left leading-none">
              <span className="font-title-hinglish text-lg font-bold">{backBtn.main}</span>
              {backBtn.sub && (
                <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
              )}
            </div>
          </button>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="min-h-[56px] h-14 px-space-lg rounded-xl bg-secondary-fixed hover:bg-secondary-fixed-dim text-on-secondary-fixed flex items-center gap-2.5 shadow-sm cursor-pointer"
          >
            <Icon name="share" className="text-[24px] text-secondary" />
            <div className="flex flex-col text-left leading-none">
              <span className="font-title-hinglish text-base sm:text-lg font-bold">
                {waBtn.main}
              </span>
              {waBtn.sub && (
                <span className="text-xs opacity-85 pt-0.5">{waBtn.sub}</span>
              )}
            </div>
          </button>

          {!isSaved ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={onSaveClosing}
              className="min-h-[56px] h-14 px-space-xl rounded-xl bg-primary hover:bg-primary-container text-on-primary flex items-center gap-2.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <Icon name="power_settings_new" className="text-[26px]" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-title-hinglish text-base sm:text-lg font-bold">
                  {isPendingAuth ? savePendingBtn.main : closeBtn.main}
                </span>
                {(isPendingAuth ? savePendingBtn.sub : closeBtn.sub) && (
                  <span className="text-xs text-inverse-primary pt-0.5">
                    {isPendingAuth ? savePendingBtn.sub : closeBtn.sub}
                  </span>
                )}
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={onReturnHome}
              className="min-h-[56px] h-14 px-space-xl rounded-xl bg-primary hover:bg-primary-container text-on-primary flex items-center gap-2.5 shadow-md cursor-pointer"
            >
              <Icon name="home" className="text-[26px]" />
              <span className="font-title-hinglish text-lg font-bold">{doneHomeBtn.main}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

