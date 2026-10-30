import React from 'react';

export type StatusChipVariant =
  | 'local'
  | 'synced'
  | 'offline'
  | 'pending_sync'
  | 'sync_failed'
  | 'backup_today'
  | 'backup_needed';

export interface StatusChipProps {
  variant?: StatusChipVariant;
  label?: string;
  className?: string;
  onClick?: () => void;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  variant = 'local',
  label,
  className = '',
  onClick,
}) => {
  switch (variant) {
    case 'local':
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E9EEF2] dark:bg-gray-800 text-[#344054] dark:text-gray-200 border border-gray-300 dark:border-gray-700 font-semibold text-base select-none ${className}`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#475467] dark:bg-gray-400 inline-block" />
          <span>{label || 'Local mode'}</span>
        </div>
      );

    case 'synced':
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8ef9a7] text-[#005226] font-bold text-base shadow-sm select-none ${className}`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#006b33] inline-block" />
          <span>{label || 'Synced'}</span>
        </div>
      );

    case 'offline':
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ffdcc6] text-[#723600] font-bold text-base shadow-sm select-none ${className}`}
        >
          <svg className="w-4 h-4 text-[#924700]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.5 6.5A7.5 7.5 0 0121 12c0 1.25-.3 2.43-.84 3.47M9.2 9.2A7.5 7.5 0 003 12c0 3.32 2.15 6.13 5.16 7.08" />
          </svg>
          <span>{label || 'Offline — changes saved on this device'}</span>
        </div>
      );

    case 'pending_sync':
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ffb786] text-[#311300] font-bold text-base shadow-sm select-none ${className}`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#924700] inline-block" />
          <span>{label || 'Pending sync'}</span>
        </div>
      );

    case 'sync_failed':
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ffdad6] text-[#93000a] font-bold text-base shadow-sm select-none ${className}`}
        >
          <svg className="w-4 h-4 text-[#ba1a1a]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{label || 'Sync nahi hua'}</span>
        </div>
      );

    case 'backup_today':
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8ef9a7] text-[#005226] font-bold text-base shadow-sm select-none ${className}`}
        >
          <svg className="w-4 h-4 text-[#006b33]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{label || 'Backup: Aaj'}</span>
        </div>
      );

    case 'backup_needed':
    default:
      return (
        <div
          onClick={onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 bg-[#FEF3F2] dark:bg-[#381a17] text-[#D92D20] dark:text-[#f87171] border border-[#FCA5A5] dark:border-[#7f1d1d] rounded-xl font-bold text-base shadow-sm select-none ${className}`}
        >
          <svg className="w-4 h-4 stroke-[2.4] text-[#D92D20] dark:text-[#f87171]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
            <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
          </svg>
          <span>{label || 'Backup lo'}</span>
        </div>
      );
  }
};

export default StatusChip;
