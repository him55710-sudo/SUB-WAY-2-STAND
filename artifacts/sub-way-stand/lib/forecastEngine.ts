/**
 * Explainable curve-sway forecast engine (pure; no React / React Native).
 *
 * Live input is a station-level observation only (진입 / 도착 / 출발 /
 * 전역출발 + observation time). From it we bracket where the train is with
 * bounded dwell times and a bounded speed profile (lib/forecastProfile.ts),
 * give every curve ahead an entry-time window, and turn the first noticeable
 * one into the `Forecast` contract with Korean explanation lines.
 *
 * Conservative by design: anything we cannot bound honestly becomes a
 * suppressed forecast with a reason, never a guess. In particular a live
 * train never gets a sway direction from unverified geometry: the route must
 * be `curated` and the target curve's source `curated` (see
 * `isVerifiedCurve`). Approximate and synthetic curves are simulation-only.
 *
 * Output conventions (see contracts/index.ts):
 * - `segment` is the segment that contains `targetCurve` (the "segment
 *   ahead"); `positionM` is the train's estimated position along it, where
 *   0 means "at or before its from-station". When suppressed, `segment` /
 *   `positionM` describe the train's current segment estimate (if known).
 * - `etaWindowS` = seconds until curve entry, clamped at 0 ({0,0} = now).
 *
 * Value imports are relative with a `.ts` extension so `node --test` and
 * Metro both resolve them; contract types are type-only imports.
 */
import type {
  Confidence,
  CurveFeature,
  CurveSource,
  FindSegment,
  Forecast,
  ForecastSource,
  NumericRange,
  RouteData,
  RouteSegment,
  SuppressReason,
  TrainCandidate,
} from '@/contracts';
import {
  COMFORT_THRESHOLD_MS2,
  MAX_CANT_RAD,
  lateralAccelBand,
  msToKmh,
  signedCant,
  signedCurvature,
} from './physics.ts';
import { SPEED_BAND, makeProfile, minSpeedOver, peakSpeedOver, positionAt, timeAt } from './forecastProfile.ts';
import type { Profile } from './forecastProfile.ts';

// ---------------------------------------------------------------------------
// Model bounds
// ---------------------------------------------------------------------------

/** Older observations are stale (same limit as the server's freshness check). */
export const STALE_AFTER_S = 120;
/** Observation timestamps further in the future than this are invalid. */
export const FUTURE_SKEW_S = 90;
/** "출발" can be reported up to this long after the train started moving. */
export const DEPARTURE_LAG_S = 5;
/** After "진입" the train stops at the platform within this many seconds. */
export const ARRIVE_AFTER_ENTRY_S = Object.freeze({ min: 5, max: 15 });
/** Bounded station dwell time. */
export const DWELL_S = Object.freeze({ min: 20, max: 40 });
/**
 * Unobserved holds (signals, crowding): for every second since the last
 * observation the train may have lost up to this many seconds. Widens the
 * late side of every window as the observation ages.
 */
export const HOLD_RATE = 0.25;
/** Wider ETA windows are not shown at all. */
export const MAX_ACTIVE_SPREAD_S = 30;
/** ETA spread (s) up to which confidence may be high / medium. */
export const SPREAD_CONFIDENCE_S = Object.freeze({ high: 5, medium: 10 });
/** Observation age (s) up to which confidence may be high / medium. */
export const AGE_CONFIDENCE_S = Object.freeze({ high: 30, medium: 60 });
/** Segments examined ahead of the train (current + next). */
export const LOOKAHEAD_SEGMENTS = 2;

// ---------------------------------------------------------------------------
// Labels + small helpers
// ---------------------------------------------------------------------------

export const CONFIDENCE_KO: Record<Confidence, string> = {
  high: '높음',
  medium: '중간',
  low: '낮음',
  unavailable: '없음',
};
export const CURVE_SOURCE_KO: Record<CurveSource, string> = {
  'station-geometry-approx': '역 좌표 기반 근사',
  'osm-centerline': 'OpenStreetMap 실제 선로 중심선(미검증)',
  curated: '정리된 선로 자료',
  synthetic: '가상(합성) 곡선',
};
const TURN_KO = { left: '좌', right: '우' } as const;
const SWAY_KO = { left: '왼쪽', right: '오른쪽' } as const;
const MAX_LINES = 4;

