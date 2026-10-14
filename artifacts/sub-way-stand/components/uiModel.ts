/**
 * Pure view-model helpers for the two screens: Korean copy, status → tone mapping, list
 * filtering, lean angle and route-strip layout. Type-only imports so `node --test` can run it.
 */
import type {
  Confidence,
  CurveSource,
  DirectionCode,
  FeedStatus,
  Forecast,
  NumericRange,
  RouteSegment,
  SuppressReason,
  SwayDirection,
  TrainCandidate,
  TurnDirection,
} from '@/contracts';

export type ToneName = 'live' | 'synthetic' | 'warn' | 'danger' | 'muted';

/* ------------------------------------------------------------------ */
/* Feed status banner                                                  */
/* ------------------------------------------------------------------ */

export type FeedKind =
  | 'live'
  | 'cache'
  | 'simulation'
  | 'missing-key'
  | 'offline'
  | 'quota'
  | 'empty'
  | 'fixture';

export interface FeedBannerModel {
  kind: FeedKind;
  /** Short status word shown in the banner pill. */
  label: string;
  title: string;
  tone: ToneName;
  icon: 'radio' | 'database' | 'archive' | 'cpu' | 'key' | 'wifi-off' | 'clock' | 'moon' | 'file-text';
  /** A retry can plausibly change the outcome. */
  canRetry: boolean;
  /** Live data is unusable, so the simulation should be offered prominently. */
  suggestSimulation: boolean;
}

/**
 * Ride-screen badge for the tracked train's feed. Anything other than a fresh,
 * uncached live response (cache, degraded, quota, offline, …) is surfaced;
 * `null` while loading or for a fresh live response.
 */
export function rideFeedBadge(feed: FeedStatus | null, liveEnabled: boolean): FeedBannerModel | null {
  if (!feed) return null;
  const m = feedBanner(feed, liveEnabled);
  return m.kind === 'live' ? null : m;
}

