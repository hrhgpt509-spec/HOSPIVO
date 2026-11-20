import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, type DBUser, type Batch } from '../db';
import { useShop } from '../logic/useShop';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import {
  type PendingFastBill,
  type FastBillCartItem,
  type TopSellingMedicine,
  resolveScanCode,
  getTopSellingMedicines,
  calculateFastBillTotals,
  buildFastBillDraft,
} from '../logic/fastBill';
import {
  finalizeBill,
  calculateBillTotals,
  type FinalizeBillResult,
  type BillLineInput,
  type BillTotalsResult,
  type BillDraft,
} from '../logic/billing';
import { t } from '../i18n';
import { PendingQueueList } from './fast-bill/PendingQueueList';
import { ConfirmCardView } from './fast-bill/ConfirmCardView';
import { FinalReviewView } from './fast-bill/FinalReviewView';
import { TileWallView } from './fast-bill/TileWallView';
import { ScheduleHModal } from './fast-bill/ScheduleHModal';
import { OutOfStockModal } from './fast-bill/OutOfStockModal';
import { UnknownScanModal, type UnmappedScan } from './fast-bill/UnknownScanModal';
import { BatchSelectModal } from './fast-bill/BatchSelectModal';
import { PaymentScreen } from './dawai-becho/PaymentScreen';
import { BillDoneScreen } from './dawai-becho/BillDoneScreen';
import type { SubstituteMedicineInfo } from '../logic/billing';
import type { CartItem } from './dawai-becho/types';
import { formatRupees } from '../logic/money';
import { useIsCompactViewport } from '../logic/useViewport';
import { useBackHandler } from '../logic/androidBack';

interface FastBillProps {
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onReturnHome: () => void;
}

