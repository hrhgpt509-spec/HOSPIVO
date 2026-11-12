import React, { useState, useEffect, useMemo } from 'react';
import { db, type DBUser, type Medicine, type RegularReminder } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { useShop } from '../../logic/useShop';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { OwnerPinGate } from '../../components/OwnerPinGate';
import { formatRupees } from '../../logic/money';
import { isOwner } from '../../logic/roles';
import {
  buildUdhaarWhatsAppUrl,
  getReminderUrgency,
  makeCustomerKey,
  normalizePhoneKey,
  toggleRegularReminderActive,
  type CustomerLedgerEntry,
} from '../../logic/udhaar';
import { CustomerFormModal } from './CustomerFormModal';
import { RegularReminderModal } from './RegularReminderModal';
import { PaisaMilaModal } from './PaisaMilaModal';

interface CustomerDetailScreenProps {
  customer: CustomerLedgerEntry;
  reminders: RegularReminder[];
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onReturnHome: () => void;
  onBack: () => void;
  onRefresh: () => void;
  onQuickBillCustomer?: (customer: CustomerLedgerEntry) => void;
}

export const CustomerDetailScreen: React.FC<CustomerDetailScreenProps> = ({
  customer,
  reminders,
  currentUser,
  theme = 'light',
  onToggleTheme,
  onReturnHome,
  onBack,
  onRefresh,
  onQuickBillCustomer,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [activeTab, setActiveTab] = useState<'ledger' | 'regular'>('ledger');
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const [isOwnerGateOpen, setIsOwnerGateOpen] = useState<boolean>(false);
  const [limitUnlocked, setLimitUnlocked] = useState<boolean>(false);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState<boolean>(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState<boolean>(false);
  const [editingReminder, setEditingReminder] = useState<RegularReminder | null>(null);
  const [isPaisaMilaOpen, setIsPaisaMilaOpen] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  useEffect(() => {
    db.medicines
      .orderBy('name')
      .toArray()
      .then((list) => setMedicines(list.filter((m) => m.active)))
      .catch(() => setMedicines([]));
  }, []);

  const customerReminders = useMemo(() => {
    const custKey = customer.key;
    const custNorm = normalizePhoneKey(customer.customerPhone);
    return reminders
      .filter((r) => {
        if (customer.customerId && r.customerId === customer.customerId) return true;
        if (custNorm && normalizePhoneKey(r.customerPhone) === custNorm) return true;
        return makeCustomerKey(r.customerPhone, r.customerName) === custKey;
      })
      .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }, [reminders, customer]);

  const dueSoonReminders = useMemo(
    () =>
      customerReminders.filter((r) => {
        if (!r.active) return false;
        const u = getReminderUrgency(r.nextDueDate);
        return u === 'overdue' || u === 'today' || u === 'tomorrow';
      }),
    [customerReminders]
  );

  const ledgerTimeline = useMemo(() => {
    const rows: Array<{
      id: string;
      kind: 'bill' | 'payment';
      date: string;
      sortKey: string;
      title: string;
      subtitle: string;
      amountPaise: number;
    }> = [];

    for (const bill of customer.bills) {
      rows.push({
        id: `bill-${bill.id || bill.billNo}`,
        kind: 'bill',
        date: bill.date,
        sortKey: bill.createdAt || bill.date,
        title: t('customers.row_udhaar_bill', { billNo: bill.billNo }),
        subtitle: `${bill.date}${bill.doctorName ? ` · ${bill.doctorName}` : ''}`,
        amountPaise: bill.totalPaise,
      });
    }

    for (const pay of customer.payments) {
      rows.push({
        id: `pay-${pay.id}`,
        kind: 'payment',
        date: (pay.createdAt || '').split('T')[0],
        sortKey: pay.createdAt,
        title: t('customers.row_payment_received', { mode: pay.mode.toUpperCase() }),
        subtitle: `${(pay.createdAt || '').split('T')[0]}${pay.note ? ` · ${pay.note}` : ''}`,
        amountPaise: pay.amountPaise,
      });
    }

    rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return rows;
  }, [customer.bills, customer.payments, t]);

  const initials = (customer.customerName || 'C')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const handleOpenChangeLimit = () => {
    if (isOwner(currentUser) || limitUnlocked) {
      setIsEditCustomerOpen(true);
    } else {
      setIsOwnerGateOpen(true);
    }
  };

  const handleSendWhatsAppLedger = () => {
    try {
      const msg = t('udhaar.wa_reminder_text', {
        amount: formatRupees(customer.pendingBalancePaise),
        shop: shopName || '',
      });
      const url = buildUdhaarWhatsAppUrl(customer.customerPhone, msg);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp open failed:', err);
    }
  };

  const handleSendWhatsAppReminder = (rem: RegularReminder) => {
    try {
      const msg = t('customers.wa_regular_text', {
        name: customer.customerName,
        medicine: rem.medicineName,
        date: rem.nextDueDate,
        shop: shopName || '',
      });
      const url = buildUdhaarWhatsAppUrl(customer.customerPhone, msg);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp open failed:', err);
    }
  };

  const homeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('suppliers.btn_back');
  const ledgerTabBtn = tButton('customers.tab_ledger');
  const regularTabBtn = tButton('customers.tab_regular');
  const changeLimitBtn = tButton('customers.btn_change_limit');
  const paisaMilaBtn = tButton('udhaar.btn_paisa_mila');
  const sendLedgerWaBtn = tButton('customers.btn_send_ledger_wa');
  const addRemBtn = tButton('customers.btn_add_reminder');
  const waRemBtn = tButton('customers.btn_wa_reminder');
  const quickBillBtn = tButton('customers.btn_quick_bill');

  return (
    <div className="w-full min-h-screen bg-background font-body-md text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg min-w-0">
            <div className="flex items-center gap-space-sm shrink-0">
              <Icon name="local_pharmacy" className="text-primary text-[30px]" />
              <span className="font-headline-lg text-headline-lg text-primary font-extrabold tracking-tight">
                HOSPIVO
              </span>
            </div>
            {shopName && (
              <>
                <div className="hidden md:block h-8 w-[2px] bg-surface-container-highest" />
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="font-title-hinglish text-lg text-on-surface font-bold truncate">
                    {shopName}
                  </span>
                  <span className="text-xs text-on-surface-variant">{modeLabel}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{homeBtn.main}</span>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer" />

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

      {/* Main Split Content (29a + 29b) */}
      <main className="w-full pt-20 flex-1 bg-background p-gutter">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md w-full max-w-[1440px] mx-auto">
          {/* LEFT COLUMN: Profile & Credit Limit */}
          <div className="lg:col-span-4 flex flex-col justify-between bg-surface-container-lowest rounded-2xl shadow-sm p-space-lg gap-space-md border border-outline-variant/30">
            <div className="flex flex-col gap-space-md">
              {/* Identity */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-space-md min-w-0">
                  <div className="w-16 h-16 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center font-headline-lg text-2xl font-extrabold shadow-sm shrink-0">
                    {initials || 'C'}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h1 className="font-headline-lg text-2xl text-on-surface font-bold leading-tight truncate">
                      {customer.customerName}
                    </h1>
                    <div className="flex items-center gap-1.5 text-primary mt-0.5">
                      <Icon name="call" className="text-[18px]" />
                      <span className="font-bold text-on-surface text-base">
                        {customer.customerPhone || '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditCustomerOpen(true)}
                  className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center cursor-pointer shrink-0"
                  aria-label="Edit profile"
                >
                  <Icon name="edit" className="text-xl" />
                </button>
              </div>

              {/* Address Card */}
              <div className="bg-surface-container-low rounded-xl p-space-sm flex items-start gap-space-xs">
                <Icon name="location_on" className="text-outline mt-0.5 text-[22px]" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm text-on-surface-variant font-medium">
                    {t('customers.address_label')}
                  </span>
                  <span className="font-bold text-on-surface text-base">
                    {customer.address || '—'}
                  </span>
                </div>
              </div>

              {/* Credit Limit Card (29a) */}
              <div className="bg-surface-container-high rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs sm:text-sm text-on-surface-variant font-semibold">
                      {t('customers.credit_limit_title')}
                    </span>
                    <span className="font-title-hinglish text-xl text-on-surface font-extrabold">
                      {customer.creditLimitPaise > 0
                        ? formatRupees(customer.creditLimitPaise)
                        : t('customers.credit_limit_none')}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm">
                    <Icon name="account_balance_wallet" className="text-2xl" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenChangeLimit}
                  className="w-full h-14 min-h-[56px] bg-surface-container-lowest hover:bg-surface-bright active:scale-[0.98] transition-all rounded-2xl flex items-center justify-center gap-space-sm shadow-sm cursor-pointer border border-outline-variant/40"
                >
                  <Icon
                    name={isOwner(currentUser) ? 'tune' : 'lock'}
                    className="text-tertiary text-[22px]"
                  />
                  <div className="flex flex-col text-left leading-none">
                    <span className="font-title-hinglish text-base text-on-surface font-bold">
                      {changeLimitBtn.main}
                    </span>
                    {!isOwner(currentUser) && (
                      <span className="text-xs text-tertiary font-bold pt-0.5">
                        {t('customers.owner_pin_sub')}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Back Button */}
            <button
              type="button"
              onClick={onBack}
              className="w-full h-14 min-h-[56px] bg-surface-container hover:bg-surface-container-high active:translate-y-0.5 rounded-2xl flex items-center justify-center gap-space-sm transition-all text-on-surface shadow-sm cursor-pointer"
            >
              <Icon name="arrow_back" className="text-[24px]" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-title-hinglish text-lg font-bold">{backBtn.main}</span>
                {backBtn.sub && (
                  <span className="text-xs text-on-surface-variant">{backBtn.sub}</span>
                )}
              </div>
            </button>
          </div>

          {/* RIGHT COLUMN: Tab Switcher + Ledger (29a) / Regular Medicines (29b) */}
          <div className="lg:col-span-8 flex flex-col justify-between bg-surface-container-lowest rounded-2xl shadow-sm p-space-lg gap-space-md border border-outline-variant/30">
            {/* Top Tabs */}
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`min-h-[56px] px-4 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  activeTab === 'ledger'
                    ? 'bg-primary text-on-primary shadow-md'
                    : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                }`}
              >
                <Icon name="receipt_long" className="text-2xl" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish text-base sm:text-lg font-bold">
                    {ledgerTabBtn.main}
                  </span>
                  {ledgerTabBtn.sub && (
                    <span className="text-xs opacity-85 pt-0.5">{ledgerTabBtn.sub}</span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('regular')}
                className={`min-h-[56px] px-4 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  activeTab === 'regular'
                    ? 'bg-primary text-on-primary shadow-md'
                    : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                }`}
              >
                <Icon name="medication" className="text-2xl" />
                <div className="flex flex-col text-left leading-none">
                  <span className="font-title-hinglish text-base sm:text-lg font-bold">
                    {regularTabBtn.main}
                  </span>
                  {regularTabBtn.sub && (
                    <span className="text-xs opacity-85 pt-0.5">{regularTabBtn.sub}</span>
                  )}
                </div>
                {dueSoonReminders.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-error text-on-error text-xs font-extrabold">
                    {dueSoonReminders.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: HISAAB LEDGER (29a) */}
            {activeTab === 'ledger' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-headline-lg text-2xl text-on-surface font-bold">
                      {t('customers.ledger_title')}
                    </h2>
                    <span className="text-sm text-on-surface-variant">
                      {t('customers.ledger_sub')}
                    </span>
                  </div>

                  <div className="bg-error-container text-on-error-container px-5 py-2.5 rounded-2xl flex items-center gap-3 shadow-sm shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-error text-on-error flex items-center justify-center">
                      <Icon name="pending_actions" className="text-2xl" />
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-xs font-bold uppercase text-error">
                        {t('udhaar.pm_balance_label')}
                      </span>
                      <span className="font-headline-lg text-2xl text-error font-extrabold leading-tight">
                        {formatRupees(customer.pendingBalancePaise)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ledger Rows */}
                <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1 flex-1">
                  {ledgerTimeline.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-surface-container-low text-center text-on-surface-variant font-medium">
                      {t('customers.ledger_empty')}
                    </div>
                  ) : (
                    ledgerTimeline.map((row) => (
                      <div
                        key={row.id}
                        className="min-h-[64px] px-4 py-2.5 rounded-2xl bg-surface-container-low flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                              row.kind === 'bill'
                                ? 'bg-error-container text-error'
                                : 'bg-primary-fixed text-on-primary-fixed-variant'
                            }`}
                          >
                            <Icon
                              name={row.kind === 'bill' ? 'receipt_long' : 'payments'}
                              className="text-2xl"
                            />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-title-hinglish text-base sm:text-lg text-on-surface font-bold truncate">
                              {row.title}
                            </span>
                            <span className="text-xs sm:text-sm text-on-surface-variant truncate">
                              {row.subtitle}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`font-title-hinglish text-lg font-extrabold ${
                              row.kind === 'bill' ? 'text-error' : 'text-primary'
                            }`}
                          >
                            {formatRupees(row.amountPaise)}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-xl text-xs sm:text-sm font-bold ${
                              row.kind === 'bill'
                                ? 'bg-error-container text-error'
                                : 'bg-primary-container text-on-primary-container'
                            }`}
                          >
                            {row.kind === 'bill'
                              ? t('customers.row_udhaar_badge')
                              : t('customers.row_jama_badge')}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={handleSendWhatsAppLedger}
                    disabled={customer.pendingBalancePaise <= 0}
                    className="h-14 min-h-[56px] px-5 bg-surface-container-low hover:bg-surface-container-high text-primary rounded-2xl flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-40"
                  >
                    <Icon name="chat" className="text-2xl" />
                    <div className="flex flex-col text-left leading-none">
                      <span className="font-title-hinglish font-bold text-on-surface">
                        {sendLedgerWaBtn.main}
                      </span>
                      {sendLedgerWaBtn.sub && (
                        <span className="text-xs text-primary font-bold pt-0.5">
                          {sendLedgerWaBtn.sub}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPaisaMilaOpen(true)}
                    disabled={customer.pendingBalancePaise <= 0}
                    className="h-14 min-h-[56px] flex-1 max-w-sm bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center justify-center gap-3 shadow-md cursor-pointer disabled:opacity-40"
                  >
                    <Icon name="currency_rupee" className="text-[28px]" />
                    <div className="flex flex-col text-left leading-none">
                      <span className="font-button-text text-lg font-bold">
                        {paisaMilaBtn.main}
                      </span>
                      {paisaMilaBtn.sub && (
                        <span className="text-xs text-primary-fixed font-bold pt-0.5">
                          {paisaMilaBtn.sub}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* TAB 2: REGULAR MEDICINES & REMINDERS (29b) */}
            {activeTab === 'regular' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-headline-lg text-2xl text-on-surface font-bold">
                      {t('customers.regular_title')}
                    </h2>
                    <span className="text-sm text-on-surface-variant">
                      {t('customers.regular_sub')}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingReminder(null);
                      setIsReminderModalOpen(true);
                    }}
                    className="h-14 min-h-[56px] px-space-md bg-surface-container-low hover:bg-surface-container text-primary rounded-2xl flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Icon name="add_circle" className="text-[26px]" />
                    <div className="flex flex-col items-start leading-none">
                      <span className="font-title-hinglish font-bold text-primary">
                        {addRemBtn.main}
                      </span>
                      {addRemBtn.sub && (
                        <span className="text-xs text-on-surface-variant pt-0.5">
                          {addRemBtn.sub}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Schedules List */}
                <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1 flex-1">
                  {customerReminders.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-surface-container-low text-center text-on-surface-variant font-medium">
                      {t('customers.regular_empty')}
                    </div>
                  ) : (
                    customerReminders.map((rem) => {
                      const urgency = getReminderUrgency(rem.nextDueDate);
                      const urgencyBadge =
                        urgency === 'overdue'
                          ? {
                              text: t('customers.due_overdue_badge'),
                              cls: 'bg-error-container text-on-error-container',
                            }
                          : urgency === 'today'
                            ? {
                                text: t('customers.due_today_badge'),
                                cls: 'bg-tertiary-fixed text-on-tertiary-fixed',
                              }
                            : urgency === 'tomorrow'
                              ? {
                                  text: t('customers.due_tomorrow_badge'),
                                  cls: 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200',
                                }
                              : {
                                  text: t('customers.due_upcoming_badge'),
                                  cls: 'bg-surface-container-high text-on-surface-variant',
                                };

                      return (
                        <div
                          key={rem.id}
                          className={`min-h-[76px] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm border border-outline-variant/40 bg-surface-container-low ${
                            !rem.active ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-2xl bg-primary-container/15 flex items-center justify-center shrink-0">
                              <Icon name="medication" className="text-primary text-[28px]" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-title-hinglish text-lg text-on-surface font-bold truncate">
                                {rem.medicineName}
                              </span>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${urgencyBadge.cls}`}
                                >
                                  {urgencyBadge.text}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface text-xs font-medium">
                                  {t('customers.pack_days_badge', { days: rem.packDays })}
                                </span>
                                <span className="text-xs font-bold text-primary flex items-center gap-1">
                                  <Icon name="calendar_today" className="text-sm" />
                                  {t('customers.next_due_prefix')} {rem.nextDueDate}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSendWhatsAppReminder(rem)}
                              className="h-12 px-3.5 rounded-xl bg-primary text-on-primary font-bold text-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <Icon name="chat" className="text-lg" />
                              <span>{waRemBtn.main}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReminder(rem);
                                setIsReminderModalOpen(true);
                              }}
                              className="w-12 h-12 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center cursor-pointer"
                              aria-label="Edit reminder"
                            >
                              <Icon name="edit" className="text-xl" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (rem.id !== undefined) {
                                  await toggleRegularReminderActive(rem.id, !rem.active);
                                  onRefresh();
                                }
                              }}
                              className="w-12 h-12 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center cursor-pointer"
                              aria-label="Toggle active"
                            >
                              <Icon
                                name={rem.active ? 'notifications_active' : 'notifications_off'}
                                className="text-xl"
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Morning Due Alert Banner (29b: "Kal dawai khatam, ready rakhein?") */}
                {dueSoonReminders.length > 0 && (
                  <div className="bg-primary-container/10 border border-primary/25 rounded-2xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-space-md min-w-0">
                      <div className="w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center shrink-0">
                        <Icon name="notifications_active" className="text-[32px]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-button-text text-lg sm:text-xl font-bold text-on-surface">
                          {t('customers.morning_alert_title')}
                        </span>
                        <span className="text-sm text-on-surface-variant">
                          {dueSoonReminders.map((r) => r.medicineName).join(', ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppReminder(dueSoonReminders[0])}
                        className="h-14 min-h-[56px] px-5 bg-primary hover:bg-primary-container text-on-primary rounded-2xl flex items-center gap-2 shadow-md cursor-pointer"
                      >
                        <Icon name="chat" className="text-2xl" />
                        <span className="font-bold">{waRemBtn.main}</span>
                      </button>

                      {onQuickBillCustomer && (
                        <button
                          type="button"
                          onClick={() => onQuickBillCustomer(customer)}
                          className="h-14 min-h-[56px] px-5 bg-surface-container-lowest hover:bg-surface-container text-primary border border-primary/40 rounded-2xl flex items-center gap-2 shadow-sm cursor-pointer font-bold"
                        >
                          <Icon name="point_of_sale" className="text-2xl" />
                          <span>{quickBillBtn.main}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Owner PIN Gate for Credit Limit */}
      <OwnerPinGate
        isOpen={isOwnerGateOpen}
        onSuccess={() => {
          setIsOwnerGateOpen(false);
          setLimitUnlocked(true);
          setIsEditCustomerOpen(true);
        }}
        onClose={() => setIsOwnerGateOpen(false)}
      />

      {/* Edit Profile / Credit Limit Modal */}
      <CustomerFormModal
        isOpen={isEditCustomerOpen}
        initialCustomer={{
          id: customer.customerId,
          name: customer.customerName,
          phone: customer.customerPhone,
          address: customer.address,
          creditLimitPaise: customer.creditLimitPaise,
        }}
        limitEditableUnlocked={limitUnlocked}
        currentUser={currentUser}
        onClose={() => setIsEditCustomerOpen(false)}
        onSaved={() => {
          setIsEditCustomerOpen(false);
          onRefresh();
        }}
      />

      {/* Regular Medicine Schedule Modal */}
      <RegularReminderModal
        isOpen={isReminderModalOpen}
        customerId={customer.customerId}
        customerName={customer.customerName}
        customerPhone={customer.customerPhone}
        medicines={medicines}
        initialReminder={editingReminder}
        currentUser={currentUser}
        onClose={() => setIsReminderModalOpen(false)}
        onSaved={() => {
          setIsReminderModalOpen(false);
          onRefresh();
        }}
      />

      {/* Paisa Mila Modal */}
      <PaisaMilaModal
        isOpen={isPaisaMilaOpen}
        customer={customer}
        currentUser={currentUser}
        onClose={() => setIsPaisaMilaOpen(false)}
        onSaved={() => {
          setIsPaisaMilaOpen(false);
          onRefresh();
        }}
      />
    </div>
  );
};

