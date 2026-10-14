/**
 * SHARED CONTRACTS — single source of truth for every cross-task type and
 * service signature in the SUB WAY 2 STAND mobile app.
 *
 * Owner: integrator. Parallel tasks must NOT change these shapes; implement
 * against them. If a contract truly needs to change, coordinate first.
 *
 * Conventions
 * - Distances in metres (M), time in seconds (S), acceleration in m/s² (Ms2).
 * - Timestamps are ISO-8601 strings.
 * - "Travel frame" = left/right as seen by a passenger facing the direction
 *   of travel.
 * - Anything that is not a real live observation must be labeled through its
 *   `origin` / `source` field. Never present fixture or simulated data as live.
 *
 * Keep this file type-only (no runtime values) so it can be imported from
 * Node tests through `import type` without a bundler.
 */
import type { Train, TrainResponseStatus } from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Seoul API `updnLine`: "0" = 상행/내선, "1" = 하행/외선. */
export type DirectionCode = Train['directionCode'];
/** Turn direction of the track in the travel frame. */
export type TurnDirection = 'left' | 'right';
/** Direction the passenger's body is pushed (apparent inertial sway). */
export type SwayDirection = 'left' | 'right' | 'none';
export type Confidence = 'high' | 'medium' | 'low' | 'unavailable';
/** Inclusive numeric interval. `min <= max` always. */
export interface NumericRange {
  min: number;
  max: number;
}
/** Where a piece of train data came from. `fixture` = bundled example data. */
export type TrainDataOrigin = 'live' | 'fixture';

// ---------------------------------------------------------------------------
// Train data (mapped from the API `Train` returned by GET /api/subway/trains)
// ---------------------------------------------------------------------------

export interface TrainCandidate {
  /** Train number (`trainNo`). Stable while the train is in service. */
  id: string;
  line: number;
  /** Station the train was last observed at / approaching. */
  station: string;
  /** Korean direction label, e.g. 내선 / 외선 / 상행 / 하행. */
  direction: string;
  directionCode: DirectionCode;
  destination: string;
  /** Korean state label, e.g. 진입 / 도착 / 출발 / 전역출발. */
  state: string;
  stateCode: Train['stateCode'];
  observedAt: string;
  fresh: boolean;
  express: boolean;
  lastTrain: boolean;
  origin: TrainDataOrigin;
}

/** API status values plus `offline` (network/request failed on device). */
export type FeedStatusCode = TrainResponseStatus | 'offline';

export interface FeedStatus {
  status: FeedStatusCode;
  /** Korean, user-facing. */
  message: string;
  fetchedAt: string | null;
  cached: boolean;
  origin: TrainDataOrigin;
}

// ---------------------------------------------------------------------------
// Route data
// ---------------------------------------------------------------------------

export interface RouteStation {
  name: string;
  /** Approximate WGS84 coordinates (station-level, not track geometry). */
  lat: number;
  lon: number;
  /** 0-based order along the line in direction "1". */
  order: number;
}

export type CurveSource = 'station-geometry-approx' | 'curated' | 'synthetic';

export interface CurveFeature {
  id: string;
  /** Distance from the segment's `from` station to the curve entry. */
  startOffsetM: number;
  lengthM: number;
  radiusM: number;
  /** Turn direction in the travel frame of the owning segment. */
  turn: TurnDirection;
  /** Optional superelevation, radians, positive = banked toward curve inside. */
  cantRad?: number;
  source: CurveSource;
  confidence: Confidence;
}

export interface RouteSegment {
  id: string;
  /** Station names. Travel goes from → to. */
  from: string;
  to: string;
  directionCode: DirectionCode;
  lengthM: number;
  curves: CurveFeature[];
}

export interface RouteData {
  line: number;
  /** Korean line name, e.g. "2호선". */
  name: string;
  /** Circular line (e.g. line 2). */
  loop: boolean;
  stations: RouteStation[];
  segments: RouteSegment[];
  /** Provenance of the route geometry, shown to users. */
  origin: 'curated' | 'fixture';
  /** Short Korean note describing data provenance and limits. */
  sourceNote: string;
}

/** `into` = segment ending at the station; `outOf` = segment starting there. */
export type SegmentEnd = 'into' | 'outOf';

