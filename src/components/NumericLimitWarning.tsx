import React from 'react';
import { useTranslation } from '../i18n';
import { getNumericLimitStatus } from '../logic/format';
import { Icon } from './Icon';

interface NumericLimitWarningProps {
  value: string;
  maxLength: number;
  exceeded?: boolean;
  kind?: 'digits' | 'chars';
  className?: string;
}

/**
 * Displays a clear red warning above an input field when the user attempts
 * to enter beyond `maxLength` (or when `value` already exceeds `maxLength`).
 */
export const NumericLimitWarning: React.FC<NumericLimitWarningProps> = ({
  value,
  maxLength,
  exceeded: exceededProp = false,
  kind = 'digits',
  className = '',
}) => {
  const { t } = useTranslation();
  const { exceeded: valueExceeded } = getNumericLimitStatus(value, maxLength);
  const exceeded = exceededProp || valueExceeded;

  if (!exceeded) return null;

  const warningText =
    kind === 'chars'
      ? t('common.char_limit_exceeded_warning', { max: maxLength })
      : t('common.limit_exceeded_warning', { max: maxLength });

  return (
    <div
      role="alert"
      className={`text-xs font-bold text-error flex items-center gap-1 mb-1 ${className}`.trim()}
    >
      <Icon name="error" className="text-[15px] shrink-0" />
      <span>{warningText}</span>
    </div>
  );
};
