// Route data + curve derivation. Run with `pnpm --filter @workspace/sub-way-stand test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RouteSegment } from '../contracts/index.ts';
import { LINE2_ALIASES, LINE2_LOOP_LENGTH_M, LINE2_MAIN_LOOP } from '../data/line2.ts';
import {
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  buildLoopRoute,
  findSegmentInRoute,
  loopSegmentTurns,
  resolveStationName,
  stationKeys,
} from '../data/routeGeometry.ts';

const route = buildLoopRoute({
  line: 2,
  name: '2호선',
  stations: LINE2_MAIN_LOOP,
  officialLengthM: LINE2_LOOP_LENGTH_M,
  sourceNote: 'test',
});
const seg = (dir: '0' | '1', from: string, to: string) =>
  route.segments.find((s) => s.directionCode === dir && s.from === from && s.to === to);
const find = (station: string, dir: '0' | '1', end: 'into' | 'outOf') =>
  findSegmentInRoute(route, station, dir, end, LINE2_ALIASES);
const pair = (s: RouteSegment | null) => (s ? `${s.from}→${s.to}` : null);

test('Line 2 main loop: 43 unique stations inside Seoul, plausible spacing', () => {
  assert.equal(LINE2_MAIN_LOOP.length, 43);
  assert.equal(new Set(LINE2_MAIN_LOOP.map((s) => s.name)).size, 43);
  for (const s of LINE2_MAIN_LOOP) {
    assert.ok(s.lat > 37.45 && s.lat < 37.6 && s.lon > 126.85 && s.lon < 127.15, s.name);
  }
  for (const t of loopSegmentTurns(LINE2_MAIN_LOOP)) {
    assert.ok(t.chordM > 400 && t.chordM < 2100, `${t.from}→${t.to} ${Math.round(t.chordM)} m`);
  }
  assert.deepEqual(
    route.stations.map((s) => s.order),
    LINE2_MAIN_LOOP.map((_, i) => i),
  );
});

test('both directions chain around the loop and match the official length', () => {
  assert.equal(route.loop, true);
  assert.equal(route.origin, 'curated');
  for (const dir of ['0', '1'] as const) {
    const segs = route.segments.filter((s) => s.directionCode === dir);
    assert.equal(segs.length, 43);
    for (let i = 0; i < segs.length; i++) {
      assert.equal(segs[i]!.to, segs[(i + 1) % segs.length]!.from, `${dir} chain breaks at ${segs[i]!.id}`);
    }
    const total = segs.reduce((s, x) => s + x.lengthM, 0);
    assert.ok(Math.abs(total - LINE2_LOOP_LENGTH_M) < 300, `${dir} total ${total}`);
  }
  assert.equal(new Set(route.segments.map((s) => s.id)).size, route.segments.length);
});

test('station headings close the loop: 외선 turns −360° (left), 내선 +360° (right)', () => {
  const sumDeg = (stations: typeof LINE2_MAIN_LOOP) =>
    (loopSegmentTurns(stations).reduce((s, t) => s + t.entryRad + t.exitRad, 0) * 180) / Math.PI;
  assert.ok(Math.abs(sumDeg(LINE2_MAIN_LOOP) + 360) < 1e-6);
  assert.ok(Math.abs(sumDeg([...LINE2_MAIN_LOOP].reverse()) - 360) < 1e-6);
});

test('every curve is labeled, positive-radius and inside its segment', () => {
  const curves = route.segments.flatMap((s) => s.curves.map((c) => ({ s, c })));
  assert.ok(curves.length >= 20, `only ${curves.length} curves derived`);
  assert.equal(new Set(curves.map(({ c }) => c.id)).size, curves.length);
  for (const { s, c } of curves) {
    assert.equal(c.source, 'station-geometry-approx');
    assert.ok(c.confidence === 'low' || c.confidence === 'medium', c.id);
    assert.ok(c.radiusM > 0 && c.radiusM >= MIN_RADIUS_M && c.radiusM <= MAX_RADIUS_M, `${c.id} R=${c.radiusM}`);
    assert.ok(c.lengthM > 0 && c.startOffsetM >= 0, c.id);
    assert.ok(c.startOffsetM + c.lengthM <= s.lengthM, `${c.id} overruns ${s.id}`);
    assert.ok(c.turn === 'left' || c.turn === 'right');
  }
});

