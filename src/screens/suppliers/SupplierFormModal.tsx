import React, { useState, useEffect } from 'react';
import { type Supplier } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { textFieldProps } from '../../logic/format';
import { saveSupplier } from '../../logic/suppliers';
import { triggerFeedback } from '../../logic/feedback';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (supplierId: number) => void;
  initialSupplier?: Supplier | null;
  currentUser?: { name?: string; role?: string } | null;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialSupplier,
  currentUser,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [gstNo, setGstNo] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (initialSupplier) {
      setName(initialSupplier.name || '');
      setPhone(initialSupplier.phone || '');
      setGstNo(initialSupplier.gstNo || '');
      setAddress(initialSupplier.address || '');
    } else {
      setName('');
      setPhone('');
      setGstNo('');
      setAddress('');
    }
    setError('');
  }, [initialSupplier, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(initialSupplier?.id);
  const title = isEditing ? t('suppliers.modal_edit_title') : t('suppliers.modal_new_title');
  const subtitle = isEditing ? t('suppliers.modal_edit_sub') : t('suppliers.modal_new_sub');
  const saveBtn = tButton('suppliers.btn_save_supplier');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('suppliers.err_name_required'));
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const who = currentUser?.name || 'User';
      const savedId = await saveSupplier(
        {
          id: initialSupplier?.id,
          name,
          phone,
          gstNo,
          address,
        },
        who
      );

      triggerFeedback('success', t('suppliers.toast_supplier_saved'));
      onSaved(savedId);
      onClose();
    } catch (err: any) {
      console.error('Failed to save supplier:', err);
      setError(err?.message || 'Failed to save supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
      <div className="w-full max-w-xl bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <Icon name="local_shipping" className="text-[28px]" />
            </div>
            <div className="flex flex-col">
              <h2 className="font-headline-md text-headline-md text-on-surface leading-tight">
                {title}
              </h2>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                {subtitle}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high cursor-pointer transition-colors"
          >
            <Icon name="close" className="text-[24px]" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-semibold flex items-center gap-2">
              <Icon name="error" className="text-[20px]" />
              <span>{error}</span>
            </div>
          )}

          {/* Supplier Name */}
          <div className="flex flex-col gap-1.5">
            <label className="font-body-md text-body-md font-bold text-on-surface">
              {t('suppliers.label_name')} <span className="text-error">*</span>
            </label>
            <input
              {...textFieldProps('name', name, setName)}
              placeholder={t('suppliers.placeholder_name')}
              className="h-14 px-4 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface text-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              autoFocus
            />
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1.5">
            <label className="font-body-md text-body-md font-bold text-on-surface">
              {t('suppliers.label_phone_input')}
            </label>
            <input
              {...textFieldProps('phone', phone, setPhone)}
              placeholder={t('suppliers.placeholder_phone')}
              className="h-14 px-4 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface text-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          {/* GSTIN */}
          <div className="flex flex-col gap-1.5">
            <label className="font-body-md text-body-md font-bold text-on-surface">
              {t('suppliers.label_gst_input')}
            </label>
            <input
              {...textFieldProps('code', gstNo, setGstNo)}
              placeholder={t('suppliers.placeholder_gst')}
              className="h-14 px-4 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface text-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          {/* Address */}
          <div className="flex flex-col gap-1.5">
            <label className="font-body-md text-body-md font-bold text-on-surface">
              {t('suppliers.label_address')}
            </label>
            <textarea
              {...textFieldProps('free', address, setAddress)}
              placeholder={t('suppliers.placeholder_address')}
              rows={2}
              className="p-3 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-14 px-6 rounded-xl border border-outline-variant text-on-surface font-bold text-lg hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              {tButton('suppliers.btn_back').main}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-14 min-w-[160px] px-8 rounded-xl bg-primary text-on-primary font-bold text-lg shadow-md hover:bg-primary-container active:scale-[0.99] transition-all cursor-pointer flex flex-col items-center justify-center leading-tight"
            >
              <span>{saveBtn.main}</span>
              {saveBtn.sub && (
                <span className="text-xs text-primary-fixed opacity-90 font-normal">
                  {saveBtn.sub}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

