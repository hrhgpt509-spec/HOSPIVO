export const colors = {
  brand: {
    DEFAULT: '#1B8F4A',
    dark: '#136b37',
    light: '#e8f5ee',
    50: '#f1fcf6',
  },
  canvas: '#F4F6F5',
  semantic: {
    red: '#D92D20',
    redBg: '#FEF3F2',
    orange: '#E06A00',
    orangeBg: '#FFF6ED',
    yellow: '#DC6803',
    blue: '#026AA2',
    blueBg: '#F0F9FF',
    grey: '#475467',
    greyChipBg: '#E9EEF2',
  },
} as const;

export const fontFamily = {
  sans: ['"Noto Sans"', 'sans-serif'],
} as const;

export const spacing = {
  headerPx: '28px', // px-7
  headerPy: '16px', // py-4
  tileP: '24px', // p-6
  tileGap: '24px', // gap-6
  footerP: '20px', // p-5
  footerPx: '24px', // px-6
} as const;

export const sizes = {
  desktopWidth: '1440px',
  desktopHeight: '900px',
  gridMaxWidth: '1392px',
  tileHeight: '225px',
  tileIconSize: '56px', // w-14 h-14
  logoIconSize: '44px', // w-11 h-11
  switchSize: '48px', // w-12 h-12
} as const;

export const stitchTokens = {
  colors: {
    primary: '#006b33',
    primaryContainer: '#088643',
    primaryFixed: '#8ef9a7',
    primaryFixedDim: '#72dc8e',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#f6fff3',
    onPrimaryFixed: '#00210b',
    onPrimaryFixedVariant: '#005226',
    inversePrimary: '#72dc8e',
    secondary: '#005faf',
    secondaryContainer: '#54a0fe',
    secondaryFixed: '#d4e3ff',
    secondaryFixedDim: '#a5c8ff',
    onSecondary: '#ffffff',
    onSecondaryContainer: '#003567',
    onSecondaryFixed: '#001c3a',
    onSecondaryFixedVariant: '#004786',
    tertiary: '#924700',
    tertiaryContainer: '#b75b00',
    tertiaryFixed: '#ffdcc6',
    tertiaryFixedDim: '#ffb786',
    onTertiary: '#ffffff',
    onTertiaryContainer: '#fffbff',
    onTertiaryFixed: '#311300',
    onTertiaryFixedVariant: '#723600',
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onError: '#ffffff',
    onErrorContainer: '#93000a',
    surface: '#f1fcf6',
    surfaceDim: '#d1ddd7',
    surfaceBright: '#f1fcf6',
    surfaceTint: '#006d34',
    surfaceVariant: '#dae5df',
    surfaceContainer: '#e5f0eb',
    surfaceContainerLow: '#ebf6f0',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerHigh: '#e0ebe5',
    surfaceContainerHighest: '#dae5df',
    onSurface: '#141e1a',
    onSurfaceVariant: '#3e4a3f',
    outline: '#6e7a6e',
    outlineVariant: '#bdcabc',
    inverseSurface: '#28332f',
    inverseOnSurface: '#e8f3ee',
    background: '#f1fcf6',
    onBackground: '#141e1a',
  },
  spacing: {
    margin: '2rem',
    marginMobile: '1rem',
    gutter: '1.5rem',
    gutterCompact: '1rem',
    spaceXs: '0.5rem',
    spaceSm: '0.75rem',
    spaceMd: '1rem',
    spaceLg: '1.5rem',
    spaceXl: '2.5rem',
  },
  borderRadius: {
    DEFAULT: '0.25rem',
    lg: '0.5rem',
    xl: '0.75rem',
    full: '9999px',
  },
} as const;

export const theme = {
  colors,
  fontFamily,
  spacing,
  sizes,
  stitch: stitchTokens,
};

export default theme;
