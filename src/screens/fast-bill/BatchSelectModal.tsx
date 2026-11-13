import React, { useEffect, useState } from 'react';
import { db, type Batch } from '../../db';
import { batchStock, isExpired } from '../../logic/stock';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { t } from '../../i18n';

interface BatchInfo {
  batch: Batch;
  stockUnits: number;
}

interface BatchSelectModalProps {
  isOpen: boolean;
  medicineId: number;
  medicineName: string;
  currentBatchId: number;
  onSelectBatch: (batch: Batch) => void;
  onClose: () => void;
}

export const BatchSelectModal: React.FC<BatchSelectModalProps> = ({
  isOpen,
  medicineId,
  medicineName,
  currentBatchId,
  onSelectBatch,
  onClose,
}) => {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !medicineId) return;
    let isMounted = true;
    setLoading(true);

    (async () => {
      try {
        const rawBatches = await db.batches.where('medicineId').equals(medicineId).toArray();
        const valid: BatchInfo[] = [];
        for (const b of rawBatches) {
          if (b.id === undefined || isExpired(b)) continue;
          const stock = await batchStock(b.id);
          if (stock > 0) {
            valid.push({ batch: b, stockUnits: stock });
          }
        }
        valid.sort((a, b) => a.batch.expiry.localeCompare(b.batch.expiry));
        if (isMounted) {
          setBatches(valid);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, medicineId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-space-md">
      <div className="bg-surface-container-lowest w-full max-w-xl rounded-2xl shadow-xl overflow-hidden border border-outline-variant/40 flex flex-col animate-in fade-in zoom-in-95 max-h-[85vh]">
        {/* Header */}
        <div className="p-space-lg bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">
              {t('fast_bill.batch_modal.title')}
            </h2>
            <span className="font-label-sub-english text-xs text-on-surface-variant">
              {t('fast_bill.batch_modal.subtitle', { name: medicineName })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1"
          >
            <Icon name="close" className="text-[24px]" />
          </button>
        </div>

        {/* Batch List */}
        <div className="p-space-lg flex flex-col gap-space-sm overflow-y-auto flex-1">
          {loading ? (
            <div className="py-8 text-center text-outline">Loading batches...</div>
          ) : batches.length === 0 ? (
            <div className="py-8 text-center text-outline">
              Koi doosra valid batch nahi mila
            </div>
          ) : (
            batches.map(({ batch, stockUnits }) => {
              const isCurrent = batch.id === currentBatchId;

              return (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => {
                    onSelectBatch(batch);
                    onClose();
                  }}
                  className={`p-space-md rounded-xl border flex items-center justify-between transition-all text-left cursor-pointer ${
                    isCurrent
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/40'
                      : 'border-outline-variant/40 hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-headline-md text-base font-bold text-on-surface">
                        {batch.batchNo}
                      </span>
                      {isCurrent && (
                        <span className="text-[11px] bg-primary text-on-primary font-bold px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-on-surface-variant mt-0.5">
                      Exp: {batch.expiry} · Stock: {stockUnits} tabs
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="font-headline-md text-base font-bold text-primary">
                      {formatRupees(batch.mrpPaise)}
                    </span>
                    <span className="text-xs text-outline font-medium">
                      MRP
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-space-md bg-surface-container-low/50 border-t border-outline-variant/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-space-lg rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold text-sm cursor-pointer"
          >
            {t('fast_bill.batch_modal.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
