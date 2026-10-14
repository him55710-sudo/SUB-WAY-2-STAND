/** Actual mapped railway nodes, never station-to-station chords.
 * Coordinates are projected into a local east/north metric plane. Curvature
 * comes from three points on a resampled centerline (+ = left while traveling).
 * Map precision, the track actually used and cant remain unvalidated: output
 * is always osm-centerline / low and does not qualify for live voice guidance.
 */
import type { CurveFeature, RouteSegment } from '../contracts/index.ts';

export type GeoPoint = { lat: number; lon: number; nodeId?: number };
export type MetricPoint = { x: number; y: number; s: number };
export type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
};
export type OsmExtract = { elements: OsmElement[] };

const EARTH_R = 6_371_000;
const DEG = Math.PI / 180;
export const SAMPLE_SPACING_M = 20;
export const CURVATURE_BASELINE_M = 80;
/** Sensitivity scenario, NOT an independently measured OSM accuracy bound. */
export const MAP_PERTURBATION_SCENARIO_M = 10;

export function projectCenterline(points: readonly GeoPoint[]): MetricPoint[] {
  if (points.length < 2 || points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) {
    throw new RangeError('Centerline needs at least two valid coordinates');
  }
  const lat0 = points[0]!.lat;
  const lon0 = points[0]!.lon;
  let s = 0;
  return points.map((p, i) => {
    const x = (p.lon - lon0) * DEG * EARTH_R * Math.cos(lat0 * DEG);
    const y = (p.lat - lat0) * DEG * EARTH_R;
    if (i > 0) {
      const prev = points[i - 1]!;
      s += Math.hypot((p.lon - prev.lon) * DEG * EARTH_R * Math.cos(lat0 * DEG), (p.lat - prev.lat) * DEG * EARTH_R);
    }
    return { x, y, s };
  });
}

/** Orders connected railway nodes by shortest along-track distance, never by proximity. */
export function orderOsmCenterline(data: OsmExtract, fromNode: number, toNode: number): { points: GeoPoint[]; wayIds: number[] } {
  const nodes = new Map(data.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const graph = new Map<number, { to: number; length: number; wayId: number }[]>();
  for (const way of data.elements) {
    if (way.type !== 'way' || way.tags?.railway !== 'subway' || way.tags?.name !== '2호선') continue;
    for (let i = 1; i < (way.nodes?.length ?? 0); i++) {
      const a = way.nodes![i - 1]!;
      const b = way.nodes![i]!;
      const pa = nodes.get(a);
      const pb = nodes.get(b);
      if (!pa || !pb) throw new Error(`Missing railway node in way ${way.id}`);
      const length = projectCenterline([{ lat: pa.lat!, lon: pa.lon! }, { lat: pb.lat!, lon: pb.lon! }])[1]!.s;
      if (!(length > 0)) continue;
      graph.set(a, [...(graph.get(a) ?? []), { to: b, length, wayId: way.id }]);
      graph.set(b, [...(graph.get(b) ?? []), { to: a, length, wayId: way.id }]);
    }
  }
  const costs = new Map<number, number>([[fromNode, 0]]);
  const previous = new Map<number, { from: number; wayId: number }>();
  const pending = new Set<number>([fromNode]);
  while (pending.size > 0) {
    let current = [...pending].reduce((a, b) => costs.get(a)! <= costs.get(b)! ? a : b);
    pending.delete(current);
    if (current === toNode) break;
    for (const edge of graph.get(current) ?? []) {
      const cost = costs.get(current)! + edge.length;
      if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
      costs.set(edge.to, cost);
      previous.set(edge.to, { from: current, wayId: edge.wayId });
      pending.add(edge.to);
    }
  }
  if (!costs.has(toNode)) throw new Error('Station stop nodes are not connected by mapped Line 2 railway');
  const ids = [toNode];
  const wayIds = new Set<number>();
  while (ids[ids.length - 1] !== fromNode) {
    const prev = previous.get(ids[ids.length - 1]!);
    if (!prev) throw new Error('Incomplete centerline path');
    wayIds.add(prev.wayId);
    ids.push(prev.from);
  }
  return {
    points: ids.reverse().map((id) => ({ lat: nodes.get(id)!.lat!, lon: nodes.get(id)!.lon!, nodeId: id })),
    wayIds: [...wayIds].reverse(),
  };
}

function at(points: readonly MetricPoint[], s: number): MetricPoint {
  const d = Math.max(0, Math.min(points[points.length - 1]!.s, s));
  const i = Math.max(1, points.findIndex((p) => p.s >= d));
  const a = points[i - 1]!;
  const b = points[i]!;
  const t = b.s > a.s ? (d - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: d };
}

export function signedThreePointCurvature(a: MetricPoint, b: MetricPoint, c: MetricPoint): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ac = Math.hypot(c.x - a.x, c.y - a.y);
  const denom = ab * bc * ac;
  return denom > 0 ? 2 * ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / denom : 0;
}

