/** Motion OS — one dark palette, shared by native and web. */
import { color, font } from '@/design/tokens';

const palette = {
  text: color.text, tint: color.text,
  background: color.ink, foreground: color.text,
  card: color.surface, cardForeground: color.text,
  raised: color.raised, sunken: color.ink,
  primary: color.lime, primaryForeground: color.onLime,
  secondary: color.raised, secondaryForeground: color.text,
  muted: color.surface, mutedForeground: color.text2, faint: color.text3,
  accent: color.lime, accentForeground: color.onLime,
  signal: color.lime,
  line2: '#00A84D', line2Soft: 'rgba(0,168,77,0.12)', line2Foreground: '#FFFFFF',
  // Status warnings stay neutral. Lime is reserved for motion in the ride hero.
  warn: color.text2, warnSoft: 'transparent', warnForeground: color.ink,
  live: color.live, liveSoft: 'transparent',
  synthetic: color.sim, syntheticSoft: 'transparent', syntheticForeground: color.ink,
  turnLeft: color.text2, turnLeftSoft: 'transparent',
  turnRight: color.text2, turnRightSoft: 'transparent',
  destructive: color.error, destructiveSoft: 'transparent', destructiveForeground: color.ink,
  border: color.hairline, borderStrong: '#2A354A', input: color.hairline,
};

const colors = { light: palette, dark: palette, radius: 16 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 20, xl: 24, xxl: 36 } as const;
export const typography = {
  num: font.num, numBold: font.numBold, numMedium: font.numMedium,
  display: { fontSize: 64, lineHeight: 68, fontWeight: '800' },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2 },
} as const;
export type Palette = typeof palette;
export default colors;
