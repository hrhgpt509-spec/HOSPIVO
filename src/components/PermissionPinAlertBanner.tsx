import React, { useEffect, useState, useCallback } from 'react';
import { Icon } from './Icon';
import { ChangePermissionPinModal } from './ChangePermissionPinModal';
import { useTranslation } from '../i18n';
import { formatRupees } from '../logic/money';
import {
  dismissPermissionPinSecurityAlert,
  getPermissionPinSecurityAlerts,
  type PermissionPinSecurityAlert,
} from '../logic/approvals';
import { subscribeToSyncUpdates } from '../logic/cloudSync';

interface PermissionPinAlertBannerProps {
  openModalSignal?: boolean;
  onModalSignalHandled?: () => void;
}

export const PermissionPinAlertBanner: React.FC<PermissionPinAlertBannerProps> = ({
  openModalSignal = false,
  onModalSignalHandled,
}) => {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<PermissionPinSecurityAlert[]>([]);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const loadAlerts = useCallback(async () => {
    const active = await getPermissionPinSecurityAlerts().catch(() => []);
    setAlerts(active);
  }, []);

  useEffect(() => {
    void loadAlerts();
    const unsub = subscribeToSyncUpdates(() => {
      void loadAlerts();
    }, ['settings']);
    return () => unsub();
  }, [loadAlerts]);

  useEffect(() => {
    if (openModalSignal) {
      setIsPinModalOpen(true);
      onModalSignalHandled?.();
    }
  }, [openModalSignal, onModalSignalHandled]);

  if (alerts.length === 0 && !isPinModalOpen) return null;

  return (
    <>
      {alerts.length > 0 && (
        <div className="w-full flex flex-col gap-2.5">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="w-full rounded-2xl bg-error/10 border-2 border-error/40 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-error text-on-error flex items-center justify-center shrink-0">
                  <Icon name="shield_lock" className="text-[22px]" />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-sm sm:text-base font-extrabold text-error leading-tight">
                    {t('notifications.security_pin_alert_title')}
                  </span>
                  <p className="text-xs sm:text-sm text-on-surface font-medium leading-snug break-words">
                    {t('notifications.security_pin_alert_desc', {
                      operator: alert.operatorName,
                      percent: alert.discountPercent,
                      discount: formatRupees(alert.discountPaise),
                      billNo: alert.billNo,
                      total: formatRupees(alert.totalPaise),
                    })}
                  </p>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {new Date(alert.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-on-error font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Icon name="lock_reset" className="text-[18px]" />
                  <span>{t('notifications.btn_change_permission_pin')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void dismissPermissionPinSecurityAlert(alert.id).then(loadAlerts);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer"
                >
                  {t('notifications.btn_dismiss_alert')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ChangePermissionPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          void loadAlerts();
        }}
      />
    </>
  );
};
