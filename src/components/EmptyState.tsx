import React from 'react';

export interface EmptyStateProps {
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionSubLabel?: string;
  onAction?: () => void;
  hintText?: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  subtitle,
  actionLabel = 'Pehli Dawai Jodo',
  actionSubLabel = 'Add first medicine',
  onAction,
  hintText = 'Hospivo Retail Cloud • Dawai ki dukaan ka surakshit system',
  icon,
}) => {
  return (
    <div className="w-full flex-1 flex items-center justify-center p-6 min-h-0 select-none">
      <div className="w-full max-w-[680px] bg-white dark:bg-gray-900 rounded-[24px] shadow-[0_8px_32px_rgba(20,30,26,0.06)] p-10 flex flex-col items-center text-center relative overflow-hidden border border-slate-200/80 dark:border-gray-800">
        
        {/* Subtle Decorative Aura */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#006b33]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Vector Illustration (Pharmacy Shelf from 46b) */}
        <div className="relative w-72 h-52 flex items-center justify-center mb-6">
          {icon ? (
            icon
          ) : (
            <svg className="w-full h-full" fill="none" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
              {/* Back Wall Drop */}
              <rect fill="#F1FCF6" height="180" rx="16" width="272" x="24" y="20" />
              {/* Outer Shelf Frame */}
              <path d="M40 24V196" stroke="#BDCABC" strokeLinecap="round" strokeWidth="6" />
              <path d="M280 24V196" stroke="#BDCABC" strokeLinecap="round" strokeWidth="6" />
              {/* Top Shelf Rack */}
              <path d="M34 68H286" stroke="#8EF9A7" strokeLinecap="round" strokeWidth="8" />
              <path d="M40 76H280" stroke="#006B33" strokeOpacity="0.15" strokeWidth="3" />
              {/* Middle Shelf Rack */}
              <path d="M34 128H286" stroke="#8EF9A7" strokeLinecap="round" strokeWidth="8" />
              <path d="M40 136H280" stroke="#006B33" strokeOpacity="0.15" strokeWidth="3" />
              {/* Bottom Shelf Rack */}
              <path d="M34 186H286" stroke="#8EF9A7" strokeLinecap="round" strokeWidth="8" />
              <path d="M40 194H280" stroke="#006B33" strokeOpacity="0.15" strokeWidth="3" />
              {/* Shelf Screws */}
              <circle cx="50" cy="68" fill="#006B33" r="3" />
              <circle cx="270" cy="68" fill="#006B33" r="3" />
              <circle cx="50" cy="128" fill="#006B33" r="3" />
              <circle cx="270" cy="128" fill="#006B33" r="3" />
              <circle cx="50" cy="186" fill="#006B33" r="3" />
              <circle cx="270" cy="186" fill="#006B33" r="3" />
              {/* Sparkle Clean Accents */}
              <path d="M120 46L124 54L132 58L124 62L120 70L116 62L108 58L116 54Z" fill="#006B33" fillOpacity="0.25" />
              <circle cx="220" cy="50" fill="#088643" fillOpacity="0.4" r="3" />
              <circle cx="95" cy="108" fill="#088643" fillOpacity="0.3" r="2.5" />
              <path d="M195 102L198 108L204 111L198 114L195 120L192 114L186 111L192 108Z" fill="#006B33" fillOpacity="0.3" />
              <path d="M150 156L153 162L159 165L153 168L150 174L147 168L141 165L147 162Z" fill="#088643" fillOpacity="0.2" />
              {/* Ghostly Dotted Slot Indicators */}
              <rect fill="none" height="34" opacity="0.6" rx="6" stroke="#BDCABC" strokeDasharray="4 4" strokeWidth="2" width="38" x="74" y="86" />
              <rect fill="none" height="40" opacity="0.6" rx="6" stroke="#BDCABC" strokeDasharray="4 4" strokeWidth="2" width="44" x="138" y="80" />
              <rect fill="none" height="36" opacity="0.6" rx="6" stroke="#BDCABC" strokeDasharray="4 4" strokeWidth="2" width="36" x="208" y="84" />
              <path d="M93 103V97M90 100H96" opacity="0.5" stroke="#006B33" strokeLinecap="round" strokeWidth="2" />
              <path d="M160 100V94M157 97H163" opacity="0.5" stroke="#006B33" strokeLinecap="round" strokeWidth="2" />
              <path d="M226 102V96M223 99H229" opacity="0.5" stroke="#006B33" strokeLinecap="round" strokeWidth="2" />
            </svg>
          )}
        </div>

        {/* Heading Block */}
        <h2 className="text-2xl md:text-3xl text-[#141e1a] dark:text-white mb-2 font-bold tracking-tight max-w-md">
          {title}
        </h2>
        <p className="text-base md:text-lg text-[#3e4a3f] dark:text-gray-400 mb-8 max-w-sm leading-relaxed">
          {subtitle}
        </p>

        {/* Primary Action Button (>= 56px, 16px radius, #1B8F4A) */}
        {onAction && actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="group w-full max-w-[420px] h-[64px] rounded-[16px] bg-[#1B8F4A] hover:bg-[#15733b] active:scale-[0.98] transition-all duration-150 shadow-[0_4px_16px_rgba(27,143,74,0.3)] flex items-center justify-center gap-4 px-6 cursor-pointer text-white"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:bg-white/30 transition-colors">
              <svg className="w-6 h-6 text-white stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div className="flex flex-col items-start justify-center">
              <span className="text-xl font-bold text-white leading-tight">{actionLabel}</span>
              {actionSubLabel && (
                <span className="text-xs font-medium text-[#D8F3E2] leading-tight mt-0.5">{actionSubLabel}</span>
              )}
            </div>
          </button>
        )}

        {/* Reassuring Hint Bar */}
        {hintText && (
          <div className="mt-6 flex items-center gap-2 text-[#3e4a3f] dark:text-gray-400 text-sm font-medium">
            <svg className="w-5 h-5 text-[#006b33] shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <span>{hintText}</span>
          </div>
        )}

      </div>
    </div>
  );
};

export default EmptyState;
