import React, { useState, useEffect, useRef } from 'react';
import { db, type Medicine, type Shop, type DBUser } from '../db';
import { medicineStock } from '../logic/stock';
import { searchMedicines, formatMedicineStock } from '../logic/medicineSearch';
import { formatRupees } from '../logic/money';
import { useTranslation, tButton } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { StatusChip } from '../components/StatusChip';
import { FullscreenButton } from '../components/FullscreenButton';
import { textFieldProps } from '../logic/format';
import { useShop } from '../logic/useShop';
import { formatProductType } from '../logic/productTypes';
import { OwnerMedicineForm } from './OwnerMedicineForm';
import { OwnerMedicineImport } from './OwnerMedicineImport';

interface OwnerMedicineListProps {
  onBackToOwnerMenu?: () => void;
  onReturnHome: () => void;
  currentUser: DBUser | null;
  shop: Shop | null;
}

export const OwnerMedicineList: React.FC<OwnerMedicineListProps> = ({
  onBackToOwnerMenu,
  onReturnHome,
  currentUser,
  shop,
}) => {
  const { t } = useTranslation();
  const [editingMedicineId, setEditingMedicineId] = useState<number | 'new' | null>(null);
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const returnHomeBtn = tButton('home.return_home_btn');
  const btnImport = tButton('medicine.btn_import');
  const btnAdd = tButton('medicine.btn_add');
  const btnBack = tButton('common.btn_back');

  const { name: hookShopName, mode: hookMode, gstNo: hookGstNo } = useShop();
  const shopName = shop?.name || hookShopName || '';
  const currentMode = shop?.mode || hookMode;
  const currentGst = shop?.gstNo || hookGstNo || '';
  const modeLabel = currentMode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || t('common.role_owner');
  const userInitial = userName ? userName.charAt(0).toUpperCase() : 'O';

  const loadMedicines = async () => {
    try {
      setIsLoading(true);
      const allMeds = await db.medicines.filter((m) => m.active !== false).toArray();
      setMedicines(allMeds);

      // Fetch stock for each medicine
      const stocks: Record<number, number> = {};
      for (const m of allMeds) {
        if (m.id !== undefined) {
          stocks[m.id] = await medicineStock(m.id);
        }
      }
      setStockMap(stocks);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load medicines:', err);
      setIsLoading(false);
    }
  };

  // Load medicines & stock on mount
  useEffect(() => {
    loadMedicines();
  }, []);

  const [bannerNotice, setBannerNotice] = useState<{ title: string; subtitle: string } | null>(null);

  // Ready to type: autoFocus search input
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  if (isImportOpen) {
    return (
      <OwnerMedicineImport
        onBack={() => {
          setIsImportOpen(false);
          loadMedicines();
        }}
        onReturnHome={onReturnHome}
        onImportSuccess={() => {
          setIsImportOpen(false);
          loadMedicines();
        }}
        currentUser={currentUser}
      />
    );
  }

  if (editingMedicineId !== null) {
    return (
      <OwnerMedicineForm
        medicineId={editingMedicineId === 'new' ? undefined : editingMedicineId}
        onClose={() => {
          setEditingMedicineId(null);
          loadMedicines();
        }}
        onReturnHome={onReturnHome}
        currentUser={currentUser}
        shop={shop}
      />
    );
  }

  const filteredMedicines = searchMedicines(medicines, searchQuery);

  return (
    <div className="w-full min-h-screen bg-canvas text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      {/* 1. Fixed Top Header (Matching 38a) */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 flex items-center justify-between">
          {/* Left: Brand + Shop + Local mode */}
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xl md:text-2xl font-black tracking-tight text-primary uppercase">
              HOSPIVO
            </span>
            <div className="hidden sm:block h-6 w-[2px] bg-outline-variant" />
            <span className="hidden sm:inline text-lg md:text-xl font-bold text-on-surface">
              {shopName}
            </span>
            <StatusChip variant="local" label={modeLabel} />
          </div>

          {/* Right: Home button + User avatar */}
          <div className="flex items-center gap-4">
            <FullscreenButton className="w-10 h-10 rounded-xl bg-surface-container-lowest hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant" />

            {onBackToOwnerMenu && (
              <button
                type="button"
                onClick={onBackToOwnerMenu}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface font-bold border border-outline-variant shadow-sm cursor-pointer transition-all active:translate-y-[1px]"
              >
                <svg className="w-5 h-5 text-on-surface-variant" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                <span>{btnBack.main}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReturnHome}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary hover:bg-[#088643] text-on-primary font-bold shadow-sm cursor-pointer transition-all active:translate-y-[1px]"
            >
              <svg className="w-5 h-5 text-on-primary stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-sm font-bold leading-none">{returnHomeBtn.main}</span>
                {returnHomeBtn.sub ? <span className="text-[11px] text-emerald-100 font-normal leading-none mt-0.5">{returnHomeBtn.sub}</span> : null}
              </div>
            </button>

            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant">
              <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                {userInitial}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold leading-tight text-on-surface">{userName}</span>
                <span className="text-[11px] text-outline font-medium leading-none">{currentUser?.role === 'cashier' ? t('common.role_cashier') : t('common.role_owner')}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="w-full pt-20 pb-14 px-6 md:px-8 max-w-[1440px] mx-auto flex-1 flex flex-col justify-between">
        <div className="flex flex-col w-full flex-1">
          {/* Controls Row: Heading + Action Buttons */}
          <div className="flex flex-wrap items-center justify-between w-full min-h-[56px] gap-4 mb-4">
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-on-surface leading-tight">
                {t('medicine.list_title')}
              </h1>
              <span className="text-sm md:text-base font-medium text-outline leading-tight">
                {t('medicine.list_sub')}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Import File Button */}
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="h-14 min-h-[56px] px-5 rounded-[16px] bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-outline-variant shadow-sm flex items-center gap-3 font-bold transition-all active:translate-y-[1px] cursor-pointer"
              >
                <svg className="w-6 h-6 text-on-surface-variant" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-base font-bold leading-tight">{btnImport.main}</span>
                  {btnImport.sub ? <span className="text-xs text-outline font-medium leading-tight">{btnImport.sub}</span> : null}
                </div>
              </button>

              {/* Add Medicine Button */}
              <button
                type="button"
                onClick={() => setEditingMedicineId('new')}
                className="h-14 min-h-[56px] px-6 rounded-[16px] bg-primary hover:bg-[#088643] text-on-primary shadow-sm flex items-center gap-3 font-bold transition-all active:translate-y-[1px] cursor-pointer"
              >
                <svg className="w-6 h-6 text-on-primary stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-base font-bold text-on-primary leading-tight">{btnAdd.main}</span>
                  {btnAdd.sub ? <span className="text-xs text-emerald-100 font-medium leading-tight">{btnAdd.sub}</span> : null}
                </div>
              </button>
            </div>
          </div>

          {/* Coming Soon Notice Banner */}
          {bannerNotice && (
            <div className="w-full bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700 rounded-2xl px-6 py-3 flex items-center justify-between mb-4 animate-fadeIn">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <div className="flex flex-col text-left">
                  <span className="text-base font-bold text-amber-900 dark:text-amber-200">
                    {bannerNotice.title}
                  </span>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {bannerNotice.subtitle}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBannerNotice(null)}
                className="text-xs font-bold text-amber-800 dark:text-amber-200 hover:underline px-3 py-1 cursor-pointer"
              >
                {t('home.close_btn')}
              </button>
            </div>
          )}

          {/* Search Box: Ready to type (AutoFocus) */}
          <div className="w-full shrink-0 mb-4">
            <div className="relative w-full flex items-center">
              <svg className="w-6 h-6 absolute left-4 text-outline pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                {...textFieldProps('free', searchQuery, setSearchQuery)}
                placeholder={t('medicine.search_placeholder')}
                className="w-full h-14 min-h-[56px] pl-12 pr-4 bg-surface-container-lowest rounded-[16px] text-lg text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary border border-outline-variant shadow-sm transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('common.btn_clear').main}
                  className="absolute right-4 w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* List Area */}
          {isLoading ? (
            <div className="w-full bg-surface-container-lowest rounded-[16px] shadow-sm p-12 flex flex-col items-center justify-center border border-outline-variant">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            </div>
          ) : medicines.length === 0 ? (
            /* Empty Database State */
            <div className="w-full flex-1 flex items-center justify-center py-6">
              <EmptyState
                title={t('medicine.empty_title')}
                subtitle={t('medicine.empty_sub')}
                actionLabel={btnAdd.main}
                actionSubLabel={btnAdd.sub}
                onAction={() => setEditingMedicineId('new')}
                hintText={`Hospivo • ${shopName}`}
              />
            </div>
          ) : filteredMedicines.length === 0 ? (
            /* Search Query Returned No Results */
            <div className="w-full bg-surface-container-lowest rounded-[16px] shadow-sm border border-outline-variant p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-1">
                {t('medicine.no_results_title')}
              </h2>
              <p className="text-outline text-sm max-w-sm mb-6">
                {t('medicine.no_results_sub')}
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="h-11 px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-sm cursor-pointer transition-colors border border-outline-variant"
              >
                {t('common.btn_clear').main}
              </button>
            </div>
          ) : (
            /* Medicine Rows List (each row >= 60px) */
            <div className="w-full bg-surface-container-lowest rounded-[16px] shadow-sm border border-outline-variant flex flex-col shrink-0 overflow-hidden divide-y divide-outline-variant/30">
              {filteredMedicines.map((med) => {
                const stockUnits = (med.id !== undefined && stockMap[med.id] !== undefined) ? stockMap[med.id] : 0;
                const formattedStock = formatMedicineStock(
                  stockUnits,
                  med.unitsPerPack,
                  t('medicine.pack_unit'),
                  t('medicine.loose_unit')
                );

                return (
                  <div
                    key={med.id || med.barcode || med.name}
                    onClick={() => {
                      if (med.id) setEditingMedicineId(med.id);
                    }}
                    className="min-h-[72px] px-6 py-3.5 flex items-center justify-between hover:bg-surface-container-low transition-colors cursor-pointer active:bg-surface-container"
                  >
                    {/* Left Details */}
                    <div className="flex flex-col justify-center min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg md:text-xl font-bold text-on-surface leading-tight truncate">
                          {med.name} {med.strength}
                        </span>
                        {med.scheduleType && med.scheduleType !== 'none' && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                            {t('medicine.sch_prefix')} {med.scheduleType}
                          </span>
                        )}
                      </div>
                      <div className="text-sm md:text-base font-medium text-outline leading-tight mt-1 truncate">
                        {med.form ? `${formatProductType(med.form, t)} · ` : ''}
                        {med.salt ? `${med.salt} · ` : ''}
                        {med.company ? `${med.company} · ` : ''}
                        <span>{t('medicine.mrp_label')} {formatRupees(med.mrpPaise)}</span>
                        {med.shortCode ? ` · ${t('medicine.short_code_prefix')} ${med.shortCode}` : ''}
                        {med.shelf ? ` · ${med.shelf}` : ''}
                      </div>
                    </div>

                    {/* Right: Stock Count (packs & loose) */}
                    <div className="flex flex-col items-end text-right shrink-0">
                      <span className={`text-base md:text-lg font-bold leading-tight ${stockUnits > 0 ? 'text-primary' : 'text-error'}`}>
                        {formattedStock}
                      </span>
                      <span className="text-xs text-outline font-medium mt-0.5 leading-none">
                        {t('medicine.total_stock')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 3. Footer Ribbon (Matching 38a) */}
      <footer className="fixed bottom-0 left-0 w-full h-11 px-6 md:px-8 bg-surface-container-low border-t border-outline-variant flex items-center justify-between text-xs md:text-sm text-on-surface-variant font-medium select-none z-40">
        <div className="flex items-center gap-2 truncate">
          {shopName ? <span>{shopName}</span> : null}
          {shopName && currentGst ? <span>•</span> : null}
          {currentGst ? <span>{t('common.gstin_prefix')}: {currentGst}</span> : null}
          {(shopName || currentGst) ? <span>•</span> : null}
          <span>{t('common.saved_on_device')}</span>
        </div>
        <div className="inline-flex items-center gap-2 text-primary font-bold shrink-0">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>{t('medicine.sync_active')}</span>
        </div>
      </footer>
    </div>
  );
};
