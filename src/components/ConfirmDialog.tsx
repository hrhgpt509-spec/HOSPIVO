import React from 'react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  confirmSubLabel?: string;
  cancelLabel?: string;
  cancelSubLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title = 'Pakka hatana hai?',
  subtitle = 'Ye wapas nahi aayega.',
  confirmLabel = 'Haan',
  confirmSubLabel = 'Delete',
  cancelLabel = 'Nahi',
  cancelSubLabel = 'Cancel',
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-[#0f172a]/65 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fadeIn"
    >
      <div className="w-full max-w-[520px] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center relative z-10 border border-slate-200 dark:border-gray-800">
        
        {/* Warning Icon (46a_Shared_DeleteConfirm) */}
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mb-4 text-[#ba1a1a] dark:text-red-400">
          <svg className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h2 className="text-3xl font-extrabold text-[#141e1a] dark:text-white mb-2 tracking-tight">
          {title}
        </h2>

        {/* Subtitle */}
        <p className="text-lg text-[#6e7a6e] dark:text-gray-400 mb-8 max-w-[380px] leading-relaxed">
          {subtitle}
        </p>

        {/* Action Buttons: 2 large buttons (>=56px) */}
        <div className="w-full grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-16 px-6 rounded-2xl bg-[#e5f0eb] dark:bg-gray-800 hover:bg-[#dae5df] dark:hover:bg-gray-700 text-[#141e1a] dark:text-white font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
          >
            <svg className="w-6 h-6 text-[#3e4a3f] dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div className="flex flex-col text-left leading-none">
              <span className="text-xl font-bold">{cancelLabel}</span>
              <span className="text-xs text-[#3e4a3f] dark:text-gray-400 font-medium mt-0.5">{cancelSubLabel}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={`h-16 px-6 rounded-2xl ${
              isDanger
                ? 'bg-[#ba1a1a] hover:bg-red-700 text-white shadow-md shadow-[#ba1a1a]/25'
                : 'bg-[#1B8F4A] hover:bg-[#15733b] text-white shadow-md shadow-[#1B8F4A]/25'
            } font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]`}
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            <div className="flex flex-col text-left leading-none">
              <span className="text-xl font-bold">{confirmLabel}</span>
              <span className="text-xs text-red-200 font-medium mt-0.5">{confirmSubLabel}</span>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConfirmDialog;
