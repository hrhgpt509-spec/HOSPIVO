import React, { useState, useMemo } from 'react';
import type { Medicine, DBUser } from '../../db';
import { useTranslation } from '../../i18n';
import { Icon } from '../../components/Icon';
import { ApprovalDialog } from '../../components/ApprovalDialog';
import { textFieldProps } from '../../logic/format';
import { triggerFeedback } from '../../logic/feedback';
import { formatMedicineStock } from '../../logic/medicineSearch';
import type { BatchStockDetail } from '../../logic/stockDekho';
import {
  applyStockCorrection,
  buildCorrectionRecordDescription,
  validateStockCorrection,
  type CorrectionDirection,
  type CorrectionReasonCode,
} from '../../logic/stockCorrection';

interface StockCorrectionModalProps {
  medicine: Medicine;
  batch: BatchStockDetail;
  currentUser: DBUser | null;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
}

export const StockCorrectionModal: React.FC<StockCorrectionModalProps> = ({
  medicine,
  batch,
  currentUser,
  onClose,
  onCompleted,
}) => {
  const { t, shouldShowSub } = useTranslation();

  const unitsPerPack = Math.max(1, medicine.unitsPerPack || 1);
  const [direction, setDirection] = useState<CorrectionDirection>('reduce');
  const [packsInput, setPacksInput] = useState<string>('');
  const [looseInput, setLooseInput] = useState<string>('');
  const [reasonCode, setReasonCode] = useState<CorrectionReasonCode | ''>('');
  const [note, setNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [approvalOpen, setApprovalOpen] = useState<boolean>(false);
  const [pendingDelta, setPendingDelta] = useState<number>(0);

  const packsVal = packsInput === '' ? 0 : parseInt(packsInput, 10) || 0;
  const looseVal = looseInput === '' ? 0 : parseInt(looseInput, 10) || 0;
  const deltaUnits = unitsPerPack > 1 ? packsVal * unitsPerPack + looseVal : looseVal;

  const signedPreviewDelta = direction === 'reduce' ? -deltaUnits : deltaUnits;
  const resultingUnits = batch.qtyUnits + signedPreviewDelta;

  const currentStockText = useMemo(
    () =>
      formatMedicineStock(
        batch.qtyUnits,
        unitsPerPack,
        t('medicine.packs_unit'),
        t('medicine.loose_unit')
      ),
    [batch.qtyUnits, unitsPerPack, t]
  );

  const resultingStockText = useMemo(() => {
    if (resultingUnits < 0) {
      return `${resultingUnits} ${t('medicine.loose_unit')}`;
    }
    return formatMedicineStock(
      resultingUnits,
      unitsPerPack,
      t('medicine.packs_unit'),
      t('medicine.loose_unit')
    );
  }, [resultingUnits, unitsPerPack, t]);

  const handleDigitChange = (
    raw: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const digitsOnly = raw.replace(/\D/g, '');
    setter(digitsOnly);
    setErrorMessage('');
  };

  const handleValidateAndOpenApproval = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const validation = validateStockCorrection(
      {
        direction,
        deltaUnits,
        reasonCode,
        note,
      },
      batch.qtyUnits
    );

    if (!validation.ok) {
      let msg = t('stock_dekho.correction_err_qty_min');
      if (validation.error === 'insufficient_stock') {
        msg = t('stock_dekho.correction_err_negative', {
          available: validation.availableUnits ?? batch.qtyUnits,
        });
      } else if (validation.error === 'reason_required') {
        msg = t('stock_dekho.correction_err_reason');
      }
      setErrorMessage(msg);
      triggerFeedback('error', t('errors.generic_error'), msg);
      return;
    }

    setPendingDelta(validation.signedDelta);
    setApprovalOpen(true);
  };

  const handleApprovalGranted = async () => {
    setApprovalOpen(false);
    if (batch.id === undefined || medicine.id === undefined) return;

    setIsSaving(true);
    try {
      const result = await applyStockCorrection({
        medicineId: medicine.id,
        medicineName: medicine.name,
        batchId: batch.id,
        batchNo: batch.batchNo,
        direction,
        deltaUnits,
        reasonCode,
        note,
        user: currentUser,
      });

      if (!result.ok) {
        let msg = t('errors.generic_error');
        if (result.error === 'insufficient_stock') {
          msg = t('stock_dekho.correction_err_negative', {
            available: result.availableUnits ?? batch.qtyUnits,
          });
        } else if (result.error === 'reason_required') {
          msg = t('stock_dekho.correction_err_reason');
        } else if (result.error === 'invalid_quantity') {
          msg = t('stock_dekho.correction_err_qty_min');
        }
        setErrorMessage(msg);
        triggerFeedback('error', t('errors.generic_error'), msg);
        setIsSaving(false);
        return;
      }

      await onCompleted();
      triggerFeedback(
        'success',
        t('stock_dekho.correction_success_title'),
        t('stock_dekho.correction_success_sub')
      );
      onClose();
    } catch {
      const msg = t('errors.generic_error');
      setErrorMessage(msg);
      triggerFeedback('error', msg, msg);
      setIsSaving(false);
    }
  };

  const dirReduceBtn = {
    main: t('stock_dekho.correction_dir_reduce.main'),
    sub: t('stock_dekho.correction_dir_reduce.sub'),
  };
  const dirAddBtn = {
    main: t('stock_dekho.correction_dir_add.main'),
    sub: t('stock_dekho.correction_dir_add.sub'),
  };
  const wapasBtn = {
    main: t('stock_dekho.btn_wapas.main'),
    sub: t('stock_dekho.btn_wapas.sub'),
  };
  const submitBtn = {
    main: t('stock_dekho.correction_btn_submit.main'),
    sub: t('stock_dekho.correction_btn_submit.sub'),
  };

  const reasonOptions: Array<{ code: CorrectionReasonCode; label: string; icon: string }> = [
    { code: 'damaged', label: t('stock_dekho.correction_reason_damaged'), icon: 'broken_image' },
    { code: 'lost', label: t('stock_dekho.correction_reason_lost'), icon: 'search_off' },
    {
      code: 'count_mismatch',
      label: t('stock_dekho.correction_reason_count_mismatch'),
      icon: 'calculate',
    },
  ];

  const recordDescription = buildCorrectionRecordDescription(
    medicine.name,
    medicine.strength,
    batch.batchNo,
    pendingDelta
  );

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-correction-title"
        className="fixed inset-0 z-50 bg-[#0f172a]/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 select-none"
      >
        <div className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-surface-container-lowest text-on-surface rounded-2xl shadow-2xl border border-outline-variant p-space-md sm:p-space-lg flex flex-col gap-space-md">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-space-sm border-b border-outline-variant/40">
            <div className="flex items-center gap-space-sm">
              <div className="w-12 h-12 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center shrink-0">
                <Icon name="tune" className="text-[28px]" />
              </div>
              <div className="flex flex-col">
                <h2
                  id="stock-correction-title"
                  className="font-headline-md text-xl sm:text-headline-md font-extrabold text-on-surface leading-tight"
                >
                  {t('stock_dekho.correction_modal_title')}
                </h2>
                {shouldShowSub(
                  t('stock_dekho.correction_modal_title'),
                  t('stock_dekho.correction_modal_sub')
                ) && (
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {t('stock_dekho.correction_modal_sub')}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={wapasBtn.main}
              className="min-h-[56px] min-w-[56px] px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center cursor-pointer transition-colors"
            >
              <Icon name="close" className="text-[24px]" />
            </button>
          </div>

          {/* Medicine & Batch Summary (no purchase rate or profit ever) */}
          <div className="bg-surface-container-low rounded-xl p-space-md border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="font-title-hinglish text-lg font-extrabold text-on-surface truncate">
                {medicine.name}
                {medicine.strength ? ` ${medicine.strength}` : ''}
              </span>
              <span className="font-body-md text-body-md text-on-surface-variant">
                {t('stock_dekho.table_head_batch')}: <strong>{batch.batchNo}</strong> ·{' '}
                {t('stock_dekho.table_head_expiry')}: <strong>{batch.expiry}</strong>
              </span>
            </div>

            <div className="bg-surface-container px-space-md py-space-xs rounded-xl border border-outline-variant/40 text-right">
              <div className="font-label-sub-english text-xs text-on-surface-variant font-semibold">
                {t('stock_dekho.correction_current_stock')}
              </div>
              <div className="font-title-hinglish text-title-hinglish font-extrabold text-primary">
                {currentStockText} ({batch.qtyUnits})
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleValidateAndOpenApproval} className="flex flex-col gap-space-md">
            {/* Direction selector */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-title-hinglish text-title-hinglish font-bold text-on-surface">
                {t('stock_dekho.correction_direction_label')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <button
                  type="button"
                  onClick={() => {
                    setDirection('reduce');
                    setErrorMessage('');
                  }}
                  className={`min-h-[56px] px-space-md py-2 rounded-xl border-2 flex items-center gap-space-sm transition-all cursor-pointer ${
                    direction === 'reduce'
                      ? 'bg-error-container border-error text-on-error-container shadow-sm'
                      : 'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <Icon name="remove_circle" className="text-[26px] shrink-0" />
                  <div className="flex flex-col text-left leading-tight">
                    <span className="font-title-hinglish text-title-hinglish font-bold">
                      {dirReduceBtn.main}
                    </span>
                    {shouldShowSub(dirReduceBtn.main, dirReduceBtn.sub) && (
                      <span className="font-label-sub-english text-xs opacity-85">
                        {dirReduceBtn.sub}
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDirection('add');
                    setErrorMessage('');
                  }}
                  className={`min-h-[56px] px-space-md py-2 rounded-xl border-2 flex items-center gap-space-sm transition-all cursor-pointer ${
                    direction === 'add'
                      ? 'bg-primary text-on-primary border-primary shadow-sm'
                      : 'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <Icon name="add_circle" className="text-[26px] shrink-0" />
                  <div className="flex flex-col text-left leading-tight">
                    <span className="font-title-hinglish text-title-hinglish font-bold">
                      {dirAddBtn.main}
                    </span>
                    {shouldShowSub(dirAddBtn.main, dirAddBtn.sub) && (
                      <span className="font-label-sub-english text-xs opacity-90">
                        {dirAddBtn.sub}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Quantity inputs */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-title-hinglish text-title-hinglish font-bold text-on-surface">
                {t('stock_dekho.correction_qty_label')}
              </label>

              <div
                className={`grid gap-space-sm ${
                  unitsPerPack > 1 ? 'grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {unitsPerPack > 1 && (
                  <div className="flex flex-col gap-1">
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                      {t('stock_dekho.correction_packs_label')}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={packsInput}
                      onChange={(e) => handleDigitChange(e.target.value, setPacksInput)}
                      placeholder="0"
                      className="min-h-[56px] w-full px-space-md rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-headline-md text-xl font-bold outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                    {t('stock_dekho.correction_loose_label')}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={looseInput}
                    onChange={(e) => handleDigitChange(e.target.value, setLooseInput)}
                    placeholder="0"
                    className="min-h-[56px] w-full px-space-md rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-headline-md text-xl font-bold outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Live preview */}
              <div
                className={`mt-1 px-space-md py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm font-bold ${
                  direction === 'reduce' && resultingUnits < 0
                    ? 'bg-error-container text-error border border-error/40'
                    : 'bg-surface-container text-on-surface'
                }`}
              >
                <span>
                  {t('stock_dekho.correction_total_change_units', {
                    sign: deltaUnits === 0 ? '' : direction === 'reduce' ? '-' : '+',
                    units: deltaUnits,
                  })}
                </span>
                <span>
                  {t('stock_dekho.correction_new_stock_preview', {
                    stock: resultingStockText,
                  })}
                </span>
              </div>
            </div>

            {/* Quick-tap Reason Chips */}
            <div className="flex flex-col gap-space-xs">
              <label className="font-title-hinglish text-title-hinglish font-bold text-on-surface">
                {t('stock_dekho.correction_reason_label')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">
                {reasonOptions.map((opt) => {
                  const selected = reasonCode === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => {
                        setReasonCode(selected ? '' : opt.code);
                        setErrorMessage('');
                      }}
                      className={`min-h-[56px] px-space-sm py-2 rounded-xl border-2 font-body-md font-bold flex items-center justify-center gap-space-xs transition-all cursor-pointer ${
                        selected
                          ? 'bg-secondary text-on-secondary border-secondary shadow-sm'
                          : 'bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container'
                      }`}
                    >
                      <Icon name={opt.icon} className="text-[20px] shrink-0" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional / Custom Note */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="stockCorrectionNoteInput"
                className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium"
              >
                {t('stock_dekho.correction_note_label')}
              </label>
              <input
                id="stockCorrectionNoteInput"
                {...textFieldProps('free', note, (val) => {
                  setNote(val);
                  setErrorMessage('');
                })}
                type="text"
                placeholder={t('stock_dekho.correction_note_placeholder')}
                className="min-h-[56px] w-full px-space-md rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-outline"
              />
            </div>

            {/* Inline Error Banner */}
            {errorMessage && (
              <div className="px-space-md py-space-sm rounded-xl bg-error-container border border-error text-error font-bold flex items-center gap-space-xs">
                <Icon name="error" className="text-[22px] shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Modal Footer Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-space-sm border-t border-outline-variant/40">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="min-h-[56px] min-w-[140px] flex-1 sm:flex-initial px-space-lg py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold flex items-center justify-center gap-space-xs cursor-pointer transition-colors"
              >
                <Icon name="arrow_back" className="text-[22px]" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="font-title-hinglish font-bold">{wapasBtn.main}</span>
                  {shouldShowSub(wapasBtn.main, wapasBtn.sub) && (
                    <span className="text-xs text-on-surface-variant">{wapasBtn.sub}</span>
                  )}
                </div>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="min-h-[56px] min-w-[180px] flex-1 sm:flex-initial px-space-lg py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold shadow-md flex items-center justify-center gap-space-xs cursor-pointer transition-all disabled:opacity-60"
              >
                <Icon name="verified_user" className="text-[22px]" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="font-title-hinglish font-bold">{submitBtn.main}</span>
                  {shouldShowSub(submitBtn.main, submitBtn.sub) && (
                    <span className="text-xs opacity-90">{submitBtn.sub}</span>
                  )}
                </div>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ApprovalDialog always runs when rule === 'local_pin', even if Owner is logged in */}
      <ApprovalDialog
        isOpen={approvalOpen}
        actionCategory="stock_correction"
        recordDescription={recordDescription}
        requesterName={currentUser?.name || t('common.role_cashier')}
        onApproved={handleApprovalGranted}
        onClose={() => setApprovalOpen(false)}
      />
    </>
  );
};

