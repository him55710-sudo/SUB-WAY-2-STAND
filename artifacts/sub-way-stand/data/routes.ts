/**
 * FIXTURE route data. Owner: backend/data task (replace with curated data).
 *
 * Station coordinates are approximate public station locations. Segment
 * lengths are rough and every curve below is SYNTHETIC (invented for the
 * skeleton) — they are not real track geometry.
 */
import type { CurveFeature, RouteData, RouteSegment, RouteStation } from '@/contracts';

const LINE2_STATIONS: RouteStation[] = [
  { name: '강남', lat: 37.4979, lon: 127.0276, order: 0 },
  { name: '역삼', lat: 37.5006, lon: 127.0364, order: 1 },
  { name: '선릉', lat: 37.5045, lon: 127.049, order: 2 },
  { name: '삼성', lat: 37.5088, lon: 127.0631, order: 3 },
];

function syntheticCurve(id: string, startOffsetM: number, turn: CurveFeature['turn']): CurveFeature {
  return { id, startOffsetM, lengthM: 180, radiusM: 400, turn, source: 'synthetic', confidence: 'low' };
}

// Direction "1" (외선) runs 강남 → 삼성; direction "0" (내선) runs 삼성 → 강남.
const LINE2_SEGMENTS: RouteSegment[] = [
  { id: 'L2-1-강남-역삼', from: '강남', to: '역삼', directionCode: '1', lengthM: 800, curves: [syntheticCurve('fx-c1', 300, 'left')] },
  { id: 'L2-1-역삼-선릉', from: '역삼', to: '선릉', directionCode: '1', lengthM: 1200, curves: [syntheticCurve('fx-c2', 500, 'right')] },
  { id: 'L2-1-선릉-삼성', from: '선릉', to: '삼성', directionCode: '1', lengthM: 1300, curves: [] },
  { id: 'L2-0-삼성-선릉', from: '삼성', to: '선릉', directionCode: '0', lengthM: 1300, curves: [] },
  { id: 'L2-0-선릉-역삼', from: '선릉', to: '역삼', directionCode: '0', lengthM: 1200, curves: [syntheticCurve('fx-c3', 520, 'left')] },
  { id: 'L2-0-역삼-강남', from: '역삼', to: '강남', directionCode: '0', lengthM: 800, curves: [syntheticCurve('fx-c4', 320, 'right')] },
];

export const FIXTURE_ROUTES: Record<number, RouteData> = {
  2: {
    line: 2,
    name: '2호선',
    loop: true,
    stations: LINE2_STATIONS,
    segments: LINE2_SEGMENTS,
    origin: 'fixture',
    sourceNote: '예시(픽스처) 노선 데이터 — 곡선 정보는 가상이며 실제 선로가 아닙니다.',
  },
};
