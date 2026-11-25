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
import type { BillDiscountMode } from './dawai-becho/BillDiscountRow';
import { MedicineCatalogPanel } from './dawai-becho/MedicineCatalogPanel';
import { ScheduleHModal } from './dawai-becho/ScheduleHModal';
import { OutOfStockModal } from './dawai-becho/OutOfStockModal';
import { HeldBillsModal } from './dawai-becho/HeldBillsModal';
import { PaymentScreen } from './dawai-becho/PaymentScreen';
import { BillDoneScreen } from './dawai-becho/BillDoneScreen';
import { OldBillsReturnScreen } from './dawai-becho/OldBillsReturnScreen';
import type { CartItem, SerializedHeldCartItem } from './dawai-becho/types';
import { useIsCompactViewport } from '../logic/useViewport';
import { useBackHandler } from '../logic/androidBack';

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
  const [wholeBillDiscountPaise, setWholeBillDiscountPaise] = useState<number>(0);
  const [pendingBillDiscount, setPendingBillDiscount] = useState<{
    mode: BillDiscountMode;
    value: number;
    description: string;
  } | null>(null);
  const [discountApproved, setDiscountApproved] = useState<boolean>(false);

  // Modals & mobile sheet state
  const [scheduleHMedicine, setScheduleHMedicine] = useState<Medicine | null>(null);
  const [outOfStockMedicine, setOutOfStockMedicine] = useState<Medicine | null>(null);
  const [isHeldModalOpen, setIsHeldModalOpen] = useState<boolean>(false);
  const [isNewBillConfirmOpen, setIsNewBillConfirmOpen] = useState<boolean>(false);
  const [isApprovalOpen, setIsApprovalOpen] = useState<boolean>(false);
  const [isMobileBillSheetOpen, setIsMobileBillSheetOpen] = useState<boolean>(false);
  const isCompactViewport = useIsCompactViewport();
  const [activeScreen, setActiveScreen] = useState<
    'billing' | 'payment' | 'bill_done' | 'old_bills'
  >('billing');

  // Android back press closes open sheets & dialogs in DawaiBecho before navigating back
  useBackHandler(isMobileBillSheetOpen, () => setIsMobileBillSheetOpen(false));
  useBackHandler(isHeldModalOpen, () => setIsHeldModalOpen(false));
  useBackHandler(Boolean(scheduleHMedicine), () => setScheduleHMedicine(null));
  useBackHandler(Boolean(outOfStockMedicine), () => setOutOfStockMedicine(null));
  useBackHandler(activeScreen === 'old_bills', () => {
    setActiveScreen('billing');
    loadCatalogAndSettings();
  });
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
  const cartLineInputs = useMemo<BillLineInput[]>(
    () =>
      cart.map((item) => ({
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
      })),
    [cart]
  );

  const totals = useMemo(
    () =>
      calculateBillTotals(
        cartLineInputs,
        wholeBillDiscountPercent,
        discountLimit,
        wholeBillDiscountPaise
      ),
    [cartLineInputs, wholeBillDiscountPercent, wholeBillDiscountPaise, discountLimit]
  );

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
    setWholeBillDiscountPaise(0);
    setDiscountApproved(false);
  };

  const applyBillDiscount = (mode: BillDiscountMode, value: number) => {
    setWholeBillDiscountPercent(mode === 'percent' ? value : 0);
    setWholeBillDiscountPaise(mode === 'paise' ? value : 0);
  };

  const handleRemoveBillDiscount = () => {
    setWholeBillDiscountPercent(0);
    setWholeBillDiscountPaise(0);
    setPendingBillDiscount(null);
    setDiscountApproved(false);
  };

  // New bill-level discount (Rs or %): within the owner's limit it applies at once,
  // above the limit it waits for the Approval PIN (ApprovalDialog) before it is applied.
  const handleApplyBillDiscount = async (mode: BillDiscountMode, value: number) => {
    const preview = calculateBillTotals(
      cartLineInputs,
      mode === 'percent' ? value : 0,
      discountLimit,
      mode === 'paise' ? value : 0
    );

    if (!preview.requiresApproval) {
      applyBillDiscount(mode, value);
      setDiscountApproved(false);
      triggerFeedback('success', t('dawai_becho.bill_disc_applied_toast'));
      return;
    }

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

    setPendingBillDiscount({
      mode,
      value,
      description: `Bill #${nextBillNo}: ${preview.effectiveDiscountPercent}% discount (${formatRupees(preview.discountPaise)}) on ${formatRupees(preview.subtotalPaise)}`,
    });
    setIsApprovalOpen(true);
  };

  // Clear active bill
  const resetCurrentBill = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDoctorName('');
    setWholeBillDiscountPercent(0);
    setWholeBillDiscountPaise(0);
    setPendingBillDiscount(null);
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
      discountPaise: wholeBillDiscountPaise,
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
      setWholeBillDiscountPaise(hb.discountPaise || 0);
      setPendingBillDiscount(null);
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
    wholeBillDiscountPaise,
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
    wholeBillDiscountPaise,
    discountApproved,
    onApplyBillDiscount: handleApplyBillDiscount,
    onRemoveBillDiscount: handleRemoveBillDiscount,
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

  // Dedicated Phone-First Mobile & Portrait-Tablet POS Layout (< 1024px)
  if (isCompactViewport && activeScreen === 'billing') {
    const displayedCatalog = searchQuery.trim().length > 0
      ? filteredMedicines.slice(0, 25)
      : [...medicines]
          .sort((a, b) => (validStockMap[b.id || 0] || 0) - (validStockMap[a.id || 0] || 0))
          .slice(0, 20);

    return (
      <div className="w-full min-h-dvh bg-surface text-on-surface flex flex-col antialiased select-none overflow-x-clip transition-colors pb-[calc(9rem+env(safe-area-inset-bottom))]">
        {/* Unified Sticky Top Header + Search Bar (eliminates sticky-offset collisions on Android WebView) */}
        <div className="sticky top-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-xs">
          <header className="px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onReturnHome}
              className="w-12 h-12 min-w-[48px] min-h-[48px] bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 rounded-xl text-on-surface active:scale-95 transition-all flex items-center justify-center cursor-pointer shrink-0"
              aria-label={returnHomeBtn.main}
            >
              <Icon name="home" className="text-primary text-[22px]" />
            </button>

            <div className="flex flex-col min-w-0 flex-1">
              <h1 className="text-base font-extrabold text-on-surface tracking-tight truncate leading-tight">
                {t('home.tile_dawai_becho.main')}
              </h1>
              <span className="text-xs text-on-surface-variant font-semibold truncate leading-tight mt-0.5">
                {t('dawai_becho.bill_header_prefix')} #{nextBillNo}
                {shopName ? ` · ${shopName}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {heldBills.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsHeldModalOpen(true)}
                  className="min-h-[48px] px-3 py-1.5 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 shrink-0"
                  aria-label={t('dawai_becho.btn_held_list', { count: heldBills.length })}
                >
                  <Icon name="pause_circle" className="text-[20px] shrink-0" />
                  <span>{heldBills.length}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => (onOpenOldBills ? onOpenOldBills() : setActiveScreen('old_bills'))}
                className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer shrink-0"
                aria-label={tButton('dawai_becho.btn_old_bills').main}
              >
                <Icon name="history" className="text-[22px]" />
              </button>

              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  aria-label={t('common.toggle_theme')}
                  className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer shrink-0"
                >
                  <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
                </button>
              )}
            </div>
          </header>

          {/* Full-Width Search & Barcode Bar inside unified sticky wrapper */}
          <div className="w-full px-3 pt-1 pb-2.5 border-t border-outline-variant/15">
            <div className="flex items-center w-full bg-surface-container-lowest border-2 border-primary rounded-2xl shadow-xs px-3 min-h-[52px] py-1 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
              <Icon name="search" className="text-primary text-[24px] shrink-0 mr-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('dawai_becho.search_placeholder')}
                className="w-full min-w-0 bg-transparent text-sm sm:text-base font-medium text-on-surface placeholder-on-surface-variant/60 outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded-xl shrink-0 cursor-pointer"
                  aria-label={t('common.btn_clear.main')}
                >
                  <Icon name="close" className="text-[20px]" />
                </button>
              ) : (
                <div className="w-10 h-10 flex items-center justify-center bg-primary-fixed text-primary rounded-xl shrink-0">
                  <Icon name="barcode_scanner" className="text-[20px]" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body: Fast Medicine Cards + Quick Actions */}
        <div className="flex-1 w-full px-3 py-2.5 flex flex-col gap-3 min-w-0">
          {/* Quick Cart Strip when items are in cart */}
          {cart.length > 0 && (
            <div className="w-full bg-primary-fixed/35 border border-primary/30 rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileBillSheetOpen(true)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
                  <Icon name="shopping_cart" className="text-[20px]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-extrabold text-on-surface truncate">
                    {t('dawai_becho.items_count', { count: cart.length })} · {formatRupees(totals.totalPaise)}
                  </span>
                  <span className="text-xs text-primary font-bold truncate">
                    {cart.map((c) => `${c.medicine.name} (${c.qtyInput})`).join(', ')}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleUndoLastItem}
                  aria-label={btnUndo.main}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-on-surface flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <Icon name="undo" className="text-[20px]" />
                </button>
                <button
                  type="button"
                  onClick={handleHoldBill}
                  aria-label={btnHold.main}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-tertiary flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <Icon name="pause_circle" className="text-[20px]" />
                </button>
              </div>
            </div>
          )}

          {/* Medicine Catalog / Search Results Cards */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider truncate">
                {searchQuery.trim().length > 0
                  ? `${t('dawai_becho.page_title')} (${filteredMedicines.length})`
                  : `${t('dawai_becho.page_title')} (${medicines.length})`}
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleNewBill}
                  className="text-xs font-bold text-error flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg active:scale-95"
                >
                  <Icon name="refresh" className="text-[16px]" />
                  <span>{btnNewBill.main}</span>
                </button>
              )}
            </div>

            {displayedCatalog.length === 0 ? (
              <div className="p-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 text-center text-on-surface-variant text-sm flex flex-col items-center gap-2">
                <Icon name="search_off" className="text-[36px] text-outline/60" />
                <span className="font-bold text-on-surface">
                  {searchQuery.trim().length > 0
                    ? t('dawai_becho.no_search_results')
                    : t('dawai_becho.empty_cart_sub')}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedCatalog.map((med) => {
                  const validStock = validStockMap[med.id || 0] || 0;
                  const isOos = validStock <= 0;
                  const inCartCount = cart
                    .filter((c) => c.medicine.id === med.id)
                    .reduce((s, c) => s + c.qtyInput, 0);

                  return (
                    <div
                      key={med.id}
                      onClick={() => handleSelectMedicine(med)}
                      className={`w-full min-h-[76px] bg-surface-container-lowest border rounded-2xl px-3.5 py-2.5 flex items-center justify-between shadow-xs active:scale-[0.99] transition-all gap-2.5 cursor-pointer min-w-0 ${
                        inCartCount > 0
                          ? 'border-primary bg-primary-fixed/15'
                          : isOos
                            ? 'border-error/30 opacity-75'
                            : 'border-outline-variant/40'
                      }`}
                    >
                      <div className="flex flex-col justify-center min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-bold text-on-surface leading-tight truncate max-w-full">
                            {med.name}
                          </span>
                          {med.strength && (
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant shrink-0">
                              {med.strength}
                            </span>
                          )}
                          {(med.scheduleType === 'H' || med.scheduleType === 'H1') && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-error-container text-on-error-container shrink-0">
                              Sch {med.scheduleType}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs font-medium text-on-surface-variant mt-1">
                          <span className="font-extrabold text-on-surface">
                            {formatRupees(med.mrpPaise)}
                          </span>
                          <span>·</span>
                          <span className={isOos ? 'text-error font-bold' : 'text-primary font-bold'}>
                            {validStock > 0
                              ? `${Math.floor(validStock / Math.max(1, med.unitsPerPack || 1))} ${t('medicine.packs_unit')} (${validStock})`
                              : t('dawai_becho.out_of_stock_badge')}
                          </span>
                          {med.shelf && (
                            <>
                              <span>·</span>
                              <span className="px-1.5 py-0.2 rounded bg-surface-container font-bold">
                                {med.shelf}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {inCartCount > 0 && (
                          <span className="px-2 py-1 rounded-xl bg-primary text-on-primary text-xs font-extrabold">
                            ×{inCartCount}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSelectMedicine(med);
                          }}
                          aria-label={`Add ${med.name}`}
                          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer shrink-0 ${
                            isOos
                              ? 'bg-error-container text-error'
                              : 'bg-primary-fixed hover:bg-primary hover:text-on-primary text-primary'
                          }`}
                        >
                          <Icon name={isOos ? 'swap_horiz' : 'add'} className="text-[26px]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Cart Summary Bar (opens Cart Sheet on tap, never covers form inputs) */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest border-t-2 border-outline-variant/40 rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-3.5 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
          {/* Expandable summary row */}
          <button
            type="button"
            onClick={() => setIsMobileBillSheetOpen(true)}
            className="flex items-center justify-between gap-2 w-full cursor-pointer text-left min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-full bg-surface-container border border-outline-variant/60 flex items-center justify-center text-on-surface shrink-0">
                <Icon name="expand_less" className="text-[22px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-extrabold text-on-surface truncate">
                  {t('dawai_becho.bill_header_prefix')} #{nextBillNo} ·{' '}
                  {t('dawai_becho.items_count', { count: cart.length })}
                </span>
                {totals.discountPaise > 0 && (
                  <span className="text-[11px] font-bold text-primary truncate">
                    {t('dawai_becho.summary_discount')}: -{formatRupees(totals.discountPaise)}
                  </span>
                )}
              </div>
            </div>
            <span className="font-display-total-mobile text-[30px] sm:text-[36px] leading-none font-extrabold text-primary shrink-0">
              {formatRupees(totals.totalPaise)}
            </span>
          </button>

          {/* Action Row: Open Cart Sheet + Proceed to Payment */}
          <div className="flex items-stretch gap-2 w-full">
            <button
              type="button"
              onClick={() => setIsMobileBillSheetOpen(true)}
              className="min-h-[56px] py-2 px-4 bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 text-on-surface rounded-2xl flex items-center justify-center gap-1.5 font-bold text-sm active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <Icon name="shopping_cart" className="text-[22px] text-primary shrink-0" />
              <span>{cart.length}</span>
            </button>

            <button
              type="button"
              onClick={handleProceedToPayment}
              className="flex-1 min-h-[56px] py-2 bg-primary hover:bg-primary-container text-on-primary rounded-2xl px-4 flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] transition-all cursor-pointer min-w-0"
            >
              <Icon name="receipt_long" className="text-[24px] shrink-0" />
              <div className="flex flex-col items-start justify-center text-left leading-tight min-w-0">
                <span className="text-base sm:text-lg font-extrabold tracking-tight truncate max-w-full">
                  {btnMakeBill.main}
                </span>
                {btnMakeBill.sub && (
                  <span className="text-[11px] text-primary-fixed leading-tight truncate max-w-full mt-0.5">
                    {btnMakeBill.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </footer>

        {/* Mobile Slide-Up Full Cart, Customer & Discount Bottom Sheet */}
        {isMobileBillSheetOpen && (
          <div
            className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-[2px] flex flex-col justify-end"
            onClick={() => setIsMobileBillSheetOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="h-[88dvh] w-full bg-surface-container-lowest rounded-t-3xl shadow-2xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col overflow-hidden"
            >
              <div className="w-12 h-1.5 rounded-full bg-outline-variant/60 mx-auto mb-2 shrink-0" />
              <BillPanel
                {...sharedBillPanelProps}
                isMobileSheet
                onCloseMobileSheet={() => setIsMobileBillSheetOpen(false)}
              />
            </div>
          </div>
        )}

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
          recordDescription={
            pendingBillDiscount
              ? pendingBillDiscount.description
              : `Bill #${nextBillNo}: ${totals.effectiveDiscountPercent}% discount (${formatRupees(totals.discountPaise)}) on ${formatRupees(totals.subtotalPaise)}`
          }
          requesterName={userName}
          onApproved={() => {
            setIsApprovalOpen(false);
            setDiscountApproved(true);
            if (pendingBillDiscount) {
              applyBillDiscount(pendingBillDiscount.mode, pendingBillDiscount.value);
              setPendingBillDiscount(null);
              triggerFeedback('success', t('dawai_becho.bill_disc_applied_toast'));
              return;
            }
            executePaymentProceed(true);
          }}
          onClose={() => {
            setIsApprovalOpen(false);
            setPendingBillDiscount(null);
          }}
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
      <footer className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest border-t-2 border-outline-variant/50 rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
          <button
            type="button"
            aria-label="Open bill panel"
            onClick={() => setIsMobileBillSheetOpen(true)}
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer text-left"
          >
            <div className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface shrink-0">
              <Icon name="expand_less" className="text-[24px]" />
            </div>
            <div className="text-base sm:text-[18px] font-bold text-on-surface tracking-tight truncate min-w-0">
              {t('dawai_becho.bill_header_prefix')} #{nextBillNo} ·{' '}
              {t('dawai_becho.items_count', { count: cart.length })}
            </div>
          </button>

          {/* Prominent Total >= 36px always visible */}
          <span className="font-display-total-mobile text-[32px] sm:text-[36px] leading-none font-extrabold text-primary shrink-0">
            {formatRupees(totals.totalPaise)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleProceedToPayment}
          className="w-full min-h-[58px] py-2.5 bg-primary hover:bg-primary-container text-on-primary rounded-2xl px-5 flex items-center justify-center gap-3 shadow-md active:scale-[0.98] transition-all cursor-pointer min-w-0"
        >
          <Icon name="receipt_long" className="text-[26px] sm:text-[28px] shrink-0" />
          <div className="flex flex-col items-start justify-center text-left leading-tight min-w-0">
            <span className="text-lg sm:text-[20px] font-extrabold tracking-tight break-words">{btnMakeBill.main}</span>
            {btnMakeBill.sub && (
              <span className="text-xs sm:text-[14px] text-primary-fixed leading-tight mt-0.5 break-words">{btnMakeBill.sub}</span>
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
        recordDescription={
          pendingBillDiscount
            ? pendingBillDiscount.description
            : `Bill #${nextBillNo}: ${totals.effectiveDiscountPercent}% discount (${formatRupees(totals.discountPaise)}) on ${formatRupees(totals.subtotalPaise)}`
        }
        requesterName={userName}
        onApproved={() => {
          setIsApprovalOpen(false);
          setDiscountApproved(true);
          if (pendingBillDiscount) {
            // Approval was for applying a bill discount: apply it now, stay on the bill screen
            applyBillDiscount(pendingBillDiscount.mode, pendingBillDiscount.value);
            setPendingBillDiscount(null);
            triggerFeedback('success', t('dawai_becho.bill_disc_applied_toast'));
            return;
          }
          executePaymentProceed(true);
        }}
        onClose={() => {
          setIsApprovalOpen(false);
          setPendingBillDiscount(null);
        }}
      />
    </div>
  );
};
