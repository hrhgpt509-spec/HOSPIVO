import React from 'react';
import { useTranslation, type Language } from '../i18n';

export interface LanguageSwitchProps {
  className?: string;
}

export const LanguageSwitch: React.FC<LanguageSwitchProps> = ({ className = '' }) => {
  const { language, setLanguage } = useTranslation();

  const handleSelect = (lang: Language) => {
    if (lang !== language) {
      setLanguage(lang);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Language selection"
      className={`inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-inner select-none ${className}`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={language === 'en'}
        onClick={() => handleSelect('en')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
          language === 'en'
            ? 'bg-[#006b33] text-white shadow-sm'
            : 'text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        English
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={language === 'hinglish'}
        onClick={() => handleSelect('hinglish')}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
          language === 'hinglish'
            ? 'bg-[#006b33] text-white shadow-sm'
            : 'text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        Hindi (English letters)
      </button>
    </div>
  );
};

export default LanguageSwitch;
