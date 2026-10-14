/**
 * Forecast service. Owner: physics task.
 *
 * Recomputes every `APP_CONFIG.forecastTickMs` (1 s):
 * - live selection: newest observation of the tracked train (trains service)
 *   → lib/forecastEngine, source "live-estimate". A newer observation
 *   restarts the estimate; older out-of-order ones are ignored.
 * - simulation selection: deterministic simulated ride → lib/simulationRide,
 *   source "simulation".
 * Never throws: any error becomes a suppressed forecast.
 */
import { useEffect, useState } from 'react';
import { APP_CONFIG, FLAGS } from '@/config/flags';
import type { RideSelection, TrainCandidate, UseForecast } from '@/contracts';
import {
  computeLiveForecast,
  newerObservation,
  safeForecast,
  suppressedForecast,
} from '@/lib/forecastEngine';
import { simulateForecast } from '@/lib/simulationRide';
import { getSimulationRide } from '@/services/simulation';
import { findSegment, getRoute, useTrackedTrain } from '@/services/trains';

type Latest = { selection: RideSelection | null; observation: TrainCandidate | null };

export const useForecast: UseForecast = (selection) => {
  const live = selection?.kind === 'live' ? selection : null;
  const tracked = useTrackedTrain(live?.line ?? 0, live?.trainId ?? null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [latest, setLatest] = useState<Latest>({ selection: null, observation: null });

  useEffect(() => {
    setNowMs(Date.now());
    if (!selection) return;
    const id = setInterval(() => setNowMs(Date.now()), APP_CONFIG.forecastTickMs);
    return () => clearInterval(id);
  }, [selection]);

  // Newest observation for the current selection.
  const stored = latest.selection === selection ? latest.observation : null;
  const fromFeed =
    live && tracked.train && tracked.train.id === live.trainId && tracked.train.line === live.line
      ? tracked.train
      : null;
  const observation = live ? newerObservation(newerObservation(live.initial, stored), fromFeed) : null;

  useEffect(() => {
    if (observation !== stored) setLatest({ selection, observation });
  }, [observation, stored, selection]);

  if (!selection) {
    return suppressedForecast({
      source: 'live-estimate',
      reason: 'no-selection',
      lines: ['선택된 열차가 없습니다.'],
      nowMs,
    });
  }
  const source = selection.kind === 'simulation' ? 'simulation' : 'live-estimate';
  if (!FLAGS.physicsForecast) {
    return suppressedForecast({
      source,
      reason: 'flag-disabled',
      lines: ['흔들림 예측 기능이 꺼져 있습니다.'],
      nowMs,
    });
  }

  if (selection.kind === 'simulation') {
    return safeForecast('simulation', nowMs, () => {
      const ride = getSimulationRide(selection.scenarioId);
      if (!ride) {
        return suppressedForecast({
          source: 'simulation',
          reason: 'invalid-input',
          lines: ['[시뮬레이션] 알 수 없는 시나리오입니다.'],
          nowMs,
        });
      }
      const startMs = Date.parse(selection.selectedAt);
      const elapsedS = Number.isFinite(startMs) ? Math.max(0, (nowMs - startMs) / 1000) : 0;
      return simulateForecast(ride, elapsedS, nowMs);
    });
  }

  return safeForecast('live-estimate', nowMs, () => {
    if (!observation) {
      return suppressedForecast({
        source: 'live-estimate',
        reason: tracked.isLoading ? 'loading' : 'feed-unavailable',
        lines: [tracked.isLoading ? '열차 정보를 불러오는 중입니다.' : '열차 관측 정보를 받을 수 없습니다.'],
        nowMs,
      });
    }
    return computeLiveForecast({
      train: observation,
      nowMs,
      route: getRoute(selection.line),
      findSegment,
      lost: tracked.lost,
    });
  });
};
