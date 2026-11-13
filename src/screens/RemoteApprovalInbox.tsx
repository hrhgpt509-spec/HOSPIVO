import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { db, type ApprovalRequest, type DBUser } from '../db';
import { verifyPin } from '../logic/pin';
import {
  getPendingApprovalRequests,
  resolveRemoteApprovalRequest,
  formatTimeHoursMinutes,
  getCloudConfig,
  type CloudConfig,
} from '../logic/cloudSync';
import { triggerFeedback } from '../logic/feedback';

export interface RemoteApprovalInboxProps {
  currentUser?: DBUser | null;
  onBack: () => void;
}

type TabType = 'pending' | 'approved' | 'rejected';

export const RemoteApprovalInbox: React.FC<RemoteApprovalInboxProps> = ({
  currentUser,
  onBack,
}) => {
  const { t } = useTranslation();
  const { name: shopName } = useShop();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-auth modal state
  const [pendingDecision, setPendingDecision] = useState<'approved' | 'rejected' | null>(null);
  const [decisionRequestId, setDecisionRequestId] = useState<number | null>(null);
  const [ownerPin, setOwnerPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Buttons
  const btnBack = tButton('common.btn_wapas');
  const btnConfirmApprove = tButton('remote_approval.btn_confirm_approve');
  const btnConfirmReject = tButton('remote_approval.btn_confirm_reject');

  const loadRequests = useCallback(async () => {
    try {
      const cfg = await getCloudConfig();
      setCloudConfig(cfg);

      let items: ApprovalRequest[] = [];
      if (activeTab === 'pending') {
        items = await getPendingApprovalRequests();
      } else {
        items = await db.approvalRequests
          .where('status')
          .equals(activeTab)
          .reverse()
          .sortBy('id');
      }
      setRequests(items);
    } catch (err) {
      console.error('Failed to load approval requests:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 5000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  const handleOpenDecisionModal = (reqId: number, decision: 'approved' | 'rejected') => {
    setDecisionRequestId(reqId);
    setPendingDecision(decision);
    setOwnerPin('');
    setPinError('');
    setShowPin(false);
  };

  const handleConfirmDecision = async () => {
    if (!decisionRequestId || !pendingDecision) return;
    if (!ownerPin) {
      setPinError(t('common.required'));
      return;
    }

    setIsVerifying(true);
    setPinError('');

    try {
      // Find owner user to verify PIN against
      const ownerUser =
        currentUser?.role === 'owner'
          ? currentUser
          : await db.users.where('role').equals('owner').first();

      if (!ownerUser) {
        setPinError('Owner user not found');
        setIsVerifying(false);
        return;
      }

      const isValid = await verifyPin(ownerPin, ownerUser);
      if (!isValid) {
        setPinError(t('dialogs.ijazat_pin_wrong'));
        setIsVerifying(false);
        return;
      }

      await resolveRemoteApprovalRequest(
        decisionRequestId,
        pendingDecision,
        currentUser?.name || 'Owner'
      );

      triggerFeedback(
        'success',
        pendingDecision === 'approved'
          ? t('remote_approval.toast_approved')
          : t('remote_approval.toast_rejected')
      );

      setDecisionRequestId(null);
      setPendingDecision(null);
      setOwnerPin('');
      loadRequests();
    } catch (err: any) {
      setPinError(err?.message || 'Error resolving request');
    } finally {
      setIsVerifying(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bill_edit_delete':
      case 'bill_return':
        return 'delete_forever';
      case 'discount_above_limit':
        return 'percent';
      case 'price_change':
        return 'sell';
      case 'stock_correction':
        return 'inventory_2';
      case 'din_band_mismatch':
        return 'account_balance_wallet';
      default:
        return 'admin_panel_settings';
    }
  };

  const formatItemTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return formatTimeHoursMinutes(d.getTime());
    } catch {
      return '--:--';
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-between selection:bg-primary-fixed selection:text-on-primary-fixed">
      {/* Top Bar */}
      <header className="h-20 w-full px-4 sm:px-8 border-b border-outline-variant/30 bg-surface-container-lowest flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
            <Icon name="verified_user" className="text-[28px]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface leading-tight">
              {t('remote_approval.inbox_title')}
            </h1>
            <span className="text-sm text-outline font-medium">
              {shopName} • {t('remote_approval.inbox_sub')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-container-low text-on-surface-variant border border-outline-variant px-4 py-2 rounded-xl font-medium text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block animate-pulse" />
            <span>
              {cloudConfig?.lastCloudSyncAt
                ? `Sync: ${formatTimeHoursMinutes(cloudConfig.lastCloudSyncAt)}`
                : 'Local Mode'}
            </span>
          </div>
          <FullscreenButton />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {/* Header Row: Title & Filter Tabs (matching 43a) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col">
            <h2 className="text-3xl font-extrabold text-on-surface tracking-tight">
              {t('remote_approval.inbox_title')}
            </h2>
            <p className="text-sm text-outline font-medium">
              {t('remote_approval.inbox_sub')}
            </p>
          </div>

          {/* Filter Tabs: Baaki, Approve hue, Reject hue */}
          <div className="inline-flex p-1.5 bg-surface-container-high rounded-2xl gap-2 self-start sm:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>{t('remote_approval.tab_pending')}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('approved')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'approved'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('remote_approval.tab_approved')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rejected')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'rejected'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('remote_approval.tab_rejected')}
            </button>
          </div>
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="h-64 flex items-center justify-center text-outline font-bold">
            {t('common.loading')}
          </div>
        ) : requests.length === 0 ? (
          <div className="h-64 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 flex flex-col items-center justify-center gap-3 text-outline">
            <Icon name="inbox" className="text-[48px] opacity-40" />
            <span className="text-base font-bold">{t('remote_approval.empty_inbox')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((req) => {
              const iconName = getCategoryIcon(req.actionCategory);
              const isPending = req.status === 'pending';

              return (
                <div
                  key={req.id}
                  className="w-full min-h-[88px] bg-surface-container-lowest rounded-2xl shadow-sm hover:shadow-md transition-shadow px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-outline-variant/30"
                >
                  <div
                    className="flex items-center gap-4 min-w-0 cursor-pointer flex-1"
                    onClick={() =>
                      setSelectedRequest(selectedRequest?.id === req.id ? null : req)
                    }
                  >
                    <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-primary shrink-0">
                      <Icon name={iconName} className="text-[30px]" />
                    </div>

                    <div className="flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-on-surface truncate">
                          {req.summary}
                        </span>
                        {isPending && (
                          <span className="bg-tertiary-fixed text-on-tertiary-fixed text-xs font-bold px-2.5 py-0.5 rounded-full">
                            Naya
                          </span>
                        )}
                        {!isPending && (
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                              req.status === 'approved'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-error-container text-error'
                            }`}
                          >
                            {req.status === 'approved' ? 'Approved' : 'Rejected'}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-on-surface-variant font-medium mt-0.5">
                        {req.requestedBy} · {shopName} · {formatItemTime(req.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions (Approve / Reject) */}
                  {isPending ? (
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenDecisionModal(req.id!, 'rejected')}
                        className="h-14 min-h-[56px] px-6 rounded-2xl bg-surface-container-high hover:bg-error-container text-error font-bold transition-colors cursor-pointer flex items-center justify-center"
                      >
                        {t('remote_approval.btn_reject')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDecisionModal(req.id!, 'approved')}
                        className="h-14 min-h-[56px] px-8 rounded-2xl bg-primary hover:bg-primary-container text-on-primary font-bold shadow-md transition-all cursor-pointer flex items-center justify-center"
                      >
                        {t('remote_approval.btn_approve')}
                      </button>
                    </div>
                  ) : (
                    <div className="text-right text-xs text-outline shrink-0">
                      <span>By: {req.resolvedBy || 'Owner'}</span>
                      <br />
                      <span>{formatItemTime(req.resolvedAt)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Request Details Drawer / Modal (matching 43b) */}
        {selectedRequest && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 border-2 border-primary/20 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <div className="flex items-center gap-3">
                <Icon name="description" className="text-primary text-[24px]" />
                <h3 className="text-lg font-bold text-on-surface">
                  {selectedRequest.summary}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="text-outline hover:text-on-surface cursor-pointer p-1"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 bg-surface-container-low rounded-xl flex flex-col">
                <span className="text-xs text-outline">{t('remote_approval.label_requester')}</span>
                <span className="font-bold text-on-surface">{selectedRequest.requestedBy}</span>
              </div>
              <div className="p-3 bg-surface-container-low rounded-xl flex flex-col">
                <span className="text-xs text-outline">{t('remote_approval.label_action')}</span>
                <span className="font-bold text-on-surface">{selectedRequest.actionCategory}</span>
              </div>
              <div className="p-3 bg-surface-container-low rounded-xl flex flex-col">
                <span className="text-xs text-outline">Time</span>
                <span className="font-bold text-on-surface">
                  {formatItemTime(selectedRequest.createdAt)}
                </span>
              </div>
            </div>

            {selectedRequest.detailsJson && (
              <div className="p-4 bg-surface-container-low rounded-xl text-xs font-mono text-on-surface overflow-x-auto">
                <span className="font-sans font-bold block mb-1 text-outline">
                  Payload Details:
                </span>
                <pre>{JSON.stringify(JSON.parse(selectedRequest.detailsJson), null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
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
      </footer>

      {/* RE-AUTH MODAL (matching 43c_Web_ReAuthDialog.html) */}
      {decisionRequestId && pendingDecision && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-[#0f172a]/65 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fadeIn"
        >
          <div className="relative z-10 m-auto w-full max-w-[560px] bg-surface-container-lowest rounded-[24px] shadow-2xl p-8 flex flex-col gap-6 border border-outline-variant">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Icon name="security" className="text-[32px]" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-2xl font-bold text-on-surface leading-tight">
                  {t('remote_approval.reauth_title')}
                </h3>
                <span className="text-sm text-outline font-medium">
                  {t('remote_approval.reauth_sub')}
                </span>
              </div>
            </div>

            {/* Prompt */}
            <p className="text-base text-on-surface-variant">
              {t('remote_approval.reauth_prompt')}
            </p>

            {/* Password / PIN input */}
            <div className="flex flex-col gap-1.5">
              <div className="relative flex items-center w-full h-14 bg-surface-container rounded-2xl px-4 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary transition-all border border-outline-variant">
                <Icon name="lock" className="text-outline mr-3 text-[22px]" />
                <input
                  type={showPin ? 'text' : 'password'}
                  autoFocus
                  value={ownerPin}
                  onChange={(e) => {
                    setOwnerPin(e.target.value);
                    setPinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmDecision();
                  }}
                  placeholder={t('remote_approval.reauth_pin_sub')}
                  className="w-full h-full bg-transparent outline-none text-xl font-bold text-on-surface placeholder:text-outline tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="h-10 w-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <Icon name={showPin ? 'visibility_off' : 'visibility'} className="text-[22px]" />
                </button>
              </div>

              {pinError ? (
                <span className="text-sm font-bold text-error px-2">{pinError}</span>
              ) : (
                <span className="text-xs text-outline px-2">
                  {currentUser?.name || 'Owner'} ka primary PIN ya password
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDecisionRequestId(null);
                  setPendingDecision(null);
                  setOwnerPin('');
                }}
                className="h-16 min-h-[56px] rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold flex flex-col items-center justify-center cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Icon name="arrow_back" className="text-[20px]" />
                  <span className="text-lg leading-tight">{btnBack.main}</span>
                </div>
                {btnBack.sub && (
                  <span className="text-xs text-outline leading-none font-normal">{btnBack.sub}</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={isVerifying}
                className={`h-16 min-h-[56px] rounded-2xl font-bold flex flex-col items-center justify-center text-white shadow-md transition-all cursor-pointer ${
                  pendingDecision === 'approved'
                    ? 'bg-primary hover:bg-primary-container'
                    : 'bg-error hover:brightness-110'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon
                    name={pendingDecision === 'approved' ? 'check_circle' : 'cancel'}
                    className="text-[20px]"
                  />
                  <span className="text-lg leading-tight">
                    {pendingDecision === 'approved'
                      ? btnConfirmApprove.main
                      : btnConfirmReject.main}
                  </span>
                </div>
                <span className="text-xs text-white/80 leading-none font-normal">
                  {pendingDecision === 'approved'
                    ? btnConfirmApprove.sub
                    : btnConfirmReject.sub}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemoteApprovalInbox;
