import React, { useState } from 'react';
import type { DBUser, Shop } from '../../db';
import { useTranslation } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { buildWhatsAppShoppingList, type SupplierLowStockGroup } from '../../logic/stockDekho';

interface LowStockListProps {
  groups: SupplierLowStockGroup[];
  totalLowStockItems: number;
  onBack: () => void;
  onReturnHome: () => void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const LowStockList: React.FC<LowStockListProps> = ({
  groups,
  totalLowStockItems,
  onBack,
  onReturnHome,
  currentUser,
  shop,
  theme,
  onToggleTheme,
}) => {
  const { t, shouldShowSub } = useTranslation();
  const { name: hookShopName } = useShop();
  const [copiedOrSent, setCopiedOrSent] = useState(false);

  const shopName = hookShopName || shop?.name || '';
  const userRole = currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier');
  const userName = currentUser?.name || userRole;

  const handleWhatsAppShare = () => {
    try {
      const messageText = buildWhatsAppShoppingList(groups, t);
      const url = `https://wa.me/?text=${encodeURIComponent(messageText)}`;
      window.open(url, '_blank');
      setCopiedOrSent(true);
      setTimeout(() => setCopiedOrSent(false), 2500);
    } catch {
      // Gracefully handle if window.open fails (e.g. offline or popup blocked)
      setCopiedOrSent(true);
      setTimeout(() => setCopiedOrSent(false), 2500);
    }
  };

  const wapasBtn = {
    main: t('stock_dekho.btn_wapas.main'),
    sub: t('stock_dekho.btn_wapas.sub'),
  };
  const whatsappBtn = {
    main: t('stock_dekho.btn_whatsapp_share.main'),
    sub: t('stock_dekho.btn_whatsapp_share.sub'),
  };

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col select-none">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30">
        <div className="h-20 w-full max-w-[1440px] mx-auto px-gutter flex items-center justify-between">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-sm cursor-pointer" onClick={onReturnHome}>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <Icon name="local_pharmacy" className="text-on-primary text-[24px]" />
              </div>
              <span className="font-headline-md text-headline-md font-bold tracking-tight text-primary">
                {t('common.app_name')}
              </span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-outline-variant" />
            <div className="hidden sm:flex flex-col">
              <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight">
                {shopName}
              </span>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none">
                {t('common.counter_pos')}
              </span>
            </div>
            <div className="hidden md:inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container border border-outline-variant">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface font-semibold">
                {t('common.local_mode')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-xs sm:gap-space-md">
            <button
              onClick={onBack}
              className="px-3 sm:px-space-md py-2 transition-all bg-surface-container hover:bg-surface-container-high text-on-surface font-bold rounded-lg shadow-sm flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <Icon name="arrow_back" className="text-[20px]" />
              <span>{wapasBtn.main}</span>
            </button>

            <button
              onClick={onToggleTheme}
              aria-label={t('common.toggle_theme')}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer"
              type="button"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
            </button>

            <FullscreenButton />

            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="hidden sm:flex flex-col text-right">
                <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight">
                  {userName}
                </span>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none">
                  {userRole}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Icon name="person" className="text-on-primary text-[18px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full pt-20 bg-surface flex-1">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto px-gutter py-space-md gap-space-md select-none">
          {/* Screen Header */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-space-xs">
            <div className="flex items-baseline gap-space-sm">
              <h1 className="font-headline-lg text-2xl sm:text-headline-lg font-bold text-on-surface">
                {t('stock_dekho.shopping_list_title')}
              </h1>
              {shouldShowSub(t('stock_dekho.shopping_list_title'), t('stock_dekho.shopping_list_sub')) && (
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                  {t('stock_dekho.shopping_list_sub')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-space-sm bg-surface-container-high px-space-md py-space-xs rounded-xl shadow-sm">
              <Icon name="inventory_2" className="text-tertiary text-[22px]" />
              <span className="font-body-md text-body-md font-bold text-on-surface">
                {t('stock_dekho.shopping_list_summary', {
                  suppliers: groups.length,
                  items: totalLowStockItems,
                })}
              </span>
            </div>
          </div>

          {/* Cards Grouped by Supplier */}
          {groups.length === 0 ? (
            <div className="p-12 text-center text-outline bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30">
              <Icon name="inventory" className="text-[48px] text-outline mb-2" />
              <p className="font-title-hinglish text-lg font-bold">
                {t('stock_dekho.empty_title')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg mb-space-lg">
              {groups.map((group, idx) => (
                <div
                  key={group.supplierId || `group-${idx}`}
                  className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-lg flex flex-col justify-between gap-space-md"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-center justify-between pb-space-md mb-space-md bg-surface-container-low/50 px-space-md py-space-sm rounded-lg border border-outline-variant/20">
                      <div className="flex items-center gap-space-sm min-w-0">
                        <Icon name="local_shipping" className="text-primary text-[28px] shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-headline-md text-xl font-bold text-on-surface truncate">
                            {group.supplierName}
                          </span>
                          {(group.supplierDetails || group.supplierId === undefined) && (
                            <span className="font-label-sub-english text-label-sub-english text-on-surface-variant truncate">
                              {group.supplierDetails || t('stock_dekho.unknown_supplier_desc')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-label-sub-english text-label-sub-english font-bold px-space-md py-space-xs rounded-full bg-surface-container text-on-surface shrink-0">
                        {t('stock_dekho.supplier_items_count', { count: group.items.length })}
                      </span>
                    </div>

                    {/* Medicine Rows */}
                    <div className="flex flex-col gap-space-sm">
                      {group.items.map((item) => (
                        <div
                          key={item.medicine.id}
                          className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-space-sm sm:p-space-md rounded-lg bg-surface-container-low/60 hover:bg-surface-container-low transition-colors border border-outline-variant/10"
                        >
                          <div className="flex flex-col min-w-0 flex-1 pr-2">
                            <span className="font-title-hinglish text-title-hinglish font-bold text-on-surface truncate">
                              {item.medicine.name}
                              {item.medicine.strength ? ` ${item.medicine.strength}` : ''}
                            </span>
                            <span className="font-label-sub-english text-label-sub-english text-on-surface-variant truncate">
                              {[
                                item.medicine.company,
                                item.medicine.unitsPerPack
                                  ? t('stock_dekho.strip_of_units', { count: item.medicine.unitsPerPack })
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' • ')}
                            </span>
                          </div>

                          <div className="flex items-center gap-space-sm sm:gap-space-md shrink-0">
                            <div className="flex items-center gap-space-xs bg-tertiary-fixed text-on-tertiary-fixed px-space-sm sm:px-space-md py-space-xs rounded-lg font-body-md text-body-md font-bold shadow-xs">
                              <Icon name="warning" className="text-[18px] text-tertiary" />
                              <span>{t('stock_dekho.stock_left_label', { count: item.packsLeft })}</span>
                            </div>
                            <div className="flex items-center gap-space-xs bg-primary text-on-primary px-space-sm sm:px-space-md py-space-xs rounded-lg font-body-md text-body-md font-bold shadow-xs">
                              <Icon name="add_box" className="text-[18px]" />
                              <span>{t('stock_dekho.order_qty_label', { count: item.reorderPacks })}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Supplier Card Footnote */}
                  <div className="mt-space-md pt-space-sm flex justify-between items-center text-on-surface-variant font-label-sub-english text-label-sub-english border-t border-outline-variant/20">
                    <span>
                      {t('stock_dekho.supplier_total_items', { count: group.items.length })}
                    </span>
                    <span className="text-primary font-bold">
                      {t('stock_dekho.order_ready')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Persistent Action Dock */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md flex flex-wrap items-center justify-between gap-4 mt-auto">
            {/* Wapas Button */}
            <button
              className="min-h-[56px] px-space-lg rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all flex items-center gap-space-sm active:translate-y-0.5 cursor-pointer"
              onClick={onBack}
              type="button"
            >
              <Icon name="arrow_back" className="text-[24px]" />
              <div className="flex flex-col text-left">
                <span className="font-button-text text-button-text leading-tight text-on-surface">
                  {wapasBtn.main}
                </span>
                {shouldShowSub(wapasBtn.main, wapasBtn.sub) && (
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {wapasBtn.sub}
                  </span>
                )}
              </div>
            </button>

            {/* Info Chip */}
            <div className="hidden sm:flex items-center gap-space-sm text-on-surface-variant px-space-md">
              <Icon name="info" className="text-[22px] text-secondary" />
              <span className="font-body-md text-body-md">
                {t('stock_dekho.whatsapp_info_note')}
              </span>
            </div>

            {/* WhatsApp Share Button */}
            <button
              onClick={handleWhatsAppShare}
              className={`min-h-[64px] px-space-xl rounded-xl shadow-md transition-all flex items-center gap-space-md active:translate-y-0.5 cursor-pointer ${
                copiedOrSent
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-primary text-on-primary hover:bg-primary-container'
              }`}
              id="shareWhatsAppBtn"
              type="button"
            >
              <Icon name={copiedOrSent ? 'check_circle' : 'chat'} className="text-[32px]" />
              <div className="flex flex-col text-left">
                <span className="font-button-text text-button-text leading-tight">
                  {copiedOrSent ? t('stock_dekho.toast_whatsapp_sent') : whatsappBtn.main}
                </span>
                {shouldShowSub(whatsappBtn.main, whatsappBtn.sub) && !copiedOrSent && (
                  <span className="font-label-sub-english text-label-sub-english text-on-primary-container font-medium">
                    {whatsappBtn.sub}
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
