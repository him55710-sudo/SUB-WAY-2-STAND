/**
 * Motion OS — Dark Edition design tokens (see design/motion-os.md).
 * Pure data, no imports. Applied through the theme files after the UI task merges.
 */

export const color = {
  /** Deep black with a navy cast — app background. */
  ink: '#05070B',
  /** Dark navy — the one surface level (pass, sheets). */
  surface: '#0C111B',
  /** Pressed / selected surface. */
  raised: '#131A27',
  hairline: '#1A2232',
  text: '#F3F5F7',
  text2: '#8A94A6',
  text3: '#556074',

  /** Brand point. Also the colour of a verified forecast — and nothing else. */
  lime: '#C8FF3C',
  onLime: '#0A0D05',
  /** Lime at low alpha for the ghost ring track and focus outlines only. */
  limeFaint: 'rgba(200,255,60,0.16)',

  /** Data-state colours — always paired with a glyph + words. */
  live: '#5BD6FF',
  sim: '#B9A6FF',
  hold: '#8A94A6',
  error: '#FF6B5E',
} as const;

/** Official Seoul line colours — line identity only (badge, selection bar, route stroke). */
export const line = {
  1: { bg: '#0052A4', fg: '#FFFFFF' },
  2: { bg: '#00A84D', fg: '#FFFFFF' },
  3: { bg: '#EF7C1C', fg: '#FFFFFF' },
  4: { bg: '#00A5DE', fg: '#FFFFFF' },
  5: { bg: '#996CAC', fg: '#FFFFFF' },
  6: { bg: '#CD7C2F', fg: '#FFFFFF' },
  7: { bg: '#747F00', fg: '#FFFFFF' },
  8: { bg: '#E6186C', fg: '#FFFFFF' },
  9: { bg: '#BDB092', fg: '#1A1A1A' },
} as const;

export const font = {
  num: 'Inter_600SemiBold',
  numBold: 'Inter_700Bold',
  numMedium: 'Inter_500Medium',
} as const;

/** Korean uses the system font; numerals and Latin tags use Inter with tabular figures. */
export const type = {
  display: { fontSize: 64, lineHeight: 66, fontWeight: '800', letterSpacing: -1.5 },
  figure: { fontSize: 48, lineHeight: 52, fontFamily: font.numBold, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  headline: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  tag: { fontSize: 11, lineHeight: 14, fontFamily: font.numBold, letterSpacing: 1.2, textTransform: 'uppercase' },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, section: 36 } as const;
export const radius = { pass: 24, control: 16, track: 3, pill: 999 } as const;
export const touch = { min: 48 } as const;

export const motion = {
  press: { scale: 0.97, opacity: 0.88, ms: 110 },
  select: { ms: 180 },
  rowStagger: { ms: 35, max: 6, rise: 6 },
  confirmBar: { ms: 220 },
  /** Calm → verified event: one entrance, never looped. */
  eventEnter: { ms: 240, slide: 12 },
  /** Single arrow nudge toward the sway side on event start. */
  arrowNudge: { ms: 320, px: 6, repeats: 1 },
  heroSwap: { ms: 200, rise: 8 },
  /** Near-critically damped: no visible bounce on the safety instrument. */
  dotSpring: { damping: 26, stiffness: 180, mass: 1 },
  liveBreath: { ms: 2400, min: 0.55 },
  countdownHz: 1,
} as const;

export const instrument = { fullScaleMs2: 1.0, dot: 30, track: 3, ticks: [-1, -0.5, 0, 0.5, 1] } as const;

/** Intensity is shown as filled segments + words, never as a colour change. */
export const intensitySegments = { low: 1, moderate: 2, high: 3 } as const;

export type DataState = 'live' | 'simulation' | 'hold';
export const stateTag: Record<DataState, { glyph: 'dot' | 'diamond' | 'dash'; tag: string; ko: string; color: string }> = {
  live: { glyph: 'dot', tag: 'LIVE', ko: '실시간 관측', color: color.live },
  simulation: { glyph: 'diamond', tag: 'SIMULATION', ko: '합성 시연', color: color.sim },
  hold: { glyph: 'dash', tag: 'HOLD', ko: '예측 보류', color: color.hold },
};

export type HeroMode = 'calm' | 'event' | 'inCurve' | 'hold' | 'paused';
