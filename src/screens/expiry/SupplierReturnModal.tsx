import React, { useState, useEffect } from 'react';
import type { DBUser, Supplier } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { textFieldProps } from '../../logic/format';
import { triggerFeedback } from '../../logic/feedback';
import { formatMedicineStock } from '../../logic/medicineSearch';
import { createSupplierReturn, type ExpiryBatchItem } from '../../logic/expiry';

interface SupplierReturnModalProps {
  isOpen: boolean;
  item: ExpiryBatchItem | null;
  suppliers: Supplier[];
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

export const SupplierReturnModal: React.FC<SupplierReturnModalProps> = ({
  isOpen,
  item,
  suppliers,
  currentUser,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [packsStr, setPacksStr] = useState<string>('0');
  const [looseStr, setLooseStr] = useState<string>('0');
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !item) return;
    if (
      item.suggestedSupplierId &&
      suppliers.some((s) => s.id === item.suggestedSupplierId)
    ) {
      setSelectedSupplierId(String(item.suggestedSupplierId));
    } else if (suppliers.length === 1 && suppliers[0].id !== undefined) {
      setSelectedSupplierId(String(suppliers[0].id));
    } else {
      setSelectedSupplierId('');
    }
    setPacksStr(String(item.packs));
    setLooseStr(String(item.looseUnits));
    setNote('');
    setErrorMsg('');
    setIsSaving(false);
  }, [isOpen, item, suppliers]);

  if (!isOpen || !item) return null;

  const upp = Math.max(1, item.unitsPerPack || 1);
  const packsNum = Math.max(0, Math.floor(Number(packsStr) || 0));
  const looseNum = Math.max(0, Math.floor(Number(looseStr) || 0));
  const totalReturnUnits = packsNum * upp + looseNum;
  const isQtyValid = totalReturnUnits >= 1 && totalReturnUnits <= item.qtyUnits;

  const handleSetFullBatch = () => {
    setPacksStr(String(item.packs));
    setLooseStr(String(item.looseUnits));
    setErrorMsg('');
  };

  const adjustUnits = (kind: 'packs' | 'loose', delta: number) => {
    if (kind === 'packs') {
      const next = Math.max(0, packsNum + delta);
      setPacksStr(String(next));
    } else {
      const next = Math.max(0, looseNum + delta);
      setLooseStr(String(next));
    }
    setErrorMsg('');
  };

  const handleConfirm = async () => {
    if (isSaving) return;

    const supId = Number(selectedSupplierId);
    if (!supId || supId <= 0) {
      setErrorMsg(t('expiry.err_supplier_required'));
      triggerFeedback('error', t('expiry.err_supplier_required'));
      return;
    }

    if (!isQtyValid) {
      setErrorMsg(t('expiry.err_qty_invalid'));
      triggerFeedback('error', t('expiry.err_qty_invalid'));
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg('');
      const actorName = currentUser?.name || currentUser?.role || 'User';
      await createSupplierReturn({
        batchId: item.batchId,
        supplierId: supId,
        qtyUnits: totalReturnUnits,
        note,
        actorName: String(actorName),
      });
      triggerFeedback('success', t('expiry.toast_return_created'));
      onSaved();
    } catch (err: any) {
      const msg = err?.message || t('errors.generic_error');
      setErrorMsg(msg);
      triggerFeedback('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmBtn = tButton('expiry.btn_confirm_return');
  const cancelBtn = tButton('suppliers.btn_back');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-[#0f172a]/65 backdrop-blur-md flex items-center justify-center p-4 select-none"
    >
      <div className="w-full max-w-xl bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
              <Icon name="assignment_return" className="text-[26px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="font-headline-md text-headline-md text-on-surface font-bold truncate">
                {t('expiry.modal_return_title')}
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant truncate">
                {t('expiry.modal_return_sub')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={cancelBtn.main}
            className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center cursor-pointer shrink-0"
          >
            <Icon name="close" className="text-2xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex flex-col gap-4">
          {/* Batch Summary Card (zero purchase rates) */}
          <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="font-title-hinglish text-on-surface font-bold truncate">
                {item.medicineName} {item.medicineStrength}
              </span>
              <span className="text-sm text-on-surface-variant">
                {t('expiry.batch_prefix')} {item.batchNo} · {t('expiry.exp_prefix')}{' '}
                {item.expiryMonthYear}
                {item.shelf ? ` · ${item.shelf}` : ''}
              </span>
            </div>
            <div className="flex flex-col sm:items-end shrink-0">
              <span className="text-xs font-semibold text-on-surface-variant">
                {t('expiry.modal_available_stock')}
              </span>
              <span className="font-title-hinglish text-primary font-extrabold">
                {formatMedicineStock(
                  item.qtyUnits,
                  upp,
                  t('medicine.packs_unit'),
                  t('medicine.loose_unit')
                )}
              </span>
            </div>
          </div>

          {/* Supplier Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('expiry.modal_select_supplier')} <span className="text-error">*</span>
            </label>
            {suppliers.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-error-container/60 text-on-error-container text-sm font-semibold flex items-center gap-2">
                <Icon name="warning" className="text-xl shrink-0" />
                <span>{t('expiry.modal_no_suppliers')}</span>
              </div>
            ) : (
              <select
                value={selectedSupplierId}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value);
                  setErrorMsg('');
                }}
                className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{t('expiry.modal_choose_supplier_placeholder')}</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={String(sup.id)}>
                    {sup.name}
                    {sup.phone ? ` (${sup.phone})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quantity Controls */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-on-surface">
                {t('expiry.tracker_qty_label')}
              </span>
              <button
                type="button"
                onClick={handleSetFullBatch}
                className="px-3 py-1.5 rounded-lg bg-primary-fixed text-on-primary-fixed font-bold text-xs hover:brightness-95 cursor-pointer"
              >
                {t('expiry.modal_btn_full_batch')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Packs */}
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/50 flex flex-col gap-2">
                <span className="text-xs font-bold text-on-surface-variant">
                  {t('expiry.modal_return_packs')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustUnits('packs', -1)}
                    className="w-14 h-14 min-h-[56px] rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={packsStr}
                    onChange={(e) => {
                      setPacksStr(e.target.value.replace(/[^0-9]/g, ''));
                      setErrorMsg('');
                    }}
                    className="w-full h-14 text-center rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface font-headline-md font-extrabold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => adjustUnits('packs', 1)}
                    className="w-14 h-14 min-h-[56px] rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Loose */}
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/50 flex flex-col gap-2">
                <span className="text-xs font-bold text-on-surface-variant">
                  {t('expiry.modal_return_loose')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustUnits('loose', -1)}
                    className="w-14 h-14 min-h-[56px] rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={looseStr}
                    onChange={(e) => {
                      setLooseStr(e.target.value.replace(/[^0-9]/g, ''));
                      setErrorMsg('');
                    }}
                    className="w-full h-14 text-center rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface font-headline-md font-extrabold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => adjustUnits('loose', 1)}
                    className="w-14 h-14 min-h-[56px] rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-between ${
                isQtyValid
                  ? 'bg-primary-fixed/40 text-on-primary-fixed-variant'
                  : 'bg-error-container/70 text-on-error-container'
              }`}
            >
              <span>
                {t('expiry.modal_return_total_units', { units: totalReturnUnits })}
              </span>
              {!isQtyValid && <span>{t('expiry.err_qty_invalid')}</span>}
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-on-surface">
              {t('expiry.modal_note_label')}
            </label>
            <input
              {...textFieldProps('free', note, setNote)}
              type="text"
              placeholder={t('expiry.modal_note_placeholder')}
              className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-bold flex items-center gap-2">
              <Icon name="error" className="text-xl shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/50 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-14 min-h-[56px] px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold flex items-center gap-2 cursor-pointer"
          >
            <Icon name="arrow_back" className="text-xl" />
            <span>{cancelBtn.main}</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving || suppliers.length === 0 || !isQtyValid}
            className="h-14 min-h-[56px] px-6 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
          >
            <Icon name="check_circle" className="text-2xl" />
            <div className="flex flex-col text-left leading-none">
              <span className="font-title-hinglish font-bold">{confirmBtn.main}</span>
              {confirmBtn.sub && (
                <span className="text-xs text-primary-fixed pt-0.5">{confirmBtn.sub}</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
