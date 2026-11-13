import React, { useState, useEffect, useCallback } from 'react';
import { db, type Medicine, type Batch, type DBUser, type Shop, type StockMovement, type Purchase, type PurchaseLine, type Supplier } from '../db';
import { useTranslation } from '../i18n';
import { StockList } from './stockDekho/StockList';
import { BatchDetail } from './stockDekho/BatchDetail';
import { LowStockList } from './stockDekho/LowStockList';
import {
  sanitizeBatchForUser,
  groupLowStockBySupplier,
  type MedicineStockSummary,
  type BatchStockDetail,
  type SupplierLowStockGroup,
} from '../logic/stockDekho';
import { lowStock, outOfStock, isOutOfStock, isLowStock } from '../logic/stock';

interface StockDekhoProps {
  onReturnHome: () => void;
  onOpenShelfMap?: () => void;
  onOpenStickers?: (shelfCode?: string) => void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

type StockDekhoView = 'list' | 'batch_detail' | 'shopping_list';

export const StockDekho: React.FC<StockDekhoProps> = ({
  onReturnHome,
  onOpenShelfMap,
  onOpenStickers,
  currentUser,
  shop,
  theme,
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const [currentView, setCurrentView] = useState<StockDekhoView>('list');
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lowStockIds, setLowStockIds] = useState<Set<number>>(new Set());
  const [outOfStockIds, setOutOfStockIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [allMeds, allBatches, allMovements, allPurchases, allLines, allSuppliers, lowItems, outItems] =
        await Promise.all([
          db.medicines.toArray(),
          db.batches.toArray(),
          db.stockMovements.toArray(),
          db.purchases.toArray(),
          db.purchaseLines.toArray(),
          db.suppliers.toArray(),
          lowStock(),
          outOfStock(),
        ]);

      setMedicines(allMeds.filter((m) => m.active));
      setBatches(allBatches);
      setMovements(allMovements);
      setPurchases(allPurchases);
      setPurchaseLines(allLines);
      setSuppliers(allSuppliers);
      setLowStockIds(new Set(lowItems.map((i) => i.medicine.id).filter((id): id is number => id !== undefined)));
      setOutOfStockIds(new Set(outItems.map((i) => i.medicine.id).filter((id): id is number => id !== undefined)));
    } catch {
      // IndexedDB fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate medicine stock summaries
  const stockSummaries: MedicineStockSummary[] = React.useMemo(() => {
    // Map medicineId -> total units
    const unitsMap = new Map<number, number>();
    for (const m of movements) {
      const current = unitsMap.get(m.medicineId) || 0;
      unitsMap.set(m.medicineId, current + m.qtyUnits);
    }

    return medicines.map((med) => {
      const medId = med.id ?? 0;
      const currentStockUnits = unitsMap.get(medId) || 0;
      const upp = Math.max(1, med.unitsPerPack || 1);
      const totalPacks = Math.floor(currentStockUnits / upp);
      const looseUnits = currentStockUnits % upp;

      let status: 'normal' | 'low' | 'out' = 'normal';
      if (isOutOfStock(currentStockUnits)) {
        status = 'out';
      } else if (isLowStock(currentStockUnits, med.minStockUnits ?? 0)) {
        status = 'low';
      }

      return {
        medicine: med,
        currentStockUnits,
        totalPacks,
        looseUnits,
        status,
      };
    });
  }, [medicines, movements, lowStockIds, outOfStockIds]);

  // Batch details for selected medicine (every batch with stock > 0, earliest expiry first)
  const selectedMedicineBatchDetails: BatchStockDetail[] = React.useMemo(() => {
    if (!selectedMedicine || selectedMedicine.id === undefined) return [];

    const medId = selectedMedicine.id;
    // Map batchId -> units
    const batchUnitsMap = new Map<number, number>();
    for (const m of movements) {
      if (m.medicineId === medId) {
        const cur = batchUnitsMap.get(m.batchId) || 0;
        batchUnitsMap.set(m.batchId, cur + m.qtyUnits);
      }
    }

    const medBatches = batches
      .filter((b) => b.medicineId === medId && (batchUnitsMap.get(b.id ?? 0) || 0) > 0)
      .sort((a, b) => a.expiry.localeCompare(b.expiry));

    return medBatches.map((b) => {
      const batchUnits = batchUnitsMap.get(b.id ?? 0) || 0;
      return sanitizeBatchForUser(b, batchUnits, selectedMedicine.unitsPerPack || 1, currentUser);
    });
  }, [selectedMedicine, batches, movements, currentUser]);

  const selectedMedicineTotalUnits = React.useMemo(() => {
    if (!selectedMedicine || selectedMedicine.id === undefined) return 0;
    const summary = stockSummaries.find((s) => s.medicine.id === selectedMedicine.id);
    return summary ? summary.currentStockUnits : 0;
  }, [selectedMedicine, stockSummaries]);

  // Low stock grouped by supplier for shopping list (25)
  const supplierLowStockGroups: SupplierLowStockGroup[] = React.useMemo(() => {
    const lowItems = stockSummaries
      .filter((s) => s.status === 'low' || s.status === 'out')
      .map((s) => ({ medicine: s.medicine, currentStockUnits: s.currentStockUnits }));

    return groupLowStockBySupplier(
      lowItems,
      purchases,
      purchaseLines,
      suppliers,
      t('stock_dekho.unknown_supplier')
    );
  }, [stockSummaries, purchases, purchaseLines, suppliers, t]);

  const totalLowStockItemsCount = React.useMemo(() => {
    return stockSummaries.filter((s) => s.status === 'low' || s.status === 'out').length;
  }, [stockSummaries]);

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-title-hinglish font-bold text-on-surface">{t('stock_dekho.loading_stock')}</span>
        </div>
      </div>
    );
  }

  if (currentView === 'batch_detail' && selectedMedicine) {
    return (
      <BatchDetail
        medicine={selectedMedicine}
        batches={selectedMedicineBatchDetails}
        totalStockUnits={selectedMedicineTotalUnits}
        onBack={() => setCurrentView('list')}
        onRefreshStock={loadData}
        onOpenShelfMap={onOpenShelfMap}
        onOpenStickers={onOpenStickers}
        currentUser={currentUser}
        shop={shop}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    );
  }

  if (currentView === 'shopping_list') {
    return (
      <LowStockList
        groups={supplierLowStockGroups}
        totalLowStockItems={totalLowStockItemsCount}
        onBack={() => setCurrentView('list')}
        onReturnHome={onReturnHome}
        currentUser={currentUser}
        shop={shop}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    );
  }

  return (
    <StockList
      stockSummaries={stockSummaries}
      onSelectMedicine={(med) => {
        setSelectedMedicine(med);
        setCurrentView('batch_detail');
      }}
      onOpenShoppingList={() => setCurrentView('shopping_list')}
      onReturnHome={onReturnHome}
      currentUser={currentUser}
      shop={shop}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );
};
