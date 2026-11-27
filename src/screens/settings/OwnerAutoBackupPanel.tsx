import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Icon } from '../../components/Icon';
import { useTranslation } from '../../i18n';
import {
  DEFAULT_AUTO_BACKUP_CONFIG,
  executeAutoBackup,
  getAutoBackupConfig,
  saveAutoBackupConfig,
  type AutoBackupConfig,
  type AutoBackupIntervalMinutes,
  type AutoBackupRetentionCount,
  type AutoBackupTriggerMode,
} from '../../logic/autoBackup';

interface OwnerAutoBackupPanelProps {
  onBack: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const INTERVAL_OPTIONS: Array<{ mins: AutoBackupIntervalMinutes; label: string }> = [
  { mins: 15, label: '15 min' },
  { mins: 30, label: '30 min' },
  { mins: 60, label: '1 hr' },
  { mins: 360, label: '6 hr' },
  { mins: 720, label: '12 hr' },
];
const RETENTION_OPTIONS: AutoBackupRetentionCount[] = [5, 10, 20, 30];

export const OwnerAutoBackupPanel: React.FC<OwnerAutoBackupPanelProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AutoBackupConfig>(DEFAULT_AUTO_BACKUP_CONFIG);
  const [isRunningNow, setIsRunningNow] = useState(false);

  useEffect(() => {
    void getAutoBackupConfig().then(setConfig);
  }, []);

  const updateConfig = async (updates: Partial<AutoBackupConfig>) => {
    const next = await saveAutoBackupConfig(updates);
    setConfig(next);
  };

  const handleRunNow = async () => {
    if (isRunningNow) return;
    setIsRunningNow(true);
    try {
      await executeAutoBackup('manual_auto_test');
      const latest = await getAutoBackupConfig();
      setConfig(latest);
    } finally {
      setIsRunningNow(false);
    }
  };

  const triggerModes: Array<{ id: AutoBackupTriggerMode; title: string; sub: string; icon: string }> = [
    {
      id: 'off',
      title: t('auto_backup.mode_off'),
      sub: t('auto_backup.mode_off_sub'),
      icon: 'pause_circle',
    },
    {
      id: 'after_change',
      title: t('auto_backup.mode_after_change'),
      sub: t('auto_backup.mode_after_change_sub'),
      icon: 'bolt',
    },
    {
      id: 'interval',
      title: t('auto_backup.mode_interval'),
      sub: t('auto_backup.mode_interval_sub'),
      icon: 'timer',
    },
    {
      id: 'scheduled',
      title: t('auto_backup.mode_scheduled'),
      sub: t('auto_backup.mode_scheduled_sub'),
      icon: 'schedule',
    },
    {
      id: 'on_close_day',
      title: t('auto_backup.mode_close_day'),
      sub: t('auto_backup.mode_close_day_sub'),
      icon: 'lock_clock',
    },
  ];

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
            {t('auto_backup.title')}
          </h1>
          <p className="text-sm text-on-surface-variant">{t('auto_backup.sub')}</p>
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

      {/* Last Auto-Backup Status Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon name="backup" className="text-[24px]" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold text-on-surface block">
              {config.lastAutoBackupAt
                ? t('auto_backup.last_backed_up_at', {
                    time: new Date(config.lastAutoBackupAt).toLocaleString(),
                  })
                : t('auto_backup.never_backed_up')}
            </span>
            <span className="text-xs text-outline block">
              {Capacitor.isNativePlatform()
                ? t('auto_backup.dest_android')
                : t('auto_backup.dest_web')}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={isRunningNow}
          onClick={() => void handleRunNow()}
          className="min-h-[48px] px-4 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
        >
          <Icon name="sync" className={`text-[18px] ${isRunningNow ? 'animate-spin' : ''}`} />
          <span>{t('auto_backup.btn_run_now')}</span>
        </button>
      </div>

      {/* Trigger Mode */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/40 shadow-xs flex flex-col gap-3">
        <h2 className="text-base font-bold text-on-surface">{t('auto_backup.trigger_mode_title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {triggerModes.map((m) => {
            const active = config.triggerMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => void updateConfig({ triggerMode: m.id })}
                className={`p-3.5 rounded-xl border text-left flex items-start gap-3 cursor-pointer transition-all min-w-0 ${
                  active
                    ? 'bg-primary/10 border-primary shadow-xs'
                    : 'bg-surface-container-low border-outline-variant/40 hover:bg-surface-container'
                }`}
              >
                <Icon
                  name={m.icon}
                  className={`text-[22px] shrink-0 mt-0.5 ${active ? 'text-primary' : 'text-outline'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-on-surface break-words">{m.title}</div>
                  <div className="text-xs text-on-surface-variant break-words mt-0.5">{m.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Interval Picker */}
        {config.triggerMode === 'interval' && (
          <div className="pt-2 border-t border-outline-variant/30 flex flex-col gap-2">
            <span className="text-xs font-bold text-on-surface-variant uppercase">
              {t('auto_backup.interval_label')}
            </span>
            <div className="flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.mins}
                  type="button"
                  onClick={() => void updateConfig({ intervalMinutes: opt.mins })}
                  className={`min-h-[44px] px-4 rounded-xl font-bold text-sm cursor-pointer ${
                    config.intervalMinutes === opt.mins
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled Time Picker */}
        {config.triggerMode === 'scheduled' && (
          <div className="pt-2 border-t border-outline-variant/30 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['daily', 'weekly'] as const).map((freq) => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => void updateConfig({ scheduleFrequency: freq })}
                  className={`min-h-[44px] px-4 rounded-xl font-bold text-sm cursor-pointer ${
                    config.scheduleFrequency === freq
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {freq === 'daily' ? t('auto_backup.freq_daily') : t('auto_backup.freq_weekly')}
                </button>
              ))}

              <input
                type="time"
                value={config.scheduleTime}
                onChange={(e) => void updateConfig({ scheduleTime: e.target.value || '22:00' })}
                className="min-h-[44px] px-3 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface font-bold text-sm"
              />
            </div>

            {config.scheduleFrequency === 'weekly' && (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => void updateConfig({ scheduleDayOfWeek: idx })}
                    className={`min-h-[40px] px-3 rounded-lg font-bold text-xs cursor-pointer ${
                      config.scheduleDayOfWeek === idx
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Rolling Retention Limit */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 border border-outline-variant/40 shadow-xs flex flex-col gap-2.5">
        <h2 className="text-base font-bold text-on-surface">{t('auto_backup.retention_title')}</h2>
        <p className="text-xs text-on-surface-variant">{t('auto_backup.retention_sub')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {RETENTION_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => void updateConfig({ retentionCount: count })}
              className={`min-h-[44px] px-4 rounded-xl font-bold text-sm cursor-pointer ${
                config.retentionCount === count
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              {t('auto_backup.keep_last_n', { count })}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
