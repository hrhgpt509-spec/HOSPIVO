import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../db';
import { addAudit } from '../db/audit';
import {
  verifyApprovalPin,
  DEFAULT_APPROVAL_RULES,
  DEFAULT_APPROVAL_RULES_LIST,
  type ApprovalActionCategory,
  type ApprovalRuleType,
} from '../logic/approvals';
import {
  getCloudConfig,
  createRemoteApprovalRequest,
  pollApprovalRequest,
  subscribeToSyncUpdates,
  type CloudConfig,
} from '../logic/cloudSync';
import { getPinLengthSetting } from '../logic/pin';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { useBackHandler } from '../logic/androidBack';
import { triggerFeedback } from '../logic/feedback';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from './Icon';

export interface ApprovalDialogProps {
  isOpen: boolean;
  actionCategory: ApprovalActionCategory;
  recordDescription: string;
  requesterName?: string;
  onApproved: () => void;
  onClose: () => void;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  isOpen,
  actionCategory,
  recordDescription,
  requesterName = 'Staff',
  onApproved,
  onClose,
}) => {
  const { t } = useTranslation();
  const { name: shopName } = useShop();

  const [dialogMode, setDialogMode] = useState<'pin' | 'remote' | 'blocked'>('pin');
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Local PIN state
  const [pin, setPin] = useState<string>('');
  const [pinLength, setPinLength] = useState<number>(4);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lockMinutes, setLockMinutes] = useState<number>(0);

  // Remote approval state
  const [reason, setReason] = useState<string>('Grahak ne mana kiya');
  const [remoteRequestId, setRemoteRequestId] = useState<number | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<'draft' | 'sent' | 'rejected'>('draft');
  const [isSending, setIsSending] = useState<boolean>(false);

  const pollTimerRef = useRef<any>(null);

  const clearBtn = tButton('common.btn_clear');
  const wapasBtn = tButton('dialogs.btn_wapas');
  const btnSendRequest = tButton('remote_approval.btn_send_request');
  const btnUsePin = tButton('remote_approval.btn_use_pin');

  // Load rules and initial mode
  const initDialog = useCallback(async () => {
    try {
      const [cfg, len] = await Promise.all([getCloudConfig(), getPinLengthSetting()]);
      setCloudConfig(cfg);
      setPinLength(len);

      const rulesItem = await db.settings.get('approval_rules');
      const rules: Record<ApprovalActionCategory, ApprovalRuleType> = {
        ...DEFAULT_APPROVAL_RULES,
        ...((rulesItem?.value as Record<ApprovalActionCategory, ApprovalRuleType>) || {}),
      };

      const categoryRule = rules[actionCategory] || 'local_pin';
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      setIsOnline(online);

      if (categoryRule === 'blocked_offline' && !online) {
        setDialogMode('blocked');
      } else if (categoryRule === 'remote_approval') {
        setDialogMode('remote');
      } else {
        setDialogMode('pin');
      }
    } catch {
      setDialogMode('pin');
    }
  }, [actionCategory]);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setHasError(false);
      setErrorMessage('');
      setLockMinutes(0);
      setRemoteRequestId(null);
      setRemoteStatus('draft');
      setIsSending(false);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    initDialog();
  }, [isOpen, initDialog]);

  // Realtime + polling remote approval status
  useEffect(() => {
    if (isOpen && dialogMode === 'remote' && remoteRequestId && remoteStatus === 'sent') {
      const checkStatus = async () => {
        try {
          const req = await pollApprovalRequest(remoteRequestId);
          if (req && req.status === 'approved') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            triggerFeedback('success', t('remote_approval.toast_approved'));
            onApproved();
          } else if (req && req.status === 'rejected') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setRemoteStatus('rejected');
            triggerFeedback('error', t('remote_approval.toast_rejected'));
          }
        } catch (err) {
          console.error('Error polling remote approval:', err);
        }
      };

      const unsubRealtime = subscribeToSyncUpdates(() => {
        void checkStatus();
      }, ['approval_request']);
      pollTimerRef.current = setInterval(() => {
        void checkStatus();
      }, 2500);

      return () => {
        unsubRealtime();
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }
  }, [isOpen, dialogMode, remoteRequestId, remoteStatus, onApproved, t]);

  const categoryRuleDef = DEFAULT_APPROVAL_RULES_LIST.find((r) => r.category === actionCategory);
  const categoryTitle = categoryRuleDef ? t(categoryRuleDef.labelKey) : t('dialogs.safe_action');

  // Local PIN verify
  const handleVerify = useCallback(
    async (pinToVerify: string) => {
      const res = await verifyApprovalPin(pinToVerify);

      if (res.ok) {
        try {
          await addAudit(
            requesterName,
            'approval_granted',
            actionCategory,
            `Approved action: ${recordDescription}`
          );
        } catch (err) {
          console.error('Failed to log approval audit:', err);
        }

        triggerFeedback('success', t('dialogs.ijazat_pin_success'), 'Approved');
        setPin('');
        setHasError(false);
        setErrorMessage('');
        onApproved();
      } else {
        triggerFeedback('error', t('dialogs.ijazat_pin_wrong'));
        setPin('');
        setHasError(true);
        if (res.status === 'locked') {
          setLockMinutes(res.minutesLeft);
          setErrorMessage(t('dialogs.ijazat_pin_locked', { minutes: res.minutesLeft }));
        } else {
          setErrorMessage(
            res.triesLeft > 0
              ? `${t('dialogs.ijazat_pin_wrong')} (${res.triesLeft})`
              : t('dialogs.ijazat_pin_wrong')
          );
        }
      }
    },
    [actionCategory, recordDescription, requesterName, onApproved, t]
  );

  const handleAddDigit = useCallback(
    (digit: string) => {
      if (!isOpen || dialogMode !== 'pin' || lockMinutes > 0) return;
      setPin((prev) => {
        if (prev.length >= pinLength) return prev;
        const next = prev + digit;
        setHasError(false);
        setErrorMessage('');
        if (next.length === pinLength) {
          setTimeout(() => handleVerify(next), 60);
        }
        return next;
      });
    },
    [isOpen, dialogMode, lockMinutes, pinLength, handleVerify]
  );

  const handleBackspace = useCallback(() => {
    if (!isOpen || dialogMode !== 'pin' || lockMinutes > 0) return;
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
    setErrorMessage('');
  }, [isOpen, dialogMode, lockMinutes]);

  const handleClear = useCallback(() => {
    if (!isOpen || dialogMode !== 'pin') return;
    setPin('');
    setHasError(false);
    setErrorMessage('');
  }, [isOpen, dialogMode]);

  usePinKeyboard({
    onDigit: isOpen && dialogMode === 'pin' ? handleAddDigit : () => {},
    onBackspace: isOpen && dialogMode === 'pin' ? handleBackspace : () => {},
    onClear: isOpen && dialogMode === 'pin' ? handleClear : () => {},
  });

  useBackHandler(isOpen, onClose);

  const handleMobilePinChange = (raw: string) => {
    if (!isOpen || dialogMode !== 'pin' || lockMinutes > 0) return;
    const digits = raw.replace(/\D/g, '').slice(0, pinLength);
    setPin(digits);
    setHasError(false);
    setErrorMessage('');
    if (digits.length === pinLength) {
      setTimeout(() => handleVerify(digits), 60);
    }
  };

  // Remote Send Action
  const handleSendRemoteRequest = async () => {
    if (isSending || !isOnline) return;
    setIsSending(true);

    try {
      const created = await createRemoteApprovalRequest({
        actionCategory,
        summary: recordDescription,
        details: {
          reason: reason.trim(),
          shopName,
          deviceName: cloudConfig?.deviceName || '',
          shopSyncId: cloudConfig?.shopSyncId || '',
        },
        requestedBy: requesterName,
      });

      setRemoteRequestId(created.id!);
      setRemoteStatus('sent');
      triggerFeedback('success', t('remote_approval.sent_to_owner'));
    } catch (err: any) {
      triggerFeedback('error', err?.message || 'Error sending request');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  // 1. BLOCKED OFFLINE VIEW
  if (dialogMode === 'blocked') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 bg-[#0f172a]/65 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-fadeIn"
      >
        <div className="relative z-10 sm:m-auto w-full max-w-[540px] max-h-[92dvh] overflow-y-auto bg-surface-container-lowest rounded-t-3xl sm:rounded-[24px] shadow-2xl p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-5 sm:gap-6 border-t sm:border border-outline-variant">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-error-container text-error flex items-center justify-center shrink-0">
              <Icon name="block" className="text-[28px] sm:text-[32px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-on-surface leading-tight break-words">Offline mein manaa hai</h2>
              <span className="text-sm text-outline break-words">Action blocked while offline</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant text-sm sm:text-base text-on-surface break-words">
            {t('remote_approval.offline_notice')}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[56px] py-3 px-4 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-all flex items-center justify-center gap-2 font-bold text-on-surface cursor-pointer"
          >
            <Icon name="arrow_back" className="text-[20px] shrink-0" />
            <span>{wapasBtn.main}</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. REMOTE OWNER REQUEST VIEW (matching 18_Approval_AskOwner_Online.html & 18b_Approval_AskOwner_Offline.html)
  if (dialogMode === 'remote') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 bg-[#0f172a]/65 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-fadeIn"
      >
        <div className="relative z-10 sm:m-auto w-full max-w-[560px] max-h-[92dvh] overflow-y-auto bg-surface-container-lowest rounded-t-3xl sm:rounded-[24px] shadow-2xl p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 sm:gap-6 border-t sm:border border-outline-variant">
          {/* Header & Status Chip Row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Icon name="admin_panel_settings" className="text-[30px] sm:text-[36px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="text-xl sm:text-3xl font-extrabold text-on-surface leading-tight break-words">
                  {t('remote_approval.ask_owner_title')}
                </h2>
                <span className="text-xs sm:text-sm font-medium text-outline break-words">
                  {t('remote_approval.ask_owner_sub')}
                </span>
              </div>
            </div>

            {/* Status Chip */}
            {isOnline ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 shrink-0 max-w-full">
                <Icon name="check_circle" className="text-primary text-[18px] shrink-0" />
                <span className="text-xs text-primary font-bold truncate">
                  {remoteStatus === 'sent'
                    ? t('remote_approval.sent_to_owner')
                    : 'Cloud connected'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-fixed text-tertiary shrink-0 font-medium max-w-full">
                <Icon name="wifi_off" className="text-[18px] shrink-0" />
                <span className="text-xs text-tertiary font-bold truncate">
                  {t('remote_approval.waiting_internet')}
                </span>
              </div>
            )}
          </div>

          {/* Offline Warning Banner (if offline, matching 18b) */}
          {!isOnline && (
            <div className="w-full p-3.5 sm:p-4 rounded-[16px] bg-tertiary-fixed/40 border border-tertiary-fixed-dim flex items-center gap-3 text-tertiary">
              <Icon name="wifi_off" className="text-[22px] sm:text-[24px] shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm sm:text-base leading-tight break-words">
                  {t('remote_approval.offline_banner_title')}
                </span>
                <span className="text-xs text-on-surface-variant break-words">
                  {t('remote_approval.offline_banner_sub')}
                </span>
              </div>
            </div>
          )}

          {/* Action & Details Block */}
          <div className="bg-surface-container-low rounded-[16px] p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-on-surface-variant font-medium shrink-0">
                {t('remote_approval.label_shop')}
              </span>
              <span className="text-on-surface font-bold text-right break-words min-w-0">{shopName}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-lowest p-3 rounded-xl shadow-sm">
              <span className="text-sm text-on-surface-variant font-medium shrink-0">
                {t('remote_approval.label_action')}
              </span>
              <span className="text-sm sm:text-base text-error font-bold flex items-center gap-1.5 min-w-0 break-words">
                <Icon name="delete" className="text-[18px] sm:text-[20px] shrink-0" />
                <span className="break-words">{recordDescription}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-on-surface-variant font-medium shrink-0">
                {t('remote_approval.label_requester')}
              </span>
              <span className="text-on-surface font-bold text-right break-words min-w-0">{requesterName}</span>
            </div>
          </div>

          {/* Reason Input Field */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-on-surface">
              {t('remote_approval.label_reason')}
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={remoteStatus === 'sent'}
              placeholder={t('remote_approval.placeholder_reason')}
              className="w-full bg-surface-container-low text-on-surface text-base rounded-[16px] p-3.5 sm:p-4 resize-none outline-none focus:bg-surface-container-lowest transition-all placeholder:text-outline shadow-inner border border-outline-variant/30 font-medium"
            />
          </div>

          {/* Notice box if offline */}
          {!isOnline && (
            <div className="p-3.5 sm:p-4 rounded-[16px] bg-surface-container-low border border-outline-variant/40 flex items-start gap-3">
              <Icon name="info" className="text-tertiary text-[22px] shrink-0 mt-0.5" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-on-surface leading-snug break-words">
                  {t('remote_approval.offline_notice')}
                </span>
                <span className="text-xs text-outline break-words">{t('remote_approval.offline_notice_sub')}</span>
              </div>
            </div>
          )}

          {/* Footer Action Buttons Row */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[56px] py-2.5 px-3 rounded-[16px] bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] transition-transform flex flex-col items-center justify-center text-on-surface shadow-sm cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 min-w-0">
                <Icon name="arrow_back" className="text-[18px] sm:text-[20px] shrink-0" />
                <span className="text-sm sm:text-lg font-bold leading-tight break-words">{wapasBtn.main}</span>
              </div>
              {wapasBtn.sub && (
                <span className="text-[11px] sm:text-xs text-outline leading-tight mt-0.5 break-words">{wapasBtn.sub}</span>
              )}
            </button>

            {isOnline ? (
              <button
                type="button"
                onClick={handleSendRemoteRequest}
                disabled={isSending || remoteStatus === 'sent'}
                className="min-h-[56px] py-2.5 px-3 rounded-[16px] bg-primary hover:bg-primary-container disabled:opacity-70 active:scale-[0.98] transition-transform flex flex-col items-center justify-center text-on-primary shadow-md cursor-pointer min-w-0"
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 min-w-0">
                  <Icon
                    name={remoteStatus === 'sent' ? 'sync' : 'send'}
                    className={`text-[18px] sm:text-[20px] shrink-0 ${remoteStatus === 'sent' ? 'animate-spin' : ''}`}
                  />
                  <span className="text-sm sm:text-lg font-bold leading-tight break-words">
                    {remoteStatus === 'sent' ? 'Owner ka intezaar...' : btnSendRequest.main}
                  </span>
                </div>
                <span className="text-[11px] sm:text-xs text-on-primary/80 leading-tight mt-0.5 break-words">
                  {remoteStatus === 'sent' ? 'Waiting for approval' : btnSendRequest.sub}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="min-h-[56px] py-2.5 px-3 rounded-[16px] bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed flex flex-col items-center justify-center shadow-none select-none min-w-0"
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 min-w-0">
                  <Icon name="send" className="text-[18px] sm:text-[20px] shrink-0" />
                  <span className="text-sm sm:text-lg font-bold leading-tight break-words">{btnSendRequest.main}</span>
                </div>
                <span className="text-[11px] sm:text-xs leading-tight mt-0.5 break-words">{btnSendRequest.sub}</span>
              </button>
            )}
          </div>

          {/* Fallback to local Approval PIN */}
          <div className="text-center pt-2 border-t border-outline-variant/30">
            <button
              type="button"
              onClick={() => setDialogMode('pin')}
              className="text-sm font-bold text-primary hover:underline cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2"
            >
              <Icon name="pin" className="text-[18px] shrink-0" />
              <span className="break-words">{btnUsePin.main} ({btnUsePin.sub})</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. LOCAL PIN VIEW (Standard 4-digit PIN pad)
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-[#0f172a]/65 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-fadeIn"
    >
      <div className="relative z-10 sm:m-auto w-full max-w-[540px] max-h-[92dvh] overflow-y-auto bg-surface-container-lowest rounded-t-3xl sm:rounded-[24px] shadow-2xl p-5 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant">
        {/* 1. Dialog Header */}
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary flex items-center justify-center text-on-primary shadow-md shrink-0">
              <Icon name="verified_user" className="text-[28px] sm:text-[32px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-xl sm:text-3xl font-extrabold text-on-surface tracking-tight leading-tight break-words">
                {t('dialogs.ijazat_pin_title')}
              </h2>
              <span className="text-xs sm:text-sm font-medium text-outline break-words">
                {t('dialogs.ijazat_pin_sub')}
              </span>
            </div>
          </div>

          {/* Top-right Local mode chip */}
          <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded-full shadow-sm border border-outline-variant shrink-0">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-primary inline-block animate-pulse shrink-0" />
            <span className="text-xs font-bold text-on-surface whitespace-nowrap">
              {cloudConfig?.cloudEnabled ? 'Cloud mode' : t('common.local_mode')}
            </span>
          </div>
        </div>

        {/* 2. Context Info Strip */}
        <div className="w-full bg-surface-container-low rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm border border-outline-variant">
          <div className="flex items-center gap-2.5 sm:gap-3 text-error min-w-0 flex-1">
            <Icon name="warning" className="text-error text-[22px] sm:text-[24px] shrink-0" />
            <div className="flex flex-col text-left min-w-0">
              <span className="text-base sm:text-lg font-bold text-error leading-tight break-words">
                {recordDescription}
              </span>
              <span className="text-xs text-outline leading-tight break-words">{categoryTitle}</span>
            </div>
          </div>
          <div className="sm:text-right shrink-0 pl-8 sm:pl-0">
            <div className="text-xs sm:text-sm font-bold text-on-surface break-words">{shopName}</div>
            <div className="text-[11px] sm:text-xs text-outline">{t('dialogs.ijazat_pin_required')}</div>
          </div>
        </div>

        {/* 3. PIN Dots Indicator */}
        <div className="flex justify-center items-center gap-4 my-1 py-1">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                idx < pin.length
                  ? 'bg-primary border-primary scale-110 shadow-sm ring-4 ring-primary/20'
                  : 'bg-surface-container border-outline shadow-inner'
              }`}
            />
          ))}
        </div>

        {/* Feedback Alert */}
        {hasError && lockMinutes <= 0 && (
          <div className="px-4 py-1.5 rounded-full bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center justify-center gap-2 animate-bounce">
            <Icon name="warning" className="text-red-600 dark:text-red-400 text-[18px] shrink-0" />
            <span className="text-sm font-bold tracking-wide">
              {errorMessage || t('dialogs.ijazat_pin_wrong')}
            </span>
          </div>
        )}

        {lockMinutes > 0 && (
          <div className="px-4 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-center justify-center gap-2 animate-pulse">
            <Icon name="lock" className="text-amber-600 dark:text-amber-400 text-[18px] shrink-0" />
            <span className="text-sm font-bold tracking-wide">
              {t('dialogs.ijazat_pin_locked', { minutes: lockMinutes })}
            </span>
          </div>
        )}

        {/* 4a. Mobile Native Numeric PIN Input (no on-screen numpad on phones) */}
        <div className="lg:hidden w-full flex flex-col gap-2.5 my-1">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            maxLength={pinLength}
            disabled={lockMinutes > 0}
            value={pin}
            onChange={(e) => handleMobilePinChange(e.target.value)}
            placeholder="••••"
            aria-label={t('dialogs.ijazat_pin_title')}
            className="w-full h-14 px-4 rounded-2xl bg-surface-container-low border-2 border-primary/50 focus:border-primary text-center text-3xl font-extrabold tracking-[0.6em] text-on-surface outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          />
          {pin.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="h-12 min-h-[48px] w-full rounded-xl bg-surface-container text-on-surface-variant font-bold text-sm cursor-pointer active:scale-95 transition-all"
            >
              {clearBtn.main}
            </button>
          )}
        </div>

        {/* 4b. Desktop Touch Number Pad (88px Height Blocks) */}
        <div className="hidden lg:grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleAddDigit(digit)}
              className="h-[88px] rounded-2xl bg-surface-container-low hover:bg-surface-container active:scale-95 transition-all flex flex-col items-center justify-center shadow-sm text-on-surface cursor-pointer border border-outline-variant"
            >
              <span className="text-3xl font-bold">{digit}</span>
            </button>
          ))}

          {/* Saaf (Clear) */}
          <button
            type="button"
            onClick={handleClear}
            className="h-[88px] rounded-2xl bg-surface-container hover:bg-surface-container-high active:scale-95 transition-all flex flex-col items-center justify-center shadow-sm cursor-pointer border border-outline-variant"
          >
            <span className="text-lg font-bold text-on-surface">{clearBtn.main}</span>
            {clearBtn.sub && (
              <span className="text-xs text-outline font-semibold leading-none mt-0.5">
                {clearBtn.sub}
              </span>
            )}
          </button>

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleAddDigit('0')}
            className="h-[88px] rounded-2xl bg-surface-container-low hover:bg-surface-container active:scale-95 transition-all flex flex-col items-center justify-center shadow-sm text-on-surface cursor-pointer border border-outline-variant"
          >
            <span className="text-3xl font-bold">0</span>
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            aria-label={t('common.backspace')}
            className="h-[88px] rounded-2xl bg-surface-container hover:bg-surface-container-high active:scale-95 transition-all flex items-center justify-center shadow-sm cursor-pointer border border-outline-variant"
          >
            <Icon name="backspace" className="text-[28px] text-on-surface" />
          </button>
        </div>

        {/* 5. Bottom Action: Wapas Button */}
        <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[56px] py-2.5 px-4 rounded-2xl bg-surface-container hover:bg-surface-container-high active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm text-on-surface cursor-pointer border border-outline-variant min-w-0"
          >
            <Icon name="arrow_back" className="text-[20px] sm:text-[22px] shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base sm:text-xl font-bold leading-tight truncate">{wapasBtn.main}</span>
              {wapasBtn.sub && (
                <span className="text-xs text-outline font-medium leading-tight truncate">
                  {wapasBtn.sub}
                </span>
              )}
            </div>
          </button>

          {cloudConfig?.cloudEnabled && (
            <button
              type="button"
              onClick={() => setDialogMode('remote')}
              className="min-h-[56px] py-2.5 px-4 sm:px-5 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
            >
              <Icon name="send" className="text-[18px] shrink-0" />
              <span>{btnSendRequest.main}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovalDialog;
