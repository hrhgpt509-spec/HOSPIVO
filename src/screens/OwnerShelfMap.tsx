import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type Medicine, type Batch, type StockMovement, type Shop, type DBUser } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { ShelfMoveModal } from './shelf/ShelfMoveModal';
import {
  groupMedicinesByShelf,
  generateShelfQrSvg,
  type ShelfMedicineItem,
} from '../logic/stickers';

interface OwnerShelfMapProps {
  onReturnHome: () => void;
  onOpenStickers: (shelfCode?: string) => void;
  currentUser: DBUser | null;
  shop: Shop | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const OwnerShelfMap: React.FC<OwnerShelfMapProps> = ({
  onReturnHome,
  onOpenStickers,
  currentUser,
  shop,
  theme,
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShelfKey, setSelectedShelfKey] = useState<string>('');
  const [selectedMedicineForMove, setSelectedMedicineForMove] = useState<ShelfMedicineItem | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [allMeds, allBatches, allMovements] = await Promise.all([
      db.medicines.toArray(),
      db.batches.toArray(),
      db.stockMovements.toArray(),
    ]);
    setMedicines(allMeds);
    setBatches(allBatches);
    setMovements(allMovements);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Group medicines by shelf
  const shelfGroups = useMemo(() => {
    return groupMedicinesByShelf(medicines, batches, movements);
  }, [medicines, batches, movements]);

  // Default selection to first shelf if not yet selected
  useEffect(() => {
    if (shelfGroups.length > 0 && !selectedShelfKey) {
      setSelectedShelfKey(shelfGroups[0].shelf);
    }
  }, [shelfGroups, selectedShelfKey]);

  // Filter shelf groups by search query
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shelfGroups;

    return shelfGroups.filter((g) => {
      // Matches shelf code
      if (g.shelf.toLowerCase().includes(q)) return true;
      if (g.displayShelf.toLowerCase().includes(q)) return true;
      // Matches any medicine on this shelf
      return g.medicines.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.shortCode.toLowerCase().includes(q) ||
          m.company.toLowerCase().includes(q)
      );
    });
  }, [shelfGroups, searchQuery]);

  const selectedGroup = useMemo(() => {
    return shelfGroups.find((g) => g.shelf === selectedShelfKey) || shelfGroups[0] || null;
  }, [shelfGroups, selectedShelfKey]);

  const allShelfNames = useMemo(() => {
    return Array.from(new Set(shelfGroups.map((g) => g.shelf))).filter((s) => s !== 'UNASSIGNED');
  }, [shelfGroups]);

  // Overall stats
  const totalShelvesCount = useMemo(() => {
    return shelfGroups.filter((g) => !g.isUnassigned).length;
  }, [shelfGroups]);

  const totalMedicinesCount = useMemo(() => {
    return shelfGroups.reduce((acc, g) => acc + g.totalMedicines, 0);
  }, [shelfGroups]);

  const totalPacksCount = useMemo(() => {
    return shelfGroups.reduce((acc, g) => acc + g.totalStockPacks, 0);
  }, [shelfGroups]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleShelfMovedSuccess = async (_medicineId: number, newShelf: string) => {
    await loadData();
    setSelectedShelfKey(newShelf);
    showToast(t('move_shelf_modal.toast_success'));
  };

  const navHome = tButton('shelf_map.nav_home');
  const btnPrintStickers = tButton('shelf_map.btn_print_stickers');
  const btnMoveShelf = tButton('shelf_map.btn_move_shelf');
  const btnPrintShelfLabel = tButton('shelf_map.btn_print_shelf_label');

  return (
    <div className="flex flex-col min-h-screen bg-surface font-body-md text-on-surface antialiased select-none">
      {/* ================= TOP BAR ================= */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/60">
        <div className="h-16 sm:h-20 w-full px-4 sm:px-gutter flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-primary">HOSPIVO</span>
              <span className="text-outline-variant font-light text-lg">|</span>
              <span className="font-bold text-base sm:text-lg text-on-surface truncate max-w-[140px] sm:max-w-none">
                {shop?.name || 'Medical Store'}
              </span>
            </div>
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-low rounded-full border border-outline-variant">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-xs uppercase font-bold tracking-wide text-on-surface-variant">
                Local mode
              </span>
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
          {/* Subheader Title & Search & Action Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight leading-none">
                {t('shelf_map.title')}
              </h1>
              <span className="text-sm sm:text-base font-semibold text-on-surface-variant">
                {t('shelf_map.sub')}
              </span>
            </div>

            {/* Live Stats Chips */}
            <div className="hidden lg:flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/60 text-xs font-bold text-on-surface-variant">
                {t('shelf_map.stat_total_shelves')}: <span className="text-primary font-extrabold">{totalShelvesCount}</span>
              </div>
              <div className="px-3.5 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/60 text-xs font-bold text-on-surface-variant">
                {t('shelf_map.stat_total_medicines')}: <span className="text-primary font-extrabold">{totalMedicinesCount}</span>
              </div>
              <div className="px-3.5 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/60 text-xs font-bold text-on-surface-variant">
                {t('shelf_map.stat_total_packs')}: <span className="text-primary font-extrabold">{totalPacksCount}</span>
              </div>
            </div>

            {/* Search & Stickers Button */}
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Icon
                  name="search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('shelf_map.search_placeholder')}
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-sm font-medium text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpenStickers(selectedGroup?.shelf)}
                className="h-11 px-4 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container transition-all flex items-center gap-2 text-sm font-bold shadow-xs cursor-pointer flex-shrink-0 active:translate-y-0.5"
              >
                <Icon name="print" className="text-[20px]" />
                <span className="hidden sm:inline">{btnPrintStickers.main}</span>
              </button>
            </div>
          </div>

          {/* Dual-Pane View: 65% Shelf Grid + 35% Shelf Inspector */}
          <div className="flex flex-col lg:flex-row gap-4 w-full flex-1 min-h-0 overflow-hidden pb-1">
            {/* Left Section: Shelf Grid (65%) */}
            <section className="w-full lg:w-[65%] flex flex-col flex-1 min-h-0 bg-surface-container-low rounded-2xl p-3 sm:p-4 border border-outline-variant/60 overflow-hidden">
              <div className="flex items-center justify-between pb-2 shrink-0 border-b border-outline-variant/40 mb-3">
                <span className="text-sm font-bold text-on-surface uppercase tracking-wider">
                  {t('shelf_map.stat_total_shelves')} ({filteredGroups.length})
                </span>
                <span className="text-xs text-on-surface-variant">
                  {t('shelf_map.unit_dawai')}: {filteredGroups.reduce((acc, g) => acc + g.totalMedicines, 0)}
                </span>
              </div>

              {filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center p-8 text-on-surface-variant">
                  <Icon name="shelves" className="text-[48px] text-outline-variant mb-2" />
                  <p className="text-base font-bold">{t('shelf_map.empty_shelf')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 pr-1 auto-rows-max">
                  {filteredGroups.map((group) => {
                    const isSelected = selectedGroup?.shelf === group.shelf;
                    return (
                      <article
                        key={group.shelf}
                        onClick={() => setSelectedShelfKey(group.shelf)}
                        className={`flex flex-col justify-between p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs min-h-[140px] ${
                          isSelected
                            ? 'bg-surface-container-lowest border-primary ring-2 ring-primary/20 shadow-md translate-y-[-2px]'
                            : 'bg-surface-container-lowest border-outline-variant/70 hover:border-primary/50 hover:bg-surface-container-high/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-black text-xl leading-none tracking-tight ${
                              isSelected ? 'text-primary' : 'text-on-surface'
                            }`}
                          >
                            {group.isUnassigned ? t('shelf_map.unassigned_shelf') : group.displayShelf}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant font-bold">
                            {group.isUnassigned ? 'NONE' : 'QR'}
                          </span>
                        </div>

                        {/* Middle Rack Preview Block */}
                        <div className="w-full flex-1 my-2 rounded-xl bg-surface-container-low flex flex-col items-center justify-center p-2 text-center border border-outline-variant/40">
                          <Icon
                            name={group.isUnassigned ? 'help_outline' : 'shelves'}
                            className={`text-[28px] ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}
                          />
                          <span className="text-xs font-bold text-on-surface-variant mt-1 truncate max-w-full">
                            {group.medicines[0]?.name || t('shelf_map.stat_total_medicines')}
                          </span>
                        </div>

                        {/* Footer counts */}
                        <div className="flex items-center justify-between text-xs font-bold text-on-surface-variant pt-1 border-t border-outline-variant/30">
                          <span className={isSelected ? 'text-primary' : 'text-on-surface'}>
                            {group.totalMedicines} {t('shelf_map.unit_dawai')}
                          </span>
                          <span>
                            {group.totalStockPacks} {t('shelf_map.unit_packs')}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Right Section: Selected Shelf Inspector (35%) */}
            <aside className="w-full lg:w-[35%] bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/60 p-4 flex flex-col justify-between overflow-hidden flex-1 lg:flex-initial">
              {selectedGroup ? (
                <>
                  {/* Top Header of Inspector */}
                  <div className="flex items-center justify-between shrink-0 pb-3 border-b border-outline-variant/40">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight leading-none">
                        {selectedGroup.isUnassigned
                          ? t('shelf_map.unassigned_shelf')
                          : selectedGroup.displayShelf}
                      </span>
                      {!selectedGroup.isUnassigned && (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: generateShelfQrSvg(selectedGroup.shelf, { size: 28 }),
                          }}
                          className="text-primary flex items-center"
                        />
                      )}
                    </div>
                    <div className="bg-primary/10 px-3 py-1 rounded-full text-xs font-extrabold text-primary">
                      {selectedGroup.totalMedicines} {t('shelf_map.unit_dawai')}
                    </div>
                  </div>

                  {/* Visual Rack Photo/Tag Graphic */}
                  <div className="w-full h-24 shrink-0 my-2 rounded-xl bg-surface-container-low border border-outline-variant/50 flex items-center justify-between px-4 overflow-hidden shadow-inner">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                        {selectedGroup.isUnassigned ? 'Unsorted Rack' : `Section ${selectedGroup.shelf}`}
                      </span>
                      <span className="text-base font-extrabold text-on-surface mt-0.5">
                        {selectedGroup.totalStockPacks} {t('shelf_map.unit_packs')} · {selectedGroup.totalStockUnits} {t('shelf_map.unit_loose')}
                      </span>
                    </div>
                    <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                      <Icon name="shelves" className="text-[32px]" />
                    </div>
                  </div>

                  {/* List of Medicines on This Shelf */}
                  <div className="flex-1 flex flex-col min-h-0 overflow-y-auto py-1 gap-2 pr-1">
                    {selectedGroup.medicines.length === 0 ? (
                      <div className="text-center py-8 text-on-surface-variant text-sm font-medium">
                        {t('shelf_map.empty_shelf')}
                      </div>
                    ) : (
                      selectedGroup.medicines.map((med) => (
                        <div
                          key={med.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 transition-colors group"
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="font-bold text-sm text-on-surface truncate">
                              {med.name}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-on-surface-variant truncate">
                              {med.shortCode && (
                                <span className="font-mono font-bold bg-surface-container-high px-1.5 py-0.2 rounded text-[11px]">
                                  {med.shortCode}
                                </span>
                              )}
                              <span>
                                {med.latestBatch ? t('shelf_map.card_batch', { batch: med.latestBatch }) : med.company}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-extrabold text-primary">
                              {med.totalPacks} {t('shelf_map.unit_packs')}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMedicineForMove(med);
                                setIsMoveModalOpen(true);
                              }}
                              title={btnMoveShelf.main}
                              className="w-8 h-8 rounded-lg bg-surface-container-lowest hover:bg-primary hover:text-on-primary text-on-surface-variant border border-outline-variant flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Icon name="swap_horiz" className="text-[18px]" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Bottom Action Buttons (>= 56px tall) */}
                  <div className="shrink-0 pt-3 flex flex-col gap-2 border-t border-outline-variant/40">
                    <button
                      type="button"
                      disabled={selectedGroup.medicines.length === 0}
                      onClick={() => {
                        if (selectedGroup.medicines.length > 0) {
                          setSelectedMedicineForMove(selectedGroup.medicines[0]);
                          setIsMoveModalOpen(true);
                        }
                      }}
                      className={`w-full h-14 min-h-[56px] px-4 rounded-2xl bg-surface-container hover:bg-surface-container-high active:translate-y-0.5 transition-all flex items-center justify-center gap-3 cursor-pointer shadow-xs border border-outline-variant text-on-surface ${
                        selectedGroup.medicines.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <Icon name="swap_horiz" className="text-primary text-[26px]" />
                      <div className="flex flex-col text-center leading-tight">
                        <span className="font-bold text-base text-on-surface">
                          {btnMoveShelf.main}
                        </span>
                        {btnMoveShelf.sub && (
                          <span className="text-xs text-on-surface-variant font-medium">
                            {btnMoveShelf.sub}
                          </span>
                        )}
                      </div>
                    </button>

                    {!selectedGroup.isUnassigned && (
                      <button
                        type="button"
                        onClick={() => onOpenStickers(selectedGroup.shelf)}
                        className="w-full h-12 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant text-on-surface font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Icon name="print" className="text-primary text-[20px]" />
                        <span>{btnPrintShelfLabel.main}</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-on-surface-variant">
                  <Icon name="shelves" className="text-[48px] text-outline-variant mb-2" />
                  <p className="text-sm font-semibold">{t('shelf_map.empty_shelf')}</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>

      {/* Shelf Move Dialog */}
      <ShelfMoveModal
        isOpen={isMoveModalOpen}
        onClose={() => {
          setIsMoveModalOpen(false);
          setSelectedMedicineForMove(null);
        }}
        medicine={selectedMedicineForMove}
        allShelves={allShelfNames}
        currentUser={currentUser}
        onSuccess={handleShelfMovedSuccess}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary px-5 py-3 rounded-2xl shadow-xl font-bold text-sm flex items-center gap-2 animate-in fade-in duration-150">
          <Icon name="check_circle" className="text-[20px]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
