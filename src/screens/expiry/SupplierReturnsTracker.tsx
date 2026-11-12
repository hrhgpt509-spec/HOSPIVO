import React, { useState, useMemo } from 'react';
import type { DBUser, Shop, SupplierReturnStatus } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { EmptyState } from '../../components/EmptyState';
import { triggerFeedback } from '../../logic/feedback';
import { formatMedicineStock } from '../../logic/medicineSearch';
import {
  updateSupplierReturnStatus,
  type SupplierReturnView,
} from '../../logic/expiry';

interface SupplierReturnsTrackerProps {
  returns: SupplierReturnView[];
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onReturnHome: () => void;
  onBack: () => void;
  onUpdated: () => void;
}

const STATUS_ORDER: SupplierReturnStatus[] = [
  'pending',
  'sent',
  'credit_received',
  'rejected',
];

export const SupplierReturnsTracker: React.FC<SupplierReturnsTrackerProps> = ({
  returns,
  currentUser,
  theme = 'light',
  onToggleTheme,
  onReturnHome,
  onBack,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [statusFilter, setStatusFilter] = useState<'all' | SupplierReturnStatus>('all');
  const [editingReturn, setEditingReturn] = useState<SupplierReturnView | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  const filteredReturns = useMemo(() => {
    if (statusFilter === 'all') return returns;
    return returns.filter((r) => r.status === statusFilter);
  }, [returns, statusFilter]);

  const statusMeta = (status: SupplierReturnStatus) => {
    switch (status) {
      case 'sent':
        return {
          label: t('expiry.status_sent'),
          icon: 'local_shipping',
          iconClass: 'text-secondary',
          pillClass: 'bg-secondary-fixed text-on-secondary-fixed-variant',
        };
      case 'credit_received':
        return {
          label: t('expiry.status_credit_received'),
          icon: 'verified',
          iconClass: 'text-primary',
          pillClass: 'bg-primary-fixed text-on-primary-fixed-variant',
        };
      case 'rejected':
        return {
          label: t('expiry.status_rejected'),
          icon: 'cancel',
          iconClass: 'text-error',
          pillClass: 'bg-error-container text-on-error-container',
        };
      case 'pending':
      default:
        return {
          label: t('expiry.status_pending'),
          icon: 'inventory_2',
          iconClass: 'text-outline',
          pillClass: 'bg-surface-container-highest text-on-surface-variant',
        };
    }
  };

  const handleSelectStatus = async (newStatus: SupplierReturnStatus) => {
    if (!editingReturn?.id || isUpdating) return;
    try {
      setIsUpdating(true);
      const actorName = currentUser?.name || currentUser?.role || 'User';
      await updateSupplierReturnStatus({
        returnId: editingReturn.id,
        status: newStatus,
        actorName: String(actorName),
      });
      setEditingReturn(null);
      triggerFeedback('success', t('expiry.toast_status_updated'));
      onUpdated();
    } catch (err: any) {
      triggerFeedback('error', err?.message || t('errors.generic_error'));
    } finally {
      setIsUpdating(false);
    }
  };

  const homeBtn = tButton('home.return_home_btn');
  const updateBtn = tButton('expiry.btn_update_status');
  const backBtn = tButton('suppliers.btn_back');

  return (
    <div className="w-full min-h-screen bg-background font-body-md text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      {/* Top Header */}
      <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg min-w-0">
            <div className="flex items-center gap-space-sm shrink-0">
              <div className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container shadow-sm">
                <Icon name="local_pharmacy" className="text-[26px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-md text-headline-md font-bold tracking-tight text-primary leading-none">
                  HOSPIVO
                </span>
                <span className="text-xs text-on-surface-variant font-medium">
                  {t('expiry.page_title')}
                </span>
              </div>
            </div>

            {shopName && (
              <>
                <div className="hidden md:block w-px h-10 bg-outline-variant" />
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                    {shopName}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                    <span>{modeLabel}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="home" className="text-[20px]" />
              <div className="flex flex-col leading-tight text-left">
                <span className="text-sm sm:text-base font-bold">{homeBtn.main}</span>
                {homeBtn.sub && (
                  <span className="text-[11px] opacity-85 hidden sm:inline">{homeBtn.sub}</span>
                )}
              </div>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-all cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-2xl" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-all cursor-pointer" />

            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="font-title-hinglish text-sm font-bold text-on-surface">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content (26c_Expiry_SupplierReturns.html) */}
      <main className="w-full pt-20 flex-1 px-gutter py-space-lg">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto min-h-[calc(100vh-140px)] justify-between gap-space-md">
          <div className="flex flex-col gap-space-md">
            {/* Title + Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-baseline gap-space-sm flex-wrap">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
                    {t('expiry.tracker_title')}
                  </h1>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                    {t('expiry.tracker_sub')}
                  </span>
                </div>
                <div className="w-16 h-1 bg-primary rounded-full" />
              </div>

              {/* Filter Chips */}
              <div className="flex flex-wrap gap-2">
                {(['all', ...STATUS_ORDER] as const).map((st) => {
                  const active = statusFilter === st;
                  const label =
                    st === 'all'
                      ? t('expiry.tracker_all_statuses')
                      : statusMeta(st).label;
                  const count =
                    st === 'all'
                      ? returns.length
                      : returns.filter((r) => r.status === st).length;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`h-12 px-4 rounded-xl font-bold text-sm flex items-center gap-1.5 cursor-pointer transition-all ${
                        active
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-outline-variant/40'
                      }`}
                    >
                      <span>{label}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                          active
                            ? 'bg-on-primary/20 text-on-primary'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Return Records List */}
            {filteredReturns.length === 0 ? (
              <div className="py-10">
                <EmptyState
                  title={t('expiry.tracker_empty_title')}
                  subtitle={t('expiry.tracker_empty_sub')}
                  icon="assignment_return"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {filteredReturns.map((rec) => {
                  const meta = statusMeta(rec.status);
                  return (
                    <div
                      key={rec.id}
                      className="min-h-[84px] px-4 sm:px-space-lg py-3 bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-outline-variant/30"
                    >
                      <div className="flex items-center gap-space-md min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                          <Icon name={meta.icon} className={`text-[28px] ${meta.iconClass}`} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                            {rec.medicineName}
                          </span>
                          <span className="font-label-sub-english text-sm sm:text-base text-on-surface-variant truncate">
                            {rec.supplierName} · {t('expiry.batch_prefix')} {rec.batchNo} ·{' '}
                            {t('expiry.exp_prefix')} {rec.expiryMonthYear}
                          </span>
                          {rec.note && (
                            <span className="text-xs text-on-surface-variant italic truncate mt-0.5">
                              {rec.note}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-3 sm:gap-space-lg shrink-0">
                        <div className="flex flex-col items-start sm:items-center min-w-[90px]">
                          <span className="font-title-hinglish text-lg sm:text-xl text-on-surface font-bold">
                            {formatMedicineStock(
                              rec.qtyUnits,
                              rec.unitsPerPack,
                              t('medicine.packs_unit'),
                              t('medicine.loose_unit')
                            )}
                          </span>
                          <span className="text-xs text-on-surface-variant">
                            {t('expiry.tracker_qty_label')}
                          </span>
                        </div>

                        <div
                          className={`px-space-md py-2 rounded-xl font-bold text-sm min-w-[125px] text-center ${meta.pillClass}`}
                        >
                          {meta.label}
                        </div>

                        <button
                          type="button"
                          onClick={() => setEditingReturn(rec)}
                          className="h-14 min-h-[56px] px-space-md bg-surface-container hover:bg-surface-container-high active:translate-y-0.5 text-on-surface rounded-2xl flex items-center gap-space-sm transition-all shadow-sm cursor-pointer"
                        >
                          <Icon name="sync" className="text-[26px] text-primary" />
                          <div className="flex flex-col items-start leading-none text-left">
                            <span className="font-title-hinglish text-base sm:text-lg text-on-surface font-bold">
                              {updateBtn.main}
                            </span>
                            {updateBtn.sub && (
                              <span className="text-xs text-on-surface-variant font-medium pt-0.5">
                                {updateBtn.sub}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Bar: Back Button Left */}
          <div className="pt-space-md pb-space-xs flex items-center justify-start">
            <button
              type="button"
              onClick={onBack}
              className="h-14 min-h-[56px] px-space-lg bg-surface-container-lowest hover:bg-surface-container active:translate-y-0.5 text-on-surface rounded-2xl flex items-center gap-space-sm transition-all shadow-sm border border-outline-variant/40 cursor-pointer"
            >
              <Icon name="arrow_back" className="text-[28px] text-primary" />
              <div className="flex flex-col items-start leading-none text-left">
                <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                  {backBtn.main}
                </span>
                {backBtn.sub && (
                  <span className="text-xs text-on-surface-variant font-medium pt-0.5">
                    {backBtn.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
      </main>

      {/* Status Picker Modal */}
      {editingReturn && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#0f172a]/65 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0">
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  {t('expiry.modal_status_title')}
                </h2>
                <p className="text-sm text-on-surface-variant truncate">
                  {editingReturn.medicineName} · {editingReturn.supplierName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReturn(null)}
                className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer shrink-0"
              >
                <Icon name="close" className="text-2xl" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {STATUS_ORDER.map((st) => {
                const meta = statusMeta(st);
                const isCurrent = editingReturn.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleSelectStatus(st)}
                    className={`min-h-[56px] px-4 rounded-xl flex items-center justify-between font-bold text-base transition-all cursor-pointer border-2 ${
                      isCurrent
                        ? 'border-primary bg-primary-fixed/30 text-on-surface'
                        : 'border-outline-variant/40 bg-surface-container-low hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon name={meta.icon} className={`text-2xl ${meta.iconClass}`} />
                      <span>{meta.label}</span>
                    </div>
                    {isCurrent && <Icon name="check_circle" className="text-2xl text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
