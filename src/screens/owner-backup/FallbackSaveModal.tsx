import React, { useEffect } from 'react';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';

interface FallbackSaveModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const FallbackSaveModal: React.FC<FallbackSaveModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const btnSaved = tButton('owner_backup.btn_saved_file');
  const btnCancel = tButton('owner_backup.btn_cancel_save');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-[580px] max-w-full bg-surface-container-lowest rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col gap-5 border border-outline-variant/30">
        {/* Top Header */}
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 min-w-[64px] rounded-2xl bg-primary-container flex items-center justify-center shadow-sm">
            <Icon name="download_done" className="text-primary text-[36px]" />
          </div>
          <div className="flex flex-col pt-1">
            <h2 className="font-headline-lg text-headline-lg text-on-surface leading-tight font-extrabold">
              {t('owner_backup.modal_save_confirm_title')}
            </h2>
            <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium mt-0.5">
              {t('owner_backup.modal_save_confirm_sub')}
            </span>
          </div>
        </div>

        {/* Note Banner */}
        <div className="w-full bg-surface-container-low rounded-xl p-4 flex items-center gap-3 border border-outline-variant/20">
          <Icon name="info" className="text-primary text-[24px] shrink-0" />
          <p className="font-body-md text-on-surface font-medium leading-normal">
            {t('owner_backup.modal_save_confirm_note')}
          </p>
        </div>

        {/* Action Buttons: >= 56px (h-16 = 64px tall), big bold text */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-16 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:translate-y-0.5 transition-all flex flex-col items-center justify-center gap-0.5 px-6 text-on-surface font-bold cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Icon name="close" className="text-[24px] text-on-surface-variant" />
              <span className="font-title-hinglish text-lg">{btnCancel.main}</span>
            </div>
            {btnCancel.sub ? (
              <span className="font-label-sub-english text-xs text-on-surface-variant font-medium">
                {btnCancel.sub}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="h-16 rounded-2xl bg-primary hover:bg-primary-container active:translate-y-0.5 transition-all flex flex-col items-center justify-center gap-0.5 px-6 text-on-primary font-bold cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-2">
              <Icon name="check_circle" className="text-[24px]" />
              <span className="font-title-hinglish text-lg">{btnSaved.main}</span>
            </div>
            {btnSaved.sub ? (
              <span className="font-label-sub-english text-xs text-primary-fixed font-medium">
                {btnSaved.sub}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
};
