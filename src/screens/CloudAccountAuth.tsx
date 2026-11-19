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
  provisionCloudShop,
  ACCOUNT_NOT_FOUND_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  RATE_LIMIT_MESSAGE,
} from '../logic/cloudAuth';

export interface CloudAccountAuthProps {
  onSuccess: (session: {
    email: string;
    cloudShopUuid?: string;
    shopName?: string;
    shopSyncId?: string;
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

  const [step, setStep] = useState<'enter_email' | 'enter_otp'>('enter_email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const otpInputRef = useRef<HTMLInputElement>(null);

  const btnSendOtp = tButton('cloud_auth.btn_send_otp');
  const btnVerifyOtp = tButton('cloud_auth.btn_verify_otp');
  const btnResendOtp = tButton('cloud_auth.btn_resend_otp');
  const btnChangeEmail = tButton('cloud_auth.btn_change_email');
  const btnContinueOffline = tButton('cloud_auth.btn_continue_offline');
  const btnBack = tButton('common.btn_back');

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
      const res = await verifyEmailOtp(cleanEmail, cleanOtp);
      if (res.error) {
        setError(otpErrorText(res.errorCode, res.error));
        setIsLoading(false);
        return;
      }

      if (res.user) {
        let provisionedUuid = res.shop?.id;
        if (res.isNewShop && shopName) {
          const prov = await provisionCloudShop(shopName, shopSyncId);
          provisionedUuid = prov.shopUuid || undefined;
        }

        triggerFeedback('success', t('cloud_auth.toast_signin_success'));
        onSuccess({
          email: res.user.email || cleanEmail,
          cloudShopUuid: provisionedUuid,
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
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-between selection:bg-primary-fixed selection:text-on-primary-fixed">
      {/* Top Header */}
      <header className="h-20 w-full px-4 sm:px-8 border-b border-outline-variant/30 bg-surface-container-lowest flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm shrink-0">
            <Icon name="cloud" className="text-[28px]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface leading-tight">
              {t('cloud_auth.modal_title')}
            </h1>
            <span className="text-xs sm:text-sm text-outline font-medium">
              {t('cloud_auth.modal_sub')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {onToggleTheme && (
            <button
              type="button"
              aria-label={t('common.toggle_theme')}
              onClick={onToggleTheme}
              className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
            </button>
          )}

          <FullscreenButton className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant" />

          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-surface-container rounded-xl border border-outline-variant hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <Icon name="arrow_back" className="text-primary text-[20px]" />
            <span className="font-bold text-sm text-on-surface leading-none">{btnBack.main}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col justify-center">
        <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 border border-outline-variant/40 shadow-xl flex flex-col gap-6">
          {/* Unconfigured notice if backend is unconfigured */}
          {!configured && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <Icon name="warning" className="text-amber-600 dark:text-amber-400 text-[24px] shrink-0 mt-0.5" />
              <div className="flex flex-col text-sm text-on-surface">
                <span className="font-bold text-amber-800 dark:text-amber-300">
                  {t('cloud_auth.backend_unconfigured')}
                </span>
                <span className="text-xs text-outline mt-0.5">
                  {t('cloud_auth.offline_note')}
                </span>
              </div>
            </div>
          )}

          {step === 'enter_email' ? (
            /* Step 1: Enter Email */
            <form onSubmit={handleSendEmailOtp} className="flex flex-col gap-5">
              {error && (
                <div className="p-3.5 bg-error/10 border border-error/30 text-error rounded-xl text-sm font-semibold flex items-center gap-2 animate-fadeIn">
                  <Icon name="error" className="text-[20px] shrink-0" />
                  <span>{error}</span>
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
                    className="w-full h-14 pl-12 pr-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface normal-case text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-14 min-h-[56px] px-8 bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold disabled:opacity-50"
                >
                  <Icon name="send" className={`text-[22px] ${isLoading ? 'animate-spin' : ''}`} />
                  <div className="flex flex-col text-left">
                    <span className="text-base font-bold leading-tight">{btnSendOtp.main}</span>
                    {btnSendOtp.sub && (
                      <span className="text-xs text-on-primary/80 font-normal leading-none">
                        {btnSendOtp.sub}
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  className="h-14 min-h-[56px] px-6 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center justify-center gap-2.5 transition-colors cursor-pointer border border-outline-variant/40"
                >
                  <Icon name="offline_pin" className="text-[20px] text-outline" />
                  <div className="flex flex-col text-left">
                    <span className="text-sm sm:text-base font-bold leading-tight">{btnContinueOffline.main}</span>
                    {btnContinueOffline.sub && (
                      <span className="text-xs text-outline font-medium leading-none">{btnContinueOffline.sub}</span>
                    )}
                  </div>
                </button>
              </div>
            </form>
          ) : (
            /* Step 2: Enter 6-Digit OTP */
            <form onSubmit={handleVerifyOtp} className="flex flex-col items-center text-center gap-5 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                <Icon name="pin" className="text-[36px]" />
              </div>

              <div className="flex flex-col gap-1">
                <h2 className="text-xl sm:text-2xl font-bold text-on-surface">
                  {t('cloud_auth.enter_otp_title')}
                </h2>
                <p className="text-sm text-on-surface-variant max-w-md">
                  {t('cloud_auth.enter_otp_sub').replace('{email}', email)}
                </p>
              </div>

              {/* Email chip with Change Email button */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-full border border-outline-variant/30 text-xs sm:text-sm font-semibold text-on-surface">
                <Icon name="mail" className="text-primary text-[16px]" />
                <span className="select-all">{email}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('enter_email');
                    setError('');
                  }}
                  className="ml-1 text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                >
                  <Icon name="edit" className="text-[14px]" />
                  <span>{btnChangeEmail.main}</span>
                </button>
              </div>

              {error && (
                <div className="w-full p-3.5 bg-error/10 border border-error/30 text-error rounded-xl text-sm font-semibold flex items-center gap-2 text-left">
                  <Icon name="error" className="text-[20px] shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 6-Digit Numeric OTP Input */}
              <div className="w-full flex flex-col items-center gap-3">
                <label className="text-xs font-bold text-outline uppercase tracking-wider">
                  {t('cloud_auth.otp_label')}
                </label>

                {/* 6 digit display boxes */}
                <div
                  className="flex items-center justify-center gap-2 sm:gap-3 cursor-pointer"
                  onClick={() => otpInputRef.current?.focus()}
                >
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const char = otp[idx] || '';
                    const isCurrent = idx === otp.length;
                    return (
                      <div
                        key={idx}
                        className={`w-11 sm:w-13 h-14 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-mono font-bold transition-all border-2 ${
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
                  className="h-14 min-h-[56px] w-full px-8 bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold disabled:cursor-not-allowed"
                >
                  <Icon name="verified_user" className={`text-[22px] ${isLoading ? 'animate-spin' : ''}`} />
                  <div className="flex flex-col text-left">
                    <span className="text-base font-bold leading-tight">{btnVerifyOtp.main}</span>
                    {btnVerifyOtp.sub && (
                      <span className="text-xs text-on-primary/80 font-normal leading-none">
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
                    className="h-14 min-h-[56px] px-4 bg-surface-container hover:bg-surface-container-high disabled:opacity-50 text-on-surface rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer border border-outline-variant/40 font-bold text-sm disabled:cursor-not-allowed"
                  >
                    <Icon name="refresh" className={`text-[18px] ${isLoading ? 'animate-spin' : ''}`} />
                    <span>
                      {cooldown > 0
                        ? t('cloud_auth.resend_cooldown').replace('{seconds}', String(cooldown))
                        : btnResendOtp.main}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={onCancel}
                    className="h-14 min-h-[56px] px-4 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer border border-outline-variant/40 font-bold text-sm"
                  >
                    <Icon name="offline_pin" className="text-[18px] text-outline" />
                    <span>{btnContinueOffline.main}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default CloudAccountAuth;
