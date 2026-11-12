import React, { useState, useEffect, useMemo } from 'react';
import type { DBUser, PaymentMode } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { useShop } from '../../logic/useShop';
import { formatRupees, rupeesToPaise } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import { triggerFeedback } from '../../logic/feedback';
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
  // Cash tendered input as rupee string (default to exact rupees of total)
  const totalRupeesInt = Math.round(totals.totalPaise / 100);
  const [cashStr, setCashStr] = useState<string>(String(totalRupeesInt));

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

  const handleNumpadPress = (token: string) => {
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
  };

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

  const handleConfirmBill = async () => {
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
        approvalVerified,
      });
      onBillFinalized(result);
    } catch (err: any) {
      console.error('Failed to finalize bill:', err);
      triggerFeedback('error', err?.message || t('errors.generic_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const returnHomeBtn = tButton('home.return_home_btn');
  const modeCashBtn = tButton('billing_flow.mode_cash');
  const modeUpiBtn = tButton('billing_flow.mode_upi');
  const modeUdhaarBtn = tButton('billing_flow.mode_udhaar');
  const modeSplitBtn = tButton('billing_flow.mode_split');
  const backBtn = tButton('suppliers.btn_back');
  const confirmBtn = tButton('billing_flow.btn_confirm_bill');

  return (
    <div className="w-full min-h-screen bg-surface text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
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
      <main className="w-full pt-20 flex-1 bg-background flex flex-col min-h-0">
        <div className="flex-1 w-full max-w-[1440px] mx-auto p-gutter-compact flex flex-col justify-between gap-space-sm lg:h-[calc(100vh-5rem)] min-h-0">
          {/* Two Columns: Left 42% (5 cols) Bill Summary, Right 58% (7 cols) Payment */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md flex-1 min-h-0">
            {/* LEFT COLUMN: Bill Review & Grand Total Display */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-surface-container-lowest rounded-xl shadow-md p-space-lg border border-outline-variant/40 min-h-0">
              <div className="flex flex-col min-h-0 flex-1">
                <div className="flex items-center justify-between pb-space-sm mb-space-sm border-b border-outline-variant/30 shrink-0">
                  <div className="flex flex-col">
                    <span className="font-headline-md text-headline-md text-on-surface font-bold">
                      {t('billing_flow.pay_items_title')}
                    </span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('billing_flow.pay_items_sub')}
                    </span>
                  </div>
                  <div className="flex items-center gap-space-xs px-space-sm py-1 bg-surface-container rounded-lg shrink-0">
                    <Icon name="receipt_long" className="text-primary text-2xl" />
                    <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
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
                        className="flex items-center justify-between p-space-md bg-surface-container-low rounded-xl min-h-[60px]"
                      >
                        <div className="flex items-center gap-space-sm min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shrink-0">
                            <Icon name="medication" className="text-2xl" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                              {item.medicine.name} {item.medicine.strength}
                            </span>
                            <span className="font-label-sub-english text-sm text-on-surface-variant">
                              {item.qtyInput}{' '}
                              {item.unitMode === 'pack'
                                ? t('dawai_becho.unit_strip')
                                : t('dawai_becho.unit_loose')}
                            </span>
                          </div>
                        </div>
                        <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold shrink-0">
                          {comp ? formatRupees(comp.lineTotalPaise) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Display Card (>= 36px always visible) */}
              <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex items-center justify-between mt-space-sm border border-outline-variant/50 shrink-0">
                <div className="flex flex-col">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface-variant font-bold">
                    {t('billing_flow.pay_total_title')}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {t('billing_flow.pay_total_sub')}
                  </span>
                </div>
                <span className="font-display-total text-[36px] sm:text-[44px] leading-none font-extrabold text-primary tracking-tight">
                  {formatRupees(totals.totalPaise)}
                </span>
              </div>
            </div>

            {/* RIGHT COLUMN: 4 Payment Mode Tabs + Active Panel */}
            <div className="lg:col-span-7 flex flex-col gap-space-sm bg-surface-container-lowest rounded-xl shadow-md p-space-lg border border-outline-variant/40 min-h-0">
              {/* 4 Chunky Square Payment Mode Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm shrink-0">
                {/* Cash */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={`h-20 min-h-[56px] rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    paymentMode === 'cash'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Icon
                      name={paymentMode === 'cash' ? 'check_circle' : 'payments'}
                      className={`text-2xl ${paymentMode === 'cash' ? '' : 'text-primary'}`}
                    />
                    <span className="font-title-hinglish text-title-hinglish font-bold">
                      {modeCashBtn.main}
                    </span>
                  </div>
                  {modeCashBtn.sub && (
                    <span
                      className={`font-label-sub-english text-xs ${
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
                  className={`h-20 min-h-[56px] rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    paymentMode === 'upi'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Icon
                      name={paymentMode === 'upi' ? 'check_circle' : 'qr_code_scanner'}
                      className={`text-2xl ${paymentMode === 'upi' ? '' : 'text-secondary'}`}
                    />
                    <span className="font-title-hinglish text-title-hinglish font-bold">
                      {modeUpiBtn.main}
                    </span>
                  </div>
                  {modeUpiBtn.sub && (
                    <span
                      className={`font-label-sub-english text-xs ${
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
                  className={`h-20 min-h-[56px] rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    paymentMode === 'udhaar'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Icon
                      name={paymentMode === 'udhaar' ? 'check_circle' : 'menu_book'}
                      className={`text-2xl ${paymentMode === 'udhaar' ? '' : 'text-tertiary'}`}
                    />
                    <span className="font-title-hinglish text-title-hinglish font-bold">
                      {modeUdhaarBtn.main}
                    </span>
                  </div>
                  {modeUdhaarBtn.sub && (
                    <span
                      className={`font-label-sub-english text-xs ${
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
                  className={`h-20 min-h-[56px] rounded-xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    paymentMode === 'split'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-low text-on-surface shadow-sm hover:bg-surface-container'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Icon
                      name={paymentMode === 'split' ? 'check_circle' : 'call_split'}
                      className={`text-2xl ${paymentMode === 'split' ? '' : 'text-on-surface-variant'}`}
                    />
                    <span className="font-title-hinglish text-title-hinglish font-bold">
                      {modeSplitBtn.main}
                    </span>
                  </div>
                  {modeSplitBtn.sub && (
                    <span
                      className={`font-label-sub-english text-xs ${
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
                  {/* Diye gaye paise display */}
                  <div className="h-16 px-space-md rounded-xl bg-surface-container-low flex items-center justify-between shadow-inner shrink-0 border border-outline-variant/40">
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

                  {/* Touch Numpad */}
                  <div className="grid grid-cols-3 gap-space-xs flex-1 min-h-[240px]">
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

                  {/* Bold Return Change Highlight */}
                  <div
                    className={`h-16 px-space-md rounded-xl flex items-center justify-between shadow-sm shrink-0 border ${
                      cashChange.valid
                        ? 'bg-surface-container-low border-primary/30'
                        : 'bg-error-container/50 border-error/40'
                    }`}
                  >
                    <div className="flex items-center gap-space-sm">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          cashChange.valid
                            ? 'bg-primary text-on-primary'
                            : 'bg-error text-on-error'
                        }`}
                      >
                        <Icon name="currency_exchange" className="text-2xl" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                          {t('billing_flow.change_to_return')}
                        </span>
                        <span className="font-label-sub-english text-xs text-on-surface-variant">
                          {t('billing_flow.change_to_return_sub')}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`font-headline-lg text-headline-lg font-extrabold ${
                        cashChange.valid ? 'text-primary' : 'text-error'
                      }`}
                    >
                      {cashChange.valid
                        ? `${t('billing_flow.change_return_prefix')} ${formatRupees(cashChange.changePaise)}`
                        : `${t('billing_flow.cash_short_prefix')} ${formatRupees(cashChange.shortagePaise)}`}
                    </span>
                  </div>
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
                      <input
                        {...textFieldProps('phone', customerPhone, setCustomerPhone)}
                        type="text"
                        placeholder={t('billing_flow.udhaar_phone_label')}
                        className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

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
                <div className="flex-1 flex flex-col justify-center gap-5 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="font-title-hinglish font-bold text-on-surface">
                        {t('billing_flow.split_cash_label')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={splitCashStr}
                        onChange={(e) => handleSplitCashChange(e.target.value)}
                        className="h-16 px-4 rounded-xl bg-surface-container-lowest border-2 border-outline-variant text-on-surface font-headline-lg font-extrabold focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="font-title-hinglish font-bold text-on-surface">
                        {t('billing_flow.split_upi_label')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={splitUpiStr}
                        onChange={(e) => handleSplitUpiChange(e.target.value)}
                        className="h-16 px-4 rounded-xl bg-surface-container-lowest border-2 border-outline-variant text-on-surface font-headline-lg font-extrabold focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-xl flex items-center justify-between border ${
                      splitCheck.valid
                        ? 'bg-primary-fixed/30 border-primary/40 text-primary'
                        : 'bg-error-container/50 border-error/40 text-on-error-container'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-lg">
                      <Icon name={splitCheck.valid ? 'check_circle' : 'error'} className="text-2xl" />
                      <span>
                        {splitCheck.valid
                          ? t('billing_flow.split_matched')
                          : `${t('billing_flow.split_remaining_label')} ${formatRupees(splitCheck.remainingPaise)}`}
                      </span>
                    </div>
                    <span className="font-headline-md font-extrabold">
                      {formatRupees(splitCashPaise + splitUpiPaise)} / {formatRupees(totals.totalPaise)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PERSISTENT COUNTER ACTION BAR (64px Tall Buttons >= 56px) */}
          <div className="flex items-center justify-between pt-space-xs shrink-0 gap-4">
            <button
              type="button"
              onClick={onBackToCart}
              disabled={isSubmitting}
              className="h-16 min-h-[56px] px-space-lg sm:px-space-xl rounded-xl bg-surface-container-highest hover:bg-surface-dim text-on-surface shadow-md flex items-center gap-space-sm active:translate-y-0.5 transition-all cursor-pointer"
            >
              <Icon name="arrow_back" className="text-2xl" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                  {backBtn.main}
                </span>
                {backBtn.sub && (
                  <span className="font-label-sub-english text-xs text-on-surface-variant">
                    {backBtn.sub}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={handleConfirmBill}
              disabled={isSubmitting}
              className="h-16 min-h-[56px] px-space-lg sm:px-space-xl rounded-xl bg-primary hover:bg-surface-tint text-on-primary shadow-xl flex items-center gap-space-md active:translate-y-0.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Icon name="check_circle" className="text-[36px] leading-none" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-button-text text-button-text text-on-primary font-bold">
                  {confirmBtn.main}
                </span>
                {confirmBtn.sub && (
                  <span className="font-label-sub-english text-xs text-primary-fixed">
                    {confirmBtn.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

