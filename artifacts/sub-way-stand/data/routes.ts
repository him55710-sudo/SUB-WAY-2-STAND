/**
 * Bundled route data. Owner: backend/data task.
 *
 * Only Line 2's main loop is covered. Other lines have no route, so the
 * forecast must suppress with a reason instead of guessing.
 * Curves are derived from station coordinates (see data/routeGeometry.ts) and
 * labeled `station-geometry-approx` with low/medium confidence.
 */
import type { RouteData } from '@/contracts';
import { LINE2_ALIASES, LINE2_LOOP_LENGTH_M, LINE2_MAIN_LOOP } from '@/data/line2';
import { buildLoopRoute } from '@/data/routeGeometry';

export const LINE2_SOURCE_NOTE =
  '2호선 본선 순환 43개 역 · 역 좌표(OpenStreetMap, 근사)로 계산한 곡선 추정 · 실제 선로 측량값이 아니며 역 사이 곡선 일부는 보이지 않을 수 있습니다.';

export const ROUTES: Readonly<Record<number, RouteData>> = {
  2: buildLoopRoute({
    line: 2,
    name: '2호선',
    stations: LINE2_MAIN_LOOP,
    officialLengthM: LINE2_LOOP_LENGTH_M,
    sourceNote: LINE2_SOURCE_NOTE,
  }),
};

/** Alternate / former station names per line, used by findSegment. */
export const ROUTE_ALIASES: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  2: LINE2_ALIASES,
};
