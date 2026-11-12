import React, { useState, useEffect } from 'react';
import type { DBUser, Medicine, RegularReminder } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { triggerFeedback } from '../../logic/feedback';
import { parseDateOnly } from '../../logic/stock';
import { computeNextDueDate, saveRegularReminder } from '../../logic/udhaar';

interface RegularReminderModalProps {
  isOpen: boolean;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  medicines: Medicine[];
  initialReminder?: RegularReminder | null;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

export const RegularReminderModal: React.FC<RegularReminderModalProps> = ({
  isOpen,
  customerId,
  customerName,
  customerPhone,
  medicines,
  initialReminder,
  currentUser,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();

  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [packDaysStr, setPackDaysStr] = useState<string>('30');
  const [lastDate, setLastDate] = useState<string>(parseDateOnly());
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialReminder) {
      setSelectedMedId(String(initialReminder.medicineId));
      setPackDaysStr(String(initialReminder.packDays));
      setLastDate(initialReminder.lastDispensedDate || parseDateOnly());
    } else {
      setSelectedMedId('');
      setPackDaysStr('30');
      setLastDate(parseDateOnly());
    }
    setErrorMsg('');
    setIsSaving(false);
  }, [isOpen, initialReminder]);

  if (!isOpen) return null;

  const packDaysNum = Math.max(1, Math.floor(Number(packDaysStr) || 30));
  const computedNextDue = computeNextDueDate(lastDate, packDaysNum);

  const handleSave = async () => {
    if (isSaving) return;
    const medId = Number(selectedMedId);
    const med = medicines.find((m) => m.id === medId);
    if (!med || med.id === undefined) {
      setErrorMsg(t('customers.select_medicine_placeholder'));
      triggerFeedback('error', t('customers.select_medicine_placeholder'));
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg('');
      const actor = currentUser?.name || currentUser?.role || 'User';
      await saveRegularReminder({
        id: initialReminder?.id,
        customerId,
        customerName,
        customerPhone,
        medicineId: med.id,
        medicineName: med.strength ? `${med.name} ${med.strength}` : med.name,
        packDays: packDaysNum,
        lastDispensedDate: lastDate,
        active: true,
        actorName: String(actor),
      });
      triggerFeedback('success', t('customers.toast_reminder_saved'));
      onSaved();
    } catch (err: any) {
      const msg = err?.message || t('errors.generic_error');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const backBtn = tButton('suppliers.btn_back');
  const saveBtn = tButton('customers.btn_save_reminder');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
              <Icon name="notifications_active" className="text-2xl" />
            </div>
            <div className="min-w-0">
              <h2 className="font-headline-md text-xl font-bold text-on-surface truncate">
                {t('customers.regular_title')}
              </h2>
              <p className="text-xs text-on-surface-variant truncate">{customerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer shrink-0"
          >
            <Icon name="close" className="text-2xl" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          {/* Medicine Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('customers.select_medicine_label')} <span className="text-error">*</span>
            </label>
            <select
              value={selectedMedId}
              onChange={(e) => {
                setSelectedMedId(e.target.value);
                setErrorMsg('');
              }}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t('customers.select_medicine_placeholder')}</option>
              {medicines.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name} {m.strength} ({m.company})
                </option>
              ))}
            </select>
          </div>

          {/* Days per Pack + Quick Presets */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-on-surface">
              {t('customers.pack_days_label')} <span className="text-error">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {[10, 15, 30, 45, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPackDaysStr(String(d))}
                  className={`h-11 px-4 rounded-xl font-bold text-sm cursor-pointer ${
                    packDaysNum === d
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={packDaysStr}
              onChange={(e) => setPackDaysStr(e.target.value.replace(/[^0-9]/g, ''))}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-headline-md font-extrabold focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Last Dispensed Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('customers.last_dispensed_label')}
            </label>
            <input
              type="date"
              value={lastDate}
              onChange={(e) => setLastDate(e.target.value)}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Computed Next Due Preview */}
          <div className="p-3.5 rounded-xl bg-primary-fixed/40 text-on-primary-fixed-variant font-bold flex items-center justify-between">
            <span>{t('customers.next_due_prefix')}</span>
            <span className="text-lg">{computedNextDue}</span>
          </div>

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

