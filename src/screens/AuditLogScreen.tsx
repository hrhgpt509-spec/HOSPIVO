import React, { useState, useEffect, useMemo } from 'react';
import { db, type AuditLogEntry, type DBUser, type Shop } from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { EmptyState } from '../components/EmptyState';
import { textFieldProps } from '../logic/format';
import { isOwner } from '../logic/roles';
import { filterAuditLogEntries, type AuditTimeFilter } from '../logic/reports';

interface AuditLogScreenProps {
  onReturnHome: () => void;
  onBackToOwnerMenu: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const AuditLogScreen: React.FC<AuditLogScreenProps> = ({
  onReturnHome,
  onBackToOwnerMenu,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState<AuditTimeFilter>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const ownerAllowed = isOwner(currentUser);
  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName = currentUser?.name || t('common.role_owner');

  useEffect(() => {
    if (!ownerAllowed) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    db.auditLog
      .toArray()
      .then((list) => setEntries(list))
      .catch(() => setEntries([]))
      .finally(() => setIsLoading(false));
  }, [ownerAllowed]);

  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.action) set.add(e.action);
    }
    return Array.from(set).sort();
  }, [entries]);

  const filteredEntries = useMemo(
    () => filterAuditLogEntries(entries, { timeFilter, actionFilter, query }),
    [entries, timeFilter, actionFilter, query]
  );

  const actionIcon = (action: string) => {
    if (action.includes('delete') || action.includes('lock') || action.includes('fail')) {
      return { icon: 'warning', color: 'text-error' };
    }
    if (action.includes('return')) {
      return { icon: 'assignment_return', color: 'text-tertiary' };
    }
    if (action.includes('din_band')) {
      return { icon: 'point_of_sale', color: 'text-primary' };
    }
    if (action.includes('pin') || action.includes('approval')) {
      return { icon: 'lock_open', color: 'text-primary' };
    }
    return { icon: 'verified_user', color: 'text-secondary' };
  };

  const formatTimestamp = (iso: string) => {
    if (!iso) return '—';
    const [datePart, timePart] = iso.split('T');
    const hhmm = timePart ? timePart.slice(0, 5) : '';
    return hhmm ? `${datePart} ${hhmm}` : datePart;
  };

  const homeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('suppliers.btn_back');
  const allBtn = tButton('audit_log.filter_all');
  const todayBtn = tButton('audit_log.filter_today');
  const weekBtn = tButton('audit_log.filter_week');

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md min-w-0">
            <span className="font-headline-lg text-headline-lg text-primary tracking-tight font-extrabold">
              HOSPIVO
            </span>
            {shopName && (
              <>
                <span className="hidden md:inline text-outline">/</span>
                <span className="hidden md:inline font-title-hinglish text-lg text-on-surface font-bold truncate">
                  {shopName}
                </span>
              </>
            )}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs sm:text-sm font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span>{modeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{homeBtn.main}</span>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer" />

            <div className="hidden sm:flex items-center gap-2 pl-1">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="font-title-hinglish text-sm font-bold text-on-surface">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-20 flex-1 bg-background p-gutter">
        <div className="flex flex-col w-full max-w-[1440px] mx-auto gap-space-md">
          {!ownerAllowed ? (
            <div className="py-12">
              <EmptyState
                title={t('owner_dashboard.owner_only_error')}
                subtitle={t('audit_log.page_sub')}
                icon="lock"
                actionLabel={backBtn.main}
                onAction={onReturnHome}
              />
            </div>
          ) : (
            <>
              {/* Title + Time Filters */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-col">
                  <h1 className="font-headline-lg text-2xl sm:text-[32px] text-on-surface font-extrabold tracking-tight">
                    {t('audit_log.page_title')}
                  </h1>
                  <span className="text-sm sm:text-base text-outline font-medium">
                    {t('audit_log.page_sub')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { key: 'all', btn: allBtn, icon: 'done_all' },
                      { key: 'today', btn: todayBtn, icon: 'today' },
                      { key: 'week', btn: weekBtn, icon: 'date_range' },
                    ] as const
                  ).map((item) => {
                    const active = timeFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setTimeFilter(item.key)}
                        className={`h-14 min-h-[56px] px-4 rounded-xl flex items-center gap-2 cursor-pointer transition-all ${
                          active
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                        }`}
                      >
                        <Icon name={item.icon} className="text-2xl" />
                        <div className="flex flex-col text-left leading-tight">
                          <span className="font-title-hinglish font-bold text-base">
                            {item.btn.main}
                          </span>
                          {item.btn.sub && (
                            <span className="text-xs opacity-85">{item.btn.sub}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Immutable Security Notice Bar */}
              <div className="w-full bg-secondary-fixed/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm border border-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shrink-0">
                    <Icon name="verified_user" className="text-2xl" />
                  </div>
                  <span className="font-body-lg text-base sm:text-lg text-on-secondary-fixed font-bold">
                    {t('audit_log.immutable_notice')}
                  </span>
                </div>
                <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest text-on-secondary-fixed text-xs font-bold shrink-0">
                  {t('audit_log.immutable_badge')}
                </span>
              </div>

              {/* Search & Action Type Filter */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8 h-14 px-4 rounded-xl bg-surface-container-lowest border border-outline-variant/50 flex items-center gap-3 shadow-sm">
                  <Icon name="search" className="text-2xl text-on-surface-variant" />
                  <input
                    {...textFieldProps('free', query, setQuery)}
                    type="text"
                    placeholder={t('audit_log.search_placeholder')}
                    className="bg-transparent w-full text-on-surface text-base focus:outline-none placeholder:text-outline"
                  />
                </div>
                <div className="md:col-span-4">
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="w-full h-14 px-4 rounded-xl bg-surface-container-lowest border border-outline-variant/50 text-on-surface font-bold text-base focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                  >
                    <option value="all">{t('audit_log.action_all')}</option>
                    {distinctActions.map((act) => (
                      <option key={act} value={act}>
                        {act}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Read-Only Audit Table (ZERO edit/delete controls) */}
              <div className="w-full bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 overflow-hidden flex flex-col">
                <div className="hidden md:grid grid-cols-12 px-space-lg py-space-sm bg-surface-container-low items-center text-on-surface-variant font-bold text-sm uppercase">
                  <div className="col-span-2 flex items-center gap-1.5">
                    <Icon name="schedule" className="text-lg text-outline" />
                    <span>{t('audit_log.col_when')}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <Icon name="account_circle" className="text-lg text-outline" />
                    <span>{t('audit_log.col_who')}</span>
                  </div>
                  <div className="col-span-5 flex items-center gap-1.5">
                    <Icon name="assignment" className="text-lg text-outline" />
                    <span>{t('audit_log.col_action')}</span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5">
                    <Icon name="target" className="text-lg text-outline" />
                    <span>{t('audit_log.col_target')}</span>
                  </div>
                </div>

                {isLoading ? (
                  <div className="p-8 text-center text-on-surface-variant font-semibold">
                    {t('stock_dekho.loading_stock')}
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="py-8">
                    <EmptyState
                      title={t('audit_log.empty_title')}
                      subtitle={t('audit_log.empty_sub')}
                      icon="verified_user"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-outline-variant/20 max-h-[520px] overflow-y-auto">
                    {filteredEntries.map((entry) => {
                      const meta = actionIcon(entry.action || '');
                      return (
                        <div
                          key={entry.id}
                          className="min-h-[64px] grid grid-cols-1 md:grid-cols-12 px-4 md:px-space-lg py-3 items-center gap-2 hover:bg-surface-container-low/50 transition-colors"
                        >
                          <div className="md:col-span-2 text-sm font-bold text-on-surface-variant">
                            {formatTimestamp(entry.timestamp)}
                          </div>
                          <div className="md:col-span-2 flex items-center gap-2 min-w-0">
                            <span className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-xs text-on-surface shrink-0">
                              {(entry.who || 'U').charAt(0).toUpperCase()}
                            </span>
                            <span className="font-bold text-on-surface truncate">{entry.who}</span>
                          </div>
                          <div className="md:col-span-5 flex items-start gap-2 min-w-0">
                            <Icon name={meta.icon} className={`text-xl shrink-0 mt-0.5 ${meta.color}`} />
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-sm text-on-surface">
                                {entry.action}
                              </span>
                              <span className="text-xs sm:text-sm text-on-surface-variant break-words">
                                {entry.details}
                              </span>
                            </div>
                          </div>
                          <div className="md:col-span-3">
                            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-surface-container text-on-surface text-xs sm:text-sm font-bold">
                              {entry.record || '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Back Bar */}
              <div className="flex items-center justify-start pt-1">
                <button
                  type="button"
                  onClick={onBackToOwnerMenu}
                  className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/40 text-on-surface font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <Icon name="arrow_back" className="text-2xl" />
                  <span>{backBtn.main}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

