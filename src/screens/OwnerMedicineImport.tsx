import React, { useState, useRef, useEffect } from 'react';
import { db, type Medicine } from '../db';
import { useTranslation, tButton } from '../i18n';
import { Icon } from '../components/Icon';
import { FullscreenButton } from '../components/FullscreenButton';
import { useShop } from '../logic/useShop';
import { formatRupees } from '../logic/money';
import { triggerFeedback } from '../logic/feedback';
import {
  parseCsv,
  validateAndClassifyRows,
  saveImportedMedicines,
  downloadSampleCsvTemplate,
  type ValidationSummary,
} from '../logic/medicineImport';

interface OwnerMedicineImportProps {
  onBack: () => void;
  onReturnHome: () => void;
  onImportSuccess?: (count: number) => void;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const OwnerMedicineImport: React.FC<OwnerMedicineImportProps> = ({
  onBack,
  onReturnHome,
  onImportSuccess,
  currentUser,
  theme = 'light',
  onToggleTheme,
}) => {
  const { t } = useTranslation();
  const { name: shopName, mode } = useShop();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [existingMedicines, setExistingMedicines] = useState<Medicine[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const modeLabel = mode === 'cloud' ? 'Cloud mode' : t('common.local_mode');
  const isOwner = currentUser?.role === 'owner';
  const userName = currentUser?.name || (isOwner ? t('common.role_owner') : t('common.role_cashier'));

  useEffect(() => {
    db.medicines.toArray().then((meds) => setExistingMedicines(meds));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const text = await file.text();
      const parsedCsv = parseCsv(text);
      if (parsedCsv.length <= 1) {
        triggerFeedback('error', t('medicine_import.err_no_valid_rows'));
        setValidation(null);
        return;
      }

      const summary = validateAndClassifyRows(parsedCsv, existingMedicines);
      setValidation(summary);

      if (summary.validCount + summary.duplicateCount === 0) {
        triggerFeedback('error', t('medicine_import.err_no_valid_rows'));
      }
    } catch (err: any) {
      console.error('Failed to parse CSV:', err);
      triggerFeedback('error', t('medicine_import.toast_error'));
      setValidation(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!validation || isSaving) return;
    const savableRows = validation.parsedRows.filter((r) => r.status !== 'error');
    if (savableRows.length === 0) {
      triggerFeedback('error', t('medicine_import.err_no_valid_rows'));
      return;
    }

    try {
      setIsSaving(true);
      const who = currentUser?.name || 'Owner';
      const result = await saveImportedMedicines(savableRows, who);
      triggerFeedback('success', t('medicine_import.toast_success', { count: result.importedCount }));
      if (onImportSuccess) {
        onImportSuccess(result.importedCount);
      } else {
        onBack();
      }
    } catch (err: any) {
      console.error('Failed to save imported medicines:', err);
      triggerFeedback('error', err?.message || 'Failed to save imported medicines');
    } finally {
      setIsSaving(false);
    }
  };

  const returnHomeBtn = tButton('home.return_home_btn');
  const backBtn = tButton('medicine_import.btn_back');
  const confirmBtn = tButton('medicine_import.btn_confirm_import');
  const downloadTemplateBtn = tButton('medicine_import.btn_download_template');
  const chooseCsvBtn = tButton('medicine_import.btn_choose_csv');

  return (
    <div className="w-full min-h-screen bg-background text-on-surface flex flex-col justify-between antialiased select-none transition-colors">
      {/* 1. Header (Matching 38c Stitch design) */}
      <header className="fixed top-0 left-0 right-0 w-full z-40 bg-surface/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/40">
        <div className="h-16 w-full px-margin flex items-center justify-between">
          {/* Left: Brand + Shop Name + Mode Pill */}
          <div className="flex items-center gap-space-md">
            <span className="font-headline-lg text-headline-lg tracking-tight text-primary font-extrabold">
              HOSPIVO
            </span>
            <div className="h-6 w-[2px] bg-outline-variant" />
            <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
              {shopName}
            </span>
            <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-bold">
                {modeLabel}
              </span>
            </div>
          </div>

          {/* Right: Home button + Light/Dark switcher + FullscreenButton + User Pill */}
          <div className="flex items-center gap-space-md">
            <button
              type="button"
              onClick={onReturnHome}
              className="px-space-md py-2 rounded-lg transition-all flex flex-col text-left text-on-surface-variant hover:text-on-surface cursor-pointer hover:bg-surface-container"
            >
              <span className="font-title-hinglish text-title-hinglish leading-tight">{returnHomeBtn.main}</span>
              {returnHomeBtn.sub && (
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-tight">
                  {returnHomeBtn.sub}
                </span>
              )}
            </button>

            {/* Light/Dark theme toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={t('common.toggle_theme')}
                className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:bg-surface-container-highest transition-colors cursor-pointer"
              >
                <Icon name={theme === 'dark' ? 'dark_mode' : 'light_mode'} className="text-[22px]" />
              </button>
            )}

            <FullscreenButton />

            {/* User pill */}
            <div className="inline-flex items-center gap-space-sm pl-space-sm pr-space-xs py-1 rounded-full bg-surface-container">
              <div className="flex flex-col text-right leading-tight">
                <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold">
                  {userName}
                </span>
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant">
                  {currentUser?.role === 'cashier' ? t('common.role_cashier') : t('common.role_owner')}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                <Icon name="person" className="text-[18px]" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Body */}
      <main className="w-full pt-20 pb-6 flex-1 bg-background px-margin max-w-[1440px] mx-auto flex flex-col justify-between">
        <div className="flex flex-col gap-space-sm w-full">
          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Title Row & Actions */}
          <div className="flex items-center justify-between flex-wrap gap-4 mt-2">
            <div className="flex items-baseline gap-space-sm">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-extrabold">
                {t('medicine_import.page_title')}
              </h1>
              <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                {t('medicine_import.page_sub')}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* File Name Pill (if loaded) */}
              {fileName && (
                <div className="flex items-center gap-space-xs px-space-md py-2 rounded-full bg-surface-container-high shadow-sm border border-outline-variant/60">
                  <Icon name="description" className="text-primary text-[20px]" />
                  <span className="font-label-sub-english text-label-sub-english text-on-surface font-semibold max-w-[240px] truncate">
                    {fileName}
                  </span>
                </div>
              )}

              {/* Download Sample CSV Button */}
              <button
                type="button"
                onClick={downloadSampleCsvTemplate}
                className="h-12 px-4 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-outline-variant font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Icon name="download" className="text-[20px] text-primary" />
                <div className="flex flex-col text-left leading-tight">
                  <span>{downloadTemplateBtn.main}</span>
                  {downloadTemplateBtn.sub && (
                    <span className="text-[11px] text-outline font-normal">
                      {downloadTemplateBtn.sub}
                    </span>
                  )}
                </div>
              </button>

              {/* Upload / Change File Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-12 px-5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <Icon name="upload_file" className="text-[20px]" />
                <div className="flex flex-col text-left leading-tight">
                  <span>{chooseCsvBtn.main}</span>
                  {chooseCsvBtn.sub && (
                    <span className="text-[11px] text-primary-fixed font-normal">
                      {chooseCsvBtn.sub}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* State 1: No file selected yet */}
          {!validation ? (
            <div className="w-full bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant p-16 flex flex-col items-center text-center justify-center my-6 gap-4 shadow-sm">
              <div className="w-20 h-20 rounded-2xl bg-surface-container-low flex items-center justify-center text-primary shadow-inner">
                <Icon name="cloud_upload" className="text-[44px]" />
              </div>
              <div className="flex flex-col gap-1 max-w-lg">
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                  {t('medicine_import.empty_prompt_title')}
                </h2>
                <p className="font-body-md text-on-surface-variant">
                  {t('medicine_import.empty_prompt_sub')}
                </p>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-14 px-8 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-lg shadow-md flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <Icon name="folder_open" className="text-[24px]" />
                  <span>{chooseCsvBtn.main}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadSampleCsvTemplate}
                  className="h-14 px-6 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-base border border-outline-variant flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Icon name="download" className="text-[22px] text-primary" />
                  <span>{downloadTemplateBtn.main}</span>
                </button>
              </div>
            </div>
          ) : (
            /* State 2: File loaded and preview ready */
            <>
              {/* Summary Banners (Matching 38c dual / triple banner cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-space-md w-full">
                {/* 1. Green Success Banner: Recognized entries */}
                <div className="flex items-center justify-between px-space-lg py-space-sm rounded-xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-outline-variant/40">
                  <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-primary" />
                  <div className="flex items-center gap-space-md pl-space-xs">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary shadow-sm shrink-0">
                      <Icon name="check_circle" className="text-[30px]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-headline-md text-headline-md text-primary leading-tight font-extrabold">
                        {t('medicine_import.banner_found', {
                          count: validation.validCount + validation.duplicateCount,
                        })}
                      </span>
                      <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                        {t('medicine_import.banner_found_sub')}
                      </span>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-surface-container-low text-primary font-bold">
                    <span className="font-label-sub-english text-label-sub-english">
                      {t('medicine_import.badge_new_count', { count: validation.validCount })}
                    </span>
                  </div>
                </div>

                {/* 2. Orange Duplicate Banner: Duplicates */}
                {validation.duplicateCount > 0 ? (
                  <div className="flex items-center justify-between px-space-lg py-space-sm rounded-xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-outline-variant/40">
                    <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-tertiary" />
                    <div className="flex items-center gap-space-md pl-space-xs">
                      <div className="w-12 h-12 rounded-xl bg-tertiary-fixed flex items-center justify-center text-tertiary shadow-sm shrink-0">
                        <Icon name="warning" className="text-[30px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-headline-md text-headline-md text-tertiary leading-tight font-extrabold">
                          {t('medicine_import.banner_duplicates', { count: validation.duplicateCount })}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                          {t('medicine_import.banner_duplicates_sub')}
                        </span>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-bold">
                      <span className="font-label-sub-english text-label-sub-english">
                        {t('medicine_import.badge_duplicates_note')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center px-space-lg py-space-sm rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/40 text-on-surface-variant">
                    <Icon name="verified" className="text-primary text-[28px] mr-3" />
                    <span className="font-body-md text-sm">No duplicate medicines found</span>
                  </div>
                )}

                {/* 3. Red Error Banner (if error rows exist) */}
                {validation.errorCount > 0 && (
                  <div className="flex items-center justify-between px-space-lg py-space-sm rounded-xl bg-surface-container-lowest shadow-sm relative overflow-hidden border border-outline-variant/40">
                    <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-error" />
                    <div className="flex items-center gap-space-md pl-space-xs">
                      <div className="w-12 h-12 rounded-xl bg-error-container flex items-center justify-center text-on-error-container shadow-sm shrink-0">
                        <Icon name="error" className="text-[30px]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-headline-md text-headline-md text-error leading-tight font-extrabold">
                          {t('medicine_import.banner_errors', { count: validation.errorCount })}
                        </span>
                        <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-medium">
                          {t('medicine_import.banner_errors_sub')}
                        </span>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-full bg-error-container text-on-error-container font-bold">
                      <span className="font-label-sub-english text-label-sub-english">
                        {t('medicine_import.badge_errors_note')}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Table Container (38c design) */}
              <div className="w-full flex-1 my-space-xs flex flex-col rounded-xl bg-surface-container-lowest shadow-md overflow-hidden border border-outline-variant/50 max-h-[500px]">
                {/* Table Header (Clean, bold, 18px text, 52px height) */}
                <div className="grid grid-cols-12 px-space-lg py-3.5 bg-surface-container-high text-on-surface font-body-md text-body-md font-bold tracking-normal select-none shrink-0 border-b border-outline-variant/40">
                  <div className="col-span-4 flex items-center gap-space-xs">
                    <span>{t('medicine_import.col_name')}</span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-normal">
                      {t('medicine_import.col_name_sub')}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-space-xs">
                    <span>{t('medicine_import.col_strength')}</span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-normal">
                      {t('medicine_import.col_strength_sub')}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center gap-space-xs">
                    <span>{t('medicine_import.col_company')}</span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-normal">
                      {t('medicine_import.col_company_sub')}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-space-xs text-right justify-end pr-space-md">
                    <span>{t('medicine_import.col_mrp')}</span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-normal">
                      {t('medicine_import.col_mrp_sub')}
                    </span>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <span>{t('medicine_import.col_shelf')}</span>
                    <span className="font-label-sub-english text-label-sub-english text-on-surface-variant font-normal ml-1">
                      {t('medicine_import.col_shelf_sub')}
                    </span>
                  </div>
                </div>

                {/* Table Rows (>= 60px height each) */}
                <div className="flex flex-col flex-1 overflow-y-auto divide-y divide-outline-variant/20">
                  {validation.parsedRows.map((row, idx) => {
                    const isDup = row.status === 'duplicate';
                    const isErr = row.status === 'error';

                    return (
                      <div
                        key={idx}
                        className={`min-h-[60px] py-2 grid grid-cols-12 px-space-lg items-center transition-all relative ${
                          isErr
                            ? 'bg-error-container/30 hover:bg-error-container/40'
                            : isDup
                              ? 'bg-tertiary-fixed/30 hover:bg-tertiary-fixed/45'
                              : 'bg-surface-container-lowest hover:bg-surface-container-low/50'
                        }`}
                      >
                        {/* Status Left Stripe */}
                        {isErr ? (
                          <div className="absolute left-0 top-0 bottom-0 w-2 bg-error" />
                        ) : isDup ? (
                          <div className="absolute left-0 top-0 bottom-0 w-2 bg-tertiary" />
                        ) : null}

                        {/* Col 1: Name + Status Badge */}
                        <div className="col-span-4 flex items-center gap-space-sm pl-space-xs min-w-0 pr-2">
                          <span className="font-title-hinglish text-title-hinglish text-on-surface font-bold truncate">
                            {row.name || row.raw.name || '—'}
                          </span>
                          {isErr ? (
                            <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded-full bg-error-container text-on-error-container font-bold font-label-sub-english text-xs shrink-0 shadow-sm" title={row.errorMessage}>
                              <Icon name="error" className="text-[14px]" />
                              <span className="truncate max-w-[140px]">{row.errorMessage}</span>
                            </span>
                          ) : isDup ? (
                            <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-bold font-label-sub-english text-xs shrink-0 shadow-sm">
                              <Icon name="history" className="text-[14px]" />
                              <span>{t('medicine_import.badge_duplicate')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded-full bg-surface-container text-primary font-bold font-label-sub-english text-xs shrink-0">
                              <span>{t('medicine_import.badge_new')}</span>
                            </span>
                          )}
                        </div>

                        {/* Col 2: Strength */}
                        <div className="col-span-2 font-body-md text-body-md text-on-surface font-medium truncate">
                          {row.strength || '—'}
                        </div>

                        {/* Col 3: Company */}
                        <div className="col-span-3 font-body-md text-body-md text-on-surface-variant truncate pr-2">
                          {row.company || '—'}
                        </div>

                        {/* Col 4: MRP */}
                        <div className="col-span-2 text-right pr-space-md font-headline-md text-headline-md text-on-surface font-bold">
                          {row.mrpPaise > 0 ? formatRupees(row.mrpPaise) : '—'}
                        </div>

                        {/* Col 5: Shelf */}
                        <div className="col-span-1 flex justify-center">
                          {row.shelf ? (
                            <span className="px-space-sm py-1 rounded bg-surface-container font-body-md text-body-md font-bold text-on-surface">
                              {row.shelf}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant text-sm">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 3. Bottom Action Bar (38c design) */}
        <div className="w-full flex items-center justify-between py-space-xs shrink-0 mt-4 flex-wrap gap-4">
          {/* Left Button: Wapas / Back (Secondary tactile button, 64px height) */}
          <button
            type="button"
            onClick={onBack}
            className="h-16 px-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-space-md transition-all active:translate-y-[2px] hover:bg-surface-container-high cursor-pointer border border-outline-variant"
          >
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
              <Icon name="arrow_back" className="text-[28px] text-primary" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-title-hinglish text-title-hinglish text-on-surface leading-tight font-bold">
                {backBtn.main}
              </span>
              {backBtn.sub && (
                <span className="font-label-sub-english text-label-sub-english text-on-surface-variant leading-tight">
                  {backBtn.sub}
                </span>
              )}
            </div>
          </button>

          {/* Center Informational Note (only shown when file loaded) */}
          {validation && (
            <div className="flex items-center gap-space-sm px-space-lg py-2.5 rounded-xl bg-surface-container-high/60 shadow-sm border border-outline-variant/40">
              <Icon name="info" className="text-secondary text-[24px]" />
              <span className="font-label-sub-english text-label-sub-english text-on-surface font-semibold">
                {t('medicine_import.import_summary_note', {
                  newCount: validation.validCount,
                  dupCount: validation.duplicateCount,
                })}
              </span>
            </div>
          )}

          {/* Right Button: Pakka Karo / Confirm (Primary green tactile button, 64px height) */}
          {validation && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSaving || validation.validCount + validation.duplicateCount === 0}
              className="h-16 px-space-xl rounded-xl bg-primary text-on-primary shadow-md flex items-center gap-space-md transition-all active:translate-y-[2px] hover:bg-primary-container cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-10 h-10 rounded-lg bg-on-primary/20 flex items-center justify-center text-on-primary">
                <Icon name="check" className="text-[30px]" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-title-hinglish text-title-hinglish text-on-primary leading-tight font-bold">
                  {confirmBtn.main}
                </span>
                {confirmBtn.sub && (
                  <span className="font-label-sub-english text-label-sub-english text-on-primary/80 leading-tight">
                    {confirmBtn.sub}
                  </span>
                )}
              </div>
            </button>
          )}
        </div>
      </main>
    </div>
  );
};
