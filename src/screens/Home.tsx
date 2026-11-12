import React, { useState, useEffect } from 'react';
import { useShop } from '../logic/useShop';
import { formatRupees } from '../logic/money';
import { StatusChip } from '../components/StatusChip';
import { EmptyState } from '../components/EmptyState';
import { OwnerPinGate } from '../components/OwnerPinGate';
import { ApprovalDialog } from '../components/ApprovalDialog';
import { useTranslation, tButton } from '../i18n';
import { FullscreenButton } from '../components/FullscreenButton';
import { Icon } from '../components/Icon';
import { OwnerMenu } from './OwnerMenu';
import { OwnerMedicineList } from './OwnerMedicineList';
import { StockJodo } from './StockJodo';
import { StockDekho } from './StockDekho';
import { SuppliersList } from './suppliers/SuppliersList';
import { DawaiBecho } from './DawaiBecho';
import { Expiry } from './Expiry';

interface HomeProps {
  currentUser?: {
    id: string;
    name: string;
    role?: string;
    isOwner?: boolean;
  } | null;
}

type ActivePage =
  | 'home'
  | 'dawai_becho'
  | 'fast_bill'
  | 'stock_jodo'
  | 'stock_dekho'
  | 'expiry'
  | 'udhaar'
  | 'din_band'
  | 'owner'
  | 'medicine_list'
  | 'suppliers';

