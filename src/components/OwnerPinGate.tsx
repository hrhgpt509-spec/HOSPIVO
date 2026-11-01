import React, { useState, useEffect, useCallback } from 'react';
import { db, type DBUser } from '../db';
import { attemptUserLogin, getLoginLock } from '../logic/auth';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { triggerFeedback } from '../logic/feedback';
import { useTranslation, tButton } from '../i18n';

export interface OwnerPinGateProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const OwnerPinGate: React.FC<OwnerPinGateProps> = ({
  isOpen,
  onSuccess,
  onClose,
}) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState<string>('');
  const [ownerUser, setOwnerUser] = useState<DBUser | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lockCountdown, setLockCountdown] = useState<number>(0);

  const clearBtn = tButton('common.btn_clear');
  const wapasBtn = tButton('dialogs.btn_wapas');

  // Load Owner user from DB
  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setHasError(false);
      setErrorMessage('');
      return;
    }

    db.users
      .where('role')
      .equals('owner')
      .first()
      .then((owner) => {
        if (owner) {
          setOwnerUser(owner);
          getLoginLock(owner.id).then((lock) => {
            if (lock.isLocked) {
              setLockCountdown(lock.secondsLeft);
            }
          });
        }
      });
  }, [isOpen]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockCountdown <= 0) return;
    const interval = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setHasError(false);
          setErrorMessage('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockCountdown]);

  const handleVerify = useCallback(
    async (pinToVerify: string) => {
      if (!ownerUser) return;
      if (lockCountdown > 0) return;

      const res = await attemptUserLogin(ownerUser, pinToVerify);
      if (res.ok) {
        triggerFeedback('success', t('dialogs.owner_pin_verified'), 'Owner area');
        setPin('');
        setHasError(false);
        setErrorMessage('');
        onSuccess();
      } else {
        triggerFeedback('error', t('dialogs.owner_pin_wrong'));
        setPin('');
        setHasError(true);
        if (res.status === 'locked') {
          setLockCountdown(res.secondsLeft);
          setErrorMessage(t('login.lockout_msg', { minutes: res.minutesLeft }));
        } else {
          setErrorMessage(t('dialogs.owner_pin_wrong'));
        }
      }
    },
    [ownerUser, lockCountdown, onSuccess, t]
  );

  const handleAddDigit = useCallback(
    (digit: string) => {
      if (!isOpen || lockCountdown > 0) return;
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        setHasError(false);
        setErrorMessage('');
        if (next.length === 4) {
          // Verify automatically upon entering 4th digit
          setTimeout(() => handleVerify(next), 60);
        }
        return next;
      });
    },
    [isOpen, lockCountdown, handleVerify]
  );

  const handleBackspace = useCallback(() => {
    if (!isOpen || lockCountdown > 0) return;
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
    setErrorMessage('');
  }, [isOpen, lockCountdown]);

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
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 sm:p-8 max-w-[540px] w-full flex flex-col items-center z-20 border border-slate-200 dark:border-gray-800">
        
        {/* 1. Lock and Key Icon */}
        <div className="w-16 h-16 rounded-full bg-[#ebf6f0] dark:bg-gray-800 flex items-center justify-center text-[#006b33] dark:text-[#8ef9a7] shadow-sm mb-3">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>

        {/* 2. Heading & Micro English Label */}
        <h2 className="text-3xl font-extrabold text-[#141e1a] dark:text-white text-center leading-tight">
          {t('dialogs.owner_pin_title')}
        </h2>
        <p className="text-sm font-medium text-[#6e7a6e] dark:text-gray-400 text-center mt-1 mb-4">
          {t('dialogs.owner_pin_sub')}
        </p>

        {/* 3. PIN Dots Indicator */}
        <div className="flex items-center justify-center gap-4 my-2 py-1">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                idx < pin.length
                  ? 'bg-[#006b33] border-[#006b33] scale-110 shadow-sm'
                  : 'bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600 shadow-inner'
              }`}
            />
          ))}
        </div>

        {/* Feedback Messages */}
        {hasError && lockCountdown <= 0 && (
          <div className="mt-2 mb-2 px-4 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700 flex items-center gap-2 animate-bounce">
            <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-bold tracking-wide">{errorMessage || t('dialogs.owner_pin_wrong')}</span>
          </div>
        )}

        {lockCountdown > 0 && (
          <div className="mt-2 mb-2 px-4 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center gap-2 animate-pulse">
            <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-bold tracking-wide">
              {t('login.lockout_msg', { minutes: Math.ceil(lockCountdown / 60) })} ({lockCountdown}s)
            </span>
          </div>
        )}

        {/* 4. Very Large Number Pad (3x4 grid, 88px tall keys) */}
        <div className="grid grid-cols-3 gap-3 w-full mt-3 mb-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleAddDigit(digit)}
              className="h-[88px] rounded-2xl bg-[#ebf6f0] dark:bg-gray-800 hover:bg-[#e0ebe5] dark:hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center shadow-sm cursor-pointer border border-slate-200/80 dark:border-gray-700"
            >
              <span className="text-3xl font-bold text-[#141e1a] dark:text-white">{digit}</span>
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
            className="h-[88px] rounded-2xl bg-[#ebf6f0] dark:bg-gray-800 hover:bg-[#e0ebe5] dark:hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center shadow-sm cursor-pointer border border-slate-200/80 dark:border-gray-700"
          >
            <span className="text-3xl font-bold text-[#141e1a] dark:text-white">0</span>
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

export default OwnerPinGate;
