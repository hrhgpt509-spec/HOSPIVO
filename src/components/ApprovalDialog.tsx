import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../db';
import { addAudit } from '../db/audit';
import {
  verifyApprovalPin,
  DEFAULT_APPROVAL_RULES_LIST,
  type ApprovalActionCategory,
} from '../logic/approvals';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { triggerFeedback } from '../logic/feedback';
import { useTranslation, tButton } from '../i18n';

export interface ApprovalDialogProps {
  isOpen: boolean;
  actionCategory: ApprovalActionCategory;
  recordDescription: string;
  requesterName?: string;
  onApproved: () => void;
  onClose: () => void;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  isOpen,
  actionCategory,
  recordDescription,
  requesterName = 'Staff',
  onApproved,
  onClose,
}) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState<string>('');
  const [shopName, setShopName] = useState<string>('Shree Medical Store');
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lockMinutes, setLockMinutes] = useState<number>(0);

  const clearBtn = tButton('common.btn_clear');
  const wapasBtn = tButton('dialogs.btn_wapas');

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setHasError(false);
      setErrorMessage('');
      setLockMinutes(0);
      return;
    }

    db.shop
      .toCollection()
      .first()
      .then((s) => {
        if (s?.name) setShopName(s.name);
      });
  }, [isOpen]);

  const categoryRule = DEFAULT_APPROVAL_RULES_LIST.find((r) => r.category === actionCategory);
  const categoryTitle = categoryRule ? t(categoryRule.labelKey) : t('dialogs.safe_action');

  const handleVerify = useCallback(
    async (pinToVerify: string) => {
      const res = await verifyApprovalPin(pinToVerify);

      if (res.ok) {
        // Success: write audit log entry with fixed English code, trigger sound/flash, and notify parent
        try {
          await addAudit(
            requesterName,
            'approval_granted',
            actionCategory,
            `Approved action: ${recordDescription}`
          );
        } catch (err) {
          console.error('Failed to log approval audit:', err);
        }

        triggerFeedback('success', t('dialogs.ijazat_pin_success'), 'Approved');
        setPin('');
        setHasError(false);
        setErrorMessage('');
        onApproved();
      } else {
        triggerFeedback('error', t('dialogs.ijazat_pin_wrong'));
        setPin('');
        setHasError(true);
        if (res.status === 'locked') {
          setLockMinutes(res.minutesLeft);
          setErrorMessage(t('dialogs.ijazat_pin_locked', { minutes: res.minutesLeft }));
        } else {
          setErrorMessage(
            res.triesLeft > 0
              ? `${t('dialogs.ijazat_pin_wrong')} (${res.triesLeft})`
              : t('dialogs.ijazat_pin_wrong')
          );
        }
      }
    },
    [actionCategory, recordDescription, requesterName, onApproved, t]
  );

  const handleAddDigit = useCallback(
    (digit: string) => {
      if (!isOpen || lockMinutes > 0) return;
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        setHasError(false);
        setErrorMessage('');
        if (next.length === 4) {
          setTimeout(() => handleVerify(next), 60);
        }
        return next;
      });
    },
    [isOpen, lockMinutes, handleVerify]
  );

  const handleBackspace = useCallback(() => {
    if (!isOpen || lockMinutes > 0) return;
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
    setErrorMessage('');
  }, [isOpen, lockMinutes]);

  const handleClear = useCallback(() => {
    if (!isOpen) return;
    setPin('');
    setHasError(false);
    setErrorMessage('');
  }, [isOpen]);

  usePinKeyboard({
    onDigit: isOpen ? handleAddDigit : () => {},
    onBackspace: isOpen ? handleBackspace : () => {},
    onClear: isOpen ? handleClear : () => {},
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-[#0f172a]/65 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fadeIn"
    >
      <div className="relative z-10 m-auto w-full max-w-[540px] bg-white dark:bg-gray-900 rounded-[24px] shadow-2xl p-6 sm:p-8 flex flex-col gap-4 border border-slate-200 dark:border-gray-800">
        
        {/* 1. Dialog Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#006b33] flex items-center justify-center text-white shadow-md">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
            <div className="flex flex-col">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#141e1a] dark:text-white tracking-tight leading-tight">
                {t('dialogs.ijazat_pin_title')}
              </h2>
              <span className="text-sm font-medium text-[#6e7a6e] dark:text-gray-400">
                {t('dialogs.ijazat_pin_sub')}
              </span>
            </div>
          </div>

          {/* Top-right Local mode chip */}
          <div className="flex items-center gap-1.5 bg-[#ebf6f0] dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-sm border border-slate-200 dark:border-gray-700">
            <span className="w-2.5 h-2.5 rounded-full bg-[#006b33] inline-block animate-pulse" />
            <span className="text-xs font-bold text-[#141e1a] dark:text-gray-200">{t('common.local_mode')}</span>
          </div>
        </div>

        {/* 2. Context Info Strip */}
        <div className="w-full bg-[#ebf6f0] dark:bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm border border-slate-200/80 dark:border-gray-700">
          <div className="flex items-center gap-3 text-[#ba1a1a]">
            <svg className="w-6 h-6 text-[#ba1a1a] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex flex-col text-left">
              <span className="text-lg font-bold text-[#ba1a1a] leading-tight">
                {recordDescription}
              </span>
              <span className="text-xs text-[#6e7a6e] dark:text-gray-400 leading-tight">
                {categoryTitle}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-[#141e1a] dark:text-gray-200">{shopName}</div>
            <div className="text-xs text-[#6e7a6e] dark:text-gray-400">{t('dialogs.ijazat_pin_required')}</div>
          </div>
        </div>

        {/* 3. PIN Dots Indicator */}
        <div className="flex justify-center items-center gap-4 my-1 py-1">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                idx < pin.length
                  ? 'bg-[#006b33] border-[#006b33] scale-110 shadow-sm ring-4 ring-[#006b33]/20'
                  : 'bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600 shadow-inner'
              }`}
            />
          ))}
        </div>

        {/* Feedback Alert */}
        {hasError && lockMinutes <= 0 && (
          <div className="px-4 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700 flex items-center justify-center gap-2 animate-bounce">
            <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-bold tracking-wide">{errorMessage || t('dialogs.ijazat_pin_wrong')}</span>
          </div>
        )}

        {lockMinutes > 0 && (
          <div className="px-4 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center gap-2 animate-pulse">
            <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-bold tracking-wide">
              {t('dialogs.ijazat_pin_locked', { minutes: lockMinutes })}
            </span>
          </div>
        )}

        {/* 4. Touch Number Pad (88px Height Blocks) */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleAddDigit(digit)}
              className="h-[88px] rounded-2xl bg-[#ebf6f0] dark:bg-gray-800 hover:bg-[#e0ebe5] dark:hover:bg-gray-700 active:scale-95 transition-all flex flex-col items-center justify-center shadow-sm text-[#141e1a] dark:text-white cursor-pointer border border-slate-200/80 dark:border-gray-700"
            >
              <span className="text-3xl font-bold">{digit}</span>
            </button>
          ))}

          {/* Saaf (Clear) */}
          <button
            type="button"
            onClick={handleClear}
            className="h-[88px] rounded-2xl bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all flex flex-col items-center justify-center shadow-sm cursor-pointer border border-slate-200/80 dark:border-gray-700"
          >
            <span className="text-lg font-bold text-[#141e1a] dark:text-white">{clearBtn.main}</span>
            {clearBtn.sub && (
              <span className="text-xs text-[#6e7a6e] dark:text-gray-400 font-semibold leading-none mt-0.5">{clearBtn.sub}</span>
            )}
          </button>

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleAddDigit('0')}
            className="h-[88px] rounded-2xl bg-[#ebf6f0] dark:bg-gray-800 hover:bg-[#e0ebe5] dark:hover:bg-gray-700 active:scale-95 transition-all flex flex-col items-center justify-center shadow-sm text-[#141e1a] dark:text-white cursor-pointer border border-slate-200/80 dark:border-gray-700"
          >
            <span className="text-3xl font-bold">0</span>
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            aria-label={t('common.backspace')}
            className="h-[88px] rounded-2xl bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center shadow-sm cursor-pointer border border-slate-200/80 dark:border-gray-700"
          >
            <svg className="w-8 h-8 text-[#141e1a] dark:text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* 5. Bottom Action: Wapas Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[56px] py-3 rounded-2xl bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm text-[#141e1a] dark:text-white cursor-pointer border border-slate-200 dark:border-gray-700"
        >
          <svg className="w-6 h-6 text-[#6e7a6e] dark:text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-bold leading-none">{wapasBtn.main}</span>
            {wapasBtn.sub && (
              <span className="text-xs text-[#6e7a6e] dark:text-gray-400 font-medium leading-none">{wapasBtn.sub}</span>
            )}
          </div>
        </button>

      </div>
    </div>
  );
};

export default ApprovalDialog;
