import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { MobileTopBar } from '../components/MobileTopBar';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { db, type DBUser } from '../db';
import {
  getCloudConfig,
  getHomeSyncState,
  saveCloudConfig,
  runSyncCycle,
  retryFailedSyncItems,
  backfillLocalDataToCloud,
  formatTimeHoursMinutes,
  startRealtimeSync,
  stopRealtimeSync,
  subscribeToSyncUpdates,
  registerCurrentDeviceInCloud,
  listConnectedDevices,
  type CloudConfig,
  type HomeSyncState,
  type ConnectedDeviceInfo,
} from '../logic/cloudSync';
import { triggerFeedback } from '../logic/feedback';
import { CloudAccountAuth } from './CloudAccountAuth';
import { getCurrentCloudSession, signOutOwner } from '../logic/cloudAuth';
import { useBackHandler } from '../logic/androidBack';

export interface OwnerCloudSyncProps {
  currentUser?: DBUser | null;
  onBack: () => void;
  onReturnHome?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OwnerCloudSync: React.FC<OwnerCloudSyncProps> = ({
  currentUser: _currentUser,
  onBack,
  onReturnHome,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, address: shopAddress } = useShop();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [syncState, setSyncState] = useState<HomeSyncState | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form fields & Cloud Auth state
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [shopSyncId, setShopSyncId] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [cloudShopUuid, setCloudShopUuid] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [highlightConnect, setHighlightConnect] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDeviceInfo[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const ownerAccountRef = useRef<HTMLElement | null>(null);

  useBackHandler(isAuthModalOpen, () => setIsAuthModalOpen(false));

  // Button labels
  const btnBack = tButton('cloud_sync.btn_back');
  const btnHome = tButton('common.btn_home');
  const btnSyncNow = tButton('cloud_sync.btn_sync_now');
  const btnPushLocal = tButton('cloud_sync.btn_push_local_data');
  const btnSave = tButton('cloud_sync.btn_save');
  const btnLinkDevice = tButton('cloud_sync.btn_link_device');
  const btnSignOut = tButton('cloud_sync.btn_sign_out');
  const btnConnect = tButton('cloud_sync.btn_sign_in_connect');
  const btnRetry = tButton('cloud_sync.btn_retry');

  const refreshSyncStatus = useCallback(async () => {
    const [updatedConfig, updatedState, remaining] = await Promise.all([
      getCloudConfig(),
      getHomeSyncState(),
      db.syncOutbox.where('status').equals('pending').count(),
    ]);
    setConfig(updatedConfig);
    setSyncState(updatedState);
    setPendingCount(remaining);
    return { updatedConfig, updatedState, remaining };
  }, []);

  const refreshConnectedDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      await registerCurrentDeviceInCloud().catch(() => {});
      const list = await listConnectedDevices();
      setConnectedDevices(list);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [cfg, state, session, count] = await Promise.all([
        getCloudConfig(),
        getHomeSyncState(),
        getCurrentCloudSession(),
        db.syncOutbox.where('status').equals('pending').count(),
      ]);
      setConfig(cfg);
      setSyncState(state);
      setCloudEnabled(cfg.cloudEnabled);
      setDeviceName(cfg.deviceName);
      setShopSyncId(cfg.shopSyncId);
      setIsAuthenticated(session.isAuthenticated);
      setOwnerEmail(session.isAuthenticated ? session.ownerEmail || '' : '');
      setCloudShopUuid(session.isAuthenticated ? session.cloudShopUuid || '' : '');
      setPendingCount(count);
      void refreshConnectedDevices();
    } catch (err) {
      console.error('Failed to load cloud config:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshConnectedDevices]);

  useEffect(() => {
    loadData();
    return subscribeToSyncUpdates((entities) => {
      void refreshSyncStatus().catch(() => {});
      if (entities.includes('device') || entities.includes('workspace_switched')) {
        void listConnectedDevices().then(setConnectedDevices).catch(() => {});
      }
    });
  }, [loadData, refreshSyncStatus]);

  const handleToggleMode = async (enabled: boolean) => {
    setCloudEnabled(enabled);
    try {
      const updated = await saveCloudConfig({ cloudEnabled: enabled });
      setConfig(updated);
      const [session, updatedState] = await Promise.all([
        getCurrentCloudSession(),
        getHomeSyncState(),
      ]);
      const connected = session.isAuthenticated;
      setIsAuthenticated(connected);
      setOwnerEmail(connected ? session.ownerEmail || '' : '');
      setCloudShopUuid(connected ? session.cloudShopUuid || '' : '');
      setSyncState(updatedState);

      if (enabled && !connected) {
        setHighlightConnect(true);
        setTimeout(() => {
          ownerAccountRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      } else if (enabled && connected) {
        setHighlightConnect(false);
        void startRealtimeSync(session.cloudShopUuid || undefined).catch(() => {});
        void runSyncCycle().then(() => refreshSyncStatus()).catch(() => {});
      } else {
        setHighlightConnect(false);
        stopRealtimeSync();
      }
    } catch {
      triggerFeedback('error', t('common.error_occurred'));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutOwner();
      setIsAuthenticated(false);
      setCloudEnabled(false);
      setOwnerEmail('');
      setCloudShopUuid('');
      setHighlightConnect(false);
      triggerFeedback('info', t('cloud_auth.toast_signout_local_mode'));
      await loadData();
    } catch {
      triggerFeedback('error', t('common.error_occurred'));
    }
  };

  const handleSaveConfig = async () => {
    try {
      const updated = await saveCloudConfig({
        cloudEnabled,
        deviceName: deviceName.trim(),
        shopSyncId: shopSyncId.trim().toUpperCase(),
      });
      setConfig(updated);
      await registerCurrentDeviceInCloud(deviceName.trim()).catch(() => {});
      const list = await listConnectedDevices().catch(() => []);
      if (list.length > 0) setConnectedDevices(list);
      triggerFeedback('success', t('cloud_sync.toast_device_linked'));
    } catch {
      triggerFeedback('error', t('common.error_occurred'));
    }
  };

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await runSyncCycle({ force: true });
      const { remaining } = await refreshSyncStatus();
      await refreshConnectedDevices();

      if (res.success) {
        triggerFeedback('success', t('cloud_sync.toast_synced'));
      } else {
        triggerFeedback(
          'error',
          res.offline
            ? t('cloud_sync.status_offline', { count: remaining })
            : t('cloud_sync.toast_failed', { error: res.lastError || 'Network Error' })
        );
      }
    } catch (err: any) {
      triggerFeedback('error', t('cloud_sync.toast_failed', { error: err?.message || 'Error' }));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    if (isSyncing || isBackfilling) return;
    setIsSyncing(true);
    try {
      await retryFailedSyncItems();
      const res = await runSyncCycle();
      const { remaining } = await refreshSyncStatus();
      await refreshConnectedDevices();

      if (res.success) {
        triggerFeedback('success', t('cloud_sync.toast_synced'));
      } else {
        triggerFeedback(
          'error',
          res.offline
            ? t('cloud_sync.status_offline', { count: remaining })
            : t('cloud_sync.toast_failed', { error: res.lastError || 'Network Error' })
        );
      }
    } catch (err: any) {
      await refreshSyncStatus().catch(() => {});
      triggerFeedback('error', t('cloud_sync.toast_failed', { error: err?.message || 'Error' }));
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushLocalData = async () => {
    if (isBackfilling || isSyncing) return;
    setIsBackfilling(true);
    try {
      const res = await backfillLocalDataToCloud();
      await refreshSyncStatus();

      if (res.success) {
        triggerFeedback(
          'success',
          t('cloud_sync.toast_backfill_success', {
            count: res.syncedCount || res.enqueuedCount,
          })
        );
      } else {
        triggerFeedback(
          'error',
          t('cloud_sync.toast_backfill_failed', {
            error: res.lastError || t('common.error_occurred'),
          })
        );
      }
    } catch (err: any) {
      triggerFeedback(
        'error',
        t('cloud_sync.toast_backfill_failed', { error: err?.message || 'Error' })
      );
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleCopyId = () => {
    if (shopSyncId) {
      navigator.clipboard?.writeText(shopSyncId);
      setCopiedId(true);
      triggerFeedback('success', t('cloud_sync.toast_copied'));
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const storeSlug = (shopName || 'my-shop')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const ownerWebAppUrl = `https://hospivo.in/${storeSlug || 'pharmacy'}`;

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(ownerWebAppUrl);
    setCopiedLink(true);
    triggerFeedback('success', t('cloud_sync.toast_copied'));
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (isAuthModalOpen) {
    return (
      <CloudAccountAuth
        theme={theme}
        onToggleTheme={onToggleTheme}
        shopName={shopName}
        shopSyncId={shopSyncId}
        onSuccess={(sess) => {
          setIsAuthModalOpen(false);
          if (sess.startedCleanSetup) {
            // App root listens for workspace_reset and transitions cleanly to fresh Cloud Setup
            return;
          }
          setIsAuthenticated(true);
          setOwnerEmail(sess.email);
          if (sess.cloudShopUuid) setCloudShopUuid(sess.cloudShopUuid);
          if (sess.shopSyncId) setShopSyncId(sess.shopSyncId);
          setCloudEnabled(true);
          setHighlightConnect(false);
          void startRealtimeSync(sess.cloudShopUuid).catch(() => {});
          loadData();
        }}
        onCancel={() => setIsAuthModalOpen(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-surface flex items-center justify-center p-6">
        <span className="text-xl font-bold text-on-surface">{t('common.loading')}</span>
      </div>
    );
  }

  const isCloudConnected = isAuthenticated;
  const isAutoSyncActive = cloudEnabled && isCloudConnected;

  const lastSyncStr = config?.lastCloudSyncAt
    ? formatTimeHoursMinutes(config.lastCloudSyncAt)
    : '--:--';

  const mobileSubtitle = !cloudEnabled
    ? t('cloud_sync.local_mode_title')
    : !isCloudConnected
      ? t('cloud_sync.status_sign_in_required')
      : syncState?.status === 'failed'
        ? t('cloud_sync.status_failed')
        : syncState?.status === 'offline'
          ? t('cloud_sync.status_offline', { count: pendingCount })
          : t('cloud_sync.status_synced', { time: lastSyncStr });

  return (
    <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col justify-between overflow-x-clip selection:bg-primary-fixed selection:text-on-primary-fixed">
      {/* Compact Mobile Header */}
      <MobileTopBar
        title={t('cloud_sync.title')}
        subtitle={mobileSubtitle}
        onBack={onBack}
        backIcon="arrow_back"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* Desktop Top Bar matching Hospivo standards */}
      <header className="hidden lg:flex h-20 w-full px-4 sm:px-8 border-b border-outline-variant/30 bg-surface-container-lowest items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
            <Icon name="cloud_sync" className="text-[28px]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface leading-tight">
              {t('cloud_sync.title')}
            </h1>
            <span className="text-sm text-outline font-medium">
              {t('cloud_sync.sub')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Status chip */}
          {!cloudEnabled ? (
            <div className="flex items-center gap-2 bg-surface-container-low text-on-surface-variant border border-outline-variant px-3 sm:px-4 py-2 rounded-xl font-semibold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-outline inline-block" />
              <span>{t('cloud_sync.local_mode_title')}</span>
            </div>
          ) : !isCloudConnected ? (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 bg-[#FEF6EE] dark:bg-amber-950/40 text-[#B54708] dark:text-amber-300 border border-[#FEDF89] dark:border-amber-800 px-3 sm:px-4 py-2 rounded-xl font-bold text-sm cursor-pointer hover:brightness-95 transition-all"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#F79009] inline-block" />
              <span>{t('cloud_sync.status_sign_in_required')}</span>
            </button>
          ) : syncState?.status === 'failed' ? (
            <div className="flex items-center gap-2 bg-[#FEF3F2] dark:bg-red-950/40 text-[#D92D20] dark:text-red-300 border border-[#FCA5A5] dark:border-red-800 px-3 sm:px-4 py-2 rounded-xl font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D92D20] inline-block" />
              <span>{t('cloud_sync.status_failed')}</span>
            </div>
          ) : syncState?.status === 'offline' ? (
            <div className="flex items-center gap-2 bg-[#FEF6EE] dark:bg-amber-950/40 text-[#B54708] dark:text-amber-300 border border-[#FEDF89] dark:border-amber-800 px-3 sm:px-4 py-2 rounded-xl font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F79009] inline-block" />
              <span>{t('cloud_sync.status_offline', { count: pendingCount })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-[#E8F5E9] dark:bg-green-950/40 text-[#1B8F4A] dark:text-green-300 border border-[#A5D6A7] dark:border-green-800 px-3 sm:px-4 py-2 rounded-xl font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] inline-block animate-pulse" />
              <span>{t('cloud_sync.status_synced', { time: lastSyncStr })}</span>
            </div>
          )}

          {/* Light/Dark theme toggle */}
          {onToggleTheme && (
            <button
              type="button"
              aria-label={t('common.toggle_theme')}
              onClick={onToggleTheme}
              className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
            </button>
          )}

          <FullscreenButton className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant" />

          {/* Home button */}
          <button
            type="button"
            onClick={onReturnHome || onBack}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-surface-container rounded-xl border border-outline-variant hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <Icon name="home" className="text-primary text-[20px]" />
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm text-on-surface leading-none">{btnHome.main}</span>
              {btnHome.sub && (
                <span className="text-[10px] text-outline font-normal leading-none mt-0.5">{btnHome.sub}</span>
              )}
            </div>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-8 py-4 sm:py-6 flex flex-col gap-4 sm:gap-6 min-w-0">
        {/* Mode Selector Card */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 border border-outline-variant/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <Icon name="dns" className="text-[26px] sm:text-[28px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base sm:text-lg font-bold text-on-surface leading-tight break-words">
                {cloudEnabled ? t('cloud_sync.cloud_mode_title') : t('cloud_sync.local_mode_title')}
              </span>
              <span className="text-xs sm:text-sm text-on-surface-variant font-medium break-words">
                {cloudEnabled ? t('cloud_sync.cloud_mode_sub') : t('cloud_sync.local_mode_sub')}
              </span>
            </div>
          </div>

          <div className="inline-flex p-1.5 bg-surface-container-high rounded-2xl gap-1.5 sm:gap-2 self-stretch sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => handleToggleMode(false)}
              className={`flex-1 sm:flex-none min-h-[44px] px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                !cloudEnabled
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('cloud_sync.local_mode_title')}
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode(true)}
              className={`flex-1 sm:flex-none min-h-[44px] px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                cloudEnabled
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('cloud_sync.cloud_mode_title')}
            </button>
          </div>
        </section>

        {/* SECTION 1: Shop & Device Pairing (matching 02b) */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-4 sm:gap-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20 shrink-0">
                1
              </span>
              <div className="flex flex-col min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-on-surface leading-tight break-words">
                  {t('cloud_sync.link_device_title')}
                </h2>
                <span className="text-xs text-outline break-words">{t('cloud_sync.link_device_sub')}</span>
              </div>
            </div>
            {isAutoSyncActive ? (
              <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full flex items-center gap-1.5 shrink-0">
                <Icon name="check_circle" className="text-[16px] shrink-0" />
                <span>{t('cloud_sync.auto_sync_active')}</span>
              </span>
            ) : cloudEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setHighlightConnect(true);
                  ownerAccountRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="text-xs font-bold text-[#B54708] dark:text-amber-300 bg-[#FEF6EE] dark:bg-amber-950/40 border border-[#FEDF89] dark:border-amber-800 px-3 py-1 rounded-full flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Icon name="warning" className="text-[16px] shrink-0" />
                <span>{t('cloud_sync.status_sign_in_required')}</span>
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-stretch">
            {/* Shop info preview (4 cols) */}
            <div className="md:col-span-4 min-h-[60px] py-2.5 px-4 bg-surface-container-low border border-outline-variant/40 rounded-xl flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Icon name="storefront" className="text-[22px]" />
              </div>
              <div className="leading-tight min-w-0 flex-1">
                <p className="text-sm sm:text-base font-bold text-on-surface truncate">{shopName}</p>
                <p className="text-xs text-outline truncate">{shopAddress || 'Active Store Branch'}</p>
              </div>
            </div>

            {/* Device Name Input (5 cols) */}
            <div className="md:col-span-5 min-h-[56px] relative flex items-center">
              <span className="absolute left-3.5 text-primary pointer-events-none">
                <Icon name="computer" className="text-[22px]" />
              </span>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Counter PC 1 (Billing Desk)"
                className="w-full min-h-[56px] py-2.5 pl-11 pr-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-base font-semibold text-on-surface focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Save / Link Device Button (3 cols) */}
            <button
              type="button"
              onClick={handleSaveConfig}
              className="md:col-span-3 min-h-[56px] py-2.5 px-3 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 text-primary flex flex-col items-center justify-center transition-colors cursor-pointer min-w-0"
            >
              <div className="flex items-center gap-1.5 font-bold text-sm sm:text-base leading-tight">
                <Icon name="link" className="text-[20px] shrink-0" />
                <span className="break-words">{btnLinkDevice.main}</span>
              </div>
              {btnLinkDevice.sub && (
                <span className="text-xs font-medium text-primary/80 leading-tight mt-0.5 break-words">{btnLinkDevice.sub}</span>
              )}
            </button>
          </div>

          {/* Shop Sync ID Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-center pt-2 border-t border-outline-variant/20">
            <div className="md:col-span-4 flex flex-col min-w-0">
              <span className="text-sm font-bold text-on-surface">{t('cloud_sync.shop_sync_id')}</span>
              <span className="text-xs text-outline">{t('cloud_sync.shop_sync_id_sub')}</span>
            </div>
            <div className="md:col-span-5 min-w-0">
              <div className="min-h-[52px] py-2.5 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-sm sm:text-base font-mono font-bold text-on-surface flex items-center tracking-wider break-all">
                {shopSyncId}
              </div>
            </div>
            <div className="md:col-span-3">
              <button
                type="button"
                onClick={handleCopyId}
                className="w-full min-h-[52px] py-2.5 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Icon name={copiedId ? 'check' : 'content_copy'} className="text-[18px] shrink-0" />
                <span>{copiedId ? t('cloud_sync.toast_copied') : t('cloud_sync.btn_copy_id')}</span>
              </button>
            </div>
          </div>

          {/* Connected Devices List */}
          <div className="pt-3 border-t border-outline-variant/20 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-on-surface">
                {t('cloud_sync.connected_devices_title', { count: connectedDevices.length })}
              </span>
              <button
                type="button"
                onClick={() => void refreshConnectedDevices()}
                disabled={isLoadingDevices}
                className="min-h-[36px] px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-bold text-primary flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Icon name="refresh" className={`text-[16px] ${isLoadingDevices ? 'animate-spin' : ''}`} />
                <span>{t('cloud_sync.btn_sync_now').main}</span>
              </button>
            </div>

            {connectedDevices.length <= 1 ? (
              <p className="text-xs text-outline">{t('cloud_sync.connected_devices_empty')}</p>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {connectedDevices.map((dev) => (
                <div
                  key={dev.deviceId}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 min-w-0 ${
                    dev.isCurrentDevice
                      ? 'bg-primary/5 border-primary/40'
                      : 'bg-surface-container-low border-outline-variant/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                      <Icon
                        name={dev.platform.includes('Android') ? 'smartphone' : 'computer'}
                        className="text-[20px]"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-bold text-on-surface truncate">{dev.deviceName}</span>
                        {dev.isCurrentDevice && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-on-primary shrink-0">
                            {t('cloud_sync.this_device_badge')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-outline block truncate">
                        {dev.platform} · {t('cloud_sync.last_seen_prefix')}{' '}
                        {new Date(dev.lastSeenAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 2: Owner Cloud Account */}
        <section
          ref={ownerAccountRef}
          className={`bg-surface-container-lowest rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col gap-4 transition-all min-w-0 ${
            cloudEnabled && !isCloudConnected
              ? highlightConnect
                ? 'border-2 border-[#F79009] ring-4 ring-[#F79009]/20'
                : 'border-2 border-[#FEDF89] dark:border-amber-700'
              : 'border border-outline-variant/40'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20 shrink-0">
                2
              </span>
              <div className="flex flex-col min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-on-surface leading-tight break-words">
                  {t('cloud_sync.owner_account_title')}
                </h2>
                <span className="text-xs text-outline break-words">{t('cloud_sync.owner_account_sub')}</span>
              </div>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${
              isCloudConnected
                ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30'
                : cloudEnabled
                  ? 'bg-[#FEF6EE] dark:bg-amber-950/40 text-[#B54708] dark:text-amber-300 border-[#FEDF89] dark:border-amber-800'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant'
            }`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                isCloudConnected
                  ? 'bg-green-600 animate-pulse'
                  : cloudEnabled
                    ? 'bg-[#F79009]'
                    : 'bg-outline'
              }`} />
              <span>
                {isCloudConnected
                  ? t('cloud_sync.status_connected')
                  : cloudEnabled
                    ? t('cloud_sync.status_sign_in_required')
                    : t('cloud_sync.status_not_connected')}
              </span>
            </div>
          </div>

          {cloudEnabled && !isCloudConnected && (
            <div className="p-3.5 rounded-xl bg-[#FEF6EE] dark:bg-amber-950/30 border border-[#FEDF89] dark:border-amber-800 flex items-start gap-2.5 text-sm text-[#B54708] dark:text-amber-200 font-semibold">
              <Icon name="info" className="text-[20px] shrink-0 mt-0.5 text-[#F79009]" />
              <span className="min-w-0 break-words">{t('cloud_sync.sign_in_required_banner')}</span>
            </div>
          )}

          <div className="p-3.5 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
                <Icon name="account_circle" className="text-[26px] sm:text-[28px]" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold text-on-surface break-all">
                  {isCloudConnected && ownerEmail ? ownerEmail : t('cloud_sync.status_not_connected')}
                </span>
                <span className="text-xs text-outline break-all">
                  {isCloudConnected && cloudShopUuid ? `ID: ${cloudShopUuid}` : t('cloud_auth.modal_sub')}
                </span>
              </div>
            </div>

            {isCloudConnected ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[48px] py-2 px-4 w-full sm:w-auto rounded-xl bg-surface-container hover:bg-error/10 text-error border border-error/30 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              >
                <Icon name="logout" className="text-[18px] shrink-0" />
                <span>{btnSignOut.main}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className={`min-h-[48px] py-2 px-5 w-full sm:w-auto rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm shrink-0 ${
                  highlightConnect ? 'ring-4 ring-primary/30 scale-[1.02]' : ''
                }`}
              >
                <Icon name="login" className="text-[18px] shrink-0" />
                <span>{btnConnect.main}</span>
              </button>
            )}
          </div>
        </section>

        {/* SECTION 3: Kya Sync Hoga (matching 02b) */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20 shrink-0">
                3
              </span>
              <div className="flex flex-col min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-on-surface leading-tight break-words">
                  {t('cloud_sync.sync_items_title')}
                </h2>
                <span className="text-xs text-outline break-words">{t('cloud_sync.sync_items_sub')}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Sales */}
            <div className="p-3 sm:p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between gap-2 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name="receipt_long" className="text-[20px] sm:text-[22px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-on-surface leading-tight truncate">
                    {t('cloud_sync.item_sales')}
                  </p>
                  <p className="text-[11px] sm:text-xs text-outline truncate">{t('cloud_sync.item_sales_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[18px] sm:text-[20px] shrink-0" />
            </div>

            {/* Card 2: Stock */}
            <div className="p-3 sm:p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between gap-2 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name="inventory_2" className="text-[20px] sm:text-[22px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-on-surface leading-tight truncate">
                    {t('cloud_sync.item_stock')}
                  </p>
                  <p className="text-[11px] sm:text-xs text-outline truncate">{t('cloud_sync.item_stock_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[18px] sm:text-[20px] shrink-0" />
            </div>

            {/* Card 3: Udhaar */}
            <div className="p-3 sm:p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between gap-2 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name="menu_book" className="text-[20px] sm:text-[22px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-on-surface leading-tight truncate">
                    {t('cloud_sync.item_udhaar')}
                  </p>
                  <p className="text-[11px] sm:text-xs text-outline truncate">{t('cloud_sync.item_udhaar_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[18px] sm:text-[20px] shrink-0" />
            </div>

            {/* Card 4: Reports */}
            <div className="p-3 sm:p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between gap-2 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name="analytics" className="text-[20px] sm:text-[22px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-on-surface leading-tight truncate">
                    {t('cloud_sync.item_reports')}
                  </p>
                  <p className="text-[11px] sm:text-xs text-outline truncate">{t('cloud_sync.item_reports_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[18px] sm:text-[20px] shrink-0" />
            </div>
          </div>

          {/* Owner Web App Info Banner */}
          <div className="bg-[#EBF3FC] dark:bg-blue-950/40 border border-[#CFE1F7] dark:border-blue-900 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Icon name="language" className="text-[#1976D2] text-[24px] shrink-0 mt-0.5" />
              <div className="text-sm text-[#1E3A5F] dark:text-blue-200 min-w-0 break-words">
                <span className="font-bold">{t('cloud_sync.owner_web_app_link')}</span>{' '}
                <span className="font-mono font-medium underline break-all">{ownerWebAppUrl}</span>{' '}
                <span className="text-xs text-outline">({t('cloud_sync.owner_web_app_sub')})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="min-h-[48px] sm:min-h-[36px] w-full sm:w-auto px-3.5 bg-surface-container-lowest border border-[#B6D4F7] text-[#1976D2] hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-xl sm:rounded-lg flex items-center justify-center gap-1.5 transition-colors font-bold text-xs cursor-pointer shadow-xs shrink-0"
            >
              <Icon name={copiedLink ? 'check' : 'content_copy'} className="text-[16px]" />
              <span>{copiedLink ? t('cloud_sync.toast_copied') : t('cloud_sync.btn_copy_link')}</span>
            </button>
          </div>
        </section>

        {/* Live Outbox & Push Status */}
        <section className="bg-surface-container-low rounded-2xl p-4 sm:p-5 border border-outline-variant/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface shrink-0">
              <Icon name="sync" className={`text-[24px] ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm sm:text-base font-bold text-on-surface break-words">
                {t('cloud_sync.pending_outbox', { count: pendingCount })}
              </span>
              {syncState && syncState.failedCount > 0 && (
                <span className="text-sm font-bold text-error flex items-center gap-1.5 mt-0.5">
                  <Icon name="error" className="text-[16px] shrink-0" />
                  <span className="break-words">
                    {t('cloud_sync.status_failed')} ({syncState.failedCount})
                  </span>
                </span>
              )}
              <span className="text-xs text-outline break-words">
                {!isCloudConnected
                  ? t('cloud_sync.sign_in_required_sub')
                  : config?.lastStatus === 'failed' && config.lastError
                    ? t('cloud_sync.toast_failed', { error: config.lastError })
                    : `Last sync: ${lastSyncStr}`}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 self-stretch sm:self-auto">
            {syncState && syncState.failedCount > 0 && (
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={isSyncing || isBackfilling}
                className="flex-1 sm:flex-none min-h-[56px] py-2.5 px-4 sm:px-5 rounded-2xl bg-[#D92D20] hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed text-white border border-[#B91C1C] font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all min-w-0"
              >
                <Icon name="refresh" className={`text-[20px] shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-sm sm:text-base font-bold leading-tight break-words">{btnRetry.main}</span>
                  {btnRetry.sub && (
                    <span className="text-xs font-normal text-white/80 leading-tight mt-0.5 break-words">
                      {btnRetry.sub}
                    </span>
                  )}
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={handlePushLocalData}
              disabled={isBackfilling || isSyncing || !isAutoSyncActive}
              className="flex-1 sm:flex-none min-h-[52px] py-2.5 px-4 sm:px-5 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant disabled:opacity-50 disabled:cursor-not-allowed text-on-surface font-bold flex items-center justify-center gap-2 cursor-pointer transition-all min-w-0"
            >
              <Icon name="cloud_upload" className={`text-[20px] shrink-0 ${isBackfilling ? 'animate-bounce' : ''}`} />
              <div className="flex flex-col text-left min-w-0">
                <span className="text-sm sm:text-base font-bold leading-tight break-words">{btnPushLocal.main}</span>
                {btnPushLocal.sub && (
                  <span className="text-xs font-normal text-outline leading-tight mt-0.5 break-words">
                    {btnPushLocal.sub}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing || isBackfilling || !isAutoSyncActive}
              className="flex-1 sm:flex-none min-h-[56px] py-2.5 px-5 sm:px-6 rounded-2xl bg-primary hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed text-on-primary font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all min-w-0"
            >
              <Icon name="sync" className={`text-[20px] shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <div className="flex flex-col text-left min-w-0">
                <span className="text-sm sm:text-base font-bold leading-tight break-words">{btnSyncNow.main}</span>
                {btnSyncNow.sub && (
                  <span className="text-xs font-normal text-on-primary/80 leading-tight mt-0.5 break-words">
                    {btnSyncNow.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </section>
      </main>

      {/* Footer Navigation Bar */}
      <footer className="w-full px-3 sm:px-8 py-3 border-t border-outline-variant/30 bg-surface-container-lowest flex items-center justify-between gap-2.5 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[56px] py-2.5 px-3.5 sm:px-6 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center justify-center gap-2 sm:gap-3 transition-colors cursor-pointer border border-outline-variant/40 min-w-0"
        >
          <Icon name="arrow_back" className="text-[20px] sm:text-[22px] shrink-0" />
          <div className="flex flex-col text-left min-w-0">
            <span className="text-sm sm:text-base font-bold leading-tight truncate">{btnBack.main}</span>
            {btnBack.sub && (
              <span className="text-xs text-outline font-medium leading-tight truncate">{btnBack.sub}</span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={handleSaveConfig}
          className="flex-1 sm:flex-none min-h-[56px] py-2.5 px-4 sm:px-8 bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center justify-center gap-2 sm:gap-3 transition-all shadow-md active:scale-95 cursor-pointer font-bold min-w-0"
        >
          <Icon name="check" className="text-[20px] sm:text-[22px] shrink-0" />
          <div className="flex flex-col text-left min-w-0">
            <span className="text-sm sm:text-base font-bold leading-tight truncate">{btnSave.main}</span>
            {btnSave.sub && (
              <span className="text-xs text-on-primary/80 font-normal leading-tight truncate">{btnSave.sub}</span>
            )}
          </div>
        </button>
      </footer>
    </div>
  );
};

export default OwnerCloudSync;
