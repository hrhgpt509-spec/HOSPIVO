import React, { useState, useEffect, useCallback } from 'react';
import { db, type DBUser, type Shop } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { MobileTopBar } from '../components/MobileTopBar';
import { useShop } from '../logic/useShop';
import { isOwner } from '../logic/roles';
import { textFieldProps } from '../logic/format';
import { getPinLengthSetting, hashPin, verifyPin } from '../logic/pin';
import {
  DEFAULT_APPROVAL_RULES,
  type ApprovalActionCategory,
  type ApprovalRuleType,
  setApprovalPin,
  verifyApprovalPin,
} from '../logic/approvals';
import { getDiscountLimit, DEFAULT_DISCOUNT_LIMIT_PERCENT } from '../logic/billing';
import { addAudit } from '../db/audit';
import { triggerFeedback } from '../logic/feedback';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { useBackHandler } from '../logic/androidBack';
import { OwnerCloudSync } from './OwnerCloudSync';
import { getCloudConfig, getHomeSyncState, enqueueSyncItem, type CloudConfig, type HomeSyncState } from '../logic/cloudSync';

interface OwnerSettingsProps {
  currentUser?: DBUser | null;
  onBack: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

type SettingsView = 'main' | 'approval_rules' | 'cloud_sync';

export const OwnerSettings: React.FC<OwnerSettingsProps> = ({
  currentUser,
  onBack,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t, language, setLanguage } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [currentView, setCurrentView] = useState<SettingsView>('main');

  // Settings State
  const [shopDetails, setShopDetails] = useState<Partial<Shop>>({});
  const [discountLimit, setDiscountLimit] = useState<number>(DEFAULT_DISCOUNT_LIMIT_PERCENT);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(5);
  const [fullscreenOnLogin, setFullscreenOnLogin] = useState<boolean>(true);
  const [pinLength, setPinLength] = useState<number>(4);
  const [approvalRules, setApprovalRules] = useState<Record<ApprovalActionCategory, ApprovalRuleType>>(
    DEFAULT_APPROVAL_RULES
  );
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<HomeSyncState | null>(null);

  // Modals
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isAutoLockModalOpen, setIsAutoLockModalOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [isPinLengthModalOpen, setIsPinLengthModalOpen] = useState(false);
  const [isChangeOwnerPinModalOpen, setIsChangeOwnerPinModalOpen] = useState(false);
  const [isChangeApprovalPinModalOpen, setIsChangeApprovalPinModalOpen] = useState(false);

  // Shop Edit Form State
  const [editShopName, setEditShopName] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGstNo, setEditGstNo] = useState('');
  const [editDrugLicence, setEditDrugLicence] = useState('');

  // PIN Change Form States
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState<1 | 2 | 3>(1); // 1: current, 2: new, 3: confirm
  const [pinError, setPinError] = useState('');

  // PIN Length Change State
  const [targetPinLength, setTargetPinLength] = useState<number>(6);
  const [plOwnerPin, setPlOwnerPin] = useState('');
  const [plApprovalPin, setPlApprovalPin] = useState('');
  const [plStep, setPlStep] = useState<1 | 2 | 3>(1); // 1: verify current owner, 2: new owner pin, 3: new approval pin
  const [plError, setPlError] = useState('');

  // Translations
  const btnBack = tButton('owner_staff.btn_back');
  const btnSave = tButton('owner_staff.btn_save');
  const btnCancel = tButton('owner_staff.btn_cancel');
  const btnSaveRules = tButton('owner_settings.btn_save_rules');

