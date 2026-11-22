import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useTranslation, tButton } from '../i18n';
import { useBackHandler } from '../logic/androidBack';
import { INTRO_SLIDE_COUNT } from '../logic/onboarding';

interface WelcomeIntroProps {
  /** Called when the intro is finished or skipped. */
  onDone: () => void;
}

const SLIDES = [
  { icon: 'receipt_long', title: 'intro.slide1_title', desc: 'intro.slide1_desc' },
  { icon: 'inventory_2', title: 'intro.slide2_title', desc: 'intro.slide2_desc' },
  { icon: 'cloud_sync', title: 'intro.slide3_title', desc: 'intro.slide3_desc' },
] as const;

export const WelcomeIntro: React.FC<WelcomeIntroProps> = ({ onDone }) => {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const isLast = index === INTRO_SLIDE_COUNT - 1;
  const slide = SLIDES[index];

  const btnSkip = tButton('intro.btn_skip');
  const btnNext = tButton('intro.btn_next');
  const btnStart = tButton('intro.btn_get_started');
  const primary = isLast ? btnStart : btnNext;

  const goNext = () => {
    if (isLast) onDone();
    else setIndex((i) => Math.min(INTRO_SLIDE_COUNT - 1, i + 1));
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  useBackHandler(index > 0, goPrev);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx < -50) goNext();
    else if (dx > 50) goPrev();
  };

  return (
    <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col overflow-x-clip px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] select-none">
      <header className="w-full max-w-md mx-auto min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
              <Icon name="add" className="text-[24px]" />
            </div>
            <span className="text-lg font-black tracking-tight truncate">{t('common.app_name')}</span>
          </div>
          <button
            type="button"
            onClick={onDone}
            className="min-h-[48px] min-w-[64px] px-4 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 cursor-pointer shrink-0"
          >
            {btnSkip.main}
          </button>
        </div>
        <div className="w-full min-w-0">
          <LanguageSwitch className="w-full justify-between" />
        </div>
      </header>

      <main
        className="flex-1 w-full max-w-md mx-auto min-w-0 flex flex-col items-center justify-center text-center gap-6 py-6"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-[2rem] bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner shrink-0">
          <div className="w-20 h-20 rounded-3xl bg-primary text-on-primary flex items-center justify-center shadow-md">
            <Icon name={slide.icon} className="text-[44px]" />
          </div>
        </div>

        <div className="w-full min-w-0 flex flex-col gap-3 px-1" aria-live="polite">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            {t('intro.welcome_badge')}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black leading-tight break-words">
            {t(slide.title as any)}
          </h1>
          <p className="text-base text-on-surface-variant leading-relaxed break-words">
            {t(slide.desc as any)}
          </p>
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto min-w-0 flex flex-col gap-4">
        <div
          className="flex items-center justify-center gap-1"
          role="tablist"
          aria-label={t('intro.progress_label', { current: index + 1, total: INTRO_SLIDE_COUNT })}
        >
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className="w-8 h-8 flex items-center justify-center cursor-pointer"
            >
              <span
                className={`block h-2.5 rounded-full transition-all ${
                  i === index ? 'w-7 bg-primary' : 'w-2.5 bg-outline-variant'
                }`}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          className="w-full min-h-[56px] px-6 py-2.5 rounded-2xl bg-primary hover:bg-primary-container text-on-primary font-bold shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-3 cursor-pointer"
        >
          <div className="flex flex-col items-center min-w-0">
            <span className="text-lg font-bold leading-tight">{primary.main}</span>
            {primary.sub && <span className="text-xs text-on-primary/80 font-medium leading-tight">{primary.sub}</span>}
          </div>
          <Icon name={isLast ? 'check' : 'arrow_forward'} className="text-[22px] shrink-0" />
        </button>
      </footer>
    </div>
  );
};

export default WelcomeIntro;
