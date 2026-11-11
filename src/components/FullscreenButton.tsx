import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { Icon } from './Icon';

interface FullscreenButtonProps {
  className?: string;
}

export const FullscreenButton: React.FC<FullscreenButtonProps> = ({ className }) => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  if (typeof document === 'undefined' || !document.fullscreenEnabled) {
    return null;
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Catch every error silently
    }
  };

  const label = isFullscreen ? t('common.fullscreen_exit') : t('common.fullscreen_enter');

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleFullscreen}
      className={
        className ||
        'w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant'
      }
    >
      <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} className="text-[24px]" />
    </button>
  );
};
