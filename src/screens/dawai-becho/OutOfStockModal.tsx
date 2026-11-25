import React, { useState, useEffect } from 'react';
import { db, type Medicine } from '../../db';
import { useTranslation, tButton } from '../../i18n';
import { Icon } from '../../components/Icon';
import { formatRupees } from '../../logic/money';
import { findInStockSubstitutes, type SubstituteMedicineInfo } from '../../logic/billing';

interface OutOfStockModalProps {
  isOpen: boolean;
  medicine: Medicine | null;
  onSelectSubstitute: (substituteMedicine: Medicine) => void;
  onClose: () => void;
}

export const OutOfStockModal: React.FC<OutOfStockModalProps> = ({
  isOpen,
  medicine,
  onSelectSubstitute,
  onClose,
}) => {
  const { t } = useTranslation();
  const [substitutes, setSubstitutes] = useState<SubstituteMedicineInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (isOpen && medicine?.id) {
      setIsLoading(true);
      findInStockSubstitutes(medicine.id)
        .then((res) => {
          if (active) {
            setSubstitutes(res);
          }
        })
        .catch((err) => {
          console.error('Failed to find substitutes:', err);
          if (active) setSubstitutes([]);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    } else {
      setSubstitutes([]);
    }
    return () => {
      active = false;
    };
  }, [isOpen, medicine?.id]);

  if (!isOpen || !medicine) return null;

  const btnAdd = tButton('dawai_becho.oos_btn_add');
  const btnBack = tButton('suppliers.btn_back');

  const handlePick = async (subId: number) => {
    const med = await db.medicines.get(subId);
    if (med) {
      onSelectSubstitute(med);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/65 backdrop-blur-[4px] flex items-end sm:items-center justify-center p-0 sm:p-space-md select-none">
      <div className="w-full max-w-[600px] max-h-[92dvh] bg-surface-container-lowest rounded-t-3xl sm:rounded-[24px] shadow-2xl flex flex-col overflow-hidden border-t sm:border border-outline-variant/40">
        {/* RED DANGER HEADER BLOCK (Matching 14_Sell_OutOfStock_Substitutes.html) */}
        <div className="bg-error text-on-error px-4 sm:px-space-lg py-3.5 sm:py-space-md flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-on-error/15 flex items-center justify-center shrink-0">
              <Icon name="block" className="text-on-error text-[28px] sm:text-[32px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-lg text-lg sm:text-headline-lg text-on-error leading-tight font-extrabold tracking-tight break-words">
                {t('dawai_becho.oos_title')}
              </span>
              <span className="font-label-sub-english text-xs sm:text-label-sub-english text-error-container leading-tight break-words">
                {t('dawai_becho.oos_sub')}
              </span>
            </div>
          </div>
          <div className="bg-on-error text-error px-3 sm:px-space-md py-1 sm:py-space-xs rounded-xl shadow-sm max-w-full sm:max-w-[240px] truncate">
            <span className="font-headline-md text-sm sm:text-headline-md leading-none font-bold">
              {medicine.name}
            </span>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-space-lg pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-space-md bg-surface-container-lowest overflow-y-auto flex-1 min-h-0">
          {/* Instruction Label */}
          <div className="flex items-center gap-space-xs">
            <Icon name="swap_horizontal_circle" className="text-secondary text-[24px] sm:text-[26px] shrink-0" />
            <span className="font-body-lg text-base sm:text-body-lg font-bold text-on-surface break-words">
              {t('dawai_becho.oos_salt_heading')}
            </span>
          </div>

          {medicine.salt && (
            <div className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-sm font-semibold w-fit max-w-full break-words">
              {medicine.salt}
            </div>
          )}

          {/* Substitutes List */}
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !medicine.salt?.trim() ? (
            <div className="p-6 rounded-2xl bg-surface-container-low text-on-surface-variant font-body-md text-center border border-outline-variant/50">
              {t('dawai_becho.oos_no_salt_msg')}
            </div>
          ) : substitutes.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface-container-low text-on-surface-variant font-body-md text-center border border-outline-variant/50">
              {t('dawai_becho.oos_no_substitutes_msg')}
            </div>
          ) : (
            <div className="flex flex-col gap-space-sm">
              {substitutes.map((sub) => (
                <div
                  key={sub.id}
                  className="min-h-[76px] bg-surface-container-low rounded-[16px] px-3.5 sm:px-space-md py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shadow-sm border border-outline-variant/40 min-w-0"
                >
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <span className="font-headline-md text-base sm:text-headline-md text-on-surface leading-tight break-words">
                      {sub.name} {sub.strength}
                    </span>
                    <span className="font-label-sub-english text-xs sm:text-label-sub-english text-on-surface-variant font-medium break-words">
                      {sub.shelf ? `${sub.shelf} ${t('dawai_becho.shelf_suffix')} · ` : ''}
                      {sub.stockUnits} {t('dawai_becho.pcs_suffix')} · {formatRupees(sub.mrpPaise)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePick(sub.id)}
                    className="w-full sm:w-auto min-h-[52px] sm:min-h-[56px] py-2 px-4 sm:px-space-lg bg-primary hover:bg-primary-container text-on-primary rounded-[16px] flex items-center justify-center gap-2 shadow-md transition-all active:translate-y-0.5 cursor-pointer shrink-0"
                  >
                    <Icon name="add_shopping_cart" className="text-[24px] text-on-primary shrink-0" />
                    <div className="flex flex-col text-left leading-tight">
                      <span className="font-title-hinglish text-sm sm:text-title-hinglish text-on-primary leading-tight font-bold">
                        {btnAdd.main}
                      </span>
                      {btnAdd.sub && (
                        <span className="font-label-sub-english text-xs text-primary-fixed leading-tight">
                          {btnAdd.sub}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Action Row: Wapas Button */}
          <div className="pt-space-xs flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[56px] py-2.5 px-6 sm:px-space-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-[16px] flex items-center justify-center gap-space-sm shadow-sm transition-all active:translate-y-0.5 cursor-pointer border border-outline-variant"
            >
              <Icon name="arrow_back" className="text-[24px] text-on-surface shrink-0" />
              <div className="flex flex-col text-left leading-tight">
                <span className="font-title-hinglish text-base sm:text-title-hinglish text-on-surface leading-tight font-bold">
                  {btnBack.main}
                </span>
                {btnBack.sub && (
                  <span className="font-label-sub-english text-xs text-on-surface-variant leading-tight">
                    {btnBack.sub}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

