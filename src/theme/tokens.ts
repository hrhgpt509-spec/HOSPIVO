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

export const theme = {
  colors,
  fontFamily,
  spacing,
  sizes,
};

export default theme;
