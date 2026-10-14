/**
 * Phone-sensor gate for LIVE forecasts (pure). Owner: motion-sensing task.
 *
 * The live feed is station-level only, so a train that halts between stations
 * looks like a moving train until the estimator's own `delayed` bound runs
 * out. The phone can see the stop while it is happening. This gate uses that
 * to HOLD a live forecast; it never creates, moves or strengthens one, and it
 * never predicts a stop.
 *
 * Rules (applied every forecast tick):
 * - Simulation forecasts pass through untouched (the real phone has nothing
 *   to do with the simulated train) and the gate memory is cleared.
 * - Sensor not active (flag off, web, no sensor, permission denied,
 *   starting): pass through, memory cleared — no effect at all.
 * - A decisive reading = fresh, quality `good`, confidence ≥
 *   GATE_MIN_CONFIDENCE. Handling, low confidence or missing data are never
 *   decisive.
 * - Decisive `stationary` while the latest observation is 출발 / 전역출발
 *   (between stations): suppress as `stationary`, remembering the stop start.
 * - Decisive `stationary` while the observation is 진입 / 도착: normal dwell,
 *   no change.
 * - After a remembered between-station stop, decisive renewed motion: suppress
 *   as `delayed` — the estimate from the pre-stop observation no longer holds.
 * - The remembered stop is released only by a provider observation newer
 *   than the stop start (or a different train). Until then a non-decisive
 *   reading keeps the last hold (a contaminated window can neither confirm a
 *   restart nor end a stop).
 * - Forecasts the estimator already suppressed keep their own reason.
 *
 * Needs a small memory (like lib/guidanceRules.ts) because the `delayed`
 * hold depends on a stop that is already over. Returns the SAME memory object
 * when nothing changed, so a React state holder does not loop.
 *
 * Type-only imports from contracts so it runs under `node --test`.
 */
import type {
  Forecast,
  MotionSensorState,
  SuppressReason,
  TrainCandidate,
  TrainMotionState,
} from '@/contracts';

/** Minimum detector confidence for a stop / restart decision. Uncalibrated default. */
export const GATE_MIN_CONFIDENCE = 0.6;
/** A sensor reading older than this (vs the forecast time) is not decisive. */
export const SENSOR_STALE_MS = 3000;

const MOVING: ReadonlySet<TrainMotionState> = new Set(['moving', 'accelerating', 'decelerating', 'speed-changing']);
/** Seoul API stateCode: 0 진입, 1 도착, 2 출발, 3 전역출발. */
const BETWEEN_STATIONS: ReadonlySet<string> = new Set(['2', '3']);
const MAX_LINES = 4;

export interface HeldStop {
  trainId: string;
  line: number;
  /** Epoch ms when the phone's stillness evidence began. */
  stopStartMs: number;
  /** Epoch ms when renewed motion was confirmed; null while still stopped. */
  restartConfirmedMs: number | null;
}

export interface SensorGateMemory {
  held: HeldStop | null;
}

export const initialSensorGateMemory = (): SensorGateMemory => ({ held: null });

export type SensorGateEffect = 'none' | 'hold-stationary' | 'hold-delayed';

export interface SensorGateInput {
  forecast: Forecast;
  sensor: MotionSensorState;
  /** Latest observation of the tracked train (null when none). */
  observation: TrainCandidate | null;
  nowMs: number;
  memory: SensorGateMemory;
}

export interface SensorGateResult {
  forecast: Forecast;
  memory: SensorGateMemory;
  /** What the gate did to the forecast this tick. */
  effect: SensorGateEffect;
}

// ---------------------------------------------------------------------------
// Korean explanation lines
// ---------------------------------------------------------------------------

export const DETECTED_NOT_PREDICTED_KO = '정차를 예측한 것이 아니라 이미 일어난 정차를 휴대폰 센서로 감지한 결과입니다.';

const secondsKo = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
};

function observationLine(obs: TrainCandidate | null, nowMs: number): string {
  if (!obs) return '';
  const t = Date.parse(obs.observedAt);
  const age = Number.isFinite(t) ? ` · ${secondsKo(nowMs - t)} 전` : '';
  return `마지막 관측: ${obs.station}역 ${obs.state}${age}`;
}

