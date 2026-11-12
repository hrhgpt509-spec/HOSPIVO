import React, { useState, useEffect } from 'react';
import type { Bill, BillItem, DBUser } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { useShop } from '../../logic/useShop';
import { formatRupees } from '../../logic/money';
import { triggerFeedback } from '../../logic/feedback';
import { buildWhatsAppBillText, buildWhatsAppBillUrl } from '../../logic/billingFlow';
import { BillReceiptPrintView, type PrintFormat } from './BillReceiptPrintView';

interface BillDoneScreenProps {
  bill: Bill;
  items: BillItem[];
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onReturnHome: () => void;
  onDone: () => void;
}

export const BillDoneScreen: React.FC<BillDoneScreenProps> = ({
  bill,
  items,
  currentUser,
  theme = 'light',
  onToggleTheme,
  onReturnHome,
  onDone,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();
  const [printFormat, setPrintFormat] = useState<PrintFormat>('thermal');
  const [showPrintFormatPicker, setShowPrintFormatPicker] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  useEffect(() => {
    triggerFeedback('success', t('billing_flow.done_title'), `#${bill.billNo}`);
  }, [bill.billNo, t]);

  // Enter key shortcut for rapid counter speed (17_Pay_BillDone.html)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !showPrintFormatPicker) {
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDone, showPrintFormatPicker]);

  const handlePrint = (fmt: PrintFormat) => {
    setPrintFormat(fmt);
    setShowPrintFormatPicker(false);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print error:', err);
      }
    }, 80);
  };

  const handleWhatsAppShare = () => {
    try {
      const msg = buildWhatsAppBillText(bill, items, shopName || '', {
        greeting: t('billing_flow.wa_greeting'),
        billLabel: t('billing_flow.wa_bill_label'),
        dateLabel: t('billing_flow.wa_date_label'),
        itemsHeading: t('billing_flow.wa_items_heading'),
        totalLabel: t('dawai_becho.summary_total'),
        modeLabel: t('billing_flow.receipt_mode'),
        stripWord: t('dawai_becho.unit_strip'),
        looseWord: t('dawai_becho.unit_loose'),
        thanks: t('billing_flow.wa_thanks'),
      });
      const url = buildWhatsAppBillUrl(bill.customerPhone, msg);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp open failed:', err);
    }
  };

  const returnHomeBtn = tButton('home.return_home_btn');
  const btnPrint = tButton('billing_flow.btn_print');
  const btnWhatsapp = tButton('billing_flow.btn_whatsapp');
  const btnDone = tButton('billing_flow.btn_done_next');

  return (
    <div className="w-full min-h-screen bg-surface text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-3">
          <div className="flex items-center gap-space-lg min-w-0">
            <span className="font-headline-lg text-headline-lg font-extrabold text-primary tracking-tight">
              HOSPIVO
            </span>
            {shopName && (
              <>
                <div className="hidden sm:block h-8 w-0.5 bg-outline-variant" />
                <div className="hidden sm:flex flex-col min-w-0">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                    {shopName}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {t('dawai_becho.page_title')}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-space-md shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-space-xs text-on-surface-variant hover:text-on-surface font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{returnHomeBtn.main}</span>
            </button>

            <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-low">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                {modeLabel}
              </span>
            </div>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-2xl" />
              </button>
            )}

            <FullscreenButton className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer" />

            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="hidden sm:inline font-title-hinglish text-title-hinglish text-on-surface font-bold">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Centered Success Card (Matching 17_Pay_BillDone.html) */}
      <main className="w-full pt-20 flex-1 bg-surface flex flex-col justify-center items-center px-gutter py-space-md relative overflow-hidden">
        <div className="absolute w-[560px] h-[560px] bg-primary-fixed/30 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="w-full max-w-2xl bg-surface-container-lowest rounded-2xl shadow-xl p-6 sm:p-space-xl flex flex-col items-center text-center relative overflow-hidden border border-outline-variant/40">
          {/* Top Green Accent Strip */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-primary" />

          {/* Pulsing Check Badge */}
          <div className="relative flex items-center justify-center my-space-sm">
            <div className="absolute inset-0 rounded-full bg-primary-fixed animate-ping opacity-25" />
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-surface-container-low flex items-center justify-center shadow-md">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-lg">
                <Icon name="check" className="text-[44px] sm:text-[52px] leading-none" />
              </div>
            </div>
          </div>

          <h1 className="font-display-total-mobile text-display-total-mobile text-on-surface tracking-tight mt-space-sm mb-space-xs font-extrabold">
            {t('billing_flow.done_title')}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant font-medium">
            {t('billing_flow.done_sub')}
          </p>

          {/* Prominent Bill Details Capsule */}
          <div className="w-full bg-surface-container rounded-xl py-space-md px-space-lg my-space-md flex flex-col items-center gap-2 shadow-sm border border-outline-variant/40">
            <div className="flex items-center justify-center gap-space-md flex-wrap">
              <div className="flex items-center gap-space-xs">
                <Icon name="receipt_long" className="text-primary text-[28px]" />
                <span className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-wide">
                  {t('dawai_becho.bill_header_prefix')} #{bill.billNo}
                </span>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-outline-variant hidden sm:inline-block" />
              <span className="font-display-total-mobile text-[36px] text-primary leading-none font-extrabold">
                {formatRupees(bill.totalPaise)}
              </span>
            </div>

            <div className="flex items-center gap-3 text-sm font-bold text-on-surface-variant flex-wrap justify-center">
              <span className="px-3 py-1 rounded-full bg-surface-container-lowest border border-outline-variant/50 uppercase">
                {bill.paymentMode}
              </span>
              {bill.paymentMode === 'cash' && bill.changePaise > 0 && (
                <span className="px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed">
                  {t('billing_flow.done_change_label')} {formatRupees(bill.changePaise)}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-space-md mt-space-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md w-full">
              {/* Print Button */}
              <button
                type="button"
                onClick={() => setShowPrintFormatPicker(true)}
                className="group h-[80px] min-h-[56px] rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:translate-y-0.5 transition-all duration-150 flex items-center justify-center gap-space-md px-space-md text-left shadow-sm cursor-pointer border border-outline-variant/40"
              >
                <div className="w-12 h-12 rounded-lg bg-surface-container-lowest flex items-center justify-center text-on-surface shadow-sm group-hover:scale-105 transition-transform">
                  <Icon name="print" className="text-[30px]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold leading-tight">
                    {btnPrint.main}
                  </span>
                  {btnPrint.sub && (
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-normal">
                      {btnPrint.sub}
                    </span>
                  )}
                </div>
              </button>

              {/* WhatsApp Button */}
              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="group h-[80px] min-h-[56px] rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:translate-y-0.5 transition-all duration-150 flex items-center justify-center gap-space-md px-space-md text-left shadow-sm cursor-pointer border border-outline-variant/40"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-fixed flex items-center justify-center text-primary shadow-sm group-hover:scale-105 transition-transform">
                  <Icon name="share" className="text-[30px]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold leading-tight">
                    {btnWhatsapp.main}
                  </span>
                  {btnWhatsapp.sub && (
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-normal">
                      {btnWhatsapp.sub}
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Big Green Done Button */}
            <button
              type="button"
              onClick={onDone}
              className="w-full h-[76px] min-h-[56px] rounded-xl bg-primary hover:bg-primary-container active:translate-y-0.5 transition-all duration-150 flex items-center justify-center gap-space-md px-space-lg text-on-primary shadow-md cursor-pointer"
            >
              <Icon name="task_alt" className="text-[34px] leading-none" />
              <div className="flex flex-col items-start text-left">
                <span className="font-button-text text-button-text text-on-primary font-bold leading-tight">
                  {btnDone.main}
                </span>
                {btnDone.sub && (
                  <span className="font-label-sub-english text-label-sub-english text-primary-fixed leading-normal">
                    {btnDone.sub}
                  </span>
                )}
              </div>
            </button>
          </div>

          <div className="flex items-center justify-center gap-space-xs mt-space-md text-on-surface-variant">
            <Icon name="keyboard" className="text-[20px]" />
            <span className="font-label-sub-english text-sm">{t('billing_flow.enter_hint')}</span>
          </div>
        </div>
      </main>

      {/* Print Format Chooser Modal (A4 vs 80mm Thermal Receipt) */}
      {showPrintFormatPicker && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-md font-bold text-on-surface">{btnPrint.main}</h2>
              <button
                type="button"
                onClick={() => setShowPrintFormatPicker(false)}
                className="w-10 h-10 rounded-full hover:bg-surface-container-high flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handlePrint('thermal')}
              className="h-16 px-5 rounded-xl bg-primary text-on-primary font-bold text-lg flex items-center justify-between hover:bg-primary-container cursor-pointer"
            >
              <span>{t('billing_flow.print_format_thermal')}</span>
              <Icon name="receipt" className="text-2xl" />
            </button>

            <button
              type="button"
              onClick={() => handlePrint('a4')}
              className="h-16 px-5 rounded-xl bg-surface-container-high text-on-surface font-bold text-lg flex items-center justify-between hover:bg-surface-container-highest border border-outline-variant cursor-pointer"
            >
              <span>{t('billing_flow.print_format_a4')}</span>
              <Icon name="description" className="text-2xl text-primary" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden Print View rendered for @media print */}
      <BillReceiptPrintView bill={bill} items={items} format={printFormat} />
    </div>
  );
};

