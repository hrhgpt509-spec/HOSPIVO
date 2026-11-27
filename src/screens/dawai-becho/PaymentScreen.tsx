import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { DBUser, PaymentMode } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { MobileTopBar } from '../../components/MobileTopBar';
import { ApprovalDialog } from '../../components/ApprovalDialog';
import { useShop } from '../../logic/useShop';
import { formatRupees, rupeesToPaise } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import { NumericLimitWarning } from '../../components/NumericLimitWarning';
import { triggerFeedback } from '../../logic/feedback';
import { useNumpadKeyboard } from '../../logic/useNumpadKeyboard';
import { useBackHandler } from '../../logic/androidBack';
import { ensureCustomerForUdhaarBill, normalizePhoneKey } from '../../logic/udhaar';
import {
  finalizeBill,
  type BillDraft,
  type BillTotalsResult,
  type FinalizeBillResult,
} from '../../logic/billing';
import {
  calculateCashChange,
  getExistingUdhaarCustomers,
  validateSplitPayment,
  type UdhaarCustomerSummary,
} from '../../logic/billingFlow';
import type { CartItem } from './types';

interface PaymentScreenProps {
  draft: BillDraft;
  cart: CartItem[];
  totals: BillTotalsResult;
  approvalVerified: boolean;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onReturnHome: () => void;
  onBackToCart: () => void;
  onBillFinalized: (result: FinalizeBillResult) => void;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
  draft,
  cart,
  totals,
  approvalVerified,
  currentUser,
  theme = 'light',
  onToggleTheme,
  onReturnHome,
  onBackToCart,
  onBillFinalized,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [paymentMode, setPaymentMode] = useState<PaymentMode>(draft.paymentMode || 'cash');
  // Cash tendered input as rupee string (default to exact rupees of total so display & input match)
  const totalRupeesInt = Math.round(totals.totalPaise / 100);
  const [cashStr, setCashStr] = useState<string>(() => String(totalRupeesInt));

  // Udhaar customer fields
  const [udhaarSearch, setUdhaarSearch] = useState<string>('');
  const [existingCustomers, setExistingCustomers] = useState<UdhaarCustomerSummary[]>([]);
  const [customerName, setCustomerName] = useState<string>(draft.customerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(draft.customerPhone || '');

  // Split (Cash + UPI) fields in rupee strings
  const halfRupees = Math.floor(totalRupeesInt / 2);
  const [splitCashStr, setSplitCashStr] = useState<string>(String(halfRupees));
  const [splitUpiStr, setSplitUpiStr] = useState<string>(String(totalRupeesInt - halfRupees));

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [creditLimitApproved, setCreditLimitApproved] = useState<boolean>(false);
  const [isLimitApprovalOpen, setIsLimitApprovalOpen] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  useEffect(() => {
    getExistingUdhaarCustomers()
      .then((list) => setExistingCustomers(list))
      .catch(() => setExistingCustomers([]));
  }, []);

  const cashReceivedPaise = rupeesToPaise(Number(cashStr) || 0);
  const cashChange = useMemo(
    () => calculateCashChange(totals.totalPaise, cashReceivedPaise),
    [totals.totalPaise, cashReceivedPaise]
  );

  const splitCashPaise = rupeesToPaise(Number(splitCashStr) || 0);
  const splitUpiPaise = rupeesToPaise(Number(splitUpiStr) || 0);
  const splitCheck = useMemo(
    () => validateSplitPayment(totals.totalPaise, splitCashPaise, splitUpiPaise),
    [totals.totalPaise, splitCashPaise, splitUpiPaise]
  );

  const filteredUdhaarCustomers = useMemo(() => {
    const q = udhaarSearch.trim().toLowerCase();
    if (!q) return existingCustomers.slice(0, 5);
    return existingCustomers
      .filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) || c.customerPhone.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [existingCustomers, udhaarSearch]);

  const matchedUdhaarCustomer = useMemo(() => {
    const phoneKey = normalizePhoneKey(customerPhone);
    if (phoneKey) {
      const byPhone = existingCustomers.find(
        (c) => normalizePhoneKey(c.customerPhone) === phoneKey
      );
      if (byPhone) return byPhone;
    }
    const nameKey = customerName.trim().toLowerCase();
    if (!nameKey) return undefined;
    return existingCustomers.find(
      (c) => c.customerName.trim().toLowerCase() === nameKey
    );
  }, [existingCustomers, customerPhone, customerName]);

  const customerCreditLimitPaise = matchedUdhaarCustomer?.creditLimitPaise || 0;
  const customerPendingPaise = matchedUdhaarCustomer?.pendingUdhaarPaise || 0;
  const projectedUdhaarPaise = customerPendingPaise + totals.totalPaise;
  const creditLimitExceeded =
    paymentMode === 'udhaar' &&
    customerCreditLimitPaise > 0 &&
    projectedUdhaarPaise > customerCreditLimitPaise;

  useEffect(() => {
    setCreditLimitApproved(false);
  }, [customerPhone, customerName, paymentMode]);

  const handleNumpadPress = useCallback((token: string) => {
    if (token === 'clear') {
      setCashStr('0');
      return;
    }
    if (token === 'backspace') {
      setCashStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
      return;
    }
    setCashStr((prev) => {
      if (prev === '0') {
        return token === '00' ? '0' : token;
      }
      if (prev.length >= 7) return prev;
      return prev + token;
    });
  }, []);

  const handleSplitCashChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setSplitCashStr(clean);
    const cashP = rupeesToPaise(Number(clean) || 0);
    const remP = Math.max(0, totals.totalPaise - cashP);
    setSplitUpiStr(String(Math.round(remP / 100)));
  };

