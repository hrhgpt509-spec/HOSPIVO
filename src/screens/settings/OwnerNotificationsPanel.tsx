import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useTranslation } from '../../i18n';
import {
  DEFAULT_NOTIFICATIONS_CONFIG,
  getNotificationPermissionStatus,
  getNotificationsConfig,
  requestNotificationPermission,
  saveNotificationsConfig,
  type NotificationCadence,
  type NotificationCategoryId,
  type NotificationPermissionState,
  type NotificationsConfig,
} from '../../logic/notifications';

interface OwnerNotificationsPanelProps {
  onBack: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATEGORY_META: Array<{ id: NotificationCategoryId; icon: string }> = [
  { id: 'expiry', icon: 'event_busy' },
  { id: 'low_stock', icon: 'inventory_2' },
  { id: 'business_summary', icon: 'analytics' },
  { id: 'udhaar', icon: 'account_balance_wallet' },
  { id: 'backup_sync', icon: 'cloud_done' },
];

export const OwnerNotificationsPanel: React.FC<OwnerNotificationsPanelProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<NotificationsConfig>(DEFAULT_NOTIFICATIONS_CONFIG);
  const [permission, setPermission] = useState<NotificationPermissionState>('prompt');

  useEffect(() => {
    void getNotificationsConfig().then(setConfig);
    void getNotificationPermissionStatus().then(setPermission);
  }, []);

  const updateConfig = async (next: NotificationsConfig) => {
    setConfig(next);
    await saveNotificationsConfig(next);
  };

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      await saveNotificationsConfig(config);
    }
  };

  const permBadge =
    permission === 'granted'
      ? { text: t('notifications.perm_granted'), cls: 'bg-primary/15 text-primary border-primary/30' }
      : permission === 'denied'
        ? { text: t('notifications.perm_denied'), cls: 'bg-error-container text-error border-error/30' }
        : { text: t('notifications.perm_prompt'), cls: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300' };

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
            {t('notifications.title')}
          </h1>
          <p className="text-sm text-on-surface-variant">{t('notifications.sub')}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-sm flex items-center gap-2 cursor-pointer"
        >
          <Icon name="arrow_back" className="text-[20px]" />
          <span>{t('common.btn_back').main}</span>
        </button>
      </div>

      {/* Master Toggle & OS Permission */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/40 shadow-xs flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon name="notifications_active" className="text-[24px]" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-base text-on-surface">{t('notifications.master_toggle')}</div>
              <div className="text-xs text-outline">{t('notifications.master_toggle_sub')}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void updateConfig({ ...config, masterEnabled: !config.masterEnabled })}
            className={`min-h-[44px] px-4 rounded-xl font-bold text-sm cursor-pointer transition-colors ${
              config.masterEnabled
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {config.masterEnabled ? t('notifications.status_on') : t('notifications.status_off')}
          </button>
        </div>

        <div className="pt-3 border-t border-outline-variant/25 flex flex-wrap items-center justify-between gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${permBadge.cls}`}>
            {permBadge.text}
          </span>
          {permission !== 'granted' && (
            <button
              type="button"
              onClick={() => void handleRequestPermission()}
              className="min-h-[44px] px-4 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs sm:text-sm cursor-pointer"
            >
              {t('notifications.btn_request_perm')}
            </button>
          )}
        </div>
      </section>

      {/* Expiry Window & Quiet Hours */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/40 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-on-surface">{t('notifications.expiry_window_title')}</span>
          <div className="flex flex-wrap gap-2">
            {([15, 30, 60] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => void updateConfig({ ...config, expiryWindowDays: days })}
                className={`min-h-[44px] px-4 rounded-xl font-bold text-sm cursor-pointer ${
                  config.expiryWindowDays === days
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-outline-variant/25 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-sm font-bold text-on-surface block">{t('notifications.quiet_hours_title')}</span>
              <span className="text-xs text-outline">{t('notifications.quiet_hours_sub')}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                void updateConfig({ ...config, quietHoursEnabled: !config.quietHoursEnabled })
              }
              className={`min-h-[40px] px-3.5 rounded-xl font-bold text-xs cursor-pointer ${
                config.quietHoursEnabled
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {config.quietHoursEnabled ? t('notifications.status_on') : t('notifications.status_off')}
            </button>
          </div>

          {config.quietHoursEnabled && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={config.quietStart}
                onChange={(e) => void updateConfig({ ...config, quietStart: e.target.value || '22:30' })}
                className="min-h-[44px] px-3 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface font-bold text-sm"
              />
              <span className="text-xs font-bold text-outline">→</span>
              <input
                type="time"
                value={config.quietEnd}
                onChange={(e) => void updateConfig({ ...config, quietEnd: e.target.value || '08:00' })}
                className="min-h-[44px] px-3 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface font-bold text-sm"
              />
            </div>
          )}
        </div>
      </section>

      {/* Per-Category Toggles & Schedules */}
      <section className="flex flex-col gap-2.5">
        {CATEGORY_META.map(({ id, icon }) => {
          const cat = config.categories[id];
          const title = t(`notifications.cat_${id}` as any);
          const sub = t(`notifications.cat_${id}_sub` as any);

          const updateCat = (patch: Partial<typeof cat>) => {
            void updateConfig({
              ...config,
              categories: {
                ...config.categories,
                [id]: { ...cat, ...patch },
              },
            });
          };

          return (
            <div
              key={id}
              className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-xs flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
                    <Icon name={icon} className="text-[22px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm sm:text-base text-on-surface break-words">{title}</div>
                    <div className="text-xs text-outline break-words">{sub}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateCat({ enabled: !cat.enabled })}
                  className={`min-h-[40px] px-3.5 rounded-xl font-bold text-xs cursor-pointer shrink-0 ${
                    cat.enabled
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {cat.enabled ? t('notifications.status_on') : t('notifications.status_off')}
                </button>
              </div>

              {cat.enabled && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/25">
                  {(['instant', 'daily', 'weekly'] as NotificationCadence[]).map((cad) => (
                    <button
                      key={cad}
                      type="button"
                      onClick={() => updateCat({ cadence: cad })}
                      className={`min-h-[38px] px-3 rounded-lg font-bold text-xs cursor-pointer ${
                        cat.cadence === cad
                          ? 'bg-primary/15 text-primary border border-primary/40'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {t(`notifications.cadence_${cad}` as any)}
                    </button>
                  ))}

                  {cat.cadence !== 'instant' && (
                    <input
                      type="time"
                      value={cat.time}
                      onChange={(e) => updateCat({ time: e.target.value || '09:00' })}
                      className="min-h-[38px] px-2.5 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface font-bold text-xs"
                    />
                  )}

                  {cat.cadence === 'weekly' && (
                    <select
                      value={cat.dayOfWeek}
                      onChange={(e) => updateCat({ dayOfWeek: Number(e.target.value) })}
                      className="min-h-[38px] px-2.5 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface font-bold text-xs"
                    >
                      {WEEKDAYS.map((d, idx) => (
                        <option key={d} value={idx}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
};
