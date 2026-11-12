import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  db,
  type Bill,
  type BillItem,
  type BillReturn,
  type DBUser,
  type RefundMode,
} from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { FullscreenButton } from '../../components/FullscreenButton';
import { ApprovalDialog } from '../../components/ApprovalDialog';
import { useShop } from '../../logic/useShop';
import { formatRupees } from '../../logic/money';
import { textFieldProps } from '../../logic/format';
import { triggerFeedback } from '../../logic/feedback';
import { parseDateOnly } from '../../logic/stock';
import { processBillReturn } from '../../logic/billing';
import {
  buildWhatsAppBillText,
  buildWhatsAppBillUrl,
  computeReturnableUnitsPerItem,
  getBillReturnApprovalRule,
  searchBills,
} from '../../logic/billingFlow';
import { BillReceiptPrintView, type PrintFormat } from './BillReceiptPrintView';

interface OldBillsReturnScreenProps {
  onBackToBilling: () => void;
  onReturnHome: () => void;
  currentUser?: DBUser | { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OldBillsReturnScreen: React.FC<OldBillsReturnScreenProps> = ({
  onBackToBilling,
  onReturnHome,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();

  const [bills, setBills] = useState<Bill[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<BillItem[]>([]);
  const [selectedReturns, setSelectedReturns] = useState<BillReturn[]>([]);

  // Return selection state: billItemId -> returnUnits (0 = unselected)
  const [returnQtyMap, setReturnQtyMap] = useState<Record<number, number>>({});
  const [refundMode, setRefundMode] = useState<RefundMode>('cash');
  const [returnReason, setReturnReason] = useState<string>('');
  const [isApprovalOpen, setIsApprovalOpen] = useState<boolean>(false);
  const [isProcessingReturn, setIsProcessingReturn] = useState<boolean>(false);

  // Print modal state
  const [printFormat, setPrintFormat] = useState<PrintFormat>('thermal');
  const [showPrintPicker, setShowPrintPicker] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const userName =
    currentUser?.name ||
    (currentUser?.role === 'owner' ? t('common.role_owner') : t('common.role_cashier'));

  const loadBills = useCallback(async () => {
    try {
      const allBills = await db.bills.toArray();
      const sorted = searchBills(allBills, '');
      setBills(sorted);
      setSelectedBillId((prev) => {
        if (prev && sorted.some((b) => b.id === prev)) return prev;
        return sorted[0]?.id ?? null;
      });
    } catch (err) {
      console.error('Failed to load old bills:', err);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const loadSelectedBillDetails = useCallback(async (billId: number | null) => {
    if (!billId) {
      setSelectedItems([]);
      setSelectedReturns([]);
      setReturnQtyMap({});
      return;
    }
    try {
      const [items, returns] = await Promise.all([
        db.billItems.where('billId').equals(billId).toArray(),
        db.billReturns.where('originalBillId').equals(billId).toArray(),
      ]);
      setSelectedItems(items);
      setSelectedReturns(returns);
      setReturnQtyMap({});
      setReturnReason('');
    } catch (err) {
      console.error('Failed to load bill details:', err);
    }
  }, []);

  useEffect(() => {
    loadSelectedBillDetails(selectedBillId);
  }, [selectedBillId, loadSelectedBillDetails]);

  const filteredBills = useMemo(() => searchBills(bills, searchQuery), [bills, searchQuery]);

  const selectedBill = useMemo(
    () => bills.find((b) => b.id === selectedBillId) || null,
    [bills, selectedBillId]
  );

  const returnableByItem = useMemo(
    () => computeReturnableUnitsPerItem(selectedItems, selectedReturns),
    [selectedItems, selectedReturns]
  );

  // Today's summary pill
  const todayStats = useMemo(() => {
    const todayStr = parseDateOnly();
    let count = 0;
    let totalPaise = 0;
    for (const b of bills) {
      if (b.date === todayStr) {
        count++;
        totalPaise += b.totalPaise;
      }
    }
    return { count, totalPaise };
  }, [bills]);

  // Selected return refund estimation
  const estimatedRefundPaise = useMemo(() => {
    let sum = 0;
    for (const item of selectedItems) {
      if (item.id === undefined) continue;
      const qty = returnQtyMap[item.id] || 0;
      if (qty > 0 && item.qtyUnits > 0) {
        sum +=
          qty === item.qtyUnits
            ? item.lineTotalPaise
            : Math.round((item.lineTotalPaise * qty) / item.qtyUnits);
      }
    }
    return sum;
  }, [selectedItems, returnQtyMap]);

  const selectedReturnEntries = useMemo(() => {
    return Object.entries(returnQtyMap)
      .map(([idStr, qty]) => ({ billItemId: Number(idStr), returnUnits: qty }))
      .filter((entry) => entry.returnUnits > 0);
  }, [returnQtyMap]);

  const toggleItemForReturn = (item: BillItem) => {
    if (item.id === undefined) return;
    const maxUnits = returnableByItem[item.id] || 0;
    if (maxUnits <= 0) return;

    setReturnQtyMap((prev) => {
      const current = prev[item.id!] || 0;
      return {
        ...prev,
        [item.id!]: current > 0 ? 0 : maxUnits,
      };
    });
  };

  const adjustReturnQty = (item: BillItem, delta: number) => {
    if (item.id === undefined) return;
    const maxUnits = returnableByItem[item.id] || 0;
    setReturnQtyMap((prev) => {
      const current = prev[item.id!] || 0;
      const next = Math.max(0, Math.min(maxUnits, current + delta));
      return {
        ...prev,
        [item.id!]: next,
      };
    });
  };

  const handlePrintSelected = (fmt: PrintFormat) => {
    setPrintFormat(fmt);
    setShowPrintPicker(false);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Reprint failed:', err);
      }
    }, 80);
  };

  const handleWhatsAppSelected = () => {
    if (!selectedBill) return;
    try {
      const msg = buildWhatsAppBillText(selectedBill, selectedItems, shopName || '', {
        greeting: t('billing_flow.wa_greeting'),
        billLabel: t('billing_flow.wa_bill_label'),
        dateLabel: t('billing_flow.wa_date_label'),
        itemsHeading: t('billing_flow.wa_items_heading'),
        totalLabel: t('dawai_becho.summary_total'),
        modeLabel: t('billing_flow.receipt_mode'),
        stripWord: t('dawai_becho.unit_strip'),
        looseWord: t('dawai_becho.unit_loose'),
        thanks: t('billing_flow.wa_thanks'),
      });
      const url = buildWhatsAppBillUrl(selectedBill.customerPhone, msg);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('WhatsApp share failed:', err);
    }
  };

  const handleRequestReturn = async () => {
    if (!selectedBill) return;
    if (selectedReturnEntries.length === 0) {
      triggerFeedback('error', t('billing_flow.err_select_return_item'));
      return;
    }

    const rule = await getBillReturnApprovalRule();
    if (rule === 'blocked_offline' || rule === 'remote_approval') {
      triggerFeedback('error', t('billing_flow.err_return_blocked_offline'));
      return;
    }

    setIsApprovalOpen(true);
  };

  const executeProcessReturn = async () => {
    if (!selectedBill?.id || isProcessingReturn) return;
    try {
      setIsProcessingReturn(true);
      await processBillReturn(
        {
          originalBillId: selectedBill.id,
          items: selectedReturnEntries,
          refundMode,
          reason: returnReason.trim() || 'Sales return',
          approvedBy: userName,
        },
        currentUser
      );
      triggerFeedback('success', t('billing_flow.toast_return_success'));
      await loadBills();
      await loadSelectedBillDetails(selectedBill.id);
    } catch (err: any) {
      console.error('Failed to process return:', err);
      triggerFeedback('error', err?.message || t('errors.generic_error'));
    } finally {
      setIsProcessingReturn(false);
    }
  };

  const returnHomeBtn = tButton('home.return_home_btn');
  const newBillBtn = tButton('dawai_becho.btn_new_bill');
  const reprintBtn = tButton('billing_flow.btn_reprint');
  const processReturnBtn = tButton('billing_flow.btn_process_return');
  const printBtn = tButton('billing_flow.btn_print');

  const getStatusLabel = (status: Bill['status']) => {
    if (status === 'returned_full') return t('billing_flow.status_returned_full');
    if (status === 'returned_partial') return t('billing_flow.status_returned_partial');
    return t('billing_flow.status_completed');
  };

  return (
    <div className="w-full min-h-screen bg-background text-on-surface flex flex-col antialiased select-none transition-colors">
      {/* Top Header (Matching 15_Sell_OldBills_Return.html) */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30">
        <div className="h-16 w-full px-gutter flex items-center justify-between gap-3">
          <div className="flex items-center gap-space-md min-w-0">
            <div className="flex items-center gap-space-sm shrink-0">
              <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container font-headline-md font-extrabold">
                H
              </div>
              <div className="flex flex-col">
                <span className="font-headline-md text-title-hinglish tracking-tight text-primary leading-tight font-bold">
                  Hospivo
                </span>
                {shopName && (
                  <span className="font-label-sub-english text-xs text-on-surface-variant leading-tight truncate max-w-[160px]">
                    {shopName}
                  </span>
                )}
              </div>
            </div>

            <div className="hidden sm:block h-8 w-px bg-surface-container-highest" />

            <button
              type="button"
              onClick={onReturnHome}
              className="flex items-center gap-space-xs px-space-sm py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer shrink-0"
            >
              <Icon name="home" className="text-[20px] text-primary" />
              <span className="font-title-hinglish text-base font-bold">{returnHomeBtn.main}</span>
            </button>

            <div className="hidden md:inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-low">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label-sub-english text-xs text-on-surface-variant font-semibold">
                {modeLabel}
              </span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-space-sm">
            <button
              type="button"
              onClick={onBackToBilling}
              className="px-space-sm py-2 font-title-hinglish text-base text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
            >
              {newBillBtn.main}
            </button>
            <span className="px-space-sm py-2 bg-primary-container text-on-primary-container rounded-lg font-bold text-base">
              {t('billing_flow.old_bills_title')}
            </span>
          </nav>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={onBackToBilling}
              className="lg:hidden px-3 py-1.5 rounded-lg bg-surface-container font-bold text-sm text-on-surface cursor-pointer"
            >
              {newBillBtn.main}
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton className="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors cursor-pointer" />

            <div className="flex items-center gap-space-xs pl-space-xs">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
              <span className="hidden sm:inline font-title-hinglish text-sm font-bold text-on-surface">
                {userName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full pt-16 bg-background flex-1 flex flex-col min-h-0">
        <div className="flex-1 w-full max-w-[1440px] mx-auto px-gutter py-space-md grid grid-cols-1 lg:grid-cols-12 gap-space-lg lg:h-[calc(100vh-4rem)] min-h-0">
          {/* LEFT COLUMN: Past Bills List (5 cols) */}
          <section className="lg:col-span-5 flex flex-col justify-between gap-space-sm min-h-0 h-full">
            {/* Search Input Container */}
            <div className="relative w-full shrink-0">
              <div className="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none">
                <Icon name="search" className="text-[28px] text-primary" />
              </div>
              <input
                {...textFieldProps('free', searchQuery, setSearchQuery)}
                type="text"
                placeholder={t('billing_flow.old_bills_search_placeholder')}
                className="w-full h-14 pl-14 pr-10 bg-surface-container-lowest text-on-surface rounded-2xl shadow-sm text-body-md border border-outline-variant/50 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant cursor-pointer"
                >
                  <Icon name="close" className="text-[20px]" />
                </button>
              )}
            </div>

            {/* Bills List (rows >= 60px) */}
            <div className="flex flex-col gap-space-sm flex-1 overflow-y-auto min-h-0 pr-0.5">
              {filteredBills.length === 0 ? (
                <div className="bg-surface-container-lowest rounded-2xl p-10 text-center text-on-surface-variant border border-outline-variant/40">
                  <Icon name="receipt_long" className="text-[48px] text-outline mb-2" />
                  <p className="font-title-hinglish font-bold text-on-surface">
                    {t('billing_flow.old_bills_empty')}
                  </p>
                </div>
              ) : (
                filteredBills.map((b) => {
                  const isSelected = b.id === selectedBillId;
                  const timeStr = b.createdAt
                    ? new Date(b.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '';

                  return (
                    <div
                      key={b.id}
                      onClick={() => b.id && setSelectedBillId(b.id)}
                      className={`min-h-[76px] py-2.5 px-space-md rounded-2xl flex items-center justify-between cursor-pointer transition-all shrink-0 border ${
                        isSelected
                          ? 'bg-surface-container-low ring-2 ring-primary shadow-md border-primary/40'
                          : 'bg-surface-container-lowest shadow-sm hover:bg-surface-container-low border-outline-variant/40'
                      }`}
                    >
                      <div className="flex items-center gap-space-md min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                            isSelected
                              ? 'bg-primary text-on-primary'
                              : b.paymentMode === 'udhaar'
                                ? 'bg-surface-container-high text-tertiary'
                                : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          <Icon
                            name={
                              b.paymentMode === 'udhaar' ? 'account_balance_wallet' : 'receipt_long'
                            }
                            className="text-[28px]"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                            #{b.billNo} · {formatRupees(b.totalPaise)}
                          </span>
                          <span
                            className={`font-label-sub-english text-sm truncate ${
                              isSelected ? 'text-primary font-bold' : 'text-on-surface-variant'
                            }`}
                          >
                            {b.paymentMode.toUpperCase()}
                            {b.customerName ? ` · ${b.customerName}` : ''}
                            {timeStr ? ` · ${timeStr}` : ''}
                            {b.status !== 'completed' ? ` · ${getStatusLabel(b.status)}` : ''}
                          </span>
                        </div>
                      </div>
                      <Icon
                        name={isSelected ? 'check_circle' : 'chevron_right'}
                        className={`text-[26px] shrink-0 ${
                          isSelected ? 'text-primary' : 'text-outline-variant'
                        }`}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Today's Summary Status Pill */}
            <div className="p-space-md bg-surface-container-low rounded-2xl flex items-center justify-between shadow-sm border border-outline-variant/40 shrink-0">
              <div className="flex items-center gap-space-sm">
                <Icon name="verified" className="text-primary text-[24px]" />
                <span className="font-label-sub-english font-bold text-on-surface">
                  {t('billing_flow.old_bills_today_summary', { count: todayStats.count })}
                </span>
              </div>
              <span className="font-title-hinglish text-title-hinglish text-primary font-extrabold">
                {formatRupees(todayStats.totalPaise)}
              </span>
            </div>
          </section>

          {/* RIGHT COLUMN: Selected Bill Details & Wapsi Return Panel (7 cols) */}
          <section className="lg:col-span-7 flex flex-col justify-between p-space-lg bg-surface-container-lowest rounded-2xl shadow-md border border-outline-variant/40 min-h-0 h-full gap-3">
            {!selectedBill ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                <span>{t('billing_flow.old_bills_empty')}</span>
              </div>
            ) : (
              <>
                {/* Panel Header */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-outline-variant/30 shrink-0">
                  <div className="flex items-center gap-space-md">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-low text-primary flex items-center justify-center shrink-0">
                      <Icon name="point_of_sale" className="text-[32px]" />
                    </div>
                    <div className="flex flex-col">
                      <h2 className="font-headline-md text-headline-md text-on-surface font-bold leading-tight">
                        {t('dawai_becho.bill_header_prefix')} #{selectedBill.billNo}
                      </h2>
                      <span className="font-body-md text-sm text-on-surface-variant leading-tight">
                        {selectedBill.date} · {selectedBill.paymentMode.toUpperCase()}
                        {selectedBill.customerName ? ` · ${selectedBill.customerName}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleWhatsAppSelected}
                      className="h-10 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-primary font-bold text-sm flex items-center gap-1.5 cursor-pointer border border-outline-variant/40"
                    >
                      <Icon name="share" className="text-[18px]" />
                      <span>WhatsApp</span>
                    </button>

                    <div
                      className={`px-space-md py-1.5 rounded-full font-bold text-sm flex items-center gap-space-xs ${
                        selectedBill.status === 'returned_full'
                          ? 'bg-error-container text-on-error-container'
                          : selectedBill.status === 'returned_partial'
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                            : 'bg-surface-container-low text-primary'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          selectedBill.status === 'returned_full'
                            ? 'bg-error'
                            : selectedBill.status === 'returned_partial'
                              ? 'bg-tertiary'
                              : 'bg-primary'
                        }`}
                      />
                      <span>{getStatusLabel(selectedBill.status)}</span>
                    </div>
                  </div>
                </div>

                {/* Items Section (Select for Wapsi Return) */}
                <div className="flex flex-col gap-space-xs flex-1 min-h-0 overflow-hidden">
                  <div className="flex justify-between items-center px-space-xs shrink-0">
                    <span className="font-label-sub-english text-xs text-on-surface-variant uppercase tracking-wider font-bold">
                      {t('billing_flow.select_return_heading')}
                    </span>
                    <span className="font-label-sub-english text-xs text-on-surface-variant font-semibold">
                      {t('dawai_becho.items_count', { count: selectedItems.length })}
                    </span>
                  </div>

                  <div className="flex flex-col gap-space-xs overflow-y-auto flex-1 pr-0.5">
                    {selectedItems.map((item) => {
                      const itemId = item.id!;
                      const maxReturnable = returnableByItem[itemId] || 0;
                      const chosenQty = returnQtyMap[itemId] || 0;
                      const isChecked = chosenQty > 0;

                      return (
                        <div
                          key={itemId}
                          onClick={() => toggleItemForReturn(item)}
                          className={`min-h-[68px] py-2 px-space-md rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer shrink-0 border ${
                            isChecked
                              ? 'bg-surface-container-low ring-2 ring-primary shadow-sm border-primary/40'
                              : maxReturnable <= 0
                                ? 'bg-surface-container/50 opacity-60 cursor-not-allowed border-outline-variant/20'
                                : 'bg-surface-container-lowest hover:bg-surface-container-low shadow-sm border-outline-variant/40'
                          }`}
                        >
                          <div className="flex items-center gap-space-md min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isChecked
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-surface-container-highest text-transparent'
                              }`}
                            >
                              <Icon name="check" className="text-[20px]" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-title-hinglish text-lg font-bold text-on-surface leading-tight truncate">
                                {item.medicineName}
                              </span>
                              <span className="font-label-sub-english text-xs text-on-surface-variant leading-tight">
                                {item.batchNo} ({item.expiry.slice(0, 7)}) ·{' '}
                                {t('billing_flow.sold_qty_label')} {item.qtyUnits} ·{' '}
                                {t('billing_flow.returned_qty_label')} {maxReturnable}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-3 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isChecked && (
                              <div className="flex items-center gap-1 bg-surface-container-lowest rounded-xl p-1 border border-outline-variant/50">
                                <button
                                  type="button"
                                  onClick={() => adjustReturnQty(item, -1)}
                                  className="w-9 h-9 rounded-lg bg-surface-container-low text-on-surface font-bold text-lg flex items-center justify-center hover:bg-surface-container-high cursor-pointer"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center font-bold text-sm text-on-surface">
                                  {chosenQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustReturnQty(item, 1)}
                                  className="w-9 h-9 rounded-lg bg-primary-fixed/40 text-primary font-bold text-lg flex items-center justify-center hover:bg-primary hover:text-on-primary cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            )}

                            <span className="font-headline-md text-lg font-bold text-primary w-24 text-right">
                              {formatRupees(item.lineTotalPaise)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Refund Summary & Method Selection */}
                {selectedReturnEntries.length > 0 && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="p-3 rounded-2xl bg-surface-container-low flex items-center justify-between shadow-sm border border-outline-variant/40">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center shrink-0">
                          <Icon name="currency_rupee" className="text-[26px]" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-title-hinglish font-bold text-on-surface leading-tight">
                            {t('billing_flow.refund_total_title')}
                          </span>
                          <span className="text-xs text-on-surface-variant">
                            {t('billing_flow.refund_total_sub')}
                          </span>
                        </div>
                      </div>
                      <span className="font-headline-lg text-2xl text-primary font-extrabold">
                        {formatRupees(estimatedRefundPaise)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setRefundMode('cash')}
                        className={`h-12 px-3 rounded-xl flex items-center justify-between font-bold text-sm cursor-pointer transition-all ${
                          refundMode === 'cash'
                            ? 'bg-surface-container-lowest ring-2 ring-primary text-on-surface shadow-sm'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon name="payments" className="text-primary text-xl" />
                          <span>{t('billing_flow.refund_cash')}</span>
                        </div>
                        {refundMode === 'cash' && (
                          <Icon name="check_circle" className="text-primary text-xl" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setRefundMode('udhaar_adjust')}
                        className={`h-12 px-3 rounded-xl flex items-center justify-between font-bold text-sm cursor-pointer transition-all ${
                          refundMode === 'udhaar_adjust'
                            ? 'bg-surface-container-lowest ring-2 ring-primary text-on-surface shadow-sm'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon name="credit_card_off" className="text-tertiary text-xl" />
                          <span>{t('billing_flow.refund_udhaar')}</span>
                        </div>
                        {refundMode === 'udhaar_adjust' && (
                          <Icon name="check_circle" className="text-primary text-xl" />
                        )}
                      </button>

                      <input
                        {...textFieldProps('free', returnReason, setReturnReason)}
                        type="text"
                        placeholder={t('billing_flow.return_reason_placeholder')}
                        className="h-12 px-3 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons Footer */}
                <div className="grid grid-cols-12 gap-space-md pt-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPrintPicker(true)}
                    className="col-span-5 h-16 min-h-[56px] rounded-2xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface shadow-sm active:translate-y-0.5 transition-all flex items-center justify-center gap-space-sm px-3 cursor-pointer"
                  >
                    <Icon name="print" className="text-[26px] text-on-surface-variant shrink-0" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-title-hinglish font-bold text-base text-on-surface">
                        {reprintBtn.main}
                      </span>
                      {reprintBtn.sub && (
                        <span className="text-xs text-on-surface-variant">{reprintBtn.sub}</span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleRequestReturn}
                    disabled={isProcessingReturn || selectedBill.status === 'returned_full'}
                    className="col-span-7 h-16 min-h-[56px] rounded-2xl bg-primary hover:bg-primary-container text-on-primary shadow-md active:translate-y-0.5 transition-all flex items-center justify-center gap-space-sm px-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon name="assignment_return" className="text-[28px] shrink-0" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="font-title-hinglish font-bold text-base text-on-primary">
                        {processReturnBtn.main}
                      </span>
                      {processReturnBtn.sub && (
                        <span className="text-xs text-primary-fixed">{processReturnBtn.sub}</span>
                      )}
                    </div>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {/* Approval PIN Dialog for delete_or_correct_bill (Sales Return) */}
      {selectedBill && (
        <ApprovalDialog
          isOpen={isApprovalOpen}
          actionCategory="delete_or_correct_bill"
          recordDescription={`Return for Bill #${selectedBill.billNo}: ${formatRupees(estimatedRefundPaise)} (${refundMode})`}
          requesterName={userName}
          onApproved={() => {
            setIsApprovalOpen(false);
            executeProcessReturn();
          }}
          onClose={() => setIsApprovalOpen(false)}
        />
      )}

      {/* Print Format Chooser Modal */}
      {showPrintPicker && selectedBill && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-md font-bold text-on-surface">{printBtn.main}</h2>
              <button
                type="button"
                onClick={() => setShowPrintPicker(false)}
                className="w-10 h-10 rounded-full hover:bg-surface-container-high flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handlePrintSelected('thermal')}
              className="h-16 px-5 rounded-xl bg-primary text-on-primary font-bold text-lg flex items-center justify-between hover:bg-primary-container cursor-pointer"
            >
              <span>{t('billing_flow.print_format_thermal')}</span>
              <Icon name="receipt" className="text-2xl" />
            </button>

            <button
              type="button"
              onClick={() => handlePrintSelected('a4')}
              className="h-16 px-5 rounded-xl bg-surface-container-high text-on-surface font-bold text-lg flex items-center justify-between hover:bg-surface-container-highest border border-outline-variant cursor-pointer"
            >
              <span>{t('billing_flow.print_format_a4')}</span>
              <Icon name="description" className="text-2xl text-primary" />
            </button>
          </div>
        </div>
      )}

      <BillReceiptPrintView bill={selectedBill} items={selectedItems} format={printFormat} />
    </div>
  );
};

