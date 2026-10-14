/** Permission/watch lifecycle, independent of React and browser/native APIs. */
import { LOCATION_MAX_AGE_MS, nearestLine2Stations, positionIssue, type NearbyStation, type RiderPosition } from './location.ts';

export type LocationStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';
export interface LocationState {
  status: LocationStatus;
  position: RiderPosition | null;
  nearestStations: NearbyStation[];
  messageKo: string;
}
export type LocationFailure = { status: 'denied' | 'unavailable' | 'error'; messageKo?: string };
export type LocationWatch = (
  onPosition: (position: RiderPosition) => void,
  onError: (error: LocationFailure) => void,
) => Promise<() => void>;

export const LOCATION_INITIAL: LocationState = {
  status: 'idle', position: null, nearestStations: [],
  messageKo: '내 위치로 가까운 2호선 역을 찾아요. 지하에서는 위치가 잡히지 않을 수 있어요.',
};
export const LOCATION_WAIT_MS = 20_000;
const FAILURE_COPY = {
  denied: '위치 권한이 꺼져 있어요. 브라우저·기기 설정에서 허용하거나 역을 직접 선택해 주세요.',
  unavailable: '위치를 확인할 수 없어요. 지하에서는 GPS가 잡히지 않을 수 있어요. 역을 직접 선택해 주세요.',
  error: '위치를 불러오지 못했어요. 다시 시도하거나 역을 직접 선택해 주세요.',
};

type Clock = { now(): number; later(callback: () => void, ms: number): unknown; cancel(timer: unknown): void };
const realClock: Clock = {
  now: Date.now, later: (callback, ms) => setTimeout(callback, ms),
  cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Late permission/watch resolutions are cancelled; failed or stopped watches never update state. */
export function createLocationClient(watch: LocationWatch, clock: Clock = realClock) {
  let state: LocationState = LOCATION_INITIAL;
  let generation = 0;
  let disposeWatch: (() => void) | null = null;
  let timer: unknown = null;
  const listeners = new Set<(value: LocationState) => void>();
  const publish = (next: LocationState) => { state = next; for (const listener of listeners) listener(next); };
  const release = () => {
    if (timer !== null) clock.cancel(timer);
    timer = null;
    disposeWatch?.();
    disposeWatch = null;
  };
  const fail = (failure: LocationFailure) => {
    generation += 1;
    release();
    publish({ status: failure.status, position: null, nearestStations: [], messageKo: failure.messageKo ?? FAILURE_COPY[failure.status] });
  };
  const requestLocation = async () => {
    const own = ++generation;
    release();
    publish({ status: 'requesting', position: null, nearestStations: [], messageKo: '위치 권한을 확인하고 가까운 역을 찾고 있어요…' });
    timer = clock.later(() => {
      if (own === generation) fail({ status: 'unavailable' });
    }, LOCATION_WAIT_MS);
    try {
      const cleanup = await watch((position) => {
        if (own !== generation) return;
        const now = clock.now();
        const issue = positionIssue(position, now);
        if (issue) {
          if (issue === 'inaccurate') publish({ status: 'requesting', position: null, nearestStations: [],
            messageKo: '위치 오차가 커서 더 정확한 신호를 기다려요. 역을 직접 선택할 수도 있어요.' });
          return;
        }
        const nearestStations = nearestLine2Stations(position, now);
        publish({ status: 'active', position, nearestStations,
          messageKo: nearestStations.length
            ? `위치 오차 약 ${Math.round(position.accuracyM)}m · 가까운 2호선 역이에요. 탑승 역과 방향을 직접 확인해 주세요.`
            : '5km 안에 2호선 본선 역이 없어요. 역을 직접 검색해 주세요.' });
        if (timer !== null) clock.cancel(timer);
        timer = clock.later(() => {
          if (own === generation) fail({ status: 'unavailable', messageKo: '위치 신호가 오래되어 추천을 멈췄어요. 지하에서는 역을 직접 선택해 주세요.' });
        }, Math.max(1, LOCATION_MAX_AGE_MS - (now - position.timestampMs)));
      }, (failure) => { if (own === generation) fail(failure); });
      if (own !== generation) cleanup();
      else disposeWatch = cleanup;
    } catch (error) {
      if (own !== generation) return;
      const failure = error as Partial<LocationFailure> | null;
      fail({ status: failure?.status === 'denied' || failure?.status === 'unavailable' ? failure.status : 'error', messageKo: failure?.messageKo });
    }
  };
  const stop = () => { generation += 1; release(); publish(LOCATION_INITIAL); };
  return {
    getState: () => state, requestLocation, stop,
    subscribe(listener: (value: LocationState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() { listeners.clear(); generation += 1; release(); },
  };
}
