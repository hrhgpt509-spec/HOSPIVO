import React from 'react';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import type { ApprovalRuleType } from '../../logic/approvals';
import { evaluateCashMismatch } from '../../logic/dinBand';

interface Step2CashMatchProps {
  expectedCashPaise: number;
  countedCashPaise: number;
  mismatchRule: ApprovalRuleType;
  mismatchAuthorized: boolean;
  onOpenApprovalPin: () => void;
  onSavePendingMismatch: () => void;
  onBack: () => void;
  onNext: () => void;
}

export const Step2CashMatch: React.FC<Step2CashMatchProps> = ({
  expectedCashPaise,
  countedCashPaise,
  mismatchRule,
  mismatchAuthorized,
  onOpenApprovalPin,
  onSavePendingMismatch,
  onBack,
  onNext,
}) => {
  const { t } = useTranslation();

  const evalResult = evaluateCashMismatch(expectedCashPaise, countedCashPaise);
  const isExactMatch = evalResult.kind === 'match';
  const canProceedToStep3 = isExactMatch || mismatchAuthorized;

  const backBtn = tButton('suppliers.btn_back');
  const pinBtn = tButton('din_band.btn_verify_pin');
  const savePendingBtn = tButton('din_band.btn_save_pending');
  const nextBtn = tButton('din_band.btn_next_photo');

  return (
    <div className="flex flex-col flex-1 justify-between gap-space-md min-h-0">
      <div className="flex flex-col gap-space-sm flex-1 justify-center">
        {/* Status Banner when Mismatched */}
        {!isExactMatch && !mismatchAuthorized && (
          <div
            className={`w-full rounded-2xl p-space-md shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
              mismatchRule === 'local_pin'
                ? 'bg-error-container text-on-error-container border-error/40'
                : 'bg-tertiary-fixed text-on-tertiary-fixed border-tertiary/50'
            }`}
          >
            <div className="flex items-center gap-space-md">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  mismatchRule === 'local_pin'
                    ? 'bg-error text-on-error'
                    : 'bg-tertiary text-on-tertiary'
                }`}
              >
                <Icon
                  name={mismatchRule === 'local_pin' ? 'warning' : 'cloud_off'}
                  className="text-[30px]"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-md text-lg sm:text-xl font-bold leading-snug">
                  {mismatchRule === 'local_pin'
                    ? t('din_band.mismatch_pin_banner_title')
                    : t('din_band.mismatch_blocked_banner')}
                </span>
                <span className="text-sm opacity-90">
                  {mismatchRule === 'local_pin'
                    ? t('din_band.mismatch_pin_banner_sub')
                    : t('din_band.mismatch_incomplete_alert')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Row 1: System Expected Cash */}
        <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-space-md">
            <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
              <Icon name="point_of_sale" className="text-[36px]" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-xl sm:text-2xl text-on-surface font-bold">
                {t('din_band.expected_label')}
              </span>
              <span className="text-sm sm:text-base text-on-surface-variant">
                {t('din_band.expected_sub')}
              </span>
            </div>
          </div>
          <span className="font-display-total text-[36px] sm:text-[44px] text-on-surface font-extrabold tracking-tight">
            {formatRupees(expectedCashPaise)}
          </span>
        </div>

        {/* Row 2: Physical Counted Cash */}
        <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-space-md">
            <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary shrink-0">
              <Icon name="payments" className="text-[36px]" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-xl sm:text-2xl text-on-surface font-bold">
                {t('din_band.counted_label')}
              </span>
              <span className="text-sm sm:text-base text-on-surface-variant">
                {t('din_band.counted_sub')}
              </span>
            </div>
          </div>
          <span className="font-display-total text-[36px] sm:text-[44px] text-on-surface font-extrabold tracking-tight">
            {formatRupees(countedCashPaise)}
          </span>
        </div>

        {/* Row 3: Difference Card */}
        <div
          className={`rounded-2xl p-space-lg shadow-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            canProceedToStep3
              ? 'bg-primary-fixed/30 border-primary/40 text-on-surface'
              : 'bg-error-container border-error/50 text-on-error-container'
          }`}
        >
          <div className="flex items-center gap-space-md">
            <div
              className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                canProceedToStep3 ? 'bg-primary text-on-primary' : 'bg-error text-on-error'
              }`}
            >
              <Icon
                name={
                  canProceedToStep3
                    ? 'check_circle'
                    : evalResult.kind === 'short'
                      ? 'trending_down'
                      : 'trending_up'
                }
                className="text-[38px]"
              />
            </div>
            <div className="flex flex-col">
              <span
                className={`font-headline-md text-xl sm:text-2xl font-bold ${
                  canProceedToStep3 ? 'text-primary' : 'text-error'
                }`}
              >
                {t('din_band.diff_label')}
              </span>
              <span
                className={`text-sm sm:text-base font-bold ${
                  canProceedToStep3 ? 'text-primary' : 'text-error'
                }`}
              >
                {isExactMatch
                  ? t('din_band.diff_exact')
                  : mismatchAuthorized
                    ? t('din_band.status_ready_close')
                    : t('din_band.mismatch_incomplete_alert')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`font-display-total text-[36px] sm:text-[44px] font-extrabold tracking-tight ${
                canProceedToStep3 ? 'text-primary' : 'text-error'
              }`}
            >
              {isExactMatch
                ? formatRupees(0)
                : evalResult.kind === 'short'
                  ? t('din_band.diff_short', { amount: formatRupees(evalResult.absPaise) })
                  : t('din_band.diff_excess', { amount: formatRupees(evalResult.absPaise) })}
            </span>
            {canProceedToStep3 && <Icon name="verified" className="text-primary text-[40px]" />}
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <Icon name="arrow_back" className="text-[26px]" />
          <div className="flex flex-col items-start leading-none">
            <span className="font-title-hinglish text-lg font-bold">{backBtn.main}</span>
            {backBtn.sub && (
              <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
            )}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {!canProceedToStep3 && (
            <button
              type="button"
              onClick={onSavePendingMismatch}
              className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-tertiary text-on-tertiary hover:brightness-95 flex items-center gap-2 shadow-md cursor-pointer"
            >
              <Icon name="save" className="text-[26px]" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-title-hinglish text-base sm:text-lg font-bold">
                  {savePendingBtn.main}
                </span>
                {savePendingBtn.sub && (
                  <span className="text-xs opacity-90 pt-0.5">{savePendingBtn.sub}</span>
                )}
              </div>
            </button>
          )}

          {!canProceedToStep3 && mismatchRule === 'local_pin' && (
            <button
              type="button"
              onClick={onOpenApprovalPin}
              className="h-14 min-h-[56px] px-space-xl rounded-2xl bg-primary hover:bg-primary-container text-on-primary flex items-center gap-2.5 shadow-md cursor-pointer"
            >
              <Icon name="key" className="text-[26px]" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-title-hinglish text-base sm:text-lg font-bold">
                  {pinBtn.main}
                </span>
                {pinBtn.sub && (
                  <span className="text-xs text-primary-fixed pt-0.5">{pinBtn.sub}</span>
                )}
              </div>
            </button>
          )}

          <button
            type="button"
            disabled={!canProceedToStep3}
            onClick={onNext}
            className={`h-14 min-h-[56px] px-space-xl rounded-2xl flex items-center gap-2.5 transition-all ${
              canProceedToStep3
                ? 'bg-primary hover:bg-primary-container text-on-primary shadow-md cursor-pointer'
                : 'bg-surface-container-high text-outline cursor-not-allowed opacity-70'
            }`}
          >
            <div className="flex flex-col items-start leading-none">
              <span className="font-button-text text-lg font-bold">{nextBtn.main}</span>
              {nextBtn.sub && (
                <span className="text-xs opacity-85 pt-0.5">{nextBtn.sub}</span>
              )}
            </div>
            <Icon name={canProceedToStep3 ? 'arrow_forward' : 'lock'} className="text-[26px]" />
          </button>
        </div>
      </div>
    </div>
  );
};

