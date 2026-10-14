/**
 * Voice + haptic guidance DECISION RULES (pure). Owner: voice/docs task.
 *
 * Given the previous memory and the current `Forecast`, decide whether to
 * emit a pre-warning, a "now" cue, a cancellation, or nothing, and build the
 * Korean text. No timers, no TTS, no React — the service in
 * services/guidance.ts performs the side effects.
 *
 * Keep this file free of value imports (type-only) so it runs under
 * `node --test` without a bundler.
 *
 * Rules
 * - Pre-warning: once per curve, when an ACTIVE forecast's earliest entry
 *   (etaWindowS.min) is ≤ PRE_WARN_LEAD_S. If the earliest entry is already
 *   closer than PRE_WARN_MIN_S, the pre-warning is skipped (too late to say a
 *   full sentence); the "now" cue still follows.
 * - Now cue: once per curve, when etaWindowS.min ≤ NOW_LEAD_S.
 * - Dedupe: each curve APPROACH is one episode. An episode is "closed" when the
 *   forecast becomes suppressed/missing (e.g. the train entered the curve) and
 *   "ended" when a different curve becomes the active target. When a curve is
 *   targeted again after its episode closed or ended, it counts as a FRESH
 *   approach (announced again) only if it reappears from outside the lead
 *   window (etaWindowS.min > PRE_WARN_LEAD_S) or REARM_AFTER_S has passed.
 *   Otherwise it is flicker: a closed episode of the same curve simply resumes
 *   (a cancelled pre-warning may still get its now cue, nothing is repeated),
 *   and a recently ended curve stays silent.
 * - App in background: nothing is decided or announced (the approach is not
 *   consumed); the service also stops speech when the app leaves the foreground.
 * - Suppressed / missing forecast: nothing is spoken. If a pre-warning is
 *   pending (said, but its now cue not yet given), a `cancel` action is
 *   returned so the service stops any speech in progress.
 * - Simulation forecasts are prefixed with SIMULATION_PREFIX.
 * - Voice toggle off: decisions still advance (so re-enabling never replays an
 *   old warning) but `planOutput` emits no speech. Haptics are independent.
 */
import type { Forecast, GuidanceKind, SuppressReason } from '@/contracts';

export const PRE_WARN_LEAD_S = 10;
export const PRE_WARN_MIN_S = 3;
export const NOW_LEAD_S = 1;
export const REARM_AFTER_S = 20;

export const SIMULATION_PREFIX = '시뮬레이션 안내: ';
export const SPEECH_LANGUAGE = 'ko-KR';
export const SPEECH_RATE = 0.95;

type LR = 'left' | 'right';
const SIDE_KO: Record<LR, string> = { left: '왼쪽', right: '오른쪽' };

/** Display-only reason text for a cancelled announcement (never spoken). */
export const SUPPRESS_REASON_KO: Record<SuppressReason, string> = {
  'flag-disabled': '예측 기능이 꺼져 있습니다',
  'no-selection': '선택된 열차가 없습니다',
  loading: '데이터를 불러오는 중입니다',
  'feed-unavailable': '실시간 데이터를 받을 수 없습니다',
  'train-lost': '열차 위치를 놓쳤습니다',
  stale: '데이터가 오래되었습니다',
  stationary: '열차가 정차 중입니다',
  delayed: '지연으로 도달 시각이 불확실합니다',
  'unknown-segment': '현재 구간을 알 수 없습니다',
  'no-curve-ahead': '다가오는 곡선이 없습니다',
  'low-confidence': '예측 신뢰도가 낮습니다',
  'invalid-input': '입력값이 유효하지 않습니다',
  'not-implemented': '예측이 아직 연결되지 않았습니다',
};

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const prefixFor = (f: Forecast) => (f.source === 'simulation' ? SIMULATION_PREFIX : '');

/** Seconds spoken in the pre-warning: the EARLIEST entry, rounded, at least 1. */
export function spokenSeconds(etaMinS: number): number {
  return Math.max(1, Math.round(etaMinS));
}

/** e.g. "약 10초 후 오른쪽 곡선입니다. 왼쪽으로 쏠림에 대비하세요." */
export function preWarningText(f: Forecast): string | null {
  const turn = f.targetCurve?.turn;
  if (!turn || (f.sway !== 'left' && f.sway !== 'right') || !f.etaWindowS) return null;
  const n = spokenSeconds(f.etaWindowS.min);
  return `${prefixFor(f)}약 ${n}초 후 ${SIDE_KO[turn]} 곡선입니다. ${SIDE_KO[f.sway]}으로 쏠림에 대비하세요.`;
}

