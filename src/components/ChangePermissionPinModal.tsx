import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { NumericLimitWarning } from './NumericLimitWarning';
import { useTranslation, tButton } from '../i18n';
import { useLimitWarning } from '../logic/format';
import { rotateApprovalPinWithValidation } from '../logic/approvals';
import { getPinLengthSetting } from '../logic/pin';
import { triggerFeedback } from '../logic/feedback';
import { useBackHandler } from '../logic/androidBack';

interface ChangePermissionPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ChangePermissionPinModal: React.FC<ChangePermissionPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [pinLength, setPinLength] = useState<number>(4);
  const [newPin, setNewPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const pinLimit = useLimitWarning();

  useBackHandler(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setNewPin('');
    setErrorMsg('');
    setIsSaving(false);
    pinLimit.clear();
    getPinLengthSetting()
      .then((len) => setPinLength(len))
      .catch(() => setPinLength(4));
  }, [isOpen, pinLimit]);

  if (!isOpen) return null;

  const btnCancel = tButton('common.btn_cancel');
  const btnSave = tButton('owner_staff.btn_save');

  const handlePinChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setErrorMsg('');
    if (digits.length > pinLength) {
      pinLimit.trigger();
      setNewPin(digits.slice(0, pinLength));
    } else {
      setNewPin(digits);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');

    try {
      const res = await rotateApprovalPinWithValidation(newPin);
      if (!res.ok) {
        if (res.error === 'approval_pin_same_as_current') {
          setErrorMsg(t('notifications.err_perm_pin_same_current'));
        } else if (res.error === 'approval_pin_same_as_owner_or_staff') {
          setErrorMsg(t('setup.step7_err_same_as_owner_or_staff'));
        } else {
          setErrorMsg(t('setup.step7_err_length', { len: pinLength }));
        }
        return;
      }

      triggerFeedback('success', t('notifications.toast_perm_pin_changed'));
      onSuccess?.();
      onClose();
    } catch {
      setErrorMsg(t('common.error_occurred'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-surface-container-lowest dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0">
              <Icon name="lock_reset" className="text-[24px]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-headline-md text-lg font-extrabold text-on-surface">
                {t('notifications.modal_change_perm_pin_title')}
              </h3>
              <p className="text-xs text-on-surface-variant break-words">
                {t('notifications.modal_change_perm_pin_sub', { len: pinLength })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={btnCancel.main}
            className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center cursor-pointer shrink-0"
          >
            <Icon name="close" className="text-[20px] text-on-surface" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <NumericLimitWarning value={newPin} maxLength={pinLength} exceeded={pinLimit.exceeded} />
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            value={newPin}
            onChange={(e) => handlePinChange(e.target.value)}
            placeholder={'•'.repeat(pinLength)}
            aria-label={t('notifications.modal_change_perm_pin_title')}
            className="w-full h-14 px-4 rounded-xl bg-surface-container-low border-2 border-primary/50 focus:border-primary text-center text-3xl font-extrabold tracking-[0.5em] text-on-surface outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-error-container text-error text-xs font-bold flex items-center gap-2"
          >
            <Icon name="error" className="text-[18px] shrink-0" />
            <span className="break-words">{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-sm cursor-pointer"
          >
            {btnCancel.main}
          </button>
          <button
            type="submit"
            disabled={isSaving || newPin.length !== pinLength}
            className="flex-1 min-h-[48px] px-4 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <Icon name="check" className="text-[20px]" />
            <span>{btnSave.main}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
