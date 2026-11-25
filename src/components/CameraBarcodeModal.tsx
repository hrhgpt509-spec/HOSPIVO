import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Icon } from './Icon';
import { useTranslation, tButton } from '../i18n';
import { useBackHandler } from '../logic/androidBack';

interface CameraBarcodeModalProps {
  isOpen: boolean;
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
}

export const CameraBarcodeModal: React.FC<CameraBarcodeModalProps> = ({
  isOpen,
  onScan,
  onClose,
  title,
}) => {
  const { t } = useTranslation();
  const rawId = useId();
  const readerId = `hospivo-qr-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'error'>('starting');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');

  const hasScannedRef = useRef<boolean>(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  useBackHandler(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    hasScannedRef.current = false;
    setCameraState('starting');
    setErrorDetail('');
    setManualCode('');

    let cancelled = false;
    let html5QrCode: Html5Qrcode | null = null;
    let isRunning = false;

    const stopScanner = async () => {
      if (html5QrCode && isRunning) {
        isRunning = false;
        try {
          await html5QrCode.stop();
        } catch {
          // ignore stop race
        }
      }
      if (html5QrCode) {
        try {
          html5QrCode.clear();
        } catch {
          // ignore clear race
        }
      }
    };

    const startScanner = async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API unavailable');
        }

        html5QrCode = new Html5Qrcode(readerId, { verbose: false });

        const config = {
          fps: 12,
          qrbox: { width: 240, height: 150 },
          aspectRatio: 1.333334,
        };

        const handleSuccess = (decodedText: string) => {
          if (cancelled || hasScannedRef.current) return;
          const clean = decodedText.trim();
          if (!clean) return;
          hasScannedRef.current = true;
          void stopScanner().finally(() => {
            onScanRef.current(clean);
            onCloseRef.current();
          });
        };

        try {
          await html5QrCode.start(
            { facingMode: 'environment' },
            config,
            handleSuccess,
            () => {
              // ignore per-frame decode misses
            }
          );
          isRunning = true;
        } catch {
          // Fallback to any available camera (e.g., laptop webcam)
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras || cameras.length === 0) {
            throw new Error('No camera found');
          }
          await html5QrCode.start(
            cameras[0].id,
            config,
            handleSuccess,
            () => {
              // ignore per-frame decode misses
            }
          );
          isRunning = true;
        }

        if (cancelled) {
          await stopScanner();
          return;
        }
        setCameraState('active');
      } catch (err: any) {
        if (cancelled) return;
        setCameraState('error');
        setErrorDetail(err?.message ? String(err.message) : '');
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void stopScanner();
    };
  }, [isOpen, readerId]);

  if (!isOpen) return null;

  const btnUse = tButton('scanner.btn_use_code');
  const btnClose = tButton('scanner.btn_close');

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    onScan(clean);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-[#0f172a]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] max-h-[92dvh] overflow-y-auto bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-outline-variant p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon name="barcode_scanner" className="text-[24px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold text-on-surface leading-tight truncate">
                {title || t('scanner.modal_title')}
              </h2>
              <span className="text-xs text-on-surface-variant break-words">
                {t('scanner.modal_sub')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={btnClose.main}
            className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer shrink-0"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>

        {/* Live Camera Viewport */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-black/90 border border-outline-variant/40 min-h-[220px] flex flex-col items-center justify-center">
          <div id={readerId} className="w-full" />

          {cameraState === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-surface-container-low text-on-surface p-4 text-center">
              <div className="w-9 h-9 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold">{t('scanner.starting_camera')}</span>
            </div>
          )}

          {cameraState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-container-low text-on-surface p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-error-container text-error flex items-center justify-center">
                <Icon name="videocam_off" className="text-[28px]" />
              </div>
              <p className="text-sm font-bold text-on-surface max-w-xs break-words">
                {t('scanner.camera_unavailable')}
              </p>
              {errorDetail && (
                <span className="text-[11px] text-outline break-all">{errorDetail}</span>
              )}
            </div>
          )}
        </div>

        {cameraState === 'active' && (
          <div className="text-center text-xs font-semibold text-primary">
            {t('scanner.point_camera_hint')}
          </div>
        )}

        {/* Manual Barcode Fallback */}
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-2 pt-1 border-t border-outline-variant/30">
          <label className="text-xs font-bold text-on-surface-variant">
            {t('scanner.manual_label')}
          </label>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={t('scanner.manual_placeholder')}
              className="flex-1 min-w-0 min-h-[48px] px-3.5 rounded-xl bg-surface-container-low border border-outline-variant text-base font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="min-h-[48px] px-4 rounded-xl bg-primary hover:bg-primary-container disabled:opacity-40 text-on-primary font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Icon name="check" className="text-[18px] shrink-0" />
              <span>{btnUse.main}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CameraBarcodeModal;
