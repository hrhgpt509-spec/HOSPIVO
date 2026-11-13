import React from 'react';
import { type PendingFastBill } from '../../logic/fastBill';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';

interface PendingQueueListProps {
  bills: PendingFastBill[];
  selectedBillId: string;
  onSelectBill: (id: string) => void;
  onNewBill: () => void;
  scannerConnected?: boolean;
}

export const PendingQueueList: React.FC<PendingQueueListProps> = ({
  bills,
  selectedBillId,
  onSelectBill,
  onNewBill,
  scannerConnected = true,
}) => {
  const activeCount = bills.filter((b) => b.status !== 'completed').length;

  return (
    <section className="w-full lg:w-[30%] flex flex-col h-full justify-between gap-space-md">
      <div className="flex flex-col gap-space-md flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between pb-space-xs shrink-0">
          <h1 className="font-headline-md text-headline-md text-on-surface font-bold">
            {t('fast_bill.pending_bills')}
          </h1>
          <div className="flex items-center gap-space-xs">
            <span className="font-label-sub-english text-label-sub-english text-primary font-bold bg-surface-container px-space-sm py-1 rounded-full">
              {t('fast_bill.active_count', { count: activeCount })}
            </span>
            <button
              onClick={onNewBill}
              className="h-8 px-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer"
              title="Add New Bill"
            >
              <Icon name="add" className="text-[18px]" />
              <span>Naya</span>
            </button>
          </div>
        </div>

        {/* Bill Queue List */}
        {bills.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-space-lg text-center bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-space-sm">
              <Icon name="sensors" className="text-[32px] animate-pulse" />
            </div>
            <h2 className="font-title-hinglish text-title-hinglish text-on-surface font-bold mb-1">
              {t('fast_bill.empty_queue_title')}
            </h2>
            <p className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
              {t('fast_bill.empty_queue_sub')}
            </p>
            <div className="mt-space-md inline-flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-low text-on-surface-variant text-xs">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              <span>{t('fast_bill.empty_queue_hint')}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-space-sm overflow-y-auto pr-1 flex-1 min-h-0" role="list">
            {bills.map((bill) => {
              const isSelected = bill.id === selectedBillId;
              const minutesAgo = Math.max(0, Math.floor((Date.now() - bill.createdAt) / 60000));
              const isDelayed = minutesAgo >= 5 && bill.status !== 'completed';
              const itemCount = bill.items.length;

              return (
                <div
                  key={bill.id}
                  onClick={() => onSelectBill(bill.id)}
                  tabIndex={0}
                  role="listitem"
                  className={`flex items-center justify-between p-space-md h-24 rounded-2xl cursor-pointer transition-all shrink-0 ${
                    isSelected
                      ? 'bg-surface-container-low shadow-sm border-2 border-primary'
                      : 'bg-surface-container-lowest shadow-sm hover:bg-surface-container-low border border-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-headline-md text-headline-md text-on-surface font-bold leading-none">
                      {bill.billNumberLabel}
                    </span>
                    <span
                      className={`font-label-sub-english text-label-sub-english font-medium ${
                        isDelayed ? 'text-tertiary font-bold' : 'text-on-surface-variant'
                      }`}
                    >
                      {t('fast_bill.items_count', { count: itemCount })} ·{' '}
                      {t('fast_bill.minutes_ago', { count: minutesAgo })}
                    </span>
                  </div>

                  <div className="flex items-center">
                    {bill.status === 'scanning' ? (
                      <span className="px-space-sm py-1.5 rounded-full bg-surface-variant text-on-surface-variant font-label-sub-english text-label-sub-english font-bold flex items-center gap-1.5">
                        <Icon name="sync" className="text-[18px] animate-spin" />
                        <span>{t('fast_bill.scanning')}</span>
                      </span>
                    ) : isDelayed ? (
                      <span className="px-space-sm py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label-sub-english text-label-sub-english font-bold flex items-center gap-1.5">
                        <Icon name="timer" className="text-[18px]" />
                        <span>{t('fast_bill.delayed')}</span>
                      </span>
                    ) : (
                      <span className="px-space-md py-1.5 rounded-full bg-primary-container text-on-primary font-label-sub-english text-label-sub-english font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-on-primary"></span>
                        <span>{t('fast_bill.ready')}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hardware Status Box */}
      <div className="p-space-md rounded-2xl bg-surface-container-low flex items-center justify-between shadow-sm shrink-0 border border-outline-variant/30">
        <div className="flex items-center gap-space-sm">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Icon name="barcode_scanner" className="text-[28px]" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  scannerConnected ? 'bg-primary animate-pulse' : 'bg-outline'
                }`}
              ></span>
              <span className="font-body-lg text-body-lg font-bold text-on-surface leading-tight">
                {t('fast_bill.scanner_connected')}
              </span>
            </div>
            <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
              {t('fast_bill.scanner_port')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

