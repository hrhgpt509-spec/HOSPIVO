import React, { useState, useEffect } from 'react';
import type { Medicine } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { textFieldProps } from '../../logic/format';
import { triggerFeedback } from '../../logic/feedback';

interface ScheduleHModalProps {
  isOpen: boolean;
  medicine: Medicine | null;
  initialPatientName?: string;
  initialDoctorName?: string;
  onConfirm: (data: {
    patientName: string;
    doctorName: string;
    prescriptionChecked: boolean;
  }) => void;
  onCancel: () => void;
}

export const ScheduleHModal: React.FC<ScheduleHModalProps> = ({
  isOpen,
  medicine,
  initialPatientName = '',
  initialDoctorName = '',
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [patientName, setPatientName] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [prescriptionChoice, setPrescriptionChoice] = useState<'yes' | 'no' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setPatientName(initialPatientName);
      setDoctorName(initialDoctorName);
      setPrescriptionChoice(null);
      setErrorMsg('');
    }
  }, [isOpen, medicine?.id, initialPatientName, initialDoctorName]);

  if (!isOpen || !medicine) return null;

  const btnYes = tButton('dawai_becho.sch_btn_yes');
  const btnNo = tButton('dawai_becho.sch_btn_no');
  const btnBack = tButton('suppliers.btn_back');
  const btnAdd = tButton('dawai_becho.sch_btn_add');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      const msg = t('dawai_becho.sch_err_patient');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
      return;
    }
    if (!doctorName.trim()) {
      const msg = t('dawai_becho.sch_err_doctor');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
      return;
    }
    if (prescriptionChoice !== 'yes') {
      const msg = t('dawai_becho.sch_err_rx_required');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
      return;
    }

    onConfirm({
      patientName: patientName.trim(),
      doctorName: doctorName.trim(),
      prescriptionChecked: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-gutter select-none">
      <div className="w-full max-w-[580px] bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden flex flex-col border border-outline-variant/40">
        {/* Top Orange Header Banner (Matching 13_Sell_ScheduleH_Dialog.html) */}
        <div className="w-full bg-tertiary-container px-space-lg py-space-md flex flex-col gap-space-xs text-on-tertiary">
          <div className="flex items-center gap-space-xs">
            <Icon name="warning" className="text-[26px]" />
            <span className="font-title-hinglish text-title-hinglish uppercase tracking-wide font-bold">
              {t('dawai_becho.sch_modal_title', {
                type: medicine.scheduleType === 'H1' ? 'H1' : 'H',
              })}
            </span>
          </div>
          <div className="font-headline-lg text-headline-lg text-on-tertiary tracking-tight font-extrabold">
            {medicine.name} {medicine.strength}
          </div>
        </div>

        {/* Modal Body Content */}
        <form onSubmit={handleSubmit} className="p-space-lg flex flex-col gap-space-md">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-bold flex items-center gap-2">
              <Icon name="error" className="text-[20px] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Field 1: Patient Name */}
          <div className="flex flex-col gap-space-xs">
            <label className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
              {t('dawai_becho.sch_patient_label')} <span className="text-error">*</span>
            </label>
            <div className="h-14 w-full bg-surface-container-low rounded-2xl px-space-md flex items-center shadow-inner border border-outline-variant/50 focus-within:ring-2 focus-within:ring-primary">
              <input
                {...textFieldProps('name', patientName, (val) => {
                  setPatientName(val);
                  if (errorMsg) setErrorMsg('');
                })}
                type="text"
                autoFocus
                placeholder={t('dawai_becho.sch_patient_placeholder')}
                className="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-outline"
              />
            </div>
          </div>

          {/* Field 2: Doctor Name */}
          <div className="flex flex-col gap-space-xs">
            <label className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
              {t('dawai_becho.sch_doctor_label')} <span className="text-error">*</span>
            </label>
            <div className="h-14 w-full bg-surface-container-low rounded-2xl px-space-md flex items-center shadow-inner border border-outline-variant/50 focus-within:ring-2 focus-within:ring-primary">
              <input
                {...textFieldProps('name', doctorName, (val) => {
                  setDoctorName(val);
                  if (errorMsg) setErrorMsg('');
                })}
                type="text"
                placeholder={t('dawai_becho.sch_doctor_placeholder')}
                className="w-full bg-transparent font-body-md text-body-md text-on-surface focus:outline-none placeholder:text-outline"
              />
            </div>
          </div>

          {/* Question: Prescription dekhi? */}
          <div className="flex flex-col gap-space-xs pt-space-xs">
            <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
              {t('dawai_becho.sch_rx_question')} <span className="text-error">*</span>
            </span>
            <div className="grid grid-cols-2 gap-space-md pt-1">
              {/* Haan Button (Yes) */}
              <button
                type="button"
                onClick={() => {
                  setPrescriptionChoice('yes');
                  if (errorMsg) setErrorMsg('');
                }}
                className={`h-14 min-h-[56px] w-full rounded-2xl flex items-center justify-center gap-space-sm px-space-md transition-all cursor-pointer active:scale-[0.98] ${
                  prescriptionChoice === 'yes'
                    ? 'bg-primary text-on-primary shadow-md hover:bg-primary-container'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest border border-outline-variant'
                }`}
              >
                <Icon name="check_circle" className="text-[28px]" />
                <div className="flex flex-col items-start leading-none">
                  <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
                    {btnYes.main}
                  </span>
                  {btnYes.sub && (
                    <span
                      className={`font-label-sub-english text-label-sub-english ${
                        prescriptionChoice === 'yes' ? 'text-primary-fixed' : 'text-on-surface-variant'
                      }`}
                    >
                      {btnYes.sub}
                    </span>
                  )}
                </div>
              </button>

              {/* Nahi Button (No) */}
              <button
                type="button"
                onClick={() => {
                  setPrescriptionChoice('no');
                  setErrorMsg(t('dawai_becho.sch_err_rx_required'));
                }}
                className={`h-14 min-h-[56px] w-full rounded-2xl flex items-center justify-center gap-space-sm px-space-md transition-all cursor-pointer active:scale-[0.98] ${
                  prescriptionChoice === 'no'
                    ? 'bg-error text-on-error shadow-md'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest border border-outline-variant'
                }`}
              >
                <Icon name="cancel" className="text-[28px]" />
                <div className="flex flex-col items-start leading-none">
                  <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
                    {btnNo.main}
                  </span>
                  {btnNo.sub && (
                    <span
                      className={`font-label-sub-english text-label-sub-english ${
                        prescriptionChoice === 'no' ? 'text-error-container' : 'text-on-surface-variant'
                      }`}
                    >
                      {btnNo.sub}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center gap-space-md pt-space-sm">
            {/* Wapas Button */}
            <button
              type="button"
              onClick={onCancel}
              className="h-14 min-h-[56px] w-1/3 rounded-2xl bg-surface-container-high text-on-surface flex items-center justify-center gap-space-xs px-space-md hover:bg-surface-container-highest active:scale-[0.98] transition-all cursor-pointer border border-outline-variant"
            >
              <Icon name="arrow_back" className="text-[24px] text-primary" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
                  {btnBack.main}
                </span>
                {btnBack.sub && (
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {btnBack.sub}
                  </span>
                )}
              </div>
            </button>

            {/* Bill Mein Jodo Button */}
            <button
              type="submit"
              className="h-14 min-h-[56px] w-2/3 rounded-2xl bg-primary text-on-primary flex items-center justify-center gap-space-sm px-space-md shadow-md hover:bg-primary-container active:scale-[0.98] transition-all cursor-pointer"
            >
              <Icon name="add_shopping_cart" className="text-[26px]" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
                  {btnAdd.main}
                </span>
                {btnAdd.sub && (
                  <span className="font-label-sub-english text-label-sub-english text-primary-fixed">
                    {btnAdd.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