export function segmentFromCenterline(args: {
  id: string; from: string; to: string; directionCode: '0' | '1'; points: readonly GeoPoint[];
}): { segment: RouteSegment; diagnostics: { curveId: string; signedCurvaturePerM: number; sensitivityPerM: number }[] } {
  const projected = projectCenterline(args.points);
  const total = projected[projected.length - 1]!.s;
  if (!(total > 2 * CURVATURE_BASELINE_M)) throw new RangeError('Centerline is too short for curvature baseline');
  const samples: { s: number; k: number }[] = [];
  for (let s = CURVATURE_BASELINE_M; s <= total - CURVATURE_BASELINE_M; s += SAMPLE_SPACING_M) {
    samples.push({ s, k: signedThreePointCurvature(at(projected, s - CURVATURE_BASELINE_M), at(projected, s), at(projected, s + CURVATURE_BASELINE_M)) });
  }
  const groups: { start: number; end: number; ks: number[] }[] = [];
  for (const sample of samples) {
    if (Math.abs(sample.k) < 1 / 2500) continue;
    const prev = groups[groups.length - 1];
    if (prev && sample.s - prev.end <= SAMPLE_SPACING_M * 1.5 && Math.sign(prev.ks[0]!) === Math.sign(sample.k)) {
      prev.end = sample.s;
      prev.ks.push(sample.k);
    } else groups.push({ start: sample.s, end: sample.s, ks: [sample.k] });
  }
  const diagnostics: { curveId: string; signedCurvaturePerM: number; sensitivityPerM: number }[] = [];
  const curves: CurveFeature[] = groups.filter((g) => g.end - g.start >= SAMPLE_SPACING_M).map((group, i) => {
    const sorted = [...group.ks].sort((a, b) => Math.abs(a) - Math.abs(b));
    const k = sorted[Math.floor(sorted.length / 2)]!;
    const id = `${args.id}-osm-c${i + 1}`;
    // First-order coordinate perturbation sensitivity; deliberately conservative.
    // This is not a confidence interval and must not be used as verification.
    diagnostics.push({ curveId: id, signedCurvaturePerM: k, sensitivityPerM: 16 * MAP_PERTURBATION_SCENARIO_M / CURVATURE_BASELINE_M ** 2 });
    const start = Math.max(0, Math.round(group.start - SAMPLE_SPACING_M / 2));
    const end = Math.min(Math.round(total), Math.round(group.end + SAMPLE_SPACING_M / 2));
    return { id, startOffsetM: start, lengthM: end - start, radiusM: Math.round(1 / Math.abs(k)), turn: k > 0 ? 'left' : 'right', source: 'osm-centerline', confidence: 'low' };
  });
  return { segment: { id: args.id, from: args.from, to: args.to, directionCode: args.directionCode, lengthM: Math.round(total), curves }, diagnostics };
}
