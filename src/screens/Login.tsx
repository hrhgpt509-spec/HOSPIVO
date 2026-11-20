import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, type DBUser } from '../db';
import { attemptUserLogin, getLoginLock } from '../logic/auth';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { triggerFeedback } from '../logic/feedback';
import { useTranslation, tButton } from '../i18n';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { FullscreenButton } from '../components/FullscreenButton';
import { enterFullscreen } from '../logic/fullscreen';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { useIsCompactViewport } from '../logic/useViewport';
import { useBackHandler } from '../logic/androidBack';
import {
  pullAndHydrateStaffAccounts,
  runSyncCycle,
  deduplicateLocalUsers,
  subscribeToSyncUpdates,
} from '../logic/cloudSync';
import { getCurrentCloudSession, createRecoveryOwnerPin } from '../logic/cloudAuth';

interface LoginProps {
  onLoginSuccess: (user: DBUser) => void;
  isLocked?: boolean;
  lockedUser?: DBUser | null;
  onUnlock?: () => void;
}

const AVATAR_PALETTES = [
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
];

export const Login: React.FC<LoginProps> = ({
  onLoginSuccess,
  isLocked = false,
  lockedUser = null,
  onUnlock,
}) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<DBUser[]>([]);
  const { name: shopName, ownerName: shopOwnerName } = useShop();
  const [selectedUser, setSelectedUser] = useState<DBUser | null>(null);
  const [pin, setPin] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lockPin, setLockPin] = useState<string>('');
  const [lockError, setLockError] = useState<boolean>(false);
  const [lockCountdownSeconds, setLockCountdownSeconds] = useState<number>(0);
  const [currentLiveTime, setCurrentLiveTime] = useState<Date>(() => new Date());
  const [isSyncingUsers, setIsSyncingUsers] = useState<boolean>(false);
  const [isPinFocused, setIsPinFocused] = useState<boolean>(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const lockPinInputRef = useRef<HTMLInputElement | null>(null);
  const isCompactViewport = useIsCompactViewport();

  // Recovery Owner PIN form states
  const [isCreatingOwner, setIsCreatingOwner] = useState<boolean>(false);
  const [createOwnerName, setCreateOwnerName] = useState<string>('');
  const [createOwnerPin, setCreateOwnerPin] = useState<string>('');
  const [createOwnerConfirmPin, setCreateOwnerConfirmPin] = useState<string>('');
  const [createOwnerError, setCreateOwnerError] = useState<string>('');
  const [isSavingOwner, setIsSavingOwner] = useState<boolean>(false);

  const btnSyncStaff = tButton('login.btn_sync_staff');
  const btnCreateOwnerPin = tButton('login.btn_create_owner_pin');
  const btnSaveOwnerPin = tButton('login.btn_save_owner_pin');

  useBackHandler(!isLocked && selectedUser !== null, () => {
    setSelectedUser(null);
    setPin('');
    setHasError(false);
    setErrorMessage('');
  });
  useBackHandler(isCreatingOwner, () => setIsCreatingOwner(false));
  const btnCancelCreateOwner = tButton('login.btn_cancel_create_owner');
  const btnBack = tButton('common.btn_back');

  const loadData = useCallback(async () => {
    try {
      await deduplicateLocalUsers().catch(() => {});
      const allUsers = await db.users.filter((u) => u.active !== false).toArray();
      allUsers.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
      setUsers(allUsers);
    } catch (err) {
      console.error('Failed to load login users:', err);
    }
  }, []);

  const handleSyncStaffAccounts = async () => {
    setIsSyncingUsers(true);
    try {
      const session = await getCurrentCloudSession();
      if (session.cloudShopUuid) {
        await pullAndHydrateStaffAccounts(session.cloudShopUuid);
        await runSyncCycle({ force: true });
      }

      await loadData();
      const updatedCount = await db.users.count();
      if (updatedCount > 0) {
        triggerFeedback('success', t('login.sync_staff_success'));
      } else {
        triggerFeedback('error', t('login.no_staff_found'));
      }
    } catch (err: any) {
      console.error('Failed to sync staff accounts:', err);
      triggerFeedback('error', t('login.sync_staff_failed'));
    } finally {
      setIsSyncingUsers(false);
    }
  };

  // Live timer for decorative panel clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load real users from database and refresh silently on incoming staff sync updates
  useEffect(() => {
    loadData();
    return subscribeToSyncUpdates(() => {
      void loadData();
    }, ['staff', 'shop']);
  }, [loadData]);

  // Timer countdown for lockout
  useEffect(() => {
    if (lockCountdownSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setHasError(false);
          setErrorMessage('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockCountdownSeconds]);

  // Active user for lock screen defaults to lockedUser or first user
  const activeLockUser = lockedUser || selectedUser || users[0] || null;

  // On entering lock screen, check if activeLockUser is locked
  useEffect(() => {
    if (isLocked && activeLockUser) {
      getLoginLock(activeLockUser.id).then((lock) => {
        if (lock.isLocked) {
          setLockCountdownSeconds(lock.secondsLeft);
        }
      });
    }
  }, [isLocked, activeLockUser]);

  const handleSelectUser = async (user: DBUser) => {
    setSelectedUser(user);
    setPin('');
    setHasError(false);
    setErrorMessage('');
    const lock = await getLoginLock(user.id);
    if (lock.isLocked) {
      setLockCountdownSeconds(lock.secondsLeft);
    } else {
      setLockCountdownSeconds(0);
    }
  };

  const handleSaveOwnerPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSavingOwner) return;

    const trimmedName = createOwnerName.trim();
    if (!trimmedName) {
      setCreateOwnerError(t('login.owner_name_required_error'));
      return;
    }
    if (createOwnerPin.length !== 4) {
      setCreateOwnerError(t('login.pin_length_error'));
      return;
    }
    if (createOwnerPin !== createOwnerConfirmPin) {
      setCreateOwnerError(t('login.pin_mismatch_error'));
      return;
    }

    setIsSavingOwner(true);
    setCreateOwnerError('');

    try {
      const res = await createRecoveryOwnerPin({
        name: trimmedName,
        pin: createOwnerPin,
      });

      if (!res.success || !res.user) {
        setCreateOwnerError(res.error || 'Failed to create owner PIN');
        return;
      }

      await loadData();
      setIsCreatingOwner(false);
      triggerFeedback('success', t('login.owner_created_success'));
      await handleSelectUser(res.user);
    } catch (err: any) {
      console.error('Failed to create recovery owner PIN:', err);
      setCreateOwnerError(err?.message || 'Failed to create owner PIN');
    } finally {
      setIsSavingOwner(false);
    }
  };

  const verifyLockPin = useCallback(
    async (pinToTest: string) => {
      if (!activeLockUser) return;
      const res = await attemptUserLogin(activeLockUser, pinToTest);
      if (res.status === 'ok') {
        triggerFeedback('success', t('login.screen_unlocked'), t('login.welcome_back'));
        setLockPin('');
        setLockError(false);
        if (onUnlock) {
          onUnlock();
        }
      } else if (res.status === 'locked') {
        triggerFeedback('error', t('login.lock_screen_title'), t('login.lockout_msg', { minutes: res.minutesLeft }));
        setLockError(true);
        setLockCountdownSeconds(res.secondsLeft);
        setLockPin('');
      } else {
        triggerFeedback('error', t('login.wrong_pin'));
        setLockError(true);
        setLockPin('');
      }
    },
    [activeLockUser, onUnlock, t]
  );

  const verifyPin = useCallback(
    async (pinToTest: string, user: DBUser) => {
      const res = await attemptUserLogin(user, pinToTest);
      if (res.status === 'ok') {
        triggerFeedback('success', t('login.login_success'), t('login.login_welcome', { name: user.name }));
        enterFullscreen();
        onLoginSuccess(user);
      } else if (res.status === 'locked') {
        triggerFeedback('error', t('login.lockout_msg', { minutes: res.minutesLeft }), '');
        setHasError(true);
        setErrorMessage(t('login.lockout_msg', { minutes: res.minutesLeft }));
        setLockCountdownSeconds(res.secondsLeft);
        setPin('');
      } else {
        triggerFeedback('error', t('login.wrong_pin'));
        setHasError(true);
        setErrorMessage(t('login.wrong_pin'));
        setPin('');
      }
    },
    [onLoginSuccess, t]
  );

  const handleAddDigit = useCallback(
    (digit: string) => {
      if (lockCountdownSeconds > 0) return;

      if (isLocked) {
        const targetLen = 4;
        if (lockPin.length < targetLen) {
          const nextPin = lockPin + digit;
          setLockPin(nextPin);
          setLockError(false);
          if (nextPin.length === targetLen) {
            verifyLockPin(nextPin);
          }
        }
        return;
      }

      if (!selectedUser) return;
      const targetLen = 4;
      if (pin.length < targetLen) {
        const nextPin = pin + digit;
        setPin(nextPin);
        setHasError(false);
        setErrorMessage('');

        if (nextPin.length === targetLen) {
          verifyPin(nextPin, selectedUser);
        }
      }
    },
    [lockCountdownSeconds, isLocked, lockPin, verifyLockPin, selectedUser, pin, verifyPin]
  );

  const handleClear = useCallback(() => {
    if (isLocked) {
      setLockPin('');
      setLockError(false);
    } else {
      setPin('');
      setHasError(false);
      setErrorMessage('');
    }
  }, [isLocked]);

  const handleBackspace = useCallback(() => {
    if (isLocked) {
      setLockPin((prev) => prev.slice(0, -1));
      setLockError(false);
    } else {
      setPin((prev) => prev.slice(0, -1));
      setHasError(false);
      setErrorMessage('');
    }
  }, [isLocked]);

  // Shared keyboard navigation support for PIN entry
  usePinKeyboard({
    onDigit: handleAddDigit,
    onBackspace: handleBackspace,
    onClear: handleClear,
    disabled: isCreatingOwner,
  });

  // -------------------------------------------------------------
  // STATE 3: Lock Screen (08c_Login_LockScreen.html)
  // -------------------------------------------------------------
  const unlockBtn = tButton('common.btn_unlock');
  const clearBtn = tButton('common.btn_clear');
  const deleteBtn = tButton('common.btn_delete');

  if (isLocked) {
    const lockTargetLen = 4;

    if (isCompactViewport) {
      return (
        <div className="w-full min-h-dvh bg-[#f1fcf6] flex flex-col items-center justify-center p-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] select-none relative overflow-x-clip">
          <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col items-center p-6 sm:p-8 my-auto">
            {/* Green top bar */}
            <div className="w-full h-2.5 bg-[#006b33] -mt-6 sm:-mt-8 -mx-6 sm:-mx-8 mb-5"></div>

            {/* Padlock Icon & Auto-Lock Header */}
            <div className="w-13 h-13 rounded-full bg-[#ebf6f0] flex items-center justify-center text-[#006b33] mb-2.5 shadow-inner">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-[#141e1a] tracking-tight text-center">
              {t('login.lock_screen_title')}
            </h2>
            <p className="text-xs sm:text-sm font-medium text-[#6e7a6e] mt-0.5 text-center">
              {t('login.lock_screen_sub')}
            </p>

            {/* Active User Pill in Modal */}
            <div className="mt-3 mb-3 px-3.5 py-1.5 bg-[#f1fcf6] rounded-xl border border-[#dae5df] flex items-center gap-2.5 w-full justify-center">
              <div className="w-7 h-7 rounded-full bg-[#006b33] text-white flex items-center justify-center font-bold text-xs">
                {activeLockUser?.role === 'owner' ? (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                  </svg>
                ) : (
                  activeLockUser?.name.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-[#141e1a] leading-tight">
                  {activeLockUser?.name || ''}
                </span>
                <span className="text-[11px] text-[#3e4a3f]">
                  {activeLockUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier')}
                </span>
              </div>
            </div>

            {/* Single Unified 4-Slot Numeric PIN Field (Lock Screen) */}
            <div className="w-full max-w-[300px] my-3 flex flex-col gap-3">
              <div
                onClick={() => lockPinInputRef.current?.focus()}
                className="relative w-full grid grid-cols-4 gap-2.5 cursor-text"
              >
                <input
                  ref={lockPinInputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={lockTargetLen}
                  autoFocus
                  disabled={lockCountdownSeconds > 0}
                  value={lockPin}
                  onFocus={() => setIsPinFocused(true)}
                  onBlur={() => setIsPinFocused(false)}
                  onChange={(e) => {
                    if (lockCountdownSeconds > 0) return;
                    const next = e.target.value.replace(/\D/g, '').slice(0, lockTargetLen);
                    setLockPin(next);
                    setLockError(false);
                    if (next.length === lockTargetLen) {
                      setTimeout(() => verifyLockPin(next), 80);
                    }
                  }}
                  aria-label={t('login.enter_pin_prompt', { digits: lockTargetLen })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                />
                {Array.from({ length: lockTargetLen }).map((_, idx) => {
                  const isFilled = idx < lockPin.length;
                  const isActive = isPinFocused && idx === Math.min(lockPin.length, lockTargetLen - 1);
                  return (
                    <div
                      key={idx}
                      className={`h-14 rounded-2xl border-2 flex items-center justify-center transition-all duration-150 ${
                        lockError && lockCountdownSeconds <= 0
                          ? 'border-red-400 bg-red-50/70'
                          : isActive
                            ? 'border-[#006b33] bg-[#ebf6f0] ring-4 ring-[#006b33]/15'
                            : isFilled
                              ? 'border-[#006b33] bg-[#f4faf6]'
                              : 'border-[#d3dfd8] bg-[#f8fbf9]'
                      }`}
                    >
                      {isFilled ? (
                        <span className="w-3.5 h-3.5 rounded-full bg-[#006b33] transition-transform scale-100" />
                      ) : isActive ? (
                        <span className="w-0.5 h-6 rounded-full bg-[#006b33] animate-pulse" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Wrong PIN feedback on lock screen */}
              {lockError && lockCountdownSeconds <= 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center gap-1.5 text-xs font-bold">
                  <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{t('login.wrong_pin')}</span>
                </div>
              )}

              {/* Lockout countdown on lock screen */}
              {lockCountdownSeconds > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center gap-1.5 animate-pulse text-xs font-bold">
                  <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {t('login.lockout_msg', { minutes: Math.ceil(lockCountdownSeconds / 60) })} ({lockCountdownSeconds}s)
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleClear();
                    lockPinInputRef.current?.focus();
                  }}
                  className="min-h-[50px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] border border-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <span>{clearBtn.main}</span>
                </button>
                <button
                  type="button"
                  disabled={lockPin.length < lockTargetLen || lockCountdownSeconds > 0}
                  onClick={() => verifyLockPin(lockPin)}
                  className={`min-h-[50px] rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all ${
                    lockPin.length >= lockTargetLen && lockCountdownSeconds <= 0
                      ? 'bg-[#006b33] hover:bg-[#005528] active:scale-[0.98] text-white shadow-md shadow-[#006b33]/25 cursor-pointer'
                      : 'bg-[#006b33]/35 text-white/90 cursor-not-allowed'
                  }`}
                >
                  <Icon name="lock_open" className="text-[18px]" />
                  <span>{unlockBtn.main}</span>
                </button>
              </div>
            </div>

            {/* Bottom info strip in modal */}
            <div className="w-full flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
              <div className="flex items-center gap-1.5 bg-[#ebf6f0] px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-[#006b33] inline-block animate-pulse"></span>
                <span className="text-[11px] text-[#3e4a3f] font-medium">{t('common.local_mode')}</span>
              </div>
              <span className="text-[11px] text-[#6e7a6e]">{t('common.saved_on_device')}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full min-h-dvh bg-[#f1fcf6] flex items-center justify-center px-2 py-16 m-0 select-none relative overflow-y-auto">
        {/* Background blurred representation of the app (matches 08c) */}
        <div aria-hidden="true" className="absolute inset-0 w-full h-full flex flex-col bg-[#f1fcf6] p-4 filter blur-[6px] opacity-45 pointer-events-none scale-100">
          <div className="w-full h-16 bg-[#e5f0eb] rounded-xl flex items-center justify-between px-6 mb-4">
            <div className="flex items-center gap-4">
              <span className="text-2xl text-[#006b33] font-bold">{t('login.decorative_pos_title')}</span>
              {shopName ? (
                <span className="bg-[#dae5df] px-3 py-1 rounded-full text-sm text-[#3e4a3f]">
                  {shopName}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-6">
              {activeLockUser?.name ? (
                <span className="text-base text-[#141e1a] font-semibold">{activeLockUser.name}</span>
              ) : null}
              <span className="text-base text-[#141e1a]">
                {currentLiveTime.toLocaleDateString('en-GB')} • {currentLiveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          <div className="w-full flex-1 flex gap-4 min-h-0">
            <div className="w-2/3 bg-white rounded-xl p-6 flex flex-col gap-4 shadow-sm">
              <div className="h-14 bg-[#ebf6f0] rounded-xl px-4 flex items-center justify-between">
                <span className="text-[#3e4a3f]">{t('login.decorative_search_medicine')}</span>
                <svg className="w-6 h-6 text-[#6e7a6e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Centered Unlock Card (Matches 08c: 440px wide) */}
        <div className="relative z-10 w-[440px] max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col items-center">

          {/* Green top bar */}
          <div className="w-full h-2.5 bg-[#006b33]"></div>

          <div className="w-full p-8 flex flex-col items-center">

            {/* Padlock Icon & Auto-Lock Header */}
            <div className="w-14 h-14 rounded-full bg-[#ebf6f0] flex items-center justify-center text-[#006b33] mb-3 shadow-inner">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>

            <h2 className="text-2xl font-extrabold text-[#141e1a] tracking-tight text-center">
              {t('login.lock_screen_title')}
            </h2>
            <p className="text-sm font-medium text-[#6e7a6e] mt-0.5 text-center">
              {t('login.lock_screen_sub')}
            </p>

            {/* Active User Pill in Modal */}
            <div className="mt-4 mb-4 px-4 py-2 bg-[#f1fcf6] rounded-xl border border-[#dae5df] flex items-center gap-3 w-full justify-center">
              <div className="w-8 h-8 rounded-full bg-[#006b33] text-white flex items-center justify-center font-bold text-sm">
                {activeLockUser?.role === 'owner' ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                  </svg>
                ) : (
                  activeLockUser?.name.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-[#141e1a] leading-tight">
                  {activeLockUser?.name || ''}
                </span>
                <span className="text-xs text-[#3e4a3f]">
                  {activeLockUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier')}
                </span>
              </div>
            </div>

            {/* PIN Dots */}
            <div className="flex items-center gap-4 my-2">
              {Array.from({ length: lockTargetLen }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${idx < lockPin.length
                    ? 'bg-[#006b33] border-[#006b33] scale-110'
                    : 'border-[#b6c2bb] bg-white'
                    }`}
                />
              ))}
            </div>

            {/* Wrong PIN feedback on lock screen */}
            {lockError && lockCountdownSeconds <= 0 && (
              <div className="mb-3 px-4 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700 flex items-center gap-2 animate-bounce">
                <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-bold tracking-wide">{t('login.wrong_pin')}</span>
              </div>
            )}

            {/* Lockout countdown on lock screen */}
            {lockCountdownSeconds > 0 && (
              <div className="mb-3 px-4 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center gap-2 animate-pulse">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold tracking-wide">
                  {t('login.lockout_msg', { minutes: Math.ceil(lockCountdownSeconds / 60) })} ({lockCountdownSeconds}s)
                </span>
              </div>
            )}

            {/* Numpad 3x4 Grid (88px keys) */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleAddDigit(digit)}
                  className="w-[88px] h-[88px] rounded-xl bg-[#ebf6f0] hover:bg-[#e0ebe5] active:scale-95 text-[#141e1a] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer transition-all duration-100 border border-slate-200"
                >
                  {digit}
                </button>
              ))}

              {/* Clear / Mitao (Backspace) */}
              <button
                type="button"
                onClick={handleBackspace}
                aria-label={t('common.backspace')}
                className="w-[88px] h-[88px] rounded-xl bg-[#ffdad6] hover:bg-[#ffdad6]/80 active:scale-95 text-[#93000a] flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all duration-100"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                </svg>
                <span className="text-xs font-bold leading-tight mt-0.5">{deleteBtn.main}</span>
              </button>

              {/* 0 button */}
              <button
                type="button"
                onClick={() => handleAddDigit('0')}
                className="w-[88px] h-[88px] rounded-xl bg-[#ebf6f0] hover:bg-[#e0ebe5] active:scale-95 text-[#141e1a] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer transition-all duration-100 border border-slate-200"
              >
                0
              </button>

              {/* Unlock / Kholein button */}
              <button
                type="button"
                onClick={() => verifyLockPin(lockPin)}
                className="w-[88px] h-[88px] rounded-xl bg-[#8ef9a7] hover:bg-[#72dc8e] active:scale-95 text-[#00210b] flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all duration-100"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-xs font-bold leading-tight mt-0.5">{unlockBtn.main}</span>
              </button>
            </div>

            {/* Bottom info strip in modal */}
            <div className="w-full flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 bg-[#ebf6f0] px-3 py-1.5 rounded-full">
                <span className="w-2.5 h-2.5 rounded-full bg-[#006b33] inline-block animate-pulse"></span>
                <span className="text-xs text-[#3e4a3f] font-medium">{t('common.local_mode')}</span>
              </div>
              <span className="text-xs text-[#6e7a6e]">{t('common.saved_on_device')}</span>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATES 1 & 2: 08a (Choose Name) & 08b (Active PIN / Wrong PIN)
  // -------------------------------------------------------------
  const selectedUserPinLength = 4;

  if (isCompactViewport) {
    return (
      <div className="w-full min-h-dvh bg-gradient-to-b from-[#EDF7F1] to-[#F4F6F5] text-slate-800 flex flex-col justify-between px-3 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-x-clip select-none">
        <main className="w-full min-w-0 max-w-[460px] mx-auto bg-white rounded-3xl shadow-[0_12px_36px_rgba(27,143,74,0.08)] border border-slate-200/80 p-4 sm:p-6 flex flex-col justify-between flex-1 my-auto overflow-x-clip">
          {/* Clean Top Bar & Language Switcher (zero horizontal overflow) */}
          <header className="w-full min-w-0 flex flex-col gap-3 pb-3.5 border-b border-slate-100 mb-3">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 bg-gradient-to-br from-[#22A958] to-[#147A3E] rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm shadow-[#1B8F4A]/30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.6" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-black text-slate-900 leading-tight truncate">{t('common.app_name')}</h1>
                  <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{shopName || t('login.pos_title')}</p>
                </div>
              </div>
              <FullscreenButton className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 transition cursor-pointer shrink-0" />
            </div>

            <div className="w-full min-w-0">
              <LanguageSwitch className="w-full justify-between" />
            </div>
          </header>

          {!selectedUser ? (
            /* STEP 1: Polished Mobile Staff Selection (balanced top alignment, clean cards) */
            <div className="flex flex-col flex-1 justify-start pt-2 pb-4 min-w-0">
              <div className="mb-4 min-w-0">
                <h2 className="text-2xl sm:text-[28px] font-black text-slate-900 tracking-tight leading-tight break-words">
                  {t('login.who_is_using')}
                </h2>
                <p className="text-sm font-medium text-slate-500 mt-1 leading-snug break-words">
                  {t('login.who_is_using_sub')}
                </p>
              </div>

              {/* Stacked staff cards */}
              <div className="flex flex-col gap-3 w-full min-w-0">
                {users.length === 0 ? (
                  isCreatingOwner ? (
                    /* Create recovery owner PIN form */
                    <form
                      onSubmit={handleSaveOwnerPin}
                      className="flex flex-col p-4 sm:p-6 bg-surface-container rounded-2xl border border-outline-variant/50 gap-3 text-left animate-fadeIn shadow-md w-full"
                    >
                      <div className="flex items-center gap-2.5 pb-2.5 border-b border-outline-variant/30">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Icon name="person_add" className="text-[22px]" />
                        </div>
                        <div>
                          <h3 className="text-lg font-extrabold text-on-surface leading-tight">
                            {t('login.create_owner_title')}
                          </h3>
                          <p className="text-xs text-outline font-medium mt-0.5">
                            {t('login.create_owner_desc')}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('login.owner_name_label')}
                        </label>
                        <input
                          type="text"
                          value={createOwnerName}
                          onChange={(e) => {
                            setCreateOwnerName(e.target.value);
                            if (createOwnerError) setCreateOwnerError('');
                          }}
                          placeholder="Owner Name"
                          className="w-full h-11 px-3 rounded-xl border border-outline-variant/80 bg-surface text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-semibold text-base transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                            {t('login.owner_pin_label')}
                          </label>
                          <input
                            type="password"
                            maxLength={4}
                            inputMode="numeric"
                            value={createOwnerPin}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setCreateOwnerPin(clean);
                              if (createOwnerError) setCreateOwnerError('');
                            }}
                            placeholder="••••"
                            className="w-full h-11 px-2.5 rounded-xl border border-outline-variant/80 bg-surface text-on-surface tracking-widest text-center text-xl font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                            {t('login.confirm_pin_label')}
                          </label>
                          <input
                            type="password"
                            maxLength={4}
                            inputMode="numeric"
                            value={createOwnerConfirmPin}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setCreateOwnerConfirmPin(clean);
                              if (createOwnerError) setCreateOwnerError('');
                            }}
                            placeholder="••••"
                            className="w-full h-11 px-2.5 rounded-xl border border-outline-variant/80 bg-surface text-on-surface tracking-widest text-center text-xl font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {createOwnerError && (
                        <div className="text-xs font-bold text-error bg-error-container/40 p-2 rounded-xl border border-error/30 flex items-center gap-1.5">
                          <Icon name="error" className="text-sm shrink-0" />
                          <span>{createOwnerError}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingOwner(false);
                            setCreateOwnerError('');
                          }}
                          disabled={isSavingOwner}
                          className="flex-1 min-h-[48px] h-12 px-3 bg-surface hover:bg-surface-container-high border border-outline-variant/80 text-on-surface rounded-xl flex items-center justify-center gap-1.5 font-bold transition-all active:scale-[0.99] cursor-pointer"
                        >
                          <Icon name="close" className="text-[18px]" />
                          <span>{btnCancelCreateOwner.main}</span>
                        </button>

                        <button
                          type="submit"
                          disabled={isSavingOwner}
                          className="flex-1 min-h-[48px] h-12 px-3 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-xl flex items-center justify-center gap-1.5 font-bold transition-all shadow-md active:scale-[0.99] cursor-pointer"
                        >
                          <Icon name={isSavingOwner ? 'sync' : 'check'} className={`text-[18px] ${isSavingOwner ? 'animate-spin' : ''}`} />
                          <span className="text-sm font-bold leading-tight">{btnSaveOwnerPin.main}</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-5 bg-surface-container rounded-2xl border border-outline-variant/40 text-center gap-3 animate-fadeIn w-full">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Icon name="group" className="text-[28px]" />
                      </div>
                      <div className="flex flex-col gap-0.5 max-w-sm">
                        <h3 className="text-lg font-bold text-on-surface">
                          {t('login.no_users_title')}
                        </h3>
                        <p className="text-xs text-outline">
                          {t('login.no_users_desc')}
                        </p>
                      </div>
                      <div className="flex flex-col w-full max-w-xs gap-2.5">
                        <button
                          type="button"
                          onClick={handleSyncStaffAccounts}
                          disabled={isSyncingUsers}
                          className="w-full min-h-[52px] h-13 px-4 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-md active:scale-[0.99] cursor-pointer"
                        >
                          <Icon name="sync" className={`text-[20px] ${isSyncingUsers ? 'animate-spin' : ''}`} />
                          <span className="text-sm font-bold leading-tight">{btnSyncStaff.main}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingOwner(true);
                            setCreateOwnerName(shopOwnerName || '');
                            setCreateOwnerPin('');
                            setCreateOwnerConfirmPin('');
                            setCreateOwnerError('');
                          }}
                          className="w-full min-h-[52px] h-13 px-4 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/60 text-primary rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                        >
                          <Icon name="person_add" className="text-[20px]" />
                          <span className="text-sm font-bold leading-tight">{btnCreateOwnerPin.main}</span>
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  users.map((user, idx) => {
                    const isOwner = user.role === 'owner';
                    const palette = isOwner
                      ? AVATAR_PALETTES[0]
                      : AVATAR_PALETTES[(idx % (AVATAR_PALETTES.length - 1)) + 1];
                    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
                    const roleDesc = isOwner
                      ? t('login.admin_incharge')
                      : user.role === 'cashier'
                        ? t('login.counter_staff')
                        : t('login.runner');

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className="w-full min-h-[72px] py-3 px-3.5 sm:px-4 bg-white hover:bg-[#F7FBF8] active:bg-[#EDF7F1] border-2 border-slate-200/90 hover:border-[#1B8F4A] rounded-2xl flex items-center justify-between gap-3 transition-all shadow-[0_2px_8px_rgba(15,23,42,0.04)] text-left cursor-pointer active:scale-[0.99] min-w-0"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isOwner ? (
                            <div className={`w-12 h-12 rounded-2xl ${palette.bg} ${palette.text} border ${palette.border} flex items-center justify-center font-bold shrink-0 shadow-xs`}>
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </div>
                          ) : (
                            <div className={`w-12 h-12 rounded-2xl ${palette.bg} ${palette.text} border ${palette.border} flex items-center justify-center font-extrabold text-lg shrink-0 shadow-xs`}>
                              {initial}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center flex-wrap gap-1.5 min-w-0">
                              <span className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug break-words">
                                {user.name}
                              </span>
                              {isOwner && (
                                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200/90 shrink-0 whitespace-nowrap">
                                  {t('login.admin_badge')}
                                </span>
                              )}
                            </div>
                            <span className="text-xs sm:text-[13px] text-slate-500 font-medium leading-snug break-words mt-0.5">
                              {roleDesc}
                            </span>
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* STEP 2: Polished Mobile PIN Entry */
            <div className="flex flex-col flex-1 justify-between gap-4 py-1 min-w-0">
              {/* Sub-header: Back on left, Step badge on right */}
              <div className="w-full flex items-center justify-between gap-2 pb-3 border-b border-slate-100 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setPin('');
                    setHasError(false);
                    setErrorMessage('');
                  }}
                  className="min-h-[44px] h-11 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 font-bold text-sm flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>{btnBack.main}</span>
                </button>
                <span className="text-[11px] font-extrabold text-[#1B8F4A] bg-[#E8F5E9] border border-[#C8E6C9] px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 truncate">
                  {t('login.step_enter_pin')}
                </span>
              </div>

              {/* Center Identity + Unified 4-Slot PIN Field + Actions */}
              <div className="w-full flex flex-col items-center text-center my-auto py-2 gap-5 min-w-0">
                {/* User Identity */}
                <div className="flex flex-col items-center min-w-0 w-full">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#22A958] to-[#147A3E] text-white flex items-center justify-center shadow-lg shadow-[#1B8F4A]/25 ring-4 ring-[#E8F5E9] mb-3 shrink-0">
                    {selectedUser.role === 'owner' ? (
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    )}
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight max-w-full break-words px-2">
                    {selectedUser.name}
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mt-1 px-2 leading-snug">
                    {t('login.enter_pin_prompt', { digits: selectedUserPinLength })}
                  </p>
                </div>

                {/* Single Unified 4-Slot Tap-to-Type PIN Input (zero redundant dots) */}
                <div className="w-full max-w-[304px] flex flex-col gap-3">
                  <div
                    onClick={() => pinInputRef.current?.focus()}
                    className="relative w-full grid grid-cols-4 gap-3 cursor-text"
                  >
                    <input
                      ref={pinInputRef}
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      maxLength={selectedUserPinLength}
                      autoFocus
                      disabled={lockCountdownSeconds > 0}
                      value={pin}
                      onFocus={() => setIsPinFocused(true)}
                      onBlur={() => setIsPinFocused(false)}
                      onChange={(e) => {
                        if (lockCountdownSeconds > 0 || !selectedUser) return;
                        const next = e.target.value.replace(/\D/g, '').slice(0, selectedUserPinLength);
                        setPin(next);
                        setHasError(false);
                        setErrorMessage('');
                        if (next.length === selectedUserPinLength) {
                          setTimeout(() => verifyPin(next, selectedUser), 80);
                        }
                      }}
                      aria-label={t('login.enter_pin_prompt', { digits: selectedUserPinLength })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                    />
                    {Array.from({ length: selectedUserPinLength }).map((_, idx) => {
                      const isFilled = idx < pin.length;
                      const isActive = isPinFocused && idx === Math.min(pin.length, selectedUserPinLength - 1);
                      return (
                        <div
                          key={idx}
                          className={`h-15 rounded-2xl border-2 flex items-center justify-center transition-all duration-150 ${
                            hasError && lockCountdownSeconds <= 0
                              ? 'border-red-400 bg-red-50/70'
                              : isActive
                                ? 'border-[#1B8F4A] bg-[#F1FAF4] ring-4 ring-[#1B8F4A]/15 shadow-xs'
                                : isFilled
                                  ? 'border-[#1B8F4A] bg-[#F4FAF6]'
                                  : 'border-slate-200 bg-slate-50/90'
                          }`}
                        >
                          {isFilled ? (
                            <span className="w-3.5 h-3.5 rounded-full bg-[#1B8F4A] shadow-xs transition-transform scale-100" />
                          ) : isActive ? (
                            <span className="w-0.5 h-6 rounded-full bg-[#1B8F4A] animate-pulse" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Error Banner */}
                  {hasError && lockCountdownSeconds <= 0 && (
                    <div className="px-3.5 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center gap-1.5 text-xs font-bold">
                      <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="break-words">{errorMessage || t('login.wrong_pin')}</span>
                    </div>
                  )}

                  {/* Lockout countdown */}
                  {lockCountdownSeconds > 0 && (
                    <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center gap-1.5 animate-pulse text-xs font-bold">
                      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{t('login.lockout_msg', { minutes: Math.ceil(lockCountdownSeconds / 60) })} ({lockCountdownSeconds}s)</span>
                    </div>
                  )}

                  {/* Balanced 52px Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleClear();
                        pinInputRef.current?.focus();
                      }}
                      className="min-h-[52px] h-13 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] border border-slate-200 text-slate-700 font-bold text-base flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Icon name="backspace" className="text-[18px] text-slate-500" />
                      <span>{clearBtn.main}</span>
                    </button>
                    <button
                      type="button"
                      disabled={pin.length < selectedUserPinLength || lockCountdownSeconds > 0}
                      onClick={() => selectedUser && verifyPin(pin, selectedUser)}
                      className={`min-h-[52px] h-13 rounded-2xl font-bold text-base flex items-center justify-center gap-1.5 transition-all ${
                        pin.length >= selectedUserPinLength && lockCountdownSeconds <= 0
                          ? 'bg-[#1B8F4A] hover:bg-[#15753B] active:scale-[0.98] text-white shadow-md shadow-[#1B8F4A]/25 cursor-pointer'
                          : 'bg-[#1B8F4A]/40 text-white cursor-not-allowed'
                      }`}
                    >
                      <Icon name="lock_open" className="text-[19px]" />
                      <span>{unlockBtn.main}</span>
                    </button>
                  </div>
                </div>

                <p className="text-center text-xs sm:text-sm text-slate-500 leading-relaxed max-w-[300px] px-1">
                  {t('login.forgot_pin_note')}
                </p>
              </div>
            </div>
          )}

          {/* Clean Compact Bottom Bar (zero edge clipping) */}
          <footer className="pt-3.5 mt-3 px-0.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 min-w-0">
            <div className="flex items-start gap-1.5 min-w-0 flex-1 leading-snug">
              <Icon name="lock" className="text-[14px] text-slate-400 shrink-0 mt-0.5" />
              <span className="break-words">{t('login.staff_note')}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E8F5E9] text-[#1B8F4A] font-bold shrink-0 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-[#1B8F4A] animate-pulse"></span>
              <span>{t('common.local_mode')}</span>
            </div>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="w-full min-h-dvh bg-[#F4F6F5] text-slate-800 flex flex-col justify-center items-center p-3 sm:p-6 md:p-8 select-none">

      {/* Master Outer Card Container (Matches 08a / 08b) */}
      <main className="w-full max-w-[1376px] bg-white rounded-3xl shadow-xl border border-slate-200/80 p-4 sm:p-6 md:p-8 flex flex-col justify-between min-h-[auto] sm:min-h-[640px] lg:min-h-[820px] relative">

        {/* Top Branding / Header inside Card */}
        <header className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 md:w-14 md:h-14 bg-[#1B8F4A] rounded-2xl flex items-center justify-center text-white shadow-sm shadow-[#1B8F4A]/30">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">{t('common.app_name')}</h1>
              <p className="text-sm md:text-base text-slate-500 font-medium mt-1">{shopName ? `${shopName} • ${t('login.pos_title')}` : t('login.pos_title')}</p>
            </div>
          </div>

          {/* Secure Login Badge, Fullscreen & Language Switch */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* DEV ONLY: becomes a Settings option in Phase 5 */}
            <LanguageSwitch />
            <FullscreenButton className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 transition cursor-pointer" />

            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-sm md:text-base font-semibold">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
              <span>{t('login.secure_access')}</span>
            </div>
          </div>
        </header>

        {/* Main Content Area: Left Half (User List) & Right Half (Empty State or Active PIN Pad) */}
        <section className="grid grid-cols-12 gap-8 my-auto items-stretch py-4">

          {/* LEFT HALF (5.5 Columns): "Kaun hai?" with stacked user buttons */}
          <div className={`col-span-12 lg:col-span-5 ${selectedUser ? 'hidden lg:flex' : 'flex'} flex-col justify-center pr-0 lg:pr-4`}>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">{t('login.who_is_using')}</h2>
              <p className="text-base md:text-lg font-medium text-slate-500 mt-1">{t('login.who_is_using_sub')}</p>
            </div>

            {/* Stacked Big Name Buttons (64px tall each) */}
            <div className="flex flex-col gap-3.5 max-w-[540px]">
              {users.length === 0 ? (
                isCreatingOwner ? (
                  <form
                    onSubmit={handleSaveOwnerPin}
                    className="flex flex-col p-6 sm:p-7 bg-surface-container rounded-3xl border border-outline-variant/50 gap-4 text-left animate-fadeIn shadow-lg max-w-[540px]"
                  >
                    <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/30">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon name="person_add" className="text-[26px]" />
                      </div>
                      <div>
                        <h3 className="text-xl font-extrabold text-on-surface leading-tight">
                          {t('login.create_owner_title')}
                        </h3>
                        <p className="text-xs text-outline font-medium mt-0.5">
                          {t('login.create_owner_desc')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                        {t('login.owner_name_label')}
                      </label>
                      <input
                        type="text"
                        value={createOwnerName}
                        onChange={(e) => {
                          setCreateOwnerName(e.target.value);
                          if (createOwnerError) setCreateOwnerError('');
                        }}
                        placeholder="Owner Name"
                        className="w-full h-12 px-4 rounded-xl border border-outline-variant/80 bg-surface text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none font-semibold text-base transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('login.owner_pin_label')}
                        </label>
                        <input
                          type="password"
                          maxLength={4}
                          inputMode="numeric"
                          value={createOwnerPin}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setCreateOwnerPin(clean);
                            if (createOwnerError) setCreateOwnerError('');
                          }}
                          placeholder="••••"
                          className="w-full h-12 px-3 rounded-xl border border-outline-variant/80 bg-surface text-on-surface tracking-widest text-center text-xl font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          {t('login.confirm_pin_label')}
                        </label>
                        <input
                          type="password"
                          maxLength={4}
                          inputMode="numeric"
                          value={createOwnerConfirmPin}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setCreateOwnerConfirmPin(clean);
                            if (createOwnerError) setCreateOwnerError('');
                          }}
                          placeholder="••••"
                          className="w-full h-12 px-3 rounded-xl border border-outline-variant/80 bg-surface text-on-surface tracking-widest text-center text-xl font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {createOwnerError && (
                      <div className="text-xs font-bold text-error bg-error-container/40 p-2.5 rounded-xl border border-error/30 flex items-center gap-1.5">
                        <Icon name="error" className="text-sm shrink-0" />
                        <span>{createOwnerError}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingOwner(false);
                          setCreateOwnerError('');
                        }}
                        disabled={isSavingOwner}
                        className="flex-1 min-h-[56px] h-14 px-4 bg-surface hover:bg-surface-container-high border border-outline-variant/80 text-on-surface rounded-2xl flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.99] cursor-pointer"
                      >
                        <Icon name="close" className="text-[20px]" />
                        <span>{btnCancelCreateOwner.main}</span>
                      </button>

                      <button
                        type="submit"
                        disabled={isSavingOwner}
                        className="flex-1 min-h-[56px] h-14 px-4 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-2xl flex items-center justify-center gap-2 font-bold transition-all shadow-md active:scale-[0.99] cursor-pointer"
                      >
                        <Icon name={isSavingOwner ? 'sync' : 'check'} className={`text-[20px] ${isSavingOwner ? 'animate-spin' : ''}`} />
                        <div className="flex flex-col text-left">
                          <span className="text-base font-bold leading-tight">{btnSaveOwnerPin.main}</span>
                          {btnSaveOwnerPin.sub && (
                            <span className="text-xs text-on-primary/80 font-normal leading-none">
                              {btnSaveOwnerPin.sub}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-surface-container rounded-3xl border border-outline-variant/40 text-center gap-4 animate-fadeIn max-w-[540px]">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Icon name="group" className="text-[32px]" />
                    </div>
                    <div className="flex flex-col gap-1 max-w-sm">
                      <h3 className="text-xl font-bold text-on-surface">
                        {t('login.no_users_title')}
                      </h3>
                      <p className="text-sm text-outline">
                        {t('login.no_users_desc')}
                      </p>
                    </div>
                    <div className="flex flex-col w-full max-w-xs gap-3">
                      <button
                        type="button"
                        onClick={handleSyncStaffAccounts}
                        disabled={isSyncingUsers}
                        className="w-full min-h-[56px] h-14 px-6 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-2xl flex items-center justify-center gap-3 font-bold transition-all shadow-md active:scale-[0.99] cursor-pointer"
                      >
                        <Icon name="sync" className={`text-[24px] ${isSyncingUsers ? 'animate-spin' : ''}`} />
                        <div className="flex flex-col text-left">
                          <span className="text-base font-bold leading-tight">{btnSyncStaff.main}</span>
                          {btnSyncStaff.sub && (
                            <span className="text-xs text-on-primary/80 font-normal leading-none">
                              {btnSyncStaff.sub}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingOwner(true);
                          setCreateOwnerName(shopOwnerName || '');
                          setCreateOwnerPin('');
                          setCreateOwnerConfirmPin('');
                          setCreateOwnerError('');
                        }}
                        className="w-full min-h-[56px] h-14 px-6 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/60 text-primary rounded-2xl flex items-center justify-center gap-3 font-bold transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                      >
                        <Icon name="person_add" className="text-[24px]" />
                        <div className="flex flex-col text-left">
                          <span className="text-base font-bold leading-tight">{btnCreateOwnerPin.main}</span>
                          {btnCreateOwnerPin.sub && (
                            <span className="text-xs text-outline font-normal leading-none">
                              {btnCreateOwnerPin.sub}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                )
              ) : (
                users.map((user, idx) => {
                  const isSelected = selectedUser?.id === user.id;
                  const isOwner = user.role === 'owner';
                  const palette = isOwner
                    ? AVATAR_PALETTES[0]
                    : AVATAR_PALETTES[(idx % (AVATAR_PALETTES.length - 1)) + 1];
                  const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
                  const roleDesc = isOwner
                    ? t('login.admin_incharge')
                    : user.role === 'cashier'
                      ? t('login.counter_staff')
                      : t('login.runner');

                  if (isSelected) {
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className="w-full h-16 px-5 bg-[#1B8F4A] border-2 border-[#1B8F4A] rounded-2xl flex items-center justify-between shadow-lg shadow-[#1B8F4A]/25 ring-4 ring-[#1B8F4A]/20 text-white cursor-pointer text-left transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-xl bg-white text-[#1B8F4A] flex items-center justify-center text-xl font-extrabold shadow-sm">
                            {isOwner ? (
                              <svg className="w-6 h-6 text-[#1B8F4A]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                              </svg>
                            ) : (
                              initial
                            )}
                          </div>
                          <div className="text-left">
                            <div className="text-xl font-bold text-white leading-tight">{user.name}</div>
                            <div className="text-xs text-green-100 font-medium leading-tight">{roleDesc}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-white">
                          <span className="px-2.5 py-0.5 rounded-md bg-white/20 text-white text-xs font-bold uppercase tracking-wider">
                            {t('login.selected_tag')}
                          </span>
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </button>
                    );
                  }

                  // Normal Inactive State
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className="w-full h-16 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-[#1B8F4A] rounded-2xl px-5 flex items-center justify-between transition-all duration-150 shadow-sm group text-left cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-4">
                        {isOwner ? (
                          <div className={`w-11 h-11 rounded-xl ${palette.bg} ${palette.text} flex items-center justify-center font-bold`}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                            </svg>
                          </div>
                        ) : (
                          <div className={`w-11 h-11 rounded-full ${palette.bg} ${palette.text} flex items-center justify-center font-bold text-lg border-2 ${palette.border}`}>
                            {initial}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-xl font-bold text-slate-900 group-hover:text-[#1B8F4A] leading-tight">
                            {user.name}
                          </span>
                          <span className="text-sm text-slate-500 font-medium leading-tight">
                            {roleDesc}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOwner && (
                          <span className="text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 px-3 py-1 rounded-lg border border-amber-200">
                            {t('login.admin_badge')}
                          </span>
                        )}
                        <svg className="w-6 h-6 text-slate-400 group-hover:text-[#1B8F4A] group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path>
                        </svg>
                      </div>
                    </button>
                  );
                }))}
            </div>

            {/* Note under list */}
            <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-600 text-sm max-w-[540px]">
              <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{t('login.staff_note')}</span>
            </div>

          </div>

          {/* RIGHT HALF (7 Columns): Either Empty State (08a) OR Active PIN Pad (08b) */}
          <div className={`col-span-12 lg:col-span-7 ${!selectedUser ? 'hidden lg:flex' : 'flex'} flex-col justify-center pl-0 lg:pl-4`}>

            {!selectedUser ? (
              // 08a: Empty state "Naam chuniye"
              <div className="w-full h-[440px] md:h-[480px] bg-[#F4F6F5] rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-8">
                <div className="w-24 h-24 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-400 mb-6">
                  <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round"></rect>
                    <path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
                <div className="text-3xl font-extrabold text-slate-800 tracking-tight leading-none mb-2">
                  {t('login.select_name_first')}
                </div>
                <div className="text-lg text-slate-500 font-medium max-w-[360px] leading-relaxed">
                  {t('login.select_name_desc')}
                </div>
                <div className="mt-6 flex items-center gap-2 text-base font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                  <svg className="w-5 h-5 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                  </svg>
                  <span>{t('login.select_name_callout')}</span>
                </div>
              </div>
            ) : (
              // 08b: Active User PIN Entry & Large Numpad
              <div className="w-full bg-slate-50/70 border-2 border-slate-200 rounded-3xl p-4 sm:p-6 flex flex-col items-center justify-between min-h-[480px]">

                {/* Header Info for Selected User */}
                <div className="w-full flex items-center justify-between pb-3 border-b border-slate-200/80 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[#1B8F4A] text-white flex items-center justify-center text-xl font-black shadow-md shadow-[#1B8F4A]/30 shrink-0">
                      {selectedUser.role === 'owner' ? (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                        </svg>
                      ) : (
                        selectedUser.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight truncate">{selectedUser.name}</h3>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold shrink-0">{t('login.selected_tag')}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-500 truncate">{t('login.enter_pin_prompt', { digits: selectedUserPinLength })}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null);
                        setPin('');
                        setHasError(false);
                        setErrorMessage('');
                      }}
                      className="lg:hidden h-10 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      <span>{btnBack.main || 'Back'}</span>
                    </button>
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                      {t('login.step_enter_pin')}
                    </span>
                  </div>
                </div>

                {/* PIN Dots */}
                <div className="my-3 flex flex-col items-center">
                  <div className="flex items-center gap-4">
                    {Array.from({ length: selectedUserPinLength }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${idx < pin.length
                          ? 'bg-[#1B8F4A] border-[#1B8F4A] scale-110 shadow-sm'
                          : 'border-slate-300 bg-white shadow-inner'
                          }`}
                      />
                    ))}
                  </div>

                  {/* Red semantic danger message: "PIN galat hai" */}
                  {hasError && lockCountdownSeconds <= 0 && (
                    <div className="mt-3 px-4 py-1.5 rounded-full bg-red-100 border border-red-300 text-red-700 flex items-center gap-2 animate-bounce">
                      <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-base font-bold tracking-wide">{errorMessage || t('login.wrong_pin')}</span>
                      {errorMessage === t('login.wrong_pin') && (
                        <span className="text-xs font-medium text-red-600/80">{t('login.wrong_pin_hint')}</span>
                      )}
                    </div>
                  )}

                  {/* Lockout countdown */}
                  {lockCountdownSeconds > 0 && (
                    <div className="mt-3 px-4 py-2 rounded-full bg-amber-100 border border-amber-300 text-amber-800 flex items-center gap-2 animate-pulse">
                      <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-base font-bold tracking-wide">
                        {t('login.lockout_msg', { minutes: Math.ceil(lockCountdownSeconds / 60) })} ({lockCountdownSeconds}s)
                      </span>
                    </div>
                  )}
                </div>

                {/* Responsive Number Pad */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 my-1">
                  {/* Rows 1-3 */}
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleAddDigit(digit)}
                      className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 border-2 border-slate-200 shadow-sm text-slate-800 text-2xl sm:text-3xl font-bold flex flex-col items-center justify-center transition-all cursor-pointer"
                    >
                      <span>{digit}</span>
                    </button>
                  ))}

                  {/* Row 4: Saaf (Clear), 0, Mitao (Backspace) */}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-2 border-slate-200 text-slate-600 flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <span className="text-base sm:text-lg font-bold">{clearBtn.main}</span>
                    {clearBtn.sub ? (
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-500">{clearBtn.sub}</span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddDigit('0')}
                    className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 border-2 border-slate-200 shadow-sm text-slate-800 text-2xl sm:text-3xl font-bold flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <span>0</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBackspace}
                    aria-label={t('common.backspace')}
                    className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border-2 border-slate-200 text-slate-700 flex flex-col items-center justify-center transition-all cursor-pointer"
                  >
                    <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                    </svg>
                    {deleteBtn.main ? (
                      <span className="text-[11px] sm:text-xs font-semibold text-slate-500 mt-0.5">{deleteBtn.main}</span>
                    ) : null}
                  </button>
                </div>

              </div>
            )}

          </div>

        </section>

        {/* Bottom Bar Area inside card: Helper & Status Chip "Local mode" */}
        <footer className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm md:text-base font-medium text-slate-500">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{t('login.forgot_pin_note')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-100 border border-slate-300 rounded-xl text-slate-700">
            <span className="w-3 h-3 rounded-full bg-[#1B8F4A] animate-pulse"></span>
            <div className="flex flex-col">
              <span className="text-base font-bold text-slate-800 leading-none">{t('common.local_mode')}</span>
              <span className="text-xs text-slate-500 font-medium leading-tight mt-0.5">{t('common.offline_active')}</span>
            </div>
          </div>
        </footer>

      </main>

    </div>
  );
};

export default Login;
