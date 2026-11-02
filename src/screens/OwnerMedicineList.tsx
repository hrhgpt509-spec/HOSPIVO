import React, { useState, useEffect, useRef } from 'react';
import { db, type Medicine, type Shop, type DBUser } from '../db';
import { medicineStock } from '../logic/stock';
import { searchMedicines, formatMedicineStock } from '../logic/medicineSearch';
import { useTranslation, tButton } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { StatusChip } from '../components/StatusChip';
import { OwnerMedicineForm } from './OwnerMedicineForm';

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
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const returnHomeBtn = tButton('home.return_home_btn');
  const btnImport = tButton('medicine.btn_import');
  const btnAdd = tButton('medicine.btn_add');
  const btnBack = tButton('common.btn_back');

  const shopName = shop?.name || 'Shree Medical Store';
  const modeLabel = shop?.mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || 'Owner';
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

  const handleActionComingSoon = () => {
    setBannerNotice({
      title: t('home.coming_soon'),
      subtitle: t('home.subpage_ready_next_version'),
    });
  };

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
    <div className="w-full min-h-screen bg-[#F1FCF6] dark:bg-[#0f1713] text-[#141E1A] dark:text-gray-100 flex flex-col justify-between antialiased select-none transition-colors">
      {/* 1. Fixed Top Header (Matching 38a) */}
      <header className="fixed top-0 left-0 w-full z-50 bg-[#F1FCF6]/95 dark:bg-gray-900/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-200/60 dark:border-gray-800">
        <div className="h-16 w-full px-6 md:px-8 flex items-center justify-between">
          {/* Left: Brand + Shop + Local mode */}
          <div className="flex items-center gap-4">
            <span className="text-xl md:text-2xl font-black tracking-tight text-[#006B33] dark:text-[#72dc8e] uppercase">
              HOSPIVO
            </span>
            <div className="h-6 w-[2px] bg-slate-300 dark:bg-gray-700" />
            <span className="text-lg md:text-xl font-bold text-slate-800 dark:text-gray-100">
              {shopName}
            </span>
            <StatusChip variant="local" label={modeLabel} />
          </div>

          {/* Right: Home button + User avatar */}
          <div className="flex items-center gap-4">
            {onBackToOwnerMenu && (
              <button
                type="button"
                onClick={onBackToOwnerMenu}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-200 font-bold border border-slate-200 dark:border-gray-700 shadow-sm cursor-pointer transition-all active:translate-y-[1px]"
              >
                <svg className="w-5 h-5 text-slate-600 dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                <span>{btnBack.main}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReturnHome}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#006B33] hover:bg-[#088643] text-white font-bold shadow-sm cursor-pointer transition-all active:translate-y-[1px]"
            >
              <svg className="w-5 h-5 text-white stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-sm font-bold leading-none">{returnHomeBtn.main}</span>
                {returnHomeBtn.sub ? <span className="text-[11px] text-emerald-100 font-normal leading-none mt-0.5">{returnHomeBtn.sub}</span> : null}
              </div>
            </button>

            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
              <div className="w-8 h-8 rounded-full bg-[#006B33] text-white flex items-center justify-center font-bold text-sm">
                {userInitial}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold leading-tight text-slate-800 dark:text-gray-100">{userName}</span>
                <span className="text-[11px] text-slate-500 dark:text-gray-400 font-medium leading-none">Operator</span>
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
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                {t('medicine.list_title')}
              </h1>
              <span className="text-sm md:text-base font-medium text-slate-500 dark:text-gray-400 leading-tight">
                {t('medicine.list_sub')}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Import File Button */}
              <button
                type="button"
                onClick={handleActionComingSoon}
                className="h-14 min-h-[56px] px-5 rounded-[16px] bg-white dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-800 dark:text-gray-100 border border-slate-200 dark:border-gray-700 shadow-sm flex items-center gap-3 font-bold transition-all active:translate-y-[1px] cursor-pointer"
              >
                <svg className="w-6 h-6 text-slate-700 dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-base font-bold leading-tight">{btnImport.main}</span>
                  {btnImport.sub ? <span className="text-xs text-slate-500 dark:text-gray-400 font-medium leading-tight">{btnImport.sub}</span> : null}
                </div>
              </button>

              {/* Add Medicine Button */}
              <button
                type="button"
                onClick={() => setEditingMedicineId('new')}
                className="h-14 min-h-[56px] px-6 rounded-[16px] bg-[#006B33] hover:bg-[#088643] text-white shadow-sm flex items-center gap-3 font-bold transition-all active:translate-y-[1px] cursor-pointer"
              >
                <svg className="w-6 h-6 text-white stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-base font-bold text-white leading-tight">{btnAdd.main}</span>
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
              <svg className="w-6 h-6 absolute left-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('medicine.search_placeholder')}
                className="w-full h-14 min-h-[56px] pl-12 pr-4 bg-white dark:bg-gray-800 rounded-[16px] text-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#006B33] border border-slate-200 dark:border-gray-700 shadow-sm transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('common.btn_clear').main}
                  className="absolute right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-gray-300 flex items-center justify-center cursor-pointer transition-colors"
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
            <div className="w-full bg-white dark:bg-gray-900 rounded-[16px] shadow-sm p-12 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-[#006B33] border-t-transparent rounded-full animate-spin mb-3" />
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
            <div className="w-full bg-white dark:bg-gray-900 rounded-[16px] shadow-sm border border-slate-200 dark:border-gray-800 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {t('medicine.no_results_title')}
              </h2>
              <p className="text-slate-500 dark:text-gray-400 text-sm max-w-sm mb-6">
                {t('medicine.no_results_sub')}
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 text-slate-800 dark:text-gray-200 font-bold text-sm cursor-pointer transition-colors"
              >
                {t('common.btn_clear').main}
              </button>
            </div>
          ) : (
            /* Medicine Rows List (each row >= 60px) */
            <div className="w-full bg-white dark:bg-gray-900 rounded-[16px] shadow-sm border border-slate-200 dark:border-gray-800 flex flex-col shrink-0 overflow-hidden divide-y divide-slate-100 dark:divide-gray-800">
              {filteredMedicines.map((med) => {
                const stockUnits = (med.id !== undefined && stockMap[med.id] !== undefined) ? stockMap[med.id] : 0;
                const formattedStock = formatMedicineStock(
                  stockUnits,
                  med.unitsPerPack,
                  t('medicine.pack_unit'),
                  t('medicine.loose_unit')
                );
                const mrpRupees = (med.mrpPaise / 100).toFixed(2);

                return (
                  <div
                    key={med.id || med.barcode || med.name}
                    onClick={() => {
                      if (med.id) setEditingMedicineId(med.id);
                    }}
                    className="min-h-[72px] px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer active:bg-slate-100 dark:active:bg-gray-800"
                  >
                    {/* Left Details */}
                    <div className="flex flex-col justify-center min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg md:text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
                          {med.name} {med.strength}
                        </span>
                        {med.scheduleType && med.scheduleType !== 'none' && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                            Sch {med.scheduleType}
                          </span>
                        )}
                      </div>
                      <div className="text-sm md:text-base font-medium text-slate-500 dark:text-gray-400 leading-tight mt-1 truncate">
                        {med.salt ? `${med.salt} · ` : ''}
                        {med.company ? `${med.company} · ` : ''}
                        <span>MRP Rs. {mrpRupees}</span>
                        {med.shortCode ? ` · ${t('medicine.short_code_prefix')} ${med.shortCode}` : ''}
                        {med.shelf ? ` · ${med.shelf}` : ''}
                      </div>
                    </div>

                    {/* Right: Stock Count (packs & loose) */}
                    <div className="flex flex-col items-end text-right shrink-0">
                      <span className={`text-base md:text-lg font-bold leading-tight ${stockUnits > 0 ? 'text-[#006B33] dark:text-[#72dc8e]' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formattedStock}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-gray-500 font-medium mt-0.5 leading-none">
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
      <footer className="fixed bottom-0 left-0 w-full h-11 px-6 md:px-8 bg-[#EBF6F0] dark:bg-gray-900 border-t border-slate-200/80 dark:border-gray-800 flex items-center justify-between text-xs md:text-sm text-slate-600 dark:text-gray-400 font-medium select-none z-40">
        <div className="flex items-center gap-2 truncate">
          <span>{shopName}</span>
          {shop?.gstNo ? (
            <>
              <span>•</span>
              <span>GSTIN: {shop.gstNo}</span>
            </>
          ) : null}
          <span>•</span>
          <span>{t('medicine.terminal_info')}</span>
        </div>
        <div className="inline-flex items-center gap-2 text-[#006B33] dark:text-[#72dc8e] font-bold shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#006B33] dark:bg-[#72dc8e]" />
          <span>{t('medicine.sync_active')}</span>
        </div>
      </footer>
    </div>
  );
};
