import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { orderOsmCenterline, projectCenterline, segmentFromCenterline, signedThreePointCurvature } from '../data/centerlineGeometry.ts';
import { LINE2_CENTERLINE } from '../data/line2Centerline.ts';
import { ROUTES } from '../data/routes.ts';
import { findSegmentInRoute } from '../data/routeGeometry.ts';
import { computeLiveForecast, isVerifiedCurve, validSegment } from '../lib/forecastEngine.ts';
import { buildSimRide, simulateForecast } from '../lib/simulationRide.ts';

test('actual OSM railway path is reproducible from connected, versioned nodes', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/sources/line2-jamsil-osm.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  const path = orderOsmCenterline(raw, 8337914284, 5933687061);
  assert.deepEqual(path.points, LINE2_CENTERLINE.points);
  assert.deepEqual(path.wayIds, LINE2_CENTERLINE.provenance.wayIds);
  assert.equal(path.points.length, 23);
  assert.ok(raw.elements.every((e: { version: number }) => e.version > 0));
  assert.throws(() => orderOsmCenterline(raw, 8337914284, 123), /not connected/);
});

test('metric projection and signed curvature recover known circular arcs and reverse signs', () => {
  const point = (angle: number) => ({ x: 400 * Math.cos(angle), y: 400 * Math.sin(angle), s: 0 });
  const a = point(0), b = point(0.2), c = point(0.4);
  assert.ok(Math.abs(signedThreePointCurvature(a, b, c) - 1 / 400) < 1e-12);
  assert.ok(Math.abs(signedThreePointCurvature(c, b, a) + 1 / 400) < 1e-12);
  assert.equal(signedThreePointCurvature({ x: 0, y: 0, s: 0 }, { x: 10, y: 0, s: 10 }, { x: 20, y: 0, s: 20 }), 0);
  const projected = projectCenterline([{ lat: 37.5, lon: 127 }, { lat: 37.501, lon: 127 }]);
  assert.ok(Math.abs(projected[1]!.s - 111.195) < 0.01);
});

test('actual centerline overrides station chords and mirrors correctly', () => {
  const route = ROUTES[2]!;
  const forward = findSegmentInRoute(route, '잠실', '1', 'outOf')!;
  const back = findSegmentInRoute(route, '잠실나루', '0', 'outOf')!;
  const regenerated = segmentFromCenterline({ id: forward.id, from: forward.from, to: forward.to, directionCode: '1', points: LINE2_CENTERLINE.points });
  assert.deepEqual(regenerated.segment, forward);
  assert.equal(forward.lengthM, 829);
  assert.equal(forward.curves[0]!.source, 'osm-centerline');
  assert.equal(forward.curves[0]!.turn, 'left');
  assert.equal(back.curves[0]!.turn, 'right');
  assert.equal(back.curves[0]!.radiusM, forward.curves[0]!.radiusM);
  assert.equal(back.curves[0]!.startOffsetM, forward.lengthM - forward.curves[0]!.startOffsetM - forward.curves[0]!.lengthM);
  assert.ok(validSegment(forward) && validSegment(back));
  assert.ok(LINE2_CENTERLINE.diagnostics[0]!.sensitivityPerM > Math.abs(LINE2_CENTERLINE.diagnostics[0]!.signedCurvaturePerM), 'map perturbation can exceed estimated curvature; confidence must stay low');
});

test('mapped rail powers a labeled simulated ride while unvalidated live guidance stays held', () => {
  const route = ROUTES[2]!;
  const ride = buildSimRide(route);
  assert.equal(ride.segment.from, '잠실');
  const simulated = simulateForecast(ride, ride.runStartS + 1, 0);
  assert.equal(simulated.source, 'simulation');
  assert.equal(simulated.state, 'active');
  assert.equal(simulated.targetCurve!.source, 'osm-centerline');
  assert.equal(simulated.confidence, 'low');
  assert.ok(simulated.explanationKo.some((line) => line.includes('실제 열차와 무관')));
  assert.equal(isVerifiedCurve(ride.segment.curves[0]!, route), false);
  const nowMs = Date.parse('2026-10-14T08:00:00Z');
  const live = computeLiveForecast({ route, nowMs,
    findSegment: (_line, station, dir, end) => findSegmentInRoute(route, station, dir, end),
    train: { id: 'test', line: 2, station: '잠실', state: '출발', stateCode: '2', direction: '외선', directionCode: '1', destination: '순환', observedAt: new Date(nowMs).toISOString(), fresh: true, express: false, lastTrain: false, origin: 'live' },
  });
  assert.equal(live.state, 'suppressed');
  assert.equal(live.sway, 'none');
  assert.equal(live.suppressReason, 'low-confidence');
  assert.equal(live.segment!.id, ride.segment.id);
});

test('malformed curve extents cannot produce a forecast', () => {
  const seg = LINE2_CENTERLINE.segments[0]!;
  assert.equal(validSegment({ ...seg, curves: [{ ...seg.curves[0]!, startOffsetM: 800, lengthM: 100 }] }), false);
  assert.equal(validSegment({ ...seg, curves: [{ ...seg.curves[0]!, lengthM: 0 }] }), false);
});
