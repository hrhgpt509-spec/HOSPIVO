import React from 'react';
import { useTranslation } from '../i18n';
import { getNumericLimitStatus } from '../logic/format';
import { Icon } from './Icon';

interface NumericLimitWarningProps {
  value: string;
  maxLength: number;
  className?: string;
}

/**
 * Displays a clear red warning above an input field when the digit count
 * exceeds `maxLength`, without blocking typing, backspace, or editing.
 */
export const NumericLimitWarning: React.FC<NumericLimitWarningProps> = ({
  value,
  maxLength,
  className = '',
}) => {
  const { t } = useTranslation();
  const { exceeded } = getNumericLimitStatus(value, maxLength);

  if (!exceeded) return null;

  return (
    <div
      role="alert"
      className={`text-xs font-bold text-error flex items-center gap-1 mb-1 ${className}`.trim()}
    >
      <Icon name="error" className="text-[15px] shrink-0" />
      <span>{t('common.limit_exceeded_warning', { max: maxLength })}</span>
    </div>
  );
};
