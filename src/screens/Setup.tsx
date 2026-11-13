import React, { useState } from 'react';
import { db, type Shop } from '../db';
import { hashPin, validatePin } from '../logic/pin';
import { addAudit } from '../db/audit';
import {
  DEFAULT_APPROVAL_RULES,
  setApprovalPin,
  validateApprovalPin,
  validateStaffPin,
  type ApprovalActionCategory,
  type ApprovalRuleType,
} from '../logic/approvals';
import { formatField, textFieldProps, filterDigits } from '../logic/format';
import { usePinKeyboard } from '../logic/usePinKeyboard';
import { useTranslation, tButton } from '../i18n';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { OwnerMedicineImport } from './OwnerMedicineImport';
import { generateShopSyncId } from '../logic/cloudSync';

interface SetupProps {
  onComplete: () => void;
}

interface AddedStaffMember {
  id: string;
  name: string;
  plainPin: string;
  pinHash: string;
  pinSalt: string;
}

export const Setup: React.FC<SetupProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const [isImportingInSetup, setIsImportingInSetup] = useState<boolean>(false);

  const btnBack = tButton('common.btn_back');
  const btnNext = tButton('common.btn_next');
  const btnSkip = tButton('common.btn_skip');
  const clearBtn = tButton('common.btn_clear');
  const btnFinish = tButton('setup.step8_finish_btn');

  // Step 1: Shop details
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [dl1, setDl1] = useState('');
  const [dl2, setDl2] = useState('');
  const [step1Error, setStep1Error] = useState('');

  // Step 2: Mode choice & Cloud config
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudAnonKey, setCloudAnonKey] = useState('');
  const [shopSyncId] = useState(() => generateShopSyncId());
  const [copiedSyncId, setCopiedSyncId] = useState(false);

  const handleCopySyncId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shopSyncId);
      setCopiedSyncId(true);
      setTimeout(() => setCopiedSyncId(false), 2000);
    }
  };

  // Step 3: Owner PIN
  const [ownerPin1, setOwnerPin1] = useState('');
  const [ownerPin2, setOwnerPin2] = useState('');
  const [activeOwnerPinField, setActiveOwnerPinField] = useState<1 | 2>(1);
  const [showOwnerPin, setShowOwnerPin] = useState(false);
  const [ownerPinError, setOwnerPinError] = useState('');

  // Step 4: Staff addition
  const [staffName, setStaffName] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffError, setStaffError] = useState('');
  const [staffList, setStaffList] = useState<AddedStaffMember[]>([]);

  // Step 6: Backup
  const [backupFolder, setBackupFolder] = useState('C:\\Hospivo\\Daily_Backups');
  const [storageStatus, setStorageStatus] = useState<'idle' | 'granted' | 'denied'>('idle');

  // Step 7: Ijazat PIN (Approval PIN)
  const [approvalPin1, setApprovalPin1] = useState('');
  const [approvalPin2, setApprovalPin2] = useState('');
  const [activeApprovalPinField, setActiveApprovalPinField] = useState<1 | 2>(1);
  const [showApprovalPin, setShowApprovalPin] = useState(false);
  const [approvalPinError, setApprovalPinError] = useState('');

  // Step 8: Approval Rules
  const [approvalRules, setApprovalRules] = useState<Record<ApprovalActionCategory, ApprovalRuleType>>({
    ...DEFAULT_APPROVAL_RULES,
  });

  // --------------------------------------------------------------------------
  // STEP 1 HANDLERS
  // --------------------------------------------------------------------------
  const handleStep1Next = () => {
    if (!shopName.trim()) {
      setStep1Error(t('setup.step1_err_shop'));
      return;
    }
    if (!ownerName.trim()) {
      setStep1Error(t('setup.step1_err_owner'));
      return;
    }
    setStep1Error('');
    setStep(2);
  };

  // --------------------------------------------------------------------------
  // STEP 3 (OWNER PIN) HANDLERS
  // --------------------------------------------------------------------------
  const handleOwnerPinDigit = (digit: string) => {
    setOwnerPinError('');
    if (activeOwnerPinField === 1) {
      if (ownerPin1.length < 4) {
        const next = ownerPin1 + digit;
        setOwnerPin1(next);
        if (next.length === 4) {
          setActiveOwnerPinField(2);
        }
      }
    } else {
      if (ownerPin2.length < 4) {
        setOwnerPin2(ownerPin2 + digit);
      }
    }
  };

  const handleOwnerPinBackspace = () => {
    setOwnerPinError('');
    if (activeOwnerPinField === 1) {
      setOwnerPin1((prev) => prev.slice(0, -1));
    } else {
      setOwnerPin2((prev) => prev.slice(0, -1));
    }
  };

  const handleOwnerPinClearAll = () => {
    setOwnerPinError('');
    setOwnerPin1('');
    setOwnerPin2('');
    setActiveOwnerPinField(1);
  };

  const handleStep3Next = () => {
    const val1 = validatePin(ownerPin1, true);
    if (!val1.valid) {
      setOwnerPinError(t('setup.step3_err_length'));
      return;
    }
    if (ownerPin1 !== ownerPin2) {
      setOwnerPinError(t('setup.step3_err_mismatch'));
      return;
    }

    setOwnerPinError('');
    setStep(4);
  };

  // Keyboard navigation for Step 3 (Owner PIN)
  usePinKeyboard({
    onDigit: handleOwnerPinDigit,
    onBackspace: handleOwnerPinBackspace,
    onClear: handleOwnerPinClearAll,
    disabled: step !== 3,
  });

  // --------------------------------------------------------------------------
  // STEP 4 (STAFF) HANDLERS
  // --------------------------------------------------------------------------
  const handleAddStaff = async () => {
    if (!staffName.trim()) {
      setStaffError(t('setup.staff_err_name'));
      return;
    }
    const val = await validateStaffPin(staffPin, ownerPin1, staffList.map((s) => s.plainPin));
    if (!val.ok && val.error) {
      if (val.error === 'staff_pin_same_as_owner') {
        setStaffError(t('setup.staff_err_owner_pin'));
      } else if (val.error === 'staff_pin_same_as_approval') {
        setStaffError(t('setup.staff_err_approval_pin'));
      } else if (val.error === 'staff_pin_duplicate') {
        setStaffError(t('setup.staff_err_duplicate_pin'));
      } else {
        setStaffError(t('setup.staff_err_pin'));
      }
      return;
    }

    const { hash, salt } = await hashPin(staffPin);
    const newStaff: AddedStaffMember = {
      id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: formatField('name', staffName.trim()),
      plainPin: staffPin,
      pinHash: hash,
      pinSalt: salt,
    };

    setStaffList((prev) => [...prev, newStaff]);
    setStaffName('');
    setStaffPin('');
    setStaffError('');
  };

  // Keyboard navigation for Step 4 (Staff PIN entry)
  usePinKeyboard({
    onDigit: (digit) => {
      setStaffPin((prev) => (prev.length < 4 ? prev + digit : prev));
      setStaffError('');
    },
    onBackspace: () => {
      setStaffPin((prev) => prev.slice(0, -1));
      setStaffError('');
    },
    disabled: step !== 4,
  });

  const handleRemoveStaff = (id: string) => {
    setStaffList((prev) => prev.filter((s) => s.id !== id));
  };

  // --------------------------------------------------------------------------
  // STEP 6 (BACKUP PERMISSION) HANDLER
  // --------------------------------------------------------------------------
  const handleRequestStoragePermission = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const isGranted = await navigator.storage.persist();
        setStorageStatus(isGranted ? 'granted' : 'denied');
        await db.settings.put({ key: 'storage_persisted', value: isGranted });
      } else {
        setStorageStatus('denied');
        await db.settings.put({ key: 'storage_persisted', value: false });
      }
    } catch {
      setStorageStatus('denied');
      await db.settings.put({ key: 'storage_persisted', value: false });
    }
  };

  // --------------------------------------------------------------------------
  // STEP 7 (IJAZAT PIN) HANDLERS
  // --------------------------------------------------------------------------
  const handleApprovalPinDigit = (digit: string) => {
    setApprovalPinError('');
    if (activeApprovalPinField === 1) {
      if (approvalPin1.length < 4) {
        const next = approvalPin1 + digit;
        setApprovalPin1(next);
        if (next.length === 4) {
          setActiveApprovalPinField(2);
        }
      }
    } else {
      if (approvalPin2.length < 4) {
        setApprovalPin2(approvalPin2 + digit);
      }
    }
  };

  const handleApprovalPinBackspace = () => {
    setApprovalPinError('');
    if (activeApprovalPinField === 1) {
      setApprovalPin1((prev) => prev.slice(0, -1));
    } else {
      setApprovalPin2((prev) => prev.slice(0, -1));
    }
  };

  const handleApprovalPinClearAll = () => {
    setApprovalPinError('');
    setApprovalPin1('');
    setApprovalPin2('');
    setActiveApprovalPinField(1);
  };

  const handleStep7Next = () => {
    const val = validateApprovalPin(
      approvalPin1,
      approvalPin2,
      [ownerPin1, ...staffList.map((s) => s.plainPin)]
    );
    if (!val.ok && val.error) {
      if (val.error === 'approval_pin_mismatch') {
        setApprovalPinError(t('setup.step7_err_mismatch'));
      } else if (val.error === 'approval_pin_same_as_owner_or_staff') {
        setApprovalPinError(t('setup.step7_err_same_as_owner_or_staff'));
      } else {
        setApprovalPinError(t('setup.step7_err_length'));
      }
      return;
    }

    setApprovalPinError('');
    setStep(8);
  };

  // Keyboard navigation for Step 7 (Ijazat PIN)
  usePinKeyboard({
    onDigit: handleApprovalPinDigit,
    onBackspace: handleApprovalPinBackspace,
    onClear: handleApprovalPinClearAll,
    disabled: step !== 7,
  });

  // --------------------------------------------------------------------------
  // STEP 8 (APPROVAL RULES) TOGGLE
  // --------------------------------------------------------------------------
  const handleRuleToggle = (category: ApprovalActionCategory, ruleChoice: ApprovalRuleType) => {
    setApprovalRules((prev) => ({
      ...prev,
      [category]: ruleChoice,
    }));
  };

  // --------------------------------------------------------------------------
  // FINISH SETUP & SAVE ALL TO DATABASE
  // --------------------------------------------------------------------------
  const handleFinishSetup = async () => {
    // 1. Save Shop to Dexie
    const cleanDl1 = formatField('code', dl1.trim());
    const cleanDl2 = formatField('code', dl2.trim());
    const drugLicences = [cleanDl1, cleanDl2].filter(Boolean).join(', ');
    const formattedShopName = formatField('name', shopName.trim());
    const formattedOwnerName = formatField('name', ownerName.trim());
    const shopRecord: Shop = {
      name: formattedShopName,
      ownerName: formattedOwnerName,
      address: formatField('name', address.trim()),
      phone: formatField('phone', phone.trim()),
      gstNo: formatField('code', gstNo.trim()),
      drugLicenceNos: drugLicences,
      mode,
    };
    await db.shop.add(shopRecord);
    await addAudit('Setup', 'shop_saved', formattedShopName, 'Shop details saved during initial setup');

    // 2. Save Owner user with hashed PIN (never plain text)
    const { hash: ownerHash, salt: ownerSalt } = await hashPin(ownerPin1);
    await db.users.add({
      id: 'owner',
      name: formattedOwnerName,
      role: 'owner',
      pinHash: ownerHash,
      pinSalt: ownerSalt,
      pinLength: ownerPin1.length,
      active: true,
      createdAt: new Date().toISOString(),
    });
    await addAudit('Setup', 'owner_created', formattedOwnerName, 'Owner user registered with hashed PIN');

    // 3. Save any added staff members
    for (const staff of staffList) {
      await db.users.add({
        id: staff.id,
        name: staff.name,
        role: 'cashier',
        pinHash: staff.pinHash,
        pinSalt: staff.pinSalt,
        pinLength: staff.plainPin.length,
        active: true,
        createdAt: new Date().toISOString(),
      });
      await addAudit('Setup', 'staff_created', staff.name, 'Staff member added with hashed PIN');
    }

    // 4. Save Approval PIN (salted hash only)
    await setApprovalPin(approvalPin1, [ownerPin1, ...staffList.map((s) => s.plainPin)]);

    // 5. Save settings (approval rules, auto-lock minutes, backup folder, pinLength, cloud settings)
    await db.settings.put({ key: 'approval_rules', value: approvalRules });
    await db.settings.put({ key: 'auto_lock_minutes', value: 5 });
    await db.settings.put({ key: 'backup_folder', value: backupFolder });
    await db.settings.put({ key: 'pinLength', value: 4 });
    await db.settings.put({ key: 'cloud_enabled', value: mode === 'cloud' });
    await db.settings.put({ key: 'shop_sync_id', value: shopSyncId.trim().toUpperCase() });
    await db.settings.put({ key: 'cloud_url', value: cloudUrl.trim() });
    await db.settings.put({ key: 'cloud_anon_key', value: cloudAnonKey.trim() });
    await db.settings.put({ key: 'device_name', value: 'Counter PC 1 (Billing Desk)' });

    // 6. Audit entry for setup completion
    await addAudit('Setup', 'setup_complete', shopName.trim(), 'Initial setup completed successfully');

    // Done! Proceed to Login
    onComplete();
  };

  // --------------------------------------------------------------------------
  // RENDER STEPPER (8 STEPS)
  // --------------------------------------------------------------------------
  const renderProgress = (currentStep: number) => {
    const header = tButton(`setup.step${currentStep}_header` as any);
    return (
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#E8EFEA] pb-4 flex-wrap gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1B8F4A] flex items-center justify-center shadow-md text-white">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div>
              <div className="text-[28px] font-extrabold tracking-tight text-[#1B8F4A] leading-none">{t('common.app_name')}</div>
              <div className="text-[16px] text-[#5C6E66] font-medium tracking-wide mt-0.5">{t('login.pos_title')} • {t('setup.wizard_title')}</div>
            </div>
          </div>

          {/* Step Indicator & Language Switch on Step 1 */}
          <div className="flex items-center gap-4 flex-wrap justify-end">
            {currentStep === 1 && <LanguageSwitch />}
            <div className="text-right">
              <div className="text-[22px] font-bold text-[#1A1F1C] leading-tight">
                {header.main}
              </div>
              {header.sub ? (
                <div className="text-[16px] text-[#5C6E66] font-semibold">
                  {header.sub}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 8-Segment Progress Bar */}
        <div className="flex items-center gap-2 pt-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
            const isFilled = num <= currentStep;
            const isCurrent = num === currentStep;
            return (
              <div
                key={num}
                className={`flex-1 h-3 rounded-full transition-all ${
                  isFilled
                    ? isCurrent
                      ? 'bg-[#1B8F4A] ring-2 ring-[#1B8F4A] ring-offset-2 ring-offset-white shadow-sm'
                      : 'bg-[#1B8F4A]'
                    : 'bg-[#E0E9E4]'
                }`}
              />
            );
          })}
        </div>
      </header>
    );
  };

  // ==========================================================================
  // VIEW: IMPORT PREVIEW (05b_Setup_ImportPreview.html / 38c)
  // ==========================================================================
  if (isImportingInSetup) {
    return (
      <OwnerMedicineImport
        onBack={() => setIsImportingInSetup(false)}
        onReturnHome={() => setIsImportingInSetup(false)}
        onImportSuccess={() => {
          setIsImportingInSetup(false);
          setStep(6);
        }}
        currentUser={{ name: ownerName || 'Owner', role: 'owner' }}
      />
    );
  }

  // ==========================================================================
  // VIEW: STEP 1 (01_Setup_ShopDetails.html)
  // ==========================================================================
  if (step === 1) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-gradient-to-b from-[#EBF7F0] to-[#E3F2E9] select-none">
        <main className="w-full max-w-[1240px] min-h-[836px] bg-white rounded-3xl shadow-[0_12px_40px_rgba(27,143,74,0.08)] border border-[#D5E5DC] flex flex-col justify-between px-8 md:px-12 py-8">
          {renderProgress(1)}

          {step1Error && (
            <div className="mt-2 px-4 py-2 bg-red-100 border border-red-300 text-red-700 rounded-xl font-bold text-sm">
              {step1Error}
            </div>
          )}

          <section className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 my-auto pt-2">
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>{t('setup.shop_name_label')} <span className="text-red-500">*</span></span>
                  {t('setup.shop_name_sub') ? (
                    <span className="text-[16px] font-medium text-[#5C6E66]">{t('setup.shop_name_sub')}</span>
                  ) : null}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.614A2.998 2.998 0 0 0 12 9.349c.89 0 1.71-.387 2.25-1.014.54.627 1.36 1.014 2.25 1.014a3 3 0 0 0 3.75-.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72L4.318 3.44A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l2.19 2.189a3 3 0 0 1-.62 4.72" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    {...textFieldProps('name', shopName, setShopName)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder={`${t('common.example')} ${t('setup.shop_name_hint')}`}
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">{t('setup.shop_name_sub_desc')}</p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>{t('setup.owner_name_label')} <span className="text-red-500">*</span></span>
                  {t('setup.owner_name_sub') ? (
                    <span className="text-[16px] font-medium text-[#5C6E66]">{t('setup.owner_name_sub')}</span>
                  ) : null}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    {...textFieldProps('name', ownerName, setOwnerName)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder={`${t('common.example')} ${t('setup.owner_name_hint')}`}
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">{t('setup.owner_name_sub_desc')}</p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>{t('setup.address_label')}</span>
                  {t('setup.address_sub') ? (
                    <span className="text-[16px] font-medium text-[#5C6E66]">{t('setup.address_sub')}</span>
                  ) : null}
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  </div>
                  <textarea
                    rows={2}
                    {...textFieldProps('name', address, setAddress)}
                    className="w-full h-[90px] pl-14 pr-4 py-3 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none resize-none leading-snug"
                    placeholder={`${t('common.example')} ${t('setup.address_hint')}`}
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">{t('setup.address_sub_desc')}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>{t('setup.phone_label')}</span>
                  {t('setup.phone_sub_label') ? (
                    <span className="text-[16px] font-medium text-[#5C6E66]">{t('setup.phone_sub_label')}</span>
                  ) : null}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    {...textFieldProps('phone', phone, setPhone)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder={`${t('common.example')} ${t('setup.phone_hint')}`}
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">{t('setup.phone_sub')}</p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>{t('setup.gst_label')}</span>
                  {t('setup.gst_sub_label') ? (
                    <span className="text-[16px] font-medium text-[#5C6E66]">{t('setup.gst_sub_label')}</span>
                  ) : null}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    {...textFieldProps('code', gstNo, setGstNo)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder={`${t('common.example')} ${t('setup.gst_hint')}`}
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">{t('setup.gst_sub')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[17px] font-bold text-[#1A1F1C] mb-1.5 truncate">
                    {t('setup.dl1_label')}
                  </label>
                  <input
                    type="text"
                    {...textFieldProps('code', dl1, setDl1)}
                    className="w-full h-[60px] px-4 text-[17px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder={`${t('common.example')} ${t('setup.dl1_hint')}`}
                  />
                  <p className="text-[14px] text-[#5C6E66] mt-1">{t('setup.dl1_sub')}</p>
                </div>
                <div>
                  <label className="block text-[17px] font-bold text-[#1A1F1C] mb-1.5 truncate">
                    {t('setup.dl2_label')}
                  </label>
                  <input
                    type="text"
                    {...textFieldProps('code', dl2, setDl2)}
                    className="w-full h-[60px] px-4 text-[17px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder={`${t('common.example')} ${t('setup.dl2_hint')}`}
                  />
                  <p className="text-[14px] text-[#5C6E66] mt-1">{t('setup.dl2_sub')}</p>
                </div>
              </div>
            </div>
          </section>

          <footer className="flex items-center justify-between border-t border-[#E8EFEA] pt-5">
            <button
              type="button"
              disabled
              className="h-[64px] min-w-[200px] px-8 rounded-2xl bg-[#E8ECE9] text-[#9AA5A0] flex items-center gap-3.5 cursor-not-allowed opacity-80"
            >
              <svg className="w-7 h-7 text-[#9AA5A0]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              <div className="text-left">
                <div className="text-[22px] font-bold leading-tight">{btnBack.main}</div>
                {btnBack.sub ? <div className="text-[16px] font-medium leading-none">{btnBack.sub}</div> : null}
              </div>
            </button>

            <div className="text-center text-[#5C6E66] text-[16px] font-medium">
              {t('setup.step2_note')}
            </div>

            <button
              type="button"
              onClick={handleStep1Next}
              className="h-[64px] min-w-[240px] px-10 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-between gap-5 shadow-[0_6px_20px_rgba(27,143,74,0.35)] cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="text-left">
                <div className="text-[24px] font-extrabold leading-tight tracking-wide">{btnNext.main}</div>
                {btnNext.sub ? <div className="text-[16px] font-medium text-white/90 leading-none">{btnNext.sub}</div> : null}
              </div>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 2 (02_Setup_ModeChoice.html)
  // ==========================================================================
  if (step === 2) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-3 sm:p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1280px] min-h-[820px] bg-white rounded-3xl shadow-[0_16px_48px_rgba(27,143,74,0.08)] border border-[#E1E8E4] flex flex-col justify-between p-4 sm:p-8 md:p-10">
          {renderProgress(2)}

          <div className="my-auto pt-4 pb-4 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 w-full">
              {/* Card 1: Local-only */}
              <div
                onClick={() => setMode('local')}
                className={`relative rounded-2xl p-4 sm:p-6 md:p-7 flex flex-col justify-between transition-all cursor-pointer w-full ${
                  mode === 'local'
                    ? 'bg-[#F4FAF6] border-2 border-[#1B8F4A] shadow-[0_8px_24px_rgba(27,143,74,0.12)]'
                    : 'bg-white border-2 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div
                        className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 border ${
                          mode === 'local'
                            ? 'bg-[#E7F7EC] text-[#1B8F4A] border-[#BDE7CC]'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        <svg className="w-7 h-7 sm:w-9 sm:h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <path d="M9 22V12h6v10" />
                          <rect x="8" y="5" width="8" height="5" rx="1" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-xl sm:text-[24px] md:text-[26px] font-bold text-[#1A1F1C] leading-snug">
                          {t('setup.local_card_title')}
                        </h2>
                        <span className="text-xs sm:text-[14px] md:text-[16px] font-semibold text-[#1B8F4A] tracking-wide uppercase">
                          {t('setup.local_card_sub')}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        mode === 'local'
                          ? 'bg-[#1B8F4A] text-white shadow-md shadow-[#1B8F4A]/30'
                          : 'border-2 border-slate-300 bg-white'
                      }`}
                    >
                      {mode === 'local' && (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <ul className="mt-4 sm:mt-6 space-y-2.5 sm:space-y-3.5">
                    <li className="flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base md:text-[18px] text-[#1A1F1C]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-1.5 sm:mt-2 shrink-0"></span>
                      <span className="font-medium">{t('setup.local_card_bullet1')}</span>
                    </li>
                    <li className="flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base md:text-[18px] text-[#1A1F1C]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-1.5 sm:mt-2 shrink-0"></span>
                      <span className="font-medium">{t('setup.local_card_bullet2')}</span>
                    </li>
                    <li className="flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base md:text-[18px] text-[#1A1F1C]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#9AA5A0] mt-1.5 sm:mt-2 shrink-0"></span>
                      <span className="font-normal text-[#4A5550]">{t('setup.local_card_bullet3')}</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4 sm:mt-6 bg-[#EBF3FB] border border-[#B8D8F8] rounded-xl p-3 sm:p-4 flex items-center gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1976D2] text-white flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </div>
                  <p className="text-xs sm:text-sm md:text-[16px] font-medium text-[#104D8C] leading-snug">
                    {t('setup.local_card_tag')}
                  </p>
                </div>
              </div>

              {/* Card 2: Cloud-enabled Mode */}
              <div
                onClick={() => setMode('cloud')}
                className={`relative rounded-2xl p-4 sm:p-6 md:p-7 flex flex-col justify-between transition-all cursor-pointer w-full ${
                  mode === 'cloud'
                    ? 'bg-[#F4FAF6] border-2 border-[#1B8F4A] shadow-[0_8px_24px_rgba(27,143,74,0.12)]'
                    : 'bg-white border-2 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div
                        className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 border ${
                          mode === 'cloud'
                            ? 'bg-[#E7F7EC] text-[#1B8F4A] border-[#BDE7CC]'
                            : 'bg-blue-50 text-blue-600 border-blue-200'
                        }`}
                      >
                        <svg className="w-7 h-7 sm:w-9 sm:h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl sm:text-[24px] md:text-[26px] font-bold text-[#1A1F1C] leading-snug">
                            {t('setup.cloud_card_title')}
                          </h2>
                          <span className="px-2 py-0.5 bg-[#E7F7EC] text-[#1B8F4A] border border-[#BDE7CC] rounded-lg text-xs font-bold uppercase tracking-wider">
                            {t('setup.cloud_card_locked')}
                          </span>
                        </div>
                        <span className="text-xs sm:text-[14px] md:text-[16px] font-semibold text-[#1B8F4A] tracking-wide uppercase">
                          {t('setup.cloud_card_sub')}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        mode === 'cloud'
                          ? 'bg-[#1B8F4A] text-white shadow-md shadow-[#1B8F4A]/30'
                          : 'border-2 border-slate-300 bg-white'
                      }`}
                    >
                      {mode === 'cloud' && (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <ul className="mt-4 sm:mt-6 space-y-2.5 sm:space-y-3.5">
                    <li className="flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base md:text-[18px] text-[#1A1F1C]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-1.5 sm:mt-2 shrink-0"></span>
                      <span className="font-medium">{t('setup.cloud_card_bullet1')}</span>
                    </li>
                    <li className="flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base md:text-[18px] text-[#1A1F1C]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-1.5 sm:mt-2 shrink-0"></span>
                      <span className="font-medium">{t('setup.cloud_card_bullet2')}</span>
                    </li>
                    <li className="flex items-start gap-2.5 sm:gap-3 text-sm sm:text-base md:text-[18px] text-[#1A1F1C]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-1.5 sm:mt-2 shrink-0"></span>
                      <span className="font-medium">{t('setup.cloud_card_bullet3')}</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4 sm:mt-6 bg-[#E7F7EC] border border-[#BDE7CC] rounded-xl p-3 sm:p-4 flex items-center gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1B8F4A] text-white flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </div>
                  <p className="text-xs sm:text-sm md:text-[15px] font-medium text-[#0f542b] leading-snug">
                    {t('setup.cloud_card_banner')}
                  </p>
                </div>
              </div>
            </div>

            {/* Inline Cloud Setup Box when Cloud mode is selected */}
            {mode === 'cloud' && (
              <div className="w-full bg-[#F4FAF6] border-2 border-[#BDE7CC] rounded-2xl p-4 sm:p-6 mt-4 sm:mt-6 shadow-sm animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#D4F3DF]">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#1A1F1C]">
                      {t('setup.cloud_setup_title')}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#4A5550] mt-0.5">
                      {t('setup.cloud_setup_sub')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 self-start sm:self-auto px-3 py-1 bg-[#E7F7EC] text-[#1B8F4A] rounded-xl text-xs font-bold border border-[#BDE7CC]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{t('setup.cloud_card_locked')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4">
                  {/* Shop Sync ID (4 cols) */}
                  <div className="md:col-span-4 flex flex-col">
                    <label className="text-sm font-bold text-slate-800 mb-1">
                      {t('setup.cloud_shop_sync_id')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shopSyncId}
                        className="w-full h-12 px-3.5 rounded-xl bg-white border border-slate-300 font-mono text-base font-bold text-[#1B8F4A] select-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopySyncId}
                        className="h-12 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs shrink-0 flex items-center gap-1.5 transition cursor-pointer"
                        title={t('setup.cloud_copy_id')}
                      >
                        {copiedSyncId ? (
                          <>
                            <svg className="w-4 h-4 text-[#1B8F4A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-[#1B8F4A]">{t('setup.cloud_copied')}</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>{t('setup.cloud_copy_id')}</span>
                          </>
                        )}
                      </button>
                    </div>
                    <span className="text-xs text-slate-500 mt-1">
                      {t('setup.cloud_sync_id_hint')}
                    </span>
                  </div>

                  {/* Supabase URL (4 cols) */}
                  <div className="md:col-span-4 flex flex-col">
                    <label className="text-sm font-bold text-slate-800 mb-1">
                      {t('setup.cloud_supabase_url')}
                    </label>
                    <input
                      type="url"
                      value={cloudUrl}
                      onChange={(e) => setCloudUrl(e.target.value)}
                      placeholder="https://xyz.supabase.co"
                      className="w-full h-12 px-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-[#1B8F4A] outline-none font-mono"
                    />
                    <span className="text-xs text-slate-500 mt-1">
                      Supabase Project URL
                    </span>
                  </div>

                  {/* Supabase Anon Key (4 cols) */}
                  <div className="md:col-span-4 flex flex-col">
                    <label className="text-sm font-bold text-slate-800 mb-1">
                      {t('setup.cloud_supabase_anon_key')}
                    </label>
                    <input
                      type="password"
                      value={cloudAnonKey}
                      onChange={(e) => setCloudAnonKey(e.target.value)}
                      placeholder="eyJhbGciOi..."
                      className="w-full h-12 px-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-[#1B8F4A] outline-none font-mono"
                    />
                    <span className="text-xs text-slate-500 mt-1">
                      Supabase public anon API key
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="w-full pt-4 sm:pt-6 border-t border-[#EBEFEA] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm sm:text-[16px] font-medium text-[#66766F] text-center order-1 sm:order-2 w-full sm:w-auto">
              {t('setup.step2_note')}
            </p>

            <div className="flex items-center justify-between gap-3 w-full sm:w-auto sm:contents order-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-14 sm:h-16 px-4 sm:px-8 rounded-2xl bg-[#EBEFEA] hover:bg-[#DEE5E0] text-[#1A1F1C] font-bold flex items-center justify-center gap-2 sm:gap-3 cursor-pointer sm:order-1 flex-1 sm:flex-initial"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#4A5550]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <div className="text-left flex flex-col justify-center">
                  <span className="text-base sm:text-[20px] font-bold leading-tight text-[#1A1F1C]">{btnBack.main}</span>
                  {btnBack.sub ? <span className="text-xs sm:text-[16px] font-normal leading-tight text-[#66766F]">{btnBack.sub}</span> : null}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="h-14 sm:h-16 px-5 sm:px-10 rounded-2xl bg-[#1B8F4A] hover:bg-[#16783E] text-white font-bold flex items-center justify-center gap-2 sm:gap-4 shadow-lg shadow-[#1B8F4A]/30 cursor-pointer sm:order-3 flex-1 sm:flex-initial"
              >
                <div className="text-right flex flex-col justify-center">
                  <span className="text-base sm:text-[22px] font-extrabold leading-tight">{btnNext.main}</span>
                  {btnNext.sub ? <span className="text-xs sm:text-[16px] font-normal leading-tight text-[#D4F3DF]">{btnNext.sub}</span> : null}
                </div>
                <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 3 (03_Setup_OwnerPIN.html)
  // ==========================================================================
  if (step === 3) {
    const clearBtn = tButton('common.btn_clear');

    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1240px] min-h-[852px] bg-white rounded-3xl shadow-[0_16px_40px_rgba(0,107,51,0.08)] border border-slate-200 flex flex-col justify-between p-8">
          <div>
            {renderProgress(3)}
            <div className="flex items-center gap-2 pt-3">
              <svg className="w-6 h-6 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6-5a3 3 0 013 3v2H9V6a3 3 0 013-3zm6 15H6V10h12v10z" />
              </svg>
              <span className="text-[18px] text-[#1A1F1C] font-medium">{t('setup.step3_security_note')}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-14 my-auto py-4">
            <div className="flex flex-col gap-6 w-[430px]">
              <div
                onClick={() => setActiveOwnerPinField(1)}
                className={`flex flex-col gap-2 p-5 rounded-2xl cursor-pointer transition-all ${
                  activeOwnerPinField === 1
                    ? 'bg-[#F4FAF6] border-2 border-[#1B8F4A] shadow-[0_4px_16px_rgba(0,107,51,0.12)]'
                    : 'bg-slate-50 border-2 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[20px] font-bold text-[#1B8F4A]">{t('setup.step3_input1_label')}</span>
                  <span className="text-[14px] font-bold px-2 py-0.5 rounded-md bg-[#8ef9a7] text-[#005226]">
                    1
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-5 h-5 rounded-full transition-all flex items-center justify-center text-xs font-bold ${
                        idx < ownerPin1.length
                          ? 'bg-[#1B8F4A] text-white shadow-sm'
                          : 'border-2 border-slate-300 bg-white'
                      }`}
                    >
                      {showOwnerPin && idx < ownerPin1.length ? ownerPin1[idx] : ''}
                    </div>
                  ))}
                </div>
              </div>

              <div
                onClick={() => setActiveOwnerPinField(2)}
                className={`flex flex-col gap-2 p-5 rounded-2xl cursor-pointer transition-all ${
                  activeOwnerPinField === 2
                    ? 'bg-[#F4FAF6] border-2 border-[#1B8F4A] shadow-[0_4px_16px_rgba(0,107,51,0.12)]'
                    : 'bg-slate-50 border-2 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[20px] font-bold text-[#1A1F1C]">{t('setup.step3_input2_label')}</span>
                  <span className="text-[14px] font-medium text-slate-500">2</span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-5 h-5 rounded-full transition-all flex items-center justify-center text-xs font-bold ${
                        idx < ownerPin2.length
                          ? 'bg-[#1B8F4A] text-white shadow-sm'
                          : 'border-2 border-slate-300 bg-white'
                      }`}
                    >
                      {showOwnerPin && idx < ownerPin2.length ? ownerPin2[idx] : ''}
                    </div>
                  ))}
                </div>
              </div>

              {ownerPinError && (
                <div className="px-4 py-2 rounded-xl bg-red-100 border border-red-300 text-red-700 font-bold text-base flex items-center gap-2 animate-bounce">
                  <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{ownerPinError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowOwnerPin((prev) => !prev)}
                className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[18px] cursor-pointer transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {showOwnerPin ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  )}
                </svg>
                <span>{showOwnerPin ? t('setup.step3_hide_pin') : t('setup.step3_show_pin')}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 w-[384px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleOwnerPinDigit(digit)}
                  className="h-[80px] w-[118px] rounded-2xl bg-white hover:bg-slate-100 border-2 border-slate-200 text-[#1A1F1C] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={handleOwnerPinClearAll}
                className="h-[80px] w-[118px] rounded-2xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-200 flex flex-col items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
              >
                <span className="text-[18px] font-bold text-slate-700 leading-none">{clearBtn.main}</span>
                {clearBtn.sub ? <span className="text-xs font-semibold text-slate-500 mt-1 leading-none">{clearBtn.sub}</span> : null}
              </button>

              <button
                type="button"
                onClick={() => handleOwnerPinDigit('0')}
                className="h-[80px] w-[118px] rounded-2xl bg-white hover:bg-slate-100 border-2 border-slate-200 text-[#1A1F1C] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleOwnerPinBackspace}
                aria-label={t('common.backspace')}
                className="h-[80px] w-[118px] rounded-2xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-200 flex items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
              >
                <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                </svg>
              </button>
            </div>
          </div>

          <footer className="w-full flex items-center justify-between border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="h-16 px-8 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#1A1F1C] font-bold flex items-center gap-3 cursor-pointer"
            >
              <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <div className="text-left flex flex-col justify-center">
                <span className="text-[20px] font-bold leading-tight">{btnBack.main}</span>
                {btnBack.sub ? <span className="text-[16px] font-normal leading-tight text-slate-500">{btnBack.sub}</span> : null}
              </div>
            </button>

            <div className="text-[16px] font-medium text-slate-500">
              {t('setup.step7_note')}
            </div>

            <button
              type="button"
              onClick={handleStep3Next}
              className="h-16 min-w-[200px] px-8 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white font-bold flex items-center justify-center gap-4 shadow-md cursor-pointer transition-all"
            >
              <div className="text-left flex flex-col justify-center">
                <span className="text-[22px] font-extrabold leading-tight">{btnNext.main}</span>
                {btnNext.sub ? <span className="text-[16px] font-normal leading-tight text-emerald-100">{btnNext.sub}</span> : null}
              </div>
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 4 (04_Setup_AddStaff.html)
  // ==========================================================================
  if (step === 4) {
    const addStaffBtn = tButton('setup.staff_btn_add');

    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1240px] min-h-[820px] bg-white rounded-3xl shadow-xl border border-slate-200 flex flex-col justify-between p-8">
          {renderProgress(4)}

          <div className="grid grid-cols-12 gap-8 items-start my-auto py-4">
            <div className="col-span-12 lg:col-span-7 flex flex-col gap-4 pr-0 lg:pr-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[18px] font-bold text-[#1A1F1C] flex items-center gap-2">
                  {t('setup.staff_name_label')}
                  {t('setup.staff_name_sub') ? (
                    <span className="text-[16px] font-normal text-slate-500">{t('setup.staff_name_sub')}</span>
                  ) : null}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    {...textFieldProps('name', staffName, setStaffName)}
                    placeholder={`${t('common.example')} ${t('setup.staff_name_hint')}`}
                    className="w-full h-[62px] pl-14 pr-4 rounded-2xl bg-slate-50 text-[#1A1F1C] font-semibold text-lg border-2 border-slate-200 focus:border-[#1B8F4A] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[18px] font-bold text-[#1A1F1C] flex items-center gap-2">
                  {t('setup.staff_pin_label')}
                  {t('setup.staff_pin_sub') ? (
                    <span className="text-[16px] font-normal text-slate-500">{t('setup.staff_pin_sub')}</span>
                  ) : null}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    value={staffPin}
                    onChange={(e) => setStaffPin(filterDigits(e.target.value).slice(0, 4))}
                    placeholder="••••"
                    className="w-full h-[62px] pl-14 pr-4 rounded-2xl bg-slate-50 text-[#1A1F1C] font-mono text-2xl tracking-[0.3em] border-2 border-slate-200 focus:border-[#1B8F4A] focus:outline-none"
                  />
                </div>
                <span className="text-sm text-slate-500 pl-1">
                  {t('setup.staff_pin_hint_desc')}
                </span>
              </div>

              {staffError && (
                <div className="px-4 py-2 bg-red-100 border border-red-300 text-red-700 rounded-xl font-bold text-sm">
                  {staffError}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddStaff}
                className="w-full h-[60px] rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white shadow-sm flex items-center justify-center gap-3 cursor-pointer transition-all"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[20px] font-bold">{addStaffBtn.main}</span>
                  {addStaffBtn.sub ? <span className="text-xs text-emerald-100 font-medium">{addStaffBtn.sub}</span> : null}
                </div>
              </button>

              <div className="w-full rounded-2xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3 mt-1">
                <svg className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                <p className="text-[16px] text-blue-900 leading-snug">
                  {t('setup.staff_role_notice')}
                </p>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-5 flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-3xl p-5 min-h-[360px]">
              <div className="flex items-center justify-between px-1">
                <span className="text-[22px] font-bold text-[#1A1F1C]">
                  {t('setup.staff_list_title')}
                </span>
                <span className="text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-bold">
                  {t('setup.staff_count_badge', { count: staffList.length })}
                </span>
              </div>

              {staffList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <svg className="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  </svg>
                  <p className="text-base font-medium">{t('setup.staff_no_one_yet')}</p>
                  <p className="text-sm">{t('setup.staff_empty_sub')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto">
                  {staffList.map((st) => (
                    <div
                      key={st.id}
                      className="h-[68px] rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between px-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-emerald-100 text-[#1B8F4A] flex items-center justify-center font-bold text-lg">
                          {st.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col leading-tight">
                          <span className="font-bold text-[#1A1F1C] text-lg">{st.name}</span>
                          <span className="text-xs text-slate-500 font-mono">{t('setup.staff_card_pin_masked')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          {t('login.counter_staff')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStaff(st.id)}
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded-xl transition-all cursor-pointer"
                          title={t('setup.staff_btn_remove_title')}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 bg-slate-200/60 rounded-2xl flex items-center gap-2 text-slate-600 mt-auto text-sm">
                <svg className="w-5 h-5 text-slate-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                </svg>
                <span>{t('login.staff_note')}</span>
              </div>
            </div>
          </div>

          <footer className="w-full flex items-center justify-between border-t border-slate-200 pt-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="h-[60px] min-w-[130px] px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#1A1F1C] transition-all flex items-center justify-center gap-2 cursor-pointer font-bold"
              >
                <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <div className="text-left leading-none">
                  <span className="text-[18px] font-bold block">{btnBack.main}</span>
                  {btnBack.sub ? <span className="text-xs text-slate-500 font-normal">{btnBack.sub}</span> : null}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep(5)}
                className="h-[60px] min-w-[180px] px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer font-bold"
              >
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className="text-left leading-none">
                  <span className="text-[18px] font-bold block">{btnSkip.main}</span>
                  {btnSkip.sub ? <span className="text-xs text-slate-500 font-normal">{btnSkip.sub}</span> : null}
                </div>
              </button>
            </div>

            <p className="hidden md:block text-[15px] font-medium text-slate-500 text-center max-w-[420px]">
              {t('setup.staff_footer_note')}
            </p>

            <button
              type="button"
              onClick={() => setStep(5)}
              className="h-[60px] min-w-[170px] px-8 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white shadow-md flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="text-right leading-none">
                <span className="text-[20px] font-extrabold block">{btnNext.main}</span>
                {btnNext.sub ? <span className="text-xs text-emerald-100 font-normal">{btnNext.sub}</span> : null}
              </div>
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 5 (05_Setup_MedicineList.html)
  // ==========================================================================
  if (step === 5) {
    const btnChooseFile = tButton('setup.step5_btn_choose_file');

    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1160px] min-h-[740px] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between p-8 md:p-10">
          {renderProgress(5)}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-auto py-4">
            {/* Option 1: File se Jodo (Active - opens OwnerMedicineImport) */}
            <div
              onClick={() => setIsImportingInSetup(true)}
              className="bg-white border-2 border-slate-200 hover:border-[#1B8F4A] h-[360px] p-7 rounded-2xl flex flex-col justify-between items-center text-center cursor-pointer shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-[24px] font-bold text-slate-800">{t('setup.step5_import_title')}</h2>
                </div>
                <span className="text-[16px] text-slate-500 font-medium">{t('setup.step5_import_sub')}</span>
              </div>

              <div className="w-full max-w-[380px] bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-2.5 text-[#1B8F4A]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                <p className="text-[16px] text-slate-700 font-semibold">
                  {t('setup.step5_import_box_title')}
                </p>
                <span className="text-[14px] text-slate-500 mt-1">
                  {t('setup.step5_import_box_desc')}
                </span>
              </div>

              <div className="w-full max-w-[320px] h-[58px] rounded-2xl bg-primary text-white flex items-center justify-center gap-3 px-6 shadow-sm hover:bg-primary-container transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                <div className="flex flex-col text-left">
                  <span className="text-[17px] font-bold leading-tight">{btnChooseFile.main}</span>
                  {btnChooseFile.sub ? (
                    <span className="text-[13px] opacity-80 leading-tight">{btnChooseFile.sub}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Option 2: Khaali Shuru Karo (Start Empty - ACTIVE) */}
            <div
              onClick={() => setStep(6)}
              className="bg-[#F4FAF6] border-2 border-[#1B8F4A] h-[360px] p-7 rounded-2xl flex flex-col justify-between items-center text-center cursor-pointer shadow-md shadow-[#1B8F4A]/10 hover:brightness-105 transition-all"
            >
              <div className="flex flex-col items-center">
                <h2 className="text-[24px] font-bold text-[#1A1F1C]">{t('setup.step5_empty_title')}</h2>
                <span className="text-[16px] text-[#1B8F4A] font-semibold">{t('setup.step5_empty_sub')}</span>
              </div>

              <div className="w-full max-w-[380px] bg-white border border-[#BDE7CC] rounded-xl p-5 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-full bg-[#E7F7EC] flex items-center justify-center mb-2.5 text-[#1B8F4A]">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-[#1A1F1C] text-[16px] font-medium">
                    <svg className="w-5 h-5 text-[#1B8F4A]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{t('setup.step5_empty_point1')}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[#1A1F1C] text-[16px] font-medium">
                    <svg className="w-5 h-5 text-[#1B8F4A]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>{t('setup.step5_empty_point2')}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="w-full max-w-[320px] h-[58px] rounded-2xl bg-[#1B8F4A] text-white flex items-center justify-center gap-3 px-6 shadow-md transition-transform"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex flex-col text-left">
                  <span className="text-[18px] font-bold leading-tight">{t('setup.step5_empty_tag')}</span>
                  <span className="text-[13px] text-emerald-100 leading-tight">{t('setup.step5_empty_subtag')}</span>
                </div>
              </button>
            </div>
          </div>

          <footer className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="h-[58px] min-w-[170px] px-6 rounded-2xl bg-[#E5E7EB] hover:bg-[#D1D5DB] text-[#1A1F1C] flex items-center justify-center gap-3 cursor-pointer font-bold transition-all"
            >
              <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-[18px] font-bold">{btnBack.main}</span>
                {btnBack.sub ? <span className="text-xs text-slate-500 font-normal">{btnBack.sub}</span> : null}
              </div>
            </button>

            <div className="flex items-center gap-2 text-center text-slate-500 text-[15px] font-medium max-w-[500px]">
              <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <span>{t('setup.step5_note')}</span>
            </div>

            <button
              type="button"
              onClick={() => setStep(6)}
              className="h-[58px] min-w-[170px] px-7 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-center gap-3 shadow-md cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="flex flex-col text-right leading-tight">
                <span className="text-[18px] font-bold">{btnNext.main}</span>
                {btnNext.sub ? <span className="text-xs text-emerald-100 font-normal">{btnNext.sub}</span> : null}
              </div>
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 6 (06_Setup_Backup.html)
  // ==========================================================================
  if (step === 6) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1240px] min-h-[820px] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between p-8 md:p-10">
          {renderProgress(6)}

          <div className="flex flex-col w-full bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8 justify-between gap-6 my-auto">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-18 h-18 flex items-center justify-center rounded-2xl bg-emerald-100 text-[#1B8F4A] p-3">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 64 64">
                  <path d="M32 6L12 14V28C12 42.5 20.5 53.5 32 58C43.5 53.5 52 42.5 52 28V14L32 6Z" fill="#E7F7EC" stroke="#1B8F4A" strokeLinejoin="round" strokeWidth={3} />
                  <circle cx="32" cy="30" fill="#ffffff" r="14" stroke="#1B8F4A" strokeWidth={3} />
                  <path d="M26 30L30 34L38 25" stroke="#1B8F4A" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} />
                </svg>
              </div>
              <div className="flex flex-col items-center">
                <h1 className="text-[26px] font-bold text-[#1A1F1C]">
                  {t('setup.step6_desc')}
                </h1>
                <p className="text-[16px] text-slate-500 font-medium">
                  {t('setup.step6_daily_sub')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              <div className="flex items-start gap-3.5 p-4 rounded-xl bg-blue-50 border border-blue-200">
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-[17px] font-bold text-blue-950">{t('setup.step6_info_local_title')}</span>
                  <span className="text-[14px] text-blue-700">{t('setup.step6_info_local_sub')}</span>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="w-11 h-11 rounded-xl bg-amber-600 flex items-center justify-center text-white shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-[17px] font-bold text-amber-950">{t('setup.step6_warning')}</span>
                  <span className="text-[14px] text-amber-700">{t('setup.step6_warning_sub')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between w-full p-4 bg-white border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-[17px] font-bold text-[#1A1F1C]">{t('setup.step6_folder_label')}</span>
                  <span className="text-[15px] font-mono text-slate-600 truncate">{backupFolder}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setBackupFolder((prev) =>
                    prev.includes('C:\\') ? 'D:\\Hospivo_Store\\Secure_Backups' : 'C:\\Hospivo\\Daily_Backups'
                  )
                }
                className="h-12 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-2 cursor-pointer font-bold text-sm transition-all shrink-0"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-.75" />
                </svg>
                <span>{t('setup.step6_btn_change_folder')}</span>
              </button>
            </div>

            <div className="flex items-center justify-between w-full p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#1B8F4A] flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-[17px] font-bold text-[#1A1F1C]">{t('setup.step6_perm_title')}</span>
                  <span className="text-[15px] text-slate-500">{t('setup.step6_perm_sub')}</span>
                </div>
              </div>

              {storageStatus === 'granted' ? (
                <div className="h-14 px-5 rounded-xl bg-emerald-100 text-[#005226] border border-[#1B8F4A] flex items-center gap-2.5 font-bold">
                  <svg className="w-6 h-6 text-[#1B8F4A]" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-[17px]">{t('setup.step6_status_granted')}</span>
                    <span className="text-xs text-emerald-800 font-normal">{t('setup.step6_status_granted_sub')}</span>
                  </div>
                </div>
              ) : storageStatus === 'denied' ? (
                <button
                  type="button"
                  onClick={handleRequestStoragePermission}
                  className="h-14 px-5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-2.5 font-bold cursor-pointer"
                >
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-[16px]">{t('setup.step6_status_denied')}</span>
                    <span className="text-xs text-amber-800 font-normal">{t('setup.step6_status_denied_sub')}</span>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestStoragePermission}
                  className="h-14 min-w-[210px] px-6 rounded-xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-center gap-2.5 cursor-pointer font-bold shadow-md transition-all active:scale-[0.98]"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-[17px]">{t('setup.step6_persist_btn')}</span>
                    <span className="text-xs text-emerald-100 font-normal">{t('setup.step6_persist_btn_sub')}</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          <footer className="w-full flex items-center justify-between border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setStep(5)}
              className="h-14 min-w-[170px] px-6 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1A1F1C] flex items-center justify-center gap-2 cursor-pointer font-bold transition-all"
            >
              <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-[18px] font-bold">{btnBack.main}</span>
                {btnBack.sub ? <span className="text-xs text-slate-500 font-normal">{btnBack.sub}</span> : null}
              </div>
            </button>

            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t('setup.step2_note')}</span>
            </div>

            <button
              type="button"
              onClick={() => setStep(7)}
              className="h-14 min-w-[190px] px-6 rounded-xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-center gap-3 cursor-pointer font-bold shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex flex-col text-right leading-tight">
                <span className="text-[18px] font-bold">{btnNext.main}</span>
                {btnNext.sub ? <span className="text-xs text-emerald-100 font-normal">{btnNext.sub}</span> : null}
              </div>
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 7 (NEW: Ijazat PIN banao - 03_Setup_OwnerPIN.html look)
  // ==========================================================================
  if (step === 7) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1240px] min-h-[852px] bg-white rounded-3xl shadow-[0_16px_40px_rgba(0,107,51,0.08)] border border-slate-200 flex flex-col justify-between p-8">
          <div>
            {renderProgress(7)}
            <div className="flex items-center gap-2 pt-3">
              <svg className="w-6 h-6 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6-5a3 3 0 013 3v2H9V6a3 3 0 013-3zm6 15H6V10h12v10z" />
              </svg>
              <span className="text-[18px] text-[#1A1F1C] font-medium">
                {t('setup.step7_note')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-14 my-auto py-4">
            <div className="flex flex-col gap-6 w-[430px]">
              <div
                onClick={() => setActiveApprovalPinField(1)}
                className={`flex flex-col gap-2 p-5 rounded-2xl cursor-pointer transition-all ${
                  activeApprovalPinField === 1
                    ? 'bg-[#F4FAF6] border-2 border-[#1B8F4A] shadow-[0_4px_16px_rgba(0,107,51,0.12)]'
                    : 'bg-slate-50 border-2 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[20px] font-bold text-[#1B8F4A]">{t('setup.step7_input1_label')}</span>
                  <span className="text-[14px] font-bold px-2 py-0.5 rounded-md bg-[#8ef9a7] text-[#005226]">
                    1
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-5 h-5 rounded-full transition-all flex items-center justify-center text-xs font-bold ${
                        idx < approvalPin1.length
                          ? 'bg-[#1B8F4A] text-white shadow-sm'
                          : 'border-2 border-slate-300 bg-white'
                      }`}
                    >
                      {showApprovalPin && idx < approvalPin1.length ? approvalPin1[idx] : ''}
                    </div>
                  ))}
                </div>
              </div>

              <div
                onClick={() => setActiveApprovalPinField(2)}
                className={`flex flex-col gap-2 p-5 rounded-2xl cursor-pointer transition-all ${
                  activeApprovalPinField === 2
                    ? 'bg-[#F4FAF6] border-2 border-[#1B8F4A] shadow-[0_4px_16px_rgba(0,107,51,0.12)]'
                    : 'bg-slate-50 border-2 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[20px] font-bold text-[#1A1F1C]">{t('setup.step7_input2_label')}</span>
                  <span className="text-[14px] font-medium text-slate-500">2</span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-5 h-5 rounded-full transition-all flex items-center justify-center text-xs font-bold ${
                        idx < approvalPin2.length
                          ? 'bg-[#1B8F4A] text-white shadow-sm'
                          : 'border-2 border-slate-300 bg-white'
                      }`}
                    >
                      {showApprovalPin && idx < approvalPin2.length ? approvalPin2[idx] : ''}
                    </div>
                  ))}
                </div>
              </div>

              {approvalPinError && (
                <div className="px-4 py-2 rounded-xl bg-red-100 border border-red-300 text-red-700 font-bold text-base flex items-center gap-2 animate-bounce">
                  <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{approvalPinError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowApprovalPin((prev) => !prev)}
                className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[18px] cursor-pointer transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {showApprovalPin ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  )}
                </svg>
                <span>{showApprovalPin ? t('setup.step7_hide_pin') : t('setup.step7_show_pin')}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 w-[384px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleApprovalPinDigit(digit)}
                  className="h-[80px] w-[118px] rounded-2xl bg-white hover:bg-slate-100 border-2 border-slate-200 text-[#1A1F1C] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={handleApprovalPinClearAll}
                className="h-[80px] w-[118px] rounded-2xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-200 flex flex-col items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
              >
                <span className="text-[18px] font-bold text-slate-700 leading-none">{clearBtn.main}</span>
                {clearBtn.sub ? <span className="text-xs font-semibold text-slate-500 mt-1 leading-none">{clearBtn.sub}</span> : null}
              </button>

              <button
                type="button"
                onClick={() => handleApprovalPinDigit('0')}
                className="h-[80px] w-[118px] rounded-2xl bg-white hover:bg-slate-100 border-2 border-slate-200 text-[#1A1F1C] text-3xl font-bold flex items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleApprovalPinBackspace}
                aria-label={t('common.backspace')}
                className="h-[80px] w-[118px] rounded-2xl bg-slate-100 hover:bg-slate-200 border-2 border-slate-200 flex items-center justify-center shadow-sm cursor-pointer active:translate-y-0.5 transition-all"
              >
                <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                </svg>
              </button>
            </div>
          </div>

          <footer className="w-full flex items-center justify-between border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => setStep(6)}
              className="h-16 px-8 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#1A1F1C] font-bold flex items-center gap-3 cursor-pointer"
            >
              <svg className="w-6 h-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <div className="text-left flex flex-col justify-center">
                <span className="text-[20px] font-bold leading-tight">{btnBack.main}</span>
                {btnBack.sub ? <span className="text-[16px] font-normal leading-tight text-slate-500">{btnBack.sub}</span> : null}
              </div>
            </button>

            <div className="text-[16px] font-medium text-slate-500">
              {t('setup.step7_footer_note')}
            </div>

            <button
              type="button"
              onClick={handleStep7Next}
              className="h-16 min-w-[200px] px-8 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white font-bold flex items-center justify-center gap-4 shadow-md cursor-pointer transition-all"
            >
              <div className="text-left flex flex-col justify-center">
                <span className="text-[22px] font-extrabold leading-tight">{btnNext.main}</span>
                {btnNext.sub ? <span className="text-[16px] font-normal leading-tight text-emerald-100">{btnNext.sub}</span> : null}
              </div>
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 8 (07b_Setup_ApprovalRules_Local.html)
  // ==========================================================================
  const approvalItems: {
    category: ApprovalActionCategory;
    title: string;
  }[] = [
    { category: 'delete_or_correct_bill', title: t('setup.step8_rule_delete_bill') },
    { category: 'price_change', title: t('setup.step8_rule_price_change') },
    { category: 'discount_above_limit', title: t('setup.step8_rule_discount_limit') },
    { category: 'stock_correction', title: t('setup.step8_rule_stock_correction') },
    { category: 'cash_mismatch', title: t('setup.step8_rule_cash_mismatch') },
  ];

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
      <main className="w-full max-w-[1160px] min-h-[820px] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between p-8 md:p-10">
        <div>
          {renderProgress(8)}

          <div className="mt-3 mb-3">
            <p className="text-[18px] text-gray-700 font-medium">
              {t('setup.step8_desc')}
            </p>
          </div>

          {/* Blue Info Banner */}
          <div className="flex items-center gap-3 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] px-5 py-3 rounded-2xl mb-4">
            <svg className="w-6 h-6 shrink-0 text-[#2563EB]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span className="text-[16px] font-semibold">
              {mode === 'cloud' ? t('setup.step8_banner_cloud') : t('setup.step8_banner')}
            </span>
          </div>

          {/* 5 Rows */}
          <div className="space-y-2.5">
            {approvalItems.map((item) => {
              const currentChoice = approvalRules[item.category];

              return (
                <div
                  key={item.category}
                  className="bg-white rounded-2xl p-4 md:px-5 min-h-[70px] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm border border-gray-200"
                >
                  <div className="w-full md:w-[300px]">
                    <span className="text-base md:text-[18px] font-bold text-gray-900">{item.title}</span>
                  </div>

                  {/* 3-option Segmented Selector */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Option 1: Ijazat PIN (yahin) */}
                    <button
                      type="button"
                      onClick={() => handleRuleToggle(item.category, 'local_pin')}
                      className={`h-[54px] px-4 rounded-xl flex items-center gap-2 font-bold text-[16px] cursor-pointer transition-all ${
                        currentChoice === 'local_pin'
                          ? 'bg-[#E8F5E9] border-2 border-[#1B8F4A] text-[#1B8F4A]'
                          : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {currentChoice === 'local_pin' && (
                        <svg className="w-5 h-5 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span>{t('setup.step8_opt_pin')}</span>
                    </button>

                    {/* Option 2: Door se approval (Enabled in Cloud mode, Disabled in Local-only) */}
                    {mode === 'cloud' ? (
                      <button
                        type="button"
                        onClick={() => handleRuleToggle(item.category, 'remote_approval')}
                        className={`h-[54px] px-4 rounded-xl flex items-center gap-2 font-bold text-[16px] cursor-pointer transition-all min-w-[200px] ${
                          currentChoice === 'remote_approval'
                            ? 'bg-[#E8F5E9] border-2 border-[#1B8F4A] text-[#1B8F4A]'
                            : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {currentChoice === 'remote_approval' && (
                          <svg className="w-5 h-5 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        <div className="flex flex-col text-left">
                          <span className="text-[15px] leading-tight">{t('setup.step8_opt_remote_title')}</span>
                          <span className="text-[12px] font-normal leading-tight opacity-75">{t('setup.step8_opt_remote_sub')}</span>
                        </div>
                      </button>
                    ) : (
                      <div
                        className="h-[54px] px-4 rounded-xl bg-[#F3F4F6] border border-gray-200 text-gray-400 flex flex-col justify-center items-center opacity-60 cursor-not-allowed min-w-[210px]"
                        title={t('setup.step8_opt_remote_tooltip')}
                      >
                        <span className="text-[15px] font-semibold text-gray-400 leading-tight">{t('setup.step8_opt_remote_title')}</span>
                        <span className="text-[13px] text-gray-400 leading-tight">{t('setup.step8_opt_remote_sub')}</span>
                      </div>
                    )}

                    {/* Option 3: Offline mein roko */}
                    <button
                      type="button"
                      onClick={() => handleRuleToggle(item.category, 'blocked_offline')}
                      className={`h-[54px] px-4 rounded-xl flex items-center gap-2 font-bold text-[16px] cursor-pointer transition-all ${
                        currentChoice === 'blocked_offline'
                          ? 'bg-[#E8F5E9] border-2 border-[#1B8F4A] text-[#1B8F4A]'
                          : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {currentChoice === 'blocked_offline' && (
                        <svg className="w-5 h-5 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span>{t('setup.step8_opt_blocked')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <footer className="w-full pt-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(7)}
            className="h-[60px] px-8 rounded-2xl bg-white border border-gray-300 text-gray-800 flex items-center gap-3 hover:bg-gray-50 transition shadow-sm cursor-pointer"
          >
            <svg className="w-6 h-6 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[18px] font-bold">{btnBack.main}</span>
              {btnBack.sub ? <span className="text-xs text-gray-500 font-normal">{btnBack.sub}</span> : null}
            </div>
          </button>

          <button
            type="button"
            onClick={handleFinishSetup}
            className="h-[60px] px-10 rounded-2xl bg-[#1B8F4A] hover:bg-[#167a3e] text-white flex items-center gap-4 transition shadow-md cursor-pointer active:scale-[0.98]"
          >
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[20px] font-extrabold">{btnFinish.main}</span>
              {btnFinish.sub ? <span className="text-xs text-green-100 font-medium">{btnFinish.sub}</span> : null}
            </div>
          </button>
        </footer>
      </main>
    </div>
  );
};

export default Setup;
