import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { DBUser, RegularReminder, Shop } from '../db';
import { useTranslation, tButton } from '../i18n';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { EmptyState } from '../components/EmptyState';
import { textFieldProps } from '../logic/format';
import { formatRupees } from '../logic/money';
import {
  buildUdhaarWhatsAppUrl,
  getReminderUrgency,
  isYaadDilaoEligible,
  loadUdhaarDashboardData,
  type CustomerLedgerEntry,
} from '../logic/udhaar';
import { PaisaMilaModal } from './udhaar/PaisaMilaModal';
import { YaadDilaoModal } from './udhaar/YaadDilaoModal';
import { CustomerDetailScreen } from './udhaar/CustomerDetailScreen';
import { CustomerFormModal } from './udhaar/CustomerFormModal';

interface UdhaarProps {
  onReturnHome: () => void;
  onOpenBilling?: () => void;
  initialView?: 'udhaar' | 'customers';
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  shop?: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Udhaar: React.FC<UdhaarProps> = ({
  onReturnHome,
  onOpenBilling,
  initialView = 'udhaar',
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [view, setView] = useState<'udhaar' | 'customers'>(initialView);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [allCustomers, setAllCustomers] = useState<CustomerLedgerEntry[]>([]);
  const [pendingCustomers, setPendingCustomers] = useState<CustomerLedgerEntry[]>([]);
  const [totalOutstandingPaise, setTotalOutstandingPaise] = useState<number>(0);
  const [regularReminders, setRegularReminders] = useState<RegularReminder[]>([]);

  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [paisaMilaTarget, setPaisaMilaTarget] = useState<CustomerLedgerEntry | null>(null);
  const [yaadDilaoTarget, setYaadDilaoTarget] = useState<CustomerLedgerEntry | null>(null);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await loadUdhaarDashboardData();
      setAllCustomers(data.allCustomers);
      setPendingCustomers(data.pendingCustomers);
      setTotalOutstandingPaise(data.totalOutstandingPaise);
      setRegularReminders(data.regularReminders);
    } catch (err) {
      console.error('Failed to load udhaar data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c.key === selectedCustomerKey) || null,
    [allCustomers, selectedCustomerKey]
  );

  const dueSoonReminders = useMemo(
    () =>
      regularReminders.filter((r) => {
        if (!r.active) return false;
        const u = getReminderUrgency(r.nextDueDate);
        return u === 'overdue' || u === 'today' || u === 'tomorrow';
      }),
    [regularReminders]
  );

  const filteredPending = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pendingCustomers;
    return pendingCustomers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.toLowerCase().includes(q)
    );
  }, [pendingCustomers, searchQuery]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = [...allCustomers].sort((a, b) =>
      a.customerName.localeCompare(b.customerName)
    );
    if (!q) return list;
    return list.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.toLowerCase().includes(q)
    );
  }, [allCustomers, searchQuery]);

  const handleOpenWhatsAppMorning = (rem: RegularReminder) => {
    try {
      const msg = t('customers.wa_regular_text', {
        name: rem.customerName,
        medicine: rem.medicineName,
        date: rem.nextDueDate,
        shop: shopName || '',
      });
      const url = buildUdhaarWhatsAppUrl(rem.customerPhone, msg);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp open failed:', err);
    }
  };

  if (selectedCustomer) {
    return (
      <CustomerDetailScreen
        customer={selectedCustomer}
        reminders={regularReminders}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnHome={onReturnHome}
        onBack={() => setSelectedCustomerKey(null)}
        onRefresh={() => {
          void refreshData();
        }}
        onQuickBillCustomer={
          onOpenBilling
            ? () => {
                onOpenBilling();
              }
            : undefined
        }
      />
    );
  }

  const homeBtn = tButton('home.return_home_btn');
  const paisaMilaBtn = tButton('udhaar.btn_paisa_mila');
  const yaadDilaoBtn = tButton('udhaar.btn_yaad_dilao');
  const customersTabBtn = tButton('udhaar.btn_customers');
  const newCustomerBtn = tButton('customers.btn_new_customer');
  const backBtn = tButton('suppliers.btn_back');

  const getInitials = (name: string) =>
    (name || 'C')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');

  return (
    <div className="w-full min-h-screen bg-surface font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg min-w-0">
            <span className="font-headline-lg text-headline-lg text-primary tracking-tight font-extrabold">
              HOSPIVO
            </span>
            {shopName && (
              <>
                <div className="hidden md:block h-6 w-px bg-outline-variant" />
                <span className="hidden md:inline font-headline-md text-xl text-on-surface font-bold truncate">
                  {shopName}
                </span>
              </>
            )}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-space-sm py-1 bg-surface-container-low rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs sm:text-sm text-primary font-bold">{modeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="home" className="text-[20px]" />
              <div className="flex flex-col leading-tight text-left">
                <span className="text-sm sm:text-base font-bold">{homeBtn.main}</span>
                {homeBtn.sub && (
                  <span className="text-[11px] opacity-85 hidden sm:inline">{homeBtn.sub}</span>
                )}
              </div>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[24px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer" />

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
      <main className="w-full pt-20 flex-1 bg-surface flex flex-col">
        <div className="flex flex-col w-full max-w-[1360px] mx-auto flex-1 justify-between px-gutter py-space-md gap-space-md">
          <div className="flex flex-col gap-space-md flex-1">
            {/* Header Row: Title + View Switcher + Total Outstanding Pill */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
              <div className="flex flex-col">
                <h1 className="font-headline-lg text-headline-lg font-extrabold text-on-surface leading-tight">
                  {view === 'udhaar' ? t('udhaar.page_title') : t('customers.page_title')}
                </h1>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                  {view === 'udhaar' ? t('udhaar.page_sub') : t('customers.page_sub')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Switch between Udhaar Ledger & Customers Directory */}
                <div className="inline-flex p-1 bg-surface-container rounded-2xl gap-1">
                  <button
                    type="button"
                    onClick={() => setView('udhaar')}
                    className={`h-12 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center gap-2 cursor-pointer transition-all ${
                      view === 'udhaar'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <Icon name="account_balance_wallet" className="text-xl" />
                    <span>{t('udhaar.page_title')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('customers')}
                    className={`h-12 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center gap-2 cursor-pointer transition-all ${
                      view === 'customers'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <Icon name="groups" className="text-xl" />
                    <span>{customersTabBtn.main}</span>
                    {dueSoonReminders.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-error text-on-error text-xs font-extrabold">
                        {dueSoonReminders.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Total Outstanding Credit Pill */}
                <div className="bg-error-container text-on-error-container px-5 py-2.5 rounded-full flex items-center gap-2.5 shadow-sm">
                  <Icon name="account_balance_wallet" className="text-error text-[26px]" />
                  <span className="font-headline-md text-lg sm:text-2xl font-extrabold text-error">
                    {t('udhaar.total_outstanding_label')} {formatRupees(totalOutstandingPaise)}
                  </span>
                </div>
              </div>
            </div>

            {/* Search Bar + Add Customer Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 h-14 px-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/50 flex items-center gap-3 shadow-sm">
                <Icon name="search" className="text-2xl text-on-surface-variant" />
                <input
                  {...textFieldProps('free', searchQuery, setSearchQuery)}
                  type="text"
                  placeholder={t('udhaar.search_placeholder')}
                  className="bg-transparent w-full text-on-surface text-base font-medium focus:outline-none placeholder:text-outline"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsNewCustomerOpen(true)}
                className="h-14 min-h-[56px] px-5 rounded-2xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer shrink-0"
              >
                <Icon name="person_add" className="text-2xl" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish font-bold">{newCustomerBtn.main}</span>
                  {newCustomerBtn.sub && (
                    <span className="text-xs opacity-85 pt-0.5">{newCustomerBtn.sub}</span>
                  )}
                </div>
              </button>
            </div>

            {/* VIEW 1: UDHAAR LEDGER LIST (28a) */}
            {view === 'udhaar' && (
              <>
                {dueSoonReminders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setView('customers')}
                    className="w-full p-3.5 rounded-2xl bg-primary-fixed/40 hover:bg-primary-fixed/60 border border-primary/30 text-on-surface flex items-center justify-between gap-3 cursor-pointer transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Icon name="notifications_active" className="text-primary text-2xl shrink-0" />
                      <span className="font-bold text-sm sm:text-base">
                        {t('customers.morning_alert_title')} ({dueSoonReminders.length})
                      </span>
                    </div>
                    <Icon name="arrow_forward" className="text-primary text-xl shrink-0" />
                  </button>
                )}

                {isLoading ? (
                  <div className="p-8 rounded-2xl bg-surface-container-lowest text-center text-on-surface-variant font-semibold">
                    {t('stock_dekho.loading_stock')}
                  </div>
                ) : filteredPending.length === 0 ? (
                  <div className="py-8">
                    <EmptyState
                      title={t('udhaar.empty_title')}
                      subtitle={t('udhaar.empty_sub')}
                      icon="account_balance_wallet"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-space-sm">
                    {filteredPending.map((cust) => {
                      const canRemind = isYaadDilaoEligible(cust.daysPending);
                      return (
                        <div
                          key={cust.key}
                          className="min-h-[80px] w-full bg-surface-container-lowest rounded-2xl px-4 sm:px-space-lg py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm hover:shadow-md transition-shadow border border-outline-variant/30"
                        >
                          {/* Clickable Customer Info -> opens Customer Detail (29a/29b) */}
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerKey(cust.key)}
                            className="flex items-center gap-space-md min-w-0 text-left cursor-pointer group flex-1"
                          >
                            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary font-bold font-title-hinglish text-lg shrink-0 group-hover:bg-primary group-hover:text-on-primary transition-colors">
                              {getInitials(cust.customerName)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-title-hinglish text-lg sm:text-xl text-on-surface font-bold leading-tight truncate group-hover:text-primary transition-colors">
                                {cust.customerName}
                              </span>
                              <span className="text-sm sm:text-base text-on-surface-variant leading-tight mt-0.5 truncate">
                                {cust.customerPhone ? `${cust.customerPhone} · ` : ''}
                                {cust.daysPending > 0
                                  ? t('udhaar.days_pending_text', { days: cust.daysPending })
                                  : t('udhaar.due_today_text')}
                              </span>
                            </div>
                          </button>

                          {/* Amount + Paisa Mila + Yaad Dilao */}
                          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-3 sm:gap-space-lg shrink-0">
                            <div className="text-left md:text-right">
                              <span className="font-headline-md text-xl sm:text-2xl font-extrabold text-error tabular-nums">
                                {formatRupees(cust.pendingBalancePaise)}
                              </span>
                            </div>

                            <div className="flex items-center gap-space-sm">
                              {/* Paisa Mila Button */}
                              <button
                                type="button"
                                onClick={() => setPaisaMilaTarget(cust)}
                                className="h-14 min-h-[56px] px-space-md rounded-2xl bg-surface-container-low hover:bg-surface-container text-primary border border-primary/30 transition-colors shadow-sm flex items-center gap-2 active:translate-y-0.5 cursor-pointer"
                              >
                                <Icon name="payments" className="text-[26px]" />
                                <div className="flex flex-col text-left leading-none">
                                  <span className="font-title-hinglish text-base sm:text-lg font-bold">
                                    {paisaMilaBtn.main}
                                  </span>
                                  {paisaMilaBtn.sub && (
                                    <span className="text-xs opacity-80 pt-0.5">
                                      {paisaMilaBtn.sub}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* Yaad Dilao Button (ONLY active when daysPending > 7) */}
                              <button
                                type="button"
                                disabled={!canRemind}
                                onClick={() => canRemind && setYaadDilaoTarget(cust)}
                                title={
                                  canRemind ? undefined : t('udhaar.yaad_dilao_disabled_hint')
                                }
                                className={`h-14 min-h-[56px] px-space-md rounded-2xl flex items-center gap-2 transition-all ${
                                  canRemind
                                    ? 'bg-primary text-on-primary hover:bg-primary-container shadow-sm active:translate-y-0.5 cursor-pointer'
                                    : 'bg-surface-container-highest text-outline cursor-not-allowed opacity-70'
                                }`}
                              >
                                <Icon name="chat" className="text-[26px]" />
                                <div className="flex flex-col text-left leading-none">
                                  <span className="font-title-hinglish text-base sm:text-lg font-bold">
                                    {yaadDilaoBtn.main}
                                  </span>
                                  {yaadDilaoBtn.sub && (
                                    <span className="text-xs opacity-85 pt-0.5">
                                      {yaadDilaoBtn.sub}
                                    </span>
                                  )}
                                </div>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* VIEW 2: CUSTOMERS DIRECTORY & DUE REGULAR REMINDERS */}
            {view === 'customers' && (
              <div className="flex flex-col gap-space-md">
                {/* Due Regular Medicines Morning List */}
                {dueSoonReminders.length > 0 && (
                  <div className="bg-primary-container/10 border border-primary/25 rounded-2xl p-space-md flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Icon name="notifications_active" className="text-primary text-2xl" />
                      <h2 className="font-title-hinglish text-lg font-bold text-on-surface">
                        {t('customers.morning_alert_title')}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {dueSoonReminders.map((rem) => (
                        <div
                          key={rem.id}
                          className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/40 flex items-center justify-between gap-3 shadow-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-on-surface truncate">
                              {rem.customerName}
                            </div>
                            <div className="text-sm text-on-surface-variant truncate">
                              {rem.medicineName} · {t('customers.next_due_prefix')}{' '}
                              <strong>{rem.nextDueDate}</strong>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenWhatsAppMorning(rem)}
                              className="h-12 px-3.5 rounded-xl bg-primary text-on-primary font-bold text-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <Icon name="chat" className="text-lg" />
                              <span>{tButton('customers.btn_wa_reminder').main}</span>
                            </button>
                            {onOpenBilling && (
                              <button
                                type="button"
                                onClick={onOpenBilling}
                                className="h-12 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-bold text-sm flex items-center gap-1 cursor-pointer"
                              >
                                <Icon name="point_of_sale" className="text-lg" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer Directory List */}
                {filteredCustomers.length === 0 ? (
                  <div className="py-8">
                    <EmptyState
                      title={t('customers.empty_title')}
                      subtitle={t('customers.empty_sub')}
                      icon="groups"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {filteredCustomers.map((cust) => {
                      const remCount = regularReminders.filter(
                        (r) =>
                          r.active &&
                          ((cust.customerId && r.customerId === cust.customerId) ||
                            r.customerPhone === cust.customerPhone)
                      ).length;

                      return (
                        <button
                          key={cust.key}
                          type="button"
                          onClick={() => setSelectedCustomerKey(cust.key)}
                          className="min-h-[76px] w-full bg-surface-container-lowest hover:bg-surface-container-low rounded-2xl px-4 sm:px-space-lg py-3 flex items-center justify-between gap-3 shadow-sm border border-outline-variant/30 transition-all cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-space-md min-w-0">
                            <div className="w-12 h-12 rounded-full bg-primary-container/15 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                              {getInitials(cust.customerName)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-title-hinglish text-lg font-bold text-on-surface truncate">
                                {cust.customerName}
                              </span>
                              <span className="text-sm text-on-surface-variant truncate">
                                {cust.customerPhone || '—'}
                                {cust.creditLimitPaise > 0
                                  ? ` · ${t('udhaar.credit_limit_label')} ${formatRupees(cust.creditLimitPaise)}`
                                  : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {remCount > 0 && (
                              <span className="px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-xs font-bold">
                                {remCount} {t('customers.regular_title')}
                              </span>
                            )}
                            {cust.pendingBalancePaise > 0 && (
                              <span className="font-headline-md text-lg font-extrabold text-error">
                                {formatRupees(cust.pendingBalancePaise)}
                              </span>
                            )}
                            <Icon name="chevron_right" className="text-on-surface-variant text-2xl" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Back Button */}
          <div className="pt-space-xs flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="h-14 min-h-[56px] px-space-lg rounded-2xl bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-outline-variant/40 transition-colors shadow-sm flex items-center gap-space-sm active:translate-y-0.5 cursor-pointer"
            >
              <Icon name="arrow_back" className="text-[26px] text-on-surface-variant" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-title-hinglish text-lg font-bold">{backBtn.main}</span>
                {backBtn.sub && (
                  <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </main>

      {/* Paisa Mila Modal (28b) */}
      <PaisaMilaModal
        isOpen={paisaMilaTarget !== null}
        customer={paisaMilaTarget}
        currentUser={currentUser}
        onClose={() => setPaisaMilaTarget(null)}
        onSaved={() => {
          setPaisaMilaTarget(null);
          void refreshData();
        }}
      />

      {/* Yaad Dilao Modal (28c) */}
      <YaadDilaoModal
        isOpen={yaadDilaoTarget !== null}
        customer={yaadDilaoTarget}
        onClose={() => setYaadDilaoTarget(null)}
      />

      {/* New Customer Modal */}
      <CustomerFormModal
        isOpen={isNewCustomerOpen}
        currentUser={currentUser}
        onClose={() => setIsNewCustomerOpen(false)}
        onSaved={() => {
          setIsNewCustomerOpen(false);
          void refreshData();
        }}
      />
    </div>
  );
};

