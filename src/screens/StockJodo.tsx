import React, { useState, useEffect, useRef } from 'react';
import {
  db,
  type DBUser,
  type Shop,
  type Supplier,
  type Medicine,
} from '../db';
import {
  savePurchase,
  getReviewData,
  findDuplicatePurchase,
  type PurchaseDraft,
  type PurchaseDraftLine,
  type SavePurchaseResult,
} from '../logic/purchase';
import { canSeePurchasePrice } from '../logic/roles';
import { searchMedicines } from '../logic/medicineSearch';
import { formatExpiryToLastDay, isExpired } from '../logic/stock';
import { paiseToRupees, rupeesToPaise, formatRupees } from '../logic/money';
import { compressInvoicePhoto } from '../logic/image';
import { useTranslation, tButton } from '../i18n';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { triggerFeedback } from '../logic/feedback';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/EmptyState';
import { FullscreenButton } from '../components/FullscreenButton';
import { formatField, textFieldProps } from '../logic/format';
import { useShop } from '../logic/useShop';

interface StockJodoProps {
  onReturnHome: () => void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 'saved';

export const StockJodo: React.FC<StockJodoProps> = ({
  onReturnHome,
  currentUser,
  shop,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t, shouldShowSub } = useTranslation();
  const { name: hookShopName } = useShop();
  const shopName = shop?.name || hookShopName || '';
  const isOwner = canSeePurchasePrice(currentUser);

  // Stepper state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // Data sources
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  // Draft state across all steps
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  });
  const [invoicePhoto, setInvoicePhoto] = useState<string>('');
  const [lines, setLines] = useState<PurchaseDraftLine[]>([]);

  // Step 1: New supplier popup state
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [newSupplierGst, setNewSupplierGst] = useState('');
  const [supplierError, setSupplierError] = useState<string>('');
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);

  // Step 2: Photo upload refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Step 3: Medicine search & line form state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [batchNo, setBatchNo] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [packsInput, setPacksInput] = useState('1');
  const [freePacksInput, setFreePacksInput] = useState('0');
  const [purchaseRateInput, setPurchaseRateInput] = useState('');
  const [mrpInput, setMrpInput] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string>('');
  const [isExpiryConfirmOpen, setIsExpiryConfirmOpen] = useState(false);
  const [pendingLineToAdd, setPendingLineToAdd] = useState<PurchaseDraftLine | null>(null);

  // Deletion confirm
  const [lineToDeleteId, setLineToDeleteId] = useState<string | null>(null);

  // Confirmation before leaving draft
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);

  // Step 4: Review and Save
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [inspectPhotoOpen, setInspectPhotoOpen] = useState(false);

  // Step 5: Save result
  const [saveResult, setSaveResult] = useState<SavePurchaseResult | null>(null);

  // Form input refs for Enter key navigation
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const expiryInputRef = useRef<HTMLInputElement | null>(null);
  const packsInputRef = useRef<HTMLInputElement | null>(null);
  const freePacksInputRef = useRef<HTMLInputElement | null>(null);
  const rateInputRef = useRef<HTMLInputElement | null>(null);
  const mrpInputRef = useRef<HTMLInputElement | null>(null);

  // Load suppliers and medicines on mount
  useEffect(() => {
    async function initData() {
      const existingSuppliers = await db.suppliers.toArray();
      setSuppliers(existingSuppliers);
      if (existingSuppliers.length > 0) {
        setSelectedSupplierId(existingSuppliers[0].id!);
      } else {
        setSelectedSupplierId(null);
      }

      const allMedicines = await db.medicines.where('active').equals(1 as any).toArray();
      if (allMedicines.length === 0) {
        const anyMeds = await db.medicines.toArray();
        setMedicines(anyMeds);
      } else {
        setMedicines(allMedicines);
      }
    }
    initData();
  }, []);

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  // Filtered medicines for Step 3 search
  const filteredMedicines = searchQuery.trim()
    ? searchMedicines(medicines, searchQuery).slice(0, 8)
    : [];

  // Helper to check if draft has unsaved progress
  const hasUnsavedProgress =
    currentStep !== 'saved' &&
    (selectedSupplierId !== null || invoiceNo.trim() !== '' || invoicePhoto !== '' || lines.length > 0);

  const handleAttemptReturnHome = () => {
    if (hasUnsavedProgress) {
      setIsLeaveConfirmOpen(true);
    } else {
      onReturnHome();
    }
  };

  // Add new supplier
  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) {
      setSupplierError(t('stock_jodo.err_supplier_name_required'));
      return;
    }
    const newId = Number(
      await db.suppliers.add({
        name: formatField('name', newSupplierName.trim()),
        phone: formatField('phone', newSupplierPhone.trim()),
        address: formatField('name', newSupplierAddress.trim()),
        gstNo: formatField('code', newSupplierGst.trim()),
        createdAt: new Date().toISOString(),
      })
    );
    const updated = await db.suppliers.toArray();
    setSuppliers(updated);
    setSelectedSupplierId(newId);
    setNewSupplierName('');
    setNewSupplierPhone('');
    setNewSupplierAddress('');
    setNewSupplierGst('');
    setSupplierError('');
    setIsNewSupplierOpen(false);
    triggerFeedback('success', t('stock_jodo.supplier_added_toast'));
  };

  // Step 1: Proceed to step 2 with duplicate check
  const handleProceedFromStep1 = async () => {
    if (!selectedSupplierId || !invoiceNo.trim()) return;
    const duplicate = await findDuplicatePurchase(selectedSupplierId, invoiceNo);
    if (duplicate) {
      setDuplicateWarningOpen(true);
      return;
    }
    setCurrentStep(2);
  };

  // Handle Photo selection/capture in Step 2
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressInvoicePhoto(file, 1600, 0.7);
      setInvoicePhoto(dataUrl);
    } catch {
      // Fallback: direct reader
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setInvoicePhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };


  // Step 3: Pick a medicine from search
  const handleSelectMedicine = (med: Medicine) => {
    setSelectedMedicine(med);
    setSearchQuery(`${med.name} ${med.strength}`.trim());
    setIsSearchOpen(false);
    setMrpInput(paiseToRupees(med.mrpPaise).toString());
    setLineError('');
    setTimeout(() => {
      batchInputRef.current?.focus();
    }, 50);
  };

  // Step 3: Add / Update Line
  const handleCommitLine = () => {
    if (!selectedMedicine || !selectedMedicine.id) {
      setLineError(t('stock_jodo.err_medicine_required'));
      searchInputRef.current?.focus();
      return;
    }
    if (!batchNo.trim()) {
      setLineError(t('stock_jodo.err_batch_required'));
      batchInputRef.current?.focus();
      return;
    }
    if (!expiryInput.trim()) {
      setLineError(t('stock_jodo.err_expiry_invalid'));
      expiryInputRef.current?.focus();
      return;
    }

    let isoExpiry = '';
    try {
      isoExpiry = formatExpiryToLastDay(expiryInput.trim());
    } catch {
      setLineError(t('stock_jodo.err_expiry_invalid'));
      expiryInputRef.current?.focus();
      return;
    }

    const packs = parseInt(packsInput, 10);
    const freePacks = parseInt(freePacksInput || '0', 10);
    if (isNaN(packs) || isNaN(freePacks) || packs < 0 || freePacks < 0 || packs + freePacks < 1) {
      setLineError(t('stock_jodo.err_packs_invalid'));
      packsInputRef.current?.focus();
      return;
    }

    const mrp = parseFloat(mrpInput);
    if (isNaN(mrp) || mrp <= 0) {
      setLineError(t('stock_jodo.err_mrp_invalid'));
      mrpInputRef.current?.focus();
      return;
    }

    // Purchase rate resolution:
    // If editing and user left rate blank: keep previous rate
    let purchaseRatePaise = 0;
    if (editingLineId) {
      const prevLine = lines.find((l) => l.id === editingLineId);
      if (purchaseRateInput.trim() === '') {
        purchaseRatePaise = prevLine ? prevLine.purchaseRatePaise : 0;
      } else {
        const r = parseFloat(purchaseRateInput);
        if (isNaN(r) || r < 0) {
          setLineError(t('stock_jodo.err_rate_invalid'));
          rateInputRef.current?.focus();
          return;
        }
        purchaseRatePaise = rupeesToPaise(r);
      }
    } else {
      const r = parseFloat(purchaseRateInput);
      if (isNaN(r) || r < 0) {
        setLineError(t('stock_jodo.err_rate_invalid'));
        rateInputRef.current?.focus();
        return;
      }
      purchaseRatePaise = rupeesToPaise(r);
    }

    const lineData: PurchaseDraftLine = {
      id: editingLineId || `line-${Date.now()}-${Math.random()}`,
      medicineId: selectedMedicine.id,
      medicineName: selectedMedicine.name,
      strength: selectedMedicine.strength,
      form: selectedMedicine.form,
      unitsPerPack: selectedMedicine.unitsPerPack || 1,
      shelf: selectedMedicine.shelf,
      batchNo: formatField('code', batchNo.trim()),
      expiryMonthYear: expiryInput.trim(),
      expiryDate: isoExpiry,
      packs,
      freePacks,
      purchaseRatePaise,
      mrpPaise: rupeesToPaise(mrp),
    };

    // Check if batch is already expired
    if (isExpired({ expiry: isoExpiry })) {
      setPendingLineToAdd(lineData);
      setIsExpiryConfirmOpen(true);
      return;
    }

    applyLine(lineData);
  };

  const applyLine = (lineData: PurchaseDraftLine) => {
    if (editingLineId) {
      setLines((prev) => prev.map((l) => (l.id === editingLineId ? lineData : l)));
    } else {
      setLines((prev) => [...prev, lineData]);
    }

    // Reset line input form
    setEditingLineId(null);
    setSelectedMedicine(null);
    setSearchQuery('');
    setBatchNo('');
    setExpiryInput('');
    setPacksInput('1');
    setFreePacksInput('0');
    setPurchaseRateInput('');
    setMrpInput('');
    setLineError('');

    // Return focus to medicine search
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  // Edit existing line
  const handleEditLine = (line: PurchaseDraftLine) => {
    const med = medicines.find((m) => m.id === line.medicineId);
    if (med) {
      setSelectedMedicine(med);
      setSearchQuery(`${med.name} ${med.strength}`.trim());
    } else {
      setSelectedMedicine({
        id: line.medicineId,
        name: line.medicineName,
        strength: line.strength || '',
        form: line.form || '',
        salt: '',
        company: '',
        gstPercent: 12,
        hsn: '',
        mrpPaise: line.mrpPaise,
        unitsPerPack: line.unitsPerPack,
        shortCode: '',
        barcode: '',
        shelf: line.shelf || '',
        scheduleType: 'none',
        minStockUnits: 0,
        active: true,
      });
      setSearchQuery(`${line.medicineName} ${line.strength || ''}`.trim());
    }

    setEditingLineId(line.id);
    setBatchNo(line.batchNo);
    setExpiryInput(line.expiryMonthYear);
    setPacksInput(line.packs.toString());
    setFreePacksInput(line.freePacks.toString());
    setMrpInput(paiseToRupees(line.mrpPaise).toString());

    // Staff rule: Rate box starts EMPTY with hint on edit
    if (isOwner) {
      setPurchaseRateInput(paiseToRupees(line.purchaseRatePaise).toString());
    } else {
      setPurchaseRateInput('');
    }

    setLineError('');
    batchInputRef.current?.focus();
  };

  // Delete line
  const handleConfirmDeleteLine = () => {
    if (lineToDeleteId) {
      setLines((prev) => prev.filter((l) => l.id !== lineToDeleteId));
      if (editingLineId === lineToDeleteId) {
        setEditingLineId(null);
        setSelectedMedicine(null);
        setSearchQuery('');
        setBatchNo('');
        setExpiryInput('');
        setPacksInput('1');
        setFreePacksInput('0');
        setPurchaseRateInput('');
        setMrpInput('');
      }
      setLineToDeleteId(null);
      triggerFeedback('success', t('stock_jodo.line_deleted_toast'));
    }
  };

  // Step 4: Final save transaction (saves in ONE transaction, cannot save twice)
  const handleSavePurchase = async () => {
    if (isSaving) return;

    if (!selectedSupplierId) {
      setSaveErrorMessage(t('stock_jodo.err_supplier_required'));
      return;
    }
    if (!invoiceNo.trim()) {
      setSaveErrorMessage(t('stock_jodo.err_invoice_no_required'));
      return;
    }
    if (!invoicePhoto.trim()) {
      setSaveErrorMessage(t('stock_jodo.photo_required_pill'));
      return;
    }
    if (lines.length === 0) {
      setSaveErrorMessage(t('stock_jodo.err_medicine_required'));
      return;
    }

    setIsSaving(true);
    setSaveErrorMessage('');

    const draft: PurchaseDraft = {
      supplierId: selectedSupplierId,
      supplierName: selectedSupplier?.name,
      supplierPhone: selectedSupplier?.phone,
      invoiceNo: formatField('code', invoiceNo.trim()),
      invoiceDate: invoiceDate.trim(),
      invoicePhoto,
      lines,
    };

    try {
      const result = await savePurchase(draft, currentUser);
      setSaveResult(result);
      setCurrentStep('saved');
      triggerFeedback('success', t('stock_jodo.stock_saved_toast'));
    } catch (err: any) {
      console.error('Purchase save failed:', err?.message || err);
      setSaveErrorMessage(t('stock_jodo.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Reset wizard to add more stock
  const handleResetForMoreStock = () => {
    setCurrentStep(1);
    setInvoiceNo('');
    setInvoicePhoto('');
    setLines([]);
    setSaveResult(null);
    setSaveErrorMessage('');
  };

  // Aggregate stats for Step 3 & 4
  const totalPacksSum = lines.reduce((acc, l) => acc + l.packs, 0);
  const totalFreePacksSum = lines.reduce((acc, l) => acc + l.freePacks, 0);
  const totalPaiseSum = lines.reduce((acc, l) => acc + l.packs * l.purchaseRatePaise, 0);

  // Computed Review Data for Step 4
  const reviewData = getReviewData(
    {
      supplierId: selectedSupplierId || 0,
      supplierName: selectedSupplier?.name,
      supplierPhone: selectedSupplier?.phone,
      invoiceNo,
      invoiceDate,
      invoicePhoto,
      lines,
    },
    currentUser
  );

  const backButtonLabel = tButton('common.btn_back');
  const nextButtonLabel = tButton('common.btn_next');
  const addLineLabel = tButton('stock_jodo.btn_add_line');
  const updateLineLabel = tButton('stock_jodo.btn_update_line');
  const confirmSaveLabel = tButton('stock_jodo.btn_confirm_save');
  const addMoreStockLabel = tButton('stock_jodo.btn_add_more_stock');
  const doneLabel = tButton('stock_jodo.btn_done');

  return (
    <div className="w-full h-screen bg-canvas font-body-md text-body-md text-on-surface antialiased select-none flex flex-col overflow-hidden">
      {/* GLOBAL APP HEADER */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-16 w-full max-w-[1440px] mx-auto px-4 sm:px-gutter flex items-center justify-between">
          <div className="flex items-center gap-space-sm sm:gap-space-lg">
            <div className="flex items-center gap-space-xs">
              <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container shadow-sm">
                <Icon name="local_pharmacy" className="text-[24px]" />
              </div>
              <span className="font-headline-md text-headline-md text-primary tracking-tight font-bold">
                {t('common.app_name')}
              </span>
            </div>
            <div className="hidden sm:block h-6 w-px bg-outline-variant"></div>
            <div className="hidden sm:flex items-center gap-space-xs">
              <Icon name="store" className="text-outline text-[20px]" />
              <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                {shopName}
              </span>
            </div>
            <nav className="flex items-center ml-space-xs">
              <button
                type="button"
                onClick={handleAttemptReturnHome}
                className="px-space-md py-space-xs rounded-lg transition-colors flex items-center gap-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-title-hinglish text-title-hinglish"
              >
                <Icon name="home" className="text-[20px]" />
                <span>{tButton('common.btn_home').main}</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-space-md">
            <div className="hidden md:flex items-center gap-space-xs px-space-sm py-1 bg-surface-container dark:bg-gray-800 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant uppercase tracking-wider text-[12px]">
                {t('common.local_mode')}
              </span>
            </div>
            <button
              aria-label={t('common.toggle_theme')}
              onClick={onToggleTheme}
              className="w-10 h-10 rounded-lg bg-surface-container dark:bg-gray-800 hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors"
              type="button"
            >
              <Icon name={theme === 'dark' ? 'dark_mode' : 'light_mode'} className="text-[20px]" />
            </button>
            <FullscreenButton className="w-10 h-10 rounded-lg bg-surface-container dark:bg-gray-800 hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer" />
            <div className="flex items-center gap-space-sm pl-space-xs">
              <div className="hidden sm:block text-right">
                <div className="font-title-hinglish text-title-hinglish text-on-surface leading-tight font-bold">
                  {currentUser?.name || (isOwner ? t('common.role_owner') : t('common.role_cashier'))}
                </div>
                <div className="font-label-sub-english text-label-sub-english text-outline text-[12px] leading-tight">
                  {isOwner ? t('common.role_owner') : t('common.role_cashier')}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <Icon name="person" className="text-on-primary text-[18px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT CONTAINER */}
      <main className="w-full h-screen pt-16 bg-canvas overflow-hidden flex flex-col">
        {/* ============================================================== */}
        {/* STEP 1: CHOOSE SUPPLIER & INVOICE DETAILS (23a) */}
        {/* ============================================================== */}
        {currentStep === 1 && (
          <div className="flex flex-col w-full max-w-[1440px] mx-auto h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] overflow-y-auto lg:overflow-hidden select-none px-4 sm:px-gutter py-space-sm sm:py-space-md justify-between box-border">
            {/* Step Tracker & Header */}
            <div className="flex flex-col w-full gap-space-xs shrink-0">
              <div className="grid grid-cols-4 gap-space-xs w-full">
                <div className="h-2.5 rounded-full bg-primary"></div>
                <div className="h-2.5 rounded-full bg-surface-container-highest"></div>
                <div className="h-2.5 rounded-full bg-surface-container-highest"></div>
                <div className="h-2.5 rounded-full bg-surface-container-highest"></div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mt-space-xs gap-1 sm:gap-0">
                <div className="flex items-baseline gap-space-sm flex-wrap">
                  <h1 className="font-headline-md text-headline-md text-on-surface font-bold">
                    {t('stock_jodo.step1_title')}
                  </h1>
                  {shouldShowSub(t('stock_jodo.step1_title'), t('stock_jodo.step1_sub')) && (
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                      {t('stock_jodo.step1_sub')}
                    </span>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-space-xs text-on-surface-variant">
                  <Icon name="inventory_2" className="text-[20px]" />
                  <span className="font-label-sub-english text-label-sub-english">
                    {t('stock_jodo.step1_tag')}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Content Dual-Panel Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md lg:gap-gutter flex-1 min-h-0 my-space-xs overflow-y-auto lg:overflow-visible">
              {/* Left Card: Supplier Selection (7 Cols) */}
              <div className="lg:col-span-7 bg-surface-container-lowest dark:bg-gray-900 rounded-[16px] shadow-sm p-space-md flex flex-col justify-between overflow-hidden border border-outline-variant/30">
                <div className="flex flex-col gap-space-xs">
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                    {t('stock_jodo.supplier_select_title')}
                  </h2>
                  {shouldShowSub(t('stock_jodo.supplier_select_title'), t('stock_jodo.supplier_select_sub')) && (
                    <p className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('stock_jodo.supplier_select_sub')}
                    </p>
                  )}
                </div>

                {/* Interactive Supplier Rows or EmptyState */}
                {suppliers.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-center items-center my-auto py-2">
                    <EmptyState
                      title={t('stock_jodo.empty_suppliers_title')}
                      subtitle={t('stock_jodo.empty_suppliers_sub')}
                      actionLabel={tButton('stock_jodo.btn_add_supplier').main}
                      actionSubLabel={tButton('stock_jodo.btn_add_supplier').sub}
                      onAction={() => setIsNewSupplierOpen(true)}
                      hintText=""
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-space-xs my-auto overflow-y-auto max-h-[340px] pr-1">
                      {suppliers.map((s) => {
                        const isSelected = selectedSupplierId === s.id;
                        return (
                          <div
                            key={s.id}
                            onClick={() => {
                              setSelectedSupplierId(s.id!);
                            }}
                            className={`h-[72px] rounded-[16px] px-space-md flex items-center justify-between cursor-pointer shadow-sm transition-all ${
                              isSelected
                                ? 'bg-surface-container-low dark:bg-gray-800 shadow-[0_0_0_2px_#006b33]'
                                : 'bg-surface-container-lowest dark:bg-gray-900 hover:bg-surface-container-low shadow-[0_0_0_1px_#E0E6E3]'
                            }`}
                          >
                            <div className="flex items-center gap-space-md">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                                  isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container-high'
                                }`}
                              >
                                <Icon
                                  name="check"
                                  className={`text-[18px] ${
                                    isSelected ? 'text-on-primary' : 'text-transparent'
                                  }`}
                                />
                              </div>
                              <div className="flex flex-col justify-center">
                                <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight font-bold">
                                  {s.name}
                                </span>
                                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                                  {s.phone}
                                </span>
                              </div>
                            </div>
                            <Icon
                              name="local_shipping"
                              className={`text-[28px] ${
                                isSelected ? 'text-primary' : 'text-on-surface-variant'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Add New Supplier Button */}
                    <button
                      type="button"
                      onClick={() => setIsNewSupplierOpen(true)}
                      className="h-[60px] min-h-[56px] w-full rounded-[16px] bg-surface-container-low dark:bg-gray-800 hover:bg-surface-container text-primary flex items-center justify-center gap-space-sm px-space-md shadow-sm transition-all active:translate-y-0.5 cursor-pointer"
                    >
                      <Icon name="add_circle" className="text-[30px] font-bold" />
                      <div className="flex flex-col items-start leading-none">
                        <span className="font-title-hinglish text-title-hinglish font-bold text-primary leading-tight">
                          {tButton('stock_jodo.btn_add_supplier').main}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none font-medium">
                          {tButton('stock_jodo.btn_add_supplier').sub}
                        </span>
                      </div>
                    </button>
                  </>
                )}
              </div>

              {/* Right Card: Invoice Details (5 Cols) */}
              <div className="lg:col-span-5 bg-surface-container-lowest dark:bg-gray-900 rounded-[16px] shadow-sm p-space-md flex flex-col justify-between overflow-hidden border border-outline-variant/30">
                <div className="flex flex-col gap-space-xs">
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                    {t('stock_jodo.bill_info_title')}
                  </h2>
                  {shouldShowSub(t('stock_jodo.bill_info_title'), t('stock_jodo.bill_info_sub')) && (
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                      {t('stock_jodo.bill_info_sub')}
                    </span>
                  )}
                </div>

                {/* Inputs Container */}
                <div className="flex flex-col gap-space-md mt-space-md mb-auto">
                  {/* Field 1: Invoice Number */}
                  <div className="flex flex-col gap-space-xs">
                    <label className="font-body-md text-body-md font-bold text-on-surface">
                      {t('stock_jodo.invoice_no_label')}
                    </label>
                    <div className="relative flex items-center">
                      <Icon
                        name="receipt_long"
                        className="absolute left-space-md text-on-surface-variant text-[24px]"
                      />
                      <input
                        type="text"
                        {...textFieldProps('code', invoiceNo, setInvoiceNo)}
                        placeholder={t('stock_jodo.invoice_no_placeholder')}
                        className="w-full h-[58px] min-h-[56px] rounded-[16px] bg-surface-container-lowest dark:bg-gray-900 pl-14 pr-space-md font-body-lg text-body-lg text-on-surface font-bold shadow-[0_0_0_2px_#bdcabc] focus:shadow-[0_0_0_3px_#006b33] outline-none transition-shadow"
                      />
                    </div>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('stock_jodo.invoice_no_hint')}
                    </span>
                  </div>

                  {/* Field 2: Invoice Date */}
                  <div className="flex flex-col gap-space-xs">
                    <label className="font-body-md text-body-md font-bold text-on-surface">
                      {t('stock_jodo.invoice_date_label')}
                    </label>
                    <div className="relative flex items-center">
                      <Icon
                        name="calendar_today"
                        className="absolute left-space-md text-on-surface-variant text-[24px]"
                      />
                      <input
                        type="text"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        placeholder={t('common.date_placeholder')}
                        className="w-full h-[58px] min-h-[56px] rounded-[16px] bg-surface-container-lowest dark:bg-gray-900 pl-14 pr-14 font-body-lg text-body-lg text-on-surface font-bold shadow-[0_0_0_2px_#bdcabc] focus:shadow-[0_0_0_3px_#006b33] outline-none transition-shadow"
                      />
                    </div>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('stock_jodo.invoice_date_hint')}
                    </span>
                  </div>
                </div>

                {/* Informational Callout */}
                <div className="rounded-[16px] bg-surface-container-low dark:bg-gray-800 p-space-md flex items-center gap-space-sm mt-space-md">
                  <Icon name="info" className="text-secondary text-[28px] shrink-0" />
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium leading-relaxed">
                    {t('stock_jodo.step1_note')}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Navigation */}
            <div className="w-full h-[72px] shrink-0 flex items-center justify-between px-space-xs pt-space-xs">
              <button
                type="button"
                onClick={handleAttemptReturnHome}
                className="h-[60px] min-h-[56px] min-w-[140px] sm:min-w-[200px] rounded-[16px] bg-surface-container-highest hover:bg-surface-dim text-on-surface flex items-center justify-center gap-space-sm sm:gap-space-md px-space-md sm:px-space-lg shadow-sm transition-all active:translate-y-0.5 cursor-pointer"
              >
                <Icon name="arrow_back" className="text-[28px] sm:text-[30px] font-bold" />
                <div className="flex flex-col items-start leading-none">
                  <span className="font-button-text text-button-text font-bold leading-tight">
                    {backButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-none font-medium">
                    {backButtonLabel.sub}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={!selectedSupplierId || !invoiceNo.trim()}
                onClick={handleProceedFromStep1}
                className={`h-[60px] min-h-[56px] min-w-[150px] sm:min-w-[260px] rounded-[16px] flex items-center justify-center gap-space-sm sm:gap-space-md px-space-md sm:px-space-xl shadow-md transition-all active:translate-y-0.5 ${
                  selectedSupplierId && invoiceNo.trim()
                    ? 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer'
                    : 'bg-surface-container-highest text-outline opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="font-button-text text-button-text font-bold leading-tight">
                    {nextButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english leading-none font-medium opacity-90">
                    {nextButtonLabel.sub}
                  </span>
                </div>
                <Icon name="arrow_forward" className="text-[28px] sm:text-[30px] font-bold" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 2: INVOICE PHOTO (23b / 23b2) */}
        {/* ============================================================== */}
        {currentStep === 2 && (
          <div className="flex flex-col w-full max-w-[1440px] mx-auto h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] overflow-y-auto lg:overflow-hidden select-none px-4 sm:px-gutter lg:px-margin py-space-sm justify-between">
            {/* Step Tracker & Header Block */}
            <div className="flex flex-col gap-space-xs w-full max-w-5xl mx-auto flex-shrink-0">
              <div className="flex items-baseline justify-between">
                <div className="flex flex-col">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                    {t('stock_jodo.step2_title')}
                  </h1>
                  {shouldShowSub(t('stock_jodo.step2_title'), t('stock_jodo.step2_sub')) && (
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium mt-0.5">
                      {t('stock_jodo.step2_sub')}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-label-sub-english text-label-sub-english text-primary font-bold uppercase tracking-wider">
                    {t('stock_jodo.step2_tag')}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-space-sm w-full pt-1">
                <div className="h-2.5 rounded-full bg-primary"></div>
                <div className="h-2.5 rounded-full bg-primary"></div>
                <div className="h-2.5 rounded-full bg-surface-variant"></div>
                <div className="h-2.5 rounded-full bg-surface-variant"></div>
              </div>
            </div>

            {/* Central Photo Capture / Preview Area */}
            <div className="w-full max-w-5xl mx-auto my-auto flex-grow flex items-center justify-center py-space-xs min-h-0">
              <div className="w-full h-full max-h-[540px] bg-surface-container-lowest dark:bg-gray-900 rounded-2xl shadow-md p-space-md flex flex-col justify-between relative overflow-hidden">
                {/* Hidden File Input for Camera */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                {/* Hidden File Input for Gallery (no capture attribute) */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />

                {!invoicePhoto ? (
                  /* Viewfinder / Placeholder state (23b) */
                  <div className="relative w-full flex-grow bg-surface-container-low dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center p-space-md overflow-hidden">
                    <div className="relative w-full max-w-xl h-64 sm:h-72 flex flex-col items-center justify-center">
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
                        <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
                        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-xl"></div>
                      </div>

                      <div className="flex flex-col items-center text-center p-space-md max-w-md">
                        <div className="w-20 h-20 rounded-2xl bg-surface-container dark:bg-gray-700 flex items-center justify-center text-primary shadow-sm mb-space-sm">
                          <Icon name="photo_camera" className="text-[44px]" />
                        </div>
                        <p className="font-body-lg text-body-lg text-on-surface font-bold">
                          {t('stock_jodo.photo_framing_title')}
                        </p>
                        <p className="font-label-sub-english text-label-sub-english text-on-surface-variant mt-1">
                          {t('stock_jodo.photo_framing_sub')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-space-xs flex items-center gap-space-xs px-space-md py-space-xs rounded-xl bg-error-container text-on-error-container shadow-sm">
                      <Icon name="error" className="text-error text-[24px]" />
                      <span className="font-label-sub-english text-label-sub-english text-error font-bold">
                        {t('stock_jodo.photo_required_pill')}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Photo Captured Preview state (23b2) */
                  <div className="w-full flex-1 my-space-xs bg-surface-container-lowest rounded-xl p-space-md flex gap-space-lg items-center justify-center overflow-hidden">
                    <div className="relative h-full aspect-[3/4] max-h-[380px] bg-surface-container-lowest border border-outline-variant/30 rounded-lg shadow-md p-2 flex flex-col justify-between overflow-hidden">
                      <img
                        src={invoicePhoto}
                        alt={t('stock_jodo.alt_invoice_scan')}
                        className="w-full h-full object-contain rounded"
                      />
                      <div className="absolute inset-2 pointer-events-none z-10 flex flex-col justify-between">
                        <div className="flex justify-between">
                          <div className="w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl"></div>
                          <div className="w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr"></div>
                        </div>
                        <div className="flex justify-between">
                          <div className="w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl"></div>
                          <div className="w-6 h-6 border-b-4 border-r-4 border-primary rounded-br"></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start justify-center gap-space-md max-w-sm">
                      <div className="inline-flex items-center gap-space-sm bg-primary-container text-on-primary-container px-space-lg py-space-sm rounded-full shadow-sm">
                        <Icon name="check_circle" className="text-[28px]" filled={true} />
                        <div className="flex flex-col">
                          <span className="font-title-hinglish text-title-hinglish leading-tight">
                            {t('stock_jodo.photo_taken_badge')}
                          </span>
                          <span className="font-label-sub-english text-label-sub-english opacity-90 leading-tight">
                            {t('stock_jodo.photo_taken_sub')}
                          </span>
                        </div>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant leading-snug">
                        {t('stock_jodo.photo_taken_desc')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Triggers Inside Central Card */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-md w-full max-w-2xl mx-auto flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                    }}
                    className="min-h-[64px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary shadow-md flex items-center justify-center gap-space-sm px-space-lg transition-transform active:translate-y-0.5 cursor-pointer"
                  >
                    <Icon
                      name={invoicePhoto ? 'replay' : 'photo_camera'}
                      className="text-on-primary text-[32px]"
                    />
                    <div className="flex flex-col text-left leading-tight">
                      <span className="font-title-hinglish text-title-hinglish text-on-primary font-bold">
                        {invoicePhoto
                          ? tButton('stock_jodo.btn_retake_photo').main
                          : tButton('stock_jodo.btn_take_photo').main}
                      </span>
                      <span className="font-label-sub-english text-label-sub-english text-primary-fixed font-medium">
                        {invoicePhoto
                          ? tButton('stock_jodo.btn_retake_photo').sub
                          : tButton('stock_jodo.btn_take_photo').sub}
                      </span>
                    </div>
                  </button>

                  {!invoicePhoto ? (
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="min-h-[64px] rounded-2xl bg-surface-container-high dark:bg-gray-800 hover:bg-surface-variant text-on-surface shadow-sm flex items-center justify-center gap-space-sm px-space-lg transition-transform active:translate-y-0.5 cursor-pointer"
                    >
                      <Icon
                        name="document_scanner"
                        className="text-on-surface text-[32px]"
                      />
                      <div className="flex flex-col text-left leading-tight">
                        <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                          {tButton('stock_jodo.btn_choose_gallery').main}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                          {tButton('stock_jodo.btn_choose_gallery').sub}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInvoicePhoto('')}
                      className="min-h-[64px] rounded-2xl bg-surface-container-high dark:bg-gray-800 hover:bg-error-container hover:text-error text-on-surface shadow-sm flex items-center justify-center gap-space-sm px-space-lg transition-transform active:translate-y-0.5 cursor-pointer"
                    >
                      <Icon name="delete" className="text-[28px]" />
                      <span className="font-title-hinglish text-title-hinglish font-bold">
                        {t('stock_jodo.btn_remove_photo')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Navigation */}
            <div className="w-full max-w-5xl mx-auto flex items-center justify-between pt-space-xs pb-space-xs flex-shrink-0">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="min-h-[56px] px-space-lg rounded-2xl bg-surface-container-high dark:bg-gray-800 hover:bg-surface-variant text-on-surface flex items-center gap-space-sm transition-transform active:translate-y-0.5 cursor-pointer shadow-sm"
              >
                <Icon name="arrow_back" className="text-on-surface text-[26px]" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                    {backButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                    {backButtonLabel.sub}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={!invoicePhoto}
                onClick={() => {
                  setCurrentStep(3);
                }}
                className={`min-h-[56px] px-space-xl rounded-2xl flex items-center gap-space-sm transition-transform active:translate-y-0.5 ${
                  invoicePhoto
                    ? 'bg-primary hover:bg-primary-container text-on-primary cursor-pointer shadow-md'
                    : 'bg-surface-container-highest text-outline opacity-60 cursor-not-allowed shadow-none'
                }`}
              >
                <div className="flex flex-col text-right leading-tight">
                  <span className="font-title-hinglish text-title-hinglish font-bold">
                    {nextButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english font-medium opacity-90">
                    {nextButtonLabel.sub}
                  </span>
                </div>
                <Icon name="arrow_forward" className="text-[26px]" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 3: ADD MEDICINES (23c) */}
        {/* ============================================================== */}
        {currentStep === 3 && (
          <div className="flex flex-col w-full max-w-[1440px] mx-auto h-[calc(100vh-64px)] px-4 sm:px-gutter py-space-sm justify-between select-none overflow-y-auto lg:overflow-hidden">
            {/* Top Section: Step Header & Progress Bar */}
            <div className="flex flex-col gap-space-xs shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-headline-md text-headline-md text-on-surface font-bold">
                    {t('stock_jodo.step3_title')}
                  </h1>
                  {shouldShowSub(t('stock_jodo.step3_title'), t('stock_jodo.step3_sub')) && (
                    <p className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('stock_jodo.step3_sub')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-space-xs text-secondary font-bold">
                  <Icon name="inventory_2" className="text-[28px]" />
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                    {t('stock_jodo.step3_tag')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-space-sm w-full pt-1">
                <div className="h-3 rounded-full bg-primary-container"></div>
                <div className="h-3 rounded-full bg-primary-container"></div>
                <div className="h-3 rounded-full bg-primary-container"></div>
                <div className="h-3 rounded-full bg-surface-container-highest"></div>
              </div>
            </div>

            {/* Main Body Split: 45% Form / 55% Medicine Rows */}
            <div className="flex flex-col lg:flex-row gap-space-md lg:gap-gutter w-full flex-1 my-space-sm min-h-0 overflow-y-auto lg:overflow-visible">
              {/* Left Card (45% Width): Dawai ki jaankari Form */}
              <div className="w-full lg:w-[45%] bg-surface-container-lowest dark:bg-gray-900 rounded-xl shadow-md p-space-md flex flex-col justify-between overflow-y-auto border border-outline-variant/30">
                <div>
                  <div className="flex items-center gap-space-xs mb-space-sm">
                    <Icon name="medication" className="text-primary text-[28px]" />
                    <div>
                      <h2 className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                        {t('stock_jodo.medicine_info_title')}
                      </h2>
                      {shouldShowSub(t('stock_jodo.medicine_info_title'), t('stock_jodo.medicine_info_sub')) && (
                        <p className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {t('stock_jodo.medicine_info_sub')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-space-xs">
                    {/* 1. Dawai ka naam & Auto-complete Search */}
                    <div className="relative">
                      <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                        {t('stock_jodo.medicine_name_label')}
                      </label>
                      <input
                        ref={searchInputRef}
                        type="text"
                        {...textFieldProps('free', searchQuery, (val) => {
                          setSearchQuery(val);
                          setIsSearchOpen(true);
                          if (selectedMedicine) setSelectedMedicine(null);
                        })}
                        onFocus={() => setIsSearchOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (filteredMedicines.length > 0) {
                              handleSelectMedicine(filteredMedicines[0]);
                            } else {
                              batchInputRef.current?.focus();
                            }
                          }
                        }}
                        placeholder={t('stock_jodo.medicine_search_placeholder')}
                        className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                      />

                      {/* Dropdown Results */}
                      {isSearchOpen && searchQuery.trim().length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-surface-container-lowest dark:bg-gray-800 border border-outline-variant rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto">
                          {filteredMedicines.length > 0 ? (
                            filteredMedicines.map((m) => (
                              <div
                                key={m.id}
                                onClick={() => handleSelectMedicine(m)}
                                className="px-space-md py-2.5 hover:bg-surface-container cursor-pointer flex items-center justify-between border-b border-surface-container-high last:border-b-0"
                              >
                                <div className="flex flex-col">
                                  <span className="font-body-md font-bold text-on-surface">
                                    {m.name} {m.strength}
                                  </span>
                                  <span className="font-label-sub-english text-on-surface-variant text-[13px]">
                                    {m.company || m.salt || ''} · {t('medicine.mrp_label')} {formatRupees(m.mrpPaise)}
                                  </span>
                                </div>
                                <span className="text-[12px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-primary flex items-center justify-center">
                                  {m.shortCode || <Icon name="medication" className="text-base" />}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="p-space-md text-center text-error font-body-md">
                              {t('stock_jodo.medicine_not_found')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 2. Batch Number & Expiry */}
                    <div className="grid grid-cols-2 gap-space-sm">
                      <div>
                        <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                          {t('stock_jodo.batch_no_label')}
                        </label>
                        <input
                          ref={batchInputRef}
                          type="text"
                          {...textFieldProps('code', batchNo, setBatchNo)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              expiryInputRef.current?.focus();
                            }
                          }}
                          placeholder={t('stock_jodo.batch_no_placeholder')}
                          className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                          {t('stock_jodo.expiry_label')}
                        </label>
                        <input
                          ref={expiryInputRef}
                          type="text"
                          value={expiryInput}
                          onChange={(e) => setExpiryInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              packsInputRef.current?.focus();
                            }
                          }}
                          placeholder={t('stock_jodo.expiry_placeholder')}
                          className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                        />
                      </div>
                    </div>

                    {/* 3. Packs & Free Packs */}
                    <div className="grid grid-cols-2 gap-space-sm">
                      <div>
                        <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                          {t('stock_jodo.packs_label')}
                        </label>
                        <input
                          ref={packsInputRef}
                          type="number"
                          min="0"
                          value={packsInput}
                          onChange={(e) => setPacksInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              freePacksInputRef.current?.focus();
                            }
                          }}
                          placeholder={t('stock_jodo.packs_placeholder')}
                          className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                          {t('stock_jodo.free_packs_label')}
                        </label>
                        <input
                          ref={freePacksInputRef}
                          type="number"
                          min="0"
                          value={freePacksInput}
                          onChange={(e) => setFreePacksInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              rateInputRef.current?.focus();
                            }
                          }}
                          placeholder={t('stock_jodo.free_packs_placeholder')}
                          className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                        />
                      </div>
                    </div>

                    {/* 4. Kharid Rate & MRP */}
                    <div className="grid grid-cols-2 gap-space-sm">
                      <div>
                        <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                          {t('stock_jodo.purchase_rate_label')}
                        </label>
                        <input
                          ref={rateInputRef}
                          type="number"
                          step="0.01"
                          min="0"
                          value={purchaseRateInput}
                          onChange={(e) => setPurchaseRateInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              mrpInputRef.current?.focus();
                            }
                          }}
                          placeholder={
                            editingLineId && !isOwner
                              ? t('stock_jodo.purchase_rate_hint_staff')
                              : t('stock_jodo.purchase_rate_placeholder')
                          }
                          className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                          {t('stock_jodo.mrp_label')}
                        </label>
                        <input
                          ref={mrpInputRef}
                          type="number"
                          step="0.01"
                          min="0"
                          value={mrpInput}
                          onChange={(e) => setMrpInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCommitLine();
                            }
                          }}
                          placeholder={t('stock_jodo.mrp_placeholder')}
                          className="w-full h-12 mt-1 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary shadow-inner"
                        />
                      </div>
                    </div>

                    {/* Error message under form if invalid */}
                    {lineError && (
                      <div className="text-error font-label-sub-english font-bold pt-1">
                        {lineError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Add / Update Line Button */}
                <div className="flex gap-space-xs mt-space-xs">
                  {editingLineId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLineId(null);
                        setSelectedMedicine(null);
                        setSearchQuery('');
                        setBatchNo('');
                        setExpiryInput('');
                        setPacksInput('1');
                        setFreePacksInput('0');
                        setPurchaseRateInput('');
                        setMrpInput('');
                      }}
                      className="h-[60px] px-space-md rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-title-hinglish cursor-pointer"
                    >
                      {tButton('stock_jodo.btn_cancel_edit').main}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCommitLine}
                    className="flex-1 h-[60px] rounded-xl bg-primary-container hover:bg-primary active:translate-y-0.5 text-on-primary shadow-md flex items-center justify-center gap-space-sm transition-transform cursor-pointer"
                  >
                    <Icon
                      name={editingLineId ? 'check_circle' : 'add_circle'}
                      className="text-[32px]"
                    />
                    <div className="flex flex-col items-start leading-none">
                      <span className="font-button-text text-button-text font-bold">
                        {editingLineId ? updateLineLabel.main : addLineLabel.main}
                      </span>
                      <span className="font-label-sub-english text-label-sub-english text-primary-fixed">
                        {editingLineId ? updateLineLabel.sub : addLineLabel.sub}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Right Card (55% Width): Jodi gayi dawaiyan list */}
              <div className="w-full lg:w-[55%] bg-surface-container-lowest dark:bg-gray-900 rounded-xl shadow-md p-space-md flex flex-col justify-between overflow-hidden border border-outline-variant/30">
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex items-center justify-between mb-space-sm shrink-0">
                    <div>
                      <h2 className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                        {t('stock_jodo.added_medicines_title')}
                      </h2>
                      {shouldShowSub(t('stock_jodo.added_medicines_title'), t('stock_jodo.added_medicines_sub')) && (
                        <p className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {t('stock_jodo.added_medicines_sub')}
                        </p>
                      )}
                    </div>
                    <div className="px-space-sm py-1 bg-surface-container dark:bg-gray-800 rounded-lg">
                      <span className="font-title-hinglish text-title-hinglish text-primary font-bold">
                        {lines.length} {t('stock_jodo.lines_count_tag')}
                      </span>
                    </div>
                  </div>

                  {/* Medicine Rows */}
                  <div className="flex flex-col gap-space-xs flex-1 overflow-y-auto pr-1">
                    {lines.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-space-lg text-on-surface-variant">
                        <Icon name="receipt_long" className="text-[48px] opacity-40 mb-2" />
                        <p className="font-body-lg font-bold">{t('stock_jodo.empty_lines_title')}</p>
                        <p className="font-label-sub-english text-outline">
                          {t('stock_jodo.empty_lines_sub')}
                        </p>
                      </div>
                    ) : (
                      lines.map((l) => (
                        <div
                          key={l.id}
                          className="min-h-[64px] px-space-md py-2 bg-surface dark:bg-gray-800 rounded-xl shadow-sm flex items-center justify-between hover:bg-surface-container transition-colors shrink-0"
                        >
                          <div
                            onClick={() => handleEditLine(l)}
                            className="flex items-center gap-space-sm min-w-0 cursor-pointer flex-1"
                          >
                            <Icon name="check_circle" className="text-primary text-[24px] shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-body-md font-bold text-on-surface truncate">
                                {l.medicineName} {l.strength || ''} · {l.batchNo} · {l.expiryMonthYear}
                              </span>
                              <span className="font-label-sub-english text-on-surface-variant text-[13px]">
                                {t('stock_jodo.packs_count', { count: l.packs })}{l.freePacks > 0 ? ` (+${l.freePacks} ${t('common.free')})` : ''} · {t('medicine.mrp_label')} {formatRupees(l.mrpPaise)}
                                {/* ROLE ACCESS CONTROL: Only owner sees purchase rate */}
                                {isOwner ? (
                                  <span className="ml-2 font-bold text-primary">
                                    · {formatRupees(l.purchaseRatePaise)} ({formatRupees(l.packs * l.purchaseRatePaise)})
                                  </span>
                                ) : (
                                  <span className="ml-2 inline-flex items-center gap-0.5 text-primary text-[12px] font-bold">
                                    <Icon name="done" className="text-[14px]" />
                                    {t('stock_jodo.rate_entered_badge')}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => handleEditLine(l)}
                              className="text-on-surface-variant hover:bg-surface-container px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              <Icon name="edit" className="text-[20px]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setLineToDeleteId(l.id)}
                              className="flex items-center gap-1 text-error hover:bg-error-container px-space-sm py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              <Icon name="delete" className="text-[22px]" />
                              <span className="font-title-hinglish text-title-hinglish">
                                {t('stock_jodo.btn_delete_line')}
                              </span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Context Info Deck */}
                  <div className="mt-space-xs p-space-sm rounded-xl bg-surface-container-low dark:bg-gray-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-xs text-on-surface-variant">
                      <Icon name="receipt_long" className="text-[24px]" />
                      <span className="font-label-sub-english text-label-sub-english font-bold">
                        {t('stock_jodo.total_packs_entered', { count: totalPacksSum + totalFreePacksSum })}
                      </span>
                    </div>

                    {/* ROLE ACCESS CONTROL: Only owner sees total money */}
                    {isOwner ? (
                      <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                        {t('stock_jodo.total_amount_display', { amount: formatRupees(totalPaiseSum) })}
                      </span>
                    ) : (
                      <span className="font-label-sub-english text-label-sub-english text-primary font-bold">
                        {t('stock_jodo.items_count', { count: lines.length })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Navigation */}
            <div className="flex items-center justify-between w-full pt-1 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="h-[60px] min-w-[140px] sm:min-w-[200px] px-space-md sm:px-space-lg rounded-xl bg-surface-container-highest hover:bg-surface-dim active:translate-y-0.5 text-on-surface shadow-sm flex items-center gap-space-sm transition-transform cursor-pointer"
              >
                <Icon name="arrow_back" className="text-[32px]" />
                <div className="flex flex-col items-start leading-none">
                  <span className="font-button-text text-button-text font-bold">
                    {backButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                    {backButtonLabel.sub}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={lines.length === 0}
                onClick={() => {
                  setCurrentStep(4);
                }}
                className={`h-[60px] min-w-[150px] sm:min-w-[220px] px-space-md sm:px-space-lg rounded-xl flex items-center justify-between gap-space-sm transition-transform active:translate-y-0.5 ${
                  lines.length > 0
                    ? 'bg-primary hover:bg-primary-container text-on-primary shadow-md cursor-pointer'
                    : 'bg-surface-container-highest text-outline opacity-60 cursor-not-allowed shadow-none'
                }`}
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="font-button-text text-button-text font-bold">
                    {nextButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english text-primary-fixed">
                    {nextButtonLabel.sub}
                  </span>
                </div>
                <Icon name="arrow_forward" className="text-[32px]" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 4: REVIEW & SAVE (23d) */}
        {/* ============================================================== */}
        {currentStep === 4 && (
          <div className="flex flex-col w-full max-w-[1440px] mx-auto h-[calc(100vh-4rem)] px-4 sm:px-gutter py-space-sm sm:py-space-md select-none overflow-y-auto lg:overflow-hidden justify-between">
            {/* Top Progress & Header */}
            <div className="flex flex-col gap-space-xs shrink-0 mb-space-xs">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h1 className="font-headline-md text-headline-md text-on-surface flex items-center gap-space-xs font-bold">
                    <span>{t('stock_jodo.step4_title')}</span>
                  </h1>
                  {shouldShowSub(t('stock_jodo.step4_title'), t('stock_jodo.step4_sub')) && (
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('stock_jodo.step4_sub')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-space-xs px-space-sm py-1 bg-surface-container dark:bg-gray-800 rounded-full">
                  <Icon name="task_alt" className="text-primary text-[20px]" filled={true} />
                  <span className="font-label-sub-english text-label-sub-english text-primary font-bold">
                    {t('stock_jodo.step4_tag')}
                  </span>
                </div>
              </div>

              {/* 4 segments fully filled */}
              <div className="w-full grid grid-cols-4 gap-space-xs mt-1">
                <div className="h-2.5 rounded-full bg-primary shadow-sm"></div>
                <div className="h-2.5 rounded-full bg-primary shadow-sm"></div>
                <div className="h-2.5 rounded-full bg-primary shadow-sm"></div>
                <div className="h-2.5 rounded-full bg-primary shadow-sm"></div>
              </div>
            </div>

            {/* Main Split Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md lg:gap-gutter flex-1 min-h-0 items-stretch overflow-y-auto lg:overflow-visible">
              {/* Left Section: 5 of 12 cols (Supplier & Bill info) */}
              <div className="col-span-1 lg:col-span-5 flex flex-col justify-between bg-surface-container-lowest dark:bg-gray-900 rounded-2xl shadow-sm p-space-md min-h-0 overflow-y-auto border border-outline-variant/30">
                <div className="flex flex-col gap-space-md">
                  <div className="flex items-center justify-between pb-space-xs">
                    <div className="flex items-center gap-space-xs">
                      <div className="w-10 h-10 rounded-xl bg-surface-container dark:bg-gray-800 flex items-center justify-center text-primary">
                        <Icon name="receipt_long" className="text-[24px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                          {t('stock_jodo.review_supplier_title')}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {t('stock_jodo.review_supplier_sub')}
                        </span>
                      </div>
                    </div>
                    <span className="px-space-sm py-0.5 rounded-lg bg-surface-container-high dark:bg-gray-800 text-on-surface-variant font-label-sub-english text-label-sub-english font-medium">
                      {t('stock_jodo.auto_read_badge')}
                    </span>
                  </div>

                  {/* Supplier Card */}
                  <div className="bg-surface-container-low dark:bg-gray-800 rounded-xl p-space-sm flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                        {t('stock_jodo.label_supplier')}
                      </span>
                      <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                        {selectedSupplier?.name}
                      </span>
                    </div>
                    {selectedSupplier?.phone && (
                      <div className="flex items-center gap-space-xs bg-surface-container-lowest dark:bg-gray-900 px-space-sm py-1.5 rounded-lg shadow-sm">
                        <Icon name="call" className="text-primary text-[18px]" />
                        <span className="font-body-md text-body-md font-bold text-on-surface">
                          {selectedSupplier.phone}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Invoice Details Grid */}
                  <div className="grid grid-cols-2 gap-space-sm">
                    <div className="bg-surface-container-low dark:bg-gray-800 rounded-xl p-space-sm flex flex-col">
                      <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                        {t('stock_jodo.label_invoice_no')}
                      </span>
                      <span className="font-body-lg text-body-lg text-on-surface font-bold mt-0.5">
                        {invoiceNo}
                      </span>
                    </div>
                    <div className="bg-surface-container-low dark:bg-gray-800 rounded-xl p-space-sm flex flex-col">
                      <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                        {t('stock_jodo.label_invoice_date')}
                      </span>
                      <span className="font-body-lg text-body-lg text-on-surface font-bold mt-0.5">
                        {invoiceDate}
                      </span>
                    </div>
                  </div>

                  {/* Invoice Photo Thumbnail */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                        {t('stock_jodo.label_invoice_photo')}
                      </span>
                      <div className="flex items-center gap-1 text-primary">
                        <Icon name="check_circle" className="text-[18px]" />
                        <span className="font-label-sub-english text-label-sub-english font-bold">
                          {t('stock_jodo.photo_attached_badge')}
                        </span>
                      </div>
                    </div>

                    <div
                      onClick={() => setInspectPhotoOpen(true)}
                      className="relative w-full h-28 bg-surface-container dark:bg-gray-800 rounded-xl p-space-sm flex items-center justify-between overflow-hidden shadow-inner cursor-pointer hover:bg-surface-container-high transition-colors"
                    >
                      <div className="flex items-center gap-space-md">
                        <div className="w-16 h-20 bg-surface-container-lowest dark:bg-gray-900 rounded-lg shadow-sm p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          <img
                            src={invoicePhoto}
                            alt={t('stock_jodo.alt_thumbnail')}
                            className="w-full h-full object-cover rounded"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-body-md text-body-md font-bold text-on-surface truncate">
                            {selectedSupplier?.name}
                          </span>
                          <span className="font-label-sub-english text-label-sub-english text-primary font-medium mt-1 flex items-center gap-1">
                            <Icon name="visibility" className="text-[16px]" />
                            {t('stock_jodo.photo_inspect_hint')}
                          </span>
                        </div>
                      </div>
                      <div className="h-10 w-10 rounded-full bg-surface-container-lowest dark:bg-gray-900 shadow-sm flex items-center justify-center text-on-surface-variant">
                        <Icon name="zoom_in" className="text-[20px]" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-high dark:bg-gray-800 rounded-xl p-space-sm flex items-start gap-space-xs mt-2">
                  <Icon name="info" className="text-primary text-[22px] shrink-0 mt-0.5" />
                  <p className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-snug">
                    {t('stock_jodo.review_warning_note')}
                  </p>
                </div>
              </div>

              {/* Right Section: 7 of 12 cols (Medicines Table & Grand Total Deck) */}
              <div className="col-span-1 lg:col-span-7 flex flex-col justify-between bg-surface-container-lowest dark:bg-gray-900 rounded-2xl shadow-sm p-space-md min-h-0 border border-outline-variant/30 overflow-hidden">
                <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                  <div className="flex items-center justify-between pb-space-xs mb-space-xs shrink-0">
                    <div className="flex items-center gap-space-xs">
                      <div className="w-10 h-10 rounded-xl bg-surface-container dark:bg-gray-800 flex items-center justify-center text-primary">
                        <Icon name="medication" className="text-[24px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                          {t('stock_jodo.review_medicines_title')}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                          {lines.length} {t('stock_jodo.review_medicines_sub')}
                        </span>
                      </div>
                    </div>
                    <span className="font-label-sub-english text-label-sub-english text-primary bg-surface-container dark:bg-gray-800 px-space-sm py-1 rounded-lg font-bold">
                      {t('stock_jodo.all_batches_verified')}
                    </span>
                  </div>

                  {/* Table Header: Dynamically rendered based on Role */}
                  <div className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div
                      className={`grid ${
                        reviewData.canSeeRates ? 'grid-cols-12' : 'grid-cols-10'
                      } gap-space-xs bg-surface-container dark:bg-gray-800 py-2.5 px-space-sm rounded-xl text-on-surface-variant font-label-sub-english text-label-sub-english font-bold shrink-0`}
                    >
                      <div className="col-span-4">{t('stock_jodo.table_head_medicine')}</div>
                      <div className="col-span-2 text-center">{t('stock_jodo.table_head_batch')}</div>
                      <div className="col-span-2 text-center">{t('stock_jodo.table_head_expiry')}</div>
                      <div className="col-span-2 text-center">{t('stock_jodo.table_head_packs')}</div>
                      {reviewData.canSeeRates && (
                        <>
                          <div className="col-span-1 text-right">{t('stock_jodo.table_head_rate')}</div>
                          <div className="col-span-1 text-right">{t('stock_jodo.table_head_amount')}</div>
                        </>
                      )}
                    </div>

                    {/* Table Body */}
                    <div className="flex-1 overflow-y-auto divide-y divide-surface-container-high">
                      {reviewData.lines.map((l: any) => (
                        <div
                          key={l.id}
                          className={`grid ${
                            reviewData.canSeeRates ? 'grid-cols-12' : 'grid-cols-10'
                          } gap-space-xs py-3 px-space-sm items-center bg-surface-container-lowest dark:bg-gray-900 hover:bg-surface-container-low transition-colors rounded-xl my-1 shadow-sm`}
                        >
                          <div className="col-span-4 flex flex-col">
                            <span className="font-body-lg text-body-lg font-bold text-on-surface">
                              {l.medicineName}
                            </span>
                            <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                              {l.strength || ''}
                            </span>
                          </div>

                          <div className="col-span-2 text-center">
                            <span className="px-space-xs py-0.5 rounded bg-surface-container-high dark:bg-gray-800 font-body-md text-body-md font-bold text-on-surface">
                              {l.batchNo}
                            </span>
                          </div>

                          <div className="col-span-2 text-center font-body-md text-body-md text-on-surface">
                            {l.expiryMonthYear}
                          </div>

                          <div className="col-span-2 text-center flex flex-col items-center">
                            <span className="font-body-md text-body-md font-bold text-on-surface">
                              {l.packs}
                            </span>
                            {l.freePacks > 0 && (
                              <span className="font-label-sub-english text-[14px] text-primary font-bold">
                                +{l.freePacks} {t('common.free')}
                              </span>
                            )}
                          </div>

                          {/* ROLE ACCESS CONTROL: Only owner sees rate and amount */}
                          {reviewData.canSeeRates && (
                            <>
                              <div className="col-span-1 text-right font-body-md text-body-md text-on-surface">
                                {formatRupees(l.purchaseRatePaise)}
                              </div>
                              <div className="col-span-1 text-right font-body-lg text-body-lg font-bold text-on-surface">
                                {formatRupees(l.lineAmountPaise)}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Grand Total Deck */}
                <div className="bg-surface-container-low dark:bg-gray-800 rounded-2xl p-space-md flex items-center justify-between shadow-inner mt-space-sm shrink-0">
                  <div className="flex flex-col">
                    <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                      {t('stock_jodo.grand_total_title')}
                    </span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                      {t('stock_jodo.grand_total_sub', {
                        items: lines.length,
                        packs: reviewData.totalPacks,
                        free: reviewData.totalFreePacks,
                      })}
                    </span>
                  </div>

                  {/* ROLE ACCESS CONTROL: Only owner sees Grand Total in Rupees */}
                  {reviewData.canSeeRates ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-title-hinglish text-title-hinglish text-primary font-bold">
                        {t('stock_jodo.total_label')}
                      </span>
                      <span className="font-display-total text-[36px] leading-tight font-extrabold text-primary">
                        {formatRupees(reviewData.totalPaise)}
                      </span>
                    </div>
                  ) : (
                    <div className="px-space-md py-1.5 bg-primary/10 rounded-xl">
                      <span className="font-title-hinglish text-title-hinglish text-primary font-bold">
                        {t('stock_jodo.total_packs_badge', { count: reviewData.totalPacks + reviewData.totalFreePacks })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Save Error Banner if any */}
                {saveErrorMessage && (
                  <div className="mt-2 p-space-sm bg-error-container text-error rounded-xl font-body-md font-bold text-center">
                    {saveErrorMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="w-full flex items-center justify-between pt-space-xs shrink-0">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="h-16 px-space-md sm:px-space-lg bg-surface-container dark:bg-gray-800 hover:bg-surface-container-high active:translate-y-0.5 rounded-2xl flex items-center gap-space-sm text-on-surface transition-all shadow-sm cursor-pointer min-w-[140px] sm:min-w-[180px]"
              >
                <Icon name="arrow_back" className="text-[28px] text-on-surface-variant" />
                <div className="flex flex-col text-left">
                  <span className="font-title-hinglish text-title-hinglish leading-tight text-on-surface font-bold">
                    {backButtonLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english leading-none text-on-surface-variant">
                    {backButtonLabel.sub}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSavePurchase}
                className={`h-16 px-space-md sm:px-space-xl bg-primary hover:bg-primary-container active:translate-y-0.5 rounded-2xl flex items-center gap-space-sm sm:gap-space-md text-on-primary transition-all shadow-md cursor-pointer min-w-[160px] sm:min-w-[240px] ${
                  isSaving ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                <Icon
                  name={isSaving ? 'hourglass_empty' : 'check_circle'}
                  className="text-[32px] text-on-primary"
                  filled={true}
                />
                <div className="flex flex-col text-left">
                  <span className="font-button-text text-button-text font-bold leading-tight text-on-primary">
                    {isSaving ? t('stock_jodo.saving_in_progress') : confirmSaveLabel.main}
                  </span>
                  <span className="font-label-sub-english text-label-sub-english leading-none text-primary-fixed">
                    {confirmSaveLabel.sub}
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 5: SAVED SUCCESS (23e) */}
        {/* ============================================================== */}
        {currentStep === 'saved' && (
          <div className="flex flex-col w-full max-w-[1440px] mx-auto h-[calc(100vh-4rem)] p-4 sm:p-space-lg items-center justify-center select-none overflow-y-auto">
            <div className="w-full max-w-2xl bg-surface-container-lowest dark:bg-gray-900 rounded-xl shadow-xl p-space-xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="w-28 h-28 rounded-full bg-surface-container-low dark:bg-gray-800 flex items-center justify-center mb-space-lg shadow-sm">
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-md">
                  <Icon
                    name="check_circle"
                    className="text-[54px]"
                    filled={true}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center gap-space-xs mb-space-xl">
                <h1 className="font-display-total-mobile text-display-total-mobile text-on-surface font-extrabold tracking-tight">
                  {t('stock_jodo.saved_title')}
                </h1>
                <p className="font-headline-md text-headline-md text-on-surface-variant font-medium">
                  {t('stock_jodo.saved_sub', {
                    items: saveResult?.itemsCount ?? lines.length,
                    batches: saveResult?.batchesCreatedOrUsed ?? lines.length,
                  })}
                </p>
              </div>

              {/* Stats Bar */}
              <div className="w-full bg-surface-container-low dark:bg-gray-800 rounded-xl p-space-md mb-space-xl flex items-center justify-around">
                <div className="flex flex-col items-center">
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {t('stock_jodo.stat_medicines_count')}
                  </span>
                  <span className="font-headline-md text-headline-md text-on-surface font-bold">
                    {t('stock_jodo.items_count', { count: saveResult?.itemsCount ?? lines.length })}
                  </span>
                </div>

                <div className="w-1 h-8 bg-outline-variant rounded-full"></div>

                <div className="flex flex-col items-center">
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {t('stock_jodo.stat_batches_count')}
                  </span>
                  <span className="font-headline-md text-headline-md text-primary font-bold">
                    {t('stock_jodo.stat_batches_added', { count: saveResult?.batchesCreatedOrUsed ?? lines.length })}
                  </span>
                </div>

                <div className="w-1 h-8 bg-outline-variant rounded-full"></div>

                <div className="flex flex-col items-center">
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {isOwner ? t('stock_jodo.stat_total_amount') : t('stock_jodo.stat_total_packs')}
                  </span>
                  <span className="font-headline-md text-headline-md text-secondary font-bold">
                    {isOwner
                      ? formatRupees(saveResult?.totalPaise ?? totalPaiseSum)
                      : t('stock_jodo.packs_count', { count: saveResult?.totalPacksAdded ?? totalPacksSum + totalFreePacksSum })}
                  </span>
                </div>
              </div>

              {/* Two Bottom Actions */}
              <div className="w-full flex flex-col sm:flex-row gap-space-md items-center justify-center">
                <button
                  type="button"
                  onClick={handleResetForMoreStock}
                  className="w-full sm:w-1/2 min-h-[64px] h-16 bg-surface-container dark:bg-gray-800 rounded-xl flex items-center justify-center gap-space-sm px-space-md text-on-surface hover:bg-surface-container-high active:translate-y-0.5 transition-all shadow-sm cursor-pointer"
                >
                  <Icon
                    name="add_box"
                    className="text-[32px] text-primary"
                    filled={true}
                  />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                      {addMoreStockLabel.main}
                    </span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                      {addMoreStockLabel.sub}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onReturnHome}
                  className="w-full sm:w-1/2 min-h-[64px] h-16 bg-primary text-on-primary rounded-xl flex items-center justify-center gap-space-sm px-space-md hover:bg-primary-container active:translate-y-0.5 transition-all shadow-md cursor-pointer"
                >
                  <Icon
                    name="check"
                    className="text-[32px]"
                    filled={true}
                  />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-title-hinglish text-title-hinglish text-on-primary font-bold">
                      {doneLabel.main}
                    </span>
                    <span className="font-label-sub-english text-label-sub-english text-on-primary-container font-medium">
                      {doneLabel.sub}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* POPUP: ADD NEW SUPPLIER MODAL */}
      {/* ============================================================== */}
      {isNewSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest dark:bg-gray-900 rounded-2xl shadow-2xl p-space-lg flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-headline-md font-bold text-on-surface">
                  {t('stock_jodo.new_supplier_modal_title')}
                </h3>
                <p className="font-label-sub-english text-on-surface-variant">
                  {t('stock_jodo.new_supplier_modal_sub')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewSupplierOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="flex flex-col gap-space-sm">
              <div>
                <label className="block font-label-sub-english text-on-surface-variant font-bold mb-1">
                  {t('stock_jodo.supplier_name_label')} *
                </label>
                <input
                  type="text"
                  {...textFieldProps('name', newSupplierName, setNewSupplierName)}
                  placeholder={t('stock_jodo.supplier_name_placeholder')}
                  className="w-full h-12 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-on-surface placeholder:text-outline/60 outline-none focus:ring-2 focus:ring-primary shadow-inner"
                />
              </div>

              <div>
                <label className="block font-label-sub-english text-on-surface-variant font-bold mb-1">
                  {t('stock_jodo.supplier_phone_label')}
                </label>
                <input
                  type="text"
                  {...textFieldProps('phone', newSupplierPhone, setNewSupplierPhone)}
                  placeholder={t('stock_jodo.supplier_phone_placeholder')}
                  className="w-full h-12 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-on-surface placeholder:text-outline/60 outline-none focus:ring-2 focus:ring-primary shadow-inner"
                />
              </div>

              <div>
                <label className="block font-label-sub-english text-on-surface-variant font-bold mb-1">
                  {t('stock_jodo.supplier_address_label')}
                </label>
                <input
                  type="text"
                  {...textFieldProps('name', newSupplierAddress, setNewSupplierAddress)}
                  placeholder={t('stock_jodo.supplier_address_placeholder')}
                  className="w-full h-12 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-on-surface placeholder:text-outline/60 outline-none focus:ring-2 focus:ring-primary shadow-inner"
                />
              </div>

              <div>
                <label className="block font-label-sub-english text-on-surface-variant font-bold mb-1">
                  {t('stock_jodo.supplier_gst_label')}
                </label>
                <input
                  type="text"
                  {...textFieldProps('code', newSupplierGst, setNewSupplierGst)}
                  placeholder={t('stock_jodo.supplier_gst_placeholder')}
                  className="w-full h-12 px-space-sm bg-surface-container-low dark:bg-gray-800 rounded-lg font-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary shadow-inner"
                />
              </div>

              {supplierError && (
                <div className="text-error font-label-sub-english font-bold">
                  {supplierError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-space-sm pt-2">
              <button
                type="button"
                onClick={() => setIsNewSupplierOpen(false)}
                className="h-12 px-space-md rounded-xl hover:bg-surface-container text-on-surface font-title-hinglish cursor-pointer"
              >
                {tButton('common.btn_cancel').main}
              </button>
              <button
                type="button"
                onClick={handleCreateSupplier}
                className="h-12 px-space-lg rounded-xl bg-primary text-on-primary hover:bg-primary-container font-title-hinglish font-bold shadow-md cursor-pointer"
              >
                {tButton('stock_jodo.btn_save_supplier').main}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* POPUP: INSPECT INVOICE PHOTO MODAL (Step 4) */}
      {/* ============================================================== */}
      {inspectPhotoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[90vh] bg-surface-container-lowest dark:bg-gray-900 rounded-2xl shadow-2xl p-space-md flex flex-col items-center justify-between overflow-hidden">
            <div className="w-full flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <span className="font-title-hinglish font-bold text-on-surface">
                {selectedSupplier?.name} · {invoiceNo}
              </span>
              <button
                type="button"
                onClick={() => setInspectPhotoOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="w-full flex-1 overflow-auto p-4 flex items-center justify-center">
              <img
                src={invoicePhoto}
                alt={t('stock_jodo.alt_enlarged_invoice')}
                className="max-h-[70vh] object-contain rounded-lg shadow-lg"
              />
            </div>

            <button
              type="button"
              onClick={() => setInspectPhotoOpen(false)}
              className="mt-2 h-12 px-space-xl bg-surface-container hover:bg-surface-container-high rounded-xl font-title-hinglish font-bold cursor-pointer"
            >
              {t('stock_jodo.modal_close')}
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRMATION: DUPLICATE INVOICE WARNING */}
      {/* ============================================================== */}
      <ConfirmDialog
        isOpen={duplicateWarningOpen}
        title={t('stock_jodo.duplicate_invoice_title')}
        subtitle={t('stock_jodo.duplicate_invoice_sub')}
        onConfirm={() => {
          setDuplicateWarningOpen(false);
          setCurrentStep(2);
        }}
        onCancel={() => setDuplicateWarningOpen(false)}
        confirmLabel={t('stock_jodo.duplicate_invoice_proceed')}
        confirmSubLabel=""
        cancelLabel={tButton('common.btn_cancel').main}
        cancelSubLabel={tButton('common.btn_cancel').sub}
        isDanger={false}
      />

      {/* ============================================================== */}
      {/* CONFIRMATION: DELETE MEDICINE LINE */}
      {/* ============================================================== */}
      <ConfirmDialog
        isOpen={Boolean(lineToDeleteId)}
        title={t('stock_jodo.confirm_delete_line_title')}
        subtitle={t('stock_jodo.confirm_delete_line_sub')}
        onConfirm={handleConfirmDeleteLine}
        onCancel={() => setLineToDeleteId(null)}
        confirmLabel={tButton('common.btn_delete').main}
        confirmSubLabel={tButton('common.btn_delete').sub}
        cancelLabel={tButton('common.btn_cancel').main}
        cancelSubLabel={tButton('common.btn_cancel').sub}
      />

      {/* ============================================================== */}
      {/* CONFIRMATION: EXPIRED BATCH WARNING */}
      {/* ============================================================== */}
      <ConfirmDialog
        isOpen={isExpiryConfirmOpen}
        title={t('stock_jodo.expiry_warning_title')}
        subtitle={t('stock_jodo.expiry_warning_sub')}
        onConfirm={() => {
          if (pendingLineToAdd) applyLine(pendingLineToAdd);
          setPendingLineToAdd(null);
          setIsExpiryConfirmOpen(false);
        }}
        onCancel={() => {
          setPendingLineToAdd(null);
          setIsExpiryConfirmOpen(false);
        }}
        confirmLabel={tButton('dialogs.btn_haan_jodo').main}
        confirmSubLabel={tButton('dialogs.btn_haan_jodo').sub}
        cancelLabel={tButton('common.btn_cancel').main}
        cancelSubLabel={tButton('common.btn_cancel').sub}
      />

      {/* ============================================================== */}
      {/* CONFIRMATION: LEAVE DRAFT IN PROGRESS */}
      {/* ============================================================== */}
      <ConfirmDialog
        isOpen={isLeaveConfirmOpen}
        title={t('medicine_form.confirm_discard_title')}
        subtitle={t('medicine_form.confirm_discard_sub')}
        onConfirm={() => {
          setIsLeaveConfirmOpen(false);
          onReturnHome();
        }}
        onCancel={() => setIsLeaveConfirmOpen(false)}
        confirmLabel={tButton('dialogs.btn_haan_wapas').main}
        confirmSubLabel={tButton('dialogs.btn_haan_wapas').sub}
        cancelLabel={tButton('common.btn_cancel').main}
        cancelSubLabel={tButton('common.btn_cancel').sub}
      />
    </div>
  );
};
