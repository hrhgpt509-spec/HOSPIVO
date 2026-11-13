import React, { useState } from 'react';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';

interface ScheduleHModalProps {
  isOpen: boolean;
  medicineName: string;
  onConfirm: (patientName: string, doctorName: string, rxVerified: boolean) => void;
  onCancel: () => void;
}

export const ScheduleHModal: React.FC<ScheduleHModalProps> = ({
  isOpen,
  medicineName,
  onConfirm,
  onCancel,
}) => {
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [rxVerified, setRxVerified] = useState<boolean | null>(true);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!patientName.trim()) {
      setError(t('fast_bill.schedule_h.patient_name') + ' zaroori hai');
      return;
    }
    if (!doctorName.trim()) {
      setError(t('fast_bill.schedule_h.doctor_name') + ' zaroori hai');
      return;
    }
    if (rxVerified !== true) {
      setError('Prescription dekhna zaroori hai');
      return;
    }
    onConfirm(patientName.trim(), doctorName.trim(), true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-space-md">
      <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl shadow-xl overflow-hidden border border-outline-variant/40 flex flex-col animate-in fade-in zoom-in-95">
        {/* Banner */}
        <div className="px-space-lg py-space-md bg-[#FFE0B2] text-[#C25700] flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-space-sm">
            <Icon name="warning" className="text-[28px]" />
            <div className="flex flex-col">
              <span className="font-headline-md text-lg md:text-xl font-bold leading-tight">
                {t('fast_bill.schedule_h.banner_title')}
              </span>
              <span className="font-label-sub-english text-xs font-medium opacity-90">
                {t('fast_bill.schedule_h.banner_sub')}
              </span>
            </div>
          </div>
          <span className="font-label-sub-english text-xs font-bold px-2.5 py-1 rounded-full bg-[#C25700] text-white">
            {t('fast_bill.schedule_h.mandatory_badge')}
          </span>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-space-lg flex flex-col gap-space-md">
          <div className="text-sm font-bold text-on-surface">
            {medicineName}
          </div>

          {error && (
            <div className="p-space-sm rounded-lg bg-error-container text-on-error-container text-sm font-bold flex items-center gap-2">
              <Icon name="error" className="text-[18px]" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div className="flex flex-col gap-1">
              <label
                className="font-body-lg text-sm font-bold text-on-surface flex items-center justify-between"
                htmlFor="h-patient-name"
              >
                <span>{t('fast_bill.schedule_h.patient_name')}</span>
                <span className="font-label-sub-english text-xs text-on-surface-variant">
                  {t('fast_bill.schedule_h.patient_name_sub')}
                </span>
              </label>
              <input
                id="h-patient-name"
                type="text"
                autoFocus
                value={patientName}
                onChange={(e) => {
                  setPatientName(e.target.value);
                  setError('');
                }}
                placeholder="e.g. Ramesh Kumar"
                className="w-full h-12 px-3 rounded-xl bg-surface-container-lowest border-2 border-outline-variant font-body-md text-base text-on-surface outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                className="font-body-lg text-sm font-bold text-on-surface flex items-center justify-between"
                htmlFor="h-doctor-name"
              >
                <span>{t('fast_bill.schedule_h.doctor_name')}</span>
                <span className="font-label-sub-english text-xs text-on-surface-variant">
                  {t('fast_bill.schedule_h.doctor_name_sub')}
                </span>
              </label>
              <input
                id="h-doctor-name"
                type="text"
                value={doctorName}
                onChange={(e) => {
                  setDoctorName(e.target.value);
                  setError('');
                }}
                placeholder="e.g. Dr. S. K. Gupta"
                className="w-full h-12 px-3 rounded-xl bg-surface-container-lowest border-2 border-outline-variant font-body-md text-base text-on-surface outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Prescription dekhi? */}
          <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t border-outline-variant/30 gap-space-sm">
            <div className="flex flex-col">
              <span className="font-headline-md text-base font-bold text-on-surface leading-tight">
                {t('fast_bill.schedule_h.rx_seen')}
              </span>
              <span className="font-label-sub-english text-xs text-on-surface-variant font-medium">
                {t('fast_bill.schedule_h.rx_seen_sub')}
              </span>
            </div>

            <div className="flex items-center gap-space-sm">
              <button
                type="button"
                onClick={() => setRxVerified(true)}
                className={`h-12 min-w-[100px] px-4 rounded-xl font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  rxVerified === true
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-highest text-on-surface-variant'
                }`}
              >
                <Icon name="check_circle" className="text-[20px]" />
                <span>{t('fast_bill.schedule_h.yes')}</span>
              </button>

              <button
                type="button"
                onClick={() => setRxVerified(false)}
                className={`h-12 min-w-[100px] px-4 rounded-xl font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  rxVerified === false
                    ? 'bg-error text-on-error'
                    : 'bg-surface-container-highest text-on-surface-variant'
                }`}
              >
                <Icon name="cancel" className="text-[20px]" />
                <span>{t('fast_bill.schedule_h.no')}</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-space-md pt-space-xs">
            <button
              type="button"
              onClick={onCancel}
              className="h-14 px-space-lg rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-14 flex-1 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-base flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Icon name="arrow_forward" className="text-[24px]" />
              <span>
                {t('fast_bill.schedule_h.next')} (Press ENTER ↵)
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

