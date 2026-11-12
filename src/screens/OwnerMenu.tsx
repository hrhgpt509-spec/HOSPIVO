import React, { useState } from 'react';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useShop } from '../logic/useShop';

interface OwnerMenuProps {
  onReturnHome: () => void;
  onOpenMedicineList: () => void;
  onOpenSuppliers?: () => void;
  currentUser?: {
    id?: string;
    name: string;
    role?: string;
    isOwner?: boolean;
  } | null;
  shop?: {
    id?: number;
    name: string;
    mode: 'local' | 'cloud';
  } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OwnerMenu: React.FC<OwnerMenuProps> = ({
  onReturnHome,
  onOpenMedicineList,
  onOpenSuppliers,
  currentUser,
  shop,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const [lockedNotice, setLockedNotice] = useState<{ title: string; subtitle: string } | null>(null);

  const { name: hookShopName, mode: hookMode } = useShop();
  const shopName = shop?.name || hookShopName || '';
  const currentMode = shop?.mode || hookMode;
  const modeLabel = currentMode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || t('common.role_owner');
  const returnHomeBtn = tButton('home.return_home_btn');

  const tileDashboard = tButton('owner_menu.tile_dashboard');
  const tileReports = tButton('owner_menu.tile_reports');
  const tileStaff = tButton('owner_menu.tile_staff');
  const tileAudit = tButton('owner_menu.tile_audit_log');
  const tileShelf = tButton('owner_menu.tile_shelf');
  const tileDawaiList = tButton('owner_menu.tile_dawai_list');
  const tileSuppliers = tButton('owner_menu.tile_suppliers');
  const tileSticker = tButton('owner_menu.tile_sticker');
  const tileSettings = tButton('owner_menu.tile_settings');
  const tileBackup = tButton('owner_menu.tile_backup');

  const handleLockedClick = (tileName: string) => {
    setLockedNotice({
      title: `${tileName}: ${t('home.coming_soon')}`,
      subtitle: t('home.subpage_ready_next_version'),
    });
  };

  return (
    <div className="w-full min-h-screen bg-canvas text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      {/* 1. Header (Matching 32b_Owner_Menu.html) */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 flex items-center justify-between">
          {/* Left: Brand + Shop Name + Mode Pill */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-black tracking-tight text-primary uppercase">
                HOSPIVO
              </span>
              <span className="hidden sm:inline text-outline-variant font-light text-xl leading-none">|</span>
              <span className="hidden sm:inline text-lg md:text-xl font-bold text-on-surface">
                {shopName}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low text-xs font-medium text-on-surface-variant">
              <span className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-primary/20" />
              <span>{modeLabel}</span>
            </div>
          </div>

          {/* Right: User Pill + Theme Toggle + Home Button */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* User pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant">
              <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                <svg className="w-5 h-5 text-on-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold leading-tight text-on-surface">{userName}</span>
                <span className="text-[10px] text-outline font-medium leading-none">{currentUser?.role === 'cashier' ? t('common.role_cashier') : t('common.role_owner')}</span>
              </div>
            </div>

            {/* Light/Dark theme toggle */}
            {onToggleTheme && (
              <button
                type="button"
                aria-label={t('common.toggle_theme')}
                onClick={onToggleTheme}
                className="w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant"
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            )}

            {/* Fullscreen button */}
            <FullscreenButton className="w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant" />

            {/* Return to Home Button */}
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
                {returnHomeBtn.sub ? (
                  <span className="text-[11px] text-emerald-100 font-normal leading-none mt-0.5">
                    {returnHomeBtn.sub}
                  </span>
                ) : null}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Area (Matching 32b layout) */}
      <main className="w-full pt-16 flex-1 flex flex-col justify-between">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden justify-between px-4 sm:px-6 md:px-12 py-6 box-border select-none relative">
          
          {/* Subtle Ambient Glow */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[900px] h-72 bg-gradient-to-b from-[#006B33]/5 via-[#72dc8e]/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

          {/* Page Header */}
          <div className="w-full max-w-6xl mx-auto flex items-center justify-between shrink-0">
            <div className="flex flex-col">
              <h1 className="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight leading-none">
                {t('owner_menu.page_title')}
              </h1>
              <span className="text-base font-medium text-outline mt-1">
                {t('owner_menu.page_sub')}
              </span>
            </div>

            {/* Quick Status & Store Meta Pill */}
            <div className="flex items-center gap-3 bg-surface-container-lowest px-4 py-2 rounded-xl shadow-sm border border-outline-variant">
              <div className="w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-primary/40" />
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold leading-tight text-on-surface">
                  {t('owner_menu.status_title')}
                </span>
                <span className="text-xs text-outline">
                  {t('common.saved_on_device')}
                </span>
              </div>
            </div>
          </div>

          {/* Optional Locked Notice Banner */}
          {lockedNotice && (
            <div className="w-full max-w-6xl mx-auto bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700 rounded-2xl px-6 py-3 flex items-center justify-between mt-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <div className="flex flex-col text-left">
                  <span className="text-base font-bold text-amber-900 dark:text-amber-200">
                    {lockedNotice.title}
                  </span>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {lockedNotice.subtitle}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLockedNotice(null)}
                className="text-xs font-bold text-amber-800 dark:text-amber-200 hover:underline px-3 py-1 cursor-pointer"
              >
                {t('home.close_btn')}
              </button>
            </div>
          )}

          {/* Centered Grid of 9 Tiles (5 in row 1, 4 in row 2) */}
          <div className="w-full max-w-6xl mx-auto flex-1 flex items-center justify-center my-auto py-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 md:gap-6 w-full justify-center">
              
              {/* Row 1: 5 Items */}

              {/* 1. Dashboard (locked) */}
              <button
                type="button"
                onClick={() => handleLockedClick(tileDashboard.main)}
                className="group relative flex flex-col items-center justify-center aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-4 text-center border border-outline-variant active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
                  </svg>
                </div>
                <span className="text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                  {tileDashboard.main}
                </span>
                {tileDashboard.sub ? (
                  <span className="text-xs md:text-sm font-medium text-outline mt-1">
                    {tileDashboard.sub}
                  </span>
                ) : null}
              </button>

              {/* 2. Reports (locked) */}
              <button
                type="button"
                onClick={() => handleLockedClick(tileReports.main)}
                className="group relative flex flex-col items-center justify-center aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-4 text-center border border-outline-variant active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 9h4v11H4zm6-5h4v16h-4zm6 8h4v8h-4z" />
                  </svg>
                </div>
                <span className="text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                  {tileReports.main}
                </span>
                {tileReports.sub ? (
                  <span className="text-xs md:text-sm font-medium text-outline mt-1">
                    {tileReports.sub}
                  </span>
                ) : null}
              </button>

              {/* 3. Staff (locked) */}
              <button
                type="button"
                onClick={() => handleLockedClick(tileStaff.main)}
                className="group relative flex flex-col items-center justify-center aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-4 text-center border border-outline-variant active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 7h-5V4c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM11 4h2v5h-2V4zm9 16H4V9h5c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2h5v11zM12 12c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z" />
                  </svg>
                </div>
                <span className="text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                  {tileStaff.main}
                </span>
                {tileStaff.sub ? (
                  <span className="text-xs md:text-sm font-medium text-outline mt-1">
                    {tileStaff.sub}
                  </span>
                ) : null}
              </button>

              {/* 4. Audit Log (locked) */}
              <button
                type="button"
                onClick={() => handleLockedClick(tileAudit.main)}
                className="group relative flex flex-col items-center justify-center aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-4 text-center border border-outline-variant active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                  </svg>
                </div>
                <span className="text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                  {tileAudit.main}
                </span>
                {tileAudit.sub ? (
                  <span className="text-xs md:text-sm font-medium text-outline mt-1">
                    {tileAudit.sub}
                  </span>
                ) : null}
              </button>

              {/* 5. Self / Shelf Map (locked) */}
              <button
                type="button"
                onClick={() => handleLockedClick(tileShelf.main)}
                className="group relative flex flex-col items-center justify-center aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-4 text-center border border-outline-variant active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h16v4H4v-4z" />
                  </svg>
                </div>
                <span className="text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                  {tileShelf.main}
                </span>
                {tileShelf.sub ? (
                  <span className="text-xs md:text-sm font-medium text-outline mt-1">
                    {tileShelf.sub}
                  </span>
                ) : null}
              </button>

              {/* Row 2: 4 centered items (Dawai List, Sticker, Settings, Backup) */}
              <div className="col-span-2 sm:col-span-3 md:col-span-5 flex flex-wrap md:flex-nowrap justify-center gap-3 sm:gap-4 md:gap-6 mt-2 md:mt-4">
                
                {/* 6. Dawai List (ACTIVE! Opens real page) */}
                <button
                  type="button"
                  onClick={onOpenMedicineList}
                  className="group relative flex flex-col items-center justify-center w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2*1rem)/3)] md:w-[calc((100%-4*1.5rem)/5)] aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-3 sm:p-4 text-center border-2 border-primary/30 hover:border-primary active:scale-[0.98]"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                    <svg className="w-8 h-8 sm:w-9 sm:h-9" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 3h12v2H6V3zm0 4h12v2H6V7zm-1 6c0-2.21 1.79-4 4-4h6c2.21 0 4 1.79 4 4v6c0 2.21-1.79 4-4 4H9c-2.21 0-4-1.79-4-4v-6zm5 2v2H8v2h2v2h2v-2h2v-2h-2v-2h-2z" />
                    </svg>
                  </div>
                  <span className="text-base sm:text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                    {tileDawaiList.main}
                  </span>
                  {tileDawaiList.sub ? (
                    <span className="text-xs md:text-sm font-medium text-outline mt-1">
                      {tileDawaiList.sub}
                    </span>
                  ) : null}
                </button>

                {/* Suppliers (ACTIVE! Opens real page) */}
                <button
                  type="button"
                  onClick={onOpenSuppliers}
                  className="group relative flex flex-col items-center justify-center w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2*1rem)/3)] md:w-[calc((100%-4*1.5rem)/5)] aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-3 sm:p-4 text-center border-2 border-primary/30 hover:border-primary active:scale-[0.98]"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                    <Icon name="local_shipping" className="text-[32px] sm:text-[36px]" />
                  </div>
                  <span className="text-base sm:text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                    {tileSuppliers.main}
                  </span>
                  {tileSuppliers.sub ? (
                    <span className="text-xs md:text-sm font-medium text-outline mt-1">
                      {tileSuppliers.sub}
                    </span>
                  ) : null}
                </button>

                {/* 7. Sticker (locked) */}
                <button
                  type="button"
                  onClick={() => handleLockedClick(tileSticker.main)}
                  className="group relative flex flex-col items-center justify-center w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2*1rem)/3)] md:w-[calc((100%-4*1.5rem)/5)] aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-3 sm:p-4 text-center border border-outline-variant active:scale-[0.98]"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                    <svg className="w-8 h-8 sm:w-9 sm:h-9" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
                    </svg>
                  </div>
                  <span className="text-base sm:text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                    {tileSticker.main}
                  </span>
                  {tileSticker.sub ? (
                    <span className="text-xs md:text-sm font-medium text-outline mt-1">
                      {tileSticker.sub}
                    </span>
                  ) : null}
                </button>

                {/* 8. Settings (locked) */}
                <button
                  type="button"
                  onClick={() => handleLockedClick(tileSettings.main)}
                  className="group relative flex flex-col items-center justify-center w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2*1rem)/3)] md:w-[calc((100%-4*1.5rem)/5)] aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-3 sm:p-4 text-center border border-outline-variant active:scale-[0.98]"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                    <svg className="w-8 h-8 sm:w-9 sm:h-9" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                  </div>
                  <span className="text-base sm:text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                    {tileSettings.main}
                  </span>
                  {tileSettings.sub ? (
                    <span className="text-xs md:text-sm font-medium text-outline mt-1">
                      {tileSettings.sub}
                    </span>
                  ) : null}
                </button>

                {/* 9. Backup (locked) */}
                <button
                  type="button"
                  onClick={() => handleLockedClick(tileBackup.main)}
                  className="group relative flex flex-col items-center justify-center w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-2*1rem)/3)] md:w-[calc((100%-4*1.5rem)/5)] aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer p-3 sm:p-4 text-center border border-outline-variant active:scale-[0.98]"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                    <svg className="w-8 h-8 sm:w-9 sm:h-9" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
                    </svg>
                  </div>
                  <span className="text-base sm:text-lg md:text-xl font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                    {tileBackup.main}
                  </span>
                  {tileBackup.sub ? (
                    <span className="text-xs md:text-sm font-medium text-outline mt-1 whitespace-nowrap">
                      {tileBackup.sub}
                    </span>
                  ) : null}
                </button>

              </div>
            </div>
          </div>

          {/* 3. Bottom Ribbon (Matching 32b) */}
          <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between shrink-0 py-3 px-4 sm:px-6 bg-surface-container-low rounded-xl border border-outline-variant gap-2 sm:gap-0">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
              <span className="text-sm font-medium text-on-surface">
                {shopName ? `${shopName} • ${t('common.saved_on_device')}` : t('common.saved_on_device')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-outline text-xs md:text-sm font-medium">
              <span>{t('owner_menu.footer_db_synced')}</span>
              <span>•</span>
              <span>{t('owner_menu.build_version')}</span>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};
