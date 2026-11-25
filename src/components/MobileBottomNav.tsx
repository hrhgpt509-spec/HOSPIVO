import React from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../i18n';

export type MobileNavTab = 'home' | 'dawai_becho' | 'stock_dekho' | 'udhaar' | 'owner';

interface MobileBottomNavProps {
  activeTab: MobileNavTab;
  onSelectTab: (tab: MobileNavTab) => void;
}

/**
 * Android / Capacitor phone-first bottom navigation bar.
 * Shown only on viewports below 1024px (lg:hidden), with >= 48px touch targets,
 * concise 1-word localized labels (zero "..." truncation), and safe-area bottom insets.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const { t } = useTranslation();

  const tabs: Array<{ id: MobileNavTab; icon: string; label: string }> = [
    { id: 'home', icon: 'home', label: t('common.nav_home') },
    { id: 'dawai_becho', icon: 'shopping_cart', label: t('common.nav_sell') },
    { id: 'stock_dekho', icon: 'inventory_2', label: t('common.nav_stock') },
    { id: 'udhaar', icon: 'menu_book', label: t('common.nav_udhaar') },
    { id: 'owner', icon: 'key', label: t('common.nav_owner') },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest/98 dark:bg-gray-900/98 backdrop-blur-md border-t border-outline-variant/40 dark:border-gray-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[max(0.25rem,env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="w-full grid grid-cols-5 min-h-[64px] px-1 py-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-0.5 rounded-xl transition-colors cursor-pointer min-w-0 ${
                isActive
                  ? 'text-primary font-extrabold'
                  : 'text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <div
                className={`px-2.5 sm:px-3 py-0.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                  isActive ? 'bg-primary-fixed/70 text-primary' : 'bg-transparent'
                }`}
              >
                <Icon name={tab.icon} filled={isActive} className="text-[22px] shrink-0" />
              </div>
              <span className="text-[11px] leading-tight truncate max-w-full text-center">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
