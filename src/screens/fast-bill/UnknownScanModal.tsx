import React from 'react';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';

export interface UnmappedScan {
  code: string;
  timeStr: string;
}

interface UnknownScanModalProps {
  isOpen: boolean;
  unmappedScans: UnmappedScan[];
  onFixScan: (code: string) => void;
  onDismissScan: (code: string) => void;
  onClose: () => void;
}

export const UnknownScanModal: React.FC<UnknownScanModalProps> = ({
  isOpen,
  unmappedScans,
  onFixScan,
  onDismissScan,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-space-md">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden border-t sm:border border-outline-variant/40 flex flex-col animate-in fade-in zoom-in-95 max-h-[92dvh] sm:max-h-[90dvh]">
        {/* Red Banner */}
        <div className="w-full bg-error-container text-on-error-container px-4 sm:px-space-lg py-3.5 sm:py-space-md flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-error text-on-error flex items-center justify-center shrink-0">
              <Icon name="warning" className="text-[24px]" />
            </div>
            <span className="font-headline-md text-base sm:text-xl font-bold text-error break-words">
              {t('fast_bill.unknown_scan.banner_title')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-error-container hover:opacity-75 p-1 shrink-0 cursor-pointer"
          >
            <Icon name="close" className="text-[24px]" />
          </button>
        </div>

        {/* Card Content Body */}
        <div className="p-4 sm:p-space-lg flex flex-col gap-space-md overflow-y-auto flex-1 min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-outline-variant/20">
            <span className="font-headline-lg text-base sm:text-lg font-bold text-on-surface">
              {t('fast_bill.unknown_scan.unmapped_title')}
            </span>
            <span className="font-label-sub-english text-xs bg-surface-container-high px-space-sm py-1 rounded-md text-on-surface-variant font-bold shrink-0">
              {t('fast_bill.unknown_scan.unmapped_count', { count: unmappedScans.length })}
            </span>
          </div>

          {unmappedScans.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant">
              Koi unmapped scan nahi hai
            </div>
          ) : (
            <div className="flex flex-col gap-space-sm">
              {unmappedScans.map((scan) => (
                <div
                  key={scan.code}
                  className="bg-surface-container-low rounded-xl p-3.5 sm:p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs border border-outline-variant/30 hover:shadow-sm transition-shadow min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0 text-on-surface">
                      <Icon name="barcode" className="text-[28px] sm:text-[30px]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-title-hinglish text-base font-bold text-on-surface tracking-wider break-all">
                        {scan.code}
                      </span>
                      <span className="font-label-sub-english text-xs text-outline flex items-center gap-1">
                        <Icon name="schedule" className="text-[14px] shrink-0" />
                        <span>{scan.timeStr}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => onDismissScan(scan.code)}
                      className="min-h-[48px] py-2 px-3 rounded-xl bg-surface-container-highest hover:bg-surface-variant text-on-surface-variant text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      Hatao
                    </button>
                    <button
                      type="button"
                      onClick={() => onFixScan(scan.code)}
                      className="flex-1 sm:flex-initial min-h-[48px] py-2 sm:min-w-[140px] bg-primary hover:bg-primary-container active:translate-y-0.5 text-on-primary px-3.5 sm:px-space-md rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer min-w-0"
                    >
                      <Icon name="build" className="text-[20px] sm:text-[22px] text-on-primary shrink-0" />
                      <div className="flex flex-col items-start leading-tight min-w-0">
                        <span className="font-title-hinglish text-sm font-bold text-on-primary truncate max-w-full">
                          {t('fast_bill.unknown_scan.fix_btn')}
                        </span>
                        <span className="font-label-sub-english text-[10px] text-primary-fixed-dim truncate max-w-full">
                          {t('fast_bill.unknown_scan.fix_sub')}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-space-md pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-container-low/50 border-t border-outline-variant/30 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[48px] py-2.5 px-space-lg rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold text-sm cursor-pointer"
          >
            {t('fast_bill.unknown_scan.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

