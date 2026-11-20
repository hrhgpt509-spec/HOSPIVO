import React from 'react';
import { Icon } from './Icon';
import { useTranslation, tButton } from '../i18n';

export type MobileNavTab = 'home' | 'dawai_becho' | 'stock_dekho' | 'udhaar' | 'owner';

interface MobileBottomNavProps {
  activeTab: MobileNavTab;
  onSelectTab: (tab: MobileNavTab) => void;
}

/**
 * Android / Capacitor phone-first bottom navigation bar.
 * Shown only on viewports below 1024px (lg:hidden), with >= 48px touch targets
 * and safe-area bottom inset padding.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  useTranslation();

  const homeLabel = tButton('home.return_home_btn').main;
  const sellLabel = tButton('home.tile_dawai_becho').main;
  const stockLabel = tButton('home.tile_stock_dekho').main;
  const udhaarLabel = tButton('home.tile_udhaar').main;
  const ownerLabel = tButton('home.tile_owner').main;

  const tabs: Array<{ id: MobileNavTab; icon: string; label: string }> = [
    { id: 'home', icon: 'home', label: homeLabel },
    { id: 'dawai_becho', icon: 'shopping_cart', label: sellLabel },
    { id: 'stock_dekho', icon: 'inventory_2', label: stockLabel },
    { id: 'udhaar', icon: 'menu_book', label: udhaarLabel },
    { id: 'owner', icon: 'key', label: ownerLabel },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface-container-lowest/98 dark:bg-gray-900/98 backdrop-blur-md border-t border-outline-variant/40 dark:border-gray-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <div className="w-full grid grid-cols-5 h-16 px-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition-colors cursor-pointer min-w-0 ${
                isActive
                  ? 'text-primary font-extrabold'
                  : 'text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <div
                className={`px-3 py-0.5 rounded-full flex items-center justify-center transition-colors ${
                  isActive ? 'bg-primary-fixed/70 text-primary' : 'bg-transparent'
                }`}
              >
                <Icon name={tab.icon} filled={isActive} className="text-[22px]" />
              </div>
              <span className="text-[11px] leading-tight truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
