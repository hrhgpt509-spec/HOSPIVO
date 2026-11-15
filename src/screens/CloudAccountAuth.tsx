import React, { useState } from 'react';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useTranslation, tButton } from '../i18n';
import { textFieldProps } from '../logic/format';
import { triggerFeedback } from '../logic/feedback';
import { isBackendConfigured } from '../lib/supabase';
import { signUpOwner, signInOwner, provisionCloudShop } from '../logic/cloudAuth';

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
  initialTab = 'signup',
  shopName,
  shopSyncId,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();

  const [tab, setTab] = useState<'signup' | 'signin'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const btnSignup = tButton('cloud_auth.btn_signup');
  const btnSignin = tButton('cloud_auth.btn_signin');
  const btnContinueOffline = tButton('cloud_auth.btn_continue_offline');
  const btnBack = tButton('common.btn_back');

  const configured = isBackendConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError(t('cloud_auth.err_email_invalid'));
      return;
    }

    if (password.length < 6) {
      setError(t('cloud_auth.err_password_short'));
      return;
    }

    if (tab === 'signup' && password !== confirmPassword) {
      setError(t('cloud_auth.err_password_mismatch'));
      return;
    }

    if (!configured) {
      setError(t('cloud_auth.backend_unconfigured'));
      return;
    }

    setIsLoading(true);

    try {
      if (tab === 'signup') {
        const res = await signUpOwner(cleanEmail, password);
        if (res.error) {
          setError(res.error);
          setIsLoading(false);
          return;
        }

        let provisionedUuid: string | undefined = undefined;
        if (shopName) {
          const prov = await provisionCloudShop(shopName, shopSyncId);
          provisionedUuid = prov.shopUuid || undefined;
        }

        triggerFeedback('success', t('cloud_auth.toast_signup_success'));
        onSuccess({
          email: cleanEmail,
          cloudShopUuid: provisionedUuid,
          shopName,
          shopSyncId,
        });
      } else {
        const res = await signInOwner(cleanEmail, password);
        if (res.error) {
          setError(res.error || t('cloud_auth.err_auth_failed'));
          setIsLoading(false);
          return;
        }

        triggerFeedback('success', t('cloud_auth.toast_signin_success'));
        onSuccess({
          email: cleanEmail,
          cloudShopUuid: res.shop?.id,
          shopName: res.shop?.name || shopName,
          shopSyncId: res.shop?.syncId || shopSyncId,
        });
      }
    } catch (err: any) {
      setError(err?.message || t('cloud_auth.err_auth_failed'));
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

          {/* Tab Selector */}
          <div className="grid grid-cols-2 p-1.5 bg-surface-container-high rounded-2xl gap-2 shadow-inner">
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setError('');
              }}
              className={`h-12 rounded-xl text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                tab === 'signup'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name="person_add" className="text-[20px]" />
              <span>{t('cloud_auth.tab_signup')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setError('');
              }}
              className={`h-12 rounded-xl text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                tab === 'signin'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name="login" className="text-[20px]" />
              <span>{t('cloud_auth.tab_signin')}</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                  {...textFieldProps('code', email, setEmail)}
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

            {/* Password Field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-on-surface">
                  {t('cloud_auth.password_label')} <span className="text-error">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-xs text-primary font-bold hover:underline cursor-pointer"
                >
                  {showPassword ? t('cloud_auth.hide_password') : t('cloud_auth.show_password')}
                </button>
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-4 text-outline pointer-events-none">
                  <Icon name="lock" className="text-[20px]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('cloud_auth.password_placeholder')}
                  required
                  minLength={6}
                  className="w-full h-14 pl-12 pr-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                />
              </div>
            </div>

            {/* Confirm Password Field (Sign Up only) */}
            {tab === 'signup' && (
              <div className="flex flex-col gap-1.5 animate-fadeIn">
                <label className="text-sm font-bold text-on-surface">
                  {t('cloud_auth.confirm_password_label')} <span className="text-error">*</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-outline pointer-events-none">
                    <Icon name="check_circle" className="text-[20px]" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('cloud_auth.confirm_password_placeholder')}
                    required
                    minLength={6}
                    className="w-full h-14 pl-12 pr-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="h-14 min-h-[56px] px-8 bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] cursor-pointer font-bold disabled:opacity-50"
              >
                <Icon name={tab === 'signup' ? 'person_add' : 'login'} className="text-[22px]" />
                <div className="flex flex-col text-left">
                  <span className="text-base font-bold leading-tight">
                    {tab === 'signup' ? btnSignup.main : btnSignin.main}
                  </span>
                  {(tab === 'signup' ? btnSignup.sub : btnSignin.sub) && (
                    <span className="text-xs text-on-primary/80 font-normal leading-none">
                      {tab === 'signup' ? btnSignup.sub : btnSignin.sub}
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

          {/* Bottom Switch Note */}
          <div className="text-center pt-1 border-t border-outline-variant/20">
            {tab === 'signup' ? (
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setError('');
                }}
                className="text-xs sm:text-sm text-primary font-bold hover:underline cursor-pointer"
              >
                {t('cloud_auth.sign_in_existing_link')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTab('signup');
                  setError('');
                }}
                className="text-xs sm:text-sm text-primary font-bold hover:underline cursor-pointer"
              >
                {t('cloud_auth.sign_up_new_link')}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CloudAccountAuth;
