import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db, type DBUser, type HeldBill, type Medicine, type UnitMode } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApprovalDialog } from '../components/ApprovalDialog';
import { useShop } from '../logic/useShop';
import { formatRupees } from '../logic/money';
import { searchMedicines } from '../logic/medicineSearch';
import { isExpired, pickBatchesForSale } from '../logic/stock';
import { triggerFeedback } from '../logic/feedback';
import { DEFAULT_APPROVAL_RULES, type ApprovalActionCategory, type ApprovalRuleType } from '../logic/approvals';
import {
  calculateBillTotals,
  computeQtyUnits,
  deleteHeldBill,
  generateNextBillNo,
  getDiscountLimitPercent,
  getHeldBills,
  holdBill,
  type BillDraft,
  type BillLineInput,
  type FinalizeBillResult,
  DEFAULT_DISCOUNT_LIMIT_PERCENT,
} from '../logic/billing';
import { BillPanel } from './dawai-becho/BillPanel';
import { MedicineCatalogPanel } from './dawai-becho/MedicineCatalogPanel';
import { ScheduleHModal } from './dawai-becho/ScheduleHModal';
import { OutOfStockModal } from './dawai-becho/OutOfStockModal';
import { HeldBillsModal } from './dawai-becho/HeldBillsModal';
import { PaymentScreen } from './dawai-becho/PaymentScreen';
import { BillDoneScreen } from './dawai-becho/BillDoneScreen';
import { OldBillsReturnScreen } from './dawai-becho/OldBillsReturnScreen';
import type { CartItem, SerializedHeldCartItem } from './dawai-becho/types';
import { useIsCompactViewport } from '../logic/useViewport';
import { textFieldProps } from '../logic/format';

