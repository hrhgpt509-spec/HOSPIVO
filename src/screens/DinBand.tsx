import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  db,
  type Batch,
  type Bill,
  type BillReturn,
  type DailyClosingStatus,
  type DBUser,
  type Shop,
  type StockMovement,
  type UdhaarPayment,
} from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { ApprovalDialog } from '../components/ApprovalDialog';
import { formatRupees, rupeesToPaise } from '../logic/money';
import { triggerFeedback } from '../logic/feedback';
import { DEFAULT_APPROVAL_RULES, type ApprovalRuleType } from '../logic/approvals';
import {
  computeDayClosingSummary,
  computeDenominationTotalPaise,
  emptyDenominationCounts,
  getCashMismatchApprovalRule,
  saveDailyClosing,
  type DenominationCounts,
} from '../logic/dinBand';
import { Step1CashCount } from './din-band/Step1CashCount';
import { Step2CashMatch } from './din-band/Step2CashMatch';
import { Step3CounterPhoto } from './din-band/Step3CounterPhoto';
import { Step4Report } from './din-band/Step4Report';

interface DinBandProps {
  onReturnHome: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const DinBand: React.FC<DinBandProps> = ({
  onReturnHome,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [openingCashStr, setOpeningCashStr] = useState<string>('0');
  const [countMode, setCountMode] = useState<'denominations' | 'direct'>('denominations');
  const [denominations, setDenominations] = useState<DenominationCounts>(
    emptyDenominationCounts
  );
  const [directCashStr, setDirectCashStr] = useState<string>('0');

  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [bills, setBills] = useState<Bill[]>([]);
  const [billReturns, setBillReturns] = useState<BillReturn[]>([]);
  const [udhaarPayments, setUdhaarPayments] = useState<UdhaarPayment[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [mismatchRule, setMismatchRule] = useState<ApprovalRuleType>(
    DEFAULT_APPROVAL_RULES.cash_mismatch
  );

  const [isApprovalOpen, setIsApprovalOpen] = useState<boolean>(false);
  const [mismatchAuthorized, setMismatchAuthorized] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedClosingId, setSavedClosingId] = useState<number | null>(null);
  const [savedStatus, setSavedStatus] = useState<DailyClosingStatus>('completed');

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  const loadData = useCallback(async () => {
    try {
      const [b, r, p, bt, mv, rule] = await Promise.all([
        db.bills.toArray(),
        db.billReturns.toArray(),
        db.udhaarPayments.toArray(),
        db.batches.toArray(),
        db.stockMovements.toArray(),
        getCashMismatchApprovalRule(),
      ]);
      setBills(b);
      setBillReturns(r);
      setUdhaarPayments(p);
      setBatches(bt);
      setStockMovements(mv);
      setMismatchRule(rule);
    } catch (err) {
      console.error('Failed to load Din Band data:', err);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openingCashPaise = rupeesToPaise(Number(openingCashStr) || 0);

  const summary = useMemo(
    () =>
      computeDayClosingSummary({
        bills,
        billReturns,
        udhaarPayments,
        batches,
        stockMovements,
        openingCashPaise,
      }),
    [bills, billReturns, udhaarPayments, batches, stockMovements, openingCashPaise]
  );

  const countedCashPaise = useMemo(() => {
    if (countMode === 'direct') {
      return rupeesToPaise(Number(directCashStr) || 0);
    }
    return computeDenominationTotalPaise(denominations).totalPaise;
  }, [countMode, directCashStr, denominations]);

  const differencePaise = countedCashPaise - summary.expectedCashPaise;
  const isExactMatch = differencePaise === 0;

  // Reset mismatch authorization if amounts change (one approval = one action on one record)
  useEffect(() => {
    setMismatchAuthorized(false);
  }, [countedCashPaise, summary.expectedCashPaise]);

  const effectiveStatus: DailyClosingStatus =
    savedClosingId !== null
      ? savedStatus
      : isExactMatch || mismatchAuthorized
        ? 'completed'
        : 'pending_auth';

  const handleSaveClosing = async (targetStatus: DailyClosingStatus) => {
    if (isSaving || savedClosingId !== null) return;

    try {
      setIsSaving(true);
      const result = await saveDailyClosing({
        date: summary.date,
        openingCashPaise: summary.openingCashPaise,
        expectedCashPaise: summary.expectedCashPaise,
        countedCashPaise,
        denominationJson: JSON.stringify(
          countMode === 'denominations' ? denominations : { directCashStr }
        ),
        counterPhoto: photoDataUrl,
        status: targetStatus,
        approvalVerified: isExactMatch || mismatchAuthorized,
        authorizedBy: mismatchAuthorized ? 'Approval PIN' : '',
        closedBy: String(userName),
        notes,
      });

      setSavedClosingId(result.id || 1);
      setSavedStatus(result.status);
      setStep(4);

      if (result.status === 'completed') {
        triggerFeedback('success', t('din_band.toast_saved_completed'));
      } else {
        triggerFeedback('error', t('din_band.toast_saved_pending'));
      }
    } catch (err: any) {
      triggerFeedback('error', err?.message || t('errors.generic_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const stepMeta =
    step === 1
      ? { title: t('din_band.step1_title'), sub: t('din_band.step1_sub') }
      : step === 2
        ? { title: t('din_band.step2_title'), sub: t('din_band.step2_sub') }
        : step === 3
          ? { title: t('din_band.step3_title'), sub: t('din_band.step3_sub') }
          : { title: t('din_band.step4_title'), sub: t('din_band.step4_sub') };

  const homeBtn = tButton('home.return_home_btn');

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md min-w-0">
            <div className="flex items-center gap-space-xs shrink-0">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary">
                <Icon name="local_pharmacy" className="text-[26px]" />
              </div>
              <span className="font-headline-md text-headline-md text-primary font-extrabold tracking-tight">
                HOSPIVO
              </span>
            </div>

            {shopName && (
              <>
                <div className="hidden md:block h-8 w-[2px] bg-outline-variant" />
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="font-title-hinglish text-lg text-on-surface font-bold leading-tight truncate">
                    {shopName}
                  </span>
                  <span className="text-xs text-on-surface-variant">{modeLabel}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
                className="w-11 h-11 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[24px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer" />

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
      <main className="w-full pt-20 flex-1 bg-background flex flex-col">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto flex-1 px-gutter py-space-sm justify-between gap-space-sm">
          {/* Step Indicator & 4-Segment Progress Bar */}
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-baseline gap-space-sm flex-wrap">
                <h1 className="font-headline-lg text-2xl sm:text-[28px] text-on-surface font-extrabold tracking-tight">
                  {t('din_band.page_title')}
                </h1>
                <span className="font-label-sub-english text-sm sm:text-base text-on-surface-variant font-medium">
                  {t('din_band.page_sub')}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex flex-col sm:items-end">
                  <span className="font-headline-md text-lg sm:text-xl text-primary font-bold">
                    {stepMeta.title}
                  </span>
                  <span className="text-xs sm:text-sm text-on-surface-variant">{stepMeta.sub}</span>
                </div>
                <div className="px-3.5 py-1.5 rounded-full bg-surface-container-high text-primary font-bold text-sm shrink-0">
                  {t('din_band.step_indicator', { step })}
                </div>
              </div>
            </div>

            {/* 4-Segment Progress Bar */}
            <div className="grid grid-cols-4 gap-2 w-full">
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className={`h-2.5 rounded-full transition-colors ${
                    seg <= step ? 'bg-primary' : 'bg-surface-container-highest'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Step Body */}
          {step === 1 && (
            <Step1CashCount
              openingCashStr={openingCashStr}
              onChangeOpeningCashStr={setOpeningCashStr}
              denominations={denominations}
              onChangeDenominations={setDenominations}
              directCashStr={directCashStr}
              onChangeDirectCashStr={setDirectCashStr}
              countMode={countMode}
              onChangeCountMode={setCountMode}
              countedCashPaise={countedCashPaise}
              expectedCashPaise={summary.expectedCashPaise}
              onBack={onReturnHome}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2CashMatch
              expectedCashPaise={summary.expectedCashPaise}
              countedCashPaise={countedCashPaise}
              mismatchRule={mismatchRule}
              mismatchAuthorized={mismatchAuthorized}
              onOpenApprovalPin={() => setIsApprovalOpen(true)}
              onSavePendingMismatch={() => void handleSaveClosing('pending_auth')}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <Step3CounterPhoto
              photoDataUrl={photoDataUrl}
              onChangePhoto={setPhotoDataUrl}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <Step4Report
              summary={summary}
              countedCashPaise={countedCashPaise}
              photoDataUrl={photoDataUrl}
              closingStatus={effectiveStatus}
              savedClosingId={savedClosingId}
              notes={notes}
              onChangeNotes={setNotes}
              isSaving={isSaving}
              onSaveClosing={() => void handleSaveClosing(effectiveStatus)}
              onBack={() => setStep(3)}
              onReturnHome={onReturnHome}
            />
          )}
        </div>
      </main>

      {/* Approval PIN Dialog for Cash Mismatch */}
      <ApprovalDialog
        isOpen={isApprovalOpen}
        actionCategory="cash_mismatch"
        recordDescription={`${summary.date} (${formatRupees(differencePaise)})`}
        requesterName={userName}
        onApproved={() => {
          setIsApprovalOpen(false);
          setMismatchAuthorized(true);
        }}
        onClose={() => setIsApprovalOpen(false)}
      />
    </div>
  );
};

