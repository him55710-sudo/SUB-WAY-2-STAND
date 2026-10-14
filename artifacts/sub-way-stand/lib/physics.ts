/**
 * Point-mass, quasi-static lateral motion model.
 * NOT a suspension, cabin-vibration or crowd model.
 *
 * Sign convention (travel frame, facing the direction of travel):
 *   curvature κ > 0  → LEFT curve,  κ < 0 → RIGHT curve   (κ = 1/R)
 *   cant θ > 0       → track banked toward the left
 *   vehicle lateral acceleration  a_y = v²·κ − g·sin θ   (cant only when known)
 *   a_y > 0 → the passenger is pushed to the RIGHT (inertia, outward of a left curve)
 *   a_y < 0 → the passenger is pushed to the LEFT
 *
 * This file must stay dependency-free (no value imports) so it runs under
 * `node --test` without a bundler.
 */

export const G = 9.80665;
export const SWAY_THRESHOLD = 0.01; // m/s² — below this the direction is "none"
export const MAX_CANT_RAD = 0.3;
export const MAX_WINDOW_SPREAD_S = 12; // wider windows are too uncertain to announce

export type Side = "left" | "right" | "none";
export type Intensity = "low" | "moderate" | "high";
export type Confidence = "high" | "medium" | "low";
export type SuppressReason =
  | "unverified"
  | "stale"
  | "stationary"
  | "delayed"
  | "invalid"
  | "straight"
  | "ambiguous";

export const SIDE_LABEL: Record<Side, string> = { left: "왼쪽", right: "오른쪽", none: "없음" };
export const INTENSITY_LABEL: Record<Intensity, string> = { low: "약함", moderate: "보통", high: "강함" };
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "높음", medium: "중간", low: "낮음" };
export const REASON_LABEL: Record<SuppressReason, string> = {
  unverified: "검증된 선로 형상·속도 데이터가 없습니다",
  stale: "관측이 오래되어 현재 위치를 알 수 없습니다",
  stationary: "열차가 정차 중입니다",
  delayed: "지연 운행으로 도달 시각이 불확실합니다",
  invalid: "입력값이 유효하지 않습니다",
  straight: "다가오는 곡선이 없습니다",
  ambiguous: "도달 시각 또는 방향의 불확실성이 큽니다",
};

const allFinite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
const noNegZero = (x: number) => (x === 0 ? 0 : x);

export function lateralAcceleration(speed: number, curvature: number, cantRad?: number): number {
  if (!allFinite(speed, curvature) || speed < 0) throw new RangeError("invalid speed or curvature");
  if (cantRad !== undefined && (!Number.isFinite(cantRad) || Math.abs(cantRad) > MAX_CANT_RAD)) {
    throw new RangeError("invalid cant");
  }
  const cantTerm = cantRad === undefined ? 0 : G * Math.sin(cantRad);
  return noNegZero(speed * speed * curvature - cantTerm);
}

/** Direction the passenger's body is pushed. */
export function swayDirection(acceleration: number): Side {
  if (!Number.isFinite(acceleration) || Math.abs(acceleration) < SWAY_THRESHOLD) return "none";
  return acceleration > 0 ? "right" : "left";
}

export function turnSide(curvature: number): Side {
  if (curvature > 0) return "left";
  if (curvature < 0) return "right";
  return "none";
}

/** Rate of change of lateral acceleration while entering a spiral: j = v³ · dκ/ds (m/s³). */
export function transitionJerk(speed: number, dKappaDs: number): number {
  if (!allFinite(speed, dKappaDs) || speed < 0) throw new RangeError("invalid jerk inputs");
  return noNegZero(speed * speed * speed * dKappaDs);
}

/** Relative scale for UI wording only — not a comfort or safety metric. */
export function intensityOf(absAcceleration: number): Intensity {
  if (absAcceleration < 0.3) return "low";
  if (absAcceleration < 0.6) return "moderate";
  return "high";
}

export function confidenceOf(windowSpreadS: number): Confidence {
  if (windowSpreadS <= 4) return "high";
  if (windowSpreadS <= 8) return "medium";
  return "low";
}

export type Geometry = {
  speedMin: number;
  speedMax: number;
  distanceMin: number;
  distanceMax: number;
  curvature: number;
  cantRad?: number;
};

export type ForecastInput = {
  geometry: Geometry | null;
  verified: boolean;
  stale: boolean;
  stationary: boolean;
  delayed: boolean;
};

export type Forecast = {
  suppressed: boolean;
  reasons: SuppressReason[];
  turn: Side;
  sway: Side;
  window: [number, number] | null;
  accel: [number, number] | null;
  intensity: Intensity | null;
  confidence: Confidence | null;
};

function suppressedResult(reasons: SuppressReason[]): Forecast {
  return {
    suppressed: true,
    reasons: [...new Set(reasons)],
    turn: "none",
    sway: "none",
    window: null,
    accel: null,
    intensity: null,
    confidence: null,
  };
}