const RANK: Record<Confidence, number> = { unavailable: 0, low: 1, medium: 2, high: 3 };

export function minConfidence(...levels: Confidence[]): Confidence {
  return levels.reduce<Confidence>((lo, c) => (RANK[c] < RANK[lo] ? c : lo), 'high');
}

/** `unavailable` = too wide to show. */
export function spreadConfidence(spreadS: number): Confidence {
  if (!Number.isFinite(spreadS) || spreadS < 0 || spreadS > MAX_ACTIVE_SPREAD_S) return 'unavailable';
  if (spreadS <= SPREAD_CONFIDENCE_S.high) return 'high';
  if (spreadS <= SPREAD_CONFIDENCE_S.medium) return 'medium';
  return 'low';
}

export function ageConfidence(ageS: number): Confidence {
  if (ageS <= AGE_CONFIDENCE_S.high) return 'high';
  if (ageS <= AGE_CONFIDENCE_S.medium) return 'medium';
  return 'low';
}

const range = (min: number, max: number): NumericRange => ({ min, max });
/** Round OUTWARD: displaying a range must never exclude its raw bounds. */
export const outwardRange = (r: NumericRange, digits: number): NumericRange => {
  const scale = 10 ** digits;
  return range(Math.floor(r.min * scale) / scale, Math.ceil(r.max * scale) / scale);
};
const roundRange = (r: NumericRange) => outwardRange(r, 1);
const finitePositive = (x: number) => Number.isFinite(x) && x > 0;
const fmtRange = (r: NumericRange, f: (x: number) => string) => {
  const a = f(r.min);
  const b = f(r.max);
  return a === b ? a : `${a}–${b}`;
};
const kmh = (v: number) => String(Math.round(msToKmh(v)));
const ms2 = (a: number) => a.toFixed(2);

