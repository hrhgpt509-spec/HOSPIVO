import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type Supplier, type Purchase } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { EmptyState } from '../../components/EmptyState';
import { useShop } from '../../logic/useShop';
import { textFieldProps } from '../../logic/format';
import { filterSuppliers, getSupplierPurchaseCount } from '../../logic/suppliers';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierDetail } from './SupplierDetail';

interface SuppliersListProps {
  onReturnHome: () => void;
  onBackToOwnerMenu?: () => void;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const SuppliersList: React.FC<SuppliersListProps> = ({
  onReturnHome,
  onBackToOwnerMenu,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const isOwner = currentUser?.role === 'owner';
  const userName = currentUser?.name || (isOwner ? t('common.role_owner') : t('common.role_cashier'));

  const loadData = useCallback(async () => {
    try {
      const allSuppliers = await db.suppliers.toArray();
      const allPurchases = await db.purchases.toArray();
      setSuppliers(allSuppliers);
      setPurchases(allPurchases);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter suppliers by search query
  const filteredSuppliers = useMemo(() => {
    return filterSuppliers(suppliers, searchQuery);
  }, [suppliers, searchQuery]);

  // Map supplierId -> purchase count
  const purchaseCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of suppliers) {
      if (s.id) {
        map.set(s.id, getSupplierPurchaseCount(purchases, s.id));
      }
    }
    return map;
  }, [suppliers, purchases]);

  const returnHomeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('suppliers.btn_back');
  const newSupplierBtn = tButton('suppliers.btn_new_supplier');

  // If a supplier is selected, show SupplierDetail (27b)
  if (selectedSupplierId !== null) {
    return (
      <SupplierDetail
        supplierId={selectedSupplierId}
        onBack={() => {
          setSelectedSupplierId(null);
          loadData();
        }}
        onReturnHome={onReturnHome}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    );
  }

  const handleBack = () => {
    if (onBackToOwnerMenu) {
      onBackToOwnerMenu();
    } else {
      onReturnHome();
    }
  };

  return (
    <div className="w-full min-h-screen bg-background text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      {/* 1. Header (Matching 27a Stitch design) */}
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
      <main className="w-full pt-24 pb-8 flex-1 bg-background px-gutter max-w-[1440px] mx-auto flex flex-col justify-between">
        <div className="flex flex-col w-full gap-space-md">
          {/* Header Area */}
          <div className="flex items-center justify-between w-full flex-wrap gap-4 mt-2">
            <div className="flex items-baseline gap-space-sm">
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
                {t('suppliers.page_title')}
              </h1>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                {t('suppliers.page_sub')}
              </span>
            </div>

            {/* Action Button: Naya Supplier */}
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="h-16 px-space-lg rounded-[16px] bg-primary text-on-primary flex items-center gap-space-sm shadow-md hover:bg-primary-container active:scale-[0.99] transition-all cursor-pointer"
            >
              <Icon name="person_add" className="text-[28px] leading-none" />
              <div className="flex flex-col items-start leading-tight">
                <span className="font-title-hinglish text-title-hinglish font-bold">
                  {newSupplierBtn.main}
                </span>
                {newSupplierBtn.sub && (
                  <span className="font-label-sub-english text-label-sub-english text-primary-fixed">
                    {newSupplierBtn.sub}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Search Box (kind 'free') */}
          <div className="w-full relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant">
              <Icon name="search" className="text-[24px]" />
            </div>
            <input
              {...textFieldProps('free', searchQuery, setSearchQuery)}
              type="text"
              placeholder={t('suppliers.search_placeholder')}
              className="w-full h-14 pl-12 pr-12 rounded-[16px] bg-surface-container-lowest border border-outline-variant text-on-surface text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            )}
          </div>

          {/* Suppliers List */}
          <div className="flex flex-col w-full gap-space-sm">
            {filteredSuppliers.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  title={t('suppliers.empty_title')}
                  subtitle={t('suppliers.empty_sub')}
                  actionLabel={newSupplierBtn.main}
                  actionSubLabel={newSupplierBtn.sub}
                  onAction={() => setIsAddModalOpen(true)}
                  hintText=""
                />
              </div>
            ) : (
              filteredSuppliers.map((supplier) => {
                const count = purchaseCounts.get(supplier.id || 0) || 0;
                return (
                  <div
                    key={supplier.id}
                    onClick={() => supplier.id && setSelectedSupplierId(supplier.id)}
                    className="w-full min-h-[76px] py-space-sm px-space-lg bg-surface-container-lowest rounded-[16px] shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow border border-outline-variant/40 hover:border-primary/40"
                  >
                    {/* Left: Shipping icon & details */}
                    <div className="flex items-center gap-space-md">
                      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary shrink-0">
                        <Icon name="local_shipping" className="text-[26px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-title-hinglish text-title-hinglish font-bold text-on-surface">
                          {supplier.name}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {supplier.address || t('suppliers.detail_context_title')}
                        </span>
                      </div>
                    </div>

                    {/* Right: Phone, GST badge, and Purchase count */}
                    <div className="flex items-center gap-space-lg sm:gap-space-xl flex-wrap justify-end">
                      {supplier.phone && (
                        <div className="flex items-center gap-space-xs text-on-surface">
                          <Icon name="call" className="text-primary text-[22px]" />
                          <span className="font-body-md text-body-md font-medium">
                            {supplier.phone}
                          </span>
                        </div>
                      )}

                      {supplier.gstNo && (
                        <div className="flex items-center gap-space-xs text-on-surface-variant bg-surface-container px-space-sm py-1 rounded-[8px] font-mono">
                          <span className="font-label-sub-english text-label-sub-english font-bold">
                            {t('suppliers.label_gst')}
                          </span>
                          <span className="font-label-sub-english text-label-sub-english font-bold text-on-surface">
                            {supplier.gstNo}
                          </span>
                        </div>
                      )}

                      {/* Total Purchases Count */}
                      <div className="flex flex-col items-end min-w-[140px]">
                        <span className="font-headline-md text-headline-md font-bold text-primary">
                          {count === 1
                            ? t('suppliers.purchases_count_singular')
                            : t('suppliers.purchases_count', { count })}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {t('suppliers.total_invoices_label')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom Navigation / Footer Action */}
        <div className="flex items-center justify-start w-full pt-space-md">
          <button
            type="button"
            onClick={handleBack}
            className="h-14 px-space-lg rounded-[16px] bg-surface-container-lowest text-on-surface flex items-center gap-space-sm shadow-sm hover:bg-surface-container active:scale-[0.99] transition-all cursor-pointer border border-outline-variant"
          >
            <Icon name="arrow_back" className="text-[28px] text-primary leading-none" />
            <div className="flex flex-col items-start leading-tight">
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

      {/* New Supplier Modal */}
      <SupplierFormModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={loadData}
        currentUser={currentUser}
      />
    </div>
  );
};