/** e.g. "지금 곡선 진입. 왼쪽 쏠림 주의." */
export function nowText(f: Forecast): string | null {
  if (f.sway !== 'left' && f.sway !== 'right') return null;
  return `${prefixFor(f)}지금 곡선 진입. ${SIDE_KO[f.sway]} 쏠림 주의.`;
}

export function cancelText(reason: SuppressReason | null): string {
  return `안내 취소 — ${reason ? SUPPRESS_REASON_KO[reason] : '예측이 중지되었습니다'}`;
}

// ---------------------------------------------------------------------------
// Haptic patterns (distinct per kind)
// ---------------------------------------------------------------------------

export type HapticStep = { atMs: number; type: 'notification-warning' | 'impact-heavy' };

export const HAPTIC_PATTERNS: Record<'pre-warning' | 'now', readonly HapticStep[]> = {
  // one soft "warning" double-tap
  'pre-warning': [{ atMs: 0, type: 'notification-warning' }],
  // three strong taps — clearly different from the pre-warning
  now: [
    { atMs: 0, type: 'impact-heavy' },
    { atMs: 140, type: 'impact-heavy' },
    { atMs: 280, type: 'impact-heavy' },
  ],
};

// ---------------------------------------------------------------------------
// Decision state machine
// ---------------------------------------------------------------------------

export interface CurveEpisode {
  curveId: string;
  prewarned: boolean;
  nowCued: boolean;
  /** Pre-warning cancelled by a suppression, or skipped as too late. */
  cancelled: boolean;
  /** Flicker back to a recently finished curve: stays silent. */
  silent: boolean;
  /** Epoch ms when the forecast stopped being speakable for this episode; null while open. */
  closedAt: number | null;
}

export interface GuidanceMemory {
  episode: CurveEpisode | null;
  /** curve id → epoch ms when its last episode ended. */
  ended: Readonly<Record<string, number>>;
}

export const initialGuidanceMemory = (): GuidanceMemory => ({ episode: null, ended: {} });

export type GuidanceAction =
  | { type: 'none' }
  | {
      type: 'announce';
      kind: Extract<GuidanceKind, 'pre-warning' | 'now'>;
      curveId: string;
      textKo: string;
      haptic: readonly HapticStep[];
    }
  | { type: 'cancel'; kind: Extract<GuidanceKind, 'suppressed'>; curveId: string; textKo: string };

export interface GuidanceDecision {
  memory: GuidanceMemory;
  action: GuidanceAction;
}

const NONE: GuidanceAction = { type: 'none' };

export function isPending(ep: CurveEpisode | null): boolean {
  return !!ep && ep.prewarned && !ep.nowCued && !ep.cancelled && !ep.silent;
}

/** True when the forecast can drive an announcement at all. */
function speakable(f: Forecast | null): f is Forecast & {
  targetCurve: NonNullable<Forecast['targetCurve']>;
  etaWindowS: NonNullable<Forecast['etaWindowS']>;
} {
  return (
    !!f &&
    f.state === 'active' &&
    f.suppressReason === null &&
    (f.sway === 'left' || f.sway === 'right') &&
    !!f.targetCurve &&
    !!f.etaWindowS &&
    Number.isFinite(f.etaWindowS.min) &&
    Number.isFinite(f.etaWindowS.max)
  );
}

const newEpisode = (curveId: string, silent: boolean): CurveEpisode => ({
  curveId,
  prewarned: false,
  nowCued: false,
  cancelled: false,
  silent,
  closedAt: null,
});

function pruneEnded(ended: Readonly<Record<string, number>>, nowMs: number) {
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(ended)) {
    if (nowMs - at < REARM_AFTER_S * 1000) out[id] = at;
  }
  return out;
}

