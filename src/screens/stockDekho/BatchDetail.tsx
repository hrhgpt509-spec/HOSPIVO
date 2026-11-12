import React, { useState } from 'react';
import type { Medicine, DBUser, Shop } from '../../db';
import { useTranslation } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { canSeePurchasePrice } from '../../logic/roles';
import { formatRupees } from '../../logic/money';
import { formatMedicineStock } from '../../logic/medicineSearch';
import type { BatchStockDetail } from '../../logic/stockDekho';
import { triggerFeedback } from '../../logic/feedback';
import {
  getStockCorrectionApprovalRule,
  evaluateStockCorrectionRule,
} from '../../logic/stockCorrection';
import { StockCorrectionModal } from './StockCorrectionModal';

interface BatchDetailProps {
  medicine: Medicine;
  batches: BatchStockDetail[];
  totalStockUnits: number;
  onBack: () => void;
  onRefreshStock: () => Promise<void> | void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const BatchDetail: React.FC<BatchDetailProps> = ({
  medicine,
  batches,
  totalStockUnits,
  onBack,
  onRefreshStock,
  currentUser,
  shop,
  theme,
  onToggleTheme,
}) => {
  const { t, shouldShowSub } = useTranslation();
  const { name: hookShopName } = useShop();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [blockedErrorMsg, setBlockedErrorMsg] = useState<string | null>(null);
  const [correctingBatch, setCorrectingBatch] = useState<BatchStockDetail | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const handleOpenStockCorrection = async (batch: BatchStockDetail) => {
    setBlockedErrorMsg(null);
    const rule = await getStockCorrectionApprovalRule();
    const evaluation = evaluateStockCorrectionRule(rule);

    if (evaluation.blocked) {
      const title = t('stock_dekho.correction_blocked_title');
      const sub = t('stock_dekho.correction_blocked_sub');
      setBlockedErrorMsg(title);
      triggerFeedback('error', title, sub);
      return;
    }

    setCorrectingBatch(batch);
  };

  const showPurchasePrice = canSeePurchasePrice(currentUser);
  const shopName = hookShopName || shop?.name || '';
  const userRole = currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier');
  const userName = currentUser?.name || userRole;

  const formattedTotalStock = formatMedicineStock(
    totalStockUnits,
    medicine.unitsPerPack || 1,
    t('medicine.packs_unit'),
    t('medicine.loose_unit')
  );

  // Find earliest valid (non-expired) batch for FIFO advice
  const earliestValidBatch = [...batches]
    .filter((b) => !b.isExpired && b.qtyUnits > 0)
    .sort((a, b) => a.expiry.localeCompare(b.expiry))[0];

  const wapasBtn = {
    main: t('stock_dekho.btn_wapas.main'),
    sub: t('stock_dekho.btn_wapas.sub'),
  };
  const photoBtn = {
    main: t('stock_dekho.btn_view_photo.main'),
    sub: t('stock_dekho.btn_view_photo.sub'),
  };
  const adjustBtn = {
    main: t('stock_dekho.btn_adjust_stock.main'),
    sub: t('stock_dekho.btn_adjust_stock.sub'),
  };

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-300">
          <div className="bg-inverse-surface text-inverse-on-surface px-space-lg py-space-sm rounded-2xl shadow-xl flex items-center gap-space-md">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
              <Icon name="info" className="text-[18px]" />
            </div>
            <span className="font-title-hinglish text-title-hinglish font-bold">
              {toastMessage}
            </span>
          </div>
        </div>
      )}

      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30">
        <div className="h-20 w-full max-w-[1440px] mx-auto px-gutter flex items-center justify-between">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-sm cursor-pointer" onClick={onBack}>
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <Icon name="local_pharmacy" className="text-on-primary text-[24px]" />
              </div>
              <span className="font-headline-md text-headline-md font-bold tracking-tight text-primary">
                {t('common.app_name')}
              </span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-outline-variant" />
            <div className="hidden sm:flex flex-col">
              <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight">
                {shopName}
              </span>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none">
                {t('common.counter_pos')}
              </span>
            </div>
            <div className="hidden md:inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container border border-outline-variant">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface font-semibold">
                {t('common.local_mode')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-xs sm:gap-space-md">
            <button
              onClick={onBack}
              className="px-3 sm:px-space-md py-2 transition-all bg-surface-container hover:bg-surface-container-high text-on-surface font-bold rounded-lg shadow-sm flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <Icon name="arrow_back" className="text-[20px]" />
              <span>{wapasBtn.main}</span>
            </button>

            <button
              onClick={onToggleTheme}
              aria-label={t('common.toggle_theme')}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all cursor-pointer"
              type="button"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
            </button>

            <FullscreenButton />

            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="hidden sm:flex flex-col text-right">
                <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight">
                  {userName}
                </span>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none">
                  {userRole}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Icon name="person" className="text-on-primary text-[18px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full pt-20 bg-surface flex-1">
        <div className="max-w-[1440px] mx-auto px-gutter py-space-sm flex flex-col gap-space-md select-none">
          {/* Top Medicine Header Card */}
          <div className="w-full bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-outline-variant/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-space-lg min-w-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shadow-sm shrink-0">
                <Icon name="medication" className="text-[36px] sm:text-[44px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex flex-wrap items-center gap-space-md">
                  <h1 className="font-display-total-mobile text-2xl sm:text-display-total-mobile text-on-surface font-extrabold tracking-tight truncate">
                    {medicine.name}
                  </h1>
                  {medicine.strength && (
                    <span className="px-space-md py-1 rounded-full bg-surface-container font-headline-md text-base sm:text-headline-md text-on-surface-variant font-medium">
                      {medicine.strength}
                    </span>
                  )}
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1 truncate">
                  {medicine.salt || t('stock_dekho.batch_detail_sub')}
                </p>
              </div>
            </div>

            {/* Prominent Total Stock Card */}
            <div className="bg-primary-fixed/30 px-space-xl py-space-md rounded-xl flex items-center gap-space-md shadow-sm border border-primary/20">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm shrink-0">
                <Icon name="inventory_2" className="text-[28px] sm:text-[32px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                  {t('stock_dekho.total_stock_label')}
                </span>
                <span className="font-headline-lg text-headline-lg text-primary font-extrabold">
                  {t('stock_dekho.total_stock_value', { stock: formattedTotalStock })}
                </span>
              </div>
            </div>
          </div>

          {/* Center Split: Batch Table & Shelf Location Card */}
          {blockedErrorMsg && (
            <div className="w-full bg-error-container border border-error text-error rounded-xl px-space-md py-space-sm font-bold flex items-center justify-between gap-3">
              <div className="flex items-center gap-space-xs">
                <Icon name="block" className="text-[22px] shrink-0" />
                <span>{blockedErrorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setBlockedErrorMsg(null)}
                aria-label={t('common.btn_clear.main')}
                className="p-1 rounded-lg hover:bg-error/10 cursor-pointer"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
          )}

          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            {/* Batch Table Container (Left 8 Cols) */}
            <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-outline-variant/30 flex flex-col justify-between">
              <div className="flex flex-col w-full">
                {/* Table Column Headers */}
                <div className="hidden md:grid grid-cols-12 px-space-md py-space-sm bg-surface-container-low rounded-lg text-on-surface-variant font-title-hinglish text-title-hinglish">
                  <div className="col-span-3 flex items-center gap-space-xs">
                    <Icon name="tag" className="text-[20px]" />
                    <span>{t('stock_dekho.table_head_batch')}</span>
                  </div>
                  <div className="col-span-3 flex items-center gap-space-xs">
                    <Icon name="calendar_today" className="text-[20px]" />
                    <span>{t('stock_dekho.table_head_expiry')}</span>
                  </div>
                  <div className="col-span-3 text-right flex items-center justify-end gap-space-xs">
                    <Icon name="format_list_numbered" className="text-[20px]" />
                    <span>{t('stock_dekho.table_head_qty')}</span>
                  </div>
                  <div className="col-span-3 text-right flex items-center justify-end gap-space-xs">
                    <Icon name="tune" className="text-[20px]" />
                    <span>{adjustBtn.main}</span>
                  </div>
                  {showPurchasePrice && (
                    <div className="col-span-12 mt-1 text-right text-xs text-on-surface-variant">
                      <span>{t('stock_dekho.owner_rate_note')}</span>
                    </div>
                  )}
                </div>

                {/* Batch Rows */}
                <div className="flex flex-col gap-space-sm mt-space-sm">
                  {batches.length === 0 ? (
                    <div className="p-8 text-center text-outline">
                      {t('stock_dekho.empty_title')}
                    </div>
                  ) : (
                    batches.map((batch) => {
                      const formattedBatchStock = formatMedicineStock(
                        batch.qtyUnits,
                        medicine.unitsPerPack || 1,
                        t('medicine.packs_unit'),
                        t('medicine.loose_unit')
                      );

                      // Expiry styling by bucket: 30 red, 60 orange, 90 yellow, expired black
                      let expiryBadge = null;
                      let rowBg = 'bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/20';
                      let expiryTextClass = 'text-on-surface';

                      if (batch.isExpired) {
                        rowBg = 'bg-gray-950 text-white dark:bg-black border border-red-500/60';
                        expiryTextClass = 'text-red-300 font-bold';
                        expiryBadge = (
                          <span className="px-2 py-0.5 rounded bg-black text-red-400 font-bold text-xs uppercase border border-red-500/60">
                            {t('stock_dekho.expired_cannot_sell')}
                          </span>
                        );
                      } else if (batch.expiryBucket === '30') {
                        rowBg = 'bg-error-container/30 border border-error/40';
                        expiryTextClass = 'text-error font-bold';
                        expiryBadge = (
                          <span className="px-2 py-0.5 rounded bg-error text-on-error font-bold text-xs">
                            {t('stock_dekho.badge_near_expiry')}
                          </span>
                        );
                      } else if (batch.expiryBucket === '60') {
                        rowBg = 'bg-tertiary-container/20 border border-tertiary/40';
                        expiryTextClass = 'text-tertiary font-bold';
                        expiryBadge = (
                          <span className="px-2 py-0.5 rounded bg-tertiary text-on-tertiary font-bold text-xs">
                            {t('stock_dekho.badge_near_expiry')}
                          </span>
                        );
                      } else if (batch.expiryBucket === '90') {
                        rowBg = 'bg-yellow-500/15 border border-yellow-500/40';
                        expiryTextClass = 'text-yellow-700 dark:text-yellow-300 font-bold';
                        expiryBadge = (
                          <span className="px-2 py-0.5 rounded bg-yellow-500 text-black font-bold text-xs">
                            {t('stock_dekho.badge_expiry_90d')}
                          </span>
                        );
                      }

                      return (
                        <div
                          key={batch.id || batch.batchNo}
                          className={`min-h-[64px] p-space-sm sm:px-space-md rounded-lg shadow-sm transition-colors flex flex-col md:grid md:grid-cols-12 md:items-center gap-2 sm:gap-space-sm ${rowBg}`}
                        >
                          <div className="md:col-span-3 flex items-center gap-space-xs flex-wrap min-w-0">
                            <span className="font-title-hinglish text-base sm:text-title-hinglish font-bold truncate">
                              {batch.batchNo}
                            </span>
                            {expiryBadge}
                            {(batch.shelf || medicine.shelf) && (
                              <span
                                className={`text-xs font-medium ${
                                  batch.isExpired ? 'text-gray-300' : 'text-outline'
                                }`}
                              >
                                ({batch.shelf || medicine.shelf})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between md:contents gap-2">
                            <div className={`md:col-span-3 flex items-center gap-space-xs min-w-0 ${expiryTextClass}`}>
                              <Icon
                                name={
                                  batch.isExpired
                                    ? 'cancel'
                                    : batch.expiryBucket !== 'none'
                                    ? 'warning'
                                    : 'check_circle'
                                }
                                className="text-[18px] sm:text-[20px] shrink-0"
                              />
                              <span className="font-body-lg text-sm sm:text-body-lg truncate">
                                {batch.expiry}
                              </span>
                            </div>

                            <div className="md:col-span-3 text-right flex flex-col justify-center min-w-0">
                              <span className="font-headline-md text-base sm:text-headline-md font-extrabold truncate">
                                {formattedBatchStock}
                              </span>
                              {/* Strictly render purchase rate only if showPurchasePrice is true */}
                              {showPurchasePrice && batch.purchaseRatePaise != null && (
                                <span
                                  className={`text-xs font-bold ${
                                    batch.isExpired ? 'text-green-300' : 'text-primary'
                                  }`}
                                >
                                  {formatRupees(batch.purchaseRatePaise)} {t('stock_dekho.per_pack_suffix')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="md:col-span-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenStockCorrection(batch)}
                              className="w-full md:w-auto min-h-[56px] px-space-md py-1.5 rounded-xl bg-tertiary-fixed hover:bg-tertiary-fixed-dim text-on-tertiary-fixed border border-tertiary/30 shadow-xs active:translate-y-0.5 transition-all flex items-center justify-center gap-space-xs cursor-pointer"
                            >
                              <Icon name="tune" className="text-[20px] text-tertiary shrink-0" />
                              <div className="flex flex-col text-left leading-tight">
                                <span className="font-title-hinglish text-sm sm:text-base font-bold leading-tight">
                                  {adjustBtn.main}
                                </span>
                                {shouldShowSub(adjustBtn.main, adjustBtn.sub) && (
                                  <span className="font-label-sub-english text-[11px] text-on-tertiary-fixed-variant font-bold leading-tight">
                                    {adjustBtn.sub}
                                  </span>
                                )}
                              </div>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quick Guidance Prompt */}
              <div className="w-full bg-surface-container-low rounded-lg p-space-md flex flex-wrap items-center justify-between gap-2 mt-space-md">
                <div className="flex items-center gap-space-sm">
                  <Icon name="tips_and_updates" className="text-primary text-[28px]" />
                  <span className="font-body-md text-body-md text-on-surface">
                    {earliestValidBatch
                      ? t('stock_dekho.fifo_guidance', { batch: earliestValidBatch.batchNo })
                      : t('stock_dekho.batch_detail_sub')}
                  </span>
                </div>
                <span className="font-title-hinglish text-title-hinglish text-primary font-bold">
                  {t('stock_dekho.total_stock_value', { stock: formattedTotalStock })}
                </span>
              </div>
            </div>

            {/* Shelf Location Card (Right 4 Cols) */}
            <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-outline-variant/30 flex flex-col justify-between gap-space-md">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-space-md">
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                    {t('stock_dekho.store_location_title')}
                  </span>
                  {medicine.shelf && (
                    <span className="px-space-sm py-1 rounded bg-secondary-container/20 text-secondary font-label-sub-english text-label-sub-english font-bold">
                      {medicine.shelf}
                    </span>
                  )}
                </div>

                {/* Shelf High-Contrast Block */}
                <div className="bg-surface-container-low rounded-xl p-space-lg flex flex-col items-center justify-center text-center shadow-sm">
                  <div className="w-20 h-20 rounded-full bg-secondary-container/30 text-secondary flex items-center justify-center mb-space-sm shadow-sm">
                    <Icon name="grid_view" className="text-[48px]" />
                  </div>
                  <span className="font-display-total-mobile text-display-total-mobile text-on-surface font-extrabold tracking-tight">
                    {medicine.shelf
                      ? t('stock_dekho.shelf_location_text', { shelf: medicine.shelf })
                      : t('stock_dekho.no_shelf_assigned')}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface-variant mt-1">
                    {t('stock_dekho.shelf_details_note')}
                  </span>
                </div>
              </div>

              {/* Photo Dekho Button - Prompt: stays locked with "Jald aa raha hai" */}
              <button
                onClick={() => showToast(t('stock_dekho.toast_coming_soon'))}
                className="w-full min-h-[56px] py-space-sm px-space-md rounded-[16px] bg-secondary hover:bg-secondary-container text-on-secondary shadow-md active:translate-y-0.5 transition-all flex items-center justify-center gap-space-md cursor-pointer"
                type="button"
              >
                <Icon name="photo_camera" className="text-[32px]" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish text-title-hinglish font-bold leading-tight">
                    {photoBtn.main}
                  </span>
                  {shouldShowSub(photoBtn.main, photoBtn.sub) && (
                    <span className="font-label-sub-english text-label-sub-english opacity-90 leading-tight">
                      {photoBtn.sub}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="w-full bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-wrap items-center justify-between gap-4 mt-space-sm">
            {/* Left: Wapas Button */}
            <button
              className="min-h-[56px] min-w-[200px] px-space-lg py-space-sm rounded-[16px] bg-surface-container hover:bg-surface-container-high text-on-surface shadow-sm active:translate-y-0.5 transition-all flex items-center gap-space-md cursor-pointer"
              onClick={onBack}
              type="button"
            >
              <Icon name="arrow_back" className="text-[32px] text-on-surface-variant" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-title-hinglish text-title-hinglish font-bold leading-tight">
                  {wapasBtn.main}
                </span>
                {shouldShowSub(wapasBtn.main, wapasBtn.sub) && (
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-tight">
                    {wapasBtn.sub}
                  </span>
                )}
              </div>
            </button>

            {/* Center Audit Metadata */}
            <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sub-english text-label-sub-english">
              <Icon name="verified" className="text-[20px] text-primary" />
              <span>{t('stock_dekho.audit_verified_info')}</span>
            </div>
          </div>
        </div>
      </main>

      {correctingBatch && (
        <StockCorrectionModal
          medicine={medicine}
          batch={correctingBatch}
          currentUser={currentUser}
          onClose={() => setCorrectingBatch(null)}
          onCompleted={onRefreshStock}
        />
      )}
    </div>
  );
};
