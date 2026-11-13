import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, type Medicine, type Batch, type StockMovement, type Shop, type DBUser } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { LinkBarcodeModal } from './stickers/LinkBarcodeModal';
import { formatRupees } from '../logic/money';
import {
  generateCode128Svg,
  generateShelfQrSvg,
  groupMedicinesByShelf,
  expandStickerItems,
  type SheetFormat,
  type StickerPrintItem,
  type StickerFieldToggles,
} from '../logic/stickers';

interface OwnerStickersProps {
  onReturnHome: () => void;
  initialTab?: 'medicine' | 'shelf';
  initialShelf?: string;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const OwnerStickers: React.FC<OwnerStickersProps> = ({
  onReturnHome,
  initialTab = 'medicine',
  initialShelf,
  currentUser,
  shop,
  theme,
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'medicine' | 'shelf'>(initialTab);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Medicine Sticker state
  const [filterMode, setFilterMode] = useState<'all' | 'selected' | 'no_barcode'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, number>>({});
  const [sheetFormat, setSheetFormat] = useState<SheetFormat>('24');
  const [fieldToggles, setFieldToggles] = useState<StickerFieldToggles>({
    showShopName: true,
    showMrp: true,
    showBatchExpiry: true,
    showShelf: true,
  });

  // Shelf Sticker state
  const [selectedShelf, setSelectedShelf] = useState<string>(initialShelf || '');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    const [allMeds, allBatches, allMovements] = await Promise.all([
      db.medicines.toArray(),
      db.batches.toArray(),
      db.stockMovements.toArray(),
    ]);
    setMedicines(allMeds);
    setBatches(allBatches);
    setMovements(allMovements);

    // Initialize default selected quantities: select first 5 medicines with 1 quantity each
    setSelectedQuantities((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const initial: Record<number, number> = {};
      allMeds.filter((m) => m.active !== false).slice(0, 5).forEach((m) => {
        if (m.id) initial[m.id] = 1;
      });
      return initial;
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const shelfGroups = useMemo(() => {
    return groupMedicinesByShelf(medicines, batches, movements);
  }, [medicines, batches, movements]);

  // Set default shelf if not selected
  useEffect(() => {
    if (shelfGroups.length > 0 && !selectedShelf) {
      const firstNamed = shelfGroups.find((g) => !g.isUnassigned);
      setSelectedShelf(firstNamed?.shelf || shelfGroups[0].shelf);
    }
  }, [shelfGroups, selectedShelf]);

  // Active medicines map
  const activeMedicines = useMemo(() => {
    return medicines.filter((m) => m.active !== false);
  }, [medicines]);

  // Batches map for MRP and Expiry
  const batchesByMed = useMemo(() => {
    const map = new Map<number, Batch[]>();
    for (const b of batches) {
      const list = map.get(b.medicineId) || [];
      list.push(b);
      map.set(b.medicineId, list);
    }
    return map;
  }, [batches]);

  // Filtered list of medicines for Tab 1 selection
  const filteredMedicines = useMemo(() => {
    let list = activeMedicines;

    if (filterMode === 'selected') {
      list = list.filter((m) => m.id && (selectedQuantities[m.id] || 0) > 0);
    } else if (filterMode === 'no_barcode') {
      list = list.filter((m) => !m.barcode || m.barcode.trim() === '');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.shortCode && m.shortCode.toLowerCase().includes(q)) ||
          (m.company && m.company.toLowerCase().includes(q)) ||
          (m.shelf && m.shelf.toLowerCase().includes(q))
      );
    }

    return list;
  }, [activeMedicines, filterMode, searchQuery, selectedQuantities]);

  // Prepared sticker items for printing
  const stickerItems = useMemo<StickerPrintItem[]>(() => {
    const items: StickerPrintItem[] = [];

    for (const med of activeMedicines) {
      if (!med.id) continue;
      const qty = selectedQuantities[med.id] || 0;
      if (qty <= 0) continue;

      const medBatches = batchesByMed.get(med.id) || [];
      medBatches.sort((a, b) => (b.expiry || '').localeCompare(a.expiry || ''));
      const latest = medBatches[0];

      items.push({
        medicineId: med.id,
        name: med.name,
        shortCode: med.shortCode || '',
        barcode: med.barcode || med.shortCode || '0000',
        company: med.company || '',
        shelf: med.shelf || '',
        mrpPaise: latest?.mrpPaise,
        batchNo: latest?.batchNo,
        expiry: latest?.expiry,
        quantity: qty,
      });
    }

    return items;
  }, [activeMedicines, selectedQuantities, batchesByMed]);

  // Expanded items for sheet slots
  const expandedSheetItems = useMemo(() => {
    return expandStickerItems(stickerItems);
  }, [stickerItems]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleQuantityChange = (medId: number, delta: number) => {
    setSelectedQuantities((prev) => {
      const current = prev[medId] || 0;
      const next = Math.max(0, current + delta);
      const updated = { ...prev };
      if (next === 0) {
        delete updated[medId];
      } else {
        updated[medId] = next;
      }
      return updated;
    });
  };

  const handleToggleSelectMedicine = (medId: number) => {
    setSelectedQuantities((prev) => {
      const updated = { ...prev };
      if (updated[medId]) {
        delete updated[medId];
      } else {
        updated[medId] = 1;
      }
      return updated;
    });
  };

  const handleSelectAll = () => {
    const updated: Record<number, number> = {};
    filteredMedicines.forEach((m) => {
      if (m.id) updated[m.id] = selectedQuantities[m.id] || 1;
    });
    setSelectedQuantities((prev) => ({ ...prev, ...updated }));
  };

  const handleDeselectAll = () => {
    setSelectedQuantities({});
  };

  const handleTriggerPrint = (labelName: string) => {
    showToast(t('stickers.toast_printed', { item: labelName }));
    window.print();
  };

  const currentShelfGroup = useMemo(() => {
    return shelfGroups.find((g) => g.shelf === selectedShelf) || shelfGroups[0] || null;
  }, [shelfGroups, selectedShelf]);

  // Labels per sheet config
  const sheetConfig = useMemo(() => {
    switch (sheetFormat) {
      case '24':
        return { cols: 3, rows: 8, total: 24, gridClass: 'grid-cols-3' };
      case '40':
        return { cols: 4, rows: 10, total: 40, gridClass: 'grid-cols-4' };
      case '65':
        return { cols: 5, rows: 13, total: 65, gridClass: 'grid-cols-5' };
      case '100':
        return { cols: 5, rows: 20, total: 100, gridClass: 'grid-cols-5' };
      case 'thermal':
        return { cols: 1, rows: 1, total: 1, gridClass: 'grid-cols-1' };
    }
  }, [sheetFormat]);

  const navHome = tButton('shelf_map.nav_home');
  const tabMedicine = tButton('stickers.tab_medicine');
  const tabShelf = tButton('stickers.tab_shelf');
  const filterAll = tButton('stickers.filter_all');
  const filterSelected = tButton('stickers.filter_selected');
  const filterNoStickers = tButton('stickers.filter_no_stickers');
  const btnPrint = tButton('stickers.btn_print');
  const btnLinkBarcode = tButton('stickers.btn_link_barcode');

  return (
    <div className="flex flex-col min-h-screen bg-surface font-body-md text-on-surface antialiased select-none">
      {/* Print-specific style tag for crisp sticker outputs */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          header, nav, aside, .no-print, button, input {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }
          .printable-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            padding: 4mm !important;
            width: 100% !important;
            max-width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-after: always;
          }
          .sticker-card {
            border: 1px solid #d1d5db !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid;
          }
          .sticker-card * {
            color: #000000 !important;
          }
        }
      `}</style>

      {/* ================= TOP BAR ================= */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/60 no-print">
        <div className="h-16 sm:h-20 w-full px-4 sm:px-gutter flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-xs">
                <Icon name="local_pharmacy" className="text-[22px]" />
              </div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-primary">Hospivo</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-surface-container-low rounded-xl border border-outline-variant">
              <Icon name="store" className="text-primary text-[18px]" />
              <div className="flex flex-col">
                <span className="font-bold text-xs sm:text-sm text-on-surface leading-tight">
                  {shop?.name || 'Medical Store'}
                </span>
                <span className="text-[11px] text-on-surface-variant leading-none">
                  {shop?.address || 'Retail Chemist'}
                </span>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-full text-xs font-bold text-on-surface">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <span>Local mode</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={onReturnHome}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-surface-container rounded-xl border border-outline-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <Icon name="home" className="text-primary text-[20px]" />
              <span className="font-bold text-sm text-on-surface leading-none">{navHome.main}</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
            >
              <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
            </button>

            <FullscreenButton />

            <div className="flex items-center gap-2 pl-1 border-l border-outline-variant">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-sm font-bold text-on-surface leading-tight">
                  {currentUser?.name || 'Owner'}
                </span>
                <span className="text-xs text-on-surface-variant leading-none capitalize">
                  {currentUser?.role || 'Operator'}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm shadow-xs">
                <Icon name="person" className="text-[20px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="w-full pt-16 sm:pt-20 flex-1 flex flex-col min-h-0 bg-surface">
        <div className="flex flex-col w-full flex-1 px-4 sm:px-gutter py-3 sm:py-4 gap-3 sm:gap-4 overflow-hidden">
          {/* Header Strip & Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight leading-none">
                {t('stickers.title')}
              </h1>
              <span className="text-sm sm:text-base font-semibold text-on-surface-variant">
                {t('stickers.sub')}
              </span>
            </div>

            {/* Main Mode Tabs */}
            <div className="flex items-center p-1 bg-surface-container-low rounded-2xl border border-outline-variant/60 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('medicine')}
                className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-sm sm:text-base transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'medicine'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="medication" className="text-[20px]" />
                <span>{tabMedicine.main}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('shelf')}
                className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-sm sm:text-base transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'shelf'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name="shelves" className="text-[20px]" />
                <span>{tabShelf.main}</span>
              </button>
            </div>
          </div>

          {/* ================= TAB 1: MEDICINE STICKERS (39a) ================= */}
          {activeTab === 'medicine' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 items-stretch overflow-hidden pb-1">
              {/* Left Column: Controls & Selection (5 of 12 cols) */}
              <div className="col-span-1 lg:col-span-5 flex flex-col justify-between gap-3 min-h-0 bg-surface-container-lowest p-3 sm:p-4 rounded-2xl shadow-sm border border-outline-variant/60 overflow-hidden no-print">
                {/* Section A: 3 Choice Filter Buttons */}
                <div className="grid grid-cols-3 gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`flex flex-col items-center justify-center min-h-[54px] py-1 px-2 rounded-xl transition-all cursor-pointer border ${
                      filterMode === 'all'
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/60'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Icon name="select_all" className="text-[18px]" />
                      <span className="font-bold text-xs sm:text-sm leading-tight">
                        {filterAll.main}
                      </span>
                    </div>
                    {filterAll.sub && (
                      <span className="text-[11px] opacity-80 leading-none">{filterAll.sub}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterMode('selected')}
                    className={`flex flex-col items-center justify-center min-h-[54px] py-1 px-2 rounded-xl transition-all cursor-pointer border ${
                      filterMode === 'selected'
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/60'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Icon name="check_circle" className="text-[18px]" />
                      <span className="font-bold text-xs sm:text-sm leading-tight">
                        {filterSelected.main} ({Object.values(selectedQuantities).reduce((a, b) => a + b, 0)})
                      </span>
                    </div>
                    {filterSelected.sub && (
                      <span className="text-[11px] opacity-80 leading-none">
                        {filterSelected.sub}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterMode('no_barcode')}
                    className={`flex flex-col items-center justify-center min-h-[54px] py-1 px-2 rounded-xl transition-all cursor-pointer border ${
                      filterMode === 'no_barcode'
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/60'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Icon name="label_off" className="text-[18px]" />
                      <span className="font-bold text-xs sm:text-sm leading-tight truncate">
                        {filterNoStickers.main}
                      </span>
                    </div>
                    {filterNoStickers.sub && (
                      <span className="text-[11px] opacity-80 leading-none">
                        {filterNoStickers.sub}
                      </span>
                    )}
                  </button>
                </div>

                {/* Search Bar & Select All */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Icon
                      name="search"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('stickers.search_placeholder')}
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container-low border border-outline-variant text-xs sm:text-sm font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2.5 py-2 rounded-xl bg-surface-container text-xs font-bold hover:bg-surface-container-high transition-colors text-on-surface cursor-pointer"
                  >
                    {t('stickers.btn_select_all')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2.5 py-2 rounded-xl bg-surface-container text-xs font-bold hover:bg-surface-container-high transition-colors text-on-surface cursor-pointer"
                  >
                    {t('stickers.btn_deselect_all')}
                  </button>
                </div>

                {/* Section B: List of Medicines with Checkboxes & Quantity */}
                <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
                  {filteredMedicines.length === 0 ? (
                    <div className="text-center py-8 text-on-surface-variant text-sm font-medium">
                      Koi dawai nahi mili
                    </div>
                  ) : (
                    filteredMedicines.map((med) => {
                      if (!med.id) return null;
                      const qty = selectedQuantities[med.id] || 0;
                      const isChecked = qty > 0;

                      return (
                        <div
                          key={med.id}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl border transition-colors ${
                            isChecked
                              ? 'bg-primary/5 border-primary/40'
                              : 'bg-surface-container-low hover:bg-surface-container border-outline-variant/40'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectMedicine(med.id!)}
                              className="w-5 h-5 rounded accent-primary cursor-pointer flex-shrink-0"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                                {med.name}
                              </span>
                              <span className="text-[11px] text-on-surface-variant truncate">
                                {med.company || ''} {med.shelf ? `· ${med.shelf}` : ''}{' '}
                                {med.shortCode ? `· ${med.shortCode}` : ''}
                              </span>
                            </div>
                          </label>

                          {/* Quantity Controls */}
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(med.id!, -1)}
                              className="w-7 h-7 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-on-surface font-extrabold flex items-center justify-center cursor-pointer text-sm"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-xs sm:text-sm font-extrabold text-on-surface">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(med.id!, 1)}
                              className="w-7 h-7 rounded-lg bg-surface-container-highest hover:bg-surface-variant text-on-surface font-extrabold flex items-center justify-center cursor-pointer text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Section C: Sheet Format Selector (24, 40, 65, 100, Thermal) */}
                <div className="shrink-0 pt-2 border-t border-outline-variant/40">
                  <div className="text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Sheet Format:
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['24', '40', '65', '100', 'thermal'] as SheetFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setSheetFormat(fmt)}
                        className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer border ${
                          sheetFormat === fmt
                            ? 'bg-primary text-on-primary border-primary shadow-xs'
                            : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/50'
                        }`}
                      >
                        <span className="font-extrabold text-sm sm:text-base leading-tight">
                          {fmt === 'thermal' ? '50x25' : fmt}
                        </span>
                        <span className="text-[10px] opacity-80 leading-none">
                          {fmt === 'thermal' ? 'Roll' : 'A4'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Field Toggles */}
                <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 py-1 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={fieldToggles.showShopName}
                      onChange={(e) =>
                        setFieldToggles((prev) => ({ ...prev, showShopName: e.target.checked }))
                      }
                      className="rounded accent-primary"
                    />
                    <span>{t('stickers.toggle_shop_name')}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={fieldToggles.showMrp}
                      onChange={(e) =>
                        setFieldToggles((prev) => ({ ...prev, showMrp: e.target.checked }))
                      }
                      className="rounded accent-primary"
                    />
                    <span>{t('stickers.toggle_mrp')}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={fieldToggles.showBatchExpiry}
                      onChange={(e) =>
                        setFieldToggles((prev) => ({ ...prev, showBatchExpiry: e.target.checked }))
                      }
                      className="rounded accent-primary"
                    />
                    <span>{t('stickers.toggle_batch_exp')}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={fieldToggles.showShelf}
                      onChange={(e) =>
                        setFieldToggles((prev) => ({ ...prev, showShelf: e.target.checked }))
                      }
                      className="rounded accent-primary"
                    />
                    <span>{t('stickers.toggle_shelf')}</span>
                  </label>
                </div>

                {/* Big Print Button (>= 56px tall) */}
                <button
                  type="button"
                  disabled={expandedSheetItems.length === 0}
                  onClick={() => handleTriggerPrint('A4 Sticker Sheet')}
                  className={`w-full h-14 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-base sm:text-lg flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:translate-y-0.5 shrink-0 ${
                    expandedSheetItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Icon name="print" className="text-[24px]" />
                  <div className="flex flex-col items-start leading-tight">
                    <span>
                      {btnPrint.main} ({expandedSheetItems.length} Stickers)
                    </span>
                    {btnPrint.sub && (
                      <span className="text-xs font-normal opacity-90 leading-none">
                        {btnPrint.sub}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Right Column: A4 Sheet Preview (7 of 12 cols) */}
              <div
                ref={printAreaRef}
                className="col-span-1 lg:col-span-7 flex flex-col items-center justify-start min-h-0 bg-surface-container-low p-2 sm:p-4 rounded-2xl shadow-inner border border-outline-variant/60 relative overflow-y-auto"
              >
                {/* Header Info Tag in Preview */}
                <div className="w-full flex items-center justify-between pb-2 text-xs font-bold text-on-surface-variant no-print">
                  <div className="flex items-center gap-1.5">
                    <Icon name="aspect_ratio" className="text-[18px]" />
                    <span>
                      {sheetFormat === 'thermal'
                        ? t('stickers.preview_thermal_title')
                        : t('stickers.preview_title', {
                            cols: sheetConfig.cols,
                            rows: sheetConfig.rows,
                            total: sheetConfig.total,
                          })}
                    </span>
                  </div>
                  <span>{expandedSheetItems.length} labels queued</span>
                </div>

                {/* Printable Sticker Sheet Container */}
                <div
                  className={`printable-sheet w-full bg-white text-black rounded-xl shadow-lg p-3 sm:p-4 border border-outline-variant/60 ${
                    sheetFormat === 'thermal' ? 'max-w-[340px]' : 'max-w-[760px] aspect-[1/1.414]'
                  }`}
                >
                  {expandedSheetItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-center">
                      <Icon name="label" className="text-[48px] mb-2" />
                      <p className="text-sm font-semibold">Koi sticker chuna nahi gaya</p>
                      <p className="text-xs">Bayen taraf se dawai aur quantity chunein</p>
                    </div>
                  ) : (
                    <div className={`grid ${sheetConfig.gridClass} gap-2 w-full h-full auto-rows-max`}>
                      {expandedSheetItems.slice(0, sheetConfig.total).map((item, idx) => (
                        <div
                          key={`${item.medicineId}-${idx}`}
                          className="sticker-card bg-white border border-gray-300 rounded-lg p-2 flex flex-col justify-between shadow-xs overflow-hidden text-black min-h-[90px]"
                        >
                          {/* Row 1: Shop Name & Shelf/Shortcode */}
                          <div className="flex items-start justify-between text-[10px] leading-tight text-gray-600">
                            {fieldToggles.showShopName && (
                              <span className="font-extrabold uppercase tracking-tight truncate max-w-[70%]">
                                {shop?.name || 'Hospivo Store'}
                              </span>
                            )}
                            {fieldToggles.showShelf && (
                              <span className="font-bold font-mono bg-gray-100 px-1 rounded text-gray-800">
                                {item.shelf || item.shortCode || ''}
                              </span>
                            )}
                          </div>

                          {/* Row 2: Medicine Name */}
                          <div className="font-black text-xs text-gray-950 truncate leading-tight my-0.5">
                            {item.name}
                          </div>

                          {/* Row 3: Scannable Barcode SVG */}
                          <div
                            dangerouslySetInnerHTML={{
                              __html: generateCode128Svg(item.barcode, {
                                height: 26,
                                barWidth: 1.1,
                                includeText: false,
                              }),
                            }}
                            className="w-full flex items-center justify-center my-1 text-black overflow-hidden"
                          />

                          {/* Row 4: Barcode text, MRP & Batch */}
                          <div className="flex items-center justify-between text-[9px] font-mono text-gray-800 pt-0.5 border-t border-gray-200">
                            <span className="font-bold">{item.barcode}</span>
                            <div className="flex items-center gap-1.5 font-sans font-bold">
                              {fieldToggles.showMrp && item.mrpPaise ? (
                                <span className="text-emerald-800">
                                  MRP {formatRupees(item.mrpPaise)}
                                </span>
                              ) : null}
                              {fieldToggles.showBatchExpiry && item.expiry ? (
                                <span className="text-gray-500">Exp: {item.expiry}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: SHELF & CONTROL CARDS (39b) ================= */}
          {activeTab === 'shelf' && (
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pb-1">
              {/* Dual-Card Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                {/* CARD 1: Self Sticker (Shelf QR & Rack Tag) */}
                <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 shadow-sm border border-outline-variant/60 flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-on-surface">
                        {t('stickers.shelf_sticker_title')}
                      </h2>
                      <p className="text-xs sm:text-sm text-on-surface-variant font-medium">
                        {t('stickers.shelf_sticker_sub')}
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                      <Icon name="qr_code_2" className="text-[26px]" />
                    </div>
                  </div>

                  {/* Shelf Picker Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-on-surface-variant shrink-0">
                      Select Shelf:
                    </span>
                    <select
                      value={selectedShelf}
                      onChange={(e) => setSelectedShelf(e.target.value)}
                      className="flex-1 h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {shelfGroups.map((g) => (
                        <option key={g.shelf} value={g.shelf}>
                          {g.isUnassigned ? t('shelf_map.unassigned_shelf') : g.displayShelf} (
                          {g.totalMedicines} medicines)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* High Contrast Physical Thermal Adhesive Mockup */}
                  <div className="bg-surface-container-low rounded-2xl p-4 flex items-center justify-center border border-outline-variant/50">
                    <div className="printable-sheet w-full max-w-[380px] bg-white text-black rounded-xl p-4 shadow-md flex flex-col items-center justify-center text-center border border-gray-300">
                      {/* Thermal Tear Line */}
                      <div className="w-full flex justify-between items-center pb-2 text-gray-500 text-[11px] font-bold uppercase tracking-wider border-b border-gray-200 mb-2">
                        <span>Hospivo Rack Tag</span>
                        <span>203 DPI</span>
                      </div>

                      {/* Crisp Bold QR SVG */}
                      <div
                        dangerouslySetInnerHTML={{
                          __html: generateShelfQrSvg(currentShelfGroup?.shelf || 'S-01', {
                            size: 110,
                          }),
                        }}
                        className="my-1 text-black flex items-center justify-center"
                      />

                      {/* Bold Shelf Code */}
                      <div className="mt-2 flex flex-col items-center">
                        <span className="text-3xl font-black text-black tracking-tight leading-none">
                          {currentShelfGroup?.displayShelf || 'S-01'}
                        </span>
                        <span className="text-xs font-bold text-gray-600 mt-1">
                          Shelf {currentShelfGroup?.displayShelf} ({shop?.name || 'Hospivo'})
                        </span>
                      </div>

                      {/* 1D Scannable Barcode for Laser Guns */}
                      <div
                        dangerouslySetInnerHTML={{
                          __html: generateCode128Svg(
                            `SHELF:${currentShelfGroup?.shelf || 'S-01'}`,
                            {
                              height: 24,
                              barWidth: 1.2,
                              includeText: true,
                            }
                          ),
                        }}
                        className="w-full mt-2 text-black flex items-center justify-center"
                      />

                      {/* Top Medicines list on this shelf */}
                      {currentShelfGroup && currentShelfGroup.medicines.length > 0 && (
                        <div className="w-full mt-2 pt-2 border-t border-gray-200 text-left text-[11px] text-gray-700">
                          <span className="font-bold text-gray-900 block mb-0.5">Top Items:</span>
                          <span className="truncate block">
                            {currentShelfGroup.medicines
                              .slice(0, 3)
                              .map((m) => m.name)
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Print Shelf Sticker Button (>= 56px tall) */}
                  <button
                    type="button"
                    onClick={() => handleTriggerPrint(`Shelf Sticker (${selectedShelf})`)}
                    className="w-full h-14 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:translate-y-0.5 no-print"
                  >
                    <Icon name="print" className="text-[24px]" />
                    <span>Print Shelf Sticker ({selectedShelf})</span>
                  </button>
                </div>

                {/* CARD 2: Control Card (Cashier Action Commands) */}
                <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 shadow-sm border border-outline-variant/60 flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-on-surface">
                        {t('stickers.control_card_title')}
                      </h2>
                      <p className="text-xs sm:text-sm text-on-surface-variant font-medium">
                        {t('stickers.control_card_sub')}
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                      <Icon name="barcode_scanner" className="text-[26px]" />
                    </div>
                  </div>

                  {/* Laminated PVC Pad Preview */}
                  <div className="bg-surface-container-low rounded-2xl p-4 flex items-center justify-center border border-outline-variant/50">
                    <div className="printable-sheet w-full max-w-[420px] bg-white text-black rounded-xl p-4 shadow-md flex flex-col gap-3 border border-gray-300">
                      {/* Barcode 1: NEXT BILL */}
                      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-black leading-tight">
                            {t('stickers.cmd_next_bill')}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {t('stickers.cmd_next_bill_sub')}
                          </span>
                        </div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: generateCode128Svg('RUNNER:NEXT', {
                              height: 24,
                              barWidth: 1.1,
                              includeText: false,
                            }),
                          }}
                          className="w-32 flex items-center justify-center text-black"
                        />
                      </div>

                      {/* Barcode 2: UNDO */}
                      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-black leading-tight">
                            {t('stickers.cmd_undo')}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {t('stickers.cmd_undo_sub')}
                          </span>
                        </div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: generateCode128Svg('RUNNER:UNDO', {
                              height: 24,
                              barWidth: 1.1,
                              includeText: false,
                            }),
                          }}
                          className="w-32 flex items-center justify-center text-black"
                        />
                      </div>

                      {/* Barcode 3: CANCEL */}
                      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-black leading-tight">
                            {t('stickers.cmd_cancel')}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {t('stickers.cmd_cancel_sub')}
                          </span>
                        </div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: generateCode128Svg('RUNNER:CANCEL', {
                              height: 24,
                              barWidth: 1.1,
                              includeText: false,
                            }),
                          }}
                          className="w-32 flex items-center justify-center text-black"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Print Control Card Button (>= 56px tall) */}
                  <button
                    type="button"
                    onClick={() => handleTriggerPrint('Control Card (PVC)')}
                    className="w-full h-14 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:translate-y-0.5 no-print"
                  >
                    <Icon name="print" className="text-[24px]" />
                    <span>Print Command Card</span>
                  </button>
                </div>
              </div>

              {/* Bottom Prominent Note Card: Link Barcode Action */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/60 flex flex-wrap items-center justify-between gap-4 shrink-0 no-print">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <Icon name="info" className="text-[28px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <p className="text-sm sm:text-base font-extrabold text-on-surface truncate">
                      {t('stickers.bottom_prompt_title')}
                    </p>
                    <span className="text-xs sm:text-sm text-on-surface-variant font-medium">
                      {t('stickers.bottom_prompt_sub')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLinkModalOpen(true)}
                  className="flex-shrink-0 h-14 min-h-[56px] px-5 sm:px-6 rounded-2xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container transition-all flex items-center gap-2.5 shadow-md cursor-pointer active:translate-y-0.5"
                >
                  <Icon name="barcode_scanner" className="text-[24px]" />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-extrabold text-sm sm:text-base">
                      {btnLinkBarcode.main}
                    </span>
                    {btnLinkBarcode.sub && (
                      <span className="text-xs font-normal opacity-90 leading-none">
                        {btnLinkBarcode.sub}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Link Barcode Modal */}
      <LinkBarcodeModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        medicines={activeMedicines}
        currentUser={currentUser}
        onSuccess={() => {
          loadData();
          showToast(t('stickers.link_modal_success'));
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary px-5 py-3 rounded-2xl shadow-xl font-bold text-sm flex items-center gap-2 animate-in fade-in duration-150 no-print">
          <Icon name="check_circle" className="text-[20px]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
