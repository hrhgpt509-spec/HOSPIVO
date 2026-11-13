import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type DBUser } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useShop } from '../logic/useShop';
import { isOwner } from '../logic/roles';
import {
  createBackup,
  verifyBackup,
  downloadBackupFile,
  recordVerifiedBackup,
  getBackupStatus,
  getBackupHistory,
  restoreBackup,
  type BackupPayload,
  type BackupStatus,
  type BackupHistoryEntry,
} from '../logic/backup';
import { verifyApprovalPin } from '../logic/approvals';
import { triggerFeedback } from '../logic/feedback';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { getPinLengthSetting } from '../logic/pin';

interface OwnerBackupProps {
  currentUser?: DBUser | null;
  onBack: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OwnerBackup: React.FC<OwnerBackupProps> = ({
  currentUser,
  onBack,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [status, setStatus] = useState<BackupStatus>({
    lastVerifiedBackupAt: null,
    isToday: false,
    isOlderThan3Days: true,
    daysAgo: null,
    statusText: 'loading',
  });
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupFailed, setBackupFailed] = useState(false);

  // Restore state & modals
  const [stagedPayload, setStagedPayload] = useState<BackupPayload | null>(null);
  const [stagedFileSize, setStagedFileSize] = useState<string>('');
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restorePin, setRestorePin] = useState('');
  const [pinLength, setPinLength] = useState(4);
  const [restoreError, setRestoreError] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Translations
  const btnBack = tButton('owner_staff.btn_back');
  const btnBackupNow = tButton('owner_backup.btn_backup_now');
  const btnRestore = tButton('owner_backup.btn_restore');
  const btnRetry = tButton('owner_backup.btn_retry');
  const btnConfirmRestore = tButton('owner_backup.btn_confirm_restore');
  const btnCancelRestore = tButton('owner_backup.btn_cancel_restore');

