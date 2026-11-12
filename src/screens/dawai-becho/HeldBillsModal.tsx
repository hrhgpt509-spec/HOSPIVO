import React from 'react';
import type { HeldBill } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import type { SerializedHeldCartItem } from './types';

interface HeldBillsModalProps {
  isOpen: boolean;
  heldBills: HeldBill[];
  onResume: (held: HeldBill) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

export const HeldBillsModal: React.FC<HeldBillsModalProps> = ({
  isOpen,
  heldBills,
  onResume,
  onDelete,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const btnResume = tButton('dawai_becho.held_btn_resume');
  const btnBack = tButton('suppliers.btn_back');

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/65 backdrop-blur-[4px] flex items-center justify-center p-space-md select-none">
      <div className="w-full max-w-[620px] max-h-[85vh] bg-surface-container-lowest rounded-[24px] shadow-2xl border border-outline-variant overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center shrink-0">
              <Icon name="pause_circle" className="text-[30px]" />
            </div>
            <div className="flex flex-col">
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface leading-tight">
                {t('dawai_becho.held_modal_title')}
              </h2>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                {t('dawai_becho.held_modal_sub')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={btnBack.main}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
          >
            <Icon name="close" className="text-[24px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
          {heldBills.length === 0 ? (
            <div className="py-10 text-center text-on-surface-variant font-body-md">
              {t('dawai_becho.held_empty')}
            </div>
          ) : (
            heldBills.map((hb) => {
              let itemCount = 0;
              try {
                const parsed: SerializedHeldCartItem[] = JSON.parse(hb.itemsJson);
                itemCount = parsed.length;
              } catch {
                itemCount = 0;
              }

              const timeLabel = hb.heldAt
                ? new Date(hb.heldAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <div
                  key={hb.id}
                  className="min-h-[76px] p-4 rounded-2xl bg-surface-container-low border border-outline-variant/60 flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-title-hinglish text-title-hinglish font-bold text-on-surface truncate">
                      {hb.customerName || hb.label || t('dawai_becho.held_default_label')}
                    </span>
                    <span className="font-label-sub-english text-sm text-on-surface-variant">
                      {t('dawai_becho.items_count', { count: itemCount })}
                      {hb.heldBy ? ` · ${hb.heldBy}` : ''}
                      {timeLabel ? ` · ${timeLabel}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResume(hb)}
                      className="h-14 min-h-[56px] px-5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-95"
                    >
                      <Icon name="play_arrow" className="text-[24px]" />
                      <div className="flex flex-col text-left leading-tight">
                        <span className="text-base font-bold">{btnResume.main}</span>
                        {btnResume.sub && (
                          <span className="text-xs text-primary-fixed leading-none">
                            {btnResume.sub}
                          </span>
                        )}
                      </div>
                    </button>

                    {hb.id !== undefined && (
                      <button
                        type="button"
                        onClick={() => onDelete(hb.id!)}
                        aria-label={t('dawai_becho.held_btn_delete_aria')}
                        className="w-14 h-14 min-h-[56px] rounded-xl bg-error-container text-on-error-container hover:brightness-95 flex items-center justify-center cursor-pointer transition-all active:scale-95"
                      >
                        <Icon name="delete" className="text-[24px]" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-14 min-h-[56px] px-6 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold flex items-center gap-2 border border-outline-variant cursor-pointer"
          >
            <Icon name="arrow_back" className="text-[22px]" />
            <span>{btnBack.main}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

