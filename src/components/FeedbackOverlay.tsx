import React, { useState, useEffect } from 'react';
import { subscribeFeedback, type FeedbackEvent } from '../logic/feedback';

export const FeedbackOverlay: React.FC = () => {
  const [currentEvent, setCurrentEvent] = useState<FeedbackEvent | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  useEffect(() => {
    return subscribeFeedback((event) => {
      if (event) {
        setCurrentEvent(event);
        setIsFlashing(true);

        // Flash lasts 350ms
        const flashTimer = setTimeout(() => {
          setIsFlashing(false);
        }, 350);

        // Toast disappears after 3 seconds
        const toastTimer = setTimeout(() => {
          setCurrentEvent((prev) => (prev?.timestamp === event.timestamp ? null : prev));
        }, 3000);

        return () => {
          clearTimeout(flashTimer);
          clearTimeout(toastTimer);
        };
      } else {
        setCurrentEvent(null);
        setIsFlashing(false);
      }
    });
  }, []);

  if (!currentEvent && !isFlashing) return null;

  const isSuccess = currentEvent?.type === 'success';
  const isInfo = currentEvent?.type === 'info';

  return (
    <>
      {/* Visual Flash: full viewport edge pulse & translucent tint */}
      {isFlashing && !isInfo && (
        <div
          aria-hidden="true"
          className={`fixed inset-0 pointer-events-none z-[100] transition-opacity duration-300 ${
            isSuccess ? 'bg-[#006b33]/15 ring-8 ring-[#006b33]' : 'bg-[#ba1a1a]/15 ring-8 ring-[#ba1a1a]'
          }`}
        />
      )}

      {/* Floating Toast Notification (46c_Shared_Feedback.html) */}
      {currentEvent && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+4.25rem)] left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-[100] pointer-events-auto flex items-center justify-center sm:justify-end animate-slideIn">
          {isSuccess ? (
            /* Success Toast: bg-primary-container text-on-primary-container */
            <div className="w-full sm:w-auto max-w-full flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-3.5 bg-[#088643] text-white rounded-2xl shadow-xl border border-white/20">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="text-base sm:text-lg font-bold text-white break-words">{currentEvent.title}</span>
                {currentEvent.subtitle && (
                  <span className="text-xs text-white/90 font-medium break-words mt-0.5">{currentEvent.subtitle}</span>
                )}
              </div>
            </div>
          ) : isInfo ? (
            /* Info/Neutral Toast: bg-slate-800 text-white rounded-2xl */
            <div className="w-full sm:w-auto max-w-full flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-3.5 bg-[#334155] text-white rounded-2xl shadow-xl border border-white/20">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="text-base sm:text-lg font-bold text-white break-words">{currentEvent.title}</span>
                {currentEvent.subtitle && (
                  <span className="text-xs text-slate-200 font-medium break-words mt-0.5">{currentEvent.subtitle}</span>
                )}
              </div>
            </div>
          ) : (
            /* Error Toast: bg-error text-on-error */
            <div className="w-full sm:w-auto max-w-full flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-3.5 bg-[#ba1a1a] text-white rounded-2xl shadow-xl border border-white/20">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="text-base sm:text-lg font-bold text-white break-words">{currentEvent.title}</span>
                {currentEvent.subtitle && (
                  <span className="text-xs text-red-100 font-medium break-words mt-0.5">{currentEvent.subtitle}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default FeedbackOverlay;
