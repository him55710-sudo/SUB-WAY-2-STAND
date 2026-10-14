/**
 * Seoul Subway Line 2 main loop (본선 순환, 43 stations). Pure data, no imports.
 *
 * Order: direction "1" (외선순환, counter-clockwise on the map), starting at
 * 시청: 시청 → 충정로 → … → 강남 → 역삼 → … → 을지로입구 → 시청.
 * Direction "0" (내선순환, clockwise) is the reverse. Verified against the
 * provider on 2026-10-14: 내선 trains moved 선릉 → 서초 and 당산 → 신촌,
 * 외선 trains moved 강남 → 삼성 and 신당 → 을지로입구 (statnId 1002000201–243
 * increases in the 내선 direction).
 *
 * Coordinates: approximate public station locations from OpenStreetMap
 * (railway=station nodes operated by 서울교통공사, ODbL), rounded to ~10 m.
 * At transfer stations the Line 2 node was chosen. These are station points,
 * not surveyed track geometry. Branch lines (성수지선, 신정지선) are excluded.
 */
export interface StationSeed {
  name: string;
  lat: number;
  lon: number;
}

export const LINE2_LOOP_LENGTH_M = 48_800;

export const LINE2_MAIN_LOOP: readonly StationSeed[] = [
  { name: '시청', lat: 37.56333, lon: 126.97479 },
  { name: '충정로', lat: 37.55937, lon: 126.96291 },
  { name: '아현', lat: 37.55743, lon: 126.95612 },
  { name: '이대', lat: 37.55677, lon: 126.94583 },
  { name: '신촌', lat: 37.55515, lon: 126.93691 },
  { name: '홍대입구', lat: 37.55663, lon: 126.92345 },
  { name: '합정', lat: 37.54936, lon: 126.91366 },
  { name: '당산', lat: 37.5346, lon: 126.90248 },
  { name: '영등포구청', lat: 37.52402, lon: 126.89634 },
  { name: '문래', lat: 37.51838, lon: 126.89487 },
  { name: '신도림', lat: 37.50894, lon: 126.89123 },
  { name: '대림', lat: 37.49344, lon: 126.89493 },
  { name: '구로디지털단지', lat: 37.48528, lon: 126.90159 },
  { name: '신대방', lat: 37.48759, lon: 126.91339 },
  { name: '신림', lat: 37.48423, lon: 126.92968 },
  { name: '봉천', lat: 37.48239, lon: 126.94194 },
  { name: '서울대입구', lat: 37.48122, lon: 126.95272 },
  { name: '낙성대', lat: 37.47706, lon: 126.96349 },
  { name: '사당', lat: 37.47658, lon: 126.98167 },
  { name: '방배', lat: 37.48147, lon: 126.99771 },
  { name: '서초', lat: 37.49177, lon: 127.00768 },
  { name: '교대', lat: 37.49366, lon: 127.0137 },
  { name: '강남', lat: 37.49795, lon: 127.02756 },
  { name: '역삼', lat: 37.50082, lon: 127.03696 },
  { name: '선릉', lat: 37.50447, lon: 127.04895 },
  { name: '삼성', lat: 37.50884, lon: 127.06314 },
  { name: '종합운동장', lat: 37.51106, lon: 127.07372 },
  { name: '잠실새내', lat: 37.51159, lon: 127.08557 },
  { name: '잠실', lat: 37.51322, lon: 127.10014 },
  { name: '잠실나루', lat: 37.52069, lon: 127.10383 },
  { name: '강변', lat: 37.53511, lon: 127.09474 },
  { name: '구의', lat: 37.53717, lon: 127.08622 },
  { name: '건대입구', lat: 37.54044, lon: 127.07086 },
  { name: '성수', lat: 37.54457, lon: 127.0561 },
  { name: '뚝섬', lat: 37.54724, lon: 127.04741 },
  { name: '한양대', lat: 37.55573, lon: 127.04366 },
  { name: '왕십리', lat: 37.56121, lon: 127.03715 },
  { name: '상왕십리', lat: 37.56439, lon: 127.02925 },
  { name: '신당', lat: 37.56538, lon: 127.01625 },
  { name: '동대문역사문화공원', lat: 37.56588, lon: 127.00816 },
  { name: '을지로4가', lat: 37.56664, lon: 126.99817 },
  { name: '을지로3가', lat: 37.56634, lon: 126.99253 },
  { name: '을지로입구', lat: 37.56595, lon: 126.98262 },
];

/**
 * Former / alternate names → canonical station name (keys already
 * normalized: no spaces, no trailing 역, no parenthetical part).
 */
export const LINE2_ALIASES: Readonly<Record<string, string>> = {
  신천: '잠실새내',
  동대문운동장: '동대문역사문화공원',
  DDP: '동대문역사문화공원',
  구로공단: '구로디지털단지',
  이화여대: '이대',
  건국대입구: '건대입구',
  서울시청: '시청',
};
