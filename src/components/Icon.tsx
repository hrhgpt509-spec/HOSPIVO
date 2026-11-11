import React from 'react';

export interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  style?: React.CSSProperties;
}

/**
 * Shared Icon component for Material Symbols Outlined.
 * Size and colour follow the parent text by default.
 * Always aria-hidden so screen readers do not announce raw icon ligatures.
 */
export const Icon: React.FC<IconProps> = ({
  name,
  className = '',
  filled = false,
  style,
}) => {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontFamily: "'Material Symbols Outlined'",
        fontWeight: 400,
        fontStyle: 'normal',
        lineHeight: 1,
        display: 'inline-block',
        textTransform: 'none',
        letterSpacing: 'normal',
        wordWrap: 'normal',
        whiteSpace: 'nowrap',
        direction: 'ltr',
        WebkitFontFeatureSettings: "'liga'",
        fontFeatureSettings: "'liga'",
        WebkitFontSmoothing: 'antialiased',
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400" : "'FILL' 0, 'wght' 400",
        ...style,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
};
