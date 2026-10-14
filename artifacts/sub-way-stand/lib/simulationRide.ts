/**
 * Deterministic simulated ride (pure; no React / React Native).
 *
 * One station-to-station run on a Line 2 segment from the route data — or the
 * built-in invented SYN-A segment when no curved route segment exists:
 *   stopped at the first station → accelerate → cruise → curve(s) → brake →
 *   stopped at the next station → repeat.
 * The simulated position is known, so the forecast only carries small
 * assumed position / speed errors. Every output is labeled `simulation`.
 */
import type { CurveFeature, Forecast, NumericRange, RouteData, RouteSegment } from '@/contracts';
import { SYN_A, findCurves, msToKmh, trackLength } from './physics.ts';
import { makeProfile, minSpeedOver, peakSpeedOver, positionAt, speedAt, timeAt } from './forecastProfile.ts';
import type { Profile, ProfileParams } from './forecastProfile.ts';
import {
  CONFIDENCE_KO,
  CURVE_SOURCE_KO,
  forecastFromCandidates,
  safeForecast,
  suppressedForecast,
  validSegment,
} from './forecastEngine.ts';
import type { CurveCandidate } from './forecastEngine.ts';

export const SIM_PROFILE: Readonly<ProfileParams> = Object.freeze({ accel: 0.8, cruise: 16, brake: 0.9 });
export const SIM_TIMING = Object.freeze({ dwellStartS: 8, dwellEndS: 8 });
/** Assumed errors in the simulated forecast (the simulated truth is exact). */
export const SIM_UNCERTAINTY = Object.freeze({ positionM: 10, speedMs: 1, etaFrac: 0.1, etaBaseS: 0.5 });

/** Invented segment from the SYN-A demo track (left R450, then right R300). Not a real track. */
export const SYNTHETIC_SEGMENT: RouteSegment = Object.freeze({
  id: 'SYN-A',
  from: '가상 A역',
  to: '가상 B역',
  directionCode: '1',
  lengthM: trackLength(SYN_A),
  curves: findCurves(SYN_A).map(
    (c): CurveFeature => ({
      id: `${SYN_A.id}-${c.id}`,
      startOffsetM: c.start,
      lengthM: c.end - c.start,
      radiusM: c.radius,
      turn: c.turn,
      source: 'synthetic',
      confidence: 'low',
    }),
  ),
}) as RouteSegment;

export type SimRide = {
  segment: RouteSegment;
  /** e.g. "2호선 강남→역삼" or "가상 구간 SYN-A". */
  label: string;
  usesRouteData: boolean;
  profile: Profile;
  runStartS: number;
  runEndS: number;
  /** One loop, whole seconds. */
  durationS: number;
};

/** Prefer an actual mapped centerline; otherwise choose a segment with the most curves. */
export function pickSimulationSegment(route: RouteData | null): {
  segment: RouteSegment;
  label: string;
  usesRouteData: boolean;
} {
  const score = (s: RouteSegment) =>
    (s.curves.every((c) => c.source === 'osm-centerline') ? 100 : 0) +
    s.curves.length + (new Set(s.curves.map((c) => c.turn)).size > 1 ? 0.5 : 0);
  let best: RouteSegment | null = null;
  for (const seg of route?.segments ?? []) {
    if (!validSegment(seg) || seg.curves.length === 0) continue;
    if (!best || score(seg) > score(best)) best = seg;
  }
  if (!route || !best) return { segment: SYNTHETIC_SEGMENT, label: '가상 구간 SYN-A', usesRouteData: false };
  return { segment: best, label: `${route.name} ${best.from}→${best.to}`, usesRouteData: true };
}

export function buildSimRide(route: RouteData | null): SimRide {
  const pick = pickSimulationSegment(route);
  const profile = makeProfile(pick.segment.lengthM, SIM_PROFILE);
  const runStartS = SIM_TIMING.dwellStartS;
  const runEndS = runStartS + profile.totalTime;
  return { ...pick, profile, runStartS, runEndS, durationS: Math.ceil(runEndS + SIM_TIMING.dwellEndS) };
}

