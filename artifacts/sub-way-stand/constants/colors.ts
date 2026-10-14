/**
 * SUB WAY 2 STAND — dark "ink" palette. The app is dark-only so riders can glance at it
 * in a bright or dim carriage without the screen flaring.
 *
 * Semantic accents:
 *   warn (amber)       → approaching curve / sway warning
 *   live (mint)        → real, station-level observation
 *   synthetic (lavender) → SYNTHETIC physics demonstration
 *   destructive (red)  → errors
 * Seoul line colours live in constants/lines.ts and are used only for line identity.
 */
const palette = {
  text: '#F3EEE3',
  tint: '#F3EEE3',

  background: '#0B0E13',
  foreground: '#F3EEE3',

  card: '#131821',
  cardForeground: '#F3EEE3',
  raised: '#1A202B',

  primary: '#F3EEE3',
  primaryForeground: '#0B0E13',

  secondary: '#1A202B',
  secondaryForeground: '#F3EEE3',

  muted: '#1A202B',
  mutedForeground: '#9BA3B1',
  faint: '#5D6573',

  accent: '#FFB547',
  accentForeground: '#1A1204',

  warn: '#FFB547',
  warnSoft: 'rgba(255,181,71,0.13)',
  live: '#46D99B',
  liveSoft: 'rgba(70,217,155,0.12)',
  synthetic: '#B9A4FF',
  syntheticSoft: 'rgba(185,164,255,0.13)',

  destructive: '#FF6B5E',
  destructiveSoft: 'rgba(255,107,94,0.13)',
  destructiveForeground: '#0B0E13',

  border: '#252C38',
  input: '#252C38',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 14,
};

export type Palette = typeof palette;
export default colors;