  const loadData = useCallback(async () => {
    try {
      const pLen = await getPinLengthSetting();
      setPinLength(pLen);

      const st = await getBackupStatus();
      setStatus(st);

      const hist = await getBackupHistory();
      setHistory(hist);
    } catch (err) {
      console.error('Failed to load backup status:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keypad for Restore Confirmation Approval PIN
  usePinKeyboard({
    onDigit: (digit) => {
      if (restorePin.length < pinLength) {
        setRestorePin((p) => p + digit);
        setRestoreError('');
      }
    },
    onBackspace: () => {
      setRestorePin((p) => p.slice(0, -1));
      setRestoreError('');
    },
    onClear: () => {
      setRestorePin('');
      setRestoreError('');
    },
    onEnter: () => {
      if (restorePin.length === pinLength) {
        handleExecuteRestore();
      }
    },
    disabled: !isRestoreModalOpen,
  });

  if (!isOwner(currentUser)) {
    return (
      <div className="w-full min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-on-surface">
        <Icon name="lock" className="text-error text-[48px] mb-4" />
        <h1 className="text-headline-lg font-bold text-on-surface mb-2">{t('owner_dashboard.owner_only_error')}</h1>
        <button
          type="button"
          onClick={onBack}
          className="h-14 px-6 rounded-2xl bg-primary text-on-primary font-bold cursor-pointer"
        >
          {btnBack.main}
        </button>
      </div>
    );
  }

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    setBackupFailed(false);

    try {
      // 1. Create backup payload
      const payload = await createBackup(shopName);

      // 2. Immediately parse and verify SHA-256 integrity
      const verification = await verifyBackup(payload);
      if (!verification.valid) {
        setBackupFailed(true);
        triggerFeedback('error', t('owner_backup.backup_failed_title'));
        setIsBackingUp(false);
        return;
      }

      // 3. Trigger download to device
      downloadBackupFile(payload);

      // 4. Record verified backup in DB
      await recordVerifiedBackup(payload, currentUser?.name || 'owner');

      triggerFeedback('success', t('status.backup_today'));
      await loadData();
    } catch (err) {
      console.error('Backup creation failed:', err);
      setBackupFailed(true);
      triggerFeedback('error', t('owner_backup.backup_failed_title'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    setStagedFileSize(sizeMb);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);

        // Verify integrity before showing confirm dialog
        const res = await verifyBackup(parsed);
        if (!res.valid || !res.payload) {
          if (res.error === 'checksum_mismatch') {
            triggerFeedback('error', t('owner_backup.err_checksum_mismatch'));
          } else {
            triggerFeedback('error', t('owner_backup.err_invalid_backup_file'));
          }
          return;
        }

        setStagedPayload(res.payload);
        setRestorePin('');
        setRestoreError('');
        setIsRestoreModalOpen(true);
      } catch (err) {
        console.error('Failed to parse restore file:', err);
        triggerFeedback('error', t('owner_backup.err_invalid_backup_file'));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!stagedPayload) return;
    setRestoreError('');

    // Require Approval PIN before destructive restore
    const pinRes = await verifyApprovalPin(restorePin);
    if (!pinRes.ok) {
      setRestoreError(t('owner_settings.err_current_pin_wrong'));
      return;
    }

    setIsRestoring(true);
    try {
      await restoreBackup(stagedPayload, currentUser?.name || 'owner');
      triggerFeedback('success', t('owner_backup.restore_success_toast'));
      setIsRestoreModalOpen(false);
      setStagedPayload(null);
      await loadData();
      // Reload page to reinitialize in-memory states with restored DB
      window.location.reload();
    } catch (err) {
      console.error('Database restore failed:', err);
      setRestoreError(t('owner_backup.backup_failed_sub'));
    } finally {
      setIsRestoring(false);
    }
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const isToday = new Date().toDateString() === d.toDateString();
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (isToday) return `Aaj ${timeStr}`;
      return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${timeStr}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface antialiased select-none flex flex-col justify-between">
      {/* 1. Top Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-sm">
        <div className="h-20 w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <span className="font-extrabold text-2xl tracking-tight text-primary">HOSPIVO</span>
            <span className="text-outline-variant text-xl">/</span>
            <span className="font-bold text-lg text-on-surface">{shopName}</span>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-sub-english text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span>{mode === 'cloud' ? 'Cloud Mode' : t('common.local_mode')}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <button
              type="button"
              onClick={onBack}
              className="h-11 px-4 rounded-xl bg-primary text-on-primary font-bold flex items-center gap-2 cursor-pointer shadow-sm hover:bg-primary-container transition-all"
            >
              <Icon name="arrow_back" className="text-[20px]" />
              <span>{btnBack.main}</span>
            </button>
            <FullscreenButton />
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-all cursor-pointer"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="w-full pt-24 pb-8 flex-1 flex flex-col max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8 gap-5">
        {/* Title */}
        <div className="flex flex-col">
          <h1 className="font-headline-lg text-headline-lg font-extrabold text-on-surface tracking-tight leading-none">
            {t('owner_backup.page_title')}
          </h1>
          <span className="font-label-sub-english text-label-sub-english text-on-surface-variant pt-1 font-medium">
            {t('owner_backup.page_sub')}
          </span>
        </div>

        {/* Status Card (41a vs 41b) */}
        {!backupFailed ? (
          <div className="w-full bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex items-center gap-4 border border-outline-variant/30">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center shrink-0">
              <Icon
                name={status.lastVerifiedBackupAt ? 'check_circle' : 'info'}
                className={`text-[36px] ${status.lastVerifiedBackupAt ? 'text-primary' : 'text-outline'}`}
              />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-title-hinglish font-bold text-lg text-on-surface leading-tight">
                {status.lastVerifiedBackupAt
                  ? t('owner_backup.status_verified').replace('{time}', formatTimestamp(status.lastVerifiedBackupAt))
                  : t('owner_backup.status_not_taken')}
              </span>
              {status.lastVerifiedBackupAt ? (
                <span className="font-label-sub-english text-sm text-primary font-bold mt-1">
                  {t('owner_backup.badge_verified')}
                </span>
              ) : (
                <span className="font-label-sub-english text-sm text-error font-bold mt-1">
                  {t('home.backup_banner_title')}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Failed state (41b) */
          <div className="w-full bg-error-container rounded-2xl p-6 shadow-sm flex items-center gap-4 border border-error">
            <div className="w-14 h-14 rounded-full bg-surface-container-lowest flex items-center justify-center shrink-0">
              <Icon name="error" className="text-[36px] text-error" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-title-hinglish font-bold text-lg text-error leading-tight">
                {t('owner_backup.backup_failed_title')}
              </span>
              <span className="font-label-sub-english text-sm text-error font-bold mt-1">
                {t('owner_backup.badge_failed')}
              </span>
            </div>
          </div>
        )}

        {/* Main Action Buttons (80px tall) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {/* Green Backup Button or Retry Button if failed */}
          {!backupFailed ? (
            <button
              type="button"
              disabled={isBackingUp}
              onClick={handleBackupNow}
              className="h-20 bg-primary hover:bg-primary-container active:scale-[0.99] transition-all rounded-2xl px-6 flex items-center justify-center gap-4 text-on-primary shadow-md cursor-pointer disabled:opacity-50"
            >
              <Icon name="cloud_upload" className="text-[36px]" />
              <div className="flex flex-col items-start leading-tight">
                <span className="font-title-hinglish text-xl font-bold">{btnBackupNow.main}</span>
                {btnBackupNow.sub ? (
                  <span className="font-label-sub-english text-xs text-primary-fixed font-medium mt-0.5">
                    {btnBackupNow.sub}
                  </span>
                ) : null}
              </div>
            </button>
          ) : (
            <button
              type="button"
              disabled={isBackingUp}
              onClick={handleBackupNow}
              className="h-20 bg-error hover:bg-on-error-container active:scale-[0.99] transition-all rounded-2xl px-6 flex items-center justify-center gap-4 text-on-error shadow-md cursor-pointer"
            >
              <Icon name="refresh" className="text-[36px]" />
              <div className="flex flex-col items-start leading-tight">
                <span className="font-title-hinglish text-xl font-bold">{btnRetry.main}</span>
                {btnRetry.sub ? (
                  <span className="font-label-sub-english text-xs text-error-container font-medium mt-0.5">
                    {btnRetry.sub}
                  </span>
                ) : null}
              </div>
            </button>
          )}

          {/* Secondary Restore Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-20 bg-surface-container-lowest hover:bg-surface-container-low active:scale-[0.99] transition-all rounded-2xl px-6 flex items-center justify-center gap-4 text-on-surface shadow-sm cursor-pointer border border-outline-variant/30"
          >
            <Icon name="history" className="text-[36px] text-on-surface-variant" />
            <div className="flex flex-col items-start leading-tight">
              <span className="font-title-hinglish text-xl font-bold">{btnRestore.main}</span>
              {btnRestore.sub ? (
                <span className="font-label-sub-english text-xs text-on-surface-variant font-medium mt-0.5">
                  {btnRestore.sub}
                </span>
              ) : null}
            </div>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleSelectRestoreFile}
            accept=".json"
            className="hidden"
          />
        </div>

        {/* Orange Warning Note Card (Local-only backup loss notice) */}
        <div className="w-full bg-tertiary-fixed rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-tertiary-fixed-dim">
          <Icon name="warning" className="text-[32px] text-tertiary-container shrink-0" />
          <p className="font-body-md text-on-tertiary-fixed font-bold leading-normal">
            {t('owner_backup.warning_local_only')}
          </p>
        </div>

        {/* Recent Backups History List */}
        <div className="w-full bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-3 border border-outline-variant/30">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-high">
            <span className="font-title-hinglish font-bold text-lg text-on-surface">
              {t('owner_backup.recent_backups_title')}
            </span>
            <span className="font-label-sub-english text-xs text-on-surface-variant">
              {t('owner_backup.recent_backups_sub')}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="py-6 text-center text-outline font-medium">
              {t('owner_backup.history_empty')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Icon name="schedule" className="text-[24px] text-on-surface-variant" />
                    <span className="font-body-md font-medium text-on-surface">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-body-md text-on-surface-variant font-medium">
                      {(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <div className="flex items-center gap-1.5 text-primary">
                      <Icon name="check" className="text-[20px]" />
                      <span className="font-label-sub-english text-sm font-bold">
                        {t('owner_backup.badge_verified')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* RESTORE CONFIRMATION MODAL (41c) */}
      {isRestoreModalOpen && stagedPayload && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[580px] max-w-full bg-surface-container-lowest rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col gap-5 border border-outline-variant/30">
            {/* Top Warning Icon and Headings */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 min-w-[64px] rounded-2xl bg-error-container flex items-center justify-center shadow-sm">
                <Icon name="warning" className="text-error text-[36px]" />
              </div>
              <div className="flex flex-col pt-1">
                <h2 className="font-headline-lg text-headline-lg text-on-surface leading-tight font-extrabold">
                  {t('owner_backup.modal_restore_title')}
                </h2>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium mt-0.5">
                  {t('owner_backup.modal_restore_sub')}
                </span>
              </div>
            </div>

            {/* Overwrite Danger Callout */}
            <div className="w-full bg-error-container/40 rounded-xl p-4 flex items-center gap-3 border border-error-container">
              <Icon name="error" className="text-error text-[24px]" />
              <p className="font-body-md text-error font-bold leading-normal">
                {t('owner_backup.modal_restore_warning')}
              </p>
            </div>

            {/* Selected Backup Detail Box */}
            <div className="w-full bg-surface-container-low rounded-xl p-4 flex items-center justify-between border border-outline-variant/20">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface">
                  <Icon name="restore" className="text-[28px]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-title-hinglish text-on-surface font-bold leading-snug">
                    {formatTimestamp(stagedPayload.meta.exportedAt)}
                  </span>
                  <span className="font-label-sub-english text-on-surface-variant font-medium text-xs">
                    {stagedFileSize || '4.2 MB'} · {stagedPayload.meta.shopName}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-primary font-bold text-xs">
                <Icon name="check_circle" className="text-[18px]" />
                <span>Ready</span>
              </div>
            </div>

            {/* Approval PIN Verification for destructive action */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-on-surface">
                {t('dialogs.title_approval')} ({pinLength} digits)
              </label>
              <input
                type="password"
                maxLength={pinLength}
                value={restorePin}
                onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                placeholder={`•••• (${pinLength} digits)`}
                className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold tracking-widest text-2xl text-center focus:outline-primary"
              />
            </div>

            {restoreError && (
              <span className="text-error font-bold text-sm text-center">{restoreError}</span>
            )}

            {/* Action Buttons (64px tall, 16px radius) */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setStagedPayload(null);
                }}
                className="h-16 rounded-2xl bg-surface-container-high hover:bg-surface-container-highest active:translate-y-0.5 transition-all flex items-center justify-center gap-2 px-6 text-on-surface font-bold cursor-pointer shadow-sm"
              >
                <Icon name="close" className="text-[24px] text-on-surface-variant" />
                <span className="font-title-hinglish text-lg">{btnCancelRestore.main}</span>
              </button>

              <button
                type="button"
                disabled={isRestoring || restorePin.length !== pinLength}
                onClick={handleExecuteRestore}
                className="h-16 rounded-2xl bg-error hover:bg-error/90 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 px-6 text-on-error font-bold cursor-pointer shadow-md disabled:opacity-50"
              >
                <Icon name="restore" className="text-[24px]" />
                <span className="font-title-hinglish text-lg">{btnConfirmRestore.main}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerBackup;

