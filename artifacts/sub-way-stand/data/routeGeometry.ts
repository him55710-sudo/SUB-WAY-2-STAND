/**
 * Route geometry derived from approximate station coordinates.
 * Owner: backend/data task. Pure: type-only imports, so Node tests can load it.
 *
 * Method (station-geometry-approx)
 * 1. Project stations to a local plane (metres) and take chord bearings.
 * 2. Station tangent = bisector of the incoming and outgoing chords.
 * 3. Each segment turns by (chord − tangent at `from`) near its start and
 *    (tangent at `to` − chord) near its end. Same-sign halves merge into one
 *    bend; opposite signs give an S-curve (two bends).
 * 4. Each bend is modelled as one circular arc of an assumed length (a share of
 *    the segment), so radius = arc length / turn angle. Bends that would be
 *    gentler than MAX_RADIUS_M are dropped (negligible sway).
 * 5. Segment lengths are chord lengths scaled so the loop matches its official
 *    length.
 *
 * Station points cannot see bends between stations that cancel out, and the
 * arc length is an assumption, so every curve is `station-geometry-approx`
 * with at most `medium` confidence.
 */
import type {
  Confidence,
  CurveFeature,
  DirectionCode,
  RouteData,
  RouteSegment,
  RouteStation,
  SegmentEnd,
  TurnDirection,
} from '@/contracts';

export interface GeometryStation {
  name: string;
  lat: number;
  lon: number;
}

export interface LoopRouteInput {
  line: number;
  name: string;
  /** Stations in direction "1" order (loop closes from last back to first). */
  stations: readonly GeometryStation[];
  /** Official loop length; chord lengths are scaled to match it. */
  officialLengthM?: number;
  sourceNote: string;
}

export const MIN_TURN_DEG = 5;
export const MIN_RADIUS_M = 150;
export const MAX_RADIUS_M = 2500;
export const MEDIUM_CONFIDENCE_TURN_DEG = 25;
export const MEDIUM_CONFIDENCE_MIN_SEGMENT_M = 500;

const EARTH_R = 6_371_000;
const DEG = Math.PI / 180;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Wraps an angle in radians to (-π, π]. */
export function wrapAngle(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

type XY = { x: number; y: number };

function project(stations: readonly GeometryStation[]): XY[] {
  const lat0 = stations.reduce((s, p) => s + p.lat, 0) / stations.length;
  const lon0 = stations.reduce((s, p) => s + p.lon, 0) / stations.length;
  const kx = Math.cos(lat0 * DEG) * EARTH_R * DEG;
  const ky = EARTH_R * DEG;
  return stations.map((p) => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky }));
}

/** Compass bearing (radians, clockwise from north) from a to b. */
function bearing(a: XY, b: XY): number {
  return Math.atan2(b.x - a.x, b.y - a.y);
}

const dist = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

export interface SegmentTurn {
  from: string;
  to: string;
  chordM: number;
  /** Signed turn near `from` (radians, + = right in the travel frame). */
  entryRad: number;
  /** Signed turn near `to`. */
  exitRad: number;
}

/** Raw per-segment turns for a closed loop traversed in the given station order. */
export function loopSegmentTurns(stations: readonly GeometryStation[]): SegmentTurn[] {
  const n = stations.length;
  const pts = project(stations);
  const chord = pts.map((p, i) => bearing(p, pts[(i + 1) % n]!));
  const tangent = chord.map((out, i) => {
    const inc = chord[(i - 1 + n) % n]!;
    return inc + wrapAngle(out - inc) / 2;
  });
  return stations.map((s, i) => {
    const j = (i + 1) % n;
    return {
      from: s.name,
      to: stations[j]!.name,
      chordM: dist(pts[i]!, pts[j]!),
      entryRad: wrapAngle(chord[i]! - tangent[i]!),
      exitRad: wrapAngle(tangent[j]! - chord[i]!),
    };
  });
}

type Bend = { turnRad: number; center: number; arcShare: number; arcMin: number; arcMax: number };

function bendsFor(t: SegmentTurn): Bend[] {
  const min = MIN_TURN_DEG * DEG;
  const { entryRad: a, exitRad: b } = t;
  if (Math.sign(a) === Math.sign(b) && Math.abs(a + b) >= min) {
    // One continuous bend, centred toward the half that turns more.
    const w = Math.abs(a) + Math.abs(b);
    return [{ turnRad: a + b, center: 0.3 + 0.4 * (Math.abs(b) / w), arcShare: 0.45, arcMin: 150, arcMax: 700 }];
  }
  const bends: Bend[] = [];
  if (Math.abs(a) >= min) bends.push({ turnRad: a, center: 0.3, arcShare: 0.3, arcMin: 100, arcMax: 450 });
  if (Math.abs(b) >= min) bends.push({ turnRad: b, center: 0.7, arcShare: 0.3, arcMin: 100, arcMax: 450 });
  return bends;
}

