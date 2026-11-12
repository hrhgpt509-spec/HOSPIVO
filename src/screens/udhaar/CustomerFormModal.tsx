import React, { useState, useEffect } from 'react';
import type { DBUser } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { textFieldProps } from '../../logic/format';
import { rupeesToPaise } from '../../logic/money';
import { isOwner } from '../../logic/roles';
import { triggerFeedback } from '../../logic/feedback';
import { saveCustomerProfile } from '../../logic/udhaar';

interface CustomerFormModalProps {
  isOpen: boolean;
  initialCustomer?: {
    id?: number;
    name: string;
    phone: string;
    address: string;
    creditLimitPaise?: number;
  } | null;
  limitEditableUnlocked?: boolean;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  onClose: () => void;
  onSaved: (customerId: number) => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  initialCustomer,
  limitEditableUnlocked = false,
  currentUser,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [creditLimitStr, setCreditLimitStr] = useState<string>('0');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const canEditLimit = isOwner(currentUser) || limitEditableUnlocked;

  useEffect(() => {
    if (!isOpen) return;
    setName(initialCustomer?.name || '');
    setPhone(initialCustomer?.phone || '');
    setAddress(initialCustomer?.address || '');
    setCreditLimitStr(
      initialCustomer?.creditLimitPaise && initialCustomer.creditLimitPaise > 0
        ? String(Math.round(initialCustomer.creditLimitPaise / 100))
        : '0'
    );
    setErrorMsg('');
    setIsSaving(false);
  }, [isOpen, initialCustomer]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      setErrorMsg('');
      const actor = currentUser?.name || currentUser?.role || 'User';
      const limitRupees = Math.max(0, Math.floor(Number(creditLimitStr) || 0));
      const limitPaise = canEditLimit
        ? rupeesToPaise(limitRupees)
        : initialCustomer?.creditLimitPaise || 0;

      const saved = await saveCustomerProfile({
        id: initialCustomer?.id,
        name,
        phone,
        address,
        creditLimitPaise: limitPaise,
        actorName: String(actor),
      });
      triggerFeedback('success', t('customers.toast_customer_saved'));
      onSaved(saved.id || 0);
    } catch (err: any) {
      const msg = err?.message || t('errors.generic_error');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const backBtn = tButton('suppliers.btn_back');
  const saveBtn = tButton('customers.btn_save_customer');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center">
              <Icon name="person_add" className="text-2xl" />
            </div>
            <h2 className="font-headline-md text-xl font-bold text-on-surface">
              {initialCustomer?.id
                ? t('customers.page_title')
                : tButton('customers.btn_new_customer').main}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer"
          >
            <Icon name="close" className="text-2xl" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('customers.name_label')} <span className="text-error">*</span>
            </label>
            <input
              {...textFieldProps('name', name, setName)}
              type="text"
              placeholder={t('customers.name_placeholder')}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('customers.phone_label')} <span className="text-error">*</span>
            </label>
            <input
              {...textFieldProps('phone', phone, setPhone)}
              type="text"
              placeholder={t('customers.phone_placeholder')}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('customers.address_label')}
            </label>
            <input
              {...textFieldProps('free', address, setAddress)}
              type="text"
              placeholder={t('customers.address_placeholder')}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {canEditLimit && (
            <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/50">
              <label className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                <Icon name="account_balance_wallet" className="text-lg text-tertiary" />
                <span>{t('customers.credit_limit_input_label')}</span>
              </label>
              <input
                type="number"
                min={0}
                value={creditLimitStr}
                onChange={(e) => setCreditLimitStr(e.target.value.replace(/[^0-9]/g, ''))}
                className="h-14 px-4 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface font-headline-md font-extrabold focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-bold flex items-center gap-2">
              <Icon name="error" className="text-xl shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/40 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-14 min-h-[56px] px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold flex items-center gap-2 cursor-pointer"
          >
            <Icon name="arrow_back" className="text-xl" />
            <span>{backBtn.main}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="h-14 min-h-[56px] px-6 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <Icon name="check_circle" className="text-2xl" />
            <div className="flex flex-col text-left leading-none">
              <span className="font-title-hinglish font-bold">{saveBtn.main}</span>
              {saveBtn.sub && <span className="text-xs opacity-90 pt-0.5">{saveBtn.sub}</span>}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

