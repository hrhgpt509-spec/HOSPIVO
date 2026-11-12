import React, { useRef, useState } from 'react';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { compressInvoicePhoto } from '../../logic/image';
import { triggerFeedback } from '../../logic/feedback';

interface Step3CounterPhotoProps {
  photoDataUrl: string;
  onChangePhoto: (dataUrl: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export const Step3CounterPhoto: React.FC<Step3CounterPhotoProps> = ({
  photoDataUrl,
  onChangePhoto,
  onBack,
  onNext,
}) => {
  const { t } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setIsProcessing(true);
      const compressed = await compressInvoicePhoto(file, 1600, 0.7);
      onChangePhoto(compressed);
      triggerFeedback('success');
    } catch (err) {
      console.error('Failed to process counter photo:', err);
      triggerFeedback('error', t('errors.generic_error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const backBtn = tButton('suppliers.btn_back');
  const takeBtn = tButton('din_band.btn_take_photo');
  const galleryBtn = tButton('din_band.btn_choose_gallery');
  const retakeBtn = tButton('din_band.btn_retake_photo');
  const skipBtn = tButton('din_band.btn_skip_photo');
  const nextBtn = tButton('din_band.btn_next_report');

  return (
    <div className="flex flex-col flex-1 justify-between gap-space-md min-h-0">
      {/* Hidden native inputs (never generate fake photos) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Main Viewfinder Card (31e_DayClose_Step3_Photo.html) */}
      <div className="w-full max-w-5xl mx-auto flex-1 bg-surface-container-lowest rounded-2xl shadow-md p-space-md sm:p-space-lg flex flex-col justify-between gap-space-md border border-outline-variant/30 min-h-0">
        <div className="text-center shrink-0">
          <h2 className="font-headline-md text-xl sm:text-2xl text-on-surface font-bold">
            {t('din_band.photo_heading')}
          </h2>
          <p className="font-body-md text-sm sm:text-base text-on-surface-variant mt-1">
            {t('din_band.photo_sub')}
          </p>
        </div>

        <div className="relative w-full flex-1 rounded-xl overflow-hidden bg-inverse-surface flex items-center justify-center shadow-inner min-h-[300px]">
          {photoDataUrl ? (
            <>
              <img
                src={photoDataUrl}
                alt={t('din_band.counter_photo_label')}
                className="w-full h-full max-h-[420px] object-contain"
              />
              <div className="absolute bottom-4 z-20 flex flex-wrap items-center justify-center gap-3 px-4">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[56px] h-14 px-6 bg-surface-container-lowest/95 hover:bg-surface-container-low text-on-surface rounded-2xl flex items-center gap-2.5 shadow-xl cursor-pointer font-bold"
                >
                  <Icon name="photo_camera" className="text-2xl text-primary" />
                  <span>{retakeBtn.main}</span>
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[56px] h-14 px-6 bg-surface-container-lowest/95 hover:bg-surface-container-low text-on-surface rounded-2xl flex items-center gap-2.5 shadow-xl cursor-pointer font-bold"
                >
                  <Icon name="photo_library" className="text-2xl text-primary" />
                  <span>{galleryBtn.main}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Viewfinder Reticle Corner Brackets */}
              <div className="absolute inset-6 pointer-events-none flex flex-col justify-between z-10">
                <div className="flex justify-between items-start">
                  <svg className="text-primary-fixed" fill="none" height="44" viewBox="0 0 44 44" width="44">
                    <path d="M4 32V12C4 7.58172 7.58172 4 12 4H32" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
                  </svg>
                  <svg className="text-primary-fixed" fill="none" height="44" viewBox="0 0 44 44" width="44">
                    <path d="M12 4H32C36.4183 4 40 7.58172 40 12V32" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
                  </svg>
                </div>

                <div className="self-center flex items-center justify-center opacity-70">
                  <svg className="text-inverse-on-surface" fill="none" height="60" viewBox="0 0 60 60" width="60">
                    <line stroke="currentColor" strokeLinecap="round" strokeWidth="3" x1="30" x2="30" y1="10" y2="24" />
                    <line stroke="currentColor" strokeLinecap="round" strokeWidth="3" x1="30" x2="30" y1="36" y2="50" />
                    <line stroke="currentColor" strokeLinecap="round" strokeWidth="3" x1="10" x2="24" y1="30" y2="30" />
                    <line stroke="currentColor" strokeLinecap="round" strokeWidth="3" x1="36" x2="50" y1="30" y2="30" />
                    <circle cx="30" cy="30" r="4" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>

                <div className="flex justify-between items-end">
                  <svg className="text-primary-fixed" fill="none" height="44" viewBox="0 0 44 44" width="44">
                    <path d="M4 12V32C4 36.4183 7.58172 40 12 40H32" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
                  </svg>
                  <svg className="text-primary-fixed" fill="none" height="44" viewBox="0 0 44 44" width="44">
                    <path d="M40 12V32C40 36.4183 36.4183 40 32 40H12" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
                  </svg>
                </div>
              </div>

              {/* Capture / Gallery Buttons */}
              <div className="relative z-20 flex flex-wrap items-center justify-center gap-3 px-4">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[56px] h-16 px-space-lg bg-primary hover:bg-primary-container active:scale-[0.98] text-on-primary rounded-2xl flex items-center gap-3 shadow-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  <Icon name="photo_camera" className="text-[30px]" />
                  <div className="flex flex-col text-left leading-none">
                    <span className="font-title-hinglish text-lg font-bold">{takeBtn.main}</span>
                    {takeBtn.sub && (
                      <span className="text-xs text-primary-fixed pt-0.5">{takeBtn.sub}</span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[56px] h-16 px-space-lg bg-surface-container-lowest hover:bg-surface-container active:scale-[0.98] text-on-surface rounded-2xl flex items-center gap-3 shadow-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  <Icon name="photo_library" className="text-[28px] text-primary" />
                  <div className="flex flex-col text-left leading-none">
                    <span className="font-title-hinglish text-lg font-bold">{galleryBtn.main}</span>
                    {galleryBtn.sub && (
                      <span className="text-xs text-on-surface-variant pt-0.5">{galleryBtn.sub}</span>
                    )}
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[56px] h-14 px-space-lg bg-surface-container hover:bg-surface-container-high text-on-surface rounded-2xl flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
        >
          <Icon name="arrow_back" className="text-[26px]" />
          <div className="flex flex-col text-left leading-none">
            <span className="font-title-hinglish text-lg font-bold">{backBtn.main}</span>
            {backBtn.sub && (
              <span className="text-xs text-on-surface-variant pt-0.5">{backBtn.sub}</span>
            )}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {!photoDataUrl && (
            <button
              type="button"
              onClick={onNext}
              className="min-h-[56px] h-14 px-space-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-outline-variant/50 rounded-2xl flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <span className="font-title-hinglish text-base sm:text-lg font-bold">
                {skipBtn.main}
              </span>
              <Icon name="arrow_forward" className="text-xl" />
            </button>
          )}

          <button
            type="button"
            disabled={!photoDataUrl}
            onClick={onNext}
            className={`min-h-[56px] h-14 px-space-xl rounded-2xl flex items-center gap-2.5 transition-all ${
              photoDataUrl
                ? 'bg-primary hover:bg-primary-container text-on-primary shadow-md cursor-pointer'
                : 'bg-surface-container-high text-outline cursor-not-allowed opacity-70'
            }`}
          >
            <div className="flex flex-col text-right leading-none">
              <span className="font-title-hinglish text-lg font-bold">{nextBtn.main}</span>
              {nextBtn.sub && (
                <span className="text-xs opacity-85 pt-0.5">{nextBtn.sub}</span>
              )}
            </div>
            <Icon name={photoDataUrl ? 'arrow_forward' : 'lock'} className="text-[26px]" />
          </button>
        </div>
      </div>
    </div>
  );
};

