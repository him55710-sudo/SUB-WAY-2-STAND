/** Seoul Metro line identity. Colours are for line identification only. */
export type LineInfo = {
  n: number;
  name: string;
  color: string;
  onColor: string;
  /** Frequently used stations offered as one-tap filters (names as the provider reports them). */
  stations: string[];
};

export const LINES: LineInfo[] = [
  { n: 1, name: '1호선', color: '#0052A4', onColor: '#FFFFFF', stations: ['서울', '시청', '종각', '청량리', '신도림'] },
  { n: 2, name: '2호선', color: '#00A84D', onColor: '#FFFFFF', stations: ['강남', '잠실', '홍대입구', '신도림', '사당'] },
  { n: 3, name: '3호선', color: '#EF7C1C', onColor: '#FFFFFF', stations: ['교대', '고속터미널', '종로3가', '압구정', '경복궁'] },
  { n: 4, name: '4호선', color: '#00A5DE', onColor: '#FFFFFF', stations: ['서울', '사당', '혜화', '명동', '동대문역사문화공원'] },
  { n: 5, name: '5호선', color: '#996CAC', onColor: '#FFFFFF', stations: ['광화문', '여의도', '왕십리', '김포공항', '천호'] },
  { n: 6, name: '6호선', color: '#CD7C2F', onColor: '#FFFFFF', stations: ['합정', '이태원', '삼각지', '공덕', '디지털미디어시티'] },
  { n: 7, name: '7호선', color: '#747F00', onColor: '#FFFFFF', stations: ['고속터미널', '건대입구', '가산디지털단지', '노원', '강남구청'] },
  { n: 8, name: '8호선', color: '#E6186C', onColor: '#FFFFFF', stations: ['잠실', '가락시장', '천호', '복정', '모란'] },
  { n: 9, name: '9호선', color: '#BDB092', onColor: '#1A1A1A', stations: ['여의도', '고속터미널', '신논현', '김포공항', '노량진'] },
];

export function lineInfo(n: number): LineInfo {
  return LINES.find((l) => l.n === n) ?? LINES[0]!;
}

/** Provider codes: updnLine 0 = 상행/내선, 1 = 하행/외선. */
export function directionOptions(n: number): { code: '0' | '1'; label: string }[] {
  return n === 2
    ? [
        { code: '0', label: '내선' },
        { code: '1', label: '외선' },
      ]
    : [
        { code: '0', label: '상행' },
        { code: '1', label: '하행' },
      ];
}
