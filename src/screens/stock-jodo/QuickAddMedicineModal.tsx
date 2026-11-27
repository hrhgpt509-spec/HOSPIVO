import React, { useEffect, useState } from 'react';
import type { Medicine, ScheduleType } from '../../db';
import { Icon } from '../../components/Icon';
import { NumericLimitWarning } from '../../components/NumericLimitWarning';
import { useTranslation, tButton } from '../../i18n';
import { formatField, numericInputProps, textFieldProps, useLimitWarning } from '../../logic/format';
import { quickCreateMedicineInCatalog } from '../../logic/medicineForm';
import { triggerFeedback } from '../../logic/feedback';
import { useBackHandler } from '../../logic/androidBack';

interface QuickAddMedicineModalProps {
  isOpen: boolean;
  initialQuery: string;
  currentUserName?: string;
  onClose: () => void;
  onCreated: (medicine: Medicine) => void;
}

const PACK_TYPES: Array<{ form: string; defaultUnits: string; label: string }> = [
  { form: 'Tablet', defaultUnits: '10', label: 'Strip (10)' },
  { form: 'Capsule', defaultUnits: '10', label: 'Capsule (10)' },
  { form: 'Syrup', defaultUnits: '1', label: 'Bottle (1)' },
  { form: 'Injection', defaultUnits: '1', label: 'Vial (1)' },
  { form: 'Cream', defaultUnits: '1', label: 'Tube (1)' },
  { form: 'Box', defaultUnits: '1', label: 'Box (1)' },
];

export const QuickAddMedicineModal: React.FC<QuickAddMedicineModalProps> = ({
  isOpen,
  initialQuery,
  currentUserName = 'owner',
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [salt, setSalt] = useState('');
  const [company, setCompany] = useState('');
  const [form, setForm] = useState('Tablet');
  const [unitsPerPack, setUnitsPerPack] = useState('10');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('none');
  const [barcode, setBarcode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const nameLimit = useLimitWarning();
  const unitsLimit = useLimitWarning();
  const barcodeLimit = useLimitWarning();

  useBackHandler(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = initialQuery.trim();
    const looksLikeBarcode = /^[0-9]{6,32}$/.test(trimmed);
    setName(looksLikeBarcode ? '' : formatField('name', trimmed).slice(0, 80));
    setBarcode(looksLikeBarcode ? trimmed.slice(0, 32) : '');
    setSalt('');
    setCompany('');
    setForm('Tablet');
    setUnitsPerPack('10');
    setScheduleType('none');
    setErrorMsg('');
    setIsSaving(false);
  }, [isOpen, initialQuery]);

  if (!isOpen) return null;

  const btnCancel = tButton('common.btn_cancel');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg(t('medicine_form.err_name_required'));
      return;
    }
    const parsedUnits = parseInt(unitsPerPack, 10);
    if (!parsedUnits || parsedUnits < 1) {
      setErrorMsg(t('medicine_form.err_units_invalid'));
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      const created = await quickCreateMedicineInCatalog(
        {
          name: name.trim(),
          salt: salt.trim(),
          company: company.trim(),
          form,
          unitsPerPack: parsedUnits,
          scheduleType,
          barcode: barcode.trim() || undefined,
        },
        currentUserName
      );
      triggerFeedback('success', t('stock_jodo.quick_add_title'));
      onCreated(created);
    } catch (err: any) {
      setErrorMsg(err?.message || t('common.error_occurred'));
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
        onSubmit={handleSave}
        className="w-full max-w-lg bg-surface-container-lowest dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-3.5 max-h-[92dvh] overflow-y-auto border-t sm:border border-outline-variant/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-headline-md text-lg sm:text-xl font-extrabold text-on-surface">
              {t('stock_jodo.quick_add_title')}
            </h3>
            <p className="text-xs text-on-surface-variant">{t('stock_jodo.quick_add_sub')}</p>
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

        {/* Medicine Name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-on-surface-variant">
            {t('medicine_form.label_name')} *
          </label>
          <NumericLimitWarning value={name} maxLength={80} exceeded={nameLimit.exceeded} kind="chars" />
          <input
            type="text"
            autoFocus
            {...textFieldProps('name', name, setName, {
              maxLength: 80,
              onLimitExceeded: nameLimit.trigger,
            })}
            placeholder={t('medicine_form.placeholder_name')}
            className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        {/* Salt & Company */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant">
              {t('medicine_form.label_salt')}
            </label>
            <input
              type="text"
              {...textFieldProps('name', salt, setSalt, { maxLength: 80 })}
              placeholder={t('medicine_form.placeholder_salt')}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant">
              {t('medicine_form.label_company')}
            </label>
            <input
              type="text"
              {...textFieldProps('name', company, setCompany, { maxLength: 60 })}
              placeholder={t('medicine_form.placeholder_company')}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* Pack Type Quick Pills & Units per Pack */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-on-surface-variant">
            {t('stock_jodo.quick_add_pack_type')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PACK_TYPES.map((p) => {
              const active = form === p.form;
              return (
                <button
                  key={p.form}
                  type="button"
                  onClick={() => {
                    setForm(p.form);
                    setUnitsPerPack(p.defaultUnits);
                  }}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-low text-on-surface border-outline-variant/50 hover:bg-surface-container'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant">
              {t('stock_jodo.quick_add_units_per_pack')}
            </label>
            <NumericLimitWarning value={unitsPerPack} maxLength={4} exceeded={unitsLimit.exceeded} />
            <input
              type="text"
              {...numericInputProps('integer')}
              value={unitsPerPack}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                if (digits.length > 4) {
                  unitsLimit.trigger();
                  setUnitsPerPack(digits.slice(0, 4));
                } else {
                  setUnitsPerPack(digits);
                }
              }}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-on-surface-variant">
              {t('medicine_form.label_barcode')}
            </label>
            <NumericLimitWarning value={barcode} maxLength={32} exceeded={barcodeLimit.exceeded} kind="chars" />
            <input
              type="text"
              {...textFieldProps('code', barcode, setBarcode, {
                maxLength: 32,
                onLimitExceeded: barcodeLimit.trigger,
              })}
              placeholder={t('medicine_form.placeholder_barcode')}
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-mono text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* Schedule Toggle */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-on-surface-variant">
            {t('stock_jodo.quick_add_schedule')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'none', label: t('stock_jodo.quick_add_schedule_normal') },
                { id: 'H', label: t('stock_jodo.quick_add_schedule_h') },
                { id: 'H1', label: t('stock_jodo.quick_add_schedule_h1') },
              ] as Array<{ id: ScheduleType; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScheduleType(opt.id)}
                className={`min-h-[42px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  scheduleType === opt.id
                    ? opt.id === 'none'
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-amber-600 text-white border-amber-600'
                    : 'bg-surface-container-low text-on-surface border-outline-variant/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-error-container text-error text-xs font-bold">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[50px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-sm cursor-pointer"
          >
            {btnCancel.main}
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 min-h-[50px] px-4 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <Icon name="add_circle" className="text-[20px]" />
            <span>{t('stock_jodo.quick_add_save')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