export function decideGuidance(
  memory: GuidanceMemory,
  forecast: Forecast | null,
  nowMs: number,
  opts: { appActive?: boolean } = {},
): GuidanceDecision {
  // ---- App not in the foreground: decide nothing, consume nothing. --------
  if (opts.appActive === false) return { memory, action: NONE };

  // ---- Suppressed / missing / unusable forecast: never speak. -------------
  if (!speakable(forecast)) {
    const ep = memory.episode;
    if (!ep || ep.closedAt !== null) return { memory, action: NONE };
    if (isPending(ep)) {
      const reason = forecast?.suppressReason ?? null;
      return {
        memory: { ...memory, episode: { ...ep, cancelled: true, closedAt: nowMs } },
        action: { type: 'cancel', kind: 'suppressed', curveId: ep.curveId, textKo: cancelText(reason) },
      };
    }
    return { memory: { ...memory, episode: { ...ep, closedAt: nowMs } }, action: NONE };
  }

  // ---- Active forecast with a target curve. --------------------------------
  const curveId = forecast.targetCurve.id;
  const etaMin = forecast.etaWindowS.min;
  const fromOutsideLead = etaMin > PRE_WARN_LEAD_S;
  let ended = memory.ended;
  let ep = memory.episode;

  if (ep && ep.curveId === curveId) {
    if (ep.closedAt !== null) {
      const fresh = fromOutsideLead || nowMs - ep.closedAt >= REARM_AFTER_S * 1000;
      ep = fresh ? newEpisode(curveId, false) : { ...ep, closedAt: null };
    }
  } else {
    if (ep) ended = { ...ended, [ep.curveId]: ep.closedAt ?? nowMs };
    ended = pruneEnded(ended, nowMs);
    const flicker = ended[curveId] !== undefined && !fromOutsideLead;
    ep = newEpisode(curveId, flicker);
  }

  let action: GuidanceAction = NONE;

  if (!ep.silent && !ep.nowCued && etaMin <= NOW_LEAD_S) {
    const textKo = nowText(forecast);
    if (textKo) {
      ep = { ...ep, prewarned: true, nowCued: true };
      action = { type: 'announce', kind: 'now', curveId, textKo, haptic: HAPTIC_PATTERNS.now };
    }
  } else if (!ep.silent && !ep.prewarned && etaMin <= PRE_WARN_LEAD_S) {
    if (etaMin >= PRE_WARN_MIN_S) {
      const textKo = preWarningText(forecast);
      if (textKo) {
        ep = { ...ep, prewarned: true };
        action = { type: 'announce', kind: 'pre-warning', curveId, textKo, haptic: HAPTIC_PATTERNS['pre-warning'] };
      }
    } else {
      // Too late for a full sentence: never say it late. The now cue follows.
      ep = { ...ep, prewarned: true, cancelled: true };
    }
  }

  return { memory: { episode: ep, ended }, action };
}

// ---------------------------------------------------------------------------
// Output plan (applies user toggle + platform availability)
// ---------------------------------------------------------------------------

export interface OutputPlan {
  /** Stop any speech in progress before anything else. */
  stopSpeech: boolean;
  speak: string | null;
  haptic: readonly HapticStep[] | null;
}

export function planOutput(
  action: GuidanceAction,
  opts: { voiceOn: boolean; hapticsOn: boolean },
): OutputPlan {
  if (action.type === 'none') return { stopSpeech: false, speak: null, haptic: null };
  if (action.type === 'cancel') return { stopSpeech: true, speak: null, haptic: null };
  return {
    // a new announcement interrupts the previous one (no overlapping voices)
    stopSpeech: opts.voiceOn,
    speak: opts.voiceOn ? action.textKo : null,
    haptic: opts.hapticsOn ? action.haptic : null,
  };
}

// ---------------------------------------------------------------------------
// TTS availability
// ---------------------------------------------------------------------------

export interface VoiceInfo {
  identifier: string;
  language: string;
  quality?: string;
}

/** Prefer an exact ko-KR voice, enhanced quality first; any "ko*" voice otherwise. */
export function pickKoreanVoice<V extends VoiceInfo>(voices: readonly V[]): V | null {
  const ko = voices.filter((v) => /^ko([-_]|$)/i.test(v.language));
  if (ko.length === 0) return null;
  const score = (v: V) =>
    (/^ko[-_]kr$/i.test(v.language) ? 2 : 0) + (String(v.quality ?? '').toLowerCase() === 'enhanced' ? 1 : 0);
  return [...ko].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export interface AvailabilityInput {
  flagOn: boolean;
  /** React Native Platform.OS */
  platform: string;
  /** web: window.speechSynthesis exists */
  speechApi: boolean;
  /** null when the voice list could not be read (error / timeout) */
  voices: readonly VoiceInfo[] | null;
}

export interface Availability {
  available: boolean;
  /** Voice identifier to pass to TTS (web only — native picks by language). */
  voiceId: string | null;
}

/**
 * - flag off → unavailable
 * - web: needs the Speech Synthesis API AND a listed Korean voice (otherwise
 *   the browser would read Korean with a foreign voice)
 * - native: unavailable only when the platform lists voices and none is Korean
 */
export function resolveAvailability(i: AvailabilityInput): Availability {
  if (!i.flagOn) return { available: false, voiceId: null };
  if (i.platform === 'web') {
    if (!i.speechApi || !i.voices) return { available: false, voiceId: null };
    const ko = pickKoreanVoice(i.voices);
    return ko ? { available: true, voiceId: ko.identifier } : { available: false, voiceId: null };
  }
  if (i.platform !== 'ios' && i.platform !== 'android') return { available: false, voiceId: null };
  if (i.voices && i.voices.length > 0 && !pickKoreanVoice(i.voices)) return { available: false, voiceId: null };
  return { available: true, voiceId: null };
}
