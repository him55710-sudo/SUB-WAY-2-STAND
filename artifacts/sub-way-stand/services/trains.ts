/**
 * Trains + route service — STUB. Owner: backend/data task.
 *
 * Currently returns bundled FIXTURE trains (origin "fixture") and makes no
 * network calls. The real implementation should call GET /api/subway/trains
 * via @workspace/api-client-react and keep these exported signatures.
 */
import { useCallback, useMemo } from 'react';
import { FLAGS } from '@/config/flags';
import type {
  FeedStatus,
  FindSegment,
  GetRoute,
  TrainCandidate,
  UseTrackedTrain,
  UseTrainCandidates,
} from '@/contracts';
import { FIXTURE_ROUTES } from '@/data/routes';

const FIXTURE_OBSERVED_AT = '2026-01-01T00:00:00.000Z';

function fixtureTrain(
  id: string,
  station: string,
  directionCode: '0' | '1',
  state: string,
  stateCode: TrainCandidate['stateCode'],
): TrainCandidate {
  return {
    id,
    line: 2,
    station,
    direction: directionCode === '0' ? '내선' : '외선',
    directionCode,
    destination: directionCode === '0' ? '성수' : '잠실',
    state,
    stateCode,
    observedAt: FIXTURE_OBSERVED_AT,
    fresh: false,
    express: false,
    lastTrain: false,
    origin: 'fixture',
  };
}

const FIXTURE_TRAINS: TrainCandidate[] = [
  fixtureTrain('2041', '강남', '1', '출발', '2'),
  fixtureTrain('2213', '역삼', '1', '도착', '1'),
  fixtureTrain('2335', '선릉', '0', '진입', '0'),
];

const FIXTURE_FEED: FeedStatus = {
  status: 'offline',
  message: '실시간 연결 전 — 예시(픽스처) 열차입니다. 실제 운행 정보가 아닙니다.',
  fetchedAt: null,
  cached: false,
  origin: 'fixture',
};

const DISABLED_FEED: FeedStatus = {
  status: 'offline',
  message: '실시간 열차 기능이 꺼져 있습니다. 시뮬레이션으로 체험해 주세요.',
  fetchedAt: null,
  cached: false,
  origin: 'fixture',
};

const noop = () => {};

export const useTrainCandidates: UseTrainCandidates = ({ line, direction, station }) => {
  const candidates = useMemo(() => {
    if (!FLAGS.liveTrains) return [];
    return FIXTURE_TRAINS.filter(
      (t) =>
        t.line === line &&
        (direction === undefined || t.directionCode === direction) &&
        (station === undefined || t.station === station),
    );
  }, [line, direction, station]);
  const refresh = useCallback(noop, []);
  return {
    candidates,
    feed: FLAGS.liveTrains ? FIXTURE_FEED : DISABLED_FEED,
    isLoading: false,
    refresh,
  };
};

export const useTrackedTrain: UseTrackedTrain = (line, trainId) => {
  const train = useMemo(() => {
    if (!FLAGS.liveTrains || trainId === null) return null;
    return FIXTURE_TRAINS.find((t) => t.line === line && t.id === trainId) ?? null;
  }, [line, trainId]);
  return {
    train,
    feed: FLAGS.liveTrains ? FIXTURE_FEED : DISABLED_FEED,
    isLoading: false,
    lost: false,
  };
};

export const getRoute: GetRoute = (line) => FIXTURE_ROUTES[line] ?? null;

export const findSegment: FindSegment = (line, station, directionCode, end) => {
  const route = getRoute(line);
  if (!route) return null;
  return (
    route.segments.find(
      (s) => s.directionCode === directionCode && (end === 'into' ? s.to === station : s.from === station),
    ) ?? null
  );
};