export function formatAgeKo(ageS: number): string {
  const s = Math.max(0, Math.round(ageS));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m}분` : `${m}분 ${rest}초`;
}

/** Segment + curves are usable for physics. Curves may not start outside the segment. */
export function validSegment(seg: RouteSegment | null | undefined): boolean {
  if (!seg || !finitePositive(seg.lengthM) || !Array.isArray(seg.curves)) return false;
  return seg.curves.every(
    (c) =>
      Number.isFinite(c.startOffsetM) &&
      c.startOffsetM >= 0 &&
      c.startOffsetM <= seg.lengthM &&
      Number.isFinite(c.lengthM) &&
      c.lengthM > 0 &&
      c.startOffsetM + c.lengthM <= seg.lengthM &&
      finitePositive(c.radiusM) &&
      (c.turn === 'left' || c.turn === 'right') &&
      (c.cantRad === undefined || (Number.isFinite(c.cantRad) && Math.abs(c.cantRad) <= MAX_CANT_RAD)),
  );
}

/**
 * Geometry a LIVE forecast may announce from: curated route data and a
 * curated curve. `station-geometry-approx` (inferred from station
 * coordinates) and `synthetic` (invented) curves are never verified.
 */
export function isVerifiedCurve(curve: CurveFeature, route: Pick<RouteData, 'origin'> | null): boolean {
  return route?.origin === 'curated' && curve.source === 'curated';
}

/** Keeps the newest observation of a train (ignores out-of-order older ones). */
export function newerObservation(
  prev: TrainCandidate | null,
  next: TrainCandidate | null,
): TrainCandidate | null {
  if (!next) return prev;
  if (!prev || prev.id !== next.id || prev.line !== next.line) return next;
  const a = Date.parse(prev.observedAt);
  const b = Date.parse(next.observedAt);
  if (!Number.isFinite(a)) return next;
  if (!Number.isFinite(b)) return prev;
  return b >= a ? next : prev;
}

// ---------------------------------------------------------------------------
// Forecast builders shared by live + simulation
// ---------------------------------------------------------------------------

export function suppressedForecast(args: {
  source: ForecastSource;
  reason: SuppressReason;
  lines: string[];
  nowMs: number;
  segment?: RouteSegment | null;
  positionM?: NumericRange | null;
}): Forecast {
  return {
    state: 'suppressed',
    source: args.source,
    segment: args.segment ?? null,
    positionM: args.positionM ?? null,
    targetCurve: null,
    sway: 'none',
    etaWindowS: null,
    lateralAccelMs2: null,
    confidence: 'unavailable',
    suppressReason: args.reason,
    explanationKo: args.lines.filter((l) => l.length > 0).slice(0, MAX_LINES),
    computedAt: isoAt(args.nowMs),
  };
}

function isoAt(nowMs: number): string {
  const d = new Date(Number.isFinite(nowMs) ? nowMs : 0);
  return d.toISOString();
}

/** Errors never escape: they become a suppressed forecast. */
export function safeForecast(source: ForecastSource, nowMs: number, compute: () => Forecast): Forecast {
  try {
    return compute();
  } catch {
    return suppressedForecast({
      source,
      reason: 'invalid-input',
      lines: [
        source === 'simulation' ? '[시뮬레이션] 예측 계산 중 오류가 발생했습니다.' : '예측 계산 중 오류가 발생했습니다.',
        '잘못된 안내를 피하기 위해 예측을 표시하지 않습니다.',
      ],
      nowMs,
    });
  }
}

export type CurveCandidate = {
  segment: RouteSegment;
  curve: CurveFeature;
  /** Seconds until curve entry, clamped at 0. */
  etaS: NumericRange;
  /** Speed envelope over the ENTIRE curve (entry through exit), m/s. */
  speedMs: NumericRange;
  /** Train position along `segment`. */
  positionM: NumericRange;
  /** Curve lies beyond the segment the train is on now. */
  nextSegment: boolean;
};

export type CandidateContext = {
  source: ForecastSource;
  nowMs: number;
  /** Extra confidence cap (observation age); `high` = no cap. */
  confidenceCap: Confidence;
  /**
   * When set, any curve ahead that fails this check holds the forecast
   * (no direction). Live estimates pass `isVerifiedCurve`; simulation omits it.
   */
  requireVerified?: (curve: CurveFeature) => boolean;
  /** First line of every explanation (e.g. the simulation label). */
  headerKo?: string;
  /** "근거" line for an active forecast. */
  evidenceKo: (curve: CurveFeature) => string;
  /** Optional last line for an active forecast (dropped when 4 lines are used). */
  noteKo?: string;
  /** Context appended to suppression lines (e.g. the observation). */
  contextKo: string[];
  /** Message when no curve is ahead. */
  noCurveKo: string;
  /** Train's current segment estimate, used when suppressed. */
  current: { segment: RouteSegment | null; positionM: NumericRange | null };
};

function curveLabel(c: CurveCandidate): string {
  const prefix = c.nextSegment ? '다음 ' : '';
  return `${prefix}${c.segment.from}→${c.segment.to} 구간 ${Math.round(c.curve.startOffsetM)}m 지점 반경 ${Math.round(c.curve.radiusM)}m ${TURN_KO[c.curve.turn]}곡선`;
}

/**
 * Picks the first noticeable curve among time-ordered candidates and builds
 * the contract forecast (or a suppressed one with a Korean reason).
 */
export function forecastFromCandidates(cands: CurveCandidate[], ctx: CandidateContext): Forecast {
  const head = ctx.headerKo ? [ctx.headerKo] : [];
  const sup = (reason: SuppressReason, lines: string[]) =>
    suppressedForecast({
      source: ctx.source,
      reason,
      lines: [...head, ...lines, ...ctx.contextKo],
      nowMs: ctx.nowMs,
      segment: ctx.current.segment,
      positionM: ctx.current.positionM,
    });

  let weakMax: number | null = null;
  for (const cand of cands) {
    const { curve } = cand;
    const validRange = (r: NumericRange) =>
      Number.isFinite(r.min) && Number.isFinite(r.max) && r.min >= 0 && r.max >= r.min;
    if (!validSegment(cand.segment) || !validRange(cand.speedMs) || !validRange(cand.etaS)
      || !validRange(cand.positionM)) {
      return sup('invalid-input', ['곡선의 속도·위치·도달 시각 범위가 유효하지 않아 안내하지 않습니다.']);
    }
    if (ctx.requireVerified && !ctx.requireVerified(curve)) {
      return sup('low-confidence', [
        `${curveLabel(cand)}: 검증된 선로 형상이 아닙니다(${CURVE_SOURCE_KO[curve.source]}).`,
        '실시간 열차에는 검증된 곡선 자료가 있을 때만 쏠림 방향을 안내합니다.',
      ]);
    }
    if (ctx.source === 'live-estimate' && curve.cantRad === undefined) {
      return sup('low-confidence', [
        `${curveLabel(cand)}: 캔트(선로 기울기) 자료가 없습니다.`,
        '캔트 미상을 0으로 단정하면 쏠림 방향이 뒤바뀔 수 있어 안내를 보류합니다.',
      ]);
    }
    const kappa = signedCurvature(curve.radiusM, curve.turn);
    const band = lateralAccelBand(
      cand.speedMs.min,
      cand.speedMs.max,
      kappa,
      signedCant(curve.cantRad, curve.turn),
    );
    if (band.ambiguous) {
      return sup('low-confidence', [
        `${curveLabel(cand)}: 곡선 진입·이탈 속도와 캔트에 따라 쏠림 방향이 바뀌거나 미약할 수 있습니다.`,
        '방향이 불확실해 안내하지 않습니다.',
      ]);
    }
    if (band.sway === 'none' || band.max < COMFORT_THRESHOLD_MS2) {
      weakMax = Math.max(weakMax ?? 0, band.max);
      continue;
    }
    if (curve.confidence === 'unavailable') {
      return sup('low-confidence', [`${curveLabel(cand)}: 곡선 자료의 신뢰도를 알 수 없어 안내하지 않습니다.`]);
    }
    const etaS = outwardRange(cand.etaS, 1);
    const spreadLevel = spreadConfidence(cand.etaS.max - cand.etaS.min);
    if (spreadLevel === 'unavailable') {
      return sup('low-confidence', [
        `${curveLabel(cand)}까지 도달 시각 범위가 ${Math.round(etaS.min)}–${Math.round(etaS.max)}초로 너무 넓습니다.`,
        `범위가 ${MAX_ACTIVE_SPREAD_S}초를 넘으면 안내하지 않습니다.`,
      ]);
    }
    const sway = band.sway;
    const accel = outwardRange(band, 2);
    const cantNote = curve.cantRad !== undefined ? ' (캔트 반영)' : ' (캔트 미상·0 가정)';
    const lines = [
      ...head,
      `${curveLabel(cand)} → 승객은 ${SWAY_KO[sway]}으로 쏠림`,
      `가정 속도 ${fmtRange(cand.speedMs, kmh)}km/h → 횡가속도 ${fmtRange(accel, ms2)} m/s²${cantNote}`,
      ctx.evidenceKo(curve),
      ...(ctx.noteKo ? [ctx.noteKo] : []),
    ].slice(0, MAX_LINES);
    return {
      state: 'active',
      source: ctx.source,
      segment: cand.segment,
      positionM: roundRange(cand.positionM),
      targetCurve: curve,
      sway,
      etaWindowS: etaS,
      lateralAccelMs2: accel,
      confidence: minConfidence(curve.confidence, spreadLevel, ctx.confidenceCap),
      suppressReason: null,
      explanationKo: lines,
      computedAt: isoAt(ctx.nowMs),
    };
  }
  if (weakMax !== null) {
    return sup('no-curve-ahead', [
      `앞 곡선의 모델 횡가속도가 최대 ${ms2(weakMax)} m/s²로 안내 표시 기준(${COMFORT_THRESHOLD_MS2} m/s²) 미만입니다.`,
      '앱의 표시 기준이며 인체의 체감·안전 한계를 의미하지 않습니다.',
    ]);
  }
  return sup('no-curve-ahead', [ctx.noCurveKo]);
}

// ---------------------------------------------------------------------------
// Live estimate
// ---------------------------------------------------------------------------

export type LiveForecastInput = {
  /** Newest observation of the selected train. */
  train: TrainCandidate | null;
  nowMs: number;
  /** Route data for the train's line from the trains service (null = none). */
  route: Pick<RouteData, 'origin' | 'sourceNote'> | null;
  findSegment: FindSegment;
  /** Train disappeared from the feed after being seen. */
  lost?: boolean;
};

type Leg = { segment: RouteSegment; depart: NumericRange; fast: Profile; slow: Profile };

function makeLeg(segment: RouteSegment, depart: NumericRange): Leg {
  return {
    segment,
    depart,
    fast: makeProfile(segment.lengthM, SPEED_BAND.fast),
    slow: makeProfile(segment.lengthM, SPEED_BAND.slow),
  };
}

/** Where the train is along a leg now (0 = not departed yet). */
function positionOnLeg(leg: Leg): NumericRange {
  return range(positionAt(leg.slow, -leg.depart.max), positionAt(leg.fast, -leg.depart.min));
}

export function computeLiveForecast(input: LiveForecastInput): Forecast {
  const { train, nowMs } = input;
  const source: ForecastSource = 'live-estimate';
  const sup = (
    reason: SuppressReason,
    lines: string[],
    where?: { segment: RouteSegment | null; positionM: NumericRange | null },
  ) => suppressedForecast({ source, reason, lines, nowMs, ...where });

  if (input.lost) {
    return sup('train-lost', [
      '선택한 열차가 실시간 목록에서 사라졌습니다.',
      '운행 종료 또는 관측 누락일 수 있어 예측을 멈춥니다.',
    ]);
  }
  if (!train) return sup('feed-unavailable', ['열차 관측 정보를 받을 수 없어 예측하지 않습니다.']);

  const tag = train.origin === 'fixture' ? '[예시·실제 아님] ' : '';
  const obsMs = Date.parse(train.observedAt);
  if (!Number.isFinite(obsMs) || !Number.isFinite(nowMs)) {
    return sup('invalid-input', ['관측 시각을 해석할 수 없어 예측하지 않습니다.', `${tag}관측: ${train.station} ${train.state}`]);
  }
  const rawAge = (nowMs - obsMs) / 1000;
  if (rawAge < -FUTURE_SKEW_S) {
    return sup('invalid-input', ['관측 시각이 현재보다 미래로 기록되어 있어 예측하지 않습니다.']);
  }
  const age = Math.max(0, rawAge);
  const obsLine = `${tag}관측: ${train.station} ${train.state} · ${formatAgeKo(age)} 전`;

  if (age > STALE_AFTER_S) {
    return sup('stale', [`마지막 관측 후 ${formatAgeKo(age)}이 지나 현재 위치를 알 수 없습니다.`, obsLine]);
  }

  const { line, station, directionCode: dir, stateCode } = train;
  if (stateCode !== '0' && stateCode !== '1' && stateCode !== '2' && stateCode !== '3') {
    return sup('unknown-segment', ['열차 운행 상태(진입·도착·출발)를 알 수 없어 위치를 추정하지 않습니다.', obsLine]);
  }
  const route = input.route;
  if (!route) {
    return sup('unknown-segment', [`${line}호선 선로·곡선 데이터가 없어 예측하지 않습니다.`, obsLine]);
  }
  if (stateCode === '1') {
    const out = input.findSegment(line, station, dir, 'outOf');
    return sup(
      'stationary',
      [`열차가 ${station}역에 도착해 정차 중입니다(도착).`, '출발이 관측되면 예측을 다시 시작합니다.', obsLine],
      out && validSegment(out) ? { segment: out, positionM: range(0, 0) } : undefined,
    );
  }

  // Timeline of the observed state, as departure-time windows relative to now (s).
  const hold = HOLD_RATE * age;
  let first: RouteSegment | null;
  let depart: NumericRange;
  if (stateCode === '3') {
    // 전역출발: left the previous station, now on the segment into `station`.
    first = input.findSegment(line, station, dir, 'into');
    depart = range(-age - DEPARTURE_LAG_S, -age + hold);
  } else if (stateCode === '2') {
    // 출발: left `station`, now on the segment out of it.
    first = input.findSegment(line, station, dir, 'outOf');
    depart = range(-age - DEPARTURE_LAG_S, -age + hold);
  } else {
    // 진입: entering `station`; it stops, dwells, then departs onto the next segment.
    first = input.findSegment(line, station, dir, 'outOf');
    depart = range(
      -age + ARRIVE_AFTER_ENTRY_S.min + DWELL_S.min,
      -age + ARRIVE_AFTER_ENTRY_S.max + DWELL_S.max + hold,
    );
  }
  if (!first) {
    return sup('unknown-segment', [`${station}역 ${stateCode === '3' ? '도착 전' : '출발 후'} 구간의 선로 데이터가 없습니다.`, obsLine]);
  }
  if (!validSegment(first)) {
    return sup('invalid-input', [`${first.from}→${first.to} 구간 데이터가 유효하지 않아 예측하지 않습니다.`, obsLine]);
  }

  const legs: Leg[] = [makeLeg(first, depart)];
  while (legs.length < LOOKAHEAD_SEGMENTS) {
    const prev = legs[legs.length - 1]!;
    const next = input.findSegment(line, prev.segment.to, dir, 'outOf');
    if (!next || !validSegment(next)) break;
    legs.push(
      makeLeg(
        next,
        range(
          prev.depart.min + prev.fast.totalTime + DWELL_S.min,
          prev.depart.max + prev.slow.totalTime + DWELL_S.max,
        ),
      ),
    );
  }

  let currentIdx = legs.findIndex((leg) => positionOnLeg(leg).min < leg.segment.lengthM);
  if (currentIdx < 0) currentIdx = legs.length - 1;
  const currentLeg = legs[currentIdx]!;
  const current = { segment: currentLeg.segment, positionM: roundRange(positionOnLeg(currentLeg)) };

  // Fixture / unverified route data never drives a live direction (LIVE + HOLD).
  if (route.origin !== 'curated') {
    return sup(
      'low-confidence',
      [
        '노선 곡선 자료가 검증된 선로 형상이 아닙니다(예시 데이터).',
        '실시간 열차에는 쏠림 방향을 안내하지 않고 예측을 보류합니다.',
        obsLine,
      ],
      current,
    );
  }

  const cands: CurveCandidate[] = [];
  legs.forEach((leg, i) => {
    const L = leg.segment.lengthM;
    const curves = [...leg.segment.curves].sort((a, b) => a.startOffsetM - b.startOffsetM);
    for (const curve of curves) {
      const start = curve.startOffsetM;
      const end = Math.min(L, start + curve.lengthM);
      const latestExit = leg.depart.max + timeAt(leg.slow, end);
      if (latestExit < 0) continue; // surely passed
      const entryMin = leg.depart.min + timeAt(leg.fast, start);
      const entryMax = leg.depart.max + timeAt(leg.slow, start);
      cands.push({
        segment: leg.segment,
        curve,
        etaS: range(Math.max(0, entryMin), Math.max(0, entryMax)),
        speedMs: range(minSpeedOver(leg.slow, start, end), peakSpeedOver(leg.fast, start, end)),
        positionM: positionOnLeg(leg),
        nextSegment: i > currentIdx,
      });
    }
  });

  const curveConf = (c: CurveFeature) => `곡선 자료 ${CURVE_SOURCE_KO[c.source]}·신뢰도 ${CONFIDENCE_KO[c.confidence]}`;
  const sourceLabel = train.origin === 'live' ? '실시간' : '예시(실제 아님)';
  let noteKo: string | undefined;
  if (age > AGE_CONFIDENCE_S.high) {
    noteKo = `관측 후 ${formatAgeKo(age)} 경과 — 늦어질 가능성만큼 도달 시각 범위를 넓혔습니다.`;
  } else if (stateCode === '0') {
    noteKo = `${station}역 정차 시간(${DWELL_S.min}–${DWELL_S.max}초)을 포함한 추정입니다.`;
  }

  return forecastFromCandidates(cands, {
    source,
    nowMs,
    confidenceCap: ageConfidence(age),
    requireVerified: (c) => isVerifiedCurve(c, route),
    evidenceKo: (c) => `근거: ${sourceLabel} 역 단위 관측 '${station} ${train.state}'(${formatAgeKo(age)} 전) · ${curveConf(c)}`,
    noteKo,
    contextKo: [obsLine],
    noCurveKo: `${legs.map((l) => `${l.segment.from}→${l.segment.to}`).join(', ')} 구간에 남은 곡선이 없습니다.`,
    current,
  });
}