/**
 * Conservative forecast. Any doubt → suppressed with explicit reasons.
 * Time window = [dMin / vMax, dMax / vMin].
 */
export function forecast(input: ForecastInput): Forecast {
  const reasons: SuppressReason[] = [];
  if (!input.verified) reasons.push("unverified");
  if (input.stale) reasons.push("stale");
  if (input.stationary) reasons.push("stationary");
  if (input.delayed) reasons.push("delayed");

  const g = input.geometry;
  if (!g) return suppressedResult([...reasons, "unverified"]);

  const valid =
    allFinite(g.speedMin, g.speedMax, g.distanceMin, g.distanceMax, g.curvature) &&
    g.speedMin >= 0 &&
    g.speedMax >= g.speedMin &&
    g.distanceMin >= 0 &&
    g.distanceMax >= g.distanceMin &&
    (g.cantRad === undefined || (Number.isFinite(g.cantRad) && Math.abs(g.cantRad) <= MAX_CANT_RAD));
  if (!valid) return suppressedResult([...reasons, "invalid"]);

  if (g.speedMax < 0.5) reasons.push("stationary");
  if (g.curvature === 0) return suppressedResult([...reasons, "straight"]);

  const aLo = lateralAcceleration(g.speedMin, g.curvature, g.cantRad);
  const aHi = lateralAcceleration(g.speedMax, g.curvature, g.cantRad);
  const sLo = swayDirection(aLo);
  const sHi = swayDirection(aHi);
  if (g.speedMin <= 0) reasons.push("ambiguous"); // unbounded window
  if (sLo !== sHi || sLo === "none") reasons.push("ambiguous"); // e.g. cant flips the sign

  if (reasons.length > 0) return suppressedResult(reasons);

  const window: [number, number] = [g.distanceMin / g.speedMax, g.distanceMax / g.speedMin];
  const spread = window[1] - window[0];
  if (spread > MAX_WINDOW_SPREAD_S) return suppressedResult(["ambiguous"]);

  const accel: [number, number] = [
    Math.min(Math.abs(aLo), Math.abs(aHi)),
    Math.max(Math.abs(aLo), Math.abs(aHi)),
  ];
  return {
    suppressed: false,
    reasons: [],
    turn: turnSide(g.curvature),
    sway: sLo,
    window,
    accel,
    intensity: intensityOf(accel[1]),
    confidence: confidenceOf(spread),
  };
}

/* ------------------------------------------------------------------ */
/* Track geometry                                                      */
/* ------------------------------------------------------------------ */

/** Linear curvature ramp from k0 to k1 over `length` metres (clothoid when k0≠k1). */
export type Segment = { length: number; k0: number; k1: number };
export type Track = { id: string; name: string; segments: Segment[] };

export type Curve = {
  id: string;
  start: number;
  end: number;
  curvature: number; // signed peak
  radius: number;
  turn: "left" | "right";
};

export function trackLength(track: Track): number {
  return track.segments.reduce((sum, seg) => sum + seg.length, 0);
}

function locate(track: Track, s: number): { seg: Segment; local: number } {
  const L = trackLength(track);
  let rest = Math.min(Math.max(s, 0), L);
  for (const seg of track.segments) {
    if (rest <= seg.length) return { seg, local: rest };
    rest -= seg.length;
  }
  const last = track.segments[track.segments.length - 1]!;
  return { seg: last, local: last.length };
}

export function curvatureAt(track: Track, s: number): number {
  const { seg, local } = locate(track, s);
  if (seg.length <= 0) return seg.k1;
  return noNegZero(seg.k0 + ((seg.k1 - seg.k0) * local) / seg.length);
}

export function curvatureSlopeAt(track: Track, s: number): number {
  const { seg } = locate(track, s);
  return seg.length > 0 ? noNegZero((seg.k1 - seg.k0) / seg.length) : 0;
}

/** Groups consecutive non-straight segments (spiral + arc + spiral) into one curve. */
export function findCurves(track: Track): Curve[] {
  const curves: Curve[] = [];
  let pos = 0;
  let open: { start: number; peak: number } | null = null;
  const close = (end: number) => {
    if (!open || open.peak === 0) return;
    curves.push({
      id: `C${curves.length + 1}`,
      start: open.start,
      end,
      curvature: open.peak,
      radius: Math.abs(1 / open.peak),
      turn: open.peak > 0 ? "left" : "right",
    });
  };
  for (const seg of track.segments) {
    const straight = seg.k0 === 0 && seg.k1 === 0;
    if (straight) {
      close(pos);
      open = null;
    } else {
      if (!open) open = { start: pos, peak: 0 };
      for (const k of [seg.k0, seg.k1]) if (Math.abs(k) > Math.abs(open.peak)) open.peak = k;
    }
    pos += seg.length;
  }
  close(pos);
  return curves;
}

export type Upcoming = { curve: Curve; distance: number; inside: boolean; lapOffset: number };

