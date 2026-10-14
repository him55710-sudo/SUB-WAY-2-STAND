/**
 * SUB WAY 2 STAND — dark "ink" transit palette. The app is dark-only so riders can glance at it
 * in a bright or dim carriage without the screen flaring.
 *
 * Semantic accents:
 *   line2 (green)        → Seoul Line 2 identity / primary selection accent
 *   warn (amber)         → approaching curve / sway warning
 *   live (mint)          → real, station-level observation
 *   synthetic (lavender) → SYNTHETIC physics demonstration
 *   turnLeft / turnRight → curve markers on the route map, coloured by turn side
 *   destructive (red)    → errors
 * Other Seoul line colours live in constants/lines.ts and are used only for line identity.
 */
const palette = {
  text: '#F3EEE3',
  tint: '#F3EEE3',

  background: '#0B0E13',
  foreground: '#F3EEE3',

  card: '#131821',
  cardForeground: '#F3EEE3',
  raised: '#1A202B',
  sunken: '#090B0F',

  primary: '#F3EEE3',
  primaryForeground: '#0B0E13',

  secondary: '#1A202B',
  secondaryForeground: '#F3EEE3',

  muted: '#1A202B',
  mutedForeground: '#9BA3B1',
  faint: '#5D6573',

  accent: '#FFB547',
  accentForeground: '#1A1204',

  line2: '#00A84D',
  line2Soft: 'rgba(0,168,77,0.16)',
  line2Foreground: '#FFFFFF',

  warn: '#FFB547',
  warnSoft: 'rgba(255,181,71,0.13)',
  warnForeground: '#1A1204',
  live: '#46D99B',
  liveSoft: 'rgba(70,217,155,0.12)',
  synthetic: '#B9A4FF',
  syntheticSoft: 'rgba(185,164,255,0.13)',
  syntheticForeground: '#120C26',

  turnLeft: '#5CC2FF',
  turnLeftSoft: 'rgba(92,194,255,0.14)',
  turnRight: '#FF7AC6',
  turnRightSoft: 'rgba(255,122,198,0.14)',

  destructive: '#FF6B5E',
  destructiveSoft: 'rgba(255,107,94,0.13)',
  destructiveForeground: '#0B0E13',

  border: '#252C38',
  borderStrong: '#343D4C',
  input: '#252C38',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 14,
};

/** 4-pt spacing scale used across screens. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/**
 * Type scale. Korean glyphs fall back to the system font, so Korean text uses fontWeight;
 * numerals use Inter (tabular) through the `num*` families so countdowns don't jitter.
 */
export const typography = {
  num: 'Inter_600SemiBold',
  numBold: 'Inter_700Bold',
  numMedium: 'Inter_500Medium',
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6 },
} as const;

export type Palette = typeof palette;
export default colors;
