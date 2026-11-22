import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useTranslation, tButton } from '../i18n';
import { subscribeToSyncUpdates } from '../logic/cloudSync';
import {
  getAvailableShops,
  switchActiveShop,
  type ShopDirectoryEntry,
} from '../logic/multiShop';

interface ShopSelectorProps {
  /** Enter the selected shop and proceed to "Who is using?". */
  onEnter: () => void;
  /** Start a fresh, isolated New Shop setup flow. */
  onAddShop?: () => void;
}

export const ShopSelector: React.FC<ShopSelectorProps> = ({ onEnter, onAddShop }) => {
  const { t } = useTranslation();
  const [shops, setShops] = useState<ShopDirectoryEntry[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const btnEnter = tButton('shop_select.btn_enter');

  const loadShops = useCallback(async () => {
    try {
      const result = await getAvailableShops();
      setShops(result.shops);
      setActiveWorkspaceId(result.activeWorkspaceId);
      setOwnerEmail(result.ownerEmail);
    } catch (err) {
      console.warn('Failed to load available shops:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShops();
    return subscribeToSyncUpdates(() => {
      void loadShops();
    }, ['staff', 'shop', 'workspace_switched']);
  }, [loadShops]);

  const handleSelectShop = async (shop: ShopDirectoryEntry) => {
    if (switchingId) return;
    setSwitchingId(shop.workspaceId);
    try {
      await switchActiveShop(shop);
      onEnter();
    } catch (err) {
      console.warn('Failed to switch shop:', err);
      onEnter();
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col overflow-x-clip px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] select-none">
      <header className="w-full max-w-md mx-auto min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
              <Icon name="add" className="text-[24px]" />
            </div>
            <span className="text-lg font-black tracking-tight truncate">{t('common.app_name')}</span>
          </div>
          {ownerEmail ? (
            <span className="text-xs font-semibold text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant truncate max-w-[55%]">
              {t('shop_select.cloud_account_label', { email: ownerEmail })}
            </span>
          ) : null}
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

        {/* Shops list for the active account / device */}
        <section className="flex flex-col gap-3 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-outline">
            {shops.length > 1 ? t('shop_select.other_shops_label') : t('shop_select.current_label')}
          </span>

          {isLoading ? (
            <div className="w-full min-h-[96px] p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 flex items-center justify-center gap-2 text-sm font-semibold text-on-surface-variant">
              <Icon name="sync" className="text-[20px] animate-spin text-primary" />
              <span>{t('common.loading')}</span>
            </div>
          ) : (
            shops.map((shop) => {
              const isActive = shop.workspaceId === activeWorkspaceId;
              const isCloud = shop.mode === 'cloud';
              const isBusy = switchingId === shop.workspaceId;

              return (
                <button
                  key={shop.workspaceId}
                  type="button"
                  disabled={Boolean(switchingId)}
                  onClick={() => handleSelectShop(shop)}
                  className={`w-full min-w-0 min-h-[96px] p-4 rounded-2xl bg-surface-container-lowest shadow-sm flex items-center gap-3 text-left cursor-pointer transition-colors active:scale-[0.99] disabled:opacity-70 ${
                    isActive
                      ? 'border-2 border-primary/60 hover:border-primary'
                      : 'border border-outline-variant hover:border-primary/50'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name={isBusy ? 'sync' : 'storefront'} className={`text-[30px] ${isBusy ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg font-bold leading-tight truncate">{shop.name}</span>
                      {isActive && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary text-on-primary">
                          {t('shop_select.active_badge')}
                        </span>
                      )}
                    </div>
                    {isBusy ? (
                      <span className="text-sm font-semibold text-primary truncate">
                        {t('shop_select.switching')}
                      </span>
                    ) : shop.address ? (
                      <span className="text-sm text-on-surface-variant truncate">{shop.address}</span>
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
                        {t('shop_select.staff_count', { count: shop.staffCount })}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center text-primary">
                    <Icon name="chevron_right" className="text-[28px]" />
                    <span className="sr-only">{btnEnter.main}</span>
                  </div>
                </button>
              );
            })
          )}
        </section>

        {/* Functional "+ Add Another Shop" action */}
        {onAddShop && (
          <section className="flex flex-col gap-2 min-w-0">
            <button
              type="button"
              disabled={Boolean(switchingId)}
              onClick={onAddShop}
              className="w-full min-w-0 min-h-[72px] px-4 py-3.5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center gap-3 text-left cursor-pointer transition-colors active:scale-[0.99] disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-xs">
                <Icon name="add_business" className="text-[24px]" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-base font-bold text-primary leading-tight truncate">
                  {t('shop_select.add_shop')}
                </span>
                <span className="text-xs text-on-surface-variant font-medium mt-0.5 break-words">
                  {t('shop_select.add_shop_sub')}
                </span>
              </div>
              <Icon name="arrow_forward" className="text-[22px] text-primary shrink-0" />
            </button>
          </section>
        )}
      </main>
    </div>
  );
};

export default ShopSelector;
