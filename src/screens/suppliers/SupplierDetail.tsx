import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type Supplier, type Purchase, type PurchaseLine, type Medicine } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { useShop } from '../../logic/useShop';
import { formatRupees } from '../../logic/money';
import { canSeePurchasePrice } from '../../logic/roles';
import {
  getPurchasesForSupplier,
  getSupplierTotalPurchasesPaise,
  formatSupplierInvoiceDetail,
  type SupplierInvoiceDetail,
} from '../../logic/suppliers';
import { triggerFeedback } from '../../logic/feedback';
import { SupplierFormModal } from './SupplierFormModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';

interface SupplierDetailProps {
  supplierId: number;
  onBack: () => void;
  onReturnHome: () => void;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const SupplierDetail: React.FC<SupplierDetailProps> = ({
  supplierId,
  onBack,
  onReturnHome,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoiceDetail | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'purchases' | 'returns' | 'expiry_returns'>('purchases');

  const isOwnerUser = canSeePurchasePrice(currentUser);
  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || (isOwnerUser ? t('common.role_owner') : t('common.role_cashier'));

  const loadData = useCallback(async () => {
    try {
      const s = await db.suppliers.get(supplierId);
      if (s) setSupplier(s);

      const allPurchases = await db.purchases.toArray();
      const allLines = await db.purchaseLines.toArray();
      const allMeds = await db.medicines.toArray();

      setPurchases(allPurchases);
      setPurchaseLines(allLines);
      setMedicines(allMeds);
    } catch (err) {
      console.error('Failed to load supplier detail data:', err);
    }
  }, [supplierId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Supplier purchases sorted newest first
  const supplierPurchases = useMemo(() => {
    return getPurchasesForSupplier(purchases, supplierId);
  }, [purchases, supplierId]);

  // Map of purchaseId -> lines
  const linesByPurchase = useMemo(() => {
    const map = new Map<number, PurchaseLine[]>();
    for (const l of purchaseLines) {
      if (l.purchaseId) {
        const existing = map.get(l.purchaseId) || [];
        existing.push(l);
        map.set(l.purchaseId, existing);
      }
    }
    return map;
  }, [purchaseLines]);

  // Total amount in paise (for owner only)
  const totalPurchasesPaise = useMemo(() => {
    if (!isOwnerUser) return 0;
    return getSupplierTotalPurchasesPaise(purchases, purchaseLines, supplierId);
  }, [purchases, purchaseLines, supplierId, isOwnerUser]);

  const handleOpenInvoice = (purchase: Purchase) => {
    const lines = linesByPurchase.get(purchase.id || 0) || [];
    const formatted = formatSupplierInvoiceDetail(purchase, lines, medicines, currentUser);
    setSelectedInvoice(formatted);
  };

  const handleInvoiceVerifiedChanged = (newVerified: boolean) => {
    setPurchases((prev) =>
      prev.map((p) => (p.id === selectedInvoice?.purchaseId ? { ...p, verified: newVerified } : p))
    );
  };

  const handleTabClick = (tab: 'purchases' | 'returns' | 'expiry_returns') => {
    if (tab !== 'purchases') {
      triggerFeedback('error', t('home.coming_soon'), t('home.subpage_ready_next_version'));
      return;
    }
    setActiveTab(tab);
  };

  const returnHomeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('suppliers.btn_back');
  const editBtn = tButton('suppliers.btn_edit_supplier');
  const tabPurchases = tButton('suppliers.tab_purchases');
  const tabReturns = tButton('suppliers.tab_returns');
  const tabExpiryReturns = tButton('suppliers.tab_expiry_returns');

  if (!supplier) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-on-surface">
        <span className="font-body-md">Loading supplier...</span>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      {/* 1. Header (Matching 27b Stitch design) */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/40">
        <div className="h-20 w-full px-gutter flex items-center justify-between">
          {/* Left: Brand + Shop Name + Mode Pill */}
          <div className="flex items-center gap-space-lg">
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg text-primary tracking-tight font-extrabold">
                Hospivo
              </span>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                (Pharmacy POS)
              </span>
            </div>
            <div className="h-8 w-px bg-surface-container-highest" />
            <div className="flex flex-col justify-center">
              <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight font-bold">
                {shopName}
              </span>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-tight">
                {modeLabel}
              </span>
            </div>
            <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-primary-fixed text-on-primary-fixed">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label-sub-english text-label-sub-english font-bold">
                {modeLabel}
              </span>
            </div>
          </div>

          {/* Right: Home button + Light/Dark switcher + FullscreenButton + User Pill */}
          <div className="flex items-center gap-space-md sm:gap-space-lg">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-space-xs transition-all flex flex-col items-center leading-tight text-on-surface-variant hover:text-on-surface cursor-pointer rounded-lg hover:bg-surface-container"
            >
              <span className="font-title-hinglish text-title-hinglish">{returnHomeBtn.main}</span>
              {returnHomeBtn.sub && (
                <span className="font-label-sub-english text-label-sub-english">{returnHomeBtn.sub}</span>
              )}
            </button>

            {/* Light/Dark Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="flex items-center p-1 bg-surface-container-high rounded-full cursor-pointer hover:bg-surface-container-highest transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    theme === 'light'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                      : 'text-on-surface-variant'
                  }`}
                >
                  <Icon name="light_mode" className="text-[18px]" />
                </div>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    theme === 'dark'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                      : 'text-on-surface-variant'
                  }`}
                >
                  <Icon name="dark_mode" className="text-[18px]" />
                </div>
              </button>
            )}

            <FullscreenButton />

            <div className="h-8 w-px bg-surface-container-highest" />

            {/* User Pill */}
            <div className="flex items-center gap-space-sm">
              <div className="flex flex-col text-right leading-tight">
                <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                  {userName}
                </span>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                  {currentUser?.role === 'cashier' ? t('common.role_cashier') : t('common.role_owner')}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-sm">
                <Icon name="person" className="text-[18px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="w-full pt-24 pb-8 flex-1 bg-background px-gutter max-w-[1440px] mx-auto flex flex-col gap-space-md">
        {/* Top Action / Context Row */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-space-sm">
            <span className="p-2 rounded-xl bg-surface-container-high text-primary flex items-center justify-center">
              <Icon name="local_shipping" className="text-[28px]" />
            </span>
            <div className="flex flex-col">
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                {t('suppliers.detail_context_title')}
              </span>
              <span className="font-body-md text-body-md text-on-surface font-semibold">
                {t('suppliers.detail_context_sub')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-2 rounded-xl shadow-sm border border-outline-variant/60">
            <Icon name="verified" className="text-primary text-[24px]" />
            <span className="font-body-md text-body-md text-on-surface font-bold">
              {t('suppliers.network_badge')}
            </span>
          </div>
        </div>

        {/* Supplier Identity Hero Banner Card */}
        <div className="w-full bg-surface-container-lowest rounded-2xl shadow-md p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-lg border border-outline-variant/50">
          <div className="flex items-center gap-space-md">
            <div className="w-20 h-20 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary shadow-inner shrink-0">
              <Icon name="apartment" className="text-[44px]" />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-baseline gap-space-xs flex-wrap">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-extrabold">
                  {supplier.name}
                </h1>
                {supplier.address && (
                  <span className="font-label-sub-english text-label-sub-english px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-bold">
                    {supplier.address}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-space-lg mt-1.5 flex-wrap">
                {supplier.phone && (
                  <div className="flex items-center gap-space-xs text-on-surface">
                    <Icon name="call" className="text-primary text-[22px]" />
                    <span className="font-body-md text-body-md font-bold tracking-wide">
                      {supplier.phone}
                    </span>
                  </div>
                )}
                {supplier.phone && supplier.gstNo && (
                  <div className="h-4 w-2 rounded-full bg-surface-container-highest" />
                )}
                {supplier.gstNo && (
                  <div className="flex items-center gap-space-xs text-on-surface-variant font-mono">
                    <Icon name="receipt_long" className="text-[22px]" />
                    <span className="font-body-md text-body-md font-semibold tracking-wider">
                      GST: {supplier.gstNo}
                    </span>
                  </div>
                )}

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="h-10 px-4 rounded-xl bg-surface-container-high text-on-surface font-bold text-sm flex items-center gap-1.5 hover:bg-surface-container-highest active:scale-[0.98] transition-all cursor-pointer shadow-sm border border-outline-variant"
                >
                  <Icon name="edit" className="text-[18px] text-primary" />
                  <span>{editBtn.main}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Outstanding / Purchases Highlight Block */}
          <div className="flex items-center gap-space-md bg-surface-container-low p-space-md rounded-2xl shadow-sm justify-between md:justify-end min-w-[300px] border border-outline-variant/60">
            <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
              <Icon name="account_balance_wallet" className="text-[32px]" />
            </div>
            <div className="flex flex-col text-right">
              {isOwnerUser && totalPurchasesPaise > 0 ? (
                <>
                  <span className="font-headline-md text-headline-md font-extrabold text-primary leading-none">
                    {formatRupees(totalPurchasesPaise)}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold mt-1">
                    {t('suppliers.total_purchases_amount')} ({supplierPurchases.length})
                  </span>
                </>
              ) : (
                <>
                  <span className="font-headline-md text-headline-md font-extrabold text-on-surface leading-none">
                    {t('suppliers.purchases_count', { count: supplierPurchases.length })}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold mt-1">
                    {t('suppliers.total_invoices_label')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs Strip */}
        <div className="w-full flex items-center gap-space-md">
          {/* Active Tab: Kharid */}
          <button
            type="button"
            onClick={() => handleTabClick('purchases')}
            className={`flex-1 flex flex-col items-center justify-center h-16 rounded-2xl shadow-md transition-all active:translate-y-0.5 cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
              {tabPurchases.main}
            </span>
            {tabPurchases.sub && (
              <span className="font-label-sub-english text-label-sub-english text-primary-fixed leading-tight font-bold">
                {tabPurchases.sub}
              </span>
            )}
          </button>

          {/* Inactive Tab: Wapsi */}
          <button
            type="button"
            onClick={() => handleTabClick('returns')}
            className="flex-1 flex flex-col items-center justify-center h-16 rounded-2xl bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-high transition-all active:translate-y-0.5 cursor-pointer border border-outline-variant/40"
          >
            <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
              {tabReturns.main}
            </span>
            {tabReturns.sub && (
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-tight">
                {tabReturns.sub}
              </span>
            )}
          </button>

          {/* Inactive Tab: Expiry wapsi */}
          <button
            type="button"
            onClick={() => handleTabClick('expiry_returns')}
            className="flex-1 flex flex-col items-center justify-center h-16 rounded-2xl bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-high transition-all active:translate-y-0.5 cursor-pointer border border-outline-variant/40"
          >
            <span className="font-title-hinglish text-title-hinglish leading-tight font-bold">
              {tabExpiryReturns.main}
            </span>
            {tabExpiryReturns.sub && (
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-tight">
                {tabExpiryReturns.sub}
              </span>
            )}
          </button>
        </div>

        {/* Purchases Invoices List (Sorted newest first, min 76px tall) */}
        <div className="flex flex-col gap-space-sm w-full">
          {supplierPurchases.length === 0 ? (
            <div className="w-full bg-surface-container-lowest rounded-2xl p-12 text-center border border-outline-variant/60 shadow-sm flex flex-col items-center justify-center gap-2">
              <Icon name="receipt_long" className="text-[48px] text-outline" />
              <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                {t('suppliers.empty_invoices_title')}
              </h3>
              <p className="font-body-md text-on-surface-variant max-w-md">
                {t('suppliers.empty_invoices_sub')}
              </p>
            </div>
          ) : (
            supplierPurchases.map((purchase) => {
              const lines = linesByPurchase.get(purchase.id || 0) || [];
              let invoiceTotalPaise = 0;
              for (const l of lines) {
                invoiceTotalPaise += l.packs * l.purchaseRatePaise;
              }

              return (
                <div
                  key={purchase.id}
                  onClick={() => handleOpenInvoice(purchase)}
                  className="w-full min-h-[76px] bg-surface-container-lowest rounded-2xl shadow-sm p-space-md flex items-center justify-between gap-space-md hover:shadow-md transition-shadow cursor-pointer border border-outline-variant/40 hover:border-primary/40"
                >
                  {/* Left: Thumbnail & Invoice meta */}
                  <div className="flex items-center gap-space-md min-w-[280px]">
                    <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                      {purchase.invoicePhoto ? (
                        <img
                          src={purchase.invoicePhoto}
                          alt={purchase.invoiceNo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Icon name="description" className="text-[32px] text-primary" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-headline-md text-headline-md font-bold text-on-surface leading-tight">
                        {purchase.invoiceNo}
                      </span>
                      <div className="flex items-center gap-space-md text-on-surface-variant text-sm mt-0.5">
                        <div className="flex items-center gap-1">
                          <Icon name="calendar_today" className="text-[16px]" />
                          <span className="font-label-sub-english">
                            {t('suppliers.invoice_date_label')} {purchase.date}
                          </span>
                        </div>
                        <span>•</span>
                        <span className="font-label-sub-english font-medium">
                          {t('suppliers.invoice_lines_count', { count: lines.length })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Owner-only total & Verified Badge */}
                  <div className="flex items-center gap-space-lg">
                    {isOwnerUser && (
                      <div className="flex flex-col text-right">
                        <span className="font-headline-md text-headline-md font-extrabold text-primary leading-tight">
                          {formatRupees(invoiceTotalPaise)}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {t('suppliers.invoice_total_label')}
                        </span>
                      </div>
                    )}

                    {/* Verified Status Badge */}
                    {purchase.verified ? (
                      <div className="flex items-center gap-space-xs px-space-md py-2.5 rounded-xl bg-primary-fixed text-on-primary-fixed shadow-sm">
                        <Icon name="check_circle" className="text-primary text-[26px]" />
                        <span className="font-body-md text-body-md font-bold">
                          {t('suppliers.badge_verified')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-space-xs px-space-md py-2.5 rounded-xl bg-surface-container-high text-on-surface-variant border border-outline-variant/60">
                        <Icon name="check_box_outline_blank" className="text-outline text-[26px]" />
                        <span className="font-body-md text-body-md font-bold">
                          {t('suppliers.badge_unverified')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Navigation Section: Wapas Button */}
        <div className="w-full flex items-center justify-start pt-space-xs">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-space-sm h-14 px-space-lg rounded-2xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest shadow-sm active:translate-y-0.5 transition-all cursor-pointer border border-outline-variant"
          >
            <Icon name="arrow_back" className="text-[28px] text-primary" />
            <div className="flex flex-col leading-tight text-left">
              <span className="font-title-hinglish text-title-hinglish font-bold">
                {backBtn.main}
              </span>
              {backBtn.sub && (
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                  {backBtn.sub}
                </span>
              )}
            </div>
          </button>
        </div>
      </main>

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        invoiceData={selectedInvoice}
        currentUser={currentUser}
        onVerifiedChanged={handleInvoiceVerifiedChanged}
      />

      {/* Edit Supplier Modal */}
      <SupplierFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={loadData}
        initialSupplier={supplier}
        currentUser={currentUser}
      />
    </div>
  );
};