  const loadSettings = useCallback(async () => {
    try {
      const currentShop = await db.shop.toCollection().first();
      if (currentShop) {
        setShopDetails(currentShop);
        setEditShopName(currentShop.name || '');
        setEditOwnerName(currentShop.ownerName || '');
        setEditAddress(currentShop.address || '');
        setEditPhone(currentShop.phone || '');
        setEditGstNo(currentShop.gstNo || '');
        setEditDrugLicence(currentShop.drugLicenceNos || '');
      }

      const disc = await getDiscountLimit();
      setDiscountLimit(disc);

      const autoLockItem = await db.settings.get('auto_lock_minutes');
      if (autoLockItem && typeof autoLockItem.value === 'number') {
        setAutoLockMinutes(autoLockItem.value);
      }

      const fsItem = await db.settings.get('fullscreenOnLogin');
      if (fsItem && typeof fsItem.value === 'boolean') {
        setFullscreenOnLogin(fsItem.value);
      }

      const pLen = await getPinLengthSetting();
      setPinLength(pLen);
      setTargetPinLength(pLen === 4 ? 6 : 4);

      const rulesItem = await db.settings.get('approval_rules');
      if (rulesItem && typeof rulesItem.value === 'object') {
        setApprovalRules({
          ...DEFAULT_APPROVAL_RULES,
          ...(rulesItem.value as Record<ApprovalActionCategory, ApprovalRuleType>),
        });
      }

      const [cfg, homeSync] = await Promise.all([getCloudConfig(), getHomeSyncState()]);
      setCloudConfig(cfg);
      setCloudSyncState(homeSync);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useBackHandler(currentView === 'approval_rules', () => setCurrentView('main'));
  useBackHandler(isShopModalOpen, () => setIsShopModalOpen(false));
  useBackHandler(isDiscountModalOpen, () => setIsDiscountModalOpen(false));
  useBackHandler(isAutoLockModalOpen, () => setIsAutoLockModalOpen(false));
  useBackHandler(isLanguageModalOpen, () => setIsLanguageModalOpen(false));
  useBackHandler(isPinLengthModalOpen, () => setIsPinLengthModalOpen(false));
  useBackHandler(isChangeOwnerPinModalOpen, () => setIsChangeOwnerPinModalOpen(false));
  useBackHandler(isChangeApprovalPinModalOpen, () => setIsChangeApprovalPinModalOpen(false));

  // Hook for physical keyboard entry in Owner PIN modal
  usePinKeyboard({
    onDigit: (digit) => {
      if (pinStep === 1 && pinCurrent.length < pinLength) {
        setPinCurrent((p) => p + digit);
        setPinError('');
      } else if (pinStep === 2 && pinNew.length < pinLength) {
        setPinNew((p) => p + digit);
        setPinError('');
      } else if (pinStep === 3 && pinConfirm.length < pinLength) {
        setPinConfirm((p) => p + digit);
        setPinError('');
      }
    },
    onBackspace: () => {
      if (pinStep === 1) setPinCurrent((p) => p.slice(0, -1));
      else if (pinStep === 2) setPinNew((p) => p.slice(0, -1));
      else if (pinStep === 3) setPinConfirm((p) => p.slice(0, -1));
      setPinError('');
    },
    onClear: () => {
      if (pinStep === 1) setPinCurrent('');
      else if (pinStep === 2) setPinNew('');
      else if (pinStep === 3) setPinConfirm('');
      setPinError('');
    },
    onEnter: () => {
      if (isChangeOwnerPinModalOpen) handleProceedChangeOwnerPin();
      else if (isChangeApprovalPinModalOpen) handleProceedChangeApprovalPin();
    },
    disabled: !isChangeOwnerPinModalOpen && !isChangeApprovalPinModalOpen,
  });

  if (!isOwner(currentUser)) {
    return (
      <div className="w-full min-h-dvh bg-surface flex flex-col items-center justify-center p-6 text-on-surface">
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

  if (currentView === 'cloud_sync') {
    return (
      <OwnerCloudSync
        currentUser={currentUser as any}
        onBack={() => {
          loadSettings();
          setCurrentView('main');
        }}
      />
    );
  }

  // --- Actions ---

  const handleSaveShopDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDetails.id) return;

    const updatedShopFields = {
      name: editShopName.trim(),
      ownerName: editOwnerName.trim(),
      address: editAddress.trim(),
      phone: editPhone.trim(),
      gstNo: editGstNo.trim(),
      drugLicenceNos: editDrugLicence.trim(),
    };
    await db.shop.update(shopDetails.id, updatedShopFields);
    enqueueSyncItem('shop', shopDetails.id, { id: shopDetails.id, ...updatedShopFields }).catch(() => {});

    await addAudit(currentUser?.name || 'owner', 'shop_details_updated', 'shop', 'Shop details updated in Settings');
    triggerFeedback('success', t('owner_settings.toast_settings_saved'));
    setIsShopModalOpen(false);
    await loadSettings();
  };

  const handleSaveDiscountLimit = async (limit: number) => {
    await db.settings.put({ key: 'discount_limit', value: limit });
    enqueueSyncItem('settings', 'discount_limit', { key: 'discount_limit', value: limit }).catch(() => {});
    setDiscountLimit(limit);
    await addAudit(
      currentUser?.name || 'owner',
      'discount_limit_updated',
      'settings',
      `Max discount limit set to ${limit}%`
    );
    triggerFeedback('success', t('owner_settings.toast_settings_saved'));
    setIsDiscountModalOpen(false);
  };

  const handleSaveAutoLock = async (minutes: number) => {
    await db.settings.put({ key: 'auto_lock_minutes', value: minutes });
    enqueueSyncItem('settings', 'auto_lock_minutes', { key: 'auto_lock_minutes', value: minutes }).catch(() => {});
    setAutoLockMinutes(minutes);
    await addAudit(
      currentUser?.name || 'owner',
      'auto_lock_updated',
      'settings',
      `Auto-lock timeout set to ${minutes} min`
    );
    triggerFeedback('success', t('owner_settings.toast_settings_saved'));
    setIsAutoLockModalOpen(false);
  };

  const handleToggleFullscreenOnLogin = async () => {
    const nextVal = !fullscreenOnLogin;
    await db.settings.put({ key: 'fullscreenOnLogin', value: nextVal });
    enqueueSyncItem('settings', 'fullscreenOnLogin', { key: 'fullscreenOnLogin', value: nextVal }).catch(() => {});
    setFullscreenOnLogin(nextVal);
    await addAudit(
      currentUser?.name || 'owner',
      'fullscreen_on_login_updated',
      'settings',
      `Fullscreen on login set to ${nextVal}`
    );
    triggerFeedback('success', t('owner_settings.toast_settings_saved'));
  };

  const handleSelectLanguage = async (lang: 'en' | 'hi' | 'hinglish') => {
    setLanguage(lang);
    await db.settings.put({ key: 'language', value: lang });
    enqueueSyncItem('settings', 'language', { key: 'language', value: lang }).catch(() => {});
    await addAudit(currentUser?.name || 'owner', 'language_updated', 'settings', `Language set to ${lang}`);
    setIsLanguageModalOpen(false);
  };

  // Change Owner PIN flow
  const handleOpenChangeOwnerPin = () => {
    setPinCurrent('');
    setPinNew('');
    setPinConfirm('');
    setPinStep(1);
    setPinError('');
    setIsChangeOwnerPinModalOpen(true);
  };

  const handleProceedChangeOwnerPin = async () => {
    setPinError('');
    const ownerUser = await db.users.where('role').equals('owner').first();
    if (!ownerUser) return;

    if (pinStep === 1) {
      if (pinCurrent.length !== pinLength) {
        setPinError(t('owner_staff.err_pin_invalid'));
        return;
      }
      const isMatch = await verifyPin(pinCurrent, ownerUser);
      if (!isMatch) {
        setPinError(t('owner_settings.err_current_pin_wrong'));
        return;
      }
      setPinStep(2);
    } else if (pinStep === 2) {
      if (pinNew.length !== pinLength) {
        setPinError(t('owner_staff.err_pin_invalid'));
        return;
      }
      if (pinNew === pinCurrent) {
        setPinError(t('owner_settings.err_pin_same'));
        return;
      }
      setPinStep(3);
    } else if (pinStep === 3) {
      if (pinConfirm !== pinNew) {
        setPinError(t('owner_settings.err_pins_mismatch'));
        return;
      }

      const { hash, salt } = await hashPin(pinNew);
      await db.users.update(ownerUser.id, {
        pinHash: hash,
        pinSalt: salt,
      });
      enqueueSyncItem('staff', ownerUser.id, {
        ...ownerUser,
        pinHash: hash,
        pinSalt: salt,
      }).catch(() => {});

      await addAudit(currentUser?.name || 'owner', 'owner_pin_changed', 'auth', 'Owner login PIN changed successfully');
      triggerFeedback('success', t('owner_settings.toast_pin_changed'));
      setIsChangeOwnerPinModalOpen(false);
    }
  };

  // Change Approval (Ijazat) PIN flow
  const handleOpenChangeApprovalPin = () => {
    setPinCurrent('');
    setPinNew('');
    setPinConfirm('');
    setPinStep(1);
    setPinError('');
    setIsChangeApprovalPinModalOpen(true);
  };

  const handleProceedChangeApprovalPin = async () => {
    setPinError('');
    if (pinStep === 1) {
      if (pinCurrent.length !== pinLength) {
        setPinError(t('owner_staff.err_pin_invalid'));
        return;
      }
      const res = await verifyApprovalPin(pinCurrent);
      if (!res.ok) {
        setPinError(t('owner_settings.err_current_pin_wrong'));
        return;
      }
      setPinStep(2);
    } else if (pinStep === 2) {
      if (pinNew.length !== pinLength) {
        setPinError(t('owner_staff.err_pin_invalid'));
        return;
      }
      if (pinNew === pinCurrent) {
        setPinError(t('owner_settings.err_pin_same'));
        return;
      }
      setPinStep(3);
    } else if (pinStep === 3) {
      if (pinConfirm !== pinNew) {
        setPinError(t('owner_settings.err_pins_mismatch'));
        return;
      }

      const setRes = await setApprovalPin(pinNew);
      if (!setRes.ok) {
        setPinError(t('owner_staff.err_pin_invalid'));
        return;
      }

      const ownerForSync = await db.users.where('role').equals('owner').first();
      const updatedApprovalPin = (await db.settings.get('approval_pin'))?.value as
        | { hash: string; salt: string }
        | undefined;
      if (ownerForSync && updatedApprovalPin) {
        enqueueSyncItem('staff', ownerForSync.id, {
          ...ownerForSync,
          approvalPin: updatedApprovalPin,
        }).catch(() => {});
      }

      await addAudit(
        currentUser?.name || 'owner',
        'approval_pin_changed',
        'approval',
        'Approval PIN changed successfully'
      );
      triggerFeedback('success', t('owner_settings.toast_pin_changed'));
      setIsChangeApprovalPinModalOpen(false);
    }
  };

  // PIN Length Change flow
  const handleOpenPinLengthModal = () => {
    setTargetPinLength(pinLength === 4 ? 6 : 4);
    setPinCurrent('');
    setPlOwnerPin('');
    setPlApprovalPin('');
    setPlStep(1);
    setPlError('');
    setIsPinLengthModalOpen(true);
  };

  const handleProceedPinLength = async () => {
    setPlError('');
    const ownerUser = await db.users.where('role').equals('owner').first();
    if (!ownerUser) return;

    if (plStep === 1) {
      if (pinCurrent.length !== pinLength) {
        setPlError(t('owner_staff.err_pin_invalid'));
        return;
      }
      const isMatch = await verifyPin(pinCurrent, ownerUser);
      if (!isMatch) {
        setPlError(t('owner_settings.err_current_pin_wrong'));
        return;
      }
      setPlStep(2);
    } else if (plStep === 2) {
      if (plOwnerPin.length !== targetPinLength) {
        setPlError(t('owner_staff.err_pin_invalid'));
        return;
      }
      setPlStep(3);
    } else if (plStep === 3) {
      if (plApprovalPin.length !== targetPinLength) {
        setPlError(t('owner_staff.err_pin_invalid'));
        return;
      }
      if (plApprovalPin === plOwnerPin) {
        setPlError(t('owner_staff.err_pin_same_as_owner'));
        return;
      }

      // 1. Update PIN length setting
      await db.settings.put({ key: 'pinLength', value: targetPinLength });
      enqueueSyncItem('settings', 'pinLength', { key: 'pinLength', value: targetPinLength }).catch(() => {});

      // 2. Set new Owner PIN
      const { hash: oHash, salt: oSalt } = await hashPin(plOwnerPin);
      await db.users.update(ownerUser.id, {
        pinHash: oHash,
        pinSalt: oSalt,
        pinLength: targetPinLength,
      });

      // 3. Set new Approval PIN
      await setApprovalPin(plApprovalPin);
      const updatedApprovalPin = (await db.settings.get('approval_pin'))?.value as
        | { hash: string; salt: string }
        | undefined;
      enqueueSyncItem('staff', ownerUser.id, {
        ...ownerUser,
        pinHash: oHash,
        pinSalt: oSalt,
        pinLength: targetPinLength,
        ...(updatedApprovalPin ? { approvalPin: updatedApprovalPin } : {}),
      }).catch(() => {});

      // 4. Mark all other staff users active = false so old PINs cannot be used
      const staffUsers = await db.users.where('role').notEqual('owner').toArray();
      for (const su of staffUsers) {
        await db.users.update(su.id, { active: false });
        enqueueSyncItem('staff', su.id, { ...su, active: false }).catch(() => {});
      }

      await addAudit(
        currentUser?.name || 'owner',
        'pin_length_changed',
        'settings',
        `PIN length changed to ${targetPinLength} digits. All staff accounts paused pending PIN reset.`
      );

      triggerFeedback('success', t('owner_settings.toast_settings_saved'));
      setIsPinLengthModalOpen(false);
      await loadSettings();
    }
  };

  // Save Approval Rules Matrix
  const handleSaveApprovalRules = async () => {
    await db.settings.put({ key: 'approval_rules', value: approvalRules });
    enqueueSyncItem('settings', 'approval_rules', { key: 'approval_rules', value: approvalRules }).catch(() => {});
    await addAudit(
      currentUser?.name || 'owner',
      'approval_rules_updated',
      'settings',
      'Approval rules updated in Settings'
    );
    triggerFeedback('success', t('owner_settings.toast_settings_saved'));
    setCurrentView('main');
  };

  const getLanguageLabel = (lang: string) => {
    if (lang === 'hi') return 'हिन्दी';
    if (lang === 'hinglish') return 'Hindi (English letters)';
    return 'English';
  };

  return (
    <div className="w-full min-h-dvh bg-surface font-body-md text-on-surface antialiased select-none overflow-x-clip flex flex-col justify-between">
      {/* Compact Mobile Header */}
      <MobileTopBar
        title={t('owner_settings.page_title')}
        subtitle={shopName || undefined}
        onBack={currentView === 'approval_rules' ? () => setCurrentView('main') : onBack}
        backIcon="arrow_back"
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* 1. Desktop Top Fixed Header */}
      <header className="hidden lg:block fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-sm">
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
              onClick={currentView === 'approval_rules' ? () => setCurrentView('main') : onBack}
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
      <main className="w-full pt-3 lg:pt-24 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex-1 flex flex-col max-w-[960px] mx-auto px-3 sm:px-6 md:px-8">
        {currentView === 'main' ? (
          /* ============================================================ */
          /* 40: OWNER SETTINGS CENTRAL SCREEN                             */
          /* ============================================================ */
          <div className="flex flex-col gap-4 my-auto">
            <div className="flex flex-col mb-2">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-extrabold">
                {t('owner_settings.page_title')}
              </h1>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                {t('owner_settings.page_sub')}
              </span>
            </div>

            <div className="w-full min-w-0 bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col">
              {/* Row 1: Dukaan ki jaankari */}
              <div
                onClick={() => setIsShopModalOpen(true)}
                className="min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="storefront" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words">
                      {t('owner_settings.row_shop_details')}
                    </span>
                    <span className="font-label-sub-english text-xs text-on-surface-variant leading-snug break-words">
                      {t('owner_settings.row_shop_sub')}
                    </span>
                    {(shopDetails.name || shopDetails.ownerName) && (
                      <span className="sm:hidden text-xs font-semibold text-primary truncate mt-0.5">
                        {[shopDetails.name, shopDetails.ownerName].filter(Boolean).join(' • ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="hidden sm:inline font-body-md text-sm text-on-surface-variant font-medium truncate max-w-[240px]">
                    {[shopDetails.name, shopDetails.ownerName].filter(Boolean).join(' • ')}
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 2: Discount limit */}
              <div
                onClick={() => setIsDiscountModalOpen(true)}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="percent" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_discount_limit')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-xs sm:text-sm font-bold text-on-surface bg-surface-container px-2.5 sm:px-3 py-1 rounded-lg whitespace-nowrap">
                    {discountLimit}%
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 3: Auto-lock */}
              <div
                onClick={() => setIsAutoLockModalOpen(true)}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="timer" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_auto_lock')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-xs sm:text-sm text-on-surface-variant bg-surface-container px-2.5 sm:px-3 py-1 rounded-lg font-medium whitespace-nowrap">
                    {autoLockMinutes} min
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 4: Light / Dark Toggle */}
              <div
                onClick={onToggleTheme}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="contrast" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_theme')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-xs sm:text-sm text-on-surface-variant bg-surface-container px-2.5 sm:px-3 py-1 rounded-lg capitalize font-medium whitespace-nowrap">
                    {theme}
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 5: Language selector */}
              <div
                onClick={() => setIsLanguageModalOpen(true)}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="translate" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_bhasha')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 max-w-[48%] sm:max-w-none">
                  <span className="text-xs sm:text-sm text-on-surface-variant bg-surface-container px-2.5 sm:px-3 py-1 rounded-lg font-medium truncate max-w-full">
                    {getLanguageLabel(language)}
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 6: Fullscreen on login */}
              <div
                onClick={handleToggleFullscreenOnLogin}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="fullscreen" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_fullscreen')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span
                    className={`text-xs sm:text-sm font-bold px-2.5 sm:px-3 py-1 rounded-lg whitespace-nowrap ${
                      fullscreenOnLogin
                        ? 'bg-primary-fixed text-on-primary-fixed'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {fullscreenOnLogin ? 'ON' : 'OFF'}
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 7: PIN length */}
              <div
                onClick={handleOpenPinLengthModal}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="pin" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_pin_length')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-xs sm:text-sm text-on-surface-variant bg-surface-container px-2.5 sm:px-3 py-1 rounded-lg font-bold whitespace-nowrap">
                    {pinLength} Digits
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 8: Change Owner Login PIN */}
              <div
                onClick={handleOpenChangeOwnerPin}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="lock_reset" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_change_owner_pin')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-xs sm:text-sm text-on-surface-variant font-bold tracking-widest">••••</span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 9: Change Approval (Ijazat) PIN */}
              <div
                onClick={handleOpenChangeApprovalPin}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="security" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words min-w-0">
                    {t('owner_settings.row_change_approval_pin')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <span className="text-xs sm:text-sm text-on-surface-variant font-bold tracking-widest">••••</span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 10: Special kaam ki ijazat (Approval Rules Matrix) */}
              <div
                onClick={() => setCurrentView('approval_rules')}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="verified_user" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words">
                      {t('owner_settings.row_approval_rules')}
                    </span>
                    <span className="font-label-sub-english text-xs text-outline leading-snug break-words">
                      {t('owner_settings.row_approval_rules_sub')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 max-w-[38%] sm:max-w-none">
                  <span className="text-xs sm:text-sm text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-lg font-medium truncate max-w-full">
                    {t('owner_settings.rule_option_local')}
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>

              <div className="h-[1px] w-full bg-surface-container-high" />

              {/* Row 11: Cloud Sync aur Pairing */}
              <div
                onClick={() => setCurrentView('cloud_sync')}
                className="min-h-[68px] sm:min-h-[72px] px-3.5 sm:px-6 py-3 flex items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-surface-container-low transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                    <Icon name="cloud_sync" className="text-[24px] sm:text-[28px]" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-title-hinglish text-sm sm:text-base font-bold text-on-surface leading-snug break-words">
                      {t('cloud_sync.title')}
                    </span>
                    <span className="font-label-sub-english text-xs text-outline leading-snug break-words">
                      {t('cloud_sync.sub')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 max-w-[42%] sm:max-w-none">
                  <span className={`text-xs sm:text-sm px-2.5 py-1 rounded-lg truncate max-w-full ${
                    cloudConfig?.cloudEnabled && !cloudSyncState?.isConnected
                      ? 'bg-[#FEF6EE] dark:bg-amber-950/40 text-[#B54708] dark:text-amber-300 font-bold'
                      : 'bg-surface-container text-on-surface-variant font-medium'
                  }`}>
                    {!cloudConfig?.cloudEnabled
                      ? t('cloud_sync.local_mode_title')
                      : cloudSyncState?.isConnected
                        ? t('cloud_sync.cloud_mode_title')
                        : t('cloud_sync.status_sign_in_required')}
                  </span>
                  <Icon name="chevron_right" className="text-outline text-[20px] sm:text-[24px] shrink-0" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* 40b: APPROVAL RULES MATRIX (5 PROTECTED ACTIONS)              */
          /* ============================================================ */
          <div className="flex flex-col gap-4 w-full">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h1 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
                  {t('owner_settings.approval_rules_title')}
                </h1>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                  {t('owner_settings.approval_rules_sub')}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-surface-container px-4 py-2 rounded-xl shadow-sm">
                <Icon name="verified_user" className="text-primary text-[24px]" />
                <span className="font-label-sub-english text-on-surface font-semibold">Store Security Active</span>
              </div>
            </div>

            {/* Central Rules Card */}
            <div className="w-full bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col overflow-hidden">
              {[
                {
                  key: 'delete_or_correct_bill' as ApprovalActionCategory,
                  title: t('setup.step8_rule_delete_bill'),
                  icon: 'receipt_long',
                },
                {
                  key: 'price_change' as ApprovalActionCategory,
                  title: t('setup.step8_rule_price_change'),
                  icon: 'price_change',
                },
                {
                  key: 'discount_above_limit' as ApprovalActionCategory,
                  title: t('setup.step8_rule_discount_limit'),
                  icon: 'percent',
                },
                {
                  key: 'stock_correction' as ApprovalActionCategory,
                  title: t('setup.step8_rule_stock_correction'),
                  icon: 'inventory_2',
                },
                {
                  key: 'cash_mismatch' as ApprovalActionCategory,
                  title: t('setup.step8_rule_cash_mismatch'),
                  icon: 'point_of_sale',
                },
              ].map((item, idx) => {
                const currentRule = approvalRules[item.key];
                return (
                  <React.Fragment key={item.key}>
                    <div className="min-h-[74px] px-3.5 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-container-lowest min-w-0">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0 shadow-sm">
                          <Icon name={item.icon} className="text-[24px] sm:text-[26px]" />
                        </div>
                        <span className="font-title-hinglish font-bold text-on-surface break-words min-w-0">{item.title}</span>
                      </div>

                      <div className="flex items-center bg-surface-container-low p-1.5 rounded-xl gap-1.5 sm:gap-2 self-stretch md:self-center shadow-inner flex-wrap">
                        {/* Option 1: Owner PIN (Local) */}
                        <button
                          type="button"
                          onClick={() => setApprovalRules((r) => ({ ...r, [item.key]: 'local_pin' }))}
                          className={`min-h-[44px] py-2 px-3 sm:px-4 rounded-xl flex items-center gap-1.5 sm:gap-2 font-label-sub-english text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                            currentRule === 'local_pin'
                              ? 'bg-primary text-on-primary shadow-sm'
                              : 'text-on-surface-variant hover:bg-surface-container'
                          }`}
                        >
                          {currentRule === 'local_pin' && (
                            <Icon name="check_circle" className="text-[18px] text-on-primary shrink-0" />
                          )}
                          <span>{t('owner_settings.rule_option_local')}</span>
                        </button>

                        {/* Option 2: Remote approval */}
                        <button
                          type="button"
                          disabled={!cloudConfig?.cloudEnabled}
                          onClick={() => {
                            if (cloudConfig?.cloudEnabled) {
                              setApprovalRules((r) => ({ ...r, [item.key]: 'remote_approval' }));
                            }
                          }}
                          className={`min-h-[44px] py-2 px-3 sm:px-4 rounded-xl flex items-center gap-1.5 sm:gap-2 font-label-sub-english text-xs sm:text-sm font-bold transition-all ${
                            !cloudConfig?.cloudEnabled
                              ? 'text-outline-variant opacity-50 cursor-not-allowed'
                              : currentRule === 'remote_approval'
                              ? 'bg-primary text-on-primary shadow-sm cursor-pointer'
                              : 'text-on-surface-variant hover:bg-surface-container cursor-pointer'
                          }`}
                          title={!cloudConfig?.cloudEnabled ? 'Cloud mode only' : undefined}
                        >
                          {currentRule === 'remote_approval' && (
                            <Icon name="check_circle" className="text-[18px] text-on-primary shrink-0" />
                          )}
                          <span>{t('owner_settings.rule_option_remote')}</span>
                          {!cloudConfig?.cloudEnabled && (
                            <span className="text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded">Cloud</span>
                          )}
                        </button>

                        {/* Option 3: Blocked offline */}
                        <button
                          type="button"
                          onClick={() => setApprovalRules((r) => ({ ...r, [item.key]: 'blocked_offline' }))}
                          className={`min-h-[44px] py-2 px-3 sm:px-4 rounded-xl flex items-center gap-1.5 sm:gap-2 font-label-sub-english text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                            currentRule === 'blocked_offline'
                              ? 'bg-tertiary-container text-on-tertiary-container shadow-sm'
                              : 'text-on-surface-variant hover:bg-surface-container'
                          }`}
                        >
                          {currentRule === 'blocked_offline' && (
                            <Icon name="block" className="text-[18px] text-on-tertiary-container shrink-0" />
                          )}
                          <span>{t('owner_settings.rule_option_blocked')}</span>
                        </button>
                      </div>
                    </div>
                    {idx < 4 && <div className="h-[1px] w-full bg-surface-container-high" />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Bottom Buttons */}
            <div className="w-full flex items-stretch justify-between gap-2.5 sm:gap-4 py-2">
              <button
                type="button"
                onClick={() => setCurrentView('main')}
                className="min-h-[56px] py-2 sm:min-w-[160px] max-sm:min-w-0 max-sm:flex-1 px-4 sm:px-6 rounded-2xl bg-surface-container-lowest hover:bg-surface-container transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer font-bold border border-outline-variant/30"
              >
                <Icon name="arrow_back" className="text-[22px] sm:text-[24px] text-outline shrink-0" />
                <span className="truncate">{btnBack.main}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveApprovalRules}
                className="min-h-[56px] py-2 sm:min-w-[200px] max-sm:min-w-0 max-sm:flex-1 px-5 sm:px-8 rounded-2xl bg-primary hover:bg-primary-container text-on-primary transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer font-bold"
              >
                <Icon name="check" className="text-[24px] sm:text-[26px] shrink-0" />
                <span className="truncate">{btnSaveRules.main}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: Shop Details Editor */}
      {isShopModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[560px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-headline-md font-bold text-on-surface">
                  {t('owner_settings.modal_shop_title')}
                </h2>
                <span className="text-label-sub-english text-on-surface-variant">
                  {t('owner_settings.modal_shop_sub')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsShopModalOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-outline cursor-pointer"
              >
                <Icon name="close" className="text-[24px]" />
              </button>
            </div>

            <form onSubmit={handleSaveShopDetails} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-on-surface">{t('owner_settings.label_shop_name')}</label>
                <input
                  type="text"
                  required
                  className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-medium focus:outline-primary"
                  {...textFieldProps('name', editShopName, setEditShopName)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-on-surface">{t('owner_settings.label_owner_name')}</label>
                <input
                  type="text"
                  required
                  className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-medium focus:outline-primary"
                  {...textFieldProps('name', editOwnerName, setEditOwnerName)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-on-surface">{t('owner_settings.label_phone')}</label>
                <input
                  type="text"
                  className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-medium focus:outline-primary"
                  {...textFieldProps('phone', editPhone, setEditPhone)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-on-surface">{t('owner_settings.label_address')}</label>
                <input
                  type="text"
                  className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-medium focus:outline-primary"
                  {...textFieldProps('free', editAddress, setEditAddress)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-bold text-on-surface">{t('owner_settings.label_gst_no')}</label>
                  <input
                    type="text"
                    className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold uppercase focus:outline-primary"
                    {...textFieldProps('code', editGstNo, setEditGstNo)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-bold text-on-surface">{t('owner_settings.label_drug_licence')}</label>
                  <input
                    type="text"
                    className="h-13 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold uppercase focus:outline-primary"
                    {...textFieldProps('code', editDrugLicence, setEditDrugLicence)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsShopModalOpen(false)}
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

      {/* MODAL: Discount Limit */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[420px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <h2 className="text-headline-md font-bold text-on-surface">
              {t('owner_settings.modal_discount_title')}
            </h2>
            <span className="text-label-sub-english text-on-surface-variant">
              {t('owner_settings.modal_discount_sub')}
            </span>

            <div className="grid grid-cols-3 gap-3 my-2">
              {[0, 5, 10, 15, 20, 25].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSaveDiscountLimit(pct)}
                  className={`h-14 rounded-2xl font-bold text-lg cursor-pointer transition-all ${
                    discountLimit === pct
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsDiscountModalOpen(false)}
              className="h-13 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer mt-2"
            >
              {btnCancel.main}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Auto-lock Timeout */}
      {isAutoLockModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[420px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <h2 className="text-headline-md font-bold text-on-surface">
              {t('owner_settings.modal_autolock_title')}
            </h2>
            <span className="text-label-sub-english text-on-surface-variant">
              {t('owner_settings.modal_autolock_sub')}
            </span>

            <div className="grid grid-cols-2 gap-3 my-2">
              {[1, 2, 5, 10, 15, 30].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleSaveAutoLock(mins)}
                  className={`h-14 rounded-2xl font-bold text-base cursor-pointer transition-all ${
                    autoLockMinutes === mins
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsAutoLockModalOpen(false)}
              className="h-13 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer mt-2"
            >
              {btnCancel.main}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Language Picker */}
      {isLanguageModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[420px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <h2 className="text-headline-md font-bold text-on-surface">{t('owner_settings.row_bhasha')}</h2>

            <div className="flex flex-col gap-3 my-2">
              {[
                { code: 'en' as const, label: 'English', sub: 'Default' },
                { code: 'hi' as const, label: 'हिन्दी', sub: 'Devanagari script' },
                { code: 'hinglish' as const, label: 'Hindi (English letters)', sub: 'Hinglish' },
              ].map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSelectLanguage(item.code)}
                  className={`h-16 px-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all ${
                    language === item.code
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-lg">{item.label}</span>
                    <span className="text-xs opacity-80">{item.sub}</span>
                  </div>
                  {language === item.code && <Icon name="check" className="text-[24px]" />}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsLanguageModalOpen(false)}
              className="h-13 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
            >
              {btnCancel.main}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: PIN Length Change Flow */}
      {isPinLengthModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[460px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <h2 className="text-headline-md font-bold text-on-surface">
              {t('owner_settings.modal_pin_length_title')} ({targetPinLength} Digits)
            </h2>
            <div className="p-3 bg-tertiary-fixed rounded-xl text-on-tertiary-fixed text-xs font-bold leading-normal">
              {t('owner_settings.pin_length_warning')}
            </div>

            {plError && (
              <div className="p-2.5 bg-error-container text-error rounded-xl text-xs font-bold text-center">
                {plError}
              </div>
            )}

            {plStep === 1 && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-on-surface">
                  {t('owner_settings.label_current_pin')} ({pinLength} digits)
                </label>
                <input
                  type="password"
                  maxLength={pinLength}
                  value={pinCurrent}
                  onChange={(e) => setPinCurrent(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                  className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold tracking-widest text-2xl text-center"
                />
              </div>
            )}

            {plStep === 2 && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-on-surface">
                  Set New Owner PIN ({targetPinLength} digits)
                </label>
                <input
                  type="password"
                  maxLength={targetPinLength}
                  value={plOwnerPin}
                  onChange={(e) => setPlOwnerPin(e.target.value.replace(/\D/g, '').slice(0, targetPinLength))}
                  className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold tracking-widest text-2xl text-center"
                />
              </div>
            )}

            {plStep === 3 && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-on-surface">
                  Set New Approval (Ijazat) PIN ({targetPinLength} digits)
                </label>
                <input
                  type="password"
                  maxLength={targetPinLength}
                  value={plApprovalPin}
                  onChange={(e) => setPlApprovalPin(e.target.value.replace(/\D/g, '').slice(0, targetPinLength))}
                  className="h-14 px-4 rounded-xl bg-surface-container-low border border-outline-variant text-on-surface font-bold tracking-widest text-2xl text-center"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPinLengthModalOpen(false)}
                className="h-13 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
              >
                {btnCancel.main}
              </button>
              <button
                type="button"
                onClick={handleProceedPinLength}
                className="h-13 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold cursor-pointer shadow-md"
              >
                {plStep === 3 ? btnSave.main : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Change Owner Login PIN */}
      {isChangeOwnerPinModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[420px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <h2 className="text-headline-md font-bold text-on-surface text-center">
              {t('owner_settings.modal_change_owner_pin_title')}
            </h2>
            <span className="text-label-sub-english text-on-surface-variant text-center">
              {pinStep === 1
                ? t('owner_settings.label_current_pin')
                : pinStep === 2
                ? t('owner_settings.label_new_pin')
                : t('owner_settings.label_confirm_pin')}
            </span>

            {/* Dots */}
            <div className="flex items-center gap-4 my-2">
              {Array.from({ length: pinLength }).map((_, idx) => {
                const val = pinStep === 1 ? pinCurrent : pinStep === 2 ? pinNew : pinConfirm;
                return (
                  <div
                    key={idx}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      idx < val.length
                        ? 'bg-primary border-primary scale-110'
                        : 'border-outline-variant bg-surface-container'
                    }`}
                  />
                );
              })}
            </div>

            {pinError && <span className="text-error font-bold text-sm text-center">{pinError}</span>}

            {/* Mobile Native Numeric PIN Input (no on-screen numpad on phones) */}
            <div className="lg:hidden w-full flex flex-col gap-2">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                maxLength={pinLength}
                value={pinStep === 1 ? pinCurrent : pinStep === 2 ? pinNew : pinConfirm}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, pinLength);
                  if (pinStep === 1) setPinCurrent(digits);
                  else if (pinStep === 2) setPinNew(digits);
                  else setPinConfirm(digits);
                  setPinError('');
                }}
                placeholder={'•'.repeat(pinLength)}
                className="w-full h-14 px-4 rounded-2xl bg-surface-container-low border-2 border-primary/50 focus:border-primary text-center text-3xl font-extrabold tracking-[0.5em] text-on-surface outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Desktop Keypad */}
            <div className="hidden lg:grid grid-cols-3 gap-2.5 w-full max-w-[300px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const updateVal = (prev: string) => {
                      if (k === 'C') return '';
                      if (k === '⌫') return prev.slice(0, -1);
                      if (prev.length < pinLength) return prev + k;
                      return prev;
                    };
                    if (pinStep === 1) setPinCurrent(updateVal);
                    else if (pinStep === 2) setPinNew(updateVal);
                    else setPinConfirm(updateVal);
                    setPinError('');
                  }}
                  className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer active:scale-95 transition-all shadow-sm"
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setIsChangeOwnerPinModalOpen(false)}
                className="h-13 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
              >
                {btnCancel.main}
              </button>
              <button
                type="button"
                onClick={handleProceedChangeOwnerPin}
                className="h-13 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold cursor-pointer shadow-md"
              >
                {pinStep === 3 ? btnSave.main : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Change Approval (Ijazat) PIN */}
      {isChangeApprovalPinModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-[420px] max-w-full bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-4 border-t sm:border border-outline-variant/30 max-h-[92dvh] overflow-y-auto">
            <h2 className="text-headline-md font-bold text-on-surface text-center">
              {t('owner_settings.modal_change_approval_pin_title')}
            </h2>
            <span className="text-label-sub-english text-on-surface-variant text-center">
              {pinStep === 1
                ? t('owner_settings.label_current_pin')
                : pinStep === 2
                ? t('owner_settings.label_new_pin')
                : t('owner_settings.label_confirm_pin')}
            </span>

            {/* Dots */}
            <div className="flex items-center gap-4 my-2">
              {Array.from({ length: pinLength }).map((_, idx) => {
                const val = pinStep === 1 ? pinCurrent : pinStep === 2 ? pinNew : pinConfirm;
                return (
                  <div
                    key={idx}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      idx < val.length
                        ? 'bg-primary border-primary scale-110'
                        : 'border-outline-variant bg-surface-container'
                    }`}
                  />
                );
              })}
            </div>

            {pinError && <span className="text-error font-bold text-sm text-center">{pinError}</span>}

            {/* Mobile Native Numeric PIN Input (no on-screen numpad on phones) */}
            <div className="lg:hidden w-full flex flex-col gap-2">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                maxLength={pinLength}
                value={pinStep === 1 ? pinCurrent : pinStep === 2 ? pinNew : pinConfirm}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, pinLength);
                  if (pinStep === 1) setPinCurrent(digits);
                  else if (pinStep === 2) setPinNew(digits);
                  else setPinConfirm(digits);
                  setPinError('');
                }}
                placeholder={'•'.repeat(pinLength)}
                className="w-full h-14 px-4 rounded-2xl bg-surface-container-low border-2 border-primary/50 focus:border-primary text-center text-3xl font-extrabold tracking-[0.5em] text-on-surface outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Desktop Keypad */}
            <div className="hidden lg:grid grid-cols-3 gap-2.5 w-full max-w-[300px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const updateVal = (prev: string) => {
                      if (k === 'C') return '';
                      if (k === '⌫') return prev.slice(0, -1);
                      if (prev.length < pinLength) return prev + k;
                      return prev;
                    };
                    if (pinStep === 1) setPinCurrent(updateVal);
                    else if (pinStep === 2) setPinNew(updateVal);
                    else setPinConfirm(updateVal);
                    setPinError('');
                  }}
                  className="h-14 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-extrabold text-2xl flex items-center justify-center cursor-pointer active:scale-95 transition-all shadow-sm"
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setIsChangeApprovalPinModalOpen(false)}
                className="h-13 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold cursor-pointer"
              >
                {btnCancel.main}
              </button>
              <button
                type="button"
                onClick={handleProceedChangeApprovalPin}
                className="h-13 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold cursor-pointer shadow-md"
              >
                {pinStep === 3 ? btnSave.main : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerSettings;