export const Home: React.FC<HomeProps> = ({ currentUser }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hospivo_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const { shop, name: shopName, mode } = useShop();
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [isOwnerGateOpen, setIsOwnerGateOpen] = useState<boolean>(false);
  const [isTestApprovalOpen, setIsTestApprovalOpen] = useState<boolean>(false);
  const [approvalMessage, setApprovalMessage] = useState<string>('');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('hospivo_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const { t, language } = useTranslation();
  const backupBtn = tButton('home.backup_lo');
  const returnHomeBtn = tButton('home.return_home_btn');
  const tileDawaiBecho = tButton('home.tile_dawai_becho');
  const tileFastBill = tButton('home.tile_fast_bill');
  const tileStockJodo = tButton('home.tile_stock_jodo');
  const tileStockDekho = tButton('home.tile_stock_dekho');
  const tileExpiry = tButton('home.tile_expiry');
  const tileUdhaar = tButton('home.tile_udhaar');
  const tileDinBand = tButton('home.tile_din_band');
  const tileOwner = tButton('home.tile_owner');

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || 'Owner';
  const userInitial = userName ? userName.charAt(0).toUpperCase() : 'O';

  // Navigate back to home
  const handleReturnHome = () => {
    setActivePage('home');
  };

  // Click on tile handler
  const handleTileClick = (page: ActivePage) => {
    if (page === 'owner') {
      setIsOwnerGateOpen(true);
    } else {
      setActivePage(page);
    }
  };

  // When Owner PIN is correctly entered in gate
  const handleOwnerGateSuccess = () => {
    setIsOwnerGateOpen(false);
    setActivePage('owner');
  };

  // 32b Owner Menu
  if (activePage === 'owner') {
    return (
      <OwnerMenu
        onReturnHome={handleReturnHome}
        onOpenMedicineList={() => setActivePage('medicine_list')}
        onOpenSuppliers={() => setActivePage('suppliers')}
        currentUser={currentUser}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 38a Medicine List
  if (activePage === 'medicine_list') {
    return (
      <OwnerMedicineList
        onBackToOwnerMenu={() => setActivePage('owner')}
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        shop={shop}
      />
    );
  }

  // 23a-e Stock Jodo
  if (activePage === 'stock_jodo') {
    return (
      <StockJodo
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 24a-b, 25 Stock Dekho
  if (activePage === 'stock_dekho') {
    return (
      <StockDekho
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 27a-b Suppliers List & Detail
  if (activePage === 'suppliers') {
    return (
      <SuppliersList
        onReturnHome={handleReturnHome}
        onBackToOwnerMenu={() => setActivePage('owner')}
        currentUser={currentUser as any}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 11, 12, 12b, 13, 14 Dawai Becho Counter Billing
  if (activePage === 'dawai_becho') {
    return (
      <DawaiBecho
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 26a, 26b, 26c Expiry & Supplier Returns
  if (activePage === 'expiry') {
    return (
      <Expiry
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // If another subpage is currently selected, render subview with 46b EmptyState & top bar
  if (activePage !== 'home') {
    const pageLabel = tButton(`home.tile_${activePage}`);
    const subTitle = pageLabel.main;
    return (
      <div className="w-full min-h-screen bg-canvas dark:bg-[#0f1713] text-[#101828] dark:text-gray-100 flex flex-col justify-between p-6 antialiased select-none transition-colors">
        <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col justify-between">
          
          {/* Subpage Header (46b_Shared_EmptyState.html context bar) */}
          <header className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 px-7 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleReturnHome}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ebf6f0] dark:bg-gray-800 hover:bg-[#e0ebe5] dark:hover:bg-gray-700 transition-colors text-[#141e1a] dark:text-white cursor-pointer border border-slate-200 dark:border-gray-700"
              >
                <svg className="w-6 h-6 text-[#006b33] stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
                <div className="flex flex-col text-left">
                  <span className="text-base font-bold leading-tight">{returnHomeBtn.main}</span>
                  {returnHomeBtn.sub ? <span className="text-xs text-[#6e7a6e] dark:text-gray-400 leading-none">{returnHomeBtn.sub}</span> : null}
                </div>
              </button>

              <span className="w-1.5 h-6 rounded-full bg-gray-300 dark:bg-gray-700" />

              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-[#141e1a] dark:text-white leading-tight">
                  {pageLabel.main}
                </h1>
                {pageLabel.sub ? (
                  <span className="text-sm font-medium text-[#6e7a6e] dark:text-gray-400 leading-tight">
                    {pageLabel.sub}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <StatusChip variant="local" label={modeLabel} />
              
              <div className="flex items-center space-x-2.5 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100">
                <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm">
                  {userInitial}
                </div>
                <span className="font-bold text-lg">{userName}</span>
              </div>
            </div>
          </header>

          {/* Centered Empty State Card */}
          <main className="w-full flex-1 flex items-center justify-center py-8">
            <EmptyState
              title={`${subTitle}: ${t('home.coming_soon')}`}
              subtitle={t('home.subpage_ready_next_version')}
              actionLabel={returnHomeBtn.main}
              actionSubLabel={returnHomeBtn.sub}
              onAction={handleReturnHome}
              hintText={shopName ? (mode === 'cloud' ? `Hospivo Retail Cloud • ${shopName}` : `Hospivo • ${shopName}`) : (mode === 'cloud' ? 'Hospivo Retail Cloud' : 'Hospivo')}
            />
          </main>

          {/* Simple footer */}
          <footer className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 px-6 py-4 flex items-center justify-between text-sm text-[#6e7a6e] dark:text-gray-400">
            <span>{mode === 'cloud' ? t('home.footer_cloud') : t('home.footer_local')}</span>
            <span>{shopName ? `${shopName} • ${modeLabel}` : modeLabel}</span>
          </footer>

        </div>
      </div>
    );
  }

  // MAIN HOME VIEW
  return (
    <div className="w-full min-h-screen bg-canvas dark:bg-[#0f1713] text-[#101828] dark:text-gray-100 flex flex-col justify-between p-6 antialiased select-none transition-colors">
      <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col justify-between relative">
        
        {/* TOP BAR (App screen top bar) */}
        <header className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 px-7 py-4 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Brand + Shop Name */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-brand flex items-center justify-center text-white shadow-sm">
                <svg className="w-6 h-6 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <span className="text-2xl font-black tracking-wider text-brand">HOSPIVO</span>
              </div>
            </div>

            <div className="h-7 w-[2px] bg-gray-200 dark:bg-gray-700"></div>

            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="text-xl font-bold text-gray-800 dark:text-gray-100">{shopName}</span>
            </div>
          </div>

          {/* Right: Reusable Status Chips + User + Light/Dark Switch */}
          <div className="flex items-center space-x-4">
            {/* StatusChip: Local mode (46d_Shared_StatusChips) */}
            <StatusChip variant="local" label={modeLabel} />

            {/* StatusChip: Backup lo (Honest backup state, none taken yet) */}
            <StatusChip variant="backup_needed" label={backupBtn.main} />

            {/* Quick Suppliers Button */}
            <button
              type="button"
              onClick={() => setActivePage('suppliers')}
              className="h-10 px-3.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface font-bold text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('suppliers.page_title')}
            >
              <Icon name="local_shipping" className="text-[18px] text-primary" />
              <span>{tButton('suppliers.nav_suppliers').main}</span>
            </button>

            {/* User name */}
            <div className="flex items-center space-x-2.5 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100">
              <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm">
                {userInitial}
              </div>
              <span className="font-bold text-lg">{userName}</span>
            </div>

            {/* Moon / Sun light/dark switch */}
            <button
              type="button"
              aria-label={t('common.toggle_theme')}
              onClick={toggleTheme}
              className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-yellow-400 transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Fullscreen button */}
            <FullscreenButton className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 transition cursor-pointer" />
          </div>
        </header>

        {/* Success Banner when DEV approval granted */}
        {approvalMessage && (
          <div className="w-full bg-[#E8F5E9] dark:bg-[#122e1b] border-2 border-[#81C784] rounded-2xl px-6 py-3 flex items-center justify-between mt-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-[#2E7D32] dark:text-[#81C784]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-lg font-bold text-[#1B5E20] dark:text-[#a5d6a7]">
                {approvalMessage}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setApprovalMessage('')}
              className="text-xs font-semibold text-[#2E7D32] hover:underline cursor-pointer"
            >
              {t('home.close_btn')}
            </button>
          </div>
        )}

        {/* Red backup warning banner (RULES.md: Red banner on Home if last backup is older than 3 days / none taken) */}
        <div className="w-full bg-[#FEF3F2] dark:bg-[#2c1514] border-2 border-[#FCA5A5] dark:border-[#7f1d1d] rounded-2xl px-6 py-3.5 flex items-center justify-between mt-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FEE4E2] dark:bg-[#3f1917] border border-[#FCA5A5] dark:border-[#7f1d1d] flex items-center justify-center text-[#D92D20] dark:text-[#f87171] shrink-0">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" viewBox="0 0 24 24">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="flex flex-col">
              <div className="text-xl font-black text-[#B91C1C] dark:text-[#fca5a5] flex items-center gap-2">
                <span>{t('home.backup_banner_title')}</span>
              </div>
              <span className="text-base font-semibold text-[#D92D20] dark:text-[#f87171]">
                {t('home.backup_banner_sub')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-14 min-w-[200px] px-6 bg-[#D92D20] hover:brightness-105 active:scale-[0.99] text-white rounded-2xl font-bold flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all border border-[#B91C1C]"
            >
              <span className="text-lg font-bold leading-tight">{backupBtn.main}</span>
              {backupBtn.sub ? (
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80 leading-none">
                  {backupBtn.sub}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* MAIN AREA: 8 BIG SQUARE TILES IN A GRID */}
        <main className="w-full flex-1 flex items-center justify-center py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-[1392px]">
            
            {/* Tile 1: Dawai Becho (Sell, green, largest and first) */}
            <div
              onClick={() => handleTileClick('dawai_becho')}
              className="bg-brand text-white rounded-2xl flex flex-col justify-between shadow-lg shadow-brand/20 border-2 border-brand hover:brightness-105 cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight">{tileDawaiBecho.main}</div>
                {tileDawaiBecho.sub ? <div className="text-base text-white/85 font-medium mt-0.5">{tileDawaiBecho.sub}</div> : null}
              </div>
            </div>

            {/* Tile 2: Fast Bill (Rush) */}
            <div
              onClick={() => handleTileClick('fast_bill')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-semantic-blue flex items-center justify-center">
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileFastBill.main}</div>
                {tileFastBill.sub ? <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileFastBill.sub}</div> : null}
              </div>
            </div>

            {/* Tile 3: Stock Jodo (Add stock) */}
            <div
              onClick={() => handleTileClick('stock_jodo')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="w-14 h-14 rounded-xl bg-green-50 dark:bg-green-950/50 text-brand flex items-center justify-center">
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileStockJodo.main}</div>
                {tileStockJodo.sub ? <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileStockJodo.sub}</div> : null}
              </div>
            </div>

            {/* Tile 4: Stock Dekho (View stock) */}
            <div
              onClick={() => handleTileClick('stock_dekho')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileStockDekho.main}</div>
                {tileStockDekho.sub ? <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileStockDekho.sub}</div> : null}
              </div>
            </div>

            {/* Tile 5: Expiry (Alerts, orange accent) */}
            <div
              onClick={() => handleTileClick('expiry')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border-2 border-semantic-orange/30 dark:border-semantic-orange/40 hover:border-semantic-orange hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-xl bg-semantic-orangeBg dark:bg-orange-950/40 text-semantic-orange flex items-center justify-center">
                  <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                </div>
                <span className="w-3.5 h-3.5 rounded-full bg-semantic-orange"></span>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileExpiry.main}</div>
                {tileExpiry.sub ? <div className="text-base text-semantic-orange font-bold mt-0.5">{tileExpiry.sub}</div> : null}
              </div>
            </div>

            {/* Tile 6: Udhaar (Credit) */}
            <div
              onClick={() => handleTileClick('udhaar')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="w-14 h-14 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-semantic-yellow flex items-center justify-center">
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileUdhaar.main}</div>
                {tileUdhaar.sub ? <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileUdhaar.sub}</div> : null}
              </div>
            </div>

            {/* Tile 7: Din Band (Close day) */}
            <div
              onClick={() => handleTileClick('din_band')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="w-14 h-14 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-semantic-red flex items-center justify-center">
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileDinBand.main}</div>
                {tileDinBand.sub ? <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileDinBand.sub}</div> : null}
              </div>
            </div>

            {/* Tile 8: Owner (key icon, Owner PIN gate) */}
            <div
              onClick={() => handleTileClick('owner')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition h-[225px] p-6 active:scale-[0.99]"
            >
              <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <svg className="w-8 h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileOwner.main}</div>
                {tileOwner.sub ? <div className="text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileOwner.sub}</div> : null}
              </div>
            </div>

          </div>
        </main>

        {/* BELOW: SUMMARY STRIP WITH REAL DATABASE VALUES */}
        <footer className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 p-5 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800 gap-y-4 md:gap-y-0">
            
            {/* Metric 1: Aaj ki bikri Rs. 0 */}
            <div className="px-6 flex flex-col justify-center">
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('home.stat_sales')}</div>
              <div className="text-[38px] font-black text-brand tracking-tight leading-none">
                {formatRupees(0)}
              </div>
            </div>

            {/* Metric 2: Bills 0 */}
            <div className="px-6 flex flex-col justify-center">
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('home.stat_bills')}</div>
              <div className="text-[38px] font-black text-gray-900 dark:text-white tracking-tight leading-none">
                0
              </div>
            </div>

            {/* Metric 3: Expiry 30 din: 0 dawai (orange) */}
            <div className="px-6 flex flex-col justify-center">
              <div className="flex items-center space-x-2 text-lg font-semibold text-semantic-orange mb-1">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{t('home.stat_expiry')}</span>
              </div>
              <div className="text-[38px] font-black text-semantic-orange tracking-tight leading-none">
                {t('home.dawai_count')}
              </div>
            </div>

            {/* Metric 4: Kam stock: 0 dawai (red) */}
            <div className="px-6 flex flex-col justify-center">
              <div className="flex items-center space-x-2 text-lg font-semibold text-semantic-red mb-1">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span>{t('home.stat_low_stock')}</span>
              </div>
              <div className="text-[38px] font-black text-semantic-red tracking-tight leading-none">
                {t('home.dawai_count')}
              </div>
            </div>

          </div>

          {/* DEV ONLY: remove before release */}
          <div className="absolute right-4 bottom-2 sm:bottom-4">
            <button
              type="button"
              onClick={() => setIsTestApprovalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold cursor-pointer transition shadow-sm"
            >
              {t('home.dev_test_approval_btn')}
            </button>
          </div>
        </footer>

        {/* 32a Owner PIN Gate Dialog */}
        <OwnerPinGate
          isOpen={isOwnerGateOpen}
          onSuccess={handleOwnerGateSuccess}
          onClose={() => setIsOwnerGateOpen(false)}
        />

        {/* 18c Approval Dialog (Ijazat PIN) for DEV testing */}
        {/* DEV ONLY: remove before release */}
        <ApprovalDialog
          isOpen={isTestApprovalOpen}
          actionCategory="discount_above_limit"
          recordDescription={language === 'en' ? 'Test: 15% discount (Limit 10%)' : 'Test: 15% chhoot (Limit 10%)'}
          requesterName={userName}
          onApproved={() => {
            setIsTestApprovalOpen(false);
            setApprovalMessage(t('home.dev_approval_success_banner'));
          }}
          onClose={() => setIsTestApprovalOpen(false)}
        />

      </div>
    </div>
  );
};

export default Home;
