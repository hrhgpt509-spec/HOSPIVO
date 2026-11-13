import React, { useState, useEffect, useRef } from 'react';
import { db, type Medicine, type Shop, type DBUser, type ScheduleType } from '../db';
import { shortCodeFor } from '../logic/stock';
import { formatField, textFieldProps } from '../logic/format';
import {
  validateMedicineForm,
  checkDuplicateMedicine,
  computeMedicineChanges,
  compressImageToDataUrl,
  minStockUnitsToPacks,
  alertPacksToMinUnits,
  type MedicineFormData,
  type MedicineFormErrors,
} from '../logic/medicineForm';
import { useTranslation, tButton, shouldShowSub } from '../i18n';
import { formatRupees } from '../logic/money';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { triggerFeedback } from '../logic/feedback';
import { FullscreenButton } from '../components/FullscreenButton';
import { useShop } from '../logic/useShop';
import {
  BUILT_IN_PRODUCT_TYPES,
  formatProductType,
  getActiveProductTypes,
  addProductType,
  validateProductTypeName,
  type ProductType,
  type BuiltInProductType,
} from '../logic/productTypes';

interface OwnerMedicineFormProps {
  medicineId?: number; // if present, editing existing medicine
  onClose: () => void;
  onReturnHome: () => void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const GST_OPTIONS = [0, 5, 12, 18];

export const OwnerMedicineForm: React.FC<OwnerMedicineFormProps> = ({
  medicineId,
  onClose,
  onReturnHome,
  currentUser,
  shop,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Existing medicines in DB for uniqueness and duplicate checks
  const [existingMedicines, setExistingMedicines] = useState<Medicine[]>([]);
  const [originalMedicine, setOriginalMedicine] = useState<Medicine | null>(null);

  // Form State
  const [formData, setFormData] = useState<MedicineFormData>({
    name: '',
    strength: '',
    form: 'Tablet',
    salt: '',
    company: '',
    gstPercent: null,
    hsn: '',
    mrpRupees: '',
    unitsPerPack: '10',
    shortCode: '',
    barcode: '',
    shelf: '',
    scheduleType: 'none',
    minStockUnits: '',
    packPhoto: '',
  });

  const [errors, setErrors] = useState<MedicineFormErrors>({});
  const [isShortCodeCustomized, setIsShortCodeCustomized] = useState(false);
  const [isEditingShortCode, setIsEditingShortCode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Discard / leave confirmation dialog
  const [confirmLeaveTarget, setConfirmLeaveTarget] = useState<'back' | 'home' | null>(null);

  // Duplicate Warning State (Rule 5)
  const [duplicateMatches, setDuplicateMatches] = useState<Medicine[]>([]);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Custom Product Types State
  const [customProductTypes, setCustomProductTypes] = useState<ProductType[]>([]);
  const [isAddTypeModalOpen, setIsAddTypeModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeError, setNewTypeError] = useState('');
  const [previousSelectedForm, setPreviousSelectedForm] = useState(formData.form);

  const { name: hookShopName, mode: hookMode, gstNo: hookGstNo } = useShop();
  const shopName = shop?.name || hookShopName || '';
  const currentMode = shop?.mode || hookMode;
  const currentGst = shop?.gstNo || hookGstNo || '';
  const modeLabel = currentMode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const displayUserName = currentUser?.name || t<string>('common.role_owner');
  const auditWho = currentUser?.name || 'Owner';
  const isEditMode = Boolean(medicineId && medicineId > 0);

  // Buttons
  const returnHomeBtn = tButton('home.return_home_btn');
  const btnBack = tButton('common.btn_back');
  const btnSave = isEditMode
    ? tButton('medicine_form.btn_update')
    : tButton('medicine_form.btn_save');

  // Load existing medicines and medicine to edit
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const allMeds = await db.medicines.toArray();
        const types = await getActiveProductTypes();
        if (!isMounted) return;
        setExistingMedicines(allMeds);
        setCustomProductTypes(types);

        if (medicineId) {
          const med = await db.medicines.get(medicineId);
          if (med && isMounted) {
            setOriginalMedicine(med);
            setFormData({
              name: med.name || '',
              strength: med.strength || '',
              form: med.form || 'Tablet',
              salt: med.salt || '',
              company: med.company || '',
              gstPercent: med.gstPercent !== undefined ? med.gstPercent : null,
              hsn: med.hsn || '',
              mrpRupees: (med.mrpPaise / 100).toFixed(2),
              unitsPerPack: String(med.unitsPerPack || 1),
              shortCode: med.shortCode || '',
              barcode: med.barcode || '',
              shelf: med.shelf || '',
              scheduleType: med.scheduleType || 'none',
              minStockUnits: med.minStockUnits && med.minStockUnits > 0
                ? String(minStockUnitsToPacks(med.minStockUnits, med.unitsPerPack))
                : '',
              packPhoto: med.packPhoto || '',
            });
            setIsShortCodeCustomized(true);
          }
        }
      } catch (err) {
        console.error('Failed to load medicines in form:', err);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [medicineId]);

  // Generate automatic short code when medicine name changes
  const handleNameChange = async (rawVal: string) => {
    const val = formatField('name', rawVal);
    setIsDirty(true);

    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }

    setFormData((prev) => ({ ...prev, name: val }));

    // Generate short code if not customized and name is provided
    if (!isShortCodeCustomized && val.trim().length > 0) {
      try {
        const generated = await shortCodeFor(val);
        setFormData((prev) => ({ ...prev, shortCode: generated }));
      } catch (err) {
        console.error('Failed to generate short code:', err);
      }
    }
  };

  // Keyboard shortcut Ctrl + S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveAttempt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Handlers for going back or home with dirty check
  const handleBackClick = () => {
    if (isDirty) {
      setConfirmLeaveTarget('back');
    } else {
      onClose();
    }
  };

  const handleHomeClick = () => {
    if (isDirty) {
      setConfirmLeaveTarget('home');
    } else {
      onReturnHome();
    }
  };

  const handleConfirmLeave = () => {
    const target = confirmLeaveTarget;
    setConfirmLeaveTarget(null);
    if (target === 'back') {
      onClose();
    } else if (target === 'home') {
      onReturnHome();
    }
  };

  // Photo upload and compression handler (Rule 7)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressImageToDataUrl(file);
      setFormData((prev) => ({ ...prev, packPhoto: compressedDataUrl }));
      setIsDirty(true);
    } catch (err) {
      console.error('Failed to compress image:', err);
    }
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, packPhoto: '' }));
    setIsDirty(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Save attempt: validate form, then check duplicates if creating new
  const handleSaveAttempt = async () => {
    const validationErrors = validateMedicineForm(formData, existingMedicines, medicineId);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      triggerFeedback('error', t('errors.generic_error'), t('medicine_form.err_name_required'));
      return;
    }

    setErrors({});

    // Rule 5: Duplicate check for NEW medicine
    if (!isEditMode) {
      const duplicates = await checkDuplicateMedicine(
        formData.name,
        formData.strength,
        formData.company
      );
      if (duplicates.length > 0) {
        setDuplicateMatches(duplicates);
        setIsDuplicateModalOpen(true);
        return;
      }
    }

    // Execute save directly
    await executeSaveMedicine();
  };

  // Save medicine to Dexie database and record audit log entry
  const executeSaveMedicine = async () => {
    setIsSubmitting(true);
    try {
      const mrpPaise = Math.round(parseFloat(formData.mrpRupees.trim()) * 100);
      const unitsPerPack = parseInt(formData.unitsPerPack.trim(), 10) || 1;
      const minStockUnits = alertPacksToMinUnits(formData.minStockUnits, unitsPerPack);
      const gstPercent = formData.gstPercent !== null ? formData.gstPercent : 0;

      const formattedName = formatField('name', formData.name.trim());
      const formattedStrength = formatField('free', formData.strength.trim());
      const formattedSalt = formatField('name', formData.salt.trim());
      const formattedCompany = formatField('name', formData.company.trim());
      const formattedHsn = formatField('code', formData.hsn.trim());
      const formattedShortCode = formatField('code', formData.shortCode.trim());
      const formattedBarcode = formatField('code', formData.barcode.trim());
      const formattedShelf = formatField('name', formData.shelf.trim());

      if (isEditMode && medicineId && originalMedicine) {
        // Update existing medicine
        const updatedFields: Partial<Medicine> = {
          name: formattedName,
          strength: formattedStrength,
          form: formData.form,
          salt: formattedSalt,
          company: formattedCompany,
          gstPercent,
          hsn: formattedHsn,
          mrpPaise,
          unitsPerPack,
          shortCode: formattedShortCode,
          barcode: formattedBarcode,
          shelf: formattedShelf,
          scheduleType: formData.scheduleType,
          minStockUnits,
          packPhoto: formData.packPhoto || undefined,
        };

        const changes = computeMedicineChanges(originalMedicine, updatedFields);
        await db.medicines.update(medicineId, updatedFields);

        // Rule 9: Audit log entry for medicine_edited
        await db.auditLog.add({
          timestamp: new Date().toISOString(),
          who: auditWho,
          action: 'medicine_edited',
          record: `Medicine #${medicineId}: ${formattedName}`,
          details: JSON.stringify(changes),
        });

        triggerFeedback('success', t('common.saved_badge'), formattedName);
      } else {
        // Create new medicine
        const newMedicine: Medicine = {
          name: formattedName,
          strength: formattedStrength,
          form: formData.form,
          salt: formattedSalt,
          company: formattedCompany,
          gstPercent,
          hsn: formattedHsn,
          mrpPaise,
          unitsPerPack,
          shortCode: formattedShortCode,
          barcode: formattedBarcode,
          shelf: formattedShelf,
          scheduleType: formData.scheduleType,
          minStockUnits,
          packPhoto: formData.packPhoto || undefined,
          active: true,
          createdAt: new Date().toISOString(),
        };

        const newId = await db.medicines.add(newMedicine);

        // Rule 9: Audit log entry for medicine_created
        await db.auditLog.add({
          timestamp: new Date().toISOString(),
          who: auditWho,
          action: 'medicine_created',
          record: `Medicine #${newId}: ${formData.name.trim()}`,
          details: JSON.stringify({
            name: newMedicine.name,
            strength: newMedicine.strength,
            form: newMedicine.form,
            mrpPaise: newMedicine.mrpPaise,
            unitsPerPack: newMedicine.unitsPerPack,
            shortCode: newMedicine.shortCode,
          }),
        });

        triggerFeedback('success', t('common.saved_badge'), formData.name.trim());
      }

      setIsDirty(false);
      onClose();
    } catch (err) {
      console.error('Failed to save medicine:', err);
      triggerFeedback('error', t('errors.generic_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-canvas text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      
      {/* 1. Header (Matching 38b) */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 flex items-center justify-between">
          {/* Brand + Shop + Mode */}
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xl md:text-2xl font-black tracking-tight text-primary uppercase">
              HOSPIVO
            </span>
            <div className="hidden sm:block h-6 w-[2px] bg-outline-variant" />
            <span className="hidden sm:inline text-lg md:text-xl font-bold text-on-surface">
              {shopName}
            </span>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low text-xs font-medium text-on-surface-variant">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span>{modeLabel}</span>
            </div>
          </div>

          {/* Right: Home + Theme Switch + User */}
          <div className="flex items-center gap-3 md:gap-4">
            <button
              type="button"
              onClick={handleHomeClick}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary hover:bg-[#088643] text-on-primary font-bold shadow-sm cursor-pointer transition-all active:translate-y-[1px]"
            >
              <svg className="w-5 h-5 text-on-primary stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-sm font-bold leading-none">{returnHomeBtn.main}</span>
                {returnHomeBtn.sub ? (
                  <span className="text-[11px] text-emerald-100 font-normal leading-none mt-0.5">
                    {returnHomeBtn.sub}
                  </span>
                ) : null}
              </div>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                aria-label={t('common.toggle_theme')}
                onClick={onToggleTheme}
                className="w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant"
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            )}

            <FullscreenButton className="w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer border border-outline-variant" />

            <div className="inline-flex items-center gap-2 pl-3 pr-2 py-1 rounded-full bg-surface-container-low border border-outline-variant">
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold leading-tight text-on-surface">{displayUserName}</span>
                <span className="text-[10px] text-outline font-medium leading-none">({currentUser?.role === 'cashier' ? t('common.role_cashier') : t('common.role_owner')})</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Canvas */}
      <main className="w-full pt-16 flex-1 flex flex-col justify-between max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="flex flex-col w-full h-[calc(100vh-64px-44px)] overflow-hidden p-2 select-none justify-between">
          
          {/* Top Title & GST Compliant Badge */}
          <div className="flex items-center justify-between gap-4 mb-2 shrink-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl md:text-3xl font-extrabold text-on-surface tracking-tight">
                {isEditMode ? t('medicine_form.title_edit') : t('medicine_form.title_add')}
              </h1>
              {shouldShowSub(
                isEditMode ? t('medicine_form.title_edit') : t('medicine_form.title_add'),
                isEditMode ? t('medicine_form.sub_edit') : t('medicine_form.sub_add')
              ) && (
                <span className="text-sm font-medium text-outline">
                  {isEditMode ? t('medicine_form.sub_edit') : t('medicine_form.sub_add')}
                </span>
              )}
            </div>

            {/* GST Compliant Tag */}
            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded-full text-on-surface-variant text-xs font-semibold border border-outline-variant">
              <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
              <span>{t('medicine_form.gst_compliant_tag')}</span>
            </div>
          </div>

          {/* Main Split 2-Column Form Canvas (Matching 38b grid) */}
          <form
            className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 min-h-0 bg-surface-container-lowest rounded-2xl p-4 md:p-6 shadow-sm border border-outline-variant overflow-y-auto"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAttempt();
            }}
          >
            {/* Left Column (Items 1 - 8) */}
            <div className="flex flex-col justify-between h-full space-y-2">
              
              {/* 1. Dawai Ka Naam (Required) */}
              <div className="flex flex-col">
                <div className="flex justify-between items-baseline mb-1">
                  <label className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1">
                    {t('medicine_form.label_name')}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_name')}
                    </span>
                  </label>
                  <span className="text-xs font-bold text-[#ba1a1a] dark:text-red-400">
                    {t('medicine_form.req_badge')}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    {...textFieldProps('name', formData.name, handleNameChange)}
                    placeholder={t('medicine_form.placeholder_name')}
                    autoFocus={!isEditMode}
                    className={`w-full h-12 px-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 ${
                      errors.name ? 'ring-2 ring-red-500' : 'focus:ring-[#006B33]'
                    } outline-none transition-all border border-slate-200 dark:border-gray-700`}
                  />
                  {errors.name && (
                    <span className="absolute right-3 text-red-500 text-lg font-bold">!</span>
                  )}
                </div>
                {errors.name && (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">
                    {t('medicine_form.err_name_required')}
                  </span>
                )}
              </div>

              {/* 2 & 3: Strength and Form (Side by Side) */}
              <div className="grid grid-cols-2 gap-3">
                {/* 2. Strength */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_strength')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_strength')}
                    </span>
                  </label>
                  <input
                    type="text"
                    {...textFieldProps('free', formData.strength, (val) => {
                      setFormData((prev) => ({ ...prev, strength: val }));
                      setIsDirty(true);
                    })}
                    placeholder={t('medicine_form.placeholder_strength')}
                    className="w-full h-12 px-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none transition-all border border-slate-200 dark:border-gray-700"
                  />
                </div>

                {/* 3. Form */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_form')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_form')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.form}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__add_new__') {
                          setPreviousSelectedForm(formData.form);
                          setNewTypeName('');
                          setNewTypeError('');
                          setIsAddTypeModalOpen(true);
                        } else {
                          setFormData((prev) => ({ ...prev, form: val }));
                          setIsDirty(true);
                        }
                      }}
                      className="w-full h-12 px-3.5 pr-8 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none appearance-none transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
                    >
                      {BUILT_IN_PRODUCT_TYPES.map((f) => (
                        <option key={f} value={f}>
                          {formatProductType(f, t)}
                        </option>
                      ))}
                      {customProductTypes.map((pt) => (
                        <option key={pt.id || pt.name} value={pt.name}>
                          {pt.name}
                        </option>
                      ))}
                      {!BUILT_IN_PRODUCT_TYPES.includes(formData.form as BuiltInProductType) &&
                        !customProductTypes.some((pt) => pt.name === formData.form) &&
                        formData.form && (
                          <option key={formData.form} value={formData.form}>
                            {formData.form}
                          </option>
                        )}
                      <option value="__add_new__">
                        {t('medicine_form.add_new_type')}
                      </option>
                    </select>
                    <svg className="w-5 h-5 absolute right-3 top-3.5 pointer-events-none text-slate-500 dark:text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 4. Namak (Salt) */}
              <div className="flex flex-col">
                <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  {t('medicine_form.label_salt')}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                    {t('medicine_form.sub_salt')}
                  </span>
                </label>
                <input
                  type="text"
                  {...textFieldProps('name', formData.salt, (val) => {
                    setFormData((prev) => ({ ...prev, salt: val }));
                    setIsDirty(true);
                  })}
                  placeholder={t('medicine_form.placeholder_salt')}
                  className="w-full h-12 px-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none transition-all border border-slate-200 dark:border-gray-700"
                />
              </div>

              {/* 5. Company */}
              <div className="flex flex-col">
                <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  {t('medicine_form.label_company')}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                    {t('medicine_form.sub_company')}
                  </span>
                </label>
                <input
                  type="text"
                  {...textFieldProps('name', formData.company, (val) => {
                    setFormData((prev) => ({ ...prev, company: val }));
                    setIsDirty(true);
                  })}
                  placeholder={t('medicine_form.placeholder_company')}
                  className="w-full h-12 px-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none transition-all border border-slate-200 dark:border-gray-700"
                />
              </div>

              {/* 6, 7 & 8: GST, HSN, MRP Grid */}
              <div className="grid grid-cols-3 gap-3">
                {/* 6. GST (Rule 6: no default, options 0%, 5%, 12%, 18%) */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_gst')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_gst')}
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.gstPercent !== null ? String(formData.gstPercent) : ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setFormData((prev) => ({ ...prev, gstPercent: val }));
                        setIsDirty(true);
                      }}
                      className="w-full h-12 px-3 pr-7 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none appearance-none transition-all cursor-pointer border border-slate-200 dark:border-gray-700"
                    >
                      <option value="">{t('medicine_form.gst_select_placeholder')}</option>
                      {GST_OPTIONS.map((pct) => (
                        <option key={pct} value={pct}>
                          {pct}%
                        </option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 absolute right-2.5 top-4 pointer-events-none text-slate-500 dark:text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {/* 7. HSN */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_hsn')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_hsn')}
                    </span>
                  </label>
                  <input
                    type="text"
                    {...textFieldProps('code', formData.hsn, (val) => {
                      setFormData((prev) => ({ ...prev, hsn: val }));
                      setIsDirty(true);
                    })}
                    placeholder={t('medicine_form.placeholder_hsn')}
                    className="w-full h-12 px-3 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none transition-all border border-slate-200 dark:border-gray-700"
                  />
                </div>

                {/* 8. MRP (Required per pack) */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-[#006B33] dark:text-[#72dc8e] mb-1">
                    {t('medicine_form.label_mrp')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_mrp')}
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-lg font-bold text-[#006B33] dark:text-[#72dc8e]">
                      ₹
                    </span>
                    <input
                      type="text"
                      value={formData.mrpRupees}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, mrpRupees: e.target.value }));
                        setIsDirty(true);
                        if (errors.mrpRupees) {
                          setErrors((err) => ({ ...err, mrpRupees: undefined }));
                        }
                      }}
                      placeholder={t('medicine_form.placeholder_mrp')}
                      className={`w-full h-12 pl-8 pr-3 rounded-xl bg-[#006B33]/10 dark:bg-emerald-950/40 text-[#006B33] dark:text-[#72dc8e] text-xl font-bold focus:bg-white dark:focus:bg-gray-900 focus:ring-2 ${
                        errors.mrpRupees ? 'ring-2 ring-red-500' : 'focus:ring-[#006B33]'
                      } outline-none transition-all border border-slate-200 dark:border-gray-700`}
                    />
                  </div>
                  {errors.mrpRupees && (
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">
                      {t('medicine_form.err_mrp_invalid')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column (Items 9 - 15) */}
            <div className="flex flex-col justify-between h-full space-y-2">
              
              {/* 9 & 10: Pack Size & Short Code */}
              <div className="grid grid-cols-2 gap-3">
                {/* 9. Pack Mein Kitni (Required whole number >= 1) */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_units_per_pack')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_units_per_pack')}
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.unitsPerPack}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, unitsPerPack: e.target.value }));
                      setIsDirty(true);
                      if (errors.unitsPerPack) {
                        setErrors((err) => ({ ...err, unitsPerPack: undefined }));
                      }
                    }}
                    placeholder={t('medicine_form.placeholder_units_per_pack')}
                    className={`w-full h-12 px-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 ${
                      errors.unitsPerPack ? 'ring-2 ring-red-500' : 'focus:ring-[#006B33]'
                    } outline-none transition-all border border-slate-200 dark:border-gray-700`}
                  />
                  {errors.unitsPerPack && (
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">
                      {t('medicine_form.err_units_invalid')}
                    </span>
                  )}
                </div>

                {/* 10. Short Code (Rule 3) */}
                <div className="flex flex-col">
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="text-base font-bold text-slate-900 dark:text-white">
                      {t('medicine_form.label_short_code')}{' '}
                      <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                        {t('medicine_form.sub_short_code')}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsEditingShortCode((prev) => !prev)}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {t('medicine_form.btn_change_short_code')}
                    </button>
                  </div>
                  {isEditingShortCode ? (
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-[#006B33] font-black text-lg">#</span>
                      <input
                        type="text"
                        {...textFieldProps('code', formData.shortCode, (val) => {
                          setFormData((prev) => ({ ...prev, shortCode: val }));
                          setIsShortCodeCustomized(true);
                          setIsDirty(true);
                          if (errors.shortCode) {
                            setErrors((err) => ({ ...err, shortCode: undefined }));
                          }
                        })}
                        className={`w-full h-12 pl-8 pr-3 rounded-xl bg-white dark:bg-gray-800 text-slate-900 dark:text-white font-bold text-lg focus:ring-2 ${
                          errors.shortCode ? 'ring-2 ring-red-500' : 'focus:ring-[#006B33]'
                        } outline-none border border-slate-200 dark:border-gray-700`}
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsEditingShortCode(true)}
                      className={`flex items-center h-12 px-3.5 rounded-xl bg-[#E0EBE5] dark:bg-gray-800 text-slate-900 dark:text-white font-black text-xl tracking-wider cursor-pointer border ${
                        errors.shortCode ? 'border-red-500' : 'border-slate-200 dark:border-gray-700'
                      }`}
                    >
                      <span className="text-[#006B33] dark:text-[#72dc8e] mr-2">#</span>
                      <span>{formData.shortCode || '—'}</span>
                    </div>
                  )}
                  {errors.shortCode && (
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">
                      {t('medicine_form.err_short_code_duplicate')}
                    </span>
                  )}
                </div>
              </div>

              {/* 11 & 12: Barcode & Self Location */}
              <div className="grid grid-cols-2 gap-3">
                {/* 11. Barcode */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_barcode')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_barcode')}
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      {...textFieldProps('code', formData.barcode, (val) => {
                        setFormData((prev) => ({ ...prev, barcode: val }));
                        setIsDirty(true);
                        if (errors.barcode) {
                          setErrors((err) => ({ ...err, barcode: undefined }));
                        }
                      })}
                      placeholder={t('medicine_form.placeholder_barcode')}
                      className={`w-full h-12 px-3.5 pr-10 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 ${
                        errors.barcode ? 'ring-2 ring-red-500' : 'focus:ring-[#006B33]'
                      } outline-none transition-all border border-slate-200 dark:border-gray-700`}
                    />
                    <svg className="w-5 h-5 absolute right-3 text-[#006B33] dark:text-[#72dc8e]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                    </svg>
                  </div>
                  {errors.barcode && (
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">
                      {t('medicine_form.err_barcode_duplicate')}
                    </span>
                  )}
                </div>

                {/* 12. Self (Shelf) */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_shelf')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_shelf')}
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <svg className="w-5 h-5 absolute left-3 text-slate-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h16v4H4v-4z" />
                    </svg>
                    <input
                      type="text"
                      {...textFieldProps('name', formData.shelf, (val) => {
                        setFormData((prev) => ({ ...prev, shelf: val }));
                        setIsDirty(true);
                      })}
                      placeholder={t('medicine_form.placeholder_shelf')}
                      className="w-full h-12 pl-10 pr-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none transition-all border border-slate-200 dark:border-gray-700"
                    />
                  </div>
                </div>
              </div>

              {/* 13 & 14: Schedule Type & Low Stock Limit */}
              <div className="grid grid-cols-2 gap-3">
                {/* 13. Schedule Type */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_schedule')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_schedule')}
                    </span>
                  </label>
                  <div className="grid grid-cols-3 gap-1 h-12 items-center">
                    {(['none', 'H', 'H1'] as ScheduleType[]).map((st) => {
                      const isActive = formData.scheduleType === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, scheduleType: st }));
                            setIsDirty(true);
                          }}
                          className={`h-full rounded-xl font-bold text-sm flex flex-col items-center justify-center transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#006B33] text-white shadow-sm'
                              : 'bg-[#EBF6F0] dark:bg-gray-800 text-slate-800 dark:text-gray-200 hover:bg-[#E0EBE5] dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="leading-tight">
                            {st === 'none'
                              ? t('medicine_form.sch_none')
                              : st === 'H'
                              ? t('medicine_form.sch_h')
                              : t('medicine_form.sch_h1')}
                          </span>
                          {st === 'H' && (
                            <span className="text-[10px] opacity-90 leading-none">
                              {t('medicine_form.sch_h_sub')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 14. Kam Stock Limit */}
                <div className="flex flex-col">
                  <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {t('medicine_form.label_min_stock')}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                      {t('medicine_form.sub_min_stock')}
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.minStockUnits}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, minStockUnits: e.target.value }));
                      setIsDirty(true);
                    }}
                    placeholder={t('medicine_form.placeholder_min_stock')}
                    className="w-full h-12 px-3.5 rounded-xl bg-[#EBF6F0] dark:bg-gray-800 text-slate-900 dark:text-white text-base focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-[#006B33] outline-none transition-all border border-slate-200 dark:border-gray-700"
                  />
                </div>
              </div>

              {/* 15. Pack Ki Photo Upload Box (Rule 7) */}
              <div className="flex flex-col flex-1 min-h-[96px] justify-center">
                <label className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  {t('medicine_form.label_photo')}{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-gray-400">
                    {t('medicine_form.sub_photo')}
                  </span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />

                {formData.packPhoto ? (
                  <div className="h-24 w-full rounded-xl bg-[#EBF6F0] dark:bg-gray-800 flex items-center justify-between px-4 border border-slate-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <img
                        src={formData.packPhoto}
                        alt={t('medicine_form.alt_pack')}
                        className="w-16 h-16 rounded-lg object-cover border border-slate-300 dark:border-gray-600 shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-800 dark:text-gray-200">
                        {t('medicine_form.label_photo')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="h-10 px-4 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-sm font-bold hover:bg-red-200 transition-colors cursor-pointer"
                    >
                      {t('medicine_form.btn_remove_photo')}
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="h-24 w-full rounded-xl bg-[#EBF6F0] dark:bg-gray-800 hover:bg-[#E0EBE5] dark:hover:bg-gray-700/80 flex items-center justify-between px-4 cursor-pointer transition-all border border-dashed border-slate-300 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-[#DAE5DF] dark:bg-gray-700 flex items-center justify-center text-[#006B33] dark:text-[#72dc8e] shrink-0">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                        </svg>
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-slate-800 dark:text-gray-200">
                          {t('medicine_form.photo_title')}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-gray-400">
                          {t('medicine_form.photo_sub')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="h-10 px-4 rounded-xl bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-200 font-bold text-xs flex items-center gap-1.5 shadow-sm border border-slate-200 dark:border-gray-700 pointer-events-none"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <span>{t('medicine_form.btn_upload_photo')}</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </form>

          {/* Bottom Action Bar (Fixed Ergonomics >= 56px) */}
          <div className="shrink-0 h-16 pt-2 flex items-center justify-between gap-4">
            {/* Wapas Button */}
            <button
              type="button"
              onClick={handleBackClick}
              className="h-14 min-w-[180px] px-6 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center gap-2 transition-all active:translate-y-0.5 shadow-sm cursor-pointer border border-outline-variant"
            >
              <svg className="w-6 h-6 text-on-surface-variant" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-base font-bold leading-tight">{btnBack.main}</span>
                {btnBack.sub ? (
                  <span className="text-xs text-outline font-normal leading-tight">
                    {btnBack.sub}
                  </span>
                ) : null}
              </div>
            </button>

            {/* Center Quick Keyboard Hint */}
            <div className="hidden lg:flex items-center gap-2 text-outline text-xs font-medium bg-surface-container-low px-4 py-2 rounded-full border border-outline-variant">
              <kbd className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-bold text-xs shadow-xs border border-outline-variant">
                {t('medicine_form.ctrl_s_hint')}
              </kbd>
              <span>{t('medicine_form.shortcut_hint')}</span>
            </div>

            {/* Big Green Save Karo Button (>=56px) */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveAttempt}
              className="h-14 min-w-[260px] px-8 rounded-xl bg-primary hover:bg-[#088643] text-on-primary flex items-center justify-center gap-3 transition-all active:translate-y-0.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <svg className="w-7 h-7 text-on-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-lg font-bold leading-tight text-on-primary">{btnSave.main}</span>
                {btnSave.sub ? (
                  <span className="text-xs text-emerald-100 font-normal leading-tight">
                    {btnSave.sub}
                  </span>
                ) : null}
              </div>
            </button>
          </div>

        </div>
      </main>

      {/* 3. Footer Ribbon (Matching 38b) */}
      <footer className="fixed bottom-0 left-0 w-full h-11 px-6 md:px-8 bg-surface-container-low border-t border-outline-variant flex items-center justify-between text-xs md:text-sm text-on-surface-variant font-medium select-none z-40">
        <div className="flex items-center gap-2 truncate">
          {shopName ? <span>{shopName}</span> : null}
          {shopName && currentGst ? <span>•</span> : null}
          {currentGst ? <span>{t('common.gstin_prefix')}: {currentGst}</span> : null}
          {(shopName || currentGst) ? <span>•</span> : null}
          <span>{t('common.saved_on_device')}</span>
        </div>
        <div className="inline-flex items-center gap-2 text-primary font-bold shrink-0">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>{t('medicine.sync_active')}</span>
        </div>
      </footer>

      {/* Discard Changes ConfirmDialog (Rule 10) */}
      <ConfirmDialog
        isOpen={confirmLeaveTarget !== null}
        title={t('medicine_form.confirm_discard_title')}
        subtitle={t('medicine_form.confirm_discard_sub')}
        confirmLabel={t('dialogs.btn_haan').main}
        confirmSubLabel={t('dialogs.btn_haan').sub}
        cancelLabel={t('dialogs.btn_nahi').main}
        cancelSubLabel={t('dialogs.btn_nahi').sub}
        isDanger={true}
        onConfirm={handleConfirmLeave}
        onCancel={() => setConfirmLeaveTarget(null)}
      />

      {/* Rule 5 Duplicate Warning Modal with two big buttons */}
      {isDuplicateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-[#0f172a]/70 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fadeIn"
        >
          <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col border border-amber-300 dark:border-amber-700">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="text-2xl font-extrabold text-on-surface">
                {t('medicine_form.duplicate_dialog_title')}
              </h2>
            </div>

            <p className="text-sm text-outline mb-4">
              {t('medicine_form.duplicate_dialog_desc')}
            </p>

            <div className="max-h-48 overflow-y-auto divide-y divide-outline-variant/30 bg-surface-container-low rounded-xl p-3 mb-6 border border-outline-variant">
              {duplicateMatches.map((m) => (
                <div key={m.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-bold text-on-surface">
                      {m.name} {m.strength}
                    </span>
                    <span className="text-xs text-outline">
                      {m.company} · {t('medicine.mrp_label')} {formatRupees(m.mrpPaise)}
                    </span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    #{m.shortCode}
                  </span>
                </div>
              ))}
            </div>

            {/* Two Big Buttons (Rule 5) */}
            <div className="grid grid-cols-2 gap-4">
              {/* Wapas */}
              <button
                type="button"
                onClick={() => setIsDuplicateModalOpen(false)}
                className="h-16 px-4 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold flex flex-col items-center justify-center cursor-pointer transition-all active:scale-[0.98] border border-outline-variant"
              >
                <span className="text-lg font-bold">
                  {tButton('medicine_form.btn_duplicate_cancel').main}
                </span>
                {tButton('medicine_form.btn_duplicate_cancel').sub ? (
                  <span className="text-xs text-outline font-normal">
                    {tButton('medicine_form.btn_duplicate_cancel').sub}
                  </span>
                ) : null}
              </button>

              {/* Phir bhi save karo */}
              <button
                type="button"
                onClick={async () => {
                  setIsDuplicateModalOpen(false);
                  await executeSaveMedicine();
                }}
                className="h-16 px-4 rounded-2xl bg-primary hover:bg-[#088643] text-on-primary font-bold flex flex-col items-center justify-center shadow-md cursor-pointer transition-all active:scale-[0.98]"
              >
                <span className="text-lg font-bold">
                  {tButton('medicine_form.btn_duplicate_save_anyway').main}
                </span>
                {tButton('medicine_form.btn_duplicate_save_anyway').sub ? (
                  <span className="text-xs text-emerald-100 font-normal">
                    {tButton('medicine_form.btn_duplicate_save_anyway').sub}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Product Type Dialog */}
      {isAddTypeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-[#0f172a]/70 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fadeIn"
          onClick={() => {
            setIsAddTypeModalOpen(false);
            setNewTypeName('');
            setNewTypeError('');
            setFormData((prev) => ({ ...prev, form: previousSelectedForm }));
          }}
        >
          <div
            className="w-full max-w-[480px] bg-surface-container-lowest rounded-3xl shadow-2xl p-6 md:p-8 flex flex-col relative z-10 border border-outline-variant"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl md:text-2xl font-bold text-on-surface mb-4">
              {t('medicine_form.dialog_add_type_title')}
            </h3>

            <div className="flex flex-col mb-5">
              <label className="text-sm font-semibold text-on-surface mb-1.5">
                {t('medicine_form.type_name_label')}
                <span className="text-error ml-1">*</span>
              </label>
              <input
                type="text"
                {...textFieldProps('name', newTypeName, (val) => {
                  setNewTypeName(val);
                  if (newTypeError) setNewTypeError('');
                })}
                placeholder={t('common.example', { example: t('medicine_form.type_name_example') })}
                className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface text-base focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary outline-none transition-all border border-outline-variant"
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const validation = validateProductTypeName(newTypeName, customProductTypes);
                    if (!validation.valid) {
                      setNewTypeError(validation.errorKey ? t(validation.errorKey) : t('common.generic_error'));
                      return;
                    }
                    try {
                      const created = await addProductType(newTypeName, auditWho);
                      setCustomProductTypes((prev) => [...prev, created]);
                      setFormData((prev) => ({ ...prev, form: created.name }));
                      setIsDirty(true);
                      setIsAddTypeModalOpen(false);
                      setNewTypeName('');
                      setNewTypeError('');
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : '';
                      if (msg === 'type_already_exists') {
                        setNewTypeError(t('medicine_form.type_already_exists'));
                      } else if (msg === 'type_length_error') {
                        setNewTypeError(t('medicine_form.type_length_error'));
                      } else {
                        setNewTypeError(t('common.generic_error'));
                      }
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsAddTypeModalOpen(false);
                    setNewTypeName('');
                    setNewTypeError('');
                    setFormData((prev) => ({ ...prev, form: previousSelectedForm }));
                  }
                }}
              />
              {newTypeError && (
                <p className="text-error text-xs md:text-sm font-medium mt-1.5 animate-fadeIn">
                  {newTypeError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/40">
              <button
                type="button"
                onClick={() => {
                  setIsAddTypeModalOpen(false);
                  setNewTypeName('');
                  setNewTypeError('');
                  setFormData((prev) => ({ ...prev, form: previousSelectedForm }));
                }}
                className="px-5 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-sm transition-colors cursor-pointer"
              >
                {tButton('common.btn_cancel').main}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const validation = validateProductTypeName(newTypeName, customProductTypes);
                  if (!validation.valid) {
                    setNewTypeError(validation.errorKey ? t(validation.errorKey) : t('common.generic_error'));
                    return;
                  }
                  try {
                    const created = await addProductType(newTypeName, auditWho);
                    setCustomProductTypes((prev) => [...prev, created]);
                    setFormData((prev) => ({ ...prev, form: created.name }));
                    setIsDirty(true);
                    setIsAddTypeModalOpen(false);
                    setNewTypeName('');
                    setNewTypeError('');
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : '';
                    if (msg === 'type_already_exists') {
                      setNewTypeError(t('medicine_form.type_already_exists'));
                    } else if (msg === 'type_length_error') {
                      setNewTypeError(t('medicine_form.type_length_error'));
                    } else {
                      setNewTypeError(t('common.generic_error'));
                    }
                  }
                }}
                className="px-6 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm shadow-sm transition-colors cursor-pointer"
              >
                {tButton('common.btn_save_continue').main}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
