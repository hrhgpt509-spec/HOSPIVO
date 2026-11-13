import React, { useState, useEffect } from 'react';
import { type DBUser } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { textFieldProps } from '../../logic/format';
import { updateMedicineShelf, type ShelfMedicineItem } from '../../logic/stickers';

interface ShelfMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: ShelfMedicineItem | null;
  allShelves: string[];
  currentUser: DBUser | null;
  onSuccess: (medicineId: number, newShelf: string) => void;
}

export const ShelfMoveModal: React.FC<ShelfMoveModalProps> = ({
  isOpen,
  onClose,
  medicine,
  allShelves,
  currentUser,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [targetShelf, setTargetShelf] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (medicine) {
      setTargetShelf(medicine.shelf || '');
      setError(null);
    }
  }, [medicine]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Prevent default submit if on input, submit form
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, targetShelf, medicine]);

  if (!isOpen || !medicine) return null;

  const btnCancel = tButton('move_shelf_modal.btn_cancel');
  const btnConfirm = tButton('move_shelf_modal.btn_confirm');

  const currentShelfDisplay = medicine.shelf || t('shelf_map.unassigned_shelf');
  const cleanTarget = targetShelf.trim().toUpperCase();
  const isChanged = cleanTarget !== (medicine.shelf || '').trim().toUpperCase();

  const handleSave = async () => {
    if (saving) return;
    if (!cleanTarget) {
      setError(t('move_shelf_modal.placeholder_new_shelf'));
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await updateMedicineShelf(medicine.id, cleanTarget, currentUser);
      onSuccess(medicine.id, cleanTarget);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error moving shelf');
    } finally {
      setSaving(false);
    }
  };

  // Filter unique suggestions
  const suggestions = allShelves.filter(
    (s) => s && s !== 'UNASSIGNED' && s.toUpperCase() !== (medicine.shelf || '').toUpperCase()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] bg-surface-container-lowest rounded-3xl shadow-2xl border border-outline-variant p-6 sm:p-8 flex flex-col gap-6 animate-in zoom-in-95 duration-150 text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-outline-variant/40 pb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight leading-tight">
              {t('move_shelf_modal.title')}
            </h2>
            <p className="text-sm sm:text-base font-medium text-on-surface-variant mt-0.5">
              {t('move_shelf_modal.sub')}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Icon name="swap_horiz" className="text-[28px]" />
          </div>
        </div>

        {/* Medicine Name & Current Shelf Card */}
        <div className="bg-surface-container-low rounded-2xl p-4 sm:p-5 border border-outline-variant/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex items-center justify-center text-primary flex-shrink-0">
              <Icon name="medication" className="text-[26px]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase font-extrabold tracking-wider text-on-surface-variant">
                {t('move_shelf_modal.label_dawai')}
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-on-surface truncate">
                {medicine.name}
              </div>
              {medicine.company && (
                <div className="text-xs text-on-surface-variant truncate">{medicine.company}</div>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-xs uppercase font-extrabold tracking-wider text-on-surface-variant">
              {t('move_shelf_modal.label_current_shelf')}
            </div>
            <div className="inline-flex items-center px-3 sm:px-4 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant text-base sm:text-lg font-bold text-on-surface mt-1 shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary mr-2"></span>
              {t('move_shelf_modal.label_abhi', { shelf: currentShelfDisplay })}
            </div>
          </div>
        </div>

        {/* Shelf Picker Input */}
        <div>
          <label className="block text-base sm:text-lg font-bold text-on-surface mb-2">
            {t('move_shelf_modal.label_new_shelf')}
            <span className="text-sm font-normal text-on-surface-variant ml-1.5">
              {t('move_shelf_modal.sub_new_shelf')}
            </span>
          </label>
          <div className="relative">
            <input
              {...textFieldProps('code', targetShelf, (val) => setTargetShelf(val.toUpperCase()))}
              placeholder={t('move_shelf_modal.placeholder_new_shelf')}
              autoFocus
              className="w-full h-14 sm:h-16 bg-surface-container-lowest border-2 border-primary rounded-2xl px-5 text-xl sm:text-2xl font-extrabold text-on-surface shadow-xs outline-none focus:ring-4 focus:ring-primary/20 uppercase tracking-wide"
            />
          </div>

          {/* Quick Existing Shelf Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-on-surface-variant mb-1.5">
                {t('move_shelf_modal.select_existing_shelf')}:
              </div>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {suggestions.map((shelf) => (
                  <button
                    key={shelf}
                    type="button"
                    onClick={() => setTargetShelf(shelf)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                      cleanTarget === shelf
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/60'
                    }`}
                  >
                    {shelf}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Audit & Transfer Summary Line */}
        {cleanTarget && isChanged && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center gap-3 text-on-surface">
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0">
              <Icon name="info" className="text-[18px]" />
            </div>
            <div className="text-sm sm:text-base font-bold truncate">
              {t('move_shelf_modal.audit_summary', {
                from: medicine.shelf || 'None',
                to: cleanTarget,
                who: currentUser?.name || 'Owner',
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-error-container text-on-error-container text-sm font-bold flex items-center gap-2">
            <Icon name="error" className="text-[20px]" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-outline-variant/40">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-14 min-h-[56px] rounded-2xl border-2 border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-on-surface font-bold text-base sm:text-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
          >
            <span className="leading-tight">{btnCancel.main}</span>
            {btnCancel.sub && (
              <span className="text-xs font-medium text-on-surface-variant leading-none">
                {btnCancel.sub}
              </span>
            )}
          </button>

          <button
            type="button"
            disabled={saving || !cleanTarget || !isChanged}
            onClick={handleSave}
            className={`w-full h-14 min-h-[56px] rounded-2xl font-bold text-base sm:text-lg flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm ${
              saving || !cleanTarget || !isChanged
                ? 'bg-surface-container text-on-surface-variant opacity-50 cursor-not-allowed'
                : 'bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container active:translate-y-0.5'
            }`}
          >
            <span className="leading-tight">{btnConfirm.main}</span>
            {btnConfirm.sub && (
              <span className="text-xs font-medium opacity-90 leading-none">
                {btnConfirm.sub}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

