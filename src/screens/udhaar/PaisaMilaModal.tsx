import React, { useState, useEffect, useCallback } from 'react';
import type { DBUser, UdhaarPaymentMode } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { formatRupees, rupeesToPaise } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import { triggerFeedback } from '../../logic/feedback';
import { useNumpadKeyboard } from '../../logic/useNumpadKeyboard';
import { recordUdhaarPayment, type CustomerLedgerEntry } from '../../logic/udhaar';

interface PaisaMilaModalProps {
  isOpen: boolean;
  customer: CustomerLedgerEntry | null;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

export const PaisaMilaModal: React.FC<PaisaMilaModalProps> = ({
  isOpen,
  customer,
  currentUser,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();

  const [amountStr, setAmountStr] = useState<string>('0');
  const [mode, setMode] = useState<UdhaarPaymentMode>('cash');
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setAmountStr('0');
    setMode('cash');
    setNote('');
    setErrorMsg('');
    setIsSaving(false);
  }, [isOpen, customer]);

  const amountPaise = rupeesToPaise(Number(amountStr) || 0);
  const pendingPaise = customer?.pendingBalancePaise || 0;
  const remainingPaise = Math.max(0, pendingPaise - amountPaise);
  const isValidAmount = amountPaise > 0 && amountPaise <= pendingPaise;

