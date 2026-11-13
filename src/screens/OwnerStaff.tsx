import React, { useState, useEffect, useCallback } from 'react';
import { db, type DBUser } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useShop } from '../logic/useShop';
import { isOwner } from '../logic/roles';
import { textFieldProps } from '../logic/format';
import { hashPin, getPinLengthSetting } from '../logic/pin';
import { validateStaffPin } from '../logic/approvals';
import { addAudit } from '../db/audit';
import { triggerFeedback } from '../logic/feedback';
import { usePinKeyboard } from '../logic/usePinKeyboard';

interface OwnerStaffProps {
  currentUser?: DBUser | null;
  onBack: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

interface StaffTodayStats {
  bills: number;
  discounts: number;
  voids: number;
  pinRequests: number;
}

export const OwnerStaff: React.FC<OwnerStaffProps> = ({
  currentUser,
  onBack,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [users, setUsers] = useState<DBUser[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, StaffTodayStats>>({});
  const [totalBillsToday, setTotalBillsToday] = useState<number>(0);
  const [selectedStaff, setSelectedStaff] = useState<DBUser | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetPinModalOpen, setIsResetPinModalOpen] = useState(false);
  const [pinTargetUser, setPinTargetUser] = useState<DBUser | null>(null);
  const [userToRemove, setUserToRemove] = useState<DBUser | null>(null);

  // Add/Edit staff form state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffRole] = useState<'cashier'>('cashier');
  const [staffActive, setStaffActive] = useState(true);
  const [staffPin, setStaffPin] = useState('');
  const [formError, setFormError] = useState('');
  const [pinLength, setPinLength] = useState(4);

  // PIN modal state
  const [newPin, setNewPin] = useState('');
  const [pinModalError, setPinModalError] = useState('');

  // Translations
  const btnAddStaff = tButton('owner_staff.btn_add_staff');
  const btnResetPin = tButton('owner_staff.btn_reset_pin');
  const btnPause = tButton('owner_staff.btn_pause');
  const btnActivate = tButton('owner_staff.btn_activate');
  const btnRemove = tButton('owner_staff.btn_remove');
  const btnBack = tButton('owner_staff.btn_back');
  const btnSave = tButton('owner_staff.btn_save');
  const btnCancel = tButton('owner_staff.btn_cancel');

  const todayStr = new Date().toISOString().slice(0, 10);

  const loadData = useCallback(async () => {
    try {
      const len = await getPinLengthSetting();
      setPinLength(len);

      const allUsers = await db.users.toArray();
      setUsers(allUsers);

      const todayBills = await db.bills.where('date').equals(todayStr).toArray();
      setTotalBillsToday(todayBills.length);

      const todayLogs = await db.auditLog
        .where('timestamp')
        .between(`${todayStr}T00:00:00.000Z`, `${todayStr}T23:59:59.999Z`, true, true)
        .toArray();

      const newStatsMap: Record<string, StaffTodayStats> = {};

      for (const u of allUsers) {
        const uBills = todayBills.filter((b) => b.cashierId === u.id);
        const discountsCount = uBills.filter((b) => b.discountPaise > 0).length;
        const voidsCount = uBills.filter((b) => b.status === 'returned_full' || b.status === 'returned_partial').length;
        const pinRequestsCount = todayLogs.filter(
          (log) => log.who === u.name && (log.action.includes('approval') || log.action.includes('pin'))
        ).length;

        newStatsMap[u.id] = {
          bills: uBills.length,
          discounts: discountsCount,
          voids: voidsCount,
          pinRequests: pinRequestsCount,
        };
      }

      setStatsMap(newStatsMap);
    } catch (err) {
      console.error('Failed to load staff data:', err);
    }
  }, [todayStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Physical keyboard support for Reset PIN modal
  usePinKeyboard({
    onDigit: (digit) => {
      if (newPin.length < pinLength) {
        setNewPin((prev) => prev + digit);
        setPinModalError('');
      }
    },
    onBackspace: () => {
      setNewPin((prev) => prev.slice(0, -1));
      setPinModalError('');
    },
    onClear: () => {
      setNewPin('');
      setPinModalError('');
    },
    onEnter: () => {
      if (newPin.length === pinLength) {
        handleSaveNewPin();
      }
    },
    disabled: !isResetPinModalOpen,
  });

  // Check Owner access
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

  const activeOperatorsCount = users.filter((u) => u.role !== 'owner' && u.active).length;

  const handleOpenAddModal = () => {
    setEditingUserId(null);
    setStaffName('');
    setStaffActive(true);
    setStaffPin('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanName = staffName.trim();
    if (!cleanName) {
      setFormError(t('owner_staff.err_name_required'));
      return;
    }

    if (!editingUserId) {
      // Adding new staff requires valid PIN
      const val = await validateStaffPin(staffPin, undefined, undefined, pinLength);
      if (!val.ok) {
        if (val.error === 'staff_pin_same_as_owner') {
          setFormError(t('owner_staff.err_pin_same_as_owner'));
        } else if (val.error === 'staff_pin_same_as_approval') {
          setFormError(t('owner_staff.err_pin_same_as_approval'));
        } else if (val.error === 'staff_pin_duplicate') {
          setFormError(t('owner_staff.err_pin_duplicate'));
        } else {
          setFormError(t('owner_staff.err_pin_invalid'));
        }
        return;
      }

      const { hash, salt } = await hashPin(staffPin);
      const newStaffId = `staff_${Date.now()}`;

      const newStaff: DBUser = {
        id: newStaffId,
        name: cleanName,
        role: staffRole,
        pinHash: hash,
        pinSalt: salt,
        pinLength,
        active: staffActive,
        createdAt: new Date().toISOString(),
      };

      await db.users.add(newStaff);
      await addAudit(
        currentUser?.name || 'owner',
        'staff_created',
        newStaffId,
        `Staff ${cleanName} created with role ${staffRole}`
      );
      triggerFeedback('success', t('owner_staff.toast_staff_saved'));
    } else {
      // Editing existing staff
      await db.users.update(editingUserId, {
        name: cleanName,
        active: staffActive,
      });
      await addAudit(
        currentUser?.name || 'owner',
        'staff_updated',
        editingUserId,
        `Staff ${cleanName} updated: active=${staffActive}`
      );
      triggerFeedback('success', t('owner_staff.toast_staff_saved'));
    }

    setIsAddModalOpen(false);
    await loadData();
  };

  const handleToggleActive = async (user: DBUser) => {
    if (user.role === 'owner') return;
    const newActive = !user.active;
    await db.users.update(user.id, { active: newActive });
    await addAudit(
      currentUser?.name || 'owner',
      'staff_updated',
      user.id,
      `Staff ${user.name} active toggled to ${newActive}`
    );
    triggerFeedback('success', t('owner_staff.toast_status_updated'));
    await loadData();
    if (selectedStaff && selectedStaff.id === user.id) {
      setSelectedStaff({ ...selectedStaff, active: newActive });
    }
  };

  const handleOpenResetPin = (user: DBUser) => {
    setPinTargetUser(user);
    setNewPin('');
    setPinModalError('');
    setIsResetPinModalOpen(true);
  };

  const handleSaveNewPin = async () => {
    if (!pinTargetUser) return;
    setPinModalError('');

    const val = await validateStaffPin(newPin, undefined, undefined, pinLength, pinTargetUser.id);
    if (!val.ok) {
      if (val.error === 'staff_pin_same_as_owner') {
        setPinModalError(t('owner_staff.err_pin_same_as_owner'));
      } else if (val.error === 'staff_pin_same_as_approval') {
        setPinModalError(t('owner_staff.err_pin_same_as_approval'));
      } else if (val.error === 'staff_pin_duplicate') {
        setPinModalError(t('owner_staff.err_pin_duplicate'));
      } else {
        setPinModalError(t('owner_staff.err_pin_invalid'));
      }
      return;
    }

    const { hash, salt } = await hashPin(newPin);
    await db.users.update(pinTargetUser.id, {
      pinHash: hash,
      pinSalt: salt,
      pinLength,
    });

    await addAudit(
      currentUser?.name || 'owner',
      'staff_pin_reset',
      pinTargetUser.id,
      `PIN reset for staff ${pinTargetUser.name}`
    );

    triggerFeedback('success', t('owner_staff.toast_pin_reset'));
    setIsResetPinModalOpen(false);
    setPinTargetUser(null);
    await loadData();
  };

  const handleConfirmRemove = async () => {
    if (!userToRemove || userToRemove.role === 'owner') return;

    await db.users.update(userToRemove.id, { active: false });
    await addAudit(
      currentUser?.name || 'owner',
      'staff_updated',
      userToRemove.id,
      `Staff ${userToRemove.name} deactivated`
    );

    triggerFeedback('success', t('owner_staff.toast_status_updated'));
    setUserToRemove(null);
    if (selectedStaff && selectedStaff.id === userToRemove.id) {
      setSelectedStaff(null);
    }
    await loadData();
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
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

      {/* 2. Main Content Area */}
      <main className="w-full pt-24 pb-8 flex-1 flex flex-col max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8">
        {!selectedStaff ? (
          /* ============================================================ */
          /* 35a: STAFF LIST VIEW                                          */
          /* ============================================================ */
          <div className="flex flex-col flex-1 gap-4">
            {/* Title & Top Action */}
            <div className="flex items-center justify-between gap-4 py-2 shrink-0">
              <div className="flex flex-col">
                <h1 className="font-headline-lg text-headline-lg font-extrabold text-on-surface tracking-tight leading-none">
                  {t('owner_staff.page_title')}
                </h1>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant pt-1 font-medium">
                  {t('owner_staff.page_sub')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="h-16 px-6 rounded-2xl bg-primary hover:bg-primary-container text-on-primary shadow-md flex items-center gap-3 cursor-pointer active:translate-y-0.5 transition-all"
              >
                <Icon name="person_add" className="text-[32px] text-on-primary" />
                <div className="flex flex-col text-left">
                  <span className="font-title-hinglish text-title-hinglish text-on-primary font-bold leading-tight">
                    {btnAddStaff.main}
                  </span>
                  {btnAddStaff.sub ? (
                    <span className="font-label-sub-english text-label-sub-english text-on-primary-container leading-none">
                      {btnAddStaff.sub}
                    </span>
                  ) : null}
                </div>
              </button>
            </div>

            {/* Staff Rows List */}
            <div className="flex flex-col gap-3 flex-1 py-2">
              {users.map((u) => {
                const isOwnerUser = u.role === 'owner';
                const stats = statsMap[u.id] || { bills: 0, discounts: 0, voids: 0, pinRequests: 0 };
                const initials = getInitials(u.name);

                return (
                  <div
                    key={u.id}
                    className="min-h-[108px] bg-surface-container-lowest rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:shadow-md border border-outline-variant/30"
                  >
                    {/* Left: Clickable Info (Avatar + Details) */}
                    <div
                      className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                      onClick={() => !isOwnerUser && setSelectedStaff(u)}
                    >
                      <div className="w-16 h-16 rounded-full bg-primary-container/20 text-primary flex items-center justify-center font-headline-md text-headline-md font-extrabold shrink-0">
                        {initials}
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                            {u.name}
                          </span>
                          <span className="px-3 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sub-english text-sm font-semibold">
                            {isOwnerUser ? t('owner_staff.badge_owner') : t('owner_staff.badge_counter_staff')}
                          </span>
                          <span
                            className={`px-3 py-0.5 rounded-full font-label-sub-english text-xs font-bold ${
                              u.active
                                ? 'bg-primary-fixed text-on-primary-fixed'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {u.active ? t('owner_staff.badge_active') : t('owner_staff.badge_paused')}
                          </span>
                        </div>

                        <div className="font-body-md text-body-md text-on-surface-variant truncate">
                          {t('owner_staff.activity_today')
                            .replace('{bills}', String(stats.bills))
                            .replace('{discount}', String(stats.discounts))
                            .replace('{voids}', String(stats.voids))
                            .replace('{pin}', String(stats.pinRequests))}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Staff only) */}
                    {!isOwnerUser && (
                      <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                        {/* PIN Badlo */}
                        <button
                          type="button"
                          onClick={() => handleOpenResetPin(u)}
                          className="h-14 min-w-[130px] px-4 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center gap-2 cursor-pointer transition-all active:translate-y-0.5"
                        >
                          <Icon name="key" className="text-[24px] text-on-surface-variant" />
                          <div className="flex flex-col text-left">
                            <span className="font-title-hinglish text-sm font-bold leading-tight">
                              {btnResetPin.main}
                            </span>
                            {btnResetPin.sub ? (
                              <span className="font-label-sub-english text-xs text-on-surface-variant leading-none">
                                {btnResetPin.sub}
                              </span>
                            ) : null}
                          </div>
                        </button>

                        {/* Roko / Chalu Karo */}
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`h-14 min-w-[110px] px-4 rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all active:translate-y-0.5 ${
                            u.active
                              ? 'bg-tertiary-fixed hover:bg-tertiary-fixed-dim text-on-tertiary-fixed'
                              : 'bg-primary-fixed hover:bg-primary-fixed-dim text-on-primary-fixed'
                          }`}
                        >
                          <Icon
                            name={u.active ? 'pause_circle' : 'play_circle'}
                            className={`text-[24px] ${u.active ? 'text-tertiary' : 'text-primary'}`}
                          />
                          <div className="flex flex-col text-left">
                            <span className="font-title-hinglish text-sm font-bold leading-tight">
                              {u.active ? btnPause.main : btnActivate.main}
                            </span>
                            {u.active && btnPause.sub ? (
                              <span className="font-label-sub-english text-xs leading-none">{btnPause.sub}</span>
                            ) : null}
                          </div>
                        </button>

                        {/* Hatao */}
                        <button
                          type="button"
                          onClick={() => setUserToRemove(u)}
                          className="h-14 min-w-[110px] px-4 rounded-2xl bg-error-container hover:bg-error-container/80 text-on-error-container flex items-center justify-center gap-2 cursor-pointer transition-all active:translate-y-0.5"
                        >
                          <Icon name="delete" className="text-[24px] text-error" />
                          <div className="flex flex-col text-left">
                            <span className="font-title-hinglish text-sm font-bold leading-tight text-error">
                              {btnRemove.main}
                            </span>
                            {btnRemove.sub ? (
                              <span className="font-label-sub-english text-xs text-error leading-none">
                                {btnRemove.sub}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Status Ribbon */}
            <div className="h-14 bg-surface-container-low px-6 rounded-2xl flex items-center justify-between shrink-0 font-label-sub-english text-label-sub-english text-on-surface-variant border border-outline-variant/20 mt-auto">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                <span className="text-on-surface font-semibold">
                  {t('owner_staff.bottom_counter_active').replace('{count}', String(activeOperatorsCount))}
                </span>
                <span>•</span>
                <span>{t('owner_staff.bottom_total_bills').replace('{count}', String(totalBillsToday))}</span>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <Icon name="verified_user" className="text-[20px] text-primary" />
                <span className="text-on-surface font-medium">{t('owner_staff.bottom_terminal_info')}</span>
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* 35b: STAFF DETAIL VIEW                                        */
          /* ============================================================ */
          <div className="flex flex-col flex-1 gap-4 justify-between">
            {/* Top Profile Card */}
            <div className="w-full bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex items-center justify-between border border-outline-variant/30">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-primary font-headline-md font-extrabold">
                  {getInitials(selectedStaff.name)}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <span className="font-headline-lg text-headline-lg font-bold text-on-surface">
                      {selectedStaff.name}
                    </span>
                    <span
                      className={`px-3 py-0.5 rounded-full font-label-sub-english text-xs font-bold ${
                        selectedStaff.active
                          ? 'bg-primary-fixed text-on-primary-fixed'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {selectedStaff.active ? t('owner_staff.badge_active') : t('owner_staff.badge_paused')}
                    </span>
                  </div>
                  <span className="font-body-md text-outline">{t('owner_staff.badge_counter_staff')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-low text-on-surface-variant font-label-sub-english">
                <span className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                <span className="font-bold">{t('owner_staff.detail_active_shift')}</span>
              </div>
            </div>

            {/* 4 Metric Cards */}
            {(() => {
              const stats = statsMap[selectedStaff.id] || { bills: 0, discounts: 0, voids: 0, pinRequests: 0 };
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                  <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm flex flex-col justify-between h-28 border border-outline-variant/30">
                    <span className="font-body-md text-outline font-medium">{t('owner_staff.detail_bills')}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="font-headline-lg font-extrabold text-on-surface">{stats.bills}</span>
                      <Icon name="receipt_long" className="text-primary text-[28px]" />
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm flex flex-col justify-between h-28 border border-outline-variant/30">
                    <span className="font-body-md text-outline font-medium">{t('owner_staff.detail_discount')}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="font-headline-lg font-extrabold text-tertiary">{stats.discounts}</span>
                      <Icon name="percent" className="text-tertiary text-[28px]" />
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm flex flex-col justify-between h-28 border border-outline-variant/30">
                    <span className="font-body-md text-outline font-medium">{t('owner_staff.detail_void')}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="font-headline-lg font-extrabold text-outline">{stats.voids}</span>
                      <Icon name="cancel" className="text-outline text-[28px]" />
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-sm flex flex-col justify-between h-28 border border-outline-variant/30">
                    <span className="font-body-md text-outline font-medium">{t('owner_staff.detail_pin_req')}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="font-headline-lg font-extrabold text-secondary">{stats.pinRequests}</span>
                      <Icon name="password" className="text-secondary text-[28px]" />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Today's Recent Actions Log */}
            <div className="w-full bg-surface-container-lowest rounded-2xl p-5 shadow-sm flex flex-col gap-2 border border-outline-variant/30 flex-1 overflow-y-auto max-h-[360px]">
              <div className="px-2 pb-2 flex items-center justify-between text-outline font-label-sub-english text-xs font-bold tracking-wider">
                <span>{t('owner_staff.detail_recent_actions')}</span>
                <span>{t('owner_staff.detail_todays_log')}</span>
              </div>

              {/* Sample / Real log entries for this user */}
              <div className="flex flex-col gap-2">
                <div className="h-16 px-4 rounded-xl bg-surface-container-low flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                      <Icon name="add_shopping_cart" className="text-[22px]" />
                    </div>
                    <span className="font-body-md text-on-surface font-medium">
                      Active operator session · {shopName}
                    </span>
                  </div>
                  <Icon name="chevron_right" className="text-outline text-[20px]" />
                </div>
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="grid grid-cols-2 gap-4 w-full pt-2">
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="h-16 rounded-2xl bg-surface-container-high hover:bg-surface-dim active:translate-y-0.5 text-on-surface flex items-center justify-center gap-3 px-6 cursor-pointer shadow-sm transition-all font-bold"
              >
                <Icon name="arrow_back" className="text-[28px] text-outline" />
                <span className="font-title-hinglish text-lg">{btnBack.main}</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenResetPin(selectedStaff)}
                className="h-16 rounded-2xl bg-primary hover:bg-primary-container active:translate-y-0.5 text-on-primary flex items-center justify-center gap-3 px-6 cursor-pointer shadow-md transition-all font-bold"
              >
                <Icon name="key" className="text-[28px] text-on-primary" />
                <span className="font-title-hinglish text-lg">{btnResetPin.main}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: Add/Edit Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[500px] max-w-full bg-surface-container-lowest rounded-3xl shadow-2xl p-6 flex flex-col gap-5 border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-headline-md font-bold text-on-surface">
                  {editingUserId ? t('owner_staff.modal_edit_title') : t('owner_staff.modal_add_title')}
                </h2>
                <span className="text-label-sub-english text-on-surface-variant">
                  {editingUserId ? t('owner_staff.modal_edit_sub') : t('owner_staff.modal_add_sub')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-outline cursor-pointer"
              >
                <Icon name="close" className="text-[24px]" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="flex flex-col gap-4">
              {formError && (
                <div className="p-3 bg-error-container text-on-error-container rounded-xl text-sm font-bold flex items-center gap-2">
                  <Icon name="error" className="text-[20px] text-error" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-on-surface">{t('owner_staff.label_name')}</label>
                <input
                  type="text"
                  placeholder={t('owner_staff.placeholder_name')}
                  className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-medium focus:outline-primary"
                  {...textFieldProps('name', staffName, setStaffName)}
                />
              </div>

              {/* PIN (for new staff only) */}
              {!editingUserId && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-on-surface">
                    {t('owner_staff.label_pin')} ({pinLength} digits)
                  </label>
                  <input
                    type="password"
                    maxLength={pinLength}
                    placeholder={`•••• (${pinLength} digits)`}
                    value={staffPin}
                    onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                    className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold tracking-widest text-xl focus:outline-primary"
                  />
                </div>
              )}

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low">
                <span className="font-bold text-on-surface">{t('owner_staff.label_active')}</span>
                <input
                  type="checkbox"
                  checked={staffActive}
                  onChange={(e) => setStaffActive(e.target.checked)}
                  className="w-6 h-6 accent-primary rounded cursor-pointer"
                />
              </div>

              {/* Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-14 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
                >
                  {btnCancel.main}
                </button>
                <button
                  type="submit"
                  className="h-14 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold cursor-pointer shadow-md"
                >
                  {btnSave.main}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Reset PIN Modal with Keypad & Physical Keyboard */}
      {isResetPinModalOpen && pinTargetUser && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-[420px] max-w-full bg-surface-container-lowest rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-4 border border-outline-variant/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col">
                <h2 className="text-headline-md font-bold text-on-surface">
                  {t('owner_staff.modal_reset_pin_title')}
                </h2>
                <span className="text-label-sub-english text-on-surface-variant">
                  {t('owner_staff.modal_reset_pin_sub').replace('{digits}', String(pinLength))} · {pinTargetUser.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsResetPinModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-outline cursor-pointer"
              >
                <Icon name="close" className="text-[24px]" />
              </button>
            </div>

            {/* PIN Dots */}
            <div className="flex items-center gap-4 my-2">
              {Array.from({ length: pinLength }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    idx < newPin.length
                      ? 'bg-primary border-primary scale-110'
                      : 'border-outline-variant bg-surface-container'
                  }`}
                />
              ))}
            </div>

            {pinModalError && (
              <span className="text-error font-bold text-sm text-center">{pinModalError}</span>
            )}

            {/* On-screen Keypad */}
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[300px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') {
                      setNewPin('');
                      setPinModalError('');
                    } else if (k === '⌫') {
                      setNewPin((p) => p.slice(0, -1));
                      setPinModalError('');
                    } else if (newPin.length < pinLength) {
                      setNewPin((p) => p + k);
                      setPinModalError('');
                    }
                  }}
                  className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer active:scale-95 transition-all shadow-sm"
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setIsResetPinModalOpen(false)}
                className="h-14 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
              >
                {btnCancel.main}
              </button>
              <button
                type="button"
                onClick={handleSaveNewPin}
                disabled={newPin.length !== pinLength}
                className="h-14 rounded-xl bg-primary hover:bg-primary-container disabled:opacity-50 text-on-primary font-bold cursor-pointer shadow-md"
              >
                {btnSave.main}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG: Remove Staff */}
      <ConfirmDialog
        isOpen={Boolean(userToRemove)}
        title={t('owner_staff.confirm_remove_title')}
        subtitle={t('owner_staff.confirm_remove_sub')}
        confirmLabel={btnRemove.main}
        cancelLabel={btnCancel.main}
        onConfirm={handleConfirmRemove}
        onCancel={() => setUserToRemove(null)}
      />
    </div>
  );
};

export default OwnerStaff;