export function feedBanner(feed: FeedStatus, liveEnabled: boolean): FeedBannerModel {
  if (!liveEnabled) {
    return {
      kind: 'simulation',
      label: '시뮬레이션',
      title: '시뮬레이션 모드',
      tone: 'synthetic',
      icon: 'cpu',
      canRetry: false,
      suggestSimulation: true,
    };
  }
  if (feed.origin === 'fixture') {
    return {
      kind: 'fixture',
      label: '예시 데이터',
      title: '실제 운행 정보가 아닙니다',
      tone: 'warn',
      icon: 'file-text',
      canRetry: true,
      suggestSimulation: true,
    };
  }
  switch (feed.status) {
    case 'live':
      return feed.cached
        ? {
            kind: 'cache',
            label: '캐시',
            title: '최근 응답을 재사용 중',
            tone: 'muted',
            icon: 'database',
            canRetry: true,
            suggestSimulation: false,
          }
        : {
            kind: 'live',
            label: '실시간',
            title: '역 단위 실시간 관측',
            tone: 'live',
            icon: 'radio',
            canRetry: true,
            suggestSimulation: false,
          };
    case 'degraded':
      return {
        kind: 'cache',
        label: '캐시',
        title: '연결이 불안정해 마지막 관측을 표시',
        tone: 'warn',
        icon: 'archive',
        canRetry: true,
        suggestSimulation: false,
      };
    case 'quota':
      return {
        kind: 'quota',
        label: feed.cached ? '캐시' : '호출 한도',
        title: '실시간 호출 한도에 도달',
        tone: 'warn',
        icon: 'clock',
        canRetry: false,
        suggestSimulation: !feed.cached,
      };
    case 'missing_key':
      return {
        kind: 'missing-key',
        label: '키 없음',
        title: '실시간 API 키가 설정되지 않음',
        tone: 'danger',
        icon: 'key',
        canRetry: false,
        suggestSimulation: true,
      };
    case 'empty':
      return {
        kind: 'empty',
        label: '운행 없음',
        title: '조회된 운행 열차가 없음',
        tone: 'muted',
        icon: 'moon',
        canRetry: true,
        suggestSimulation: true,
      };
    case 'unavailable':
    case 'offline':
    default:
      return {
        kind: 'offline',
        label: '연결 불가',
        title: '실시간 서버에 연결할 수 없음',
        tone: 'danger',
        icon: 'wifi-off',
        canRetry: true,
        suggestSimulation: true,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Candidate list                                                      */
/* ------------------------------------------------------------------ */

export type DirectionFilter = DirectionCode | 'all';

/** Station names are matched with or without a trailing "역". */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, '').replace(/역$/, '').toLowerCase();
}

/** Client-side filtering keeps typing instant and spends no live-API quota. */
export function filterCandidates(
  list: readonly TrainCandidate[],
  direction: DirectionFilter,
  query: string,
): TrainCandidate[] {
  const q = normalizeQuery(query);
  return list.filter((t) => {
    if (direction !== 'all' && t.directionCode !== direction) return false;
    if (!q) return true;
    return (
      t.station.replace(/\s+/g, '').toLowerCase().includes(q) ||
      t.destination.replace(/\s+/g, '').toLowerCase().includes(q) ||
      t.id.includes(q)
    );
  });
}

/** Where the train is relative to its reported station, in plain Korean. */
export function stateSentence(t: Pick<TrainCandidate, 'station' | 'state' | 'stateCode'>): string {
  switch (t.stateCode) {
    case '0':
      return `${t.station} 진입 중`;
    case '1':
      return `${t.station} 도착 · 정차`;
    case '2':
      return `${t.station} 출발`;
    case '3':
      return `${t.station} 전역 출발`;
    default:
      return `${t.station} ${t.state}`.trim();
  }
}

/* ------------------------------------------------------------------ */
/* Ride screen copy                                                    */
/* ------------------------------------------------------------------ */

export const SIDE_KO: Record<SwayDirection, string> = { left: '왼쪽', right: '오른쪽', none: '없음' };
export const TURN_KO: Record<TurnDirection, string> = { left: '좌곡선', right: '우곡선' };

export function confidenceBadge(c: Confidence): { label: string; tone: ToneName } {
  switch (c) {
    case 'high':
      return { label: '신뢰도 높음', tone: 'live' };
    case 'medium':
      return { label: '신뢰도 보통', tone: 'warn' };
    case 'low':
      return { label: '신뢰도 낮음', tone: 'warn' };
    default:
      return { label: '신뢰도 판단 불가', tone: 'muted' };
  }
}

export function sourceLabel(f: Pick<Forecast, 'source'>): { label: string; tone: ToneName } {
  return f.source === 'simulation'
    ? { label: '시뮬레이션 · 가상 선로', tone: 'synthetic' }
    : { label: '실시간 관측 기반 추정', tone: 'live' };
}

export const CURVE_SOURCE_KO: Record<CurveSource, string> = {
  'station-geometry-approx': '역 좌표 기반 근사',
  curated: '검수된 선형 자료',
  synthetic: '가상 곡선(시연용)',
};

export interface SuppressCopy {
  title: string;
  detail: string;
  icon: 'pause-circle' | 'loader' | 'wifi-off' | 'help-circle' | 'clock' | 'minus' | 'shield' | 'slash' | 'tool';
}

export function suppressCopy(reason: SuppressReason | null): SuppressCopy {
  switch (reason) {
    case 'stationary':
      return { title: '정차 중', detail: '안내 일시중지', icon: 'pause-circle' };
    case 'loading':
      return { title: '열차 위치 확인 중', detail: '잠시만 기다려 주세요', icon: 'loader' };
    case 'feed-unavailable':
      return { title: '실시간 연결 끊김', detail: '안내 일시중지', icon: 'wifi-off' };
    case 'train-lost':
      return { title: '열차 신호를 놓쳤어요', detail: '안내 일시중지', icon: 'help-circle' };
    case 'stale':
      return { title: '관측이 오래됐어요', detail: '안내 일시중지', icon: 'clock' };
    case 'delayed':
      return { title: '지연 운행 감지', detail: '도달 시각이 불확실해 안내 보류', icon: 'clock' };
    case 'unknown-segment':
      return { title: '구간 정보 없음', detail: '이 구간은 곡선 자료가 없어 안내하지 않아요', icon: 'help-circle' };
    case 'no-curve-ahead':
      return { title: '예고할 곡선 없음', detail: '안내 대기', icon: 'minus' };
    case 'low-confidence':
      return { title: '확신이 낮아 안내 보류', detail: '틀린 안내보다 침묵을 택했어요', icon: 'shield' };
    case 'invalid-input':
      return { title: '데이터 오류', detail: '안내 일시중지', icon: 'slash' };
    case 'flag-disabled':
      return { title: '흔들림 예측 꺼짐', detail: '설정에서 비활성화됨', icon: 'slash' };
    case 'not-implemented':
      return { title: '실시간 예측 준비 중', detail: '이 열차는 아직 안내하지 않아요', icon: 'tool' };
    case 'no-selection':
      return { title: '선택된 열차 없음', detail: '열차를 먼저 선택해 주세요', icon: 'help-circle' };
    default:
      return { title: '안내 일시중지', detail: '', icon: 'pause-circle' };
  }
}

/** "약 8–14초 후" — rounded, ordered, never negative. */
export function etaPhrase(eta: NumericRange): string {
  const lo = Math.max(0, Math.round(Math.min(eta.min, eta.max)));
  const hi = Math.max(0, Math.round(Math.max(eta.min, eta.max)));
  if (hi <= 0) return '지금';
  if (lo === hi) return `약 ${lo}초 후`;
  return `약 ${lo}–${hi}초 후`;
}

export type RidePhase = 'suppressed' | 'approach' | 'now';

/** "now" once the earliest plausible entry is within this many seconds. */
export const NOW_THRESHOLD_S = 2;

export function ridePhase(f: Pick<Forecast, 'state' | 'etaWindowS' | 'sway'>): RidePhase {
  if (f.state !== 'active' || f.sway === 'none') return 'suppressed';
  if (f.etaWindowS && f.etaWindowS.min <= NOW_THRESHOLD_S) return 'now';
  return 'approach';
}

/** Acceleration that maps to the maximum drawn lean, and that lean. */
export const LEAN_FULL_SCALE_MS2 = 0.8;
export const LEAN_MAX_DEG = 22;

/**
 * Lean of the passenger figure in degrees; + = top of body toward the right (clockwise).
 * Proportional to the lateral acceleration range so a wider range draws a wider ghost fan.
 */
export function leanDegrees(
  sway: SwayDirection,
  accel: NumericRange | null,
): { mid: number; min: number; max: number } {
  if (sway === 'none' || !accel) return { mid: 0, min: 0, max: 0 };
  const sign = sway === 'right' ? 1 : -1;
  const toDeg = (a: number) => sign * Math.min(LEAN_MAX_DEG, (Math.max(0, Math.abs(a)) / LEAN_FULL_SCALE_MS2) * LEAN_MAX_DEG);
  const lo = Math.min(accel.min, accel.max);
  const hi = Math.max(accel.min, accel.max);
  return { mid: toDeg((lo + hi) / 2), min: toDeg(lo), max: toDeg(hi) };
}

/* ------------------------------------------------------------------ */
/* Route strip                                                         */
/* ------------------------------------------------------------------ */

export type StationRole = 'prev' | 'current' | 'next';

export type TrainPlacement =
  | { on: 'into' | 'outOf'; offsetM: NumericRange }
  | { on: 'anchor' };

export interface StripInput {
  /** Segment that ends at the anchor station (shown on the left). */
  into: RouteSegment | null;
  /** Segment that starts at the anchor station (shown on the right). */
  outOf: RouteSegment | null;
  anchor: string;
  train: TrainPlacement | null;
  targetCurveId: string | null;
  /** Single segment spans the whole strip with no "unknown" gap. */
  fullWidth?: boolean;
}

export interface StripStation {
  name: string;
  role: StationRole;
  /** 0..1 across the strip. */
  x: number;
}

export interface StripCurve {
  id: string;
  turn: TurnDirection;
  x0: number;
  x1: number;
  radiusM: number;
  active: boolean;
}

export interface RouteStripModel {
  stations: StripStation[];
  curves: StripCurve[];
  /** Train marker: x plus the uncertainty band, all 0..1. */
  train: { x: number; band: [number, number] | null } | null;
  /** Spans (0..1) where no segment data exists, drawn dashed. */
  gaps: [number, number][];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Estimated placement from the station-level state when no positioned forecast exists. */
export function placementFromState(
  stateCode: string | null,
  into: RouteSegment | null,
  outOf: RouteSegment | null,
): TrainPlacement | null {
  const along = (seg: RouteSegment | null, on: 'into' | 'outOf', a: number, b: number): TrainPlacement | null =>
    seg ? { on, offsetM: { min: seg.lengthM * a, max: seg.lengthM * b } } : { on: 'anchor' };
  switch (stateCode) {
    case '0':
      return along(into, 'into', 0.75, 0.97);
    case '1':
      return { on: 'anchor' };
    case '2':
      return along(outOf, 'outOf', 0.02, 0.18);
    case '3':
      return along(into, 'into', 0.03, 0.35);
    default:
      return stateCode === null ? null : { on: 'anchor' };
  }
}

/** Lay out up to two consecutive segments around an anchor station. */
export function buildRouteStrip(input: StripInput): RouteStripModel | null {
  const { into, outOf, anchor, train, targetCurveId } = input;
  if (!into && !outOf) return null;

  // Proportional split (clamped for readability). With one known side, the other side is a
  // dashed gap — unless `fullWidth`, used for a single self-contained (e.g. synthetic) segment.
  const gaps: [number, number][] = [];
  const leftStart = 0;
  let leftEnd: number;
  let rightStart: number;
  let rightEnd = 1;
  if (into && outOf) {
    leftEnd = Math.max(0.32, Math.min(0.68, into.lengthM / (into.lengthM + outOf.lengthM)));
    rightStart = leftEnd;
  } else if (into) {
    leftEnd = input.fullWidth ? 1 : 0.72;
    rightStart = leftEnd;
    if (!input.fullWidth) gaps.push([leftEnd, 1]);
  } else {
    leftEnd = input.fullWidth ? 0 : 0.28;
    rightStart = leftEnd;
    if (!input.fullWidth) gaps.push([0, leftEnd]);
  }

  const stations: StripStation[] = [];
  if (into) stations.push({ name: into.from, role: 'prev', x: leftStart });
  stations.push({ name: anchor, role: 'current', x: into ? leftEnd : rightStart });
  if (outOf) stations.push({ name: outOf.to, role: 'next', x: rightEnd });

  const curves: StripCurve[] = [];
  const addCurves = (seg: RouteSegment, a: number, b: number) => {
    const span = b - a;
    for (const c of seg.curves) {
      const x0 = a + clamp01(c.startOffsetM / seg.lengthM) * span;
      const x1 = a + clamp01((c.startOffsetM + c.lengthM) / seg.lengthM) * span;
      curves.push({ id: c.id, turn: c.turn, x0, x1: Math.max(x1, x0 + 0.015), radiusM: c.radiusM, active: c.id === targetCurveId });
    }
  };
  if (into) addCurves(into, leftStart, leftEnd);
  if (outOf) addCurves(outOf, rightStart, rightEnd);

  let marker: RouteStripModel['train'] = null;
  if (train) {
    const anchorX = into ? leftEnd : rightStart;
    if (train.on === 'anchor') {
      marker = { x: anchorX, band: null };
    } else {
      const seg = train.on === 'into' ? into : outOf;
      const [a, b] = train.on === 'into' ? [leftStart, leftEnd] : [rightStart, rightEnd];
      if (seg && seg.lengthM > 0) {
        const lo = Math.min(train.offsetM.min, train.offsetM.max);
        const hi = Math.max(train.offsetM.min, train.offsetM.max);
        const map = (m: number) => a + clamp01(m / seg.lengthM) * (b - a);
        marker = { x: map((lo + hi) / 2), band: [map(lo), map(hi)] };
      } else {
        marker = { x: anchorX, band: null };
      }
    }
  }

  return { stations, curves, train: marker, gaps };
}
