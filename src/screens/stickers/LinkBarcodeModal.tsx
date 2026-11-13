import React, { useState, useEffect, useRef } from 'react';
import { db, type Medicine, type DBUser } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { addAudit } from '../../db/audit';
import { textFieldProps } from '../../logic/format';

interface LinkBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  currentUser: DBUser | null;
  onSuccess: (medicineId: number, barcode: string) => void;
}

export const LinkBarcodeModal: React.FC<LinkBarcodeModalProps> = ({
  isOpen,
  onClose,
  medicines,
  currentUser,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [selectedMedId, setSelectedMedId] = useState<number | null>(null);
  const [barcode, setBarcode] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setBarcode('');
      setSearch('');
      setError(null);
      if (medicines.length > 0 && !selectedMedId) {
        setSelectedMedId(medicines[0].id ?? null);
      }
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [isOpen, medicines]);

  if (!isOpen) return null;

  const filteredMedicines = medicines
    .filter((m) => m.active !== false)
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        (m.shortCode && m.shortCode.toLowerCase().includes(q)) ||
        (m.company && m.company.toLowerCase().includes(q))
      );
    })
    .slice(0, 15);

  const selectedMed = medicines.find((m) => m.id === selectedMedId);

  const handleSave = async () => {
    if (saving || !selectedMedId) return;
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) {
      setError(t('stickers.link_modal_prompt'));
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Check if barcode already used by another medicine
      const existing = await db.medicines.where('barcode').equals(cleanBarcode).first();
      if (existing && existing.id !== selectedMedId) {
        setError(`Barcode already assigned to ${existing.name}`);
        setSaving(false);
        return;
      }

      await db.medicines.update(selectedMedId, {
        barcode: cleanBarcode,
      });

      await addAudit(
        currentUser?.name || 'Owner',
        'medicine_barcode_linked',
        `Medicine #${selectedMedId} (${selectedMed?.name || ''})`,
        JSON.stringify({
          medicineId: selectedMedId,
          barcode: cleanBarcode,
        })
      );

      onSuccess(selectedMedId, cleanBarcode);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error linking barcode');
    } finally {
      setSaving(false);
    }
  };

  const btnLink = tButton('stickers.link_modal_btn');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-surface-container-lowest rounded-3xl shadow-2xl border border-outline-variant p-6 sm:p-8 flex flex-col gap-5 text-on-surface animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-outline-variant/40 pb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
              {t('stickers.link_modal_title')}
            </h2>
            <p className="text-sm text-on-surface-variant font-medium mt-0.5">
              {t('stickers.link_modal_sub')}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Icon name="barcode_scanner" className="text-[28px]" />
          </div>
        </div>

        {/* Medicine Picker */}
        <div>
          <label className="block text-sm font-bold text-on-surface mb-1.5">
            {t('move_shelf_modal.label_dawai')}
          </label>
          <div className="relative mb-2">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('stickers.search_placeholder')}
              className="w-full h-11 pl-9 pr-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="max-h-36 overflow-y-auto flex flex-col gap-1 border border-outline-variant/50 rounded-xl p-1 bg-surface-container-low">
            {filteredMedicines.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMedId(m.id ?? null)}
                className={`p-2 rounded-lg text-left text-xs sm:text-sm font-bold flex items-center justify-between transition-colors cursor-pointer ${
                  selectedMedId === m.id
                    ? 'bg-primary text-on-primary'
                    : 'hover:bg-surface-container text-on-surface'
                }`}
              >
                <span className="truncate">{m.name}</span>
                <span className="text-xs opacity-75 font-mono ml-2 shrink-0">
                  {m.barcode || m.shortCode || ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Barcode Input */}
        <div>
          <label className="block text-sm font-bold text-on-surface mb-1.5">
            {t('stickers.link_modal_prompt')}
          </label>
          <div className="relative">
            <input
              ref={barcodeInputRef}
              {...textFieldProps('code', barcode, setBarcode)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="e.g. 8901117002138"
              className="w-full h-14 bg-surface-container-lowest border-2 border-primary rounded-2xl px-4 text-xl font-mono font-bold text-on-surface focus:ring-4 focus:ring-primary/20 outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant uppercase">
              Scan now
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs sm:text-sm font-bold flex items-center gap-2">
            <Icon name="error" className="text-[18px]" />
            <span>{error}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-outline-variant/40">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-14 min-h-[56px] rounded-2xl border-2 border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-on-surface font-bold text-base flex items-center justify-center cursor-pointer transition-colors"
          >
            {t('move_shelf_modal.btn_cancel.main')}
          </button>
          <button
            type="button"
            disabled={saving || !barcode.trim() || !selectedMedId}
            onClick={handleSave}
            className={`w-full h-14 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-base flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm ${
              saving || !barcode.trim() || !selectedMedId ? 'opacity-50 cursor-not-allowed' : 'active:translate-y-0.5'
            }`}
          >
            <span className="leading-tight">{btnLink.main}</span>
            {btnLink.sub && (
              <span className="text-xs font-medium opacity-90 leading-none">{btnLink.sub}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