function frozenLine(sensor: MotionSensorState): string {
  if (sensor.status === 'active' && sensor.quality === 'handling') {
    return '휴대폰을 들거나 움직이는 중이라 지금은 정차가 끝났는지 판단하지 않습니다.';
  }
  return '센서 신호가 불확실해 지금은 정차가 끝났는지 판단하지 않습니다.';
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

const sameHeld = (a: HeldStop | null, b: HeldStop | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.trainId === b.trainId &&
    a.line === b.line &&
    a.stopStartMs === b.stopStartMs &&
    a.restartConfirmedMs === b.restartConfirmedMs);

const withHeld = (memory: SensorGateMemory, held: HeldStop | null): SensorGateMemory =>
  sameHeld(memory.held, held) ? memory : { held };

function isoAt(ms: number): string {
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString();
}

/** A held forecast: no direction, no ETA, no position, confidence dropped. */
function holdForecast(f: Forecast, reason: Extract<SuppressReason, 'stationary' | 'delayed'>, lines: string[], nowMs: number): Forecast {
  return {
    ...f,
    state: 'suppressed',
    // The active forecast's segment is the one holding the target curve and
    // its position assumed a moving train; neither describes a stopped train.
    segment: null,
    positionM: null,
    targetCurve: null,
    sway: 'none',
    etaWindowS: null,
    lateralAccelMs2: null,
    confidence: 'unavailable',
    suppressReason: reason,
    explanationKo: lines.filter((l) => l.length > 0).slice(0, MAX_LINES),
    computedAt: isoAt(nowMs),
  };
}

export function applySensorGate(input: SensorGateInput): SensorGateResult {
  const { forecast, sensor, observation, nowMs, memory } = input;
  const pass = (m: SensorGateMemory): SensorGateResult => ({ forecast, memory: m, effect: 'none' });

  if (forecast.source !== 'live-estimate' || sensor.status !== 'active' || !Number.isFinite(nowMs)) {
    return pass(withHeld(memory, null));
  }

  let held = memory.held;
  // Another train: the remembered stop does not apply.
  if (held && observation && (observation.id !== held.trainId || observation.line !== held.line)) held = null;
  // A provider observation newer than the stop start: the estimator works from it again.
  if (held && observation) {
    const obsMs = Date.parse(observation.observedAt);
    if (Number.isFinite(obsMs) && obsMs > held.stopStartMs) held = null;
  }

  const decisive =
    nowMs - sensor.updatedAtMs <= SENSOR_STALE_MS &&
    sensor.quality === 'good' &&
    sensor.confidence >= GATE_MIN_CONFIDENCE;
  const stopped = decisive && sensor.state === 'stationary';
  const moving = decisive && MOVING.has(sensor.state);
  const between = !!observation && BETWEEN_STATIONS.has(observation.stateCode);

  let effect: SensorGateEffect = 'none';
  let lines: string[] = [];
  const obsLine = observationLine(observation, nowMs);

  if (stopped && between && observation) {
    const stopStartMs = sensor.stateSinceMs ?? nowMs;
    held = { trainId: observation.id, line: observation.line, stopStartMs, restartConfirmedMs: null };
    effect = 'hold-stationary';
    lines = [
      `휴대폰 동작 센서가 역 사이에서 멈춰 선 열차를 감지했습니다 (${secondsKo(nowMs - stopStartMs)}째).`,
      DETECTED_NOT_PREDICTED_KO,
      '정차 중에는 곡선 도달 시각을 알 수 없어 안내를 멈춥니다.',
      obsLine,
    ];
  } else if (held && moving) {
    if (held.restartConfirmedMs === null) held = { ...held, restartConfirmedMs: sensor.stateSinceMs ?? nowMs };
    effect = 'hold-delayed';
    lines = [
      '역 사이에서 멈췄던 열차가 다시 움직이는 것을 휴대폰 동작 센서가 확인했습니다.',
      '정차 때문에 마지막 관측 기준의 위치 추정이 더 이상 맞지 않아, 새 관측이 들어올 때까지 안내를 보류합니다.',
      DETECTED_NOT_PREDICTED_KO,
      obsLine,
    ];
  } else if (held && !decisive) {
    // Contaminated / uncertain window: keep the last hold, decide nothing.
    const restarted = held.restartConfirmedMs !== null;
    effect = restarted ? 'hold-delayed' : 'hold-stationary';
    lines = [
      restarted
        ? '역 사이 정차 뒤 위치 추정이 더 이상 맞지 않아, 새 관측이 들어올 때까지 안내를 보류합니다.'
        : '휴대폰 동작 센서가 역 사이에서 멈춰 선 열차를 감지했습니다.',
      frozenLine(sensor),
      DETECTED_NOT_PREDICTED_KO,
      obsLine,
    ];
  }
  // Otherwise: decisive stop at a station (normal dwell), decisive motion
  // without a remembered stop, or nothing remembered → no change.

  const nextMemory = withHeld(memory, held);
  if (effect === 'none' || forecast.state !== 'active') return pass(nextMemory);
  const reason = effect === 'hold-stationary' ? 'stationary' : 'delayed';
  return { forecast: holdForecast(forecast, reason, lines, nowMs), memory: nextMemory, effect };
}
