import React, { useState, useEffect } from 'react';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { MobileTopBar } from '../components/MobileTopBar';
import { useShop } from '../logic/useShop';
import { getPendingApprovalRequests, subscribeToSyncUpdates } from '../logic/cloudSync';
import { PermissionPinAlertBanner } from '../components/PermissionPinAlertBanner';

interface OwnerMenuProps {
  onReturnHome: () => void;
  onOpenMedicineList: () => void;
  onOpenSuppliers?: () => void;
  onOpenReferralReport?: () => void;
  onOpenDashboard?: () => void;
  onOpenReports?: () => void;
  onOpenAuditLog?: () => void;
  onOpenStaff?: () => void;
  onOpenShelfMap?: () => void;
  onOpenStickers?: () => void;
  onOpenSettings?: () => void;
  onOpenBackup?: () => void;
  onOpenCloudSync?: () => void;
  onOpenApprovals?: () => void;
  onOpenMultiShop?: () => void;
  openPinRotateSignal?: boolean;
  onPinRotateSignalHandled?: () => void;
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
  onOpenReferralReport,
  onOpenDashboard,
  onOpenReports,
  onOpenAuditLog,
  onOpenStaff,
  onOpenShelfMap,
  onOpenStickers,
  onOpenSettings,
  onOpenBackup,
  onOpenCloudSync,
  onOpenApprovals,
  onOpenMultiShop,
  openPinRotateSignal = false,
  onPinRotateSignalHandled,
  currentUser,
  shop,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const [lockedNotice, setLockedNotice] = useState<{ title: string; subtitle: string } | null>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  useEffect(() => {
    if (!onOpenApprovals) return;
    const loadCount = () => {
      getPendingApprovalRequests()
        .then((list) => setPendingApprovalsCount(list.length))
        .catch(() => {});
    };
    loadCount();
    const unsub = subscribeToSyncUpdates(loadCount, ['approval_request']);
    return () => unsub();
  }, [onOpenApprovals]);

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
  const tileMultiShop = tButton('owner_menu.tile_multi_shop');

  const handleLockedClick = (tileName: string) => {
    setLockedNotice({
      title: `${tileName}: ${t('home.coming_soon')}`,
      subtitle: t('home.subpage_ready_next_version'),
    });
  };

  return (
    <div className="w-full min-h-dvh bg-canvas text-on-surface flex flex-col justify-between overflow-x-clip antialiased select-none transition-colors">
      {/* Compact Mobile Header */}
      <MobileTopBar
        title={t('owner_menu.page_title')}
        subtitle={shopName ? `${shopName} · ${modeLabel}` : modeLabel}
        onBack={onReturnHome}
        backIcon="home"
        theme={theme}
        onToggleTheme={onToggleTheme}
        rightSlot={
          onOpenCloudSync ? (
            <button
              type="button"
              onClick={onOpenCloudSync}
              className="h-12 min-h-[48px] px-3 rounded-xl bg-surface-container text-primary font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="max-w-[72px] truncate">{modeLabel}</span>
            </button>
          ) : undefined
        }
      />

      {/* 1. Desktop Header (Matching 32b_Owner_Menu.html) */}
      <header className="hidden lg:block fixed top-0 left-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
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
            <button
              type="button"
              onClick={onOpenCloudSync}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-xs font-medium text-on-surface-variant cursor-pointer transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-primary/20" />
              <span>{modeLabel}</span>
            </button>
          </div>

          {/* Right: User Pill + Theme Toggle + Home Button */}
          <div className="flex items-center gap-3 md:gap-4">
            {onOpenApprovals && (
              <button
                type="button"
                onClick={onOpenApprovals}
                className="h-10 px-3.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title={t('remote_approval.inbox_title')}
              >
                <Icon name="verified_user" className="text-[18px] text-primary" />
                <span>{t('remote_approval.inbox_title')}</span>
                {pendingApprovalsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-error text-on-error text-[10px] font-black leading-none">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            )}
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
      <main className="w-full pt-3 lg:pt-16 flex-1 flex flex-col justify-between overflow-x-clip">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto lg:min-h-[calc(100dvh-4rem)] lg:h-[calc(100vh-4rem)] lg:overflow-hidden justify-between px-3 sm:px-6 md:px-12 py-3 lg:py-6 box-border select-none relative gap-3">
          
          {/* Subtle Ambient Glow (desktop only to prevent horizontal overflow) */}
          <div className="hidden lg:block absolute top-16 left-1/2 -translate-x-1/2 w-[900px] h-72 bg-gradient-to-b from-[#006B33]/5 via-[#72dc8e]/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

          {/* Desktop Page Header */}
          <div className="hidden lg:flex w-full max-w-6xl mx-auto items-center justify-between shrink-0">
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

          {/* Security Alert Banner when Staff uses Permission PIN */}
          <div className="w-full max-w-6xl mx-auto mt-3">
            <PermissionPinAlertBanner
              openModalSignal={openPinRotateSignal}
              onModalSignalHandled={onPinRotateSignalHandled}
            />
          </div>

          {/* Mobile-only Quick Cloud Sync & Approvals Strip */}
          {(onOpenCloudSync || onOpenApprovals) && (
            <div className="lg:hidden grid grid-cols-2 gap-2.5 w-full">
              {onOpenCloudSync && (
                <button
                  type="button"
                  onClick={onOpenCloudSync}
                  className="min-h-[56px] px-3.5 py-2.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-xs flex items-center gap-2.5 text-left active:scale-[0.98] cursor-pointer min-w-0"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name="cloud_sync" className="text-[22px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-on-surface truncate">
                      {t('cloud_sync.title')}
                    </span>
                    <span className="text-[11px] text-primary font-semibold truncate">
                      {modeLabel}
                    </span>
                  </div>
                </button>
              )}
              {onOpenApprovals && (
                <button
                  type="button"
                  onClick={onOpenApprovals}
                  className="min-h-[56px] px-3.5 py-2.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-xs flex items-center gap-2.5 text-left active:scale-[0.98] cursor-pointer min-w-0"
                >
                  <div className="w-10 h-10 rounded-xl bg-secondary-fixed/60 text-secondary flex items-center justify-center shrink-0">
                    <Icon name="verified_user" className="text-[22px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-on-surface truncate">
                        {t('remote_approval.inbox_title')}
                      </span>
                      {pendingApprovalsCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-error text-on-error text-[10px] font-black leading-none shrink-0">
                          {pendingApprovalsCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-on-surface-variant font-medium truncate">
                      PIN / Cloud
                    </span>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Centered Grid of 10 Owner Tiles (clean 2-col mobile, 3-col sm, 5-col lg) */}
          <div className="w-full max-w-6xl mx-auto flex-1 flex items-center justify-center my-auto py-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4 md:gap-5 w-full">
              {/* 1. Dashboard */}
              <button
                type="button"
                onClick={onOpenDashboard}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="dashboard" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileDashboard.main}
                </span>
                {tileDashboard.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileDashboard.sub}
                  </span>
                ) : null}
              </button>

              {/* 2. Reports */}
              <button
                type="button"
                onClick={onOpenReports || onOpenReferralReport}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="bar_chart" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileReports.main}
                </span>
                {tileReports.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileReports.sub}
                  </span>
                ) : null}
              </button>

              {/* 3. Staff */}
              <button
                type="button"
                onClick={onOpenStaff || (() => handleLockedClick(tileStaff.main))}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="groups" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileStaff.main}
                </span>
                {tileStaff.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileStaff.sub}
                  </span>
                ) : null}
              </button>