  const handleDigit = useCallback((digit: string) => {
    setErrorMsg('');
    setAmountStr((prev) => {
      if (prev === '0') return digit;
      if (prev.length >= 7) return prev;
      return prev + digit;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setErrorMsg('');
    setAmountStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMsg('');
    setAmountStr('0');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!customer || isSaving) return;

    if (amountPaise <= 0) {
      const msg = t('udhaar.pm_err_zero');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
      return;
    }

    if (amountPaise > pendingPaise) {
      const msg = t('udhaar.pm_err_exceeds');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg('');
      const actor = currentUser?.name || currentUser?.role || 'User';
      await recordUdhaarPayment({
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        amountPaise,
        mode,
        note,
        receivedBy: String(actor),
      });
      triggerFeedback('success', t('udhaar.pm_toast_saved'));
      onSaved();
    } catch (err: any) {
      const msg = err?.message || t('errors.generic_error');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
    } finally {
      setIsSaving(false);
    }
  }, [customer, isSaving, amountPaise, pendingPaise, currentUser, mode, note, t, onSaved]);

  const handleKeyboardEnter = useCallback(() => {
    if (isValidAmount && !isSaving) {
      void handleConfirm();
    }
  }, [isValidAmount, isSaving, handleConfirm]);

  useNumpadKeyboard({
    onDigit: handleDigit,
    onBackspace: handleBackspace,
    onClear: handleClear,
    onEnter: handleKeyboardEnter,
    disabled: !isOpen || isSaving,
    allowInsideDialog: true,
  });

  if (!isOpen || !customer) return null;

  const backBtn = tButton('suppliers.btn_back');
  const confirmBtn = tButton('udhaar.pm_btn_confirm');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none p-4"
    >
      <div className="w-full max-w-[600px] max-h-[94vh] overflow-y-auto bg-surface-container-lowest rounded-[24px] shadow-2xl p-5 sm:p-7 flex flex-col gap-4 border border-outline-variant/40">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/40 pb-3">
          <div>
            <h2 className="font-headline-lg text-2xl sm:text-[28px] font-bold text-on-surface leading-tight">
              {t('udhaar.pm_title')}
            </h2>
            <span className="font-label-sub-english text-sm text-on-surface-variant font-medium">
              {t('udhaar.pm_sub')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full">
            <Icon name="payments" className="text-primary text-[22px]" />
            <span className="text-sm text-primary font-bold">{t('udhaar.pm_badge')}</span>
          </div>
        </div>

        {/* Customer Summary */}
        <div className="bg-surface-container-low rounded-2xl p-4 flex items-center justify-between border border-outline-variant/50 gap-3">
          <div className="min-w-0">
            <span className="text-xs sm:text-sm text-on-surface-variant block">
              {t('udhaar.pm_customer_label')}
            </span>
            <h3 className="font-title-hinglish text-lg sm:text-xl font-bold text-on-surface truncate">
              {customer.customerName}
            </h3>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs sm:text-sm text-on-surface-variant block">
              {t('udhaar.pm_balance_label')}
            </span>
            <div className="font-headline-md text-lg sm:text-xl font-extrabold text-error">
              {formatRupees(pendingPaise)}
            </div>
          </div>
        </div>

        {/* Payment Mode Toggle (Cash / UPI) */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode('cash')}
            className={`min-h-[56px] rounded-2xl font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-all border-2 ${
              mode === 'cash'
                ? 'bg-primary text-on-primary border-primary shadow-sm'
                : 'bg-surface-container-low text-on-surface border-outline-variant/50 hover:bg-surface-container'
            }`}
          >
            <Icon name="payments" className="text-2xl" />
            <span>{t('udhaar.pm_mode_cash')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('upi')}
            className={`min-h-[56px] rounded-2xl font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-all border-2 ${
              mode === 'upi'
                ? 'bg-primary text-on-primary border-primary shadow-sm'
                : 'bg-surface-container-low text-on-surface border-outline-variant/50 hover:bg-surface-container'
            }`}
          >
            <Icon name="qr_code_scanner" className="text-2xl" />
            <span>{t('udhaar.pm_mode_upi')}</span>
          </button>
        </div>

        {/* Amount Display */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="font-title-hinglish text-base sm:text-lg font-bold text-on-surface">
              {t('udhaar.pm_amount_label')}
            </label>
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                setAmountStr(String(Math.round(pendingPaise / 100)));
              }}
              className="px-3 py-1 rounded-lg bg-primary-fixed text-on-primary-fixed text-xs font-bold hover:brightness-95 cursor-pointer"
            >
              {t('udhaar.pm_btn_full')}
            </button>
          </div>
          <div className="w-full bg-surface-container-lowest border-2 border-primary rounded-2xl px-5 py-2.5 flex items-center justify-between shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-[28px] font-bold text-primary">
                {formatRupees(amountPaise)}
              </span>
            </div>
            <Icon name="currency_rupee" className="text-primary text-[28px]" />
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface-variant">
              {t('udhaar.pm_remaining_label')}{' '}
              <strong className="text-error font-extrabold">
                {formatRupees(remainingPaise)}
              </strong>
            </span>
            {amountPaise > pendingPaise && (
              <span className="text-xs font-bold text-error">{t('udhaar.pm_err_exceeds')}</span>
            )}
          </div>
        </div>

        {/* 3x4 Touch Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-16 sm:h-[68px] rounded-2xl bg-surface-container-low hover:bg-surface-container text-on-surface font-extrabold text-[28px] flex items-center justify-center border border-outline-variant/60 shadow-sm active:translate-y-0.5 transition-all cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-16 sm:h-[68px] rounded-2xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-extrabold text-[24px] flex items-center justify-center border border-outline-variant/60 shadow-sm active:translate-y-0.5 transition-all cursor-pointer"
          >
            C
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-16 sm:h-[68px] rounded-2xl bg-surface-container-low hover:bg-surface-container text-on-surface font-extrabold text-[28px] flex items-center justify-center border border-outline-variant/60 shadow-sm active:translate-y-0.5 transition-all cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label={t('common.backspace')}
            className="h-16 sm:h-[68px] rounded-2xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center border border-outline-variant/60 shadow-sm active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Icon name="backspace" className="text-[28px]" />
          </button>
        </div>

        {/* Optional Note */}
        <input
          {...textFieldProps('free', note, setNote)}
          type="text"
          placeholder={t('udhaar.pm_note_placeholder')}
          className="h-12 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {errorMsg && (
          <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-bold flex items-center gap-2">
            <Icon name="error" className="text-xl shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-14 min-h-[56px] rounded-2xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Icon name="arrow_back" className="text-2xl text-on-surface-variant" />
            <div className="flex flex-col text-left leading-none">
              <span className="font-title-hinglish text-base sm:text-lg font-bold">
                {backBtn.main}
              </span>
              {backBtn.sub && (
                <span className="text-xs text-on-surface-variant">{backBtn.sub}</span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSaving || !isValidAmount}
            className="flex-[1.3] h-14 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <Icon name="check_circle" className="text-2xl" />
            <div className="flex flex-col text-left leading-none">
              <span className="font-title-hinglish text-base sm:text-lg font-bold">
                {confirmBtn.main}
              </span>
              {confirmBtn.sub && (
                <span className="text-xs opacity-90">{confirmBtn.sub}</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