export type SimPhase = 'dwell-start' | 'run' | 'dwell-end';
export type SimState = { t: number; phase: SimPhase; positionM: number; speedMs: number };

/** Simulated truth at `elapsedS` (loops every `durationS`). */
export function simState(ride: SimRide, elapsedS: number): SimState {
  const D = ride.durationS;
  const e = Number.isFinite(elapsedS) ? elapsedS : 0;
  const t = ((e % D) + D) % D;
  if (t < ride.runStartS) return { t, phase: 'dwell-start', positionM: 0, speedMs: 0 };
  if (t >= ride.runEndS) return { t, phase: 'dwell-end', positionM: ride.segment.lengthM, speedMs: 0 };
  const s = positionAt(ride.profile, t - ride.runStartS);
  return { t, phase: 'run', positionM: s, speedMs: speedAt(ride.profile, s) };
}

const range = (min: number, max: number): NumericRange => ({ min, max });

export function simulateForecast(ride: SimRide, elapsedS: number, nowMs: number): Forecast {
  return safeForecast('simulation', nowMs, () => {
    const st = simState(ride, elapsedS);
    const seg = ride.segment;
    const L = seg.lengthM;
    const header = `[시뮬레이션] ${ride.label} 가상 주행 — 실제 열차와 무관`;

    if (st.phase !== 'run') {
      const atStart = st.phase === 'dwell-start';
      return suppressedForecast({
        source: 'simulation',
        reason: 'stationary',
        lines: [
          header,
          atStart ? `${seg.from}역 정차 중 — 곧 출발합니다.` : `${seg.to}역에 도착해 정차했습니다.`,
          '정차 중에는 흔들림 예측을 표시하지 않습니다.',
        ],
        nowMs,
        segment: seg,
        positionM: atStart ? range(0, 0) : range(L, L),
      });
    }

    const U = SIM_UNCERTAINTY;
    const tRun = st.t - ride.runStartS;
    const s = st.positionM;
    const positionM = range(Math.max(0, s - U.positionM), Math.min(L, s + U.positionM));
    const cands: CurveCandidate[] = [];
    for (const curve of [...seg.curves].sort((a, b) => a.startOffsetM - b.startOffsetM)) {
      const start = curve.startOffsetM;
      const end = Math.min(L, start + curve.lengthM);
      if (timeAt(ride.profile, end) < tRun) continue; // passed
      const eta = timeAt(ride.profile, start) - tRun;
      const margin = U.etaBaseS + U.etaFrac * Math.max(0, eta);
      const vPeak = peakSpeedOver(ride.profile, start, end);
      const vMin = minSpeedOver(ride.profile, start, end);
      cands.push({
        segment: seg,
        curve,
        etaS: eta <= 0 ? range(0, 0) : range(Math.max(0, eta - margin), eta + margin),
        speedMs: range(Math.max(0, vMin - U.speedMs), vPeak + U.speedMs),
        positionM,
        nextSegment: false,
      });
    }

    const braking = s > L - ride.profile.brakeDist;
    const nowLine = `현재 ${Math.round(msToKmh(st.speedMs))}km/h · ${seg.from}에서 ${Math.round(s)}m`;
    return forecastFromCandidates(cands, {
      source: 'simulation',
      nowMs,
      confidenceCap: 'high',
      headerKo: header,
      evidenceKo: (c) =>
        `곡선 자료: ${CURVE_SOURCE_KO[c.source]}(신뢰도 ${CONFIDENCE_KO[c.confidence]}) · ${nowLine}`,
      contextKo: [nowLine],
      noCurveKo: `남은 구간에 곡선이 없습니다 — ${seg.to}역을 향해 ${braking ? '감속' : '주행'} 중.`,
      current: { segment: seg, positionM },
    });
  });
}