/** Next curve ahead of `s` (or the one we are inside). With `loop`, wraps to the next lap. */
export function nextCurve(track: Track, s: number, loop = false): Upcoming | null {
  const curves = findCurves(track);
  for (const curve of curves) {
    if (curve.end > s) {
      const inside = s >= curve.start;
      return { curve, distance: inside ? 0 : curve.start - s, inside, lapOffset: 0 };
    }
  }
  if (loop && curves.length > 0) {
    const first = curves[0]!;
    return { curve: first, distance: trackLength(track) - s + first.start, inside: false, lapOffset: 1 };
  }
  return null;
}

/** Plan-view polyline. +y is to the LEFT of the initial heading (travel along +x). */
export function trackPolyline(track: Track, step = 5): { s: number; x: number; y: number }[] {
  const L = trackLength(track);
  const pts = [{ s: 0, x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  let heading = 0;
  for (let s = 0; s < L; ) {
    const ds = Math.min(step, L - s);
    const kMid = curvatureAt(track, s + ds / 2);
    const hMid = heading + (kMid * ds) / 2;
    x += Math.cos(hMid) * ds;
    y += Math.sin(hMid) * ds;
    heading += kMid * ds;
    s += ds;
    pts.push({ s, x, y });
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/* Synthetic demonstration — invented track, linked to NO real train   */
/* ------------------------------------------------------------------ */

export const SYN_A: Track = {
  id: "SYN-A",
  name: "가상 선로 SYN-A",
  segments: [
    { length: 200, k0: 0, k1: 0 },
    { length: 30, k0: 0, k1: 1 / 450 },
    { length: 70, k0: 1 / 450, k1: 1 / 450 }, // R450 left
    { length: 30, k0: 1 / 450, k1: 0 },
    { length: 160, k0: 0, k1: 0 },
    { length: 30, k0: 0, k1: -1 / 300 },
    { length: 60, k0: -1 / 300, k1: -1 / 300 }, // R300 right
    { length: 30, k0: -1 / 300, k1: 0 },
    { length: 60, k0: 0, k1: 0 },
  ],
};

export const SYN_PARAMS = {
  baseSpeed: 14,
  speedAmplitude: 1.5,
  periodS: 30,
  speedMin: 12,
  speedMax: 16,
  positionUncertaintyM: 20,
  horizonS: 12,
} as const;

export function syntheticSpeed(t: number): number {
  const { baseSpeed, speedAmplitude, periodS } = SYN_PARAMS;
  return baseSpeed + speedAmplitude * Math.sin((2 * Math.PI * t) / periodS);
}

/** ∫ v dt from 0 to t. */
export function syntheticDistance(t: number): number {
  const { baseSpeed, speedAmplitude, periodS } = SYN_PARAMS;
  const w = (2 * Math.PI) / periodS;
  return baseSpeed * t + (speedAmplitude / w) * (1 - Math.cos(w * t));
}

export type SyntheticFrame = {
  t: number;
  lap: number;
  s: number;
  speed: number;
  curvature: number;
  accel: number; // current a_y, + = pushed right
  sway: Side;
  jerk: number;
  upcoming: (Upcoming & { eta: number; key: string }) | null;
  approaching: boolean;
  predictedAccel: number | null; // a_y at the upcoming curve's peak, at current speed
  forecast: Forecast;
};

export function syntheticFrame(t: number, track: Track = SYN_A): SyntheticFrame {
  const L = trackLength(track);
  const dist = syntheticDistance(Math.max(0, t));
  const lap = Math.floor(dist / L);
  const s = dist - lap * L;
  const speed = syntheticSpeed(t);
  const curvature = curvatureAt(track, s);
  const accel = lateralAcceleration(speed, curvature);
  const next = nextCurve(track, s, true);
  const upcoming = next
    ? { ...next, eta: next.distance / speed, key: `${lap + next.lapOffset}:${next.curve.id}` }
    : null;

  const { speedMin, speedMax, positionUncertaintyM, horizonS } = SYN_PARAMS;
  const fc =
    upcoming && !upcoming.inside
      ? forecast({
          geometry: {
            speedMin,
            speedMax,
            distanceMin: Math.max(0, upcoming.distance - positionUncertaintyM),
            distanceMax: upcoming.distance + positionUncertaintyM,
            curvature: upcoming.curve.curvature,
          },
          verified: true, // geometry is exact *within the synthetic simulation only*
          stale: false,
          stationary: false,
          delayed: false,
        })
      : forecast({
          geometry: null,
          verified: true,
          stale: false,
          stationary: false,
          delayed: false,
        });

  return {
    t,
    lap,
    s,
    speed,
    curvature,
    accel,
    sway: swayDirection(accel),
    jerk: transitionJerk(speed, curvatureSlopeAt(track, s)),
    upcoming,
    approaching: !!upcoming && !upcoming.inside && !!fc.window && fc.window[0] <= horizonS,
    predictedAccel: upcoming ? lateralAcceleration(speed, upcoming.curve.curvature) : null,
    forecast: fc,
  };
}
