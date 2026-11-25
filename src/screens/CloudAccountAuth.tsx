import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useTranslation, tButton } from '../i18n';
import { textFieldProps } from '../logic/format';
import { triggerFeedback } from '../logic/feedback';
import { isBackendConfigured } from '../lib/supabase';
import {
  sendEmailOtp,
  verifyEmailOtp,
  resolveCloudSignInChoice,
  ACCOUNT_NOT_FOUND_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  RATE_LIMIT_MESSAGE,
  type CloudSignInScenario,
  type CloudSignInChoice,
  type ExistingShopInfo,
} from '../logic/cloudAuth';
import type { LocalDataSummary } from '../logic/cloudSync';

export interface CloudAccountAuthProps {
  onSuccess: (session: {
    email: string;
    cloudShopUuid?: string;
    shopName?: string;
    shopSyncId?: string;
    startedCleanSetup?: boolean;
  }) => void;
  onCancel: () => void;
  initialTab?: 'signup' | 'signin';
  shopName?: string;
  shopSyncId?: string;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const CloudAccountAuth: React.FC<CloudAccountAuthProps> = ({
  onSuccess,
  onCancel,
  initialTab,
  shopName,
  shopSyncId,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();

  // Turns a sendEmailOtp / auth error code into a short, translated message (never a raw exception)
  const otpErrorText = (code: string | undefined, fallback?: string | null): string => {
    if (code === 'account_not_found' || fallback === ACCOUNT_NOT_FOUND_MESSAGE) {
      return t('cloud_auth.err_account_not_found');
    }
    if (
      code === 'network' ||
      fallback === NETWORK_ERROR_MESSAGE ||
      /failed to fetch|fetch failed|network|timed? ?out|abort|connection|offline/i.test(fallback || '')
    ) {
      return t('cloud_auth.err_network');
    }
    if (
      code === 'rate_limited' ||
      fallback === RATE_LIMIT_MESSAGE ||
      /rate limit|too many/i.test(fallback || '')
    ) {
      return t('cloud_auth.err_rate_limited');
    }
    return fallback || t('cloud_auth.err_auth_failed');
  };

  const [step, setStep] = useState<'enter_email' | 'enter_otp' | 'choose_sync_action'>('enter_email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pendingScenario, setPendingScenario] = useState<CloudSignInScenario | null>(null);
  const [pendingExistingShop, setPendingExistingShop] = useState<ExistingShopInfo | null>(null);
  const [pendingLocalSummary, setPendingLocalSummary] = useState<LocalDataSummary | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState('');

  const otpInputRef = useRef<HTMLInputElement>(null);

  const btnSendOtp = tButton('cloud_auth.btn_send_otp');
  const btnVerifyOtp = tButton('cloud_auth.btn_verify_otp');
  const btnResendOtp = tButton('cloud_auth.btn_resend_otp');
  const btnChangeEmail = tButton('cloud_auth.btn_change_email');
  const btnContinueOffline = tButton('cloud_auth.btn_continue_offline');
  const btnBack = tButton('common.btn_back');
  const btnPushLocalYes = tButton('cloud_auth.decision_push_local_yes');
  const btnPushLocalNo = tButton('cloud_auth.decision_push_local_no');
  const btnMergeYes = tButton('cloud_auth.decision_merge_yes');
  const btnMergeNo = tButton('cloud_auth.decision_merge_no');

  const configured = isBackendConfigured();

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Focus OTP input on step change
  useEffect(() => {
    if (step === 'enter_otp') {
      const timer = setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Physical keyboard support for OTP entry (digits, backspace, enter)
  useEffect(() => {
    if (step !== 'enter_otp') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (otp.length === 6 && !isLoading) {
          handleVerifyOtp();
        }
        return;
      }

      // If activeElement is not the OTP input, accept physical keyboard digits & backspace
      if (document.activeElement !== otpInputRef.current) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          setOtp((prev) => (prev.length < 6 ? prev + e.key : prev));
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          setOtp((prev) => prev.slice(0, -1));
        } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
          setOtp('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, otp, isLoading]);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError(t('cloud_auth.err_email_invalid'));
      return;
    }

    if (!configured) {
      setError(t('cloud_auth.backend_unconfigured'));
      return;
    }

    setIsLoading(true);
    try {
      const res = await sendEmailOtp(cleanEmail, { createUser: initialTab !== 'signin' });
      if (res.error) {
        setError(otpErrorText(res.errorCode, res.error));
        setIsLoading(false);
        return;
      }

      triggerFeedback('success', t('cloud_auth.toast_otp_sent'));
      setStep('enter_otp');
      setOtp('');
      setCooldown(30);
    } catch (err: any) {
      setError(otpErrorText(undefined, err?.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      setError(t('cloud_auth.err_otp_invalid'));
      return;
    }

    if (!configured) {
      setError(t('cloud_auth.backend_unconfigured'));
      return;
    }

    setIsLoading(true);
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await verifyEmailOtp(cleanEmail, cleanOtp, { deferHydration: true });
      if (res.error) {
        setError(otpErrorText(res.errorCode, res.error));
        setIsLoading(false);
        return;
      }

      if (res.user) {
        const resolvedEmail = res.user.email || cleanEmail;

        // Scenarios 1, 3 & 5 (when local data exists): ask the user explicitly before pushing/merging
        if (
          res.scenario === 'prompt_push_local_to_empty_cloud' ||
          res.scenario === 'prompt_merge_local_with_cloud'
        ) {
          setVerifiedEmail(resolvedEmail);
          setPendingScenario(res.scenario);
          setPendingExistingShop(res.shop);
          setPendingLocalSummary(res.localSummary || null);
          setStep('choose_sync_action');
          setIsLoading(false);
          return;
        }

        // Scenario 2 (direct existing cloud sync) or Scenario 5 (clean cloud setup with no local data)
        onSuccess({
          email: resolvedEmail,
          cloudShopUuid: res.shop?.id,
          shopName: res.shop?.name || shopName,
          shopSyncId: res.shop?.syncId || shopSyncId,
        });
      }
    } catch (err: any) {
      setError(otpErrorText(undefined, err?.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveDecision = async (choice: CloudSignInChoice) => {
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await resolveCloudSignInChoice({
        choice,
        email: verifiedEmail || email.trim().toLowerCase(),
        existingShop: pendingExistingShop,
        localShopName: shopName || pendingLocalSummary?.shopName,
        shopSyncId,
      });

      onSuccess({
        email: verifiedEmail || email.trim().toLowerCase(),
        cloudShopUuid: result.cloudShopUuid,
        shopName: result.shopName || shopName,
        shopSyncId: result.shopSyncId || shopSyncId,
        startedCleanSetup: result.startedCleanSetup,
      });
    } catch (err: any) {
      setError(otpErrorText(undefined, err?.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || isLoading) return;
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    setIsLoading(true);
    try {
      const res = await sendEmailOtp(cleanEmail, { createUser: initialTab !== 'signin' });
      if (res.error) {
        setError(otpErrorText(res.errorCode, res.error));
        return;
      }
      triggerFeedback('success', t('cloud_auth.toast_otp_sent'));
      setCooldown(30);
      otpInputRef.current?.focus();
    } catch (err: any) {
      setError(otpErrorText(undefined, err?.message));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full overflow-x-clip bg-surface text-on-surface flex flex-col justify-between pb-[max(1rem,env(safe-area-inset-bottom))] selection:bg-primary-fixed selection:text-on-primary-fixed">
      {/* Top Header */}
      <header className="min-h-[64px] w-full px-3 sm:px-8 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] border-b border-outline-variant/30 bg-surface-container-lowest flex items-center justify-between gap-2.5 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm shrink-0">
            <Icon name="cloud" className="text-[24px] sm:text-[28px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-base sm:text-2xl font-bold tracking-tight text-on-surface leading-tight truncate">
              {t('cloud_auth.modal_title')}
            </h1>
            <span className="text-[11px] sm:text-sm text-outline font-medium truncate">
              {t('cloud_auth.modal_sub')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {onToggleTheme && (
            <button
              type="button"
              aria-label={t('common.toggle_theme')}
              onClick={onToggleTheme}
              className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant shrink-0"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
            </button>
          )}

          <FullscreenButton className="hidden lg:flex w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant shrink-0" />

          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-surface-container rounded-xl border border-outline-variant hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
          >
            <Icon name="arrow_back" className="text-primary text-[20px] shrink-0" />
            <span className="font-bold text-xs sm:text-sm text-on-surface leading-none">{btnBack.main}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-xl mx-auto px-3 sm:px-6 py-5 sm:py-10 flex flex-col justify-center min-w-0">
        <div className="bg-surface-container-lowest rounded-3xl p-4 sm:p-8 border border-outline-variant/40 shadow-xl flex flex-col gap-5 sm:gap-6 min-w-0">
          {/* Unconfigured notice if backend is unconfigured */}
          {!configured && (
            <div className="p-3.5 sm:p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <Icon name="warning" className="text-amber-600 dark:text-amber-400 text-[24px] shrink-0 mt-0.5" />
              <div className="flex flex-col text-sm text-on-surface min-w-0">
                <span className="font-bold text-amber-800 dark:text-amber-300 break-words">
                  {t('cloud_auth.backend_unconfigured')}
                </span>
                <span className="text-xs text-outline mt-0.5 break-words">
                  {t('cloud_auth.offline_note')}
                </span>
              </div>
            </div>
          )}

          {step === 'enter_email' && (
            /* Step 1: Enter Email */
            <form onSubmit={handleSendEmailOtp} className="flex flex-col gap-5 min-w-0">
              {error && (
                <div className="p-3.5 bg-error/10 border border-error/30 text-error rounded-xl text-sm font-semibold flex items-center gap-2 animate-fadeIn">
                  <Icon name="error" className="text-[20px] shrink-0" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {/* Email Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-on-surface">
                  {t('cloud_auth.email_label')} <span className="text-error">*</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-outline pointer-events-none">
                    <Icon name="mail" className="text-[20px]" />
                  </div>
                  <input
                    {...textFieldProps('free', email, setEmail)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase())}
                    type="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    placeholder={t('cloud_auth.email_placeholder')}
                    required
                    className="w-full min-h-[56px] py-2.5 pl-12 pr-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface normal-case text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="min-h-[56px] py-2.5 px-5 sm:px-8 bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold disabled:opacity-50 min-w-0"
                >
                  <Icon name="send" className={`text-[22px] shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-base font-bold leading-tight break-words">{btnSendOtp.main}</span>
                    {btnSendOtp.sub && (
                      <span className="text-xs text-on-primary/80 font-normal leading-tight mt-0.5 break-words">
                        {btnSendOtp.sub}
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  className="min-h-[56px] py-2.5 px-5 sm:px-6 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center justify-center gap-2.5 transition-colors cursor-pointer border border-outline-variant/40 min-w-0"
                >
                  <Icon name="offline_pin" className="text-[20px] text-outline shrink-0" />
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-sm sm:text-base font-bold leading-tight break-words">{btnContinueOffline.main}</span>
                    {btnContinueOffline.sub && (
                      <span className="text-xs text-outline font-medium leading-tight mt-0.5 break-words">{btnContinueOffline.sub}</span>
                    )}
                  </div>
                </button>
              </div>
            </form>
          )}

          {step === 'enter_otp' && (
            /* Step 2: Enter 6-Digit OTP */
            <form onSubmit={handleVerifyOtp} className="flex flex-col items-center text-center gap-5 animate-fadeIn min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner shrink-0">
                <Icon name="pin" className="text-[36px]" />
              </div>

              <div className="flex flex-col gap-1 min-w-0 w-full">
                <h2 className="text-xl sm:text-2xl font-bold text-on-surface break-words">
                  {t('cloud_auth.enter_otp_title')}
                </h2>
                <p className="text-sm text-on-surface-variant max-w-md mx-auto break-words">
                  {t('cloud_auth.enter_otp_sub').replace('{email}', email)}
                </p>
              </div>

              {/* Email chip with Change Email button */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 bg-surface-container-high rounded-2xl sm:rounded-full border border-outline-variant/30 text-xs sm:text-sm font-semibold text-on-surface max-w-full min-w-0">
                <Icon name="mail" className="text-primary text-[16px] shrink-0" />
                <span className="select-all break-all">{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('enter_email');
                    setError('');
                  }}
                  className="ml-1 text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-bold shrink-0"
                >
                  <Icon name="edit" className="text-[14px] shrink-0" />
                  <span>{btnChangeEmail.main}</span>
                </button>
              </div>

              {error && (
                <div className="w-full p-3.5 bg-error/10 border border-error/30 text-error rounded-xl text-sm font-semibold flex items-center gap-2 text-left">
                  <Icon name="error" className="text-[20px] shrink-0" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {/* 6-Digit Numeric OTP Input */}
              <div className="w-full flex flex-col items-center gap-3 min-w-0">
                <label className="text-xs font-bold text-outline uppercase tracking-wider">
                  {t('cloud_auth.otp_label')}
                </label>

                {/* 6 digit display boxes (responsive grid fits cleanly on 360px screens) */}
                <div
                  className="w-full max-w-[312px] sm:max-w-[360px] grid grid-cols-6 gap-1.5 sm:gap-2.5 cursor-pointer"
                  onClick={() => otpInputRef.current?.focus()}
                >
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const char = otp[idx] || '';
                    const isCurrent = idx === otp.length;
                    return (
                      <div
                        key={idx}
                        className={`w-full min-w-0 h-13 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-3xl font-mono font-bold transition-all border-2 ${
                          char
                            ? 'border-primary bg-primary/10 text-primary'
                            : isCurrent
                            ? 'border-primary ring-2 ring-primary/30 bg-surface-container-lowest text-on-surface'
                            : 'border-outline-variant/60 bg-surface-container-lowest text-outline'
                        }`}
                      >
                        {char || <span className="opacity-25">—</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Native input (hidden or accessible overlay for autofill/typing) */}
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(val);
                  }}
                  placeholder={t('cloud_auth.otp_placeholder')}
                  className="sr-only"
                  aria-label={t('cloud_auth.otp_label')}
                />
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-3 pt-2">
                {/* Primary Verify Button */}
                <button
                  type="submit"
                  disabled={isLoading || otp.length !== 6}
                  className="min-h-[56px] py-2.5 w-full px-5 sm:px-8 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold disabled:cursor-not-allowed min-w-0"
                >
                  <Icon name="verified_user" className={`text-[22px] shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-base font-bold leading-tight break-words">{btnVerifyOtp.main}</span>
                    {btnVerifyOtp.sub && (
                      <span className="text-xs text-on-primary/80 font-normal leading-tight mt-0.5 break-words">
                        {btnVerifyOtp.sub}
                      </span>
                    )}
                  </div>
                </button>

                {/* Secondary row: Resend OTP and Continue Offline */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={cooldown > 0 || isLoading}
                    className="min-h-[56px] py-2.5 px-4 bg-surface-container hover:bg-surface-container-high disabled:opacity-50 text-on-surface rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer border border-outline-variant/40 font-bold text-sm disabled:cursor-not-allowed min-w-0"
                  >
                    <Icon name="refresh" className={`text-[18px] shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="break-words">
                      {cooldown > 0
                        ? t('cloud_auth.resend_cooldown').replace('{seconds}', String(cooldown))
                        : btnResendOtp.main}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onCancel}
                    className="min-h-[56px] py-2.5 px-4 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer border border-outline-variant/40 font-bold text-sm min-w-0"
                  >
                    <Icon name="offline_pin" className="text-[18px] text-outline shrink-0" />
                    <span className="break-words">{btnContinueOffline.main}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {step === 'choose_sync_action' && pendingScenario && (
            /* Step 3: Explicit Local vs Cloud Data Decision Prompt */
            <div className="flex flex-col items-center text-center gap-5 animate-fadeIn w-full min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner shrink-0">
                <Icon
                  name={pendingScenario === 'prompt_merge_local_with_cloud' ? 'merge' : 'cloud_upload'}
                  className="text-[36px]"
                />
              </div>

              <div className="flex flex-col gap-2 min-w-0 w-full">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {pendingScenario === 'prompt_merge_local_with_cloud'
                    ? t('cloud_auth.decision_merge_title')
                    : t('cloud_auth.decision_push_local_title')}
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-on-surface leading-snug break-words">
                  {pendingScenario === 'prompt_merge_local_with_cloud'
                    ? t('cloud_auth.decision_merge_question')
                    : t('cloud_auth.decision_push_local_question')}
                </h2>
                <p className="text-sm text-on-surface-variant leading-relaxed break-words">
                  {pendingScenario === 'prompt_merge_local_with_cloud'
                    ? t('cloud_auth.decision_merge_desc').replace(
                        '{name}',
                        pendingExistingShop?.name || shopName || 'Cloud Store'
                      )
                    : t('cloud_auth.decision_push_local_desc')}
                </p>
              </div>

              {pendingLocalSummary && (
                <div className="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/40 text-xs sm:text-sm font-semibold text-on-surface-variant flex items-center justify-center gap-2 flex-wrap">
                  <Icon name="devices" className="text-primary text-[18px] shrink-0" />
                  <span>
                    {t('cloud_auth.decision_local_summary')
                      .replace('{bills}', String(pendingLocalSummary.billsCount))
                      .replace('{medicines}', String(pendingLocalSummary.medicinesCount))
                      .replace('{staff}', String(pendingLocalSummary.usersCount))}
                  </span>
                </div>
              )}

              {error && (
                <div className="w-full p-3.5 bg-error/10 border border-error/30 text-error rounded-xl text-sm font-semibold flex items-center gap-2 text-left">
                  <Icon name="error" className="text-[20px] shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="w-full flex flex-col gap-3 pt-1">
                {pendingScenario === 'prompt_push_local_to_empty_cloud' ? (
                  <>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleResolveDecision('push_local')}
                      className="min-h-[60px] w-full px-5 py-3 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold"
                    >
                      <Icon name={isLoading ? 'sync' : 'cloud_upload'} className={`text-[22px] shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                      <div className="flex flex-col text-left min-w-0">
                        <span className="text-base font-bold leading-tight">{btnPushLocalYes.main}</span>
                        {btnPushLocalYes.sub && (
                          <span className="text-xs text-on-primary/80 font-normal leading-tight mt-0.5">
                            {btnPushLocalYes.sub}
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleResolveDecision('start_clean_cloud')}
                      className="min-h-[60px] w-full px-5 py-3 bg-surface-container hover:bg-surface-container-high disabled:opacity-50 text-on-surface rounded-2xl flex items-center justify-center gap-3 transition-colors cursor-pointer border border-outline-variant/50 font-bold"
                    >
                      <Icon name="add_business" className="text-[22px] text-primary shrink-0" />
                      <div className="flex flex-col text-left min-w-0">
                        <span className="text-base font-bold leading-tight">{btnPushLocalNo.main}</span>
                        {btnPushLocalNo.sub && (
                          <span className="text-xs text-outline font-medium leading-tight mt-0.5">
                            {btnPushLocalNo.sub}
                          </span>
                        )}
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleResolveDecision('merge_local_and_cloud')}
                      className="min-h-[60px] w-full px-5 py-3 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold"
                    >
                      <Icon name={isLoading ? 'sync' : 'merge'} className={`text-[22px] shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                      <div className="flex flex-col text-left min-w-0">
                        <span className="text-base font-bold leading-tight">{btnMergeYes.main}</span>
                        {btnMergeYes.sub && (
                          <span className="text-xs text-on-primary/80 font-normal leading-tight mt-0.5">
                            {btnMergeYes.sub}
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleResolveDecision('use_cloud_only')}
                      className="min-h-[60px] w-full px-5 py-3 bg-surface-container hover:bg-surface-container-high disabled:opacity-50 text-on-surface rounded-2xl flex items-center justify-center gap-3 transition-colors cursor-pointer border border-outline-variant/50 font-bold"
                    >
                      <Icon name="cloud_download" className="text-[22px] text-primary shrink-0" />
                      <div className="flex flex-col text-left min-w-0">
                        <span className="text-base font-bold leading-tight">{btnMergeNo.main}</span>
                        {btnMergeNo.sub && (
                          <span className="text-xs text-outline font-medium leading-tight mt-0.5">
                            {btnMergeNo.sub}
                          </span>
                        )}
                      </div>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CloudAccountAuth;