  const handleSplitUpiChange = (val: string) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setSplitUpiStr(clean);
  };

  const handleConfirmBill = useCallback(async () => {
    if (isSubmitting) return;

    if (paymentMode === 'cash' && !cashChange.valid) {
      triggerFeedback('error', t('billing_flow.err_cash_less'));
      return;
    }

    if (paymentMode === 'udhaar') {
      if (!customerName.trim() || !customerPhone.trim()) {
        triggerFeedback('error', t('billing_flow.err_udhaar_customer_required'));
        return;
      }
      if (creditLimitExceeded && !creditLimitApproved) {
        triggerFeedback(
          'error',
          t('udhaar.credit_limit_warning', {
            limit: formatRupees(customerCreditLimitPaise),
            projected: formatRupees(projectedUdhaarPaise),
          })
        );
        setIsLimitApprovalOpen(true);
        return;
      }
    }

    if (paymentMode === 'split' && !splitCheck.valid) {
      triggerFeedback('error', t('billing_flow.err_split_mismatch'));
      return;
    }

    try {
      setIsSubmitting(true);
      const finalDraft: BillDraft = {
        ...draft,
        paymentMode,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        cashReceivedPaise:
          paymentMode === 'cash'
            ? cashReceivedPaise
            : paymentMode === 'split'
              ? splitCashPaise
              : 0,
        splitDetails:
          paymentMode === 'split'
            ? JSON.stringify({
                cashPaise: splitCashPaise,
                upiPaise: splitUpiPaise,
                udhaarPaise: 0,
              })
            : undefined,
      };

      const result = await finalizeBill(finalDraft, currentUser, {
        approvalVerified: approvalVerified || creditLimitApproved,
      });
      if (paymentMode === 'udhaar') {
        await ensureCustomerForUdhaarBill(customerName.trim(), customerPhone.trim());
      }
      onBillFinalized(result);
    } catch (err: any) {
      console.error('Failed to finalize bill:', err);
      triggerFeedback('error', err?.message || t('errors.generic_error'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    paymentMode,
    cashChange.valid,
    customerName,
    customerPhone,
    splitCheck.valid,
    creditLimitExceeded,
    creditLimitApproved,
    customerCreditLimitPaise,
    projectedUdhaarPaise,
    draft,
    cashReceivedPaise,
    splitCashPaise,
    splitUpiPaise,
    currentUser,
    approvalVerified,
    onBillFinalized,
    t,
  ]);

  const handleKeyboardDigit = useCallback(
    (digit: string) => {
      handleNumpadPress(digit);
    },
    [handleNumpadPress]
  );

  const handleKeyboardBackspace = useCallback(() => {
    handleNumpadPress('backspace');
  }, [handleNumpadPress]);

  const handleKeyboardClear = useCallback(() => {
    handleNumpadPress('clear');
  }, [handleNumpadPress]);

  const handleKeyboardEnter = useCallback(() => {
    if (cashChange.valid && !isSubmitting) {
      void handleConfirmBill();
    }
  }, [cashChange.valid, isSubmitting, handleConfirmBill]);

  useNumpadKeyboard({
    onDigit: handleKeyboardDigit,
    onBackspace: handleKeyboardBackspace,
    onClear: handleKeyboardClear,
    onEnter: handleKeyboardEnter,
    disabled: paymentMode !== 'cash' || isSubmitting,
  });

  useBackHandler(true, onBackToCart);

  const returnHomeBtn = tButton('home.return_home_btn');
  const modeCashBtn = tButton('billing_flow.mode_cash');
  const modeUpiBtn = tButton('billing_flow.mode_upi');
  const modeUdhaarBtn = tButton('billing_flow.mode_udhaar');
  const modeSplitBtn = tButton('billing_flow.mode_split');
  const backBtn = tButton('suppliers.btn_back');
  const confirmBtn = tButton('billing_flow.btn_confirm_bill');

  return (
    <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col antialiased select-none overflow-x-clip transition-colors">
      {/* Compact Mobile Header */}
      <MobileTopBar
        title={t('billing_flow.pay_items_title')}
        subtitle={`${t('dawai_becho.items_count', { count: cart.length })} · ${formatRupees(totals.totalPaise)}`}
        onBack={onBackToCart}
        backIcon="arrow_back"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* Desktop Top Header */}
      <header className="hidden lg:block fixed top-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-3">
          <div className="flex items-center gap-space-lg min-w-0">
            <span className="font-headline-lg text-headline-lg font-extrabold text-primary tracking-tight">
              HOSPIVO
            </span>
            {shopName && (
              <>
                <div className="hidden sm:block h-8 w-0.5 bg-outline-variant" />
                <div className="hidden sm:flex flex-col min-w-0">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                    {shopName}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {t('dawai_becho.page_title')}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-space-md shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-space-xs bg-primary-container text-on-primary-container font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{returnHomeBtn.main}</span>
            </button>

            <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-low">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                {modeLabel}
              </span>
            </div>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-2xl" />
              </button>
            )}

            <FullscreenButton className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer" />

            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="hidden sm:inline font-title-hinglish text-title-hinglish text-on-surface font-bold">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-2 lg:pt-20 pb-[max(1rem,env(safe-area-inset-bottom))] flex-1 bg-background flex flex-col min-h-0">
        <div className="flex-1 w-full max-w-[1440px] mx-auto p-gutter-compact flex flex-col justify-between gap-space-sm lg:h-[calc(100vh-5rem)] min-h-0">
          {/* Two Columns: Left 42% (5 cols) Bill Summary, Right 58% (7 cols) Payment */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md flex-1 min-h-0">
            {/* LEFT COLUMN: Bill Review & Grand Total Display */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-surface-container-lowest rounded-xl shadow-md p-4 sm:p-space-lg border border-outline-variant/40 min-h-0 min-w-0">
              <div className="flex flex-col min-h-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-space-sm mb-space-sm border-b border-outline-variant/30 shrink-0">
                  <div className="flex flex-col min-w-0">
                    <span className="font-headline-md text-lg sm:text-headline-md text-on-surface font-bold break-words">
                      {t('billing_flow.pay_items_title')}
                    </span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant break-words">
                      {t('billing_flow.pay_items_sub')}
                    </span>
                  </div>
                  <div className="flex items-center gap-space-xs px-space-sm py-1 bg-surface-container rounded-lg shrink-0">
                    <Icon name="receipt_long" className="text-primary text-2xl shrink-0" />
                    <span className="font-title-hinglish text-sm sm:text-title-hinglish text-on-surface font-bold">
                      {t('dawai_becho.items_count', { count: cart.length })}
                    </span>
                  </div>
                </div>

                {/* Items List */}
                <div className="flex flex-col gap-space-xs overflow-y-auto flex-1 pr-1">
                  {cart.map((item, idx) => {
                    const comp = totals.lines[idx];
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 p-3 sm:p-space-md bg-surface-container-low rounded-xl min-h-[60px] min-w-0"
                      >
                        <div className="flex items-center gap-space-sm min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shrink-0">
                            <Icon name="medication" className="text-2xl" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-title-hinglish text-sm sm:text-title-hinglish text-on-surface font-bold truncate">
                              {item.medicine.name} {item.medicine.strength}
                            </span>
                            <span className="font-label-sub-english text-xs sm:text-sm text-on-surface-variant">
                              {item.qtyInput}{' '}
                              {item.unitMode === 'pack'
                                ? t('dawai_becho.unit_strip')
                                : t('dawai_becho.unit_loose')}
                            </span>
                          </div>
                        </div>
                        <span className="font-title-hinglish text-sm sm:text-title-hinglish text-on-surface font-bold shrink-0 whitespace-nowrap">
                          {comp ? formatRupees(comp.lineTotalPaise) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Display Card (>= 36px always visible) */}
              <div className="p-4 sm:p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-wrap items-center justify-between gap-2 mt-space-sm border border-outline-variant/50 shrink-0 min-w-0">
                <div className="flex flex-col min-w-0">
                  <span className="font-title-hinglish text-base sm:text-title-hinglish text-on-surface-variant font-bold">
                    {t('billing_flow.pay_total_title')}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {t('billing_flow.pay_total_sub')}
                  </span>
                </div>
                <span className="font-display-total text-[34px] sm:text-[44px] leading-none font-extrabold text-primary tracking-tight shrink-0">
                  {formatRupees(totals.totalPaise)}
                </span>
              </div>
            </div>

            {/* RIGHT COLUMN: 4 Payment Mode Tabs + Active Panel */}
            <div className="lg:col-span-7 flex flex-col gap-space-sm bg-surface-container-lowest rounded-xl shadow-md p-4 sm:p-space-lg border border-outline-variant/40 min-h-0 min-w-0">
              {/* 4 Chunky Square Payment Mode Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-space-sm shrink-0">
                {/* Cash */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={`min-h-[68px] py-2.5 px-2 rounded-xl flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer min-w-0 ${
                    paymentMode === 'cash'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                    <Icon
                      name={paymentMode === 'cash' ? 'check_circle' : 'payments'}
                      className={`text-xl sm:text-2xl shrink-0 ${paymentMode === 'cash' ? '' : 'text-primary'}`}
                    />
                    <span className="font-title-hinglish text-sm sm:text-title-hinglish font-bold leading-tight break-words">
                      {modeCashBtn.main}
                    </span>
                  </div>
                  {modeCashBtn.sub && (
                    <span
                      className={`font-label-sub-english text-[11px] sm:text-xs leading-tight mt-0.5 break-words max-w-full ${
                        paymentMode === 'cash' ? 'text-primary-fixed' : 'text-on-surface-variant'
                      }`}
                    >
                      {modeCashBtn.sub}
                    </span>
                  )}
                </button>

                {/* UPI */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('upi')}
                  className={`min-h-[68px] py-2.5 px-2 rounded-xl flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer min-w-0 ${
                    paymentMode === 'upi'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                    <Icon
                      name={paymentMode === 'upi' ? 'check_circle' : 'qr_code_scanner'}
                      className={`text-xl sm:text-2xl shrink-0 ${paymentMode === 'upi' ? '' : 'text-secondary'}`}
                    />
                    <span className="font-title-hinglish text-sm sm:text-title-hinglish font-bold leading-tight break-words">
                      {modeUpiBtn.main}
                    </span>
                  </div>
                  {modeUpiBtn.sub && (
                    <span
                      className={`font-label-sub-english text-[11px] sm:text-xs leading-tight mt-0.5 break-words max-w-full ${
                        paymentMode === 'upi' ? 'text-primary-fixed' : 'text-on-surface-variant'
                      }`}
                    >
                      {modeUpiBtn.sub}
                    </span>
                  )}
                </button>

                {/* Udhaar */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('udhaar')}
                  className={`min-h-[68px] py-2.5 px-2 rounded-xl flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer min-w-0 ${
                    paymentMode === 'udhaar'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                    <Icon
                      name={paymentMode === 'udhaar' ? 'check_circle' : 'menu_book'}
                      className={`text-xl sm:text-2xl shrink-0 ${paymentMode === 'udhaar' ? '' : 'text-tertiary'}`}
                    />
                    <span className="font-title-hinglish text-sm sm:text-title-hinglish font-bold leading-tight break-words">
                      {modeUdhaarBtn.main}
                    </span>
                  </div>
                  {modeUdhaarBtn.sub && (
                    <span
                      className={`font-label-sub-english text-[11px] sm:text-xs leading-tight mt-0.5 break-words max-w-full ${
                        paymentMode === 'udhaar' ? 'text-primary-fixed' : 'text-on-surface-variant'
                      }`}
                    >
                      {modeUdhaarBtn.sub}
                    </span>
                  )}
                </button>

                {/* Aadha-Aadha (Split) */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('split')}
                  className={`min-h-[68px] py-2.5 px-2 rounded-xl flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer min-w-0 ${
                    paymentMode === 'split'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                    <Icon
                      name={paymentMode === 'split' ? 'check_circle' : 'call_split'}
                      className={`text-xl sm:text-2xl shrink-0 ${paymentMode === 'split' ? '' : 'text-on-surface-variant'}`}
                    />
                    <span className="font-title-hinglish text-sm sm:text-title-hinglish font-bold leading-tight break-words">
                      {modeSplitBtn.main}
                    </span>
                  </div>
                  {modeSplitBtn.sub && (
                    <span
                      className={`font-label-sub-english text-[11px] sm:text-xs leading-tight mt-0.5 break-words max-w-full ${
                        paymentMode === 'split' ? 'text-primary-fixed' : 'text-on-surface-variant'
                      }`}
                    >
                      {modeSplitBtn.sub}
                    </span>
                  )}
                </button>
              </div>

              {/* MODE 1: CASH CALCULATOR */}
              {paymentMode === 'cash' && (
                <div className="flex flex-col gap-space-sm flex-1 min-h-0">
                  {/* Desktop Cash Received Summary Bar (hidden on mobile to prevent conflicting duplicate display) */}
                  <div className="hidden lg:flex h-16 px-space-md rounded-xl bg-surface-container-low items-center justify-between shadow-inner shrink-0 border border-outline-variant/40">
                    <div className="flex flex-col">
                      <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                        {t('billing_flow.cash_tendered_label')}
                      </span>
                      <span className="font-label-sub-english text-xs text-on-surface-variant">
                        {t('billing_flow.cash_tendered_sub')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCashStr(String(totalRupeesInt))}
                        className="px-3 py-1.5 rounded-lg bg-surface-container text-primary text-xs font-bold hover:bg-primary-fixed cursor-pointer"
                      >
                        {t('billing_flow.btn_exact_cash')}
                      </button>
                      <span className="font-headline-lg text-headline-lg text-primary font-extrabold tracking-wide">
                        {formatRupees(cashReceivedPaise)}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Native Numeric Cash Input + Quick Denominations (single unified source of truth) */}
                  <div className="lg:hidden flex flex-col gap-2.5 min-w-0">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-on-surface leading-tight">
                          {t('billing_flow.cash_tendered_label')}
                        </span>
                        <span className="text-xs text-on-surface-variant leading-tight">
                          {t('billing_flow.cash_tendered_sub')}
                        </span>
                      </div>
                      <span className="text-sm font-extrabold text-primary shrink-0 whitespace-nowrap">
                        {formatRupees(cashReceivedPaise)}
                      </span>
                    </div>

                    <div className="w-full h-15 px-3.5 rounded-2xl bg-surface-container-lowest border-2 border-primary flex items-center justify-between gap-2 shadow-xs min-w-0">
                      <Icon name="currency_rupee" className="text-primary text-[24px] shrink-0" />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={cashStr === '0' ? '' : cashStr}
                        placeholder="0"
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, '').slice(0, 7);
                          setCashStr(clean || '0');
                        }}
                        aria-label={t('billing_flow.cash_tendered_label')}
                        className="w-full min-w-0 bg-transparent text-2xl font-extrabold text-primary outline-none placeholder:text-outline/50"
                      />
                      {cashStr !== '0' && (
                        <button
                          type="button"
                          onClick={() => handleNumpadPress('clear')}
                          aria-label={tButton('common.btn_clear').main}
                          className="w-10 h-10 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Icon name="close" className="text-[20px]" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setCashStr(String(totalRupeesInt))}
                        className="min-h-[48px] px-1.5 rounded-xl bg-primary-fixed text-on-primary-fixed font-bold text-xs flex items-center justify-center text-center leading-tight active:scale-95 transition-all cursor-pointer"
                      >
                        {t('billing_flow.btn_exact_cash')}
                      </button>
                      {[100, 200, 500].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashStr(String((Number(cashStr) || 0) + amt))}
                          className="min-h-[48px] px-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-sm flex items-center justify-center active:scale-95 transition-all cursor-pointer border border-outline-variant/40"
                        >
                          +₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Desktop Touch Numpad */}
                  <div className="hidden lg:grid grid-cols-3 gap-space-xs flex-1 min-h-[240px]">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleNumpadPress(digit)}
                        className="min-h-[56px] rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface font-numpad-number text-numpad-number flex items-center justify-center shadow-sm active:translate-y-0.5 transition-all cursor-pointer border border-outline-variant/30"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleNumpadPress('clear')}
                      className="min-h-[56px] rounded-xl bg-error-container hover:brightness-95 text-on-error-container font-headline-md text-lg font-bold flex items-center justify-center gap-1 shadow-sm active:translate-y-0.5 transition-all cursor-pointer"
                    >
                      <Icon name="backspace" className="text-2xl" />
                      <span>{tButton('common.btn_clear').main}</span>
                    </button>
                  </div>

                  {/* Active State Card: ONLY Change to Return OR Cash Short (never overlapping) */}
                  {cashChange.valid ? (
                    <div className="min-h-[68px] py-3 px-4 rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 shadow-sm shrink-0 border bg-surface-container-low border-primary/30 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                          <Icon name="currency_exchange" className="text-2xl" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm sm:text-base text-on-surface font-bold leading-snug break-words">
                            {t('billing_flow.change_to_return')}
                          </span>
                          <span className="text-xs text-on-surface-variant leading-snug break-words">
                            {t('billing_flow.change_to_return_sub')}
                          </span>
                        </div>
                      </div>
                      <span className="text-xl sm:text-2xl font-extrabold text-primary shrink-0 whitespace-nowrap">
                        {formatRupees(cashChange.changePaise)}
                      </span>
                    </div>
                  ) : (
                    <div className="min-h-[68px] py-3 px-4 rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 shadow-sm shrink-0 border bg-error-container/50 border-error/40 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-error text-on-error flex items-center justify-center shrink-0">
                          <Icon name="error" className="text-2xl" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm sm:text-base text-error font-extrabold leading-snug break-words">
                            {t('billing_flow.cash_short_prefix')}
                          </span>
                          <span className="text-xs text-on-error-container leading-snug break-words">
                            {t('billing_flow.cash_tendered_sub')}
                          </span>
                        </div>
                      </div>
                      <span className="text-xl sm:text-2xl font-extrabold text-error shrink-0 whitespace-nowrap">
                        {formatRupees(cashChange.shortagePaise)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* MODE 2: UPI */}
              {paymentMode === 'upi' && (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8 rounded-2xl bg-surface-container-low border border-outline-variant/50">
                  <div className="w-20 h-20 rounded-2xl bg-secondary-fixed text-secondary flex items-center justify-center shadow-sm">
                    <Icon name="qr_code_scanner" className="text-[44px]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                      {t('billing_flow.upi_title')}
                    </h2>
                    <p className="font-body-md text-on-surface-variant max-w-md">
                      {t('billing_flow.upi_sub')}
                    </p>
                  </div>
                  <div className="px-6 py-3 rounded-xl bg-primary-fixed/40 text-primary font-headline-md font-extrabold flex items-center gap-2">
                    <Icon name="verified" className="text-2xl" />
                    <span>
                      {t('billing_flow.upi_mark_paid')} · {formatRupees(totals.totalPaise)}
                    </span>
                  </div>
                </div>
              )}

              {/* MODE 3: UDHAAR (Matching 16b_Pay_Udhaar.html) */}
              {paymentMode === 'udhaar' && (
                <div className="flex-1 flex flex-col gap-space-sm min-h-0">
                  {/* Search existing customers */}
                  <div className="h-14 px-space-md rounded-xl bg-surface-container-low flex items-center gap-space-sm shadow-inner border border-outline-variant/40 shrink-0">
                    <Icon name="search" className="text-2xl text-on-surface-variant" />
                    <input
                      {...textFieldProps('free', udhaarSearch, setUdhaarSearch)}
                      type="text"
                      placeholder={t('billing_flow.udhaar_search_placeholder')}
                      className="bg-transparent w-full text-on-surface font-body-md focus:outline-none placeholder:text-outline"
                    />
                  </div>

                  {/* Required Customer Name & Phone inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-on-surface-variant">
                        {t('billing_flow.udhaar_name_label')} <span className="text-error">*</span>
                      </label>
                      <input
                        {...textFieldProps('name', customerName, setCustomerName)}
                        type="text"
                        placeholder={t('billing_flow.udhaar_name_label')}
                        className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-on-surface-variant">
                        {t('billing_flow.udhaar_phone_label')} <span className="text-error">*</span>
                      </label>
                      <NumericLimitWarning value={customerPhone} maxLength={10} />
                      <input
                        {...textFieldProps('phone', customerPhone, setCustomerPhone)}
                        type="text"
                        placeholder={t('billing_flow.udhaar_phone_label')}
                        className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Credit limit warning banner */}
                  {creditLimitExceeded && !creditLimitApproved && (
                    <div className="p-3 rounded-xl bg-error-container text-on-error-container border border-error/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Icon name="warning" className="text-xl text-error shrink-0" />
                        <span>
                          {t('udhaar.credit_limit_warning', {
                            limit: formatRupees(customerCreditLimitPaise),
                            projected: formatRupees(projectedUdhaarPaise),
                          })}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsLimitApprovalOpen(true)}
                        className="px-3 py-1.5 rounded-lg bg-error text-on-error text-xs font-bold shrink-0 cursor-pointer"
                      >
                        {t('udhaar.credit_limit_approval_btn')}
                      </button>
                    </div>
                  )}

                  {/* Matching existing customers list */}
                  {filteredUdhaarCustomers.length > 0 && (
                    <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto min-h-0">
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                        {t('billing_flow.udhaar_existing_title')}
                      </span>
                      {filteredUdhaarCustomers.map((cust) => {
                        const isSelected =
                          customerName.trim().toLowerCase() === cust.customerName.toLowerCase() &&
                          customerPhone.trim() === cust.customerPhone;

                        return (
                          <div
                            key={cust.key}
                            onClick={() => {
                              setCustomerName(cust.customerName);
                              setCustomerPhone(cust.customerPhone);
                            }}
                            className={`min-h-[64px] p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${
                              isSelected
                                ? 'bg-surface-container-low border-2 border-primary shadow-sm'
                                : 'bg-surface-container-low/60 border-outline-variant/40 hover:bg-surface-container'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0 ${
                                  isSelected
                                    ? 'bg-primary-container text-on-primary-container'
                                    : 'bg-surface-container-highest text-on-surface-variant'
                                }`}
                              >
                                {isSelected ? (
                                  <Icon name="check_circle" className="text-xl" />
                                ) : (
                                  <span>{cust.customerName.charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-title-hinglish font-bold text-on-surface truncate">
                                  {cust.customerName}
                                </span>
                                <span className="text-sm text-on-surface-variant">
                                  {cust.customerPhone}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-title-hinglish font-bold text-tertiary text-sm">
                                {t('billing_flow.udhaar_pending_prefix')}{' '}
                                {formatRupees(cust.pendingUdhaarPaise)}
                              </span>
                              {cust.creditLimitPaise && cust.creditLimitPaise > 0 ? (
                                <div className="text-xs text-on-surface-variant font-medium">
                                  {t('udhaar.credit_limit_label')}{' '}
                                  {formatRupees(cust.creditLimitPaise)}
                                </div>
                              ) : null}
                              {isSelected && (
                                <div className="text-xs text-primary font-semibold">
                                  {t('billing_flow.udhaar_selected')}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* MODE 4: AADHA-AADHA (SPLIT) */}
              {paymentMode === 'split' && (
                <div className="flex-1 flex flex-col justify-center gap-4 sm:gap-5 p-4 sm:p-6 rounded-2xl bg-surface-container-low border border-outline-variant/50 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <label className="font-title-hinglish font-bold text-on-surface">
                        {t('billing_flow.split_cash_label')}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={splitCashStr}
                        onChange={(e) => handleSplitCashChange(e.target.value)}
                        className="min-h-[56px] py-2 px-4 rounded-xl bg-surface-container-lowest border-2 border-outline-variant text-on-surface font-headline-lg font-extrabold focus:outline-none focus:border-primary w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <label className="font-title-hinglish font-bold text-on-surface">
                        {t('billing_flow.split_upi_label')}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={splitUpiStr}
                        onChange={(e) => handleSplitUpiChange(e.target.value)}
                        className="min-h-[56px] py-2 px-4 rounded-xl bg-surface-container-lowest border-2 border-outline-variant text-on-surface font-headline-lg font-extrabold focus:outline-none focus:border-primary w-full"
                      />
                    </div>
                  </div>

                  <div
                    className={`p-3.5 sm:p-4 rounded-xl flex flex-wrap items-center justify-between gap-2 border min-w-0 ${
                      splitCheck.valid
                        ? 'bg-primary-fixed/30 border-primary/40 text-primary'
                        : 'bg-error-container/50 border-error/40 text-on-error-container'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-base sm:text-lg min-w-0">
                      <Icon name={splitCheck.valid ? 'check_circle' : 'error'} className="text-2xl shrink-0" />
                      <span className="break-words">
                        {splitCheck.valid
                          ? t('billing_flow.split_matched')
                          : `${t('billing_flow.split_remaining_label')} ${formatRupees(splitCheck.remainingPaise)}`}
                      </span>
                    </div>
                    <span className="font-headline-md text-base sm:text-lg font-extrabold shrink-0 whitespace-nowrap">
                      {formatRupees(splitCashPaise + splitUpiPaise)} / {formatRupees(totals.totalPaise)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PERSISTENT COUNTER ACTION BAR (zero vertical text clipping on phones) */}
          <div className="flex items-stretch justify-between pt-2 shrink-0 gap-2.5 sm:gap-4 w-full min-w-0">
            <button
              type="button"
              onClick={onBackToCart}
              disabled={isSubmitting}
              className="min-h-[56px] py-2.5 px-4 sm:px-6 rounded-xl bg-surface-container-highest hover:bg-surface-dim text-on-surface shadow-md flex items-center justify-center gap-2 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              <Icon name="arrow_back" className="text-2xl shrink-0" />
              <div className="flex flex-col text-left leading-snug">
                <span className="text-sm sm:text-base text-on-surface font-bold">
                  {backBtn.main}
                </span>
                {backBtn.sub && (
                  <span className="text-[11px] sm:text-xs text-on-surface-variant">
                    {backBtn.sub}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={handleConfirmBill}
              disabled={isSubmitting}
              className="flex-1 sm:flex-initial min-h-[56px] py-2.5 px-4 sm:px-7 rounded-xl bg-primary hover:bg-surface-tint text-on-primary shadow-xl flex items-center justify-center gap-2.5 active:translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 min-w-0"
            >
              <Icon name="check_circle" className="text-[26px] sm:text-[32px] leading-none shrink-0" />
              <div className="flex flex-col text-left leading-snug min-w-0">
                <span className="text-base sm:text-xl text-on-primary font-extrabold break-words">
                  {confirmBtn.main}
                </span>
                {confirmBtn.sub && (
                  <span className="text-[11px] sm:text-xs text-primary-fixed leading-snug break-words">
                    {confirmBtn.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
      </main>
      {/* Credit Limit Exceeded Approval Dialog */}
      <ApprovalDialog
        isOpen={isLimitApprovalOpen}
        actionCategory="discount_above_limit"
        recordDescription={`${customerName} (${formatRupees(projectedUdhaarPaise)} > ${formatRupees(customerCreditLimitPaise)})`}
        requesterName={userName}
        onApproved={() => {
          setIsLimitApprovalOpen(false);
          setCreditLimitApproved(true);
        }}
        onClose={() => setIsLimitApprovalOpen(false)}
      />
    </div>
  );
};

