import React from 'react';
import { useTranslation, tButton } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { buildUdhaarWhatsAppUrl, type CustomerLedgerEntry } from '../../logic/udhaar';

interface YaadDilaoModalProps {
  isOpen: boolean;
  customer: CustomerLedgerEntry | null;
  onClose: () => void;
}

export const YaadDilaoModal: React.FC<YaadDilaoModalProps> = ({
  isOpen,
  customer,
  onClose,
}) => {
  const { t } = useTranslation();
  const { name: shopName } = useShop();

  if (!isOpen || !customer) return null;

  const message = t('udhaar.wa_reminder_text', {
    amount: formatRupees(customer.pendingBalancePaise),
    shop: shopName || '',
  });

  const handleOpenWhatsApp = () => {
    try {
      const url = buildUdhaarWhatsAppUrl(customer.customerPhone, message);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp open failed:', err);
    }
  };

  const backBtn = tButton('suppliers.btn_back');
  const openWaBtn = tButton('udhaar.wa_btn_open');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none"
    >
      <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-3xl shadow-2xl border border-outline-variant/40 p-6 sm:p-8 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 pb-4">
          <div>
            <h2 className="font-headline-lg text-2xl sm:text-[28px] font-extrabold text-on-surface leading-tight">
              {t('udhaar.wa_title')}
            </h2>
            <p className="text-sm sm:text-base font-medium text-on-surface-variant mt-0.5">
              {t('udhaar.wa_sub')}
            </p>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary-fixed/40 flex items-center justify-center text-primary shrink-0">
            <Icon name="chat" className="text-[28px]" />
          </div>
        </div>

        {/* Customer Summary */}
        <div className="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs sm:text-sm text-on-surface-variant font-medium block">
              {t('udhaar.pm_customer_label')}
            </span>
            <span className="font-title-hinglish text-lg sm:text-xl font-bold text-on-surface truncate block">
              {customer.customerName}
            </span>
            {customer.customerPhone && (
              <span className="text-xs sm:text-sm text-on-surface-variant">
                {customer.customerPhone}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs sm:text-sm text-on-surface-variant font-medium block">
              {t('udhaar.pm_balance_label')}
            </span>
            <span className="font-title-hinglish text-lg sm:text-xl font-extrabold text-error">
              {formatRupees(customer.pendingBalancePaise)}
            </span>
          </div>
        </div>

        {/* Message Preview Bubble */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-on-surface-variant">
            {t('udhaar.wa_preview_label')}
          </span>
          <div className="bg-surface-container rounded-2xl p-4 border border-outline-variant/40">
            <div className="bg-primary-fixed/60 dark:bg-primary/20 border border-primary/25 rounded-2xl rounded-tl-sm p-4 text-on-surface shadow-sm">
              <p className="text-base sm:text-lg font-medium leading-relaxed">{message}</p>
              <div className="flex items-center justify-end gap-1.5 mt-2 text-on-surface-variant text-xs font-semibold">
                <span>{t('udhaar.wa_send_now')}</span>
                <Icon name="done_all" className="text-primary text-[18px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-16 min-h-[56px] px-5 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Icon name="arrow_back" className="text-2xl text-on-surface-variant" />
            <div className="flex flex-col items-start leading-tight">
              <span className="font-title-hinglish text-base sm:text-lg font-bold">
                {backBtn.main}
              </span>
              {backBtn.sub && (
                <span className="text-xs text-on-surface-variant">{backBtn.sub}</span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="flex-[1.5] h-16 min-h-[56px] px-6 rounded-2xl bg-primary hover:bg-primary-container text-on-primary flex items-center justify-center gap-3 shadow-md transition-all cursor-pointer"
          >
            <Icon name="sms" className="text-[28px]" />
            <div className="flex flex-col items-start leading-tight">
              <span className="font-title-hinglish text-base sm:text-lg font-extrabold">
                {openWaBtn.main}
              </span>
              {openWaBtn.sub && (
                <span className="text-xs opacity-90 font-semibold">{openWaBtn.sub}</span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