              {/* 4. Audit Log */}
              <button
                type="button"
                onClick={onOpenAuditLog}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="verified_user" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileAudit.main}
                </span>
                {tileAudit.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileAudit.sub}
                  </span>
                ) : null}
              </button>

              {/* 5. Shelf Map */}
              <button
                type="button"
                onClick={onOpenShelfMap || (() => handleLockedClick(tileShelf.main))}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="shelves" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileShelf.main}
                </span>
                {tileShelf.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileShelf.sub}
                  </span>
                ) : null}
              </button>

              {/* 6. Dawai List */}
              <button
                type="button"
                onClick={onOpenMedicineList}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="medication" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileDawaiList.main}
                </span>
                {tileDawaiList.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileDawaiList.sub}
                  </span>
                ) : null}
              </button>

              {/* 7. Suppliers */}
              <button
                type="button"
                onClick={onOpenSuppliers}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="local_shipping" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileSuppliers.main}
                </span>
                {tileSuppliers.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileSuppliers.sub}
                  </span>
                ) : null}
              </button>

              {/* 8. Stickers */}
              <button
                type="button"
                onClick={onOpenStickers || (() => handleLockedClick(tileSticker.main))}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="qr_code_2" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileSticker.main}
                </span>
                {tileSticker.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileSticker.sub}
                  </span>
                ) : null}
              </button>

              {/* 9. Settings */}
              <button
                type="button"
                onClick={onOpenSettings || (() => handleLockedClick(tileSettings.main))}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="settings" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileSettings.main}
                </span>
                {tileSettings.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileSettings.sub}
                  </span>
                ) : null}
              </button>

              {/* 10. Backup */}
              <button
                type="button"
                onClick={onOpenBackup || (() => handleLockedClick(tileBackup.main))}
                className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                  <Icon name="backup" className="text-[28px] sm:text-[32px]" />
                </div>
                <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                  {tileBackup.main}
                </span>
                {tileBackup.sub ? (
                  <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                    {tileBackup.sub}
                  </span>
                ) : null}
              </button>

              {/* 11. Multi-Shop Management */}
              {onOpenMultiShop && (
                <button
                  type="button"
                  onClick={onOpenMultiShop}
                  className="group relative flex flex-col items-center justify-center min-h-[120px] lg:aspect-square rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer p-3.5 sm:p-4 text-center border-2 border-primary/25 hover:border-primary active:scale-[0.98] min-w-0"
                >
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-surface-container-low flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200 mb-2 shadow-inner">
                    <Icon name="storefront" className="text-[28px] sm:text-[32px]" />
                  </div>
                  <span className="text-base sm:text-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate max-w-full">
                    {tileMultiShop.main}
                  </span>
                  {tileMultiShop.sub ? (
                    <span className="text-xs font-medium text-outline mt-0.5 truncate max-w-full">
                      {tileMultiShop.sub}
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          </div>

          {/* 3. Desktop Bottom Ribbon (hidden on phones where MobileBottomNav sits) */}
          <div className="hidden lg:flex w-full max-w-6xl mx-auto items-center justify-between shrink-0 py-3 px-6 bg-surface-container-low rounded-xl border border-outline-variant">
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