function deriveCurves(t: SegmentTurn, lengthM: number, idPrefix: string): CurveFeature[] {
  const curves: CurveFeature[] = [];
  for (const bend of bendsFor(t)) {
    const angle = Math.abs(bend.turnRad);
    const maxArc = lengthM * 0.8;
    let arc = Math.min(clamp(lengthM * bend.arcShare, bend.arcMin, bend.arcMax), maxArc);
    // Keep the implied radius physically plausible for a metro line.
    if (arc / angle < MIN_RADIUS_M) arc = Math.min(MIN_RADIUS_M * angle, maxArc);
    const radius = Math.max(MIN_RADIUS_M, arc / angle);
    if (radius > MAX_RADIUS_M) continue;
    const start = clamp(bend.center * lengthM - arc / 2, 0, lengthM - arc);
    const turn: TurnDirection = bend.turnRad > 0 ? 'right' : 'left';
    const confidence: Confidence =
      angle >= MEDIUM_CONFIDENCE_TURN_DEG * DEG && lengthM >= MEDIUM_CONFIDENCE_MIN_SEGMENT_M ? 'medium' : 'low';
    curves.push({
      id: `${idPrefix}-c${curves.length + 1}`,
      startOffsetM: Math.round(start),
      lengthM: Math.round(arc),
      radiusM: Math.round(radius / 10) * 10,
      turn,
      source: 'station-geometry-approx',
      confidence,
    });
  }
  return curves;
}

function buildDirection(
  input: LoopRouteInput,
  order: readonly GeometryStation[],
  directionCode: DirectionCode,
  scale: number,
): RouteSegment[] {
  return loopSegmentTurns(order).map((t) => {
    const lengthM = Math.round((t.chordM * scale) / 10) * 10;
    const id = `L${input.line}-${directionCode}-${t.from}-${t.to}`;
    return { id, from: t.from, to: t.to, directionCode, lengthM, curves: deriveCurves(t, lengthM, id) };
  });
}

/** Builds both directions of a loop line from station coordinates. */
export function buildLoopRoute(input: LoopRouteInput): RouteData {
  const forward = input.stations;
  const reverse = [...forward].reverse();
  const chordTotal = loopSegmentTurns(forward).reduce((s, t) => s + t.chordM, 0);
  const scale = input.officialLengthM ? input.officialLengthM / chordTotal : 1;
  const stations: RouteStation[] = forward.map((s, order) => ({ name: s.name, lat: s.lat, lon: s.lon, order }));
  return {
    line: input.line,
    name: input.name,
    loop: true,
    stations,
    segments: [...buildDirection(input, forward, '1', scale), ...buildDirection(input, reverse, '0', scale)],
    origin: 'curated',
    sourceNote: input.sourceNote,
  };
}

// ---------------------------------------------------------------------------
// Station names
// ---------------------------------------------------------------------------

/**
 * Normalized lookup keys, same rules as the API proxy:
 * "서울역" ≡ "서울", "총신대입구(이수)" ≡ "총신대입구" ≡ "이수",
 * plus the provider's "성수종착" ≡ "성수".
 */
export function stationKeys(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, '');
  const base = clean.replace(/\(.*?\)/g, '');
  const inner = [...clean.matchAll(/\((.*?)\)/g)].map((m) => m[1] ?? '');
  const keys = [clean, base, ...inner]
    .map((s) => s.replace(/종착$/, '').replace(/역$/, ''))
    .filter(Boolean);
  return [...new Set(keys)];
}

/** Canonical route station name for a provider/user name, or null if not on the route. */
export function resolveStationName(
  route: RouteData,
  name: string,
  aliases: Readonly<Record<string, string>> = {},
): string | null {
  const keys = stationKeys(name);
  const wanted = new Set(keys.map((k) => aliases[k] ?? k));
  for (const s of route.stations) {
    if (stationKeys(s.name).some((k) => wanted.has(k))) return s.name;
  }
  return null;
}

export function findSegmentInRoute(
  route: RouteData,
  station: string,
  directionCode: DirectionCode,
  end: SegmentEnd,
  aliases: Readonly<Record<string, string>> = {},
): RouteSegment | null {
  const canonical = resolveStationName(route, station, aliases);
  if (!canonical) return null;
  return (
    route.segments.find(
      (s) => s.directionCode === directionCode && (end === 'into' ? s.to === canonical : s.from === canonical),
    ) ?? null
  );
}
