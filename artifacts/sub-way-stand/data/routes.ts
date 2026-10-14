/**
 * Bundled route data. Owner: backend/data task.
 *
 * Only Line 2's main loop is covered. Other lines have no route, so the
 * forecast must suppress with a reason instead of guessing.
 * Curves are derived from station coordinates (see data/routeGeometry.ts) and
 * labeled `station-geometry-approx` with low/medium confidence.
 */
import type { RouteData } from '@/contracts';
import { LINE2_ALIASES, LINE2_LOOP_LENGTH_M, LINE2_MAIN_LOOP } from './line2.ts';
import { buildLoopRoute } from './routeGeometry.ts';
import { LINE2_CENTERLINE } from './line2Centerline.ts';

export const LINE2_SOURCE_NOTE =
  '잠실↔잠실나루: OpenStreetMap 실제 선로 노드 23개·3개 way에서 계산(ODbL, 미검증). 나머지 구간: 역 좌표 근사. 캔트·실제 주행 선로·지도 정확도가 미확인되어 실시간 방향 안내를 보류합니다.';

const approximateLine2 = buildLoopRoute({
  line: 2,
  name: '2호선',
  stations: LINE2_MAIN_LOOP,
  officialLengthM: LINE2_LOOP_LENGTH_M,
  sourceNote: LINE2_SOURCE_NOTE,
});

export const ROUTES: Readonly<Record<number, RouteData>> = {
  2: {
    ...approximateLine2,
    segments: approximateLine2.segments.map((segment) =>
      LINE2_CENTERLINE.segments.find((mapped) => mapped.id === segment.id) ?? segment),
  },
};

/** Alternate / former station names per line, used by findSegment. */
export const ROUTE_ALIASES: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  2: LINE2_ALIASES,
};