// ---------------------------------------------------------------------------
// Simulation + ride selection
// ---------------------------------------------------------------------------

export interface SimulationScenario {
  id: string;
  titleKo: string;
  summaryKo: string;
  /** Length of one simulated loop in seconds. */
  durationS: number;
}

export type RideSelection =
  | {
      kind: 'live';
      line: number;
      trainId: string;
      directionCode: DirectionCode;
      /** Snapshot taken when the user picked the train (for instant display). */
      initial: TrainCandidate;
      selectedAt: string;
    }
  | {
      kind: 'simulation';
      scenarioId: string;
      selectedAt: string;
    };

export interface RideSessionValue {
  selection: RideSelection | null;
  select: (selection: RideSelection) => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Forecast output
// ---------------------------------------------------------------------------

export type ForecastSource = 'live-estimate' | 'simulation';

export type SuppressReason =
  | 'flag-disabled'
  | 'no-selection'
  | 'loading'
  | 'feed-unavailable'
  | 'train-lost'
  | 'stale'
  | 'stationary'
  | 'delayed'
  | 'unknown-segment'
  | 'no-curve-ahead'
  | 'low-confidence'
  | 'invalid-input'
  | 'not-implemented';

export interface Forecast {
  state: 'active' | 'suppressed';
  source: ForecastSource;
  /** Segment the train is estimated to be on, if known. */
  segment: RouteSegment | null;
  /** Estimated train position along `segment`, metres from its `from` station. */
  positionM: NumericRange | null;
  targetCurve: CurveFeature | null;
  /** Passenger sway direction (opposite of the turn). `none` when suppressed. */
  sway: SwayDirection;
  /** Seconds until curve entry. null when suppressed. */
  etaWindowS: NumericRange | null;
  /** Lateral acceleration magnitude range, m/s². null when suppressed. */
  lateralAccelMs2: NumericRange | null;
  confidence: Confidence;
  /** Non-null exactly when `state === 'suppressed'`. */
  suppressReason: SuppressReason | null;
  /** Korean explanation lines ("why this forecast / why suppressed"). */
  explanationKo: string[];
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Voice guidance
// ---------------------------------------------------------------------------

export type GuidanceKind = 'pre-warning' | 'now' | 'suppressed';

export interface GuidanceEvent {
  kind: GuidanceKind;
  textKo: string;
  curveId: string | null;
  at: string;
}

export interface GuidanceState {
  /** User toggle. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** False when the flag is off or TTS is unavailable on this device. */
  available: boolean;
  lastEvent: GuidanceEvent | null;
}

// ---------------------------------------------------------------------------
// Service signatures (implemented in services/*; screens depend only on these)
// ---------------------------------------------------------------------------

export interface TrainCandidatesQuery {
  line: number;
  direction?: DirectionCode;
  station?: string;
}

export interface TrainCandidatesResult {
  candidates: TrainCandidate[];
  feed: FeedStatus;
  isLoading: boolean;
  refresh: () => void;
}

export interface TrackedTrainResult {
  /** Latest observation of the tracked train, or null if not (yet) seen. */
  train: TrainCandidate | null;
  feed: FeedStatus;
  isLoading: boolean;
  /** True when the train disappeared from the feed after being seen. */
  lost: boolean;
}

/** services/trains.ts */
export type UseTrainCandidates = (query: TrainCandidatesQuery) => TrainCandidatesResult;
/** services/trains.ts — pass trainId null to disable tracking. */
export type UseTrackedTrain = (line: number, trainId: string | null) => TrackedTrainResult;
/** services/trains.ts */
export type GetRoute = (line: number) => RouteData | null;
/** services/trains.ts */
export type FindSegment = (
  line: number,
  station: string,
  directionCode: DirectionCode,
  end: SegmentEnd,
) => RouteSegment | null;

/** services/simulation.ts — scenarios offered under "시뮬레이션으로 체험". */
export type ListSimulationScenarios = () => SimulationScenario[];
/** services/simulation.ts */
export type GetSimulationScenario = (id: string) => SimulationScenario | null;

/** services/forecast.ts — recomputes every second. */
export type UseForecast = (selection: RideSelection | null) => Forecast;

/** services/guidance.ts */
export type UseGuidance = (forecast: Forecast | null) => GuidanceState;
