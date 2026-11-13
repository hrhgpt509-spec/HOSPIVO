import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { db, type DBUser } from '../db';
import {
  getCloudConfig,
  saveCloudConfig,
  runSyncCycle,
  formatTimeHoursMinutes,
  type CloudConfig,
} from '../logic/cloudSync';
import { triggerFeedback } from '../logic/feedback';

export interface OwnerCloudSyncProps {
  currentUser?: DBUser | null;
  onBack: () => void;
}

export const OwnerCloudSync: React.FC<OwnerCloudSyncProps> = ({
  currentUser: _currentUser,
  onBack,
}) => {
  const { t } = useTranslation();
  const { name: shopName, address: shopAddress } = useShop();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form fields
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [shopSyncId, setShopSyncId] = useState('');
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudAnonKey, setCloudAnonKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Button labels
  const btnBack = tButton('cloud_sync.btn_back');
  const btnSyncNow = tButton('cloud_sync.btn_sync_now');
  const btnSave = tButton('cloud_sync.btn_save');
  const btnLinkDevice = tButton('cloud_sync.btn_link_device');

  const loadData = useCallback(async () => {
    try {
      const cfg = await getCloudConfig();
      setConfig(cfg);
      setCloudEnabled(cfg.cloudEnabled);
      setDeviceName(cfg.deviceName);
      setShopSyncId(cfg.shopSyncId);
      setCloudUrl(cfg.cloudUrl);
      setCloudAnonKey(cfg.cloudAnonKey);

      const count = await db.syncOutbox.where('status').equals('pending').count();
      setPendingCount(count);
    } catch (err) {
      console.error('Failed to load cloud config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleMode = async (enabled: boolean) => {
    setCloudEnabled(enabled);
    try {
      const updated = await saveCloudConfig({ cloudEnabled: enabled });
      setConfig(updated);
      triggerFeedback(
        'success',
        enabled ? t('cloud_sync.cloud_mode_title') : t('cloud_sync.local_mode_title')
      );
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
        cloudUrl: cloudUrl.trim(),
        cloudAnonKey: cloudAnonKey.trim(),
      });
      setConfig(updated);
      triggerFeedback('success', t('cloud_sync.toast_saved'));
    } catch {
      triggerFeedback('error', t('common.error_occurred'));
    }
  };

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await runSyncCycle({ force: true });
      const updatedConfig = await getCloudConfig();
      setConfig(updatedConfig);
      const remaining = await db.syncOutbox.where('status').equals('pending').count();
      setPendingCount(remaining);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <span className="text-xl font-bold text-on-surface">{t('common.loading')}</span>
      </div>
    );
  }

  const lastSyncStr = config?.lastCloudSyncAt
    ? formatTimeHoursMinutes(config.lastCloudSyncAt)
    : '--:--';

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-between selection:bg-primary-fixed selection:text-on-primary-fixed">
      {/* Top Bar matching Hospivo standards */}
      <header className="h-20 w-full px-4 sm:px-8 border-b border-outline-variant/30 bg-surface-container-lowest flex items-center justify-between shrink-0 shadow-sm">
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

        <div className="flex items-center gap-3">
          {/* Status chip */}
          {cloudEnabled ? (
            <div className="flex items-center gap-2 bg-[#E8F5E9] dark:bg-green-950/40 text-[#1B8F4A] dark:text-green-300 border border-[#A5D6A7] dark:border-green-800 px-4 py-2 rounded-xl font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] inline-block animate-pulse" />
              <span>{t('cloud_sync.status_synced', { time: lastSyncStr })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-surface-container-low text-on-surface-variant border border-outline-variant px-4 py-2 rounded-xl font-semibold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-outline inline-block" />
              <span>{t('cloud_sync.local_mode_title')}</span>
            </div>
          )}

          <FullscreenButton />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {/* Mode Selector Card */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <Icon name="dns" className="text-[28px]" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-on-surface">
                {cloudEnabled ? t('cloud_sync.cloud_mode_title') : t('cloud_sync.local_mode_title')}
              </span>
              <span className="text-sm text-on-surface-variant font-medium">
                {cloudEnabled ? t('cloud_sync.cloud_mode_sub') : t('cloud_sync.local_mode_sub')}
              </span>
            </div>
          </div>

          <div className="inline-flex p-1.5 bg-surface-container-high rounded-2xl gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => handleToggleMode(false)}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
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
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
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
        <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20">
                1
              </span>
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-on-surface leading-tight">
                  {t('cloud_sync.link_device_title')}
                </h2>
                <span className="text-xs text-outline">{t('cloud_sync.link_device_sub')}</span>
              </div>
            </div>
            {cloudEnabled && (
              <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full flex items-center gap-1.5">
                <Icon name="check_circle" className="text-[16px]" />
                {t('cloud_sync.auto_sync_active')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Shop info preview (4 cols) */}
            <div className="md:col-span-4 h-16 px-4 bg-surface-container-low border border-outline-variant/40 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Icon name="storefront" className="text-[22px]" />
              </div>
              <div className="leading-tight truncate">
                <p className="text-base font-bold text-on-surface truncate">{shopName}</p>
                <p className="text-xs text-outline truncate">{shopAddress || 'Active Store Branch'}</p>
              </div>
            </div>

            {/* Device Name Input (5 cols) */}
            <div className="md:col-span-5 h-16 relative flex items-center">
              <span className="absolute left-3.5 text-primary">
                <Icon name="computer" className="text-[22px]" />
              </span>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Counter PC 1 (Billing Desk)"
                className="w-full h-full pl-11 pr-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-base font-semibold text-on-surface focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            {/* Save / Link Device Button (3 cols) */}
            <button
              type="button"
              onClick={handleSaveConfig}
              className="md:col-span-3 h-16 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 text-primary flex flex-col items-center justify-center transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5 font-bold text-base leading-tight">
                <Icon name="link" className="text-[20px]" />
                <span>{btnLinkDevice.main}</span>
              </div>
              {btnLinkDevice.sub && (
                <span className="text-xs font-medium text-primary/80">{btnLinkDevice.sub}</span>
              )}
            </button>
          </div>

          {/* Shop Sync ID Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-1 border-t border-outline-variant/20">
            <div className="md:col-span-4 flex flex-col">
              <span className="text-sm font-bold text-on-surface">{t('cloud_sync.shop_sync_id')}</span>
              <span className="text-xs text-outline">{t('cloud_sync.shop_sync_id_sub')}</span>
            </div>
            <div className="md:col-span-5">
              <div className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-base font-mono font-bold text-on-surface flex items-center tracking-wider">
                {shopSyncId}
              </div>
            </div>
            <div className="md:col-span-3">
              <button
                type="button"
                onClick={handleCopyId}
                className="w-full h-13 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Icon name={copiedId ? 'check' : 'content_copy'} className="text-[18px]" />
                <span>{copiedId ? t('cloud_sync.toast_copied') : t('cloud_sync.btn_copy_id')}</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 2: Cloud Provider Credentials (Supabase) */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20">
              2
            </span>
            <div className="flex flex-col">
              <h2 className="text-lg font-bold text-on-surface leading-tight">
                {t('cloud_sync.owner_account_title')}
              </h2>
              <span className="text-xs text-outline">{t('cloud_sync.owner_account_sub')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-on-surface">{t('cloud_sync.cloud_url')}</label>
              <input
                type="text"
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="h-13 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-base text-on-surface focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-on-surface">{t('cloud_sync.cloud_anon_key')}</label>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                >
                  {showKey ? 'Chupao' : 'Dekho'}
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={cloudAnonKey}
                onChange={(e) => setCloudAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="h-13 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-base text-on-surface focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm"
              />
            </div>
          </div>
        </section>

        {/* SECTION 3: Kya Sync Hoga (matching 02b) */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center border border-primary/20">
                3
              </span>
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-on-surface leading-tight">
                  {t('cloud_sync.sync_items_title')}
                </h2>
                <span className="text-xs text-outline">{t('cloud_sync.sync_items_sub')}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card 1: Sales */}
            <div className="p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon name="receipt_long" className="text-[22px]" />
                </div>
                <div>
                  <p className="text-base font-bold text-on-surface leading-tight">
                    {t('cloud_sync.item_sales')}
                  </p>
                  <p className="text-xs text-outline">{t('cloud_sync.item_sales_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[20px]" />
            </div>

            {/* Card 2: Stock */}
            <div className="p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon name="inventory_2" className="text-[22px]" />
                </div>
                <div>
                  <p className="text-base font-bold text-on-surface leading-tight">
                    {t('cloud_sync.item_stock')}
                  </p>
                  <p className="text-xs text-outline">{t('cloud_sync.item_stock_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[20px]" />
            </div>

            {/* Card 3: Udhaar */}
            <div className="p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon name="menu_book" className="text-[22px]" />
                </div>
                <div>
                  <p className="text-base font-bold text-on-surface leading-tight">
                    {t('cloud_sync.item_udhaar')}
                  </p>
                  <p className="text-xs text-outline">{t('cloud_sync.item_udhaar_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[20px]" />
            </div>

            {/* Card 4: Reports */}
            <div className="p-4 bg-surface-container-low rounded-xl border-2 border-primary/40 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon name="analytics" className="text-[22px]" />
                </div>
                <div>
                  <p className="text-base font-bold text-on-surface leading-tight">
                    {t('cloud_sync.item_reports')}
                  </p>
                  <p className="text-xs text-outline">{t('cloud_sync.item_reports_sub')}</p>
                </div>
              </div>
              <Icon name="check_circle" className="text-primary text-[20px]" />
            </div>
          </div>

          {/* Owner Web App Info Banner */}
          <div className="bg-[#EBF3FC] dark:bg-blue-950/40 border border-[#CFE1F7] dark:border-blue-900 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Icon name="language" className="text-[#1976D2] text-[24px] shrink-0" />
              <div className="text-sm text-[#1E3A5F] dark:text-blue-200">
                <span className="font-bold">{t('cloud_sync.owner_web_app_link')}</span>
                <span className="font-mono font-medium underline ml-1.5">{ownerWebAppUrl}</span>
                <span className="text-xs text-outline ml-2">({t('cloud_sync.owner_web_app_sub')})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="h-9 px-3.5 bg-surface-container-lowest border border-[#B6D4F7] text-[#1976D2] hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-lg flex items-center gap-1.5 transition-colors font-bold text-xs cursor-pointer shadow-xs self-end sm:self-auto"
            >
              <Icon name={copiedLink ? 'check' : 'content_copy'} className="text-[16px]" />
              <span>{copiedLink ? t('cloud_sync.toast_copied') : t('cloud_sync.btn_copy_link')}</span>
            </button>
          </div>
        </section>

        {/* Live Outbox & Push Status */}
        <section className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface">
              <Icon name="sync" className={`text-[24px] ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-on-surface">
                {t('cloud_sync.pending_outbox', { count: pendingCount })}
              </span>
              <span className="text-xs text-outline">
                {config?.lastStatus === 'failed' && config.lastError
                  ? t('cloud_sync.toast_failed', { error: config.lastError })
                  : `Last sync: ${lastSyncStr}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing || !cloudEnabled}
              className="flex-1 sm:flex-none h-14 min-h-[56px] px-6 rounded-2xl bg-primary hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed text-on-primary font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Icon name="sync" className={`text-[20px] ${isSyncing ? 'animate-spin' : ''}`} />
              <div className="flex flex-col text-left">
                <span className="text-base font-bold leading-tight">{btnSyncNow.main}</span>
                {btnSyncNow.sub && (
                  <span className="text-xs font-normal text-on-primary/80 leading-none">
                    {btnSyncNow.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </section>
      </main>

      {/* Footer Navigation Bar */}
      <footer className="h-20 w-full px-4 sm:px-8 border-t border-outline-variant/30 bg-surface-container-lowest flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-14 min-h-[56px] px-6 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center gap-3 transition-colors cursor-pointer border border-outline-variant/40"
        >
          <Icon name="arrow_back" className="text-[22px]" />
          <div className="flex flex-col text-left">
            <span className="text-base font-bold leading-tight">{btnBack.main}</span>
            {btnBack.sub && (
              <span className="text-xs text-outline font-medium leading-none">{btnBack.sub}</span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={handleSaveConfig}
          className="h-14 min-h-[56px] px-8 bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center gap-3 transition-all shadow-md active:scale-95 cursor-pointer font-bold"
        >
          <Icon name="check" className="text-[22px]" />
          <div className="flex flex-col text-left">
            <span className="text-base font-bold leading-tight">{btnSave.main}</span>
            {btnSave.sub && (
              <span className="text-xs text-on-primary/80 font-normal leading-none">{btnSave.sub}</span>
            )}
          </div>
        </button>
      </footer>
    </div>
  );
};

export default OwnerCloudSync;