test('curves mirror across directions: same radius/length, opposite turn side', () => {
  for (const fwd of route.segments.filter((s) => s.directionCode === '1')) {
    const back = seg('0', fwd.to, fwd.from);
    assert.ok(back, `missing reverse of ${fwd.id}`);
    assert.equal(back.lengthM, fwd.lengthM, fwd.id);
    assert.equal(back.curves.length, fwd.curves.length, fwd.id);
    const mirrored = [...back.curves].reverse();
    fwd.curves.forEach((c, i) => {
      const m = mirrored[i]!;
      assert.equal(m.radiusM, c.radiusM, c.id);
      assert.equal(m.lengthM, c.lengthM, c.id);
      assert.notEqual(m.turn, c.turn, `${c.id} turn side must flip`);
      assert.ok(Math.abs(fwd.lengthM - c.startOffsetM - c.lengthM - m.startOffsetM) <= 1, `${c.id} offset`);
    });
  }
});

test('geography check: 외선 leaving 잠실 bends north (left), 내선 the reverse (right)', () => {
  const out = seg('1', '잠실', '잠실나루')!;
  const back = seg('0', '잠실나루', '잠실')!;
  assert.ok(out.curves.length > 0 && out.curves.every((c) => c.turn === 'left'));
  assert.ok(back.curves.length > 0 && back.curves.every((c) => c.turn === 'right'));
  // The Teheran-ro section is nearly straight.
  assert.deepEqual(seg('1', '강남', '역삼')!.curves, []);
});

test('findSegment: both directions, both ends, loop wrap-around', () => {
  assert.equal(pair(find('강남', '1', 'into')), '교대→강남');
  assert.equal(pair(find('강남', '1', 'outOf')), '강남→역삼');
  assert.equal(pair(find('강남', '0', 'into')), '역삼→강남');
  assert.equal(pair(find('강남', '0', 'outOf')), '강남→교대');
  assert.equal(pair(find('을지로입구', '1', 'outOf')), '을지로입구→시청');
  assert.equal(pair(find('시청', '1', 'into')), '을지로입구→시청');
  assert.equal(pair(find('시청', '0', 'outOf')), '시청→을지로입구');
  assert.equal(pair(find('시청', '0', 'into')), '충정로→시청');
});

test('findSegment resolves name variants and rejects off-loop stations', () => {
  assert.equal(pair(find('강남역', '1', 'outOf')), '강남→역삼');
  assert.equal(pair(find(' 강 남 ', '1', 'outOf')), '강남→역삼');
  assert.equal(pair(find('서울대입구(관악구청)', '1', 'outOf')), '서울대입구→낙성대');
  assert.equal(pair(find('동대문역사문화공원(DDP)', '0', 'into')), '을지로4가→동대문역사문화공원');
  assert.equal(pair(find('신천', '0', 'outOf')), '잠실새내→종합운동장');
  assert.equal(pair(find('동대문운동장역', '1', 'outOf')), '동대문역사문화공원→을지로4가');
  assert.equal(pair(find('성수종착', '1', 'outOf')), '성수→뚝섬');
  for (const off of ['신도림지선', '성수지선', '용답', '까치산', '서울역', '', '강남구청']) {
    assert.equal(find(off, '1', 'outOf'), null, off);
  }
  assert.equal(resolveStationName(route, '역삼역'), '역삼');
});

test('stationKeys normalizes 역 suffix and parenthetical names', () => {
  assert.ok(stationKeys('서울역').includes('서울'));
  assert.deepEqual(stationKeys('서울역'), stationKeys('서울'));
  const k = stationKeys('총신대입구(이수)');
  for (const want of ['총신대입구', '이수']) assert.ok(k.includes(want), want);
  assert.deepEqual(stationKeys('역삼'), ['역삼']);
});
