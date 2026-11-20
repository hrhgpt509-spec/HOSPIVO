import React, { useState, useEffect } from 'react';
import { useShop } from '../logic/useShop';
import { formatRupees } from '../logic/money';
import { StatusChip } from '../components/StatusChip';
import { EmptyState } from '../components/EmptyState';
import { OwnerPinGate } from '../components/OwnerPinGate';
import { useTranslation, tButton } from '../i18n';
import { FullscreenButton } from '../components/FullscreenButton';
import { Icon } from '../components/Icon';
import { MobileBottomNav, type MobileNavTab } from '../components/MobileBottomNav';
import { OwnerMenu } from './OwnerMenu';
import { OwnerMedicineList } from './OwnerMedicineList';
import { StockJodo } from './StockJodo';
import { StockDekho } from './StockDekho';
import { SuppliersList } from './suppliers/SuppliersList';
import { DawaiBecho } from './DawaiBecho';
import { FastBill } from './FastBill';
import { Expiry } from './Expiry';
import { Udhaar } from './Udhaar';
import { ReferralReport } from './ReferralReport';
import { DinBand } from './DinBand';
import { OwnerDashboard } from './OwnerDashboard';
import { OwnerReports } from './OwnerReports';
import { AuditLogScreen } from './AuditLogScreen';
import { OwnerStaff } from './OwnerStaff';
import { OwnerSettings } from './OwnerSettings';
import { OwnerBackup } from './OwnerBackup';
import { OwnerShelfMap } from './OwnerShelfMap';
import { OwnerStickers } from './OwnerStickers';
import { loadHomeLiveCounters, type HomeLiveCounters } from '../logic/reports';
import {
  getBackupStatus,
  generateAndVerifyBackup,
  saveBackup,
  type BackupStatus,
} from '../logic/backup';
import { triggerFeedback } from '../logic/feedback';
import {
  getHomeSyncState,
  runSyncCycle,
  subscribeToSyncUpdates,
  type HomeSyncState,
} from '../logic/cloudSync';
import { OwnerCloudSync } from './OwnerCloudSync';
import { RemoteApprovalInbox } from './RemoteApprovalInbox';
import { useIsCompactViewport } from '../logic/useViewport';
import { useBackHandler } from '../logic/androidBack';

interface HomeProps {
  currentUser?: {
    id: string;
    name: string;
    role?: string;
    isOwner?: boolean;
  } | null;
  onLock?: () => void;
  onSwitchUser?: () => void;
}

type ActivePage =
  | 'home'
  | 'dawai_becho'
  | 'fast_bill'
  | 'stock_jodo'
  | 'stock_dekho'
  | 'expiry'
  | 'udhaar'
  | 'customers'
  | 'referral_report'
  | 'owner_dashboard'
  | 'owner_reports'
  | 'audit_log'
  | 'owner_staff'
  | 'owner_settings'
  | 'owner_backup'
  | 'owner_shelf_map'
  | 'owner_stickers'
  | 'owner_cloud_sync'
  | 'owner_approvals'
  | 'din_band'
  | 'owner'
  | 'medicine_list'
  | 'suppliers';