export const FastBill: React.FC<FastBillProps> = ({
  currentUser,
  theme = 'light',
  onToggleTheme,
  onReturnHome,
}) => {
  const shop = useShop();
  const isCompactViewport = useIsCompactViewport();

  // Operational View Mode: 'queue' (Runner Scanning & Confirm Card) vs 'wall' (Top-100 Wall)
  const [viewMode, setViewMode] = useState<'queue' | 'wall'>('queue');

  // Pending Rush Bills Queue
  const [pendingBills, setPendingBills] = useState<PendingFastBill[]>(() => [
    {
      id: 'fast-bill-1',
      billNumberLabel: 'Bill 1',
      createdAt: Date.now(),
      status: 'ready',
      items: [],
      currentItemIndex: 0,
    },
  ]);
  const [selectedBillId, setSelectedBillId] = useState<string>('fast-bill-1');

  // Top Selling Medicines for Tile Wall
  const [topMedicines, setTopMedicines] = useState<TopSellingMedicine[]>([]);

  // Persistent Scanner Input
  const [scanCodeInput, setScanCodeInput] = useState('');
  const scannerInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [scheduleHState, setScheduleHState] = useState<{
    isOpen: boolean;
    medicineName: string;
    pendingAction?: (pName: string, dName: string) => void;
  }>({ isOpen: false, medicineName: '' });

  const [outOfStockState, setOutOfStockState] = useState<{
    isOpen: boolean;
    medicineName: string;
    salt?: string;
    substitutes: SubstituteMedicineInfo[];
  }>({ isOpen: false, medicineName: '', substitutes: [] });

  const [unmappedScans, setUnmappedScans] = useState<UnmappedScan[]>([]);
  const [isUnknownModalOpen, setIsUnknownModalOpen] = useState(false);

  const [batchModalState, setBatchModalState] = useState<{
    isOpen: boolean;
    itemIndex: number;
    medicineId: number;
    medicineName: string;
    currentBatchId: number;
  }>({
    isOpen: false,
    itemIndex: -1,
    medicineId: 0,
    medicineName: '',
    currentBatchId: 0,
  });

  useBackHandler(scheduleHState.isOpen, () =>
    setScheduleHState({ isOpen: false, medicineName: '' })
  );
  useBackHandler(outOfStockState.isOpen, () =>
    setOutOfStockState({ isOpen: false, medicineName: '', substitutes: [] })
  );
  useBackHandler(isUnknownModalOpen, () => setIsUnknownModalOpen(false));
  useBackHandler(batchModalState.isOpen, () =>
    setBatchModalState((prev) => ({ ...prev, isOpen: false }))
  );

  // Payment / Completion Flow
  const [paymentScreenData, setPaymentScreenData] = useState<{
    draft: BillDraft;
    cart: CartItem[];
    totals: BillTotalsResult;
  } | null>(null);
  const [completedResult, setCompletedResult] = useState<FinalizeBillResult | null>(null);
  const [isActionFeedback, setIsActionFeedback] = useState(false);

  const activeBill =
    pendingBills.find((b) => b.id === selectedBillId) || pendingBills[0];

  // Refresh Top Medicines
  const loadTopMedicines = useCallback(async () => {
    try {
      const top = await getTopSellingMedicines(100);
      setTopMedicines(top);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTopMedicines();
  }, [loadTopMedicines]);

  // Keep scanner input auto-focused when no modal is open
  useEffect(() => {
    const isAnyModalOpen =
      scheduleHState.isOpen ||
      outOfStockState.isOpen ||
      isUnknownModalOpen ||
      batchModalState.isOpen ||
      paymentScreenData !== null ||
      completedResult !== null;

    if (!isAnyModalOpen) {
      scannerInputRef.current?.focus();
    }
  }, [
    scheduleHState.isOpen,
    outOfStockState.isOpen,
    isUnknownModalOpen,
    batchModalState.isOpen,
    paymentScreenData,
    completedResult,
  ]);

  // Handle new bill creation
  const handleCreateNewBill = useCallback(() => {
    const nextNum = pendingBills.length + 1;
    const newBill: PendingFastBill = {
      id: `fast-bill-${Date.now()}`,
      billNumberLabel: `Bill ${nextNum}`,
      createdAt: Date.now(),
      status: 'ready',
      items: [],
      currentItemIndex: 0,
    };
    setPendingBills((prev) => [...prev, newBill]);
    setSelectedBillId(newBill.id);
  }, [pendingBills.length]);

  // Add Item to current active bill
  const addItemToActiveBill = useCallback(
    (
      medicineId: number,
      medicineName: string,
      strength: string | undefined,
      salt: string | undefined,
      shelf: string | undefined,
      batchId: number,
      batchNo: string,
      expiry: string,
      mrpPaise: number,
      unitsPerPack: number,
      isScheduleH: boolean,
      rxData?: { patientName: string; doctorName: string; rxVerified: boolean }
    ) => {
      setPendingBills((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBillId) return b;

          const existingIdx = b.items.findIndex(
            (i) => i.medicineId === medicineId && i.batchId === batchId
          );

          let nextItems: FastBillCartItem[];
          if (existingIdx >= 0) {
            // Already present: increment quantity by 1
            nextItems = b.items.map((item, idx) => {
              if (idx !== existingIdx) return item;
              const nextQty = item.quantity + 1;
              const nextQtyUnits =
                item.unitType === 'strip' ? nextQty * item.unitsPerPack : nextQty;
              const unitPricePaise =
                item.unitType === 'strip'
                  ? item.mrpPaise
                  : Math.round(item.mrpPaise / item.unitsPerPack);
              return {
                ...item,
                quantity: nextQty,
                qtyUnits: nextQtyUnits,
                lineTotalPaise: nextQty * unitPricePaise,
              };
            });
          } else {
            // New item line
            const unitPricePaise = mrpPaise;
            const newItem: FastBillCartItem = {
              id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              medicineId,
              medicineName,
              strength,
              salt,
              shelf,
              batchId,
              batchNo,
              expiry,
              mrpPaise,
              unitsPerPack: Math.max(1, unitsPerPack),
              unitType: 'strip',
              quantity: 1,
              qtyUnits: unitsPerPack,
              lineTotalPaise: unitPricePaise,
              isScheduleH,
              rxVerified: rxData?.rxVerified,
              patientName: rxData?.patientName,
              doctorName: rxData?.doctorName,
              confirmed: false,
            };
            nextItems = [...b.items, newItem];
          }

          return {
            ...b,
            items: nextItems,
            status: 'ready',
          };
        })
      );

      // Feedback flash
      setIsActionFeedback(true);
      setTimeout(() => setIsActionFeedback(false), 200);
    },
    [selectedBillId]
  );

  // Scan or typed code execution
  const handleExecuteScan = useCallback(
    async (codeToScan: string) => {
      if (!codeToScan.trim()) return;
      try {
        const res = await resolveScanCode(codeToScan.trim());

        if (res.kind === 'special') {
          if (res.command === 'next_bill') {
            handleCreateNewBill();
          } else if (res.command === 'undo') {
            // Remove last item
            setPendingBills((prev) =>
              prev.map((b) =>
                b.id === selectedBillId && b.items.length > 0
                  ? { ...b, items: b.items.slice(0, -1) }
                  : b
              )
            );
          } else if (res.command === 'cancel_bill') {
            // Clear bill
            setPendingBills((prev) =>
              prev.map((b) =>
                b.id === selectedBillId ? { ...b, items: [], currentItemIndex: 0 } : b
              )
            );
          }
          return;
        }

        if (res.kind === 'not_found') {
          const newUnmapped: UnmappedScan = {
            code: res.code,
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setUnmappedScans((prev) => [newUnmapped, ...prev]);
          setIsUnknownModalOpen(true);
          return;
        }

        if (res.kind === 'out_of_stock') {
          setOutOfStockState({
            isOpen: true,
            medicineName: res.medicine.name,
            salt: res.medicine.salt,
            substitutes: res.substitutes,
          });
          return;
        }

        if (res.kind === 'ambiguous') {
          // If ambiguous, pick first candidate with valid stock
          const first = res.medicines[0];
          await handleExecuteScan(first.shortCode || first.barcode || first.name);
          return;
        }

        if (res.kind === 'matched') {
          const med = res.medicine;
          const batch = res.batch;

          if (res.isScheduleH) {
            setScheduleHState({
              isOpen: true,
              medicineName: med.name,
              pendingAction: (patientName, doctorName) => {
                addItemToActiveBill(
                  med.id!,
                  med.name,
                  med.strength,
                  med.salt,
                  med.shelf,
                  batch.id!,
                  batch.batchNo,
                  batch.expiry,
                  med.mrpPaise,
                  med.unitsPerPack,
                  true,
                  { patientName, doctorName, rxVerified: true }
                );
              },
            });
          } else {
            addItemToActiveBill(
              med.id!,
              med.name,
              med.strength,
              med.salt,
              med.shelf,
              batch.id!,
              batch.batchNo,
              batch.expiry,
              med.mrpPaise,
              med.unitsPerPack,
              false
            );
          }
        }
      } catch {
        // error handling
      }
    },
    [selectedBillId, handleCreateNewBill, addItemToActiveBill]
  );

  // Update quantity of an item
  const handleUpdateItemQuantity = useCallback(
    (index: number, newQty: number) => {
      setPendingBills((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBillId) return b;
          const nextItems = b.items.map((item, idx) => {
            if (idx !== index) return item;
            const units =
              item.unitType === 'strip' ? newQty * item.unitsPerPack : newQty;
            const unitPricePaise =
              item.unitType === 'strip'
                ? item.mrpPaise
                : Math.round(item.mrpPaise / item.unitsPerPack);
            return {
              ...item,
              quantity: newQty,
              qtyUnits: units,
              lineTotalPaise: newQty * unitPricePaise,
            };
          });
          return { ...b, items: nextItems };
        })
      );
    },
    [selectedBillId]
  );

  // Toggle unit (strip / loose) for item
  const handleToggleItemUnit = useCallback(
    (index: number) => {
      setPendingBills((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBillId) return b;
          const nextItems = b.items.map((item, idx) => {
            if (idx !== index) return item;
            const nextType: 'strip' | 'loose' =
              item.unitType === 'strip' ? 'loose' : 'strip';
            const unitPricePaise =
              nextType === 'strip'
                ? item.mrpPaise
                : Math.round(item.mrpPaise / item.unitsPerPack);
            const units =
              nextType === 'strip'
                ? item.quantity * item.unitsPerPack
                : item.quantity;
            return {
              ...item,
              unitType: nextType,
              qtyUnits: units,
              lineTotalPaise: item.quantity * unitPricePaise,
            };
          });
          return { ...b, items: nextItems };
        })
      );
    },
    [selectedBillId]
  );

  // Remove item from bill
  const handleRemoveItem = useCallback(
    (index: number) => {
      setPendingBills((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBillId) return b;
          const nextItems = b.items.filter((_, idx) => idx !== index);
          const currentIdx = Math.min(
            b.currentItemIndex ?? 0,
            Math.max(0, nextItems.length - 1)
          );
          return { ...b, items: nextItems, currentItemIndex: currentIdx };
        })
      );
    },
    [selectedBillId]
  );

  // Change batch for an item
  const handleChangeBatchForItem = useCallback(
    (index: number, newBatch: Batch) => {
      setPendingBills((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBillId) return b;
          const nextItems = b.items.map((item, idx) => {
            if (idx !== index) return item;
            return {
              ...item,
              batchId: newBatch.id!,
              batchNo: newBatch.batchNo,
              expiry: newBatch.expiry,
            };
          });
          return { ...b, items: nextItems };
        })
      );
    },
    [selectedBillId]
  );

  // Advance to next item in confirm queue
  const handleConfirmAndNext = useCallback(() => {
    setPendingBills((prev) =>
      prev.map((b) => {
        if (b.id !== selectedBillId) return b;
        const currentIdx = b.currentItemIndex ?? 0;
        return {
          ...b,
          currentItemIndex: currentIdx + 1,
        };
      })
    );
  }, [selectedBillId]);

  // Go back to previous item in confirm queue
  const handleBackInQueue = useCallback(() => {
    setPendingBills((prev) =>
      prev.map((b) => {
        if (b.id !== selectedBillId) return b;
        const currentIdx = b.currentItemIndex ?? 0;
        return {
          ...b,
          currentItemIndex: Math.max(0, currentIdx - 1),
        };
      })
    );
  }, [selectedBillId]);

  // 1-tap Cash Finalize
  const handleQuickCashFinalize = useCallback(async () => {
    if (!activeBill || activeBill.items.length === 0) return;
    try {
      const totals = calculateFastBillTotals(activeBill.items);
      const draft = buildFastBillDraft(activeBill.items, 'cash', totals.totalPaise);
      const result = await finalizeBill(draft, currentUser as any);
      setCompletedResult(result);
      // Remove finished bill
      setPendingBills((prev) => prev.filter((b) => b.id !== activeBill.id));
      handleCreateNewBill();
      loadTopMedicines();
    } catch {
      // error
    }
  }, [activeBill, currentUser, handleCreateNewBill, loadTopMedicines]);

  // 1-tap UPI Finalize
  const handleQuickUpiFinalize = useCallback(async () => {
    if (!activeBill || activeBill.items.length === 0) return;
    try {
      const draft = buildFastBillDraft(activeBill.items, 'upi');
      const result = await finalizeBill(draft, currentUser as any);
      setCompletedResult(result);
      // Remove finished bill
      setPendingBills((prev) => prev.filter((b) => b.id !== activeBill.id));
      handleCreateNewBill();
      loadTopMedicines();
    } catch {
      // error
    }
  }, [activeBill, currentUser, handleCreateNewBill, loadTopMedicines]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const isAnyModalOpen =
      scheduleHState.isOpen ||
      outOfStockState.isOpen ||
      isUnknownModalOpen ||
      batchModalState.isOpen ||
      paymentScreenData !== null ||
      completedResult !== null;

    if (isAnyModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in search/filter box
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const currentIdx = activeBill?.currentItemIndex ?? 0;
      const isFinalReview =
        activeBill &&
        activeBill.items.length > 0 &&
        currentIdx >= activeBill.items.length;

      if (e.key === 'Enter') {
        if (!isInput) {
          e.preventDefault();
          if (viewMode === 'queue') {
            if (isFinalReview) {
              handleQuickCashFinalize();
            } else if (activeBill && activeBill.items.length > 0) {
              handleConfirmAndNext();
            }
          } else {
            // In wall mode, Enter executes payment or review
            handleQuickCashFinalize();
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (!isInput) {
          e.preventDefault();
          handleBackInQueue();
        }
      } else if (e.key === 's' || e.key === 'S') {
        if (!isInput && activeBill && !isFinalReview) {
          e.preventDefault();
          handleConfirmAndNext();
        }
      } else if (e.key === 'l' || e.key === 'L') {
        if (!isInput && activeBill && !isFinalReview) {
          e.preventDefault();
          handleToggleItemUnit(currentIdx);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInput && activeBill && activeBill.items.length > 0) {
          e.preventDefault();
          handleRemoveItem(currentIdx);
        }
      } else if (e.key === 'b' || e.key === 'B') {
        if (!isInput && activeBill && !isFinalReview && activeBill.items[currentIdx]) {
          e.preventDefault();
          const item = activeBill.items[currentIdx];
          setBatchModalState({
            isOpen: true,
            itemIndex: currentIdx,
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            currentBatchId: item.batchId,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    scheduleHState.isOpen,
    outOfStockState.isOpen,
    isUnknownModalOpen,
    batchModalState.isOpen,
    paymentScreenData,
    completedResult,
    activeBill,
    viewMode,
    handleConfirmAndNext,
    handleBackInQueue,
    handleToggleItemUnit,
    handleRemoveItem,
    handleQuickCashFinalize,
  ]);

  const handleOpenDetailedPayment = useCallback(async () => {
    if (!activeBill || activeBill.items.length === 0) return;
    const medIds = activeBill.items.map((i) => i.medicineId);
    const medicines = await db.medicines.where('id').anyOf(medIds).toArray();
    const medMap = new Map(medicines.map((m) => [m.id!, m]));

    const cart: CartItem[] = [];
    const lineInputs: BillLineInput[] = [];

    for (const item of activeBill.items) {
      const med = medMap.get(item.medicineId);
      if (!med) continue;

      lineInputs.push({
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        unitMode: (item.unitType === 'strip' ? 'pack' : 'loose') as 'pack' | 'loose',
        qtyInput: item.quantity,
        unitsPerPack: item.unitsPerPack,
        mrpPaise: item.mrpPaise,
        itemDiscountPercent: 0,
        gstPercent: med.gstPercent,
      });

      cart.push({
        id: item.id,
        medicine: med,
        unitMode: (item.unitType === 'strip' ? 'pack' : 'loose') as 'pack' | 'loose',
        qtyInput: item.quantity,
        itemDiscountPercent: 0,
        allocations: [
          {
            batchId: item.batchId,
            batchNo: item.batchNo,
            expiry: item.expiry,
            qtyUnits: item.qtyUnits,
            shelf: item.shelf || '',
          },
        ],
        availableValidUnits: item.qtyUnits,
        patientName: item.patientName || '',
        doctorName: item.doctorName || '',
        prescriptionChecked: !!item.rxVerified,
      });
    }

    const billTotals = calculateBillTotals(lineInputs);
    const draft = buildFastBillDraft(activeBill.items, 'cash', billTotals.totalPaise);
    setPaymentScreenData({ draft, cart, totals: billTotals });
  }, [activeBill]);

  // If completed bill result is showing, display BillDoneScreen
  if (completedResult) {
    return (
      <BillDoneScreen
        bill={completedResult.bill}
        items={completedResult.billItems}
        currentUser={currentUser as any}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnHome={onReturnHome}
        onDone={() => setCompletedResult(null)}
      />
    );
  }

  // If detailed payment screen is triggered
  if (paymentScreenData && activeBill) {
    return (
      <PaymentScreen
        draft={paymentScreenData.draft}
        cart={paymentScreenData.cart}
        totals={paymentScreenData.totals}
        approvalVerified={true}
        currentUser={currentUser as any}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReturnHome={onReturnHome}
        onBackToCart={() => setPaymentScreenData(null)}
        onBillFinalized={(result) => {
          setPaymentScreenData(null);
          setCompletedResult(result);
          setPendingBills((prev) => prev.filter((b) => b.id !== activeBill.id));
          handleCreateNewBill();
          loadTopMedicines();
        }}
      />
    );
  }

  const currentIdx = activeBill?.currentItemIndex ?? 0;
  const isFinalReview =
    activeBill &&
    activeBill.items.length > 0 &&
    currentIdx >= activeBill.items.length;
  const currentItem = activeBill?.items[currentIdx];

  // Dedicated Mobile & Portrait-Tablet Layout (< 1024px)
  if (isCompactViewport) {
    const fastTotals = calculateFastBillTotals(activeBill?.items ?? []);

    return (
      <div
        className={`w-full min-h-dvh flex flex-col font-body-md text-on-surface select-none overflow-x-clip transition-colors duration-150 pb-36 ${
          isActionFeedback ? 'bg-primary/10' : 'bg-background'
        }`}
      >
        {/* Sticky Compact Top Header */}
        <header className="sticky top-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-xs px-3 py-2 flex items-center justify-between gap-2">
          {/* Left: Home */}
          <button
            type="button"
            onClick={onReturnHome}
            className="h-11 min-h-[44px] px-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/50 rounded-2xl shadow-xs text-on-surface active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            aria-label="Home"
          >
            <Icon name="home" className="text-primary text-[20px]" />
            <span className="text-xs sm:text-sm font-bold">{t('common.btn_home.main')}</span>
          </button>

          {/* Center Title */}
          <div className="flex flex-col items-center min-w-0 flex-1 px-1">
            <h1 className="text-base sm:text-lg font-extrabold text-on-surface tracking-tight truncate">
              {t('fast_bill.title')}
            </h1>
            {shop.name && (
              <span className="text-[11px] text-on-surface-variant font-medium truncate max-w-[150px]">
                {shop.name}
              </span>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Top Horizontal Scrollable Bill Tabs (One-thumb active bill switching) */}
        <div className="overflow-x-auto flex items-center gap-2 px-3 py-2 bg-surface-container-low border-b border-outline-variant/30 shrink-0 no-scrollbar">
          {pendingBills.map((bill) => (
            <button
              key={bill.id}
              type="button"
              onClick={() => setSelectedBillId(bill.id)}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-sm font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                bill.id === selectedBillId
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container-lowest border border-outline-variant/50 text-on-surface hover:bg-surface-container'
              }`}
            >
              <span>{bill.billNumberLabel}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-extrabold ${
                  bill.id === selectedBillId
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {bill.items.length}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={handleCreateNewBill}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
          >
            <Icon name="add" className="text-[18px]" />
            <span>+ New Bill</span>
          </button>
        </div>

        {/* Full-width Quick Search / Barcode Input (min-h-[52px]) */}
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExecuteScan(scanCodeInput);
              setScanCodeInput('');
            }}
            className="relative flex items-center w-full"
          >
            <div className="absolute left-3.5 text-primary pointer-events-none">
              <Icon name="barcode_scanner" className="text-[22px]" />
            </div>
            <input
              ref={scannerInputRef}
              type="text"
              value={scanCodeInput}
              onChange={(e) => setScanCodeInput(e.target.value)}
              placeholder="Scan barcode / short code (C1) / search..."
              className="w-full h-13 min-h-[52px] pl-11 pr-14 rounded-2xl bg-surface-container-lowest border-2 border-primary/60 focus:border-primary text-sm sm:text-base text-on-surface outline-none shadow-xs transition-all"
            />
            <button
              type="submit"
              className="absolute right-1.5 h-10 px-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
            >
              ↵
            </button>
          </form>
        </div>

        {/* Tap-to-Add Top Medicines Strip */}
        {topMedicines.length > 0 && (
          <div className="px-3 py-1.5 shrink-0">
            <div className="overflow-x-auto flex items-center gap-2 pb-1 no-scrollbar">
              {topMedicines.slice(0, 10).map((med) => (
                <button
                  key={med.id}
                  type="button"
                  onClick={() => handleExecuteScan(med.shortCode || med.barcode || med.name)}
                  className="min-h-[48px] px-3 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:border-primary text-left flex items-center gap-2 shrink-0 active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-on-surface truncate max-w-[120px]">
                      {med.name}
                    </span>
                    <span className="text-[10px] text-on-surface-variant font-medium">
                      {formatRupees(med.mrp)}
                    </span>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-primary-fixed text-primary flex items-center justify-center font-bold">
                    <Icon name="add" className="text-[16px]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact Cart List for activeBill */}
        <div className="flex-1 w-full px-3 py-2 flex flex-col gap-2.5">
          {activeBill.items.length === 0 ? (
            <div className="p-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 flex flex-col items-center justify-center text-center text-on-surface-variant gap-2 my-2">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon name="barcode_scanner" className="text-[36px]" />
              </div>
              <span className="font-bold text-base text-on-surface">
                {activeBill.billNumberLabel} - Ready for Scanning
              </span>
              <span className="text-xs max-w-xs">
                Scan barcode, enter short code, or tap top medicines above to add items.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {activeBill.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-3 flex flex-col gap-2 shadow-xs transition-all"
                >
                  {/* Top row: Medicine name, strength, details & line total */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-base font-bold text-on-surface leading-tight truncate">
                          {item.medicineName}
                        </h3>
                        {item.strength && (
                          <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
                            {item.strength}
                          </span>
                        )}
                        {item.isScheduleH && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-error-container text-on-error-container">
                            Sch H
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-on-surface-variant mt-0.5">
                        {formatRupees(item.mrpPaise)} / strip
                        {item.batchNo ? ` · Batch: ${item.batchNo}` : ''}
                        {item.shelf ? ` · Shelf: ${item.shelf}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-extrabold text-primary">
                        {formatRupees(item.lineTotalPaise)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: Strip/Loose Toggle + Stepper + Change Batch + Remove */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/30 gap-2 flex-wrap">
                    <div className="flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/50 h-11 items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => item.unitType !== 'strip' && handleToggleItemUnit(idx)}
                        className={`h-full px-3 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-colors ${
                          item.unitType === 'strip'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Strip
                      </button>
                      <button
                        type="button"
                        onClick={() => item.unitType !== 'loose' && handleToggleItemUnit(idx)}
                        className={`h-full px-3 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-colors ${
                          item.unitType === 'loose'
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Loose
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => {
                          if (item.quantity > 1) {
                            handleUpdateItemQuantity(idx, item.quantity - 1);
                          } else {
                            handleRemoveItem(idx);
                          }
                        }}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] bg-surface-container-low hover:bg-surface-container border border-outline-variant/60 text-on-surface rounded-xl flex items-center justify-center font-bold text-xl active:scale-95 transition-all cursor-pointer"
                      >
                        −
                      </button>
                      <span className="text-base font-bold text-on-surface w-7 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => handleUpdateItemQuantity(idx, item.quantity + 1)}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] bg-primary-fixed border border-primary/30 text-on-primary-fixed rounded-xl flex items-center justify-center font-bold text-xl active:bg-primary active:text-on-primary active:scale-95 transition-all cursor-pointer"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label="Change batch"
                        onClick={() =>
                          setBatchModalState({
                            isOpen: true,
                            itemIndex: idx,
                            medicineId: item.medicineId,
                            medicineName: item.medicineName,
                            currentBatchId: item.batchId,
                          })
                        }
                        className="w-11 h-11 min-w-[44px] min-h-[44px] text-on-surface-variant hover:bg-surface-container rounded-xl flex items-center justify-center cursor-pointer"
                        title="Change batch"
                      >
                        <Icon name="layers" className="text-[18px]" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => handleRemoveItem(idx)}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] text-error hover:bg-error-container/20 rounded-xl flex items-center justify-center cursor-pointer"
                      >
                        <Icon name="delete" className="text-[20px]" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Bottom "Complete Bill" Bar */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 bg-surface-container-lowest border-t-2 border-outline-variant/40 rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2.5 w-full">
            <div className="text-sm sm:text-base font-bold text-on-surface tracking-tight truncate">
              {activeBill.billNumberLabel} ·{' '}
              <span className="text-on-surface-variant font-medium">
                {activeBill.items.length} items
              </span>
            </div>
            <span className="font-display-total-mobile text-[30px] sm:text-[34px] leading-none font-extrabold text-primary shrink-0">
              {formatRupees(fastTotals.totalPaise)}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={handleQuickCashFinalize}
              disabled={activeBill.items.length === 0}
              className="h-14 min-h-[56px] flex-1 bg-primary hover:bg-primary-container disabled:opacity-40 text-on-primary rounded-2xl font-extrabold text-base sm:text-lg flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer transition-all"
            >
              <Icon name="payments" className="text-[24px]" />
              <span>Cash {formatRupees(fastTotals.totalPaise)}</span>
            </button>

            <button
              type="button"
              onClick={handleQuickUpiFinalize}
              disabled={activeBill.items.length === 0}
              className="h-14 min-h-[56px] px-4 bg-tertiary-container hover:brightness-105 disabled:opacity-40 text-on-tertiary-container rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer transition-all"
            >
              <Icon name="qr_code_2" className="text-[22px]" />
              <span>UPI</span>
            </button>

            <button
              type="button"
              onClick={handleOpenDetailedPayment}
              disabled={activeBill.items.length === 0}
              className="h-14 min-h-[56px] w-14 rounded-2xl bg-surface-container-low hover:bg-surface-container disabled:opacity-40 text-on-surface flex items-center justify-center cursor-pointer transition-all shrink-0"
              title="Detailed Payment"
            >
              <Icon name="receipt_long" className="text-[24px]" />
            </button>
          </div>
        </footer>

        {/* Modals for Compact View */}
        <ScheduleHModal
          isOpen={scheduleHState.isOpen}
          medicineName={scheduleHState.medicineName}
          onConfirm={(pName, dName) => {
            scheduleHState.pendingAction?.(pName, dName);
            setScheduleHState({ isOpen: false, medicineName: '' });
          }}
          onCancel={() => {
            setScheduleHState({ isOpen: false, medicineName: '' });
          }}
        />

        <OutOfStockModal
          isOpen={outOfStockState.isOpen}
          medicineName={outOfStockState.medicineName}
          salt={outOfStockState.salt}
          substitutes={outOfStockState.substitutes}
          onSelectSubstitute={(sub) => {
            setOutOfStockState({ isOpen: false, medicineName: '', substitutes: [] });
            handleExecuteScan(sub.name);
          }}
          onSkip={() => {
            setOutOfStockState({ isOpen: false, medicineName: '', substitutes: [] });
          }}
        />

        <UnknownScanModal
          isOpen={isUnknownModalOpen}
          unmappedScans={unmappedScans}
          onFixScan={(code) => {
            setIsUnknownModalOpen(false);
            setScanCodeInput(code);
          }}
          onDismissScan={(code) => {
            setUnmappedScans((prev) => prev.filter((s) => s.code !== code));
          }}
          onClose={() => setIsUnknownModalOpen(false)}
        />

        <BatchSelectModal
          isOpen={batchModalState.isOpen}
          medicineId={batchModalState.medicineId}
          medicineName={batchModalState.medicineName}
          currentBatchId={batchModalState.currentBatchId}
          onSelectBatch={(batch) => {
            if (batchModalState.itemIndex >= 0) {
              handleChangeBatchForItem(batchModalState.itemIndex, batch);
            }
          }}
          onClose={() =>
            setBatchModalState({
              isOpen: false,
              itemIndex: -1,
              medicineId: 0,
              medicineName: '',
              currentBatchId: 0,
            })
          }
        />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col font-body-md text-on-surface select-none transition-colors duration-150 ${
        isActionFeedback ? 'bg-primary/10' : 'bg-background'
      }`}
    >
      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md shadow-xs border-b border-outline-variant/30">
        <div className="h-16 md:h-20 w-full px-gutter flex items-center justify-between gap-space-md">
          {/* Left Brand & Shop Name */}
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shadow-xs">
                <Icon name="local_pharmacy" className="text-[24px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-md text-lg md:text-xl font-bold tracking-tight text-primary leading-tight">
                  {t('fast_bill.title')}
                </span>
                <span className="font-label-sub-english text-xs text-on-surface-variant truncate max-w-[200px]">
                  {shop.name || 'Hospivo Pharmacy'}
                </span>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="hidden md:flex items-center bg-surface-container-low p-1 rounded-xl gap-1 border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setViewMode('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'queue'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="receipt_long" className="text-[18px]" />
                <span>Runner Queue</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('wall')}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'wall'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="grid_view" className="text-[18px]" />
                <span>Top 100 Wall</span>
              </button>
            </div>
          </div>

          {/* Center Persistent Scanner Input */}
          <div className="flex-1 max-w-md hidden sm:block">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteScan(scanCodeInput);
                setScanCodeInput('');
              }}
              className="relative"
            >
              <input
                ref={scannerInputRef}
                type="text"
                value={scanCodeInput}
                onChange={(e) => setScanCodeInput(e.target.value)}
                placeholder="Scan barcode / short code (C1)..."
                className="w-full h-10 md:h-11 pl-9 pr-16 rounded-xl bg-surface-container-low border border-outline-variant/60 font-body-md text-xs md:text-sm text-on-surface outline-none focus:border-primary focus:bg-surface-container-lowest transition-colors shadow-xs"
              />
              <div className="absolute left-2.5 top-2.5 text-primary">
                <Icon name="barcode_scanner" className="text-[18px]" />
              </div>
              <button
                type="submit"
                className="absolute right-1 top-1 h-8 md:h-9 px-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold transition-all cursor-pointer"
              >
                ↵
              </button>
            </form>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-space-sm">
            <div className="hidden lg:flex items-center gap-1 bg-surface-container-low px-2.5 py-1 rounded-full border border-outline-variant/20 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="font-label-sub-english text-xs text-on-surface-variant font-medium">
                {t('common.local_mode')}
              </span>
            </div>

            <FullscreenButton />

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer"
                title={t('common.toggle_theme')}
              >
                <Icon
                  name={theme === 'dark' ? 'light_mode' : 'dark_mode'}
                  className="text-[20px]"
                />
              </button>
            )}

            <button
              type="button"
              onClick={onReturnHome}
              className="h-10 px-3 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface font-bold text-xs md:text-sm flex items-center gap-1 transition-all cursor-pointer shadow-xs"
              title={t('common.btn_home.main')}
            >
              <Icon name="home" className="text-[20px]" />
              <span className="hidden md:inline">{t('common.btn_home.main')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Workspace */}
      <main className="w-full pt-16 md:pt-20 bg-background flex-1 flex flex-col min-h-0">
        <div className="flex-1 w-full p-space-md md:p-space-lg box-border overflow-y-auto lg:overflow-hidden min-h-[calc(100dvh-5rem)]">
          {viewMode === 'queue' ? (
            <div className="flex flex-col lg:flex-row w-full h-full gap-space-lg max-h-[860px]">
              {/* Left Column: Pending Bills Queue (30%) */}
              <PendingQueueList
                bills={pendingBills}
                selectedBillId={selectedBillId}
                onSelectBill={(id) => setSelectedBillId(id)}
                onNewBill={handleCreateNewBill}
                scannerConnected={true}
              />

              {/* Right Column: Confirm Card (70%) OR Final Review */}
              {activeBill.items.length === 0 ? (
                <section className="w-full lg:w-[70%] h-full flex flex-col items-center justify-center p-space-xl bg-surface-container-lowest rounded-2xl border border-outline-variant/30 text-center shadow-sm">
                  <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-space-md">
                    <Icon name="barcode_scanner" className="text-[44px]" />
                  </div>
                  <h2 className="font-headline-lg text-2xl font-bold text-on-surface mb-2">
                    {activeBill.billNumberLabel} - Ready for Scanning
                  </h2>
                  <p className="text-base text-on-surface-variant max-w-md">
                    Wireless scanner se dawai scan karein ya Top 100 Wall tab par jakar dawai jodein.
                  </p>
                  <div className="mt-space-lg flex items-center gap-space-sm">
                    <button
                      type="button"
                      onClick={() => setViewMode('wall')}
                      className="h-14 px-space-lg rounded-2xl bg-primary hover:bg-primary-container text-on-primary font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all"
                    >
                      <Icon name="grid_view" className="text-[24px]" />
                      <span>Open Top 100 Wall</span>
                    </button>
                  </div>
                </section>
              ) : isFinalReview ? (
                <FinalReviewView
                  billNumberLabel={activeBill.billNumberLabel}
                  items={activeBill.items}
                  onWapas={handleBackInQueue}
                  onPayNow={handleOpenDetailedPayment}
                  onQuickCash={handleQuickCashFinalize}
                  onQuickUpi={handleQuickUpiFinalize}
                  onRemoveItem={handleRemoveItem}
                  onChangeBatch={(idx) => {
                    const it = activeBill.items[idx];
                    setBatchModalState({
                      isOpen: true,
                      itemIndex: idx,
                      medicineId: it.medicineId,
                      medicineName: it.medicineName,
                      currentBatchId: it.batchId,
                    });
                  }}
                />
              ) : currentItem ? (
                <ConfirmCardView
                  billNumberLabel={activeBill.billNumberLabel}
                  item={currentItem}
                  itemIndex={currentIdx}
                  totalItems={activeBill.items.length}
                  onUpdateQuantity={(qty) => handleUpdateItemQuantity(currentIdx, qty)}
                  onToggleUnit={() => handleToggleItemUnit(currentIdx)}
                  onConfirmAndNext={handleConfirmAndNext}
                  onBack={handleBackInQueue}
                  onSkip={handleConfirmAndNext}
                  onRemoveItem={() => handleRemoveItem(currentIdx)}
                  onChangeBatch={() => {
                    setBatchModalState({
                      isOpen: true,
                      itemIndex: currentIdx,
                      medicineId: currentItem.medicineId,
                      medicineName: currentItem.medicineName,
                      currentBatchId: currentItem.batchId,
                    });
                  }}
                />
              ) : null}
            </div>
          ) : (
            <TileWallView
              topMedicines={topMedicines}
              cartItems={activeBill?.items ?? []}
              onAddMedicine={(med) => {
                handleExecuteScan(med.shortCode || med.barcode || med.name);
              }}
              onRemoveItem={handleRemoveItem}
              onClearBill={() => {
                setPendingBills((prev) =>
                  prev.map((b) =>
                    b.id === selectedBillId ? { ...b, items: [], currentItemIndex: 0 } : b
                  )
                );
              }}
              onProceedToReviewOrCheckout={() => {
                // If in wall mode, proceed to review
                setViewMode('queue');
                setPendingBills((prev) =>
                  prev.map((b) =>
                    b.id === selectedBillId
                      ? { ...b, currentItemIndex: b.items.length }
                      : b
                  )
                );
              }}
              onScanOrCodeSubmit={handleExecuteScan}
              onRefreshTop={loadTopMedicines}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      <ScheduleHModal
        isOpen={scheduleHState.isOpen}
        medicineName={scheduleHState.medicineName}
        onConfirm={(pName, dName) => {
          scheduleHState.pendingAction?.(pName, dName);
          setScheduleHState({ isOpen: false, medicineName: '' });
        }}
        onCancel={() => {
          setScheduleHState({ isOpen: false, medicineName: '' });
        }}
      />

      <OutOfStockModal
        isOpen={outOfStockState.isOpen}
        medicineName={outOfStockState.medicineName}
        salt={outOfStockState.salt}
        substitutes={outOfStockState.substitutes}
        onSelectSubstitute={(sub) => {
          setOutOfStockState({ isOpen: false, medicineName: '', substitutes: [] });
          handleExecuteScan(sub.name);
        }}
        onSkip={() => {
          setOutOfStockState({ isOpen: false, medicineName: '', substitutes: [] });
        }}
      />

      <UnknownScanModal
        isOpen={isUnknownModalOpen}
        unmappedScans={unmappedScans}
        onFixScan={(code) => {
          setIsUnknownModalOpen(false);
          // Pre-fill filter to search medicine
          setViewMode('wall');
          setScanCodeInput(code);
        }}
        onDismissScan={(code) => {
          setUnmappedScans((prev) => prev.filter((s) => s.code !== code));
        }}
        onClose={() => setIsUnknownModalOpen(false)}
      />

      <BatchSelectModal
        isOpen={batchModalState.isOpen}
        medicineId={batchModalState.medicineId}
        medicineName={batchModalState.medicineName}
        currentBatchId={batchModalState.currentBatchId}
        onSelectBatch={(batch) => {
          if (batchModalState.itemIndex >= 0) {
            handleChangeBatchForItem(batchModalState.itemIndex, batch);
          }
        }}
        onClose={() =>
          setBatchModalState({
            isOpen: false,
            itemIndex: -1,
            medicineId: 0,
            medicineName: '',
            currentBatchId: 0,
          })
        }
      />
    </div>
  );
};