function formatShortExpiry(isoExpiry: string): string {
  if (!isoExpiry) return '';
  const parts = isoExpiry.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0].slice(-2)}`;
  }
  return isoExpiry;
}

export interface DawaiBechoProps {
  onReturnHome: () => void;
  onProceedToPayment?: (draft: BillDraft, approvalVerified: boolean) => void;
  onOpenOldBills?: () => void;
  onOpenReturns?: () => void;
  currentUser?: DBUser | { id?: string; name: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const DawaiBecho: React.FC<DawaiBechoProps> = ({
  onReturnHome,
  onProceedToPayment,
  onOpenOldBills,
  onOpenReturns,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Inventory & catalog state
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [validStockMap, setValidStockMap] = useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [nextBillNo, setNextBillNo] = useState<string>('0001');
  const [discountLimit, setDiscountLimit] = useState<number>(DEFAULT_DISCOUNT_LIMIT_PERCENT);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);

  // Active bill cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [wholeBillDiscountPercent, setWholeBillDiscountPercent] = useState<number>(0);
  const [discountApproved, setDiscountApproved] = useState<boolean>(false);

  // Modals & mobile sheet state
  const [scheduleHMedicine, setScheduleHMedicine] = useState<Medicine | null>(null);
  const [outOfStockMedicine, setOutOfStockMedicine] = useState<Medicine | null>(null);
  const [isHeldModalOpen, setIsHeldModalOpen] = useState<boolean>(false);
  const [isNewBillConfirmOpen, setIsNewBillConfirmOpen] = useState<boolean>(false);
  const [isApprovalOpen, setIsApprovalOpen] = useState<boolean>(false);
  const [isMobileBillSheetOpen, setIsMobileBillSheetOpen] = useState<boolean>(false);
  const isCompactViewport = useIsCompactViewport();
  const [showCompactMeta, setShowCompactMeta] = useState<boolean>(false);
  const [activeScreen, setActiveScreen] = useState<
    'billing' | 'payment' | 'bill_done' | 'old_bills'
  >('billing');
  const [activePaymentDraft, setActivePaymentDraft] = useState<{
    draft: BillDraft;
    approvalVerified: boolean;
  } | null>(null);
  const [completedBillResult, setCompletedBillResult] = useState<FinalizeBillResult | null>(null);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName: string =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier')) ||
    'Staff';

  const loadCatalogAndSettings = useCallback(async () => {
    try {
      const [allMeds, allBatches, allMovements, billNoInfo, limit, held] = await Promise.all([
        db.medicines.toArray(),
        db.batches.toArray(),
        db.stockMovements.toArray(),
        generateNextBillNo(),
        getDiscountLimitPercent(),
        getHeldBills(),
      ]);

      const activeMeds = allMeds.filter((m) => m.active !== false);
      activeMeds.sort((a, b) => a.name.localeCompare(b.name));

      // Compute valid non-expired stock per medicine
      const batchStockSums: Record<number, number> = {};
      for (const mv of allMovements) {
        batchStockSums[mv.batchId] = (batchStockSums[mv.batchId] || 0) + mv.qtyUnits;
      }

      const validByMed: Record<number, number> = {};
      for (const b of allBatches) {
        if (b.id === undefined || isExpired(b)) continue;
        const st = batchStockSums[b.id] || 0;
        if (st > 0) {
          validByMed[b.medicineId] = (validByMed[b.medicineId] || 0) + st;
        }
      }

      setMedicines(activeMeds);
      setValidStockMap(validByMed);
      setNextBillNo(billNoInfo.billNo);
      setDiscountLimit(limit);
      setHeldBills(held);
    } catch (err) {
      console.error('Failed to load Dawai Becho catalog:', err);
    }
  }, []);

  useEffect(() => {
    loadCatalogAndSettings();
  }, [loadCatalogAndSettings]);

  // Autofocus search box on mount and after modals close
  useEffect(() => {
    if (
      activeScreen === 'billing' &&
      !scheduleHMedicine &&
      !outOfStockMedicine &&
      !isHeldModalOpen &&
      !isNewBillConfirmOpen &&
      !isApprovalOpen
    ) {
      searchInputRef.current?.focus();
    }
  }, [
    activeScreen,
    scheduleHMedicine,
    outOfStockMedicine,
    isHeldModalOpen,
    isNewBillConfirmOpen,
    isApprovalOpen,
  ]);

  // Live bill math from billing.ts
  const totals = useMemo(() => {
    const lineInputs: BillLineInput[] = cart.map((item) => ({
      medicineId: item.medicine.id || 0,
      medicineName: item.medicine.name,
      mrpPaise: item.medicine.mrpPaise,
      unitsPerPack: item.medicine.unitsPerPack,
      gstPercent: item.medicine.gstPercent,
      unitMode: item.unitMode,
      qtyInput: item.qtyInput,
      itemDiscountPercent: item.itemDiscountPercent,
      isScheduleH: item.medicine.scheduleType === 'H' || item.medicine.scheduleType === 'H1',
      patientName: item.patientName,
      doctorName: item.doctorName,
      prescriptionChecked: item.prescriptionChecked,
    }));

    return calculateBillTotals(lineInputs, wholeBillDiscountPercent, discountLimit);
  }, [cart, wholeBillDiscountPercent, discountLimit]);

  const filteredMedicines = useMemo(() => {
    return searchMedicines(medicines, searchQuery);
  }, [medicines, searchQuery]);

  // Helper: units currently in cart for a given medicineId (optionally excluding one line)
  const getCartUnitsForMedicine = useCallback(
    (medicineId: number, excludeLineId?: string): number => {
      return cart.reduce((sum, item) => {
        if (item.medicine.id === medicineId && item.id !== excludeLineId) {
          return sum + computeQtyUnits(item.qtyInput, item.medicine.unitsPerPack, item.unitMode);
        }
        return sum;
      }, 0);
    },
    [cart]
  );

  // Briefly flash highlight on a line row
  const flashRow = useCallback((lineId: string) => {
    setTimeout(() => {
      setCart((prev) =>
        prev.map((item) => (item.id === lineId ? { ...item, isHighlighted: false } : item))
      );
    }, 1100);
  }, []);

  // Actually add medicine (after passing stock + Schedule H checks)
  const commitMedicineToCart = useCallback(
    async (
      med: Medicine,
      rxMeta?: { patientName: string; doctorName: string; prescriptionChecked: boolean }
    ) => {
      if (!med.id) return;
      const validUnits = validStockMap[med.id] || 0;
      const inCartUnits = getCartUnitsForMedicine(med.id);
      const remainingUnits = validUnits - inCartUnits;

      if (remainingUnits <= 0) {
        triggerFeedback('error', t('dawai_becho.oos_title'));
        setOutOfStockMedicine(med);
        return;
      }

      const upp = Math.max(1, med.unitsPerPack || 1);
      // Pick Pack mode if at least 1 full pack remains, otherwise fall back to Loose mode
      const initialUnitMode: UnitMode = remainingUnits >= upp ? 'pack' : 'loose';
      const qtyUnitsToAdd = initialUnitMode === 'pack' ? upp : 1;

      const isSchH = med.scheduleType === 'H' || med.scheduleType === 'H1';

      // If non-Schedule H and an identical medicine + pack line already exists, increment it
      const existingLine = !isSchH
        ? cart.find((c) => c.medicine.id === med.id && c.unitMode === initialUnitMode)
        : undefined;

      if (existingLine) {
        const nextQtyInput = existingLine.qtyInput + 1;
        const otherCartUnits = getCartUnitsForMedicine(med.id, existingLine.id);
        const nextLineUnits = computeQtyUnits(nextQtyInput, upp, existingLine.unitMode);
        if (otherCartUnits + nextLineUnits > validUnits) {
          triggerFeedback(
            'error',
            t('dawai_becho.err_insufficient_stock', { available: validUnits, name: med.name })
          );
          return;
        }

        const pick = await pickBatchesForSale(med.id, otherCartUnits + nextLineUnits);
        if (!pick.ok) {
          triggerFeedback('error', t('dawai_becho.oos_title'));
          return;
        }

        setCart((prev) =>
          prev.map((item) =>
            item.id === existingLine.id
              ? {
                  ...item,
                  qtyInput: nextQtyInput,
                  allocations: pick.allocations.map((a) => ({
                    batchId: a.batch.id!,
                    batchNo: a.batch.batchNo,
                    expiry: a.batch.expiry,
                    qtyUnits: a.qtyUnits,
                    shelf: a.batch.shelf || med.shelf,
                  })),
                  isHighlighted: true,
                }
              : item
          )
        );
        setDiscountApproved(false);
        flashRow(existingLine.id);
        return;
      }

      const pick = await pickBatchesForSale(med.id, inCartUnits + qtyUnitsToAdd);
      if (!pick.ok) {
        triggerFeedback('error', t('dawai_becho.oos_title'));
        setOutOfStockMedicine(med);
        return;
      }

      const newLineId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newItem: CartItem = {
        id: newLineId,
        medicine: med,
        unitMode: initialUnitMode,
        qtyInput: 1,
        itemDiscountPercent: 0,
        allocations: pick.allocations.map((a) => ({
          batchId: a.batch.id!,
          batchNo: a.batch.batchNo,
          expiry: a.batch.expiry,
          qtyUnits: a.qtyUnits,
          shelf: a.batch.shelf || med.shelf,
        })),
        availableValidUnits: validUnits,
        patientName: rxMeta?.patientName || '',
        doctorName: rxMeta?.doctorName || '',
        prescriptionChecked: rxMeta?.prescriptionChecked || false,
        isHighlighted: true,
      };

      setCart((prev) => [...prev, newItem]);
      setDiscountApproved(false);
      flashRow(newLineId);
    },
    [cart, validStockMap, getCartUnitsForMedicine, flashRow, t]
  );

  // Entry point when user taps a medicine or scans exact barcode/short code
  const handleSelectMedicine = useCallback(
    async (med: Medicine) => {
      if (!med.id) return;
      const validUnits = validStockMap[med.id] || 0;
      const inCartUnits = getCartUnitsForMedicine(med.id);

      if (validUnits <= 0 || validUnits - inCartUnits <= 0) {
        triggerFeedback('error', t('dawai_becho.oos_title'));
        setOutOfStockMedicine(med);
        return;
      }

      if (med.scheduleType === 'H' || med.scheduleType === 'H1') {
        setScheduleHMedicine(med);
        return;
      }

      await commitMedicineToCart(med);
    },
    [validStockMap, getCartUnitsForMedicine, commitMedicineToCart, t]
  );

  // Enter key in search input -> immediate add if exact barcode or short code match
  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    const exactMatch = medicines.find(
      (m) =>
        (m.barcode && m.barcode.trim().toLowerCase() === q) ||
        (m.shortCode && m.shortCode.trim().toLowerCase() === q)
    );

    if (exactMatch) {
      e.preventDefault();
      setSearchQuery('');
      await handleSelectMedicine(exactMatch);
    }
  };

  // Toggle Strip / Loose unit mode on a cart line
  const handleToggleUnitMode = async (lineId: string, nextMode: UnitMode) => {
    const target = cart.find((item) => item.id === lineId);
    if (!target || target.unitMode === nextMode || !target.medicine.id) return;

    const upp = Math.max(1, target.medicine.unitsPerPack || 1);
    const validUnits = validStockMap[target.medicine.id] || target.availableValidUnits;
    const otherUnits = getCartUnitsForMedicine(target.medicine.id, lineId);
    const maxForThisLine = Math.max(0, validUnits - otherUnits);

    let nextQty = target.qtyInput;
    let nextUnits = computeQtyUnits(nextQty, upp, nextMode);

    if (nextUnits > maxForThisLine) {
      if (nextMode === 'pack') {
        const maxPacks = Math.floor(maxForThisLine / upp);
        if (maxPacks < 1) {
          triggerFeedback(
            'error',
            t('dawai_becho.err_insufficient_stock', {
              available: validUnits,
              name: target.medicine.name,
            })
          );
          return;
        }
        nextQty = maxPacks;
        nextUnits = maxPacks * upp;
      } else {
        nextQty = Math.max(1, maxForThisLine);
        nextUnits = nextQty;
      }
    }

    const pick = await pickBatchesForSale(target.medicine.id, otherUnits + nextUnits);
    if (!pick.ok) {
      triggerFeedback('error', t('dawai_becho.oos_title'));
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.id === lineId
          ? {
              ...item,
              unitMode: nextMode,
              qtyInput: nextQty,
              allocations: pick.allocations.map((a) => ({
                batchId: a.batch.id!,
                batchNo: a.batch.batchNo,
                expiry: a.batch.expiry,
                qtyUnits: a.qtyUnits,
                shelf: a.batch.shelf || target.medicine.shelf,
              })),
            }
          : item
      )
    );
    setDiscountApproved(false);
  };

  // Stepper +/- on cart line
  const handleChangeQty = async (lineId: string, delta: number) => {
    const target = cart.find((item) => item.id === lineId);
    if (!target || !target.medicine.id) return;

    const nextQty = target.qtyInput + delta;
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== lineId));
      setDiscountApproved(false);
      return;
    }

    const upp = Math.max(1, target.medicine.unitsPerPack || 1);
    const validUnits = validStockMap[target.medicine.id] || target.availableValidUnits;
    const otherUnits = getCartUnitsForMedicine(target.medicine.id, lineId);
    const nextUnits = computeQtyUnits(nextQty, upp, target.unitMode);

    if (otherUnits + nextUnits > validUnits) {
      triggerFeedback(
        'error',
        t('dawai_becho.err_insufficient_stock', {
          available: validUnits,
          name: target.medicine.name,
        })
      );
      return;
    }

    const pick = await pickBatchesForSale(target.medicine.id, otherUnits + nextUnits);
    if (!pick.ok) {
      triggerFeedback('error', t('dawai_becho.oos_title'));
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.id === lineId
          ? {
              ...item,
              qtyInput: nextQty,
              allocations: pick.allocations.map((a) => ({
                batchId: a.batch.id!,
                batchNo: a.batch.batchNo,
                expiry: a.batch.expiry,
                qtyUnits: a.qtyUnits,
                shelf: a.batch.shelf || target.medicine.shelf,
              })),
            }
          : item
      )
    );
    setDiscountApproved(false);
  };

  const handleChangeItemDiscount = (lineId: string, discountPct: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === lineId ? { ...item, itemDiscountPercent: discountPct } : item
      )
    );
    setDiscountApproved(false);
  };

  const handleWholeBillDiscountChange = (val: number) => {
    setWholeBillDiscountPercent(val);
    setDiscountApproved(false);
  };

  // Clear active bill
  const resetCurrentBill = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDoctorName('');
    setWholeBillDiscountPercent(0);
    setDiscountApproved(false);
    setIsMobileBillSheetOpen(false);
  };

  // Wapas: removes last added item from cart
  const handleUndoLastItem = () => {
    if (cart.length === 0) return;
    setCart((prev) => prev.slice(0, -1));
    setDiscountApproved(false);
    triggerFeedback('success', t('dawai_becho.toast_item_removed'));
  };

  // Naya Bill: confirms if cart non-empty
  const handleNewBill = () => {
    if (cart.length === 0) {
      resetCurrentBill();
      return;
    }
    setIsNewBillConfirmOpen(true);
  };

  // Rukao: hold bill in Dexie heldBills table
  const handleHoldBill = async () => {
    if (cart.length === 0) {
      triggerFeedback('error', t('dawai_becho.err_empty_cart'));
      return;
    }

    const serialized: SerializedHeldCartItem[] = cart.map((item) => ({
      medicineId: item.medicine.id!,
      unitMode: item.unitMode,
      qtyInput: item.qtyInput,
      itemDiscountPercent: item.itemDiscountPercent,
      patientName: item.patientName,
      doctorName: item.doctorName,
      prescriptionChecked: item.prescriptionChecked,
    }));

    const label =
      customerName.trim() ||
      `${t('dawai_becho.bill_header_prefix')} #${nextBillNo}`;

    await holdBill({
      label,
      itemsJson: JSON.stringify(serialized),
      discountPercent: wholeBillDiscountPercent,
      customerName: customerName.trim(),
      doctorName: doctorName.trim(),
      heldBy: userName,
    });

    resetCurrentBill();
    const updatedHeld = await getHeldBills();
    setHeldBills(updatedHeld);
    triggerFeedback('success', t('dawai_becho.toast_held_saved'));
  };

  // Resume a held bill
  const handleResumeHeldBill = async (hb: HeldBill) => {
    try {
      const parsed: SerializedHeldCartItem[] = JSON.parse(hb.itemsJson);
      const medMap = new Map<number, Medicine>();
      for (const m of medicines) {
        if (m.id) medMap.set(m.id, m);
      }

      const restoredItems: CartItem[] = [];
      for (const entry of parsed) {
        const med = medMap.get(entry.medicineId);
        if (!med) continue;
        const validUnits = validStockMap[entry.medicineId] || 0;
        const neededUnits = computeQtyUnits(entry.qtyInput, med.unitsPerPack, entry.unitMode);
        if (validUnits < neededUnits || validUnits <= 0) continue;

        const pick = await pickBatchesForSale(entry.medicineId, neededUnits);
        if (!pick.ok) continue;

        restoredItems.push({
          id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          medicine: med,
          unitMode: entry.unitMode,
          qtyInput: entry.qtyInput,
          itemDiscountPercent: entry.itemDiscountPercent || 0,
          allocations: pick.allocations.map((a) => ({
            batchId: a.batch.id!,
            batchNo: a.batch.batchNo,
            expiry: a.batch.expiry,
            qtyUnits: a.qtyUnits,
            shelf: a.batch.shelf || med.shelf,
          })),
          availableValidUnits: validUnits,
          patientName: entry.patientName || '',
          doctorName: entry.doctorName || '',
          prescriptionChecked: Boolean(entry.prescriptionChecked),
        });
      }

      if (hb.id !== undefined) {
        await deleteHeldBill(hb.id);
      }
      setCart(restoredItems);
      setCustomerName(hb.customerName || '');
      setDoctorName(hb.doctorName || '');
      setWholeBillDiscountPercent(hb.discountPercent || 0);
      setDiscountApproved(false);
      setIsHeldModalOpen(false);
      setHeldBills(await getHeldBills());
      triggerFeedback('success', t('dawai_becho.toast_held_resumed'));
    } catch (err) {
      console.error('Failed to resume held bill:', err);
    }
  };

  const handleDeleteHeldBill = async (id: number) => {
    await deleteHeldBill(id);
    setHeldBills(await getHeldBills());
    triggerFeedback('success', t('dawai_becho.toast_held_deleted'));
  };

  // Build active BillDraft
  const buildBillDraft = (): BillDraft => ({
    lines: cart.map((item) => ({
      medicineId: item.medicine.id!,
      unitMode: item.unitMode,
      qtyInput: item.qtyInput,
      itemDiscountPercent: item.itemDiscountPercent,
      patientName: item.patientName,
      doctorName: item.doctorName,
      prescriptionChecked: item.prescriptionChecked,
    })),
    wholeBillDiscountPercent,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    doctorName: doctorName.trim(),
    paymentMode: 'cash',
  });

  const executePaymentProceed = (verified: boolean) => {
    const draft = buildBillDraft();
    if (onProceedToPayment) {
      onProceedToPayment(draft, verified);
    } else {
      setActivePaymentDraft({ draft, approvalVerified: verified });
      setIsMobileBillSheetOpen(false);
      setActiveScreen('payment');
    }
  };

  // Proceed to Payment with discount approval rule check
  const handleProceedToPayment = async () => {
    if (cart.length === 0) {
      triggerFeedback('error', t('dawai_becho.err_empty_cart'));
      return;
    }

    if (totals.requiresApproval && !discountApproved) {
      let rule: ApprovalRuleType = DEFAULT_APPROVAL_RULES.discount_above_limit;
      try {
        const setting = await db.settings.get('approval_rules');
        const rules = setting?.value as Partial<Record<ApprovalActionCategory, ApprovalRuleType>> | undefined;
        if (rules && rules.discount_above_limit) {
          rule = rules.discount_above_limit;
        }
      } catch {
        // use default
      }

      if (rule === 'blocked_offline' || rule === 'remote_approval') {
        triggerFeedback('error', t('dawai_becho.err_discount_blocked_offline'));
        return;
      }

      setIsApprovalOpen(true);
      return;
    }

    executePaymentProceed(discountApproved);
  };

  const returnHomeBtn = tButton('home.return_home_btn');
  const btnMakeBill = tButton('dawai_becho.btn_make_bill');
  const btnHold = tButton('dawai_becho.btn_hold');
  const btnUndo = tButton('dawai_becho.btn_undo_last');
  const btnNewBill = tButton('dawai_becho.btn_new_bill');

  const sharedBillPanelProps = {
    nextBillNo,
    cart,
    totals,
    heldCount: heldBills.length,
    customerName,
    customerPhone,
    doctorName,
    wholeBillDiscountPercent,
    onCustomerNameChange: setCustomerName,
    onCustomerPhoneChange: setCustomerPhone,
    onDoctorNameChange: setDoctorName,
    onWholeBillDiscountChange: handleWholeBillDiscountChange,
    onToggleUnitMode: handleToggleUnitMode,
    onChangeQty: handleChangeQty,
    onChangeItemDiscount: handleChangeItemDiscount,
    onHoldBill: handleHoldBill,
    onOpenHeldBills: () => {
      setIsMobileBillSheetOpen(false);
      setIsHeldModalOpen(true);
    },
    onUndoLastItem: handleUndoLastItem,
    onNewBill: handleNewBill,
    onOpenOldBills: () =>
      onOpenOldBills ? onOpenOldBills() : setActiveScreen('old_bills'),
    onOpenReturns: () =>
      onOpenReturns ? onOpenReturns() : setActiveScreen('old_bills'),
    onProceedToPayment: handleProceedToPayment,
  };

  if (activeScreen === 'payment' && activePaymentDraft) {
    return (
      <PaymentScreen
        draft={activePaymentDraft.draft}
        cart={cart}
        totals={totals}
        approvalVerified={activePaymentDraft.approvalVerified}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnHome={onReturnHome}
        onBackToCart={() => setActiveScreen('billing')}
        onBillFinalized={(result) => {
          setCompletedBillResult(result);
          setActivePaymentDraft(null);
          resetCurrentBill();
          setActiveScreen('bill_done');
          loadCatalogAndSettings();
        }}
      />
    );
  }

  if (activeScreen === 'bill_done' && completedBillResult) {
    return (
      <BillDoneScreen
        bill={completedBillResult.bill}
        items={completedBillResult.billItems}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnHome={onReturnHome}
        onDone={() => {
          setCompletedBillResult(null);
          resetCurrentBill();
          setActiveScreen('billing');
          loadCatalogAndSettings();
        }}
      />
    );
  }

  if (activeScreen === 'old_bills') {
    return (
      <OldBillsReturnScreen
        onBackToBilling={() => {
          setActiveScreen('billing');
          loadCatalogAndSettings();
        }}
        onReturnHome={onReturnHome}
        currentUser={currentUser}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    );
  }

  // Dedicated Mobile & Portrait-Tablet Layout (< 1024px)
  if (isCompactViewport && activeScreen === 'billing') {
    return (
      <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col antialiased select-none overflow-x-hidden transition-colors pb-36">
        {/* Sticky Compact Top Header */}
        <header className="sticky top-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-xs px-3 py-2 flex items-center justify-between gap-2">
          {/* Left: Home / Back */}
          <button
            type="button"
            onClick={onReturnHome}
            className="h-12 min-h-[48px] px-3.5 bg-surface-container-low hover:bg-surface-container border border-outline-variant/50 rounded-2xl shadow-xs text-on-surface active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            aria-label="Home"
          >
            <Icon name="home" className="text-primary text-[22px]" />
            <span className="text-sm font-bold">{returnHomeBtn.main}</span>
          </button>

          {/* Center Title */}
          <div className="flex flex-col items-center min-w-0 flex-1 px-1">
            <h1 className="text-base sm:text-lg font-extrabold text-on-surface tracking-tight truncate">
              {t('home.tile_dawai_becho.main')}
            </h1>
            {shopName && (
              <span className="text-[11px] text-on-surface-variant font-medium truncate max-w-[150px]">
                {shopName}
              </span>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Search Focus Button */}
            <button
              type="button"
              onClick={() => {
                searchInputRef.current?.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/50 flex items-center justify-center text-primary transition-colors cursor-pointer"
              aria-label="Search medicine"
              title="Search medicine"
            >
              <Icon name="search" className="text-[20px]" />
            </button>

            {/* Held Bills Counter */}
            {heldBills.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHeldModalOpen(true)}
                className="h-11 min-h-[44px] px-2.5 rounded-2xl bg-tertiary-fixed text-on-tertiary-fixed text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                aria-label={`Held bills: ${heldBills.length}`}
              >
                <Icon name="pause_circle" className="text-[18px]" />
                <span>{heldBills.length}</span>
              </button>
            )}

            {/* Theme Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/50 flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
              </button>
            )}

            <FullscreenButton className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/50 flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer" />
          </div>
        </header>

        {/* Full-width Search Bar (min-h-[52px]) */}
        <div className="w-full px-3 sm:px-4 pt-3 pb-2 shrink-0">
          <div className="flex items-center w-full bg-surface-container-lowest border-2 border-primary rounded-2xl shadow-xs px-3.5 h-13 min-h-[52px] focus-within:ring-2 focus-within:ring-primary/30 transition-all">
            <Icon name="search" className="text-primary text-[24px] shrink-0 mr-2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('dawai_becho.search_placeholder')}
              className="w-full bg-transparent text-sm sm:text-base font-medium text-on-surface placeholder-on-surface-variant/60 outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded-xl shrink-0 cursor-pointer"
                aria-label="Clear search"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            ) : (
              <div className="w-9 h-9 flex items-center justify-center bg-primary-fixed text-primary rounded-xl shrink-0">
                <Icon name="barcode_scanner" className="text-[20px]" />
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Body: Instant Search Results OR Cart */}
        <div className="flex-1 w-full px-3 sm:px-4 py-2 flex flex-col gap-3">
          {/* Instant Search Results when search has query */}
          {searchQuery.trim().length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  Search Results ({filteredMedicines.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>

              {filteredMedicines.length === 0 ? (
                <div className="p-6 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 text-center text-on-surface-variant text-sm">
                  {t('dawai_becho.no_search_results')}
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
                  {filteredMedicines.slice(0, 15).map((med) => {
                    const validStock = validStockMap[med.id || 0] || 0;
                    const isOos = validStock <= 0;
                    return (
                      <div
                        key={med.id}
                        className="w-full min-h-[72px] bg-surface-container-lowest border border-outline-variant/50 rounded-2xl px-3.5 py-2 flex items-center justify-between shadow-xs transition-all gap-2"
                      >
                        <div className="flex flex-col justify-center min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-base font-bold text-on-surface leading-tight truncate">
                              {med.name}
                            </span>
                            {med.strength && (
                              <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
                                {med.strength}
                              </span>
                            )}
                            {(med.scheduleType === 'H' || med.scheduleType === 'H1') && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-error-container text-on-error-container">
                                Sch {med.scheduleType}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-on-surface-variant leading-tight mt-1 truncate">
                            {med.shelf ? `Shelf: ${med.shelf} · ` : ''}
                            <span className={isOos ? 'text-error font-bold' : 'text-primary font-bold'}>
                              {validStock > 0 ? `${validStock} units` : t('dawai_becho.out_of_stock_badge')}
                            </span>
                            {` · ${formatRupees(med.mrpPaise)}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectMedicine(med)}
                          aria-label={`Add ${med.name}`}
                          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl bg-primary-fixed hover:bg-primary hover:text-on-primary text-primary flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer shrink-0"
                        >
                          <Icon name="add" className="text-[26px]" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Cart Header Bar */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/30">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-extrabold text-on-surface tracking-tight">
                {t('dawai_becho.bill_header_prefix')} #{nextBillNo}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                {t('dawai_becho.items_count', { count: cart.length })}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Customer / Discount Toggle */}
              <button
                type="button"
                onClick={() => setShowCompactMeta((prev) => !prev)}
                aria-label="Customer & Discount info"
                className={`h-10 px-2.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                  showCompactMeta || customerName || doctorName || wholeBillDiscountPercent > 0
                    ? 'bg-primary-fixed text-on-primary-fixed'
                    : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant'
                }`}
              >
                <Icon name="person_add" className="text-[18px]" />
                <span>%</span>
              </button>

              {/* Hold Bill */}
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleHoldBill}
                  className="h-10 px-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-bold text-xs flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title={btnHold.main}
                >
                  <Icon name="pause_circle" className="text-[18px] text-tertiary" />
                  <span>{btnHold.main}</span>
                </button>
              )}

              {/* Undo Last */}
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndoLastItem}
                  className="h-10 px-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-bold text-xs flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title={btnUndo.main}
                >
                  <Icon name="undo" className="text-[18px]" />
                  <span>{btnUndo.main}</span>
                </button>
              )}

              {/* New Bill */}
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleNewBill}
                  className="h-10 px-2 rounded-xl text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                  title={btnNewBill.main}
                >
                  <Icon name="refresh" className="text-[20px]" />
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Customer / Doctor / Discount bar */}
          {showCompactMeta && (
            <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/50 flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  {...textFieldProps('name', customerName, setCustomerName)}
                  type="text"
                  placeholder={t('dawai_becho.customer_name_placeholder')}
                  className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  {...textFieldProps('phone', customerPhone, setCustomerPhone)}
                  type="text"
                  placeholder={t('dawai_becho.customer_phone_placeholder')}
                  className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  {...textFieldProps('name', doctorName, setDoctorName)}
                  type="text"
                  placeholder={t('dawai_becho.doctor_name_placeholder')}
                  className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-on-surface-variant shrink-0">
                    {t('dawai_becho.bill_discount_label')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={wholeBillDiscountPercent || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      handleWholeBillDiscountChange(val);
                    }}
                    className="w-16 text-right bg-transparent font-bold text-on-surface text-base focus:outline-none"
                  />
                  <span className="text-xs font-bold text-on-surface-variant">%</span>
                </div>
              </div>
            </div>
          )}

          {/* Cart Items List */}
          {cart.length === 0 ? (
            <div className="p-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 flex flex-col items-center justify-center text-center text-on-surface-variant gap-2 my-2">
              <Icon name="shopping_cart" className="text-[44px] text-outline/50" />
              <span className="font-bold text-base text-on-surface">
                {t('dawai_becho.empty_cart_title')}
              </span>
              <span className="text-xs max-w-xs">
                {t('dawai_becho.empty_cart_sub')}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cart.map((item, idx) => {
                const computed = totals.lines[idx];
                const upp = Math.max(1, item.medicine.unitsPerPack || 1);
                const batchText = item.allocations
                  .map((a) => `${a.batchNo} (${formatShortExpiry(a.expiry)})`)
                  .join(', ');
                const lineTotal = computed ? computed.lineTotalPaise : item.medicine.mrpPaise * item.qtyInput;

                return (
                  <div
                    key={item.id}
                    className={`w-full bg-surface-container-lowest border rounded-2xl p-3 flex flex-col gap-2 shadow-xs transition-all ${
                      item.isHighlighted
                        ? 'border-primary bg-primary-fixed/20'
                        : 'border-outline-variant/60'
                    }`}
                  >
                    {/* Top Row: Name, details & line total */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-base font-bold text-on-surface leading-tight truncate">
                            {item.medicine.name}
                          </h3>
                          {item.medicine.strength && (
                            <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
                              {item.medicine.strength}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-on-surface-variant mt-0.5">
                          {formatRupees(item.medicine.mrpPaise)} / {item.unitMode === 'pack' ? 'pack' : 'loose'}
                          {batchText ? ` · Batch: ${batchText}` : ''}
                          {item.medicine.shelf ? ` · Shelf: ${item.medicine.shelf}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-base font-extrabold text-primary">
                          {formatRupees(lineTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Unit Mode Toggle + Quantity Stepper + Remove */}
                    <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 gap-2 flex-wrap sm:flex-nowrap">
                      {upp > 1 ? (
                        <div className="flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/50 h-11 items-center shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleUnitMode(item.id, 'pack')}
                            className={`h-full px-3 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-colors ${
                              item.unitMode === 'pack'
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            Pack ({upp})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleUnitMode(item.id, 'loose')}
                            className={`h-full px-3 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-colors ${
                              item.unitMode === 'loose'
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            Loose
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-on-surface-variant px-2 py-1 bg-surface-container-low rounded-lg">
                          1 unit/pack
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => handleChangeQty(item.id, -1)}
                          className="w-11 h-11 min-w-[44px] min-h-[44px] bg-surface-container-low hover:bg-surface-container border border-outline-variant/60 text-on-surface rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-all cursor-pointer"
                        >
                          −
                        </button>
                        <span className="text-base font-bold text-on-surface w-7 text-center">
                          {item.qtyInput}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => handleChangeQty(item.id, 1)}
                          className="w-11 h-11 min-w-[44px] min-h-[44px] bg-primary-fixed border border-primary/30 text-on-primary-fixed rounded-xl flex items-center justify-center font-bold text-xl active:bg-primary active:text-on-primary active:scale-95 transition-all cursor-pointer"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          aria-label="Remove item"
                          onClick={() => handleChangeQty(item.id, -item.qtyInput)}
                          className="w-11 h-11 min-w-[44px] min-h-[44px] text-error hover:bg-error-container/20 rounded-xl flex items-center justify-center cursor-pointer ml-1"
                        >
                          <Icon name="delete" className="text-[20px]" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Bottom Checkout Bar (pb-[env(safe-area-inset-bottom)]) */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest border-t-2 border-outline-variant/50 rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2.5 w-full">
            <div className="text-base sm:text-lg font-bold text-on-surface tracking-tight truncate">
              {t('dawai_becho.bill_header_prefix')} #{nextBillNo} ·{' '}
              <span className="text-on-surface-variant font-medium">
                {t('dawai_becho.items_count', { count: cart.length })}
              </span>
            </div>
            <span className="font-display-total-mobile text-[32px] sm:text-[36px] leading-none font-extrabold text-primary shrink-0">
              {formatRupees(totals.totalPaise)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleProceedToPayment}
            className="w-full h-[56px] min-h-[56px] bg-primary hover:bg-primary-container text-on-primary rounded-2xl px-5 flex items-center justify-center gap-3 shadow-md active:scale-[0.98] transition-all cursor-pointer"
          >
            <Icon name="receipt_long" className="text-[26px]" />
            <div className="flex flex-col items-start justify-center text-left leading-tight">
              <span className="text-lg sm:text-xl font-extrabold tracking-tight">
                {btnMakeBill.main}
              </span>
              {btnMakeBill.sub && (
                <span className="text-xs text-primary-fixed leading-none">{btnMakeBill.sub}</span>
              )}
            </div>
          </button>
        </footer>

        {/* Modals for Compact View */}
        <ScheduleHModal
          isOpen={Boolean(scheduleHMedicine)}
          medicine={scheduleHMedicine}
          initialPatientName={customerName}
          initialDoctorName={doctorName}
          onConfirm={async (rxMeta) => {
            const med = scheduleHMedicine;
            setScheduleHMedicine(null);
            if (!customerName && rxMeta.patientName) setCustomerName(rxMeta.patientName);
            if (!doctorName && rxMeta.doctorName) setDoctorName(rxMeta.doctorName);
            if (med) {
              await commitMedicineToCart(med, rxMeta);
            }
          }}
          onCancel={() => setScheduleHMedicine(null)}
        />

        <OutOfStockModal
          isOpen={Boolean(outOfStockMedicine)}
          medicine={outOfStockMedicine}
          onSelectSubstitute={async (subMed) => {
            setOutOfStockMedicine(null);
            await handleSelectMedicine(subMed);
          }}
          onClose={() => setOutOfStockMedicine(null)}
        />

        <HeldBillsModal
          isOpen={isHeldModalOpen}
          heldBills={heldBills}
          onResume={handleResumeHeldBill}
          onDelete={handleDeleteHeldBill}
          onClose={() => setIsHeldModalOpen(false)}
        />

        <ConfirmDialog
          isOpen={isNewBillConfirmOpen}
          title={t('dawai_becho.confirm_new_bill_title')}
          subtitle={t('dawai_becho.confirm_new_bill_sub')}
          isDanger
          onConfirm={() => {
            setIsNewBillConfirmOpen(false);
            resetCurrentBill();
          }}
          onCancel={() => setIsNewBillConfirmOpen(false)}
        />

        <ApprovalDialog
          isOpen={isApprovalOpen}
          actionCategory="discount_above_limit"
          recordDescription={`Bill #${nextBillNo}: ${totals.effectiveDiscountPercent}% discount (${formatRupees(totals.discountPaise)}) on ${formatRupees(totals.subtotalPaise)}`}
          requesterName={userName}
          onApproved={() => {
            setIsApprovalOpen(false);
            setDiscountApproved(true);
            executePaymentProceed(true);
          }}
          onClose={() => setIsApprovalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-surface text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* 1. Fixed Top Header (Matching 11_Sell_DawaiBecho_Desktop.html + 12_Sell_DawaiBecho_Phone.html) */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/30">
        <div className="h-16 w-full px-gutter flex items-center justify-between gap-3">
          {/* Left: Brand + Shop + Home */}
          <div className="flex items-center gap-space-md min-w-0">
            <div className="flex items-center gap-space-xs shrink-0">
              <Icon name="local_pharmacy" className="text-primary text-[28px]" />
              <span className="font-headline-md text-headline-md tracking-tight uppercase text-primary font-extrabold">
                HOSPIVO
              </span>
            </div>

            {shopName && (
              <>
                <span className="hidden md:inline font-body-md text-outline-variant">|</span>
                <div className="hidden md:flex items-center gap-space-xs min-w-0">
                  <Icon name="storefront" className="text-on-surface-variant text-[20px]" />
                  <span className="font-title-hinglish text-title-hinglish text-on-surface truncate font-bold">
                    {shopName}
                  </span>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={onReturnHome}
              className="h-11 px-3.5 rounded-xl bg-primary-container text-on-primary-container font-bold inline-flex items-center gap-space-xs transition-all cursor-pointer hover:brightness-105 active:scale-95 shrink-0"
            >
              <Icon name="home" className="text-[20px]" />
              <span>{returnHomeBtn.main}</span>
            </button>
          </div>

          {/* Right: Mode Pill + Light/Dark Toggle + FullscreenButton + User */}
          <div className="flex items-center gap-space-sm sm:gap-space-md shrink-0">
            {heldBills.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHeldModalOpen(true)}
                className="lg:hidden h-10 px-3 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Icon name="pause_circle" className="text-[18px]" />
                <span>{heldBills.length}</span>
              </button>
            )}

            <div className="hidden sm:inline-flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-surface-container-high">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface font-semibold">
                {modeLabel}
              </span>
            </div>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer" />

            <div className="flex items-center gap-space-xs pl-space-xs">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="hidden sm:inline font-title-hinglish text-title-hinglish text-on-surface font-bold">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Split Counter Content */}
      <main className="w-full pt-16 flex-1 bg-background flex flex-col min-h-0">
        <div className="flex-1 w-full max-w-[1440px] mx-auto p-space-md pb-36 lg:pb-space-md grid grid-cols-1 lg:grid-cols-12 gap-space-md lg:h-[calc(100vh-4rem)] min-h-0">
          {/* LEFT COLUMN (60% width on desktop -> col-span-7, full on mobile) */}
          <MedicineCatalogPanel
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchKeyDown={handleSearchKeyDown}
            totalMedicinesCount={medicines.length}
            filteredMedicines={filteredMedicines}
            validStockMap={validStockMap}
            onSelectMedicine={handleSelectMedicine}
            onReturnHome={onReturnHome}
          />

          {/* RIGHT COLUMN: Desktop Bill Panel (40% width -> col-span-5) */}
          <div className="hidden lg:flex lg:col-span-5 flex-col h-full min-h-0">
            <BillPanel {...sharedBillPanelProps} />
          </div>
        </div>
      </main>

      {/* 3. Mobile Sticky Bottom Bar (Matching 12_Sell_DawaiBecho_Phone.html, visible < lg) */}
      <footer className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest border-t-2 border-outline-variant/50 rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-4 pt-3 pb-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2.5 w-full">
          <button
            type="button"
            aria-label="Open bill panel"
            onClick={() => setIsMobileBillSheetOpen(true)}
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer text-left"
          >
            <div className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface shrink-0">
              <Icon name="expand_less" className="text-[24px]" />
            </div>
            <div className="text-[18px] font-bold text-on-surface tracking-tight truncate">
              {t('dawai_becho.bill_header_prefix')} #{nextBillNo} ·{' '}
              {t('dawai_becho.items_count', { count: cart.length })}
            </div>
          </button>

          {/* Prominent Total >= 36px always visible */}
          <span className="font-display-total-mobile text-[36px] leading-none font-extrabold text-primary shrink-0">
            {formatRupees(totals.totalPaise)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleProceedToPayment}
          className="w-full h-[60px] min-h-[56px] bg-primary hover:bg-primary-container text-on-primary rounded-2xl px-5 flex items-center justify-center gap-3 shadow-md active:scale-[0.98] transition-all cursor-pointer"
        >
          <Icon name="receipt_long" className="text-[28px]" />
          <div className="flex flex-col items-start justify-center text-left leading-tight">
            <span className="text-[20px] font-extrabold tracking-tight">{btnMakeBill.main}</span>
            {btnMakeBill.sub && (
              <span className="text-[14px] text-primary-fixed leading-none">{btnMakeBill.sub}</span>
            )}
          </div>
        </button>
      </footer>

      {/* Mobile Slide-Up Bill Panel Overlay (Matching 12b_Sell_DawaiBecho_Phone_BillPanel.html) */}
      {isMobileBillSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-[2px] flex flex-col justify-end">
          <div className="h-[85vh] bg-surface-container-lowest rounded-t-[24px] shadow-2xl p-3 flex flex-col overflow-hidden">
            <BillPanel
              {...sharedBillPanelProps}
              isMobileSheet
              onCloseMobileSheet={() => setIsMobileBillSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 4. Schedule H / H1 Modal */}
      <ScheduleHModal
        isOpen={Boolean(scheduleHMedicine)}
        medicine={scheduleHMedicine}
        initialPatientName={customerName}
        initialDoctorName={doctorName}
        onConfirm={async (rxMeta) => {
          const med = scheduleHMedicine;
          setScheduleHMedicine(null);
          if (!customerName && rxMeta.patientName) setCustomerName(rxMeta.patientName);
          if (!doctorName && rxMeta.doctorName) setDoctorName(rxMeta.doctorName);
          if (med) {
            await commitMedicineToCart(med, rxMeta);
          }
        }}
        onCancel={() => setScheduleHMedicine(null)}
      />

      {/* 5. Out of Stock Substitutes Modal */}
      <OutOfStockModal
        isOpen={Boolean(outOfStockMedicine)}
        medicine={outOfStockMedicine}
        onSelectSubstitute={async (subMed) => {
          setOutOfStockMedicine(null);
          await handleSelectMedicine(subMed);
        }}
        onClose={() => setOutOfStockMedicine(null)}
      />

      {/* 6. Held Bills Modal */}
      <HeldBillsModal
        isOpen={isHeldModalOpen}
        heldBills={heldBills}
        onResume={handleResumeHeldBill}
        onDelete={handleDeleteHeldBill}
        onClose={() => setIsHeldModalOpen(false)}
      />

      {/* 7. New Bill Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isNewBillConfirmOpen}
        title={t('dawai_becho.confirm_new_bill_title')}
        subtitle={t('dawai_becho.confirm_new_bill_sub')}
        isDanger
        onConfirm={() => {
          setIsNewBillConfirmOpen(false);
          resetCurrentBill();
        }}
        onCancel={() => setIsNewBillConfirmOpen(false)}
      />

      {/* 8. Approval PIN Dialog for discount_above_limit */}
      <ApprovalDialog
        isOpen={isApprovalOpen}
        actionCategory="discount_above_limit"
        recordDescription={`Bill #${nextBillNo}: ${totals.effectiveDiscountPercent}% discount (${formatRupees(totals.discountPaise)}) on ${formatRupees(totals.subtotalPaise)}`}
        requesterName={userName}
        onApproved={() => {
          setIsApprovalOpen(false);
          setDiscountApproved(true);
          executePaymentProceed(true);
        }}
        onClose={() => setIsApprovalOpen(false)}
      />
    </div>
  );
};
