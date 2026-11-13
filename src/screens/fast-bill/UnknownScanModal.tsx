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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-space-md">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden border border-outline-variant/40 flex flex-col animate-in fade-in zoom-in-95 max-h-[90vh]">
        {/* Red Banner */}
        <div className="w-full bg-error-container text-on-error-container px-space-lg py-space-md flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-space-md">
            <div className="w-10 h-10 rounded-full bg-error text-on-error flex items-center justify-center shrink-0">
              <Icon name="warning" className="text-[24px]" />
            </div>
            <span className="font-headline-md text-lg md:text-xl font-bold text-error">
              {t('fast_bill.unknown_scan.banner_title')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-error-container hover:opacity-75 p-1"
          >
            <Icon name="close" className="text-[24px]" />
          </button>
        </div>

        {/* Card Content Body */}
        <div className="p-space-lg flex flex-col gap-space-md overflow-y-auto flex-1">
          <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
            <span className="font-headline-lg text-lg font-bold text-on-surface">
              {t('fast_bill.unknown_scan.unmapped_title')}
            </span>
            <span className="font-label-sub-english text-xs bg-surface-container-high px-space-sm py-1 rounded-md text-on-surface-variant font-bold">
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
                  className="bg-surface-container-low rounded-xl p-space-md flex items-center justify-between shadow-xs border border-outline-variant/30 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-space-md">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0 text-on-surface">
                      <Icon name="barcode" className="text-[30px]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-title-hinglish text-base font-bold text-on-surface tracking-wider">
                        {scan.code}
                      </span>
                      <span className="font-label-sub-english text-xs text-outline flex items-center gap-1">
                        <Icon name="schedule" className="text-[14px]" />
                        <span>{scan.timeStr}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onDismissScan(scan.code)}
                      className="h-12 px-3 rounded-xl bg-surface-container-highest hover:bg-surface-variant text-on-surface-variant text-xs font-bold transition-all cursor-pointer"
                    >
                      Hatao
                    </button>
                    <button
                      type="button"
                      onClick={() => onFixScan(scan.code)}
                      className="h-12 min-w-[140px] bg-primary hover:bg-primary-container active:translate-y-0.5 text-on-primary px-space-md rounded-xl flex items-center justify-center gap-space-xs shadow-xs transition-all cursor-pointer"
                    >
                      <Icon name="build" className="text-[22px] text-on-primary" />
                      <div className="flex flex-col items-start leading-none">
                        <span className="font-title-hinglish text-sm font-bold text-on-primary">
                          {t('fast_bill.unknown_scan.fix_btn')}
                        </span>
                        <span className="font-label-sub-english text-[10px] text-primary-fixed-dim">
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
        <div className="p-space-md bg-surface-container-low/50 border-t border-outline-variant/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-space-lg rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold text-sm cursor-pointer"
          >
            {t('fast_bill.unknown_scan.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

