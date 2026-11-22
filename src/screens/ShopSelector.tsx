import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { countActiveStaff } from '../logic/onboarding';
import { subscribeToSyncUpdates } from '../logic/cloudSync';

interface ShopSelectorProps {
  /** Enter the current shop and proceed to "Who is using?". */
  onEnter: () => void;
}

export const ShopSelector: React.FC<ShopSelectorProps> = ({ onEnter }) => {
  const { t } = useTranslation();
  const { name, address, mode } = useShop();
  const [staffCount, setStaffCount] = useState(0);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const btnEnter = tButton('shop_select.btn_enter');

  useEffect(() => {
    const load = () => {
      void countActiveStaff().then(setStaffCount);
    };
    load();
    return subscribeToSyncUpdates(load, ['staff', 'shop']);
  }, []);

  const isCloud = mode === 'cloud';

  return (
    <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col overflow-x-clip px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] select-none">
      <header className="w-full max-w-md mx-auto min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <Icon name="add" className="text-[24px]" />
          </div>
          <span className="text-lg font-black tracking-tight truncate">{t('common.app_name')}</span>
        </div>
        <div className="w-full min-w-0">
          <LanguageSwitch className="w-full justify-between" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto min-w-0 flex flex-col justify-start gap-5 pt-6 pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black leading-tight break-words">{t('shop_select.title')}</h1>
          <p className="text-sm text-on-surface-variant mt-1 break-words">{t('shop_select.sub')}</p>
        </div>

        {/* Active shop card */}
        <section className="flex flex-col gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-outline">
            {t('shop_select.current_label')}
          </span>
          <button
            type="button"
            onClick={onEnter}
            className="w-full min-w-0 min-h-[96px] p-4 rounded-2xl bg-surface-container-lowest border-2 border-primary/40 hover:border-primary shadow-sm flex items-center gap-3 text-left cursor-pointer transition-colors active:scale-[0.99]"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon name="storefront" className="text-[30px]" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
              <span className="text-lg font-bold leading-tight truncate">{name}</span>
              {address ? (
                <span className="text-sm text-on-surface-variant truncate">{address}</span>
              ) : null}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    isCloud
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant'
                  }`}
                >
                  <Icon name={isCloud ? 'cloud_done' : 'smartphone'} className="text-[14px]" />
                  {isCloud ? t('shop_select.badge_cloud') : t('shop_select.badge_local')}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant border border-outline-variant">
                  <Icon name="group" className="text-[14px]" />
                  {t('shop_select.staff_count', { count: staffCount })}
                </span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center text-primary">
              <Icon name="chevron_right" className="text-[28px]" />
              <span className="sr-only">{btnEnter.main}</span>
            </div>
          </button>
        </section>

        {/* Forward-compatible multi-shop placeholder */}
        <section className="flex flex-col gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setShowComingSoon((v) => !v)}
            aria-expanded={showComingSoon}
            className="w-full min-w-0 min-h-[64px] px-4 py-3 rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-low/50 flex items-center gap-3 text-left cursor-pointer hover:bg-surface-container-low transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0">
              <Icon name="add" className="text-[24px]" />
            </div>
            <span className="flex-1 min-w-0 text-base font-bold text-on-surface-variant truncate">
              {t('shop_select.add_shop')}
            </span>
            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant">
              {t('shop_select.coming_soon')}
            </span>
          </button>
          {showComingSoon && (
            <p
              role="status"
              className="px-3 py-2 rounded-xl bg-surface-container text-sm text-on-surface-variant flex items-start gap-2 break-words"
            >
              <Icon name="info" className="text-[18px] shrink-0 mt-0.5 text-primary" />
              <span className="min-w-0">{t('shop_select.coming_soon_msg')}</span>
            </p>
          )}
        </section>
      </main>
    </div>
  );
};

export default ShopSelector;
