import React, { useState } from 'react';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { canSeePurchasePrice } from '../../logic/roles';
import { togglePurchaseVerified, type SupplierInvoiceDetail } from '../../logic/suppliers';
import { triggerFeedback } from '../../logic/feedback';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: SupplierInvoiceDetail | null;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  onVerifiedChanged?: (newVerified: boolean) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoiceData,
  currentUser,
  onVerifiedChanged,
}) => {
  const { t } = useTranslation();
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [isUpdatingVerified, setIsUpdatingVerified] = useState<boolean>(false);

  if (!isOpen || !invoiceData) return null;

  const isOwnerUser = canSeePurchasePrice(currentUser);

  const handleToggleVerified = async () => {
    if (!isOwnerUser || isUpdatingVerified) return;
    try {
      setIsUpdatingVerified(true);
      const nextStatus = !invoiceData.verified;
      const who = currentUser?.name || 'Owner';
      await togglePurchaseVerified(invoiceData.purchaseId, nextStatus, who);
      invoiceData.verified = nextStatus;
      triggerFeedback(
        'success',
        nextStatus ? t('suppliers.toast_verified_success') : t('suppliers.toast_unverified_success')
      );
      if (onVerifiedChanged) {
        onVerifiedChanged(nextStatus);
      }
    } catch (err: any) {
      console.error('Failed to toggle verified:', err);
      triggerFeedback('error', 'Error updating verification status');
    } finally {
      setIsUpdatingVerified(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
      <div className="w-full max-w-3xl max-h-[90vh] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-container-high text-primary flex items-center justify-center shrink-0">
              <Icon name="receipt_long" className="text-[28px]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-headline-md text-on-surface font-extrabold leading-tight">
                  {invoiceData.invoiceNo}
                </h2>
                {/* Verified indicator badge */}
                {invoiceData.verified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-bold">
                    <Icon name="check_circle" className="text-[16px] text-primary" />
                    <span>{t('suppliers.badge_verified')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-bold">
                    <Icon name="check_box_outline_blank" className="text-[16px] text-outline" />
                    <span>{t('suppliers.badge_unverified')}</span>
                  </span>
                )}
              </div>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                {t('suppliers.invoice_date_label')} {invoiceData.date}
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Top section: Photo and Summary */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* Invoice Photo thumbnail */}
            {invoiceData.invoicePhoto ? (
              <div
                onClick={() => setIsZoomed(true)}
                className="w-full sm:w-48 h-48 rounded-xl bg-surface-container-high border border-outline-variant overflow-hidden cursor-pointer relative group shrink-0 flex items-center justify-center"
                title={t('suppliers.photo_zoom_hint')}
              >
                <img
                  src={invoiceData.invoicePhoto}
                  alt={invoiceData.invoiceNo}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white gap-1 transition-opacity">
                  <Icon name="zoom_in" className="text-[28px]" />
                  <span className="text-xs font-bold">{t('suppliers.photo_zoom_hint')}</span>
                </div>
              </div>
            ) : (
              <div className="w-full sm:w-48 h-48 rounded-xl bg-surface-container-high flex flex-col items-center justify-center text-on-surface-variant shrink-0">
                <Icon name="receipt" className="text-[48px] text-outline" />
                <span className="text-xs mt-1">No photo</span>
              </div>
            )}

            {/* Invoices meta & totals */}
            <div className="flex-1 flex flex-col justify-between h-full w-full gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col">
                  <span className="font-label-sub-english text-xs text-on-surface-variant font-medium">
                    {t('suppliers.col_packs')}
                  </span>
                  <span className="font-headline-md text-xl font-bold text-on-surface">
                    {invoiceData.totalPacks}
                    {invoiceData.totalFreePacks > 0 && (
                      <span className="text-sm font-semibold text-primary ml-1">
                        +{invoiceData.totalFreePacks} free
                      </span>
                    )}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col">
                  <span className="font-label-sub-english text-xs text-on-surface-variant font-medium">
                    {t('suppliers.invoice_lines_count', { count: invoiceData.lines.length })}
                  </span>
                  <span className="font-headline-md text-xl font-bold text-on-surface">
                    {invoiceData.lines.length} lines
                  </span>
                </div>
              </div>

              {/* Owner-only total */}
              {isOwnerUser && invoiceData.canSeeRates && (
                <div className="p-4 rounded-xl bg-primary-fixed/30 border border-primary/20 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-sub-english text-sm font-bold text-primary">
                      {t('suppliers.invoice_total_label')}
                    </span>
                    <span className="font-headline-lg text-2xl font-black text-on-surface">
                      {formatRupees(invoiceData.totalPaise)}
                    </span>
                  </div>
                  <Icon name="payments" className="text-primary text-[36px]" />
                </div>
              )}

              {/* Verified Toggle: ONLY FOR OWNER */}
              {isOwnerUser ? (
                <button
                  type="button"
                  onClick={handleToggleVerified}
                  disabled={isUpdatingVerified}
                  className={`min-h-[56px] px-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                    invoiceData.verified
                      ? 'bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  <Icon
                    name={invoiceData.verified ? 'check_circle' : 'check_box_outline_blank'}
                    className={`text-[26px] ${invoiceData.verified ? 'text-primary' : 'text-outline'}`}
                  />
                  <span>
                    {invoiceData.verified
                      ? t('suppliers.badge_verified')
                      : t('suppliers.badge_unverified')}
                  </span>
                </button>
              ) : (
                <div className="min-h-[52px] px-4 rounded-xl bg-surface-container-high flex items-center justify-center gap-2">
                  <Icon
                    name={invoiceData.verified ? 'check_circle' : 'check_box_outline_blank'}
                    className={`text-[22px] ${invoiceData.verified ? 'text-primary' : 'text-outline'}`}
                  />
                  <span className="font-body-md font-bold text-on-surface-variant">
                    {invoiceData.verified
                      ? t('suppliers.badge_verified')
                      : t('suppliers.badge_unverified')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Medicine Lines List */}
          <div className="flex flex-col gap-2">
            <h3 className="font-title-hinglish text-title-hinglish font-bold text-on-surface">
              {t('suppliers.modal_invoice_sub')}
            </h3>

            <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container-lowest">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant font-label-sub-english text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">{t('suppliers.col_medicine')}</th>
                    <th className="py-3 px-3 font-bold">{t('suppliers.col_batch')}</th>
                    <th className="py-3 px-3 font-bold">{t('suppliers.col_expiry')}</th>
                    <th className="py-3 px-3 font-bold text-center">{t('suppliers.col_packs')}</th>
                    {isOwnerUser && invoiceData.canSeeRates && (
                      <>
                        <th className="py-3 px-3 font-bold text-right">{t('suppliers.col_purchase_rate')}</th>
                        <th className="py-3 px-4 font-bold text-right">{t('suppliers.col_total')}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 font-body-md text-sm text-on-surface">
                  {invoiceData.lines.map((line, idx) => (
                    <tr key={line.id || `line-${idx}`} className="hover:bg-surface-container-low/50">
                      <td className="py-3 px-4 font-semibold text-on-surface">
                        {line.medicineName}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">{line.batchNo}</td>
                      <td className="py-3 px-3 text-xs">{line.expiry}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold">{line.packs}</span>
                        {line.freePacks > 0 && (
                          <span className="text-xs font-semibold text-primary ml-1">
                            +{line.freePacks}
                          </span>
                        )}
                      </td>
                      {isOwnerUser && invoiceData.canSeeRates && (
                        <>
                          <td className="py-3 px-3 text-right font-medium">
                            {formatRupees((line as any).purchaseRatePaise)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-primary">
                            {formatRupees((line as any).lineTotalPaise)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-outline-variant flex items-center justify-end bg-surface-container-low shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-6 rounded-xl bg-surface-container-high text-on-surface font-bold text-base hover:bg-surface-container-highest cursor-pointer transition-colors"
          >
            {tButton('suppliers.btn_back').main}
          </button>
        </div>
      </div>

      {/* Enlarged Photo Lightbox Modal */}
      {isZoomed && invoiceData.invoicePhoto && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={invoiceData.invoicePhoto}
              alt={invoiceData.invoiceNo}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
            >
              <Icon name="close" className="text-[24px]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

