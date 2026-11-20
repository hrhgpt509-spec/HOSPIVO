import React from 'react';
import { Icon } from './Icon';
import { useTranslation } from '../i18n';

interface MobileTopBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: 'arrow_back' | 'home';
  backLabel?: string;
  rightSlot?: React.ReactNode;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

/**
 * Compact sticky top header tailored for phone viewports (< 1024px).
 * Uses >= 48px touch targets, safe-area top spacing, and clean truncation with min-w-0.
 */
export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  title,
  subtitle,
  onBack,
  backIcon = 'arrow_back',
  backLabel,
  rightSlot,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();

  return (
    <header className="lg:hidden sticky top-0 z-40 w-full bg-surface-container-lowest/95 backdrop-blur-md border-b border-outline-variant/30 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-xs print:hidden">
      <div className="w-full flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel || t('common.btn_home.main')}
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-surface-container hover:bg-surface-container-high active:scale-95 flex items-center justify-center text-on-surface cursor-pointer shrink-0 transition-all"
            >
              <Icon name={backIcon} className="text-[22px]" />
            </button>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <h1 className="font-title-hinglish font-extrabold text-base text-on-surface leading-tight truncate">
              {title}
            </h1>
            {subtitle ? (
              <span className="text-xs text-on-surface-variant font-medium leading-tight truncate mt-0.5">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {rightSlot}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={t('common.toggle_theme')}
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-surface-container hover:bg-surface-container-high active:scale-95 flex items-center justify-center text-on-surface-variant cursor-pointer shrink-0 transition-all"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