export const Home: React.FC<HomeProps> = ({ currentUser, onLock, onSwitchUser }) => {
  const isCompactViewport = useIsCompactViewport();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hospivo_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const { shop, name: shopName, mode } = useShop();
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [targetShelfForStickers, setTargetShelfForStickers] = useState<string | undefined>(undefined);
  const [isOwnerGateOpen, setIsOwnerGateOpen] = useState<boolean>(false);
  const [liveCounters, setLiveCounters] = useState<HomeLiveCounters>({
    todaySalesPaise: 0,
    todayBillsCount: 0,
    expiring30Count: 0,
    lowStockCount: 0,
    combinedAlertsCount: 0,
  });
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({
    lastVerifiedBackupAt: null,
    isToday: false,
    isOlderThan3Days: true,
    daysAgo: null,
    statusText: 'loading',
  });
  const [syncState, setSyncState] = useState<HomeSyncState | null>(null);

  useEffect(() => {
    if (activePage !== 'home') return;
    const refreshHome = () => {
      loadHomeLiveCounters()
        .then((res) => setLiveCounters(res))
        .catch(() => {});
      getBackupStatus()
        .then((st) => setBackupStatus(st))
        .catch(() => {});
      getHomeSyncState()
        .then((st) => setSyncState(st))
        .catch(() => {});
    };

    refreshHome();
    const unsubSync = subscribeToSyncUpdates(() => {
      refreshHome();
    });

    const interval = setInterval(() => {
      getHomeSyncState().then(setSyncState).catch(() => {});
    }, 10000);

    return () => {
      unsubSync();
      clearInterval(interval);
    };
  }, [activePage]);

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

  const { t } = useTranslation();
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

  // Android back navigation for top-level subpages: owner subpages -> owner menu, main subpages -> home
  useBackHandler(activePage !== 'home', () => {
    const ownerSubPages: ActivePage[] = [
      'medicine_list',
      'suppliers',
      'referral_report',
      'owner_dashboard',
      'owner_reports',
      'audit_log',
      'owner_staff',
      'owner_settings',
      'owner_backup',
      'owner_shelf_map',
      'owner_stickers',
      'owner_cloud_sync',
      'owner_approvals',
    ];
    if (ownerSubPages.includes(activePage)) {
      setActivePage('owner');
    } else {
      setActivePage('home');
    }
  });

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

  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);

  const handleOpenBackup = () => {
    if (currentUser?.role === 'owner') {
      setActivePage('owner_backup');
    } else {
      setIsOwnerGateOpen(true);
    }
  };

  const handleBackupNowFromBanner = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      const payload = await generateAndVerifyBackup(shopName);
      const res = await saveBackup(payload, currentUser?.name || 'owner');
      if (res.status === 'saved') {
        const updated = await getBackupStatus();
        setBackupStatus(updated);
        triggerFeedback('success', t('status.backup_today'));
      } else if (res.status === 'cancelled') {
        triggerFeedback('info', t('owner_backup.toast_backup_cancelled'));
      } else if (res.status === 'needs_confirmation') {
        handleOpenBackup();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        triggerFeedback('info', t('owner_backup.toast_backup_cancelled'));
      } else {
        console.error('Failed to take backup from banner:', err);
        triggerFeedback('error', t('owner_backup.backup_failed_title'));
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleOpenCloudSync = () => {
    if (currentUser?.role === 'owner') {
      setActivePage('owner_cloud_sync');
    } else {
      setIsOwnerGateOpen(true);
    }
  };

  const handleOpenApprovals = () => {
    if (currentUser?.role === 'owner') {
      setActivePage('owner_approvals');
    } else {
      setIsOwnerGateOpen(true);
    }
  };

  // Bottom nav helper across top-level hub screens on phones
  const handleMobileTabSelect = (tab: MobileNavTab) => {
    if (tab === 'home') {
      setActivePage('home');
    } else if (tab === 'owner') {
      if (activePage === 'owner') return;
      if (currentUser?.role === 'owner') {
        setActivePage('owner');
      } else {
        setIsOwnerGateOpen(true);
      }
    } else {
      setActivePage(tab);
    }
  };

  const withMobileNav = (activeTab: MobileNavTab, content: React.ReactNode) => (
    <>
      <div className="w-full overflow-x-clip max-lg:pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {content}
      </div>
      <MobileBottomNav activeTab={activeTab} onSelectTab={handleMobileTabSelect} />
      <OwnerPinGate
        isOpen={isOwnerGateOpen}
        onSuccess={handleOwnerGateSuccess}
        onClose={() => setIsOwnerGateOpen(false)}
      />
    </>
  );

  // 32b Owner Menu
  if (activePage === 'owner') {
    return withMobileNav(
      'owner',
      <OwnerMenu
        onReturnHome={handleReturnHome}
        onOpenMedicineList={() => setActivePage('medicine_list')}
        onOpenSuppliers={() => setActivePage('suppliers')}
        onOpenReferralReport={() => setActivePage('referral_report')}
        onOpenDashboard={() => setActivePage('owner_dashboard')}
        onOpenReports={() => setActivePage('owner_reports')}
        onOpenAuditLog={() => setActivePage('audit_log')}
        onOpenStaff={() => setActivePage('owner_staff')}
        onOpenShelfMap={() => setActivePage('owner_shelf_map')}
        onOpenStickers={() => {
          setTargetShelfForStickers(undefined);
          setActivePage('owner_stickers');
        }}
        onOpenSettings={() => setActivePage('owner_settings')}
        onOpenBackup={() => setActivePage('owner_backup')}
        onOpenCloudSync={() => setActivePage('owner_cloud_sync')}
        onOpenApprovals={() => setActivePage('owner_approvals')}
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
        onOpenShelfMap={() => setActivePage('owner_shelf_map')}
        onOpenStickers={() => {
          setTargetShelfForStickers(undefined);
          setActivePage('owner_stickers');
        }}
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
    return withMobileNav(
      'stock_dekho',
      <StockDekho
        onReturnHome={handleReturnHome}
        onOpenShelfMap={() => setActivePage('owner_shelf_map')}
        onOpenStickers={(shelfCode) => {
          setTargetShelfForStickers(shelfCode);
          setActivePage('owner_stickers');
        }}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 27a-b Suppliers List & Detail
  if (activePage === 'suppliers') {
    return withMobileNav(
      'owner',
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

  // Phase 6 Fast Bill (Rush Mode)
  if (activePage === 'fast_bill') {
    return (
      <FastBill
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 26a, 26b, 26c Expiry & Supplier Returns
  if (activePage === 'expiry') {
    return withMobileNav(
      'stock_dekho',
      <Expiry
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 28a-c, 29a-b Udhaar, Customers & Regular Reminders
  if (activePage === 'udhaar' || activePage === 'customers') {
    return withMobileNav(
      'udhaar',
      <Udhaar
        onReturnHome={handleReturnHome}
        onOpenBilling={() => setActivePage('dawai_becho')}
        initialView={activePage === 'customers' ? 'customers' : 'udhaar'}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 30 Doctor Referral Sales Report
  if (activePage === 'referral_report') {
    return (
      <ReferralReport
        onReturnHome={handleReturnHome}
        onBack={() => setActivePage('owner')}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 31a-f Din Band (4-Step Daily Closing)
  if (activePage === 'din_band') {
    return (
      <DinBand
        onReturnHome={handleReturnHome}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 33 Owner Dashboard
  if (activePage === 'owner_dashboard') {
    return withMobileNav(
      'owner',
      <OwnerDashboard
        onReturnHome={handleReturnHome}
        onBackToOwnerMenu={() => setActivePage('owner')}
        onOpenReports={() => setActivePage('owner_reports')}
        onOpenAuditLog={() => setActivePage('audit_log')}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 34 Owner Reports Hub
  if (activePage === 'owner_reports') {
    return withMobileNav(
      'owner',
      <OwnerReports
        onReturnHome={handleReturnHome}
        onBackToOwnerMenu={() => setActivePage('owner')}
        onOpenReferralReport={() => setActivePage('referral_report')}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 36 Read-Only Audit Log
  if (activePage === 'audit_log') {
    return (
      <AuditLogScreen
        onReturnHome={handleReturnHome}
        onBackToOwnerMenu={() => setActivePage('owner')}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 35a-b Staff Management
  if (activePage === 'owner_staff') {
    return (
      <OwnerStaff
        currentUser={currentUser as any}
        onBack={() => setActivePage('owner')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 40, 40b Owner Settings & Approval Rules
  if (activePage === 'owner_settings') {
    return (
      <OwnerSettings
        currentUser={currentUser as any}
        onBack={() => setActivePage('owner')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 41a-c Backup & Restore
  if (activePage === 'owner_backup') {
    return withMobileNav(
      'owner',
      <OwnerBackup
        currentUser={currentUser as any}
        onBack={() => setActivePage('owner')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 37a-b Shelf Map & Shelf Move
  if (activePage === 'owner_shelf_map') {
    return (
      <OwnerShelfMap
        onReturnHome={handleReturnHome}
        onOpenStickers={(shelfCode) => {
          setTargetShelfForStickers(shelfCode);
          setActivePage('owner_stickers');
        }}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 39a-b Stickers & Control Card
  if (activePage === 'owner_stickers') {
    return (
      <OwnerStickers
        onReturnHome={handleReturnHome}
        initialTab={targetShelfForStickers ? 'shelf' : 'medicine'}
        initialShelf={targetShelfForStickers}
        currentUser={currentUser as any}
        shop={shop}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 02b Cloud Sync & Pairing
  if (activePage === 'owner_cloud_sync') {
    return withMobileNav(
      'owner',
      <OwnerCloudSync
        currentUser={currentUser as any}
        onBack={() => setActivePage('owner')}
        onReturnHome={handleReturnHome}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // 43a Approvals Inbox
  if (activePage === 'owner_approvals') {
    return (
      <RemoteApprovalInbox
        currentUser={currentUser as any}
        onBack={() => setActivePage('owner')}
        onReturnHome={handleReturnHome}
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
      <div className="w-full min-h-dvh bg-canvas dark:bg-[#0f1713] text-[#101828] dark:text-gray-100 flex flex-col justify-between p-3 sm:p-4 lg:p-6 antialiased select-none transition-colors">
        <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col justify-between">
          
          {/* Subpage Header (46b_Shared_EmptyState.html context bar) */}
          <header className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 px-4 sm:px-7 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-4">
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

  // COMPACT VIEWPORT: DEDICATED MOBILE & PORTRAIT-TABLET (< 1024px) HOME DASHBOARD
  if (isCompactViewport) {
    return (
      <div className="w-full min-h-dvh bg-canvas dark:bg-[#0f1713] text-[#101828] dark:text-gray-100 flex flex-col justify-between px-3 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(5.25rem+env(safe-area-inset-bottom))] overflow-x-clip antialiased select-none transition-colors">
        <div className="w-full max-w-[1024px] mx-auto flex flex-col gap-3 sm:gap-4 relative min-w-0">
          
          {/* COMPACT TOP BAR */}
          <header className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 p-3 flex items-center justify-between gap-2 min-w-0">
            {/* Left: Hospivo + Shop Name */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white shrink-0 shadow-sm">
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-base font-black tracking-wide text-brand leading-none block truncate">HOSPIVO</span>
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate block mt-0.5">{shopName}</span>
              </div>
            </div>

            {/* Right: Offline/Sync Status Pill + Theme Switch + User/Lock */}
            <div className="flex items-center gap-1.5 shrink-0">
              {syncState?.cloudEnabled ? (
                syncState.status === 'not_connected' ? (
                  <StatusChip
                    variant="pending_sync"
                    label={t('cloud_sync.status_sign_in_required')}
                    className="cursor-pointer text-xs max-w-[120px] truncate"
                    onClick={handleOpenCloudSync}
                  />
                ) : syncState.status === 'offline' ? (
                  <StatusChip
                    variant="offline"
                    label={syncState.chipLabel}
                    className="cursor-pointer text-xs max-w-[110px] truncate"
                    onClick={handleOpenCloudSync}
                  />
                ) : syncState.status === 'failed' ? (
                  <StatusChip
                    variant="sync_failed"
                    label={syncState.chipLabel}
                    className="cursor-pointer text-xs max-w-[110px] truncate"
                    onClick={handleOpenCloudSync}
                  />
                ) : (
                  <StatusChip
                    variant="synced"
                    label={syncState.chipLabel}
                    className="cursor-pointer text-xs max-w-[110px] truncate"
                    onClick={handleOpenCloudSync}
                  />
                )
              ) : (
                <StatusChip
                  variant="local"
                  label={syncState?.chipLabel || modeLabel}
                  className="cursor-pointer text-xs max-w-[110px] truncate"
                  onClick={handleOpenCloudSync}
                />
              )}

              {/* Theme toggle (>= 48px touch target) */}
              <button
                type="button"
                aria-label={t('common.toggle_theme')}
                onClick={toggleTheme}
                className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-yellow-400 transition cursor-pointer"
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Switch User / Lock Button (>= 48px touch target) */}
              <button
                type="button"
                onClick={() => {
                  if (onSwitchUser) onSwitchUser();
                  else if (onLock) onLock();
                }}
                className="min-h-[48px] px-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 flex items-center gap-1.5 text-gray-800 dark:text-gray-100 font-bold text-xs transition cursor-pointer"
                title="Switch User / Lock"
              >
                <div className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center font-bold text-[11px]">
                  {userInitial}
                </div>
                <span className="hidden sm:inline truncate max-w-[65px]">{userName}</span>
                <Icon name="lock" className="text-sm text-gray-500" />
              </button>
            </div>
          </header>

          {/* WARNING BANNERS */}
          {syncState?.bannerVisible && syncState.bannerType === 'failed' && (
            <div className="w-full bg-[#FEF3F2] dark:bg-[#2c1514] border-2 border-[#FCA5A5] dark:border-[#7f1d1d] rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FEE4E2] dark:bg-[#3f1917] text-[#D92D20] flex items-center justify-center shrink-0">
                  <Icon name="warning" className="text-[20px]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-black text-[#B91C1C] dark:text-[#fca5a5]">
                    {t('cloud_sync.status_failed')} ({syncState.pendingCount})
                  </span>
                  <span className="text-xs font-semibold text-[#D92D20] dark:text-[#f87171] truncate">
                    {syncState.lastError || 'Network error aayi'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  runSyncCycle({ force: true }).then(() => getHomeSyncState().then(setSyncState));
                }}
                className="w-full h-11 bg-[#D92D20] text-white rounded-xl font-bold text-sm flex items-center justify-center shadow-sm cursor-pointer"
              >
                {t('cloud_sync.btn_retry').main}
              </button>
            </div>
          )}

          {syncState?.bannerVisible && syncState.bannerType === 'offline' && (
            <div className="w-full bg-[#FFFAEB] dark:bg-[#2b1f0c] border-2 border-[#FEDF89] dark:border-[#78350f] rounded-2xl p-3 flex items-center gap-2.5 shadow-sm animate-fadeIn">
              <div className="w-9 h-9 rounded-xl bg-[#FEF0C7] dark:bg-[#451a03] text-[#B54708] flex items-center justify-center shrink-0">
                <Icon name="wifi_off" className="text-[20px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-black text-[#B54708] dark:text-[#fde68a]">
                  Offline mode ({syncState.pendingCount})
                </span>
                <span className="text-xs text-[#B54708] dark:text-[#fde68a] truncate">
                  Internet wapas aane par auto-sync hoga
                </span>
              </div>
            </div>
          )}

          {backupStatus.isOlderThan3Days && (
            <div className="w-full bg-[#FEF3F2] dark:bg-[#2c1514] border-2 border-[#FCA5A5] dark:border-[#7f1d1d] rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FEE4E2] dark:bg-[#3f1917] text-[#D92D20] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-black text-[#B91C1C] dark:text-[#fca5a5]">{t('home.backup_banner_title')}</span>
                  <span className="text-xs font-semibold text-[#D92D20] dark:text-[#f87171] truncate">{t('home.backup_banner_sub')}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={isBackingUp}
                onClick={handleBackupNowFromBanner}
                className="w-full h-12 min-h-[48px] bg-[#D92D20] disabled:opacity-70 text-white rounded-xl font-bold text-sm flex items-center justify-center shadow-sm cursor-pointer border border-[#B91C1C]"
              >
                {isBackingUp ? 'Backing up...' : backupBtn.main}
              </button>
            </div>
          )}

          {/* PRIMARY CTA: FULL-WIDTH DAWAI BECHO HERO CARD */}
          <div
            onClick={() => handleTileClick('dawai_becho')}
            className="w-full min-h-[84px] bg-brand text-white rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-lg shadow-brand/20 border-2 border-brand hover:brightness-105 active:scale-[0.99] cursor-pointer transition-all"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-7 h-7 text-white stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </div>
              <div className="truncate">
                <div className="text-xl sm:text-2xl font-black leading-tight truncate">{tileDawaiBecho.main}</div>
                {tileDawaiBecho.sub && <div className="text-xs sm:text-sm text-white/85 font-medium mt-0.5 truncate">{tileDawaiBecho.sub}</div>}
              </div>
            </div>
            <svg className="w-6 h-6 text-white shrink-0 ml-2" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {/* 2-COLUMN GRID (3-COLUMN ON TABLET sm:grid-cols-3) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 w-full">
            {/* Fast Bill */}
            <div
              onClick={() => handleTileClick('fast_bill')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-semantic-blue flex items-center justify-center mb-2">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileFastBill.main}</div>
                {tileFastBill.sub && <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{tileFastBill.sub}</div>}
              </div>
            </div>

            {/* Add Stock */}
            <div
              onClick={() => handleTileClick('stock_jodo')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-950/50 text-brand flex items-center justify-center mb-2">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileStockJodo.main}</div>
                {tileStockJodo.sub && <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{tileStockJodo.sub}</div>}
              </div>
            </div>

            {/* View Stock */}
            <div
              onClick={() => handleTileClick('stock_dekho')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center mb-2">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileStockDekho.main}</div>
                {tileStockDekho.sub && <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{tileStockDekho.sub}</div>}
              </div>
            </div>

            {/* Expiry */}
            <div
              onClick={() => handleTileClick('expiry')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border-2 border-semantic-orange/30 dark:border-semantic-orange/40 hover:border-semantic-orange active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-semantic-orangeBg dark:bg-orange-950/40 text-semantic-orange flex items-center justify-center">
                  <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                {liveCounters.expiring30Count > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-semantic-orange text-white text-xs font-extrabold">
                    {liveCounters.expiring30Count}
                  </span>
                )}
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileExpiry.main}</div>
                {tileExpiry.sub && <div className="text-[11px] sm:text-xs text-semantic-orange font-bold mt-0.5 truncate">{tileExpiry.sub}</div>}
              </div>
            </div>

            {/* Udhaar */}
            <div
              onClick={() => handleTileClick('udhaar')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-semantic-yellow flex items-center justify-center mb-2">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileUdhaar.main}</div>
                {tileUdhaar.sub && <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{tileUdhaar.sub}</div>}
              </div>
            </div>

            {/* Close Day (Din Band) */}
            <div
              onClick={() => handleTileClick('din_band')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-semantic-red flex items-center justify-center mb-2">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileDinBand.main}</div>
                {tileDinBand.sub && <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{tileDinBand.sub}</div>}
              </div>
            </div>

            {/* Owner Mode */}
            <div
              onClick={() => handleTileClick('owner')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 active:scale-[0.99] cursor-pointer min-h-[100px] sm:min-h-[115px]"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center mb-2">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold leading-tight">{tileOwner.main}</div>
                {tileOwner.sub && <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">{tileOwner.sub}</div>}
              </div>
            </div>
          </div>

          {/* TODAY'S SUMMARY STRIP: CLEAN 2X2 GRID */}
          <div className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {/* Sales */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex flex-col justify-center">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{t('home.stat_sales')}</div>
                <div className="text-xl sm:text-2xl font-black text-brand tracking-tight leading-none truncate">
                  {formatRupees(liveCounters.todaySalesPaise)}
                </div>
              </div>

              {/* Bills */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex flex-col justify-center">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{t('home.stat_bills')}</div>
                <div className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
                  {liveCounters.todayBillsCount}
                </div>
              </div>

              {/* Expiring 30d */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-orange-50/60 dark:bg-orange-950/30 flex flex-col justify-center">
                <div className="text-xs font-semibold text-semantic-orange mb-0.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span>{t('home.stat_expiry')}</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-semantic-orange tracking-tight leading-none">
                  {t('home.dawai_count').replace(/^0/, String(liveCounters.expiring30Count))}
                </div>
              </div>

              {/* Low Stock */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-red-50/60 dark:bg-rose-950/30 flex flex-col justify-center">
                <div className="text-xs font-semibold text-semantic-red mb-0.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span>{t('home.stat_low_stock')}</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-semantic-red tracking-tight leading-none">
                  {t('home.dawai_count').replace(/^0/, String(liveCounters.lowStockCount))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Customers & Suppliers Chips on Mobile (>= 48px tall) */}
          <div className="flex items-center gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={() => setActivePage('customers')}
              className="flex-1 min-h-[48px] px-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-100 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99] cursor-pointer min-w-0"
            >
              <Icon name="groups" className="text-[20px] text-brand shrink-0" />
              <span className="truncate">{tButton('customers.nav_customers').main}</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePage('suppliers')}
              className="flex-1 min-h-[48px] px-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-100 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99] cursor-pointer min-w-0"
            >
              <Icon name="local_shipping" className="text-[20px] text-brand shrink-0" />
              <span className="truncate">{tButton('suppliers.nav_suppliers').main}</span>
            </button>
          </div>

          {/* FIXED ANDROID-READY BOTTOM NAVIGATION BAR */}
          <MobileBottomNav activeTab="home" onSelectTab={handleMobileTabSelect} />

          {/* Owner PIN Gate Modal */}
          <OwnerPinGate
            isOpen={isOwnerGateOpen}
            onSuccess={handleOwnerGateSuccess}
            onClose={() => setIsOwnerGateOpen(false)}
          />

        </div>
      </div>
    );
  }

  // MAIN HOME VIEW
  return (
    <div className="w-full min-h-dvh bg-canvas dark:bg-[#0f1713] text-[#101828] dark:text-gray-100 flex flex-col justify-between p-3 sm:p-4 lg:p-6 antialiased select-none transition-colors">
      <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col justify-between relative">
        
        {/* TOP BAR (App screen top bar) */}
        <header className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 px-4 sm:px-7 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-4">
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
            {/* StatusChip: Truthful Cloud / Local Mode */}
            {syncState?.cloudEnabled ? (
              syncState.status === 'not_connected' ? (
                <StatusChip
                  variant="pending_sync"
                  label={t('cloud_sync.status_sign_in_required')}
                  className="cursor-pointer"
                  onClick={handleOpenCloudSync}
                />
              ) : syncState.status === 'offline' ? (
                <StatusChip
                  variant="offline"
                  label={syncState.chipLabel}
                  className="cursor-pointer"
                  onClick={handleOpenCloudSync}
                />
              ) : syncState.status === 'failed' ? (
                <StatusChip
                  variant="sync_failed"
                  label={syncState.chipLabel}
                  className="cursor-pointer"
                  onClick={handleOpenCloudSync}
                />
              ) : (
                <StatusChip
                  variant="synced"
                  label={syncState.chipLabel}
                  className="cursor-pointer"
                  onClick={handleOpenCloudSync}
                />
              )
            ) : (
              <StatusChip
                variant="local"
                label={syncState?.chipLabel || modeLabel}
                className="cursor-pointer"
                onClick={handleOpenCloudSync}
              />
            )}

            {/* StatusChip: Backup status truthfully (RULES.md / DECISIONS.md) */}
            {backupStatus.isToday ? (
              <StatusChip
                variant="backup_today"
                label={t('status.backup_today')}
                className="cursor-pointer"
                onClick={handleOpenBackup}
              />
            ) : (
              <StatusChip
                variant="backup_needed"
                label={backupBtn.main}
                className="cursor-pointer"
                onClick={handleOpenBackup}
              />
            )}

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

            {/* Quick Customers Button */}
            <button
              type="button"
              onClick={() => setActivePage('customers')}
              className="h-10 px-3.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface font-bold text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('customers.page_title')}
            >
              <Icon name="groups" className="text-[18px] text-primary" />
              <span>{tButton('customers.nav_customers').main}</span>
            </button>

            {/* Approvals Inbox shortcut */}
            {currentUser?.role === 'owner' && (
              <button
                type="button"
                onClick={handleOpenApprovals}
                className="h-10 px-3.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface font-bold text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                title={t('remote_approval.inbox_title')}
              >
                <Icon name="verified_user" className="text-[18px] text-primary" />
                <span>{t('remote_approval.inbox_title')}</span>
              </button>
            )}

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

        {/* Sync Failed Banner (10c_Home_Cloud_SyncFailed.html) */}
        {syncState?.bannerVisible && syncState.bannerType === 'failed' && (
          <div className="w-full bg-[#FEF3F2] dark:bg-[#2c1514] border-2 border-[#FCA5A5] dark:border-[#7f1d1d] rounded-2xl px-6 py-3.5 flex items-center justify-between mt-4 animate-fadeIn">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#FEE4E2] dark:bg-[#3f1917] border border-[#FCA5A5] dark:border-[#7f1d1d] flex items-center justify-center text-[#D92D20] dark:text-[#f87171] shrink-0">
                <Icon name="warning" className="text-[28px]" />
              </div>
              <div className="flex flex-col">
                <div className="text-xl font-black text-[#B91C1C] dark:text-[#fca5a5] flex items-center gap-2">
                  <span>{t('cloud_sync.status_failed')}</span>
                  <span>·</span>
                  <span>{t('cloud_sync.pending_outbox', { count: syncState.pendingCount })}</span>
                </div>
                <span className="text-base font-semibold text-[#D92D20] dark:text-[#f87171]">
                  {syncState.lastError || 'Network error aayi — kripya dobara try karein'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  runSyncCycle({ force: true }).then(() => getHomeSyncState().then(setSyncState));
                }}
                className="h-14 min-w-[200px] px-6 bg-[#D92D20] hover:brightness-105 active:scale-[0.99] text-white rounded-2xl font-bold flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all border border-[#B91C1C]"
              >
                <span className="text-lg font-bold leading-tight">{t('cloud_sync.btn_retry').main}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80 leading-none">
                  {t('cloud_sync.btn_retry').sub}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Offline Banner (10b_Home_Cloud_Offline.html) */}
        {syncState?.bannerVisible && syncState.bannerType === 'offline' && (
          <div className="w-full bg-[#FFFAEB] dark:bg-[#2b1f0c] border-2 border-[#FEDF89] dark:border-[#78350f] rounded-2xl px-6 py-3.5 flex items-center justify-between mt-4 animate-fadeIn">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#FEF0C7] dark:bg-[#451a03] border border-[#FEDF89] dark:border-[#78350f] flex items-center justify-center text-[#B54708] dark:text-[#fde68a] shrink-0">
                <Icon name="wifi_off" className="text-[28px]" />
              </div>
              <div className="flex flex-col">
                <div className="text-xl font-black text-[#B54708] dark:text-[#fde68a] flex items-center gap-2">
                  <span>Offline mode</span>
                  <span>·</span>
                  <span>{t('cloud_sync.pending_outbox', { count: syncState.pendingCount })}</span>
                </div>
                <span className="text-base font-semibold text-[#B54708] dark:text-[#fde68a]">
                  Internet wapas aane par automatically sync ho jayega
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Red backup warning banner (RULES.md: Red banner on Home if last backup is older than 3 days / none taken) */}
        {backupStatus.isOlderThan3Days && (
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
                disabled={isBackingUp}
                onClick={handleBackupNowFromBanner}
                className="h-14 min-w-[200px] px-6 bg-[#D92D20] hover:brightness-105 active:scale-[0.99] disabled:opacity-70 text-white rounded-2xl font-bold flex flex-col items-center justify-center shadow-sm cursor-pointer transition-all border border-[#B91C1C]"
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
        )}

        {/* MAIN AREA: 8 BIG SQUARE TILES IN A GRID */}
        <main className="w-full flex-1 flex items-center justify-center py-4 sm:py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 w-full max-w-[1392px]">
            
            {/* Tile 1: Dawai Becho (Sell, green, largest and first) */}
            <div
              onClick={() => handleTileClick('dawai_becho')}
              className="bg-brand text-white rounded-2xl flex flex-col justify-between shadow-lg shadow-brand/20 border-2 border-brand hover:brightness-105 cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-white/20 flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight">{tileDawaiBecho.main}</div>
                {tileDawaiBecho.sub ? <div className="text-xs sm:text-base text-white/85 font-medium mt-0.5">{tileDawaiBecho.sub}</div> : null}
              </div>
            </div>

            {/* Tile 2: Fast Bill (Rush) */}
            <div
              onClick={() => handleTileClick('fast_bill')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-semantic-blue flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileFastBill.main}</div>
                {tileFastBill.sub ? <div className="text-xs sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileFastBill.sub}</div> : null}
              </div>
            </div>

            {/* Tile 3: Stock Jodo (Add stock) */}
            <div
              onClick={() => handleTileClick('stock_jodo')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-green-50 dark:bg-green-950/50 text-brand flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileStockJodo.main}</div>
                {tileStockJodo.sub ? <div className="text-xs sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileStockJodo.sub}</div> : null}
              </div>
            </div>

            {/* Tile 4: Stock Dekho (View stock) */}
            <div
              onClick={() => handleTileClick('stock_dekho')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-slate-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileStockDekho.main}</div>
                {tileStockDekho.sub ? <div className="text-xs sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileStockDekho.sub}</div> : null}
              </div>
            </div>

            {/* Tile 5: Expiry (Alerts, orange accent) */}
            <div
              onClick={() => handleTileClick('expiry')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border-2 border-semantic-orange/30 dark:border-semantic-orange/40 hover:border-semantic-orange hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-semantic-orangeBg dark:bg-orange-950/40 text-semantic-orange flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                </div>
                {liveCounters.expiring30Count > 0 && (
                  <span className="px-2 sm:px-2.5 py-0.5 rounded-full bg-semantic-orange text-white text-xs sm:text-sm font-extrabold">
                    {liveCounters.expiring30Count}
                  </span>
                )}
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileExpiry.main}</div>
                {tileExpiry.sub ? <div className="text-xs sm:text-base text-semantic-orange font-bold mt-0.5">{tileExpiry.sub}</div> : null}
              </div>
            </div>

            {/* Tile 6: Udhaar (Credit) */}
            <div
              onClick={() => handleTileClick('udhaar')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-semantic-yellow flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileUdhaar.main}</div>
                {tileUdhaar.sub ? <div className="text-xs sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileUdhaar.sub}</div> : null}
              </div>
            </div>

            {/* Tile 7: Din Band (Close day) */}
            <div
              onClick={() => handleTileClick('din_band')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-semantic-red flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileDinBand.main}</div>
                {tileDinBand.sub ? <div className="text-xs sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileDinBand.sub}</div> : null}
              </div>
            </div>

            {/* Tile 8: Owner (key icon, Owner PIN gate) */}
            <div
              onClick={() => handleTileClick('owner')}
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-2xl flex flex-col justify-between shadow-sm border border-gray-200/90 dark:border-gray-800 hover:border-brand/50 hover:shadow-md cursor-pointer transition min-h-[160px] sm:h-[200px] lg:h-[225px] p-4 sm:p-5 lg:p-6 active:scale-[0.99]"
            >
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tileOwner.main}</div>
                {tileOwner.sub ? <div className="text-xs sm:text-base text-gray-500 dark:text-gray-400 font-medium mt-0.5">{tileOwner.sub}</div> : null}
              </div>
            </div>

          </div>
        </main>

        {/* BELOW: SUMMARY STRIP WITH REAL DATABASE VALUES */}
        <footer className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-800 p-5 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800 gap-y-4 md:gap-y-0">
            
            {/* Metric 1: Aaj ki bikri */}
            <div className="px-6 flex flex-col justify-center">
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('home.stat_sales')}</div>
              <div className="text-[38px] font-black text-brand tracking-tight leading-none">
                {formatRupees(liveCounters.todaySalesPaise)}
              </div>
            </div>

            {/* Metric 2: Bills */}
            <div className="px-6 flex flex-col justify-center">
              <div className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('home.stat_bills')}</div>
              <div className="text-[38px] font-black text-gray-900 dark:text-white tracking-tight leading-none">
                {liveCounters.todayBillsCount}
              </div>
            </div>

            {/* Metric 3: Expiry 30 din (orange) */}
            <div className="px-6 flex flex-col justify-center">
              <div className="flex items-center space-x-2 text-lg font-semibold text-semantic-orange mb-1">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{t('home.stat_expiry')}</span>
              </div>
              <div className="text-[38px] font-black text-semantic-orange tracking-tight leading-none">
                {t('home.dawai_count').replace(/^0/, String(liveCounters.expiring30Count))}
              </div>
            </div>

            {/* Metric 4: Kam stock (red) */}
            <div className="px-6 flex flex-col justify-center">
              <div className="flex items-center space-x-2 text-lg font-semibold text-semantic-red mb-1">
                <svg className="w-5 h-5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span>{t('home.stat_low_stock')}</span>
              </div>
              <div className="text-[38px] font-black text-semantic-red tracking-tight leading-none">
                {t('home.dawai_count').replace(/^0/, String(liveCounters.lowStockCount))}
              </div>
            </div>

          </div>
        </footer>

        {/* 32a Owner PIN Gate Dialog */}
        <OwnerPinGate
          isOpen={isOwnerGateOpen}
          onSuccess={handleOwnerGateSuccess}
          onClose={() => setIsOwnerGateOpen(false)}
        />

      </div>
    </div>
  );
};

export default Home;
