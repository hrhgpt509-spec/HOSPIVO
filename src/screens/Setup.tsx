import React, { useState } from 'react';
import { db, type Shop } from '../db';
import { hashPin, validatePin } from '../logic/pin';
import { addAudit } from '../db/audit';
import {
  DEFAULT_APPROVAL_RULES,
  setApprovalPin,
  type ApprovalActionCategory,
  type ApprovalRuleType,
} from '../logic/approvals';

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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);

  // Step 1: Shop details
  const [shopName, setShopName] = useState('Shree Medical Store');
  const [ownerName, setOwnerName] = useState('Ramesh Sharma');
  const [address, setAddress] = useState('Shop No. 4, Near Civil Hospital Gate, Meerut Cantt, UP - 250001');
  const [phone, setPhone] = useState('98371 44520');
  const [gstNo, setGstNo] = useState('09AAAAA0000A1Z5');
  const [dl1, setDl1] = useState('UP-MRT-20B/8892');
  const [dl2, setDl2] = useState('UP-MRT-21B/7419');
  const [step1Error, setStep1Error] = useState('');

  // Step 2: Mode choice
  const [mode] = useState<'local'>('local');

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
      setStep1Error('Dukaan ka naam likhna zaroori hai (Shop name is required)');
      return;
    }
    if (!ownerName.trim()) {
      setStep1Error('Malik ka naam likhna zaroori hai (Owner name is required)');
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
      if (ownerPin1.length < 6) {
        const next = ownerPin1 + digit;
        setOwnerPin1(next);
        if (next.length === 4) {
          setActiveOwnerPinField(2);
        }
      }
    } else {
      if (ownerPin2.length < 6) {
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
      setOwnerPinError(val1.error || 'Owner PIN 4 se 6 digits ka hona chahiye');
      return;
    }
    if (ownerPin1 !== ownerPin2) {
      setOwnerPinError('PIN match nahi hua');
      return;
    }

    setOwnerPinError('');
    setStep(4);
  };

  // --------------------------------------------------------------------------
  // STEP 4 (STAFF) HANDLERS
  // --------------------------------------------------------------------------
  const handleAddStaff = async () => {
    if (!staffName.trim()) {
      setStaffError('Staff ka naam likhein');
      return;
    }
    const val = validatePin(staffPin, false);
    if (!val.valid) {
      setStaffError(val.error || 'Staff PIN 4 se 6 digits ka hona chahiye');
      return;
    }

    if (staffPin === ownerPin1) {
      setStaffError('Staff PIN Owner PIN se alag hona chahiye');
      return;
    }

    const { hash, salt } = await hashPin(staffPin);
    const newStaff: AddedStaffMember = {
      id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: staffName.trim(),
      plainPin: staffPin,
      pinHash: hash,
      pinSalt: salt,
    };

    setStaffList((prev) => [...prev, newStaff]);
    setStaffName('');
    setStaffPin('');
    setStaffError('');
  };

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
      if (approvalPin1.length < 6) {
        const next = approvalPin1 + digit;
        setApprovalPin1(next);
        if (next.length === 4) {
          setActiveApprovalPinField(2);
        }
      }
    } else {
      if (approvalPin2.length < 6) {
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
    const val = validatePin(approvalPin1, false);
    if (!val.valid) {
      setApprovalPinError(val.error || 'Ijazat PIN 4 se 6 digits ka hona chahiye');
      return;
    }
    if (approvalPin1 !== approvalPin2) {
      setApprovalPinError('PIN match nahi hua');
      return;
    }
    if (approvalPin1 === ownerPin1 || staffList.some((s) => s.plainPin === approvalPin1)) {
      setApprovalPinError('Ijazat PIN Malik ya Staff PIN se alag hona chahiye');
      return;
    }

    setApprovalPinError('');
    setStep(8);
  };

  // --------------------------------------------------------------------------
  // STEP 8 (APPROVAL RULES) TOGGLE
  // --------------------------------------------------------------------------
  const handleRuleToggle = (category: ApprovalActionCategory, ruleChoice: 'local_pin' | 'blocked_offline') => {
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
    const drugLicences = [dl1.trim(), dl2.trim()].filter(Boolean).join(', ');
    const shopRecord: Shop = {
      name: shopName.trim(),
      ownerName: ownerName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      gstNo: gstNo.trim(),
      drugLicenceNos: drugLicences,
      mode,
    };
    await db.shop.add(shopRecord);
    await addAudit('Setup', 'shop_saved', shopName.trim(), 'Shop details saved during initial setup');

    // 2. Save Owner user with hashed PIN (never plain text)
    const { hash: ownerHash, salt: ownerSalt } = await hashPin(ownerPin1);
    await db.users.add({
      id: 'owner',
      name: ownerName.trim(),
      role: 'owner',
      pinHash: ownerHash,
      pinSalt: ownerSalt,
      active: true,
      createdAt: new Date().toISOString(),
    });
    await addAudit('Setup', 'owner_created', ownerName.trim(), 'Owner user registered with hashed PIN');

    // 3. Save any added staff members
    for (const staff of staffList) {
      await db.users.add({
        id: staff.id,
        name: staff.name,
        role: 'cashier',
        pinHash: staff.pinHash,
        pinSalt: staff.pinSalt,
        active: true,
        createdAt: new Date().toISOString(),
      });
      await addAudit('Setup', 'staff_created', staff.name, 'Staff member added with hashed PIN');
    }

    // 4. Save Approval PIN (salted hash only)
    await setApprovalPin(approvalPin1, [ownerPin1, ...staffList.map((s) => s.plainPin)]);

    // 5. Save settings (approval rules, auto-lock minutes, backup folder)
    await db.settings.put({ key: 'approval_rules', value: approvalRules });
    await db.settings.put({ key: 'auto_lock_minutes', value: 5 });
    await db.settings.put({ key: 'backup_folder', value: backupFolder });

    // 6. Audit entry for setup completion
    await addAudit('Setup', 'setup_complete', shopName.trim(), 'Initial setup completed successfully');

    // Done! Proceed to Login
    onComplete();
  };

  // --------------------------------------------------------------------------
  // RENDER STEPPER (8 STEPS)
  // --------------------------------------------------------------------------
  const renderProgress = (currentStep: number, titleHindi: string, titleEnglish: string) => (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[#E8EFEA] pb-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1B8F4A] flex items-center justify-center shadow-md text-white">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div>
            <div className="text-[28px] font-extrabold tracking-tight text-[#1B8F4A] leading-none">Hospivo</div>
            <div className="text-[16px] text-[#5C6E66] font-medium tracking-wide mt-0.5">दवा दुकान POS • Setup Wizard</div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="text-right">
          <div className="text-[22px] font-bold text-[#1A1F1C] leading-tight">
            Step {currentStep} of 8: {titleHindi}
          </div>
          <div className="text-[16px] text-[#5C6E66] font-semibold">
            {titleEnglish}
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

  // ==========================================================================
  // VIEW: STEP 1 (01_Setup_ShopDetails.html)
  // ==========================================================================
  if (step === 1) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-gradient-to-b from-[#EBF7F0] to-[#E3F2E9] select-none">
        <main className="w-full max-w-[1240px] min-h-[836px] bg-white rounded-3xl shadow-[0_12px_40px_rgba(27,143,74,0.08)] border border-[#D5E5DC] flex flex-col justify-between px-8 md:px-12 py-8">
          {renderProgress(1, 'Dukaan ki jaankari', 'Shop details')}

          {step1Error && (
            <div className="mt-2 px-4 py-2 bg-red-100 border border-red-300 text-red-700 rounded-xl font-bold text-sm">
              {step1Error}
            </div>
          )}

          <section className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 my-auto pt-2">
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>Dukaan ka naam <span className="text-red-500">*</span></span>
                  <span className="text-[16px] font-medium text-[#5C6E66]">Shop Name</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.614A2.998 2.998 0 0 0 12 9.349c.89 0 1.71-.387 2.25-1.014.54.627 1.36 1.014 2.25 1.014a3 3 0 0 0 3.75-.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72L4.318 3.44A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l2.19 2.189a3 3 0 0 1-.62 4.72" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder="Jaise: Shree Medical Store"
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">Medical store ka poora board par likha naam likhein</p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>Malik ka naam <span className="text-red-500">*</span></span>
                  <span className="text-[16px] font-medium text-[#5C6E66]">Owner Name</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder="Dukaan malik ya sanchalak ka naam"
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">Bill par aane wala malik ka naam</p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>Pata</span>
                  <span className="text-[16px] font-medium text-[#5C6E66]">Address (2 lines)</span>
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
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full h-[90px] pl-14 pr-4 py-3 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none resize-none leading-snug"
                    placeholder="Shop No. 4, Main Market, Mandi Road..."
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">Customer parchi aur tax invoice par yahi pata chhapega</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>Phone number</span>
                  <span className="text-[16px] font-medium text-[#5C6E66]">Mobile / WhatsApp</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none"
                    placeholder="10-digit mobile number"
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">Grahak ko WhatsApp bill bhejte waqt yahi number dikhega</p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-[#1A1F1C] mb-1.5 flex items-center justify-between">
                  <span>GST number</span>
                  <span className="text-[16px] font-medium text-[#5C6E66]">GSTIN (Optional)</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-[#1B8F4A] pointer-events-none">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={gstNo}
                    onChange={(e) => setGstNo(e.target.value)}
                    className="w-full h-[60px] pl-14 pr-4 text-[18px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none uppercase"
                    placeholder="15-digit GSTIN number"
                  />
                </div>
                <p className="text-[15px] text-[#5C6E66] mt-1">Tax bill aur B2B input tax credit hisaab ke liye</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[17px] font-bold text-[#1A1F1C] mb-1.5 truncate">
                    Drug licence 1
                  </label>
                  <input
                    type="text"
                    value={dl1}
                    onChange={(e) => setDl1(e.target.value)}
                    className="w-full h-[60px] px-4 text-[17px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none uppercase"
                    placeholder="Form 20B"
                  />
                  <p className="text-[14px] text-[#5C6E66] mt-1">Form 20B (Retail DL)</p>
                </div>
                <div>
                  <label className="block text-[17px] font-bold text-[#1A1F1C] mb-1.5 truncate">
                    Drug licence 2
                  </label>
                  <input
                    type="text"
                    value={dl2}
                    onChange={(e) => setDl2(e.target.value)}
                    className="w-full h-[60px] px-4 text-[17px] font-semibold text-[#1A1F1C] bg-[#FBFDFB] border-2 border-[#D2DDD7] rounded-2xl focus:border-[#1B8F4A] focus:outline-none uppercase"
                    placeholder="Form 21B"
                  />
                  <p className="text-[14px] text-[#5C6E66] mt-1">Form 21B (Schedule C/C1)</p>
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
                <div className="text-[22px] font-bold leading-tight">Wapas</div>
                <div className="text-[16px] font-medium leading-none">Back</div>
              </div>
            </button>

            <div className="text-center text-[#5C6E66] text-[16px] font-medium">
              Yeh jaankari aap baad mein dukaan ki settings se badal sakte hain
            </div>

            <button
              type="button"
              onClick={handleStep1Next}
              className="h-[64px] min-w-[240px] px-10 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-between gap-5 shadow-[0_6px_20px_rgba(27,143,74,0.35)] cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="text-left">
                <div className="text-[24px] font-extrabold leading-tight tracking-wide">Aage</div>
                <div className="text-[16px] font-medium text-white/90 leading-none">Next</div>
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
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1280px] min-h-[820px] bg-white rounded-3xl shadow-[0_16px_48px_rgba(27,143,74,0.08)] border border-[#E1E8E4] flex flex-col justify-between p-8 md:p-10">
          {renderProgress(2, 'Aap Hospivo kaise chalana chahte hain?', 'How do you want to run Hospivo?')}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-auto pt-4 pb-4">
            {/* Card 1: Local-only */}
            <div className="relative bg-[#F4FAF6] border-2 border-[#1B8F4A] rounded-2xl p-7 flex flex-col justify-between shadow-[0_8px_24px_rgba(27,143,74,0.12)] cursor-pointer">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#E7F7EC] text-[#1B8F4A] flex items-center justify-center border border-[#BDE7CC]">
                      <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 22V12h6v10" />
                        <rect x="8" y="5" width="8" height="5" rx="1" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-[26px] font-bold text-[#1A1F1C] leading-snug">Sirf Dukaan Mein</h2>
                      <span className="text-[16px] font-semibold text-[#1B8F4A] tracking-wide uppercase">Local-only</span>
                    </div>
                  </div>

                  <div className="w-9 h-9 rounded-full bg-[#1B8F4A] flex items-center justify-center text-white shadow-md shadow-[#1B8F4A]/30">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>

                <ul className="mt-6 space-y-3.5">
                  <li className="flex items-start gap-3 text-[18px] text-[#1A1F1C]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-2 shrink-0"></span>
                    <span className="font-medium">Data sirf is device par rehta hai</span>
                  </li>
                  <li className="flex items-start gap-3 text-[18px] text-[#1A1F1C]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1B8F4A] mt-2 shrink-0"></span>
                    <span className="font-medium">Backup aapke device par</span>
                  </li>
                  <li className="flex items-start gap-3 text-[18px] text-[#1A1F1C]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#9AA5A0] mt-2 shrink-0"></span>
                    <span className="font-normal text-[#4A5550]">Owner mobile par dekh nahi sakta</span>
                  </li>
                  <li className="flex items-start gap-3 text-[18px] text-[#1A1F1C]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#9AA5A0] mt-2 shrink-0"></span>
                    <span className="font-normal text-[#4A5550]">Door se approval nahi</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 bg-[#EBF3FB] border border-[#B8D8F8] rounded-xl p-4 flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-full bg-[#1976D2] text-white flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
                <p className="text-[16px] font-medium text-[#104D8C] leading-snug">
                  Device kho gaya to backup bhi ja sakta hai.
                </p>
              </div>
            </div>

            {/* Card 2: Cloud-enabled (LOCKED with message "Jald aa raha hai") */}
            <div className="relative bg-slate-50/80 border-2 border-slate-200 rounded-2xl p-7 flex flex-col justify-between opacity-80 cursor-not-allowed">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200">
                      <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-[26px] font-bold text-slate-700 leading-snug">Cloud ke Saath</h2>
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold uppercase tracking-wider">
                          Jald aa raha hai
                        </span>
                      </div>
                      <span className="text-[16px] font-semibold text-slate-500 tracking-wide uppercase">Cloud-enabled</span>
                    </div>
                  </div>

                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                <ul className="mt-6 space-y-3.5">
                  <li className="flex items-start gap-3 text-[18px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>
                    <span className="font-medium">Dukaan offline bhi chalegi</span>
                  </li>
                  <li className="flex items-start gap-3 text-[18px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>
                    <span className="font-medium">Internet aane par data sync hoga</span>
                  </li>
                  <li className="flex items-start gap-3 text-[18px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>
                    <span className="font-medium">Owner mobile ya web par report dekhe</span>
                  </li>
                  <li className="flex items-start gap-3 text-[18px] text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 mt-2 shrink-0"></span>
                    <span className="font-medium">Door se approval de sakte hain</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <svg className="w-6 h-6 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-[15px] font-medium text-slate-600 leading-snug">
                  Phase 8 mein Cloud mode chalu hoga. Abhi ke liye Local-only mode surakshit hai.
                </p>
              </div>
            </div>
          </div>

          <footer className="w-full pt-6 border-t border-[#EBEFEA] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-16 px-8 rounded-2xl bg-[#EBEFEA] hover:bg-[#DEE5E0] text-[#1A1F1C] font-bold flex items-center gap-3 cursor-pointer"
            >
              <svg className="w-6 h-6 text-[#4A5550]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <div className="text-left flex flex-col justify-center">
                <span className="text-[20px] font-bold leading-tight text-[#1A1F1C]">Wapas</span>
                <span className="text-[16px] font-normal leading-tight text-[#66766F]">Back</span>
              </div>
            </button>

            <p className="text-[16px] font-medium text-[#66766F] text-center">
              Yeh chunav aap baad mein dukaan ki settings se badal sakte hain
            </p>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="h-16 px-10 rounded-2xl bg-[#1B8F4A] hover:bg-[#16783E] text-white font-bold flex items-center gap-4 shadow-lg shadow-[#1B8F4A]/30 cursor-pointer"
            >
              <div className="text-right flex flex-col justify-center">
                <span className="text-[22px] font-extrabold leading-tight">Aage</span>
                <span className="text-[16px] font-normal leading-tight text-[#D4F3DF]">Next</span>
              </div>
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </footer>
        </main>
      </div>
    );
  }

  // ==========================================================================
  // VIEW: STEP 3 (03_Setup_OwnerPIN.html)
  // ==========================================================================
  if (step === 3) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1240px] min-h-[852px] bg-white rounded-3xl shadow-[0_16px_40px_rgba(0,107,51,0.08)] border border-slate-200 flex flex-col justify-between p-8">
          <div>
            {renderProgress(3, 'Owner PIN banao', 'Create Owner PIN')}
            <div className="flex items-center gap-2 pt-3">
              <svg className="w-6 h-6 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6-5a3 3 0 013 3v2H9V6a3 3 0 013-3zm6 15H6V10h12v10z" />
              </svg>
              <span className="text-[18px] text-[#1A1F1C] font-medium">Ye PIN sirf malik ko pata hona chahiye (4 se 6 digits).</span>
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
                  <span className="text-[20px] font-bold text-[#1B8F4A]">PIN likhein</span>
                  <span className="text-[14px] font-bold px-2 py-0.5 rounded-md bg-[#8ef9a7] text-[#005226]">
                    Kadam 1
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
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
                  <span className="text-[20px] font-bold text-[#1A1F1C]">PIN dobara likhein</span>
                  <span className="text-[14px] font-medium text-slate-500">Kadam 2</span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
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
                <span>{showOwnerPin ? 'PIN chupao' : 'PIN dikhao'}</span>
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
                <span className="text-[18px] font-bold text-slate-700 leading-none">Mitao</span>
                <span className="text-xs font-semibold text-slate-500 mt-1 leading-none">Clear</span>
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
                <span className="text-[20px] font-bold leading-tight">Wapas</span>
                <span className="text-[16px] font-normal leading-tight text-slate-500">Back</span>
              </div>
            </button>

            <div className="text-[16px] font-medium text-slate-500">
              Yeh PIN aap baad mein settings se badal sakte hain
            </div>

            <button
              type="button"
              onClick={handleStep3Next}
              className="h-16 min-w-[200px] px-8 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white font-bold flex items-center justify-center gap-4 shadow-md cursor-pointer transition-all"
            >
              <div className="text-left flex flex-col justify-center">
                <span className="text-[22px] font-extrabold leading-tight">Aage</span>
                <span className="text-[16px] font-normal leading-tight text-emerald-100">Next</span>
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
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1240px] min-h-[820px] bg-white rounded-3xl shadow-xl border border-slate-200 flex flex-col justify-between p-8">
          {renderProgress(4, 'Staff jodo', 'Add staff')}

          <div className="grid grid-cols-12 gap-8 items-start my-auto py-4">
            <div className="col-span-12 lg:col-span-7 flex flex-col gap-4 pr-0 lg:pr-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[18px] font-bold text-[#1A1F1C] flex items-center gap-2">
                  Staff ka naam
                  <span className="text-[16px] font-normal text-slate-500">(Staff Name)</span>
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="e.g. Raju Kumar"
                    className="w-full h-[62px] pl-14 pr-4 rounded-2xl bg-slate-50 text-[#1A1F1C] font-semibold text-lg border-2 border-slate-200 focus:border-[#1B8F4A] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[18px] font-bold text-[#1A1F1C] flex items-center gap-2">
                  Staff PIN
                  <span className="text-[16px] font-normal text-slate-500">(4-6 Digit Secret Code)</span>
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
                    maxLength={6}
                    value={staffPin}
                    onChange={(e) => setStaffPin(e.target.value)}
                    placeholder="••••"
                    className="w-full h-[62px] pl-14 pr-4 rounded-2xl bg-slate-50 text-[#1A1F1C] font-mono text-2xl tracking-[0.3em] border-2 border-slate-200 focus:border-[#1B8F4A] focus:outline-none"
                  />
                </div>
                <span className="text-sm text-slate-500 pl-1">
                  Billing counter login ke liye 4-6 digit PIN
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
                  <span className="text-[20px] font-bold">Staff Jodo</span>
                  <span className="text-xs text-emerald-100 font-medium">Add</span>
                </div>
              </button>

              <div className="w-full rounded-2xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3 mt-1">
                <svg className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                <p className="text-[16px] text-blue-900 leading-snug">
                  Counter staff sirf bikri screen dekhega. Munafa aur kharid daam nahi.
                </p>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-5 flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-3xl p-5 min-h-[360px]">
              <div className="flex items-center justify-between px-1">
                <span className="text-[22px] font-bold text-[#1A1F1C]">
                  Jode gaye staff ({staffList.length})
                </span>
                <span className="text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-bold">
                  {staffList.length} Added
                </span>
              </div>

              {staffList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <svg className="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  </svg>
                  <p className="text-base font-medium">Abhi koi staff nahi joda gaya hai.</p>
                  <p className="text-sm">Aap baad mein bhi staff jod sakte hain.</p>
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
                          <span className="text-xs text-slate-500 font-mono">PIN: ••••</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          Counter staff
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStaff(st.id)}
                          className="text-red-600 hover:bg-red-50 p-1.5 rounded-xl transition-all cursor-pointer"
                          title="Remove staff"
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
                <span>Staff pin se sirf sale bill banega, khata band nahi hoga.</span>
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
                  <span className="text-[18px] font-bold block">Wapas</span>
                  <span className="text-xs text-slate-500 font-normal">Back</span>
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
                  <span className="text-[18px] font-bold block">Baad mein karunga</span>
                  <span className="text-xs text-slate-500 font-normal">Skip for now</span>
                </div>
              </button>
            </div>

            <p className="hidden md:block text-[15px] font-medium text-slate-500 text-center max-w-[420px]">
              Yeh staff aap baad mein dukaan ki settings se bhi badal sakte hain
            </p>

            <button
              type="button"
              onClick={() => setStep(5)}
              className="h-[60px] min-w-[170px] px-8 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white shadow-md flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="text-right leading-none">
                <span className="text-[20px] font-extrabold block">Aage</span>
                <span className="text-xs text-emerald-100 font-normal">Next</span>
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
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
        <main className="w-full max-w-[1160px] min-h-[740px] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between p-8 md:p-10">
          {renderProgress(5, 'Medicine list', 'Import medicines')}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-auto py-4">
            {/* Option 1: File se Jodo (LOCKED with "Jald aa raha hai") */}
            <div className="bg-slate-50 border-2 border-slate-200 h-[360px] p-7 rounded-2xl flex flex-col justify-between items-center text-center opacity-75 cursor-not-allowed">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-[24px] font-bold text-slate-700">File se Jodo</h2>
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold uppercase tracking-wider">
                    Jald aa raha hai
                  </span>
                </div>
                <span className="text-[16px] text-slate-500 font-medium">Import from file</span>
              </div>

              <div className="w-full max-w-[380px] bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-2.5 text-slate-500">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                <p className="text-[16px] text-slate-700 font-semibold">
                  Excel, CSV, ya distributor bill file yahan dalein
                </p>
                <span className="text-[14px] text-slate-500 mt-1">
                  Supports .xlsx, .csv, Marg &amp; Vyapar backups
                </span>
              </div>

              <div className="w-full max-w-[320px] h-[58px] rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center gap-3 px-6">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
                <div className="flex flex-col text-left">
                  <span className="text-[17px] font-bold leading-tight">File chuniye</span>
                  <span className="text-[13px] opacity-80 leading-tight">Choose file</span>
                </div>
              </div>
            </div>

            {/* Option 2: Khaali Shuru Karo (Start Empty - ACTIVE) */}
            <div
              onClick={() => setStep(6)}
              className="bg-[#F4FAF6] border-2 border-[#1B8F4A] h-[360px] p-7 rounded-2xl flex flex-col justify-between items-center text-center cursor-pointer shadow-md shadow-[#1B8F4A]/10 hover:brightness-105 transition-all"
            >
              <div className="flex flex-col items-center">
                <h2 className="text-[24px] font-bold text-[#1A1F1C]">Khaali Shuru Karo</h2>
                <span className="text-[16px] text-[#1B8F4A] font-semibold">Start empty</span>
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
                    <span>Bina purani list ke shuru karein</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[#1A1F1C] text-[16px] font-medium">
                    <svg className="w-5 h-5 text-[#1B8F4A]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Billing ke waqt nayi dawai judti jayegi</span>
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
                  <span className="text-[18px] font-bold leading-tight">Fresh shuru karein</span>
                  <span className="text-[13px] text-emerald-100 leading-tight">Blank catalog</span>
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
                <span className="text-[18px] font-bold">Wapas</span>
                <span className="text-xs text-slate-500 font-normal">Back</span>
              </div>
            </button>

            <div className="flex items-center gap-2 text-center text-slate-500 text-[15px] font-medium max-w-[500px]">
              <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <span>Yeh chunav aap baad mein dukaan ki settings se bhi badal sakte hain</span>
            </div>

            <button
              type="button"
              onClick={() => setStep(6)}
              className="h-[58px] min-w-[170px] px-7 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-center gap-3 shadow-md cursor-pointer transition-all active:scale-[0.98]"
            >
              <div className="flex flex-col text-right leading-tight">
                <span className="text-[18px] font-bold">Aage</span>
                <span className="text-xs text-emerald-100 font-normal">Next</span>
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
          {renderProgress(6, 'Backup', 'Data backup & safety')}

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
                  Roz ek backup file banegi taaki dukaan ka data surakshit rahe.
                </h1>
                <p className="text-[16px] text-slate-500 font-medium">
                  A daily backup file will be created to keep your shop data safe.
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
                  <span className="text-[17px] font-bold text-blue-950">Backup aapke device par rehta hai.</span>
                  <span className="text-[14px] text-blue-700">Saved locally on this computer / tablet</span>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="w-11 h-11 rounded-xl bg-amber-600 flex items-center justify-center text-white shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-[17px] font-bold text-amber-950">Device kho gaya to sirf device wala backup bhi kho sakta hai.</span>
                  <span className="text-[14px] text-amber-700">Keep a copy on pen drive or cloud if possible</span>
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
                  <span className="text-[17px] font-bold text-[#1A1F1C]">Backup folder:</span>
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
                <span>Folder badlo</span>
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
                  <span className="text-[17px] font-bold text-[#1A1F1C]">Daily Auto-Backup Permission</span>
                  <span className="text-[15px] text-slate-500">Storage access zururi hai taaki browser data na mitaye</span>
                </div>
              </div>

              {storageStatus === 'granted' ? (
                <div className="h-14 px-5 rounded-xl bg-emerald-100 text-[#005226] border border-[#1B8F4A] flex items-center gap-2.5 font-bold">
                  <svg className="w-6 h-6 text-[#1B8F4A]" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-[17px]">Ijazat Mil Gayi</span>
                    <span className="text-xs text-emerald-800 font-normal">Storage surakshit hai</span>
                  </div>
                </div>
              ) : storageStatus === 'denied' ? (
                <button
                  type="button"
                  onClick={handleRequestStoragePermission}
                  className="h-14 px-5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-2.5 font-bold cursor-pointer"
                >
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-[16px]">Ijazat nahi mili (Dobara try karein)</span>
                    <span className="text-xs text-amber-800 font-normal">Storage permission retry</span>
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
                    <span className="text-[17px]">Ijazat Do</span>
                    <span className="text-xs text-emerald-100 font-normal">Allow Storage</span>
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
                <span className="text-[18px] font-bold">Wapas</span>
                <span className="text-xs text-slate-500 font-normal">Back</span>
              </div>
            </button>

            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Backup settings aap dashboard mein jaakar kabhi bhi badal sakte hain</span>
            </div>

            <button
              type="button"
              onClick={() => setStep(7)}
              className="h-14 min-w-[190px] px-6 rounded-xl bg-[#1B8F4A] hover:bg-[#16733B] text-white flex items-center justify-center gap-3 cursor-pointer font-bold shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex flex-col text-right leading-tight">
                <span className="text-[18px] font-bold">Aage</span>
                <span className="text-xs text-emerald-100 font-normal">Next Step</span>
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
            {renderProgress(7, 'Ijazat PIN banao', 'Create Approval PIN')}
            <div className="flex items-center gap-2 pt-3">
              <svg className="w-6 h-6 text-[#1B8F4A]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6-5a3 3 0 013 3v2H9V6a3 3 0 013-3zm6 15H6V10h12v10z" />
              </svg>
              <span className="text-[18px] text-[#1A1F1C] font-medium">
                Special kaam (discount, bill hatana) ki ijazat ke liye (4 se 6 digits).
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
                  <span className="text-[20px] font-bold text-[#1B8F4A]">PIN likhein</span>
                  <span className="text-[14px] font-bold px-2 py-0.5 rounded-md bg-[#8ef9a7] text-[#005226]">
                    Kadam 1
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
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
                  <span className="text-[20px] font-bold text-[#1A1F1C]">PIN dobara likhein</span>
                  <span className="text-[14px] font-medium text-slate-500">Kadam 2</span>
                </div>
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
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
                <span>{showApprovalPin ? 'PIN chupao' : 'PIN dikhao'}</span>
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
                <span className="text-[18px] font-bold text-slate-700 leading-none">Mitao</span>
                <span className="text-xs font-semibold text-slate-500 mt-1 leading-none">Clear</span>
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
                <span className="text-[20px] font-bold leading-tight">Wapas</span>
                <span className="text-[16px] font-normal leading-tight text-slate-500">Back</span>
              </div>
            </button>

            <div className="text-[16px] font-medium text-slate-500">
              Yeh PIN aap baad mein settings se badal sakte hain
            </div>

            <button
              type="button"
              onClick={handleStep7Next}
              className="h-16 min-w-[200px] px-8 rounded-2xl bg-[#1B8F4A] hover:bg-[#16733B] text-white font-bold flex items-center justify-center gap-4 shadow-md cursor-pointer transition-all"
            >
              <div className="text-left flex flex-col justify-center">
                <span className="text-[22px] font-extrabold leading-tight">Aage</span>
                <span className="text-[16px] font-normal leading-tight text-emerald-100">Next</span>
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
    { category: 'delete_or_correct_bill', title: 'Bill hatana ya badalna' },
    { category: 'price_change', title: 'Daam badalna' },
    { category: 'discount_above_limit', title: 'Bada discount' },
    { category: 'stock_correction', title: 'Stock sudhaar' },
    { category: 'cash_mismatch', title: 'Din Band mein fark' },
  ];

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-6 md:p-8 bg-[#F4F6F5] select-none">
      <main className="w-full max-w-[1160px] min-h-[820px] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between p-8 md:p-10">
        <div>
          {renderProgress(8, 'Special kaam ki ijazat', 'Approval rules')}

          <div className="mt-3 mb-3">
            <p className="text-[18px] text-gray-700 font-medium">
              Internet na ho to kya hoga, aap chuniye.
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
              Door se approval ke liye Cloud mode chahiye.
            </span>
          </div>

          {/* 5 Rows */}
          <div className="space-y-2.5">
            {approvalItems.map((item) => {
              const currentChoice = approvalRules[item.category];

              return (
                <div
                  key={item.category}
                  className="bg-white rounded-2xl px-5 h-[70px] flex items-center justify-between shadow-sm border border-gray-200"
                >
                  <div className="w-[300px]">
                    <span className="text-[18px] font-bold text-gray-900">{item.title}</span>
                  </div>

                  {/* 3-option Segmented Selector */}
                  <div className="flex items-center gap-2">
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
                      <span>Ijazat PIN (yahin)</span>
                    </button>

                    {/* Option 2: Door se approval (Disabled in Local-only) */}
                    <div
                      className="h-[54px] px-4 rounded-xl bg-[#F3F4F6] border border-gray-200 text-gray-400 flex flex-col justify-center items-center opacity-60 cursor-not-allowed min-w-[210px]"
                      title="Remote approval is locked in Local-only mode"
                    >
                      <span className="text-[15px] font-semibold text-gray-400 leading-tight">Door se approval</span>
                      <span className="text-[13px] text-gray-400 leading-tight">Cloud mode mein hi</span>
                    </div>

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
                      <span>Offline mein roko</span>
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
              <span className="text-[18px] font-bold">Wapas</span>
              <span className="text-xs text-gray-500 font-normal">Back</span>
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
              <span className="text-[20px] font-extrabold">Setup Poora Karo</span>
              <span className="text-xs text-green-100 font-medium">Finish setup</span>
            </div>
          </button>
        </footer>
      </main>
    </div>
  );
};

export default Setup;
