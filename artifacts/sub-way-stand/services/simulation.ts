/**
 * Simulation scenarios. Owner: physics task.
 *
 * One deterministic station-to-station ride on a Line 2 segment from the
 * route data (falls back to the invented SYN-A segment when no curved route
 * segment exists). Simulated rides are never linked to a real train.
 */
import type {
  GetSimulationScenario,
  ListSimulationScenarios,
  RouteData,
  SimulationScenario,
} from '@/contracts';
import { buildSimRide } from '@/lib/simulationRide';
import type { SimRide } from '@/lib/simulationRide';
import { getRoute } from '@/services/trains';

export const SIMULATION_LINE = 2;
export const DEFAULT_SCENARIO_ID = 'sim-line2-ride';

let cache: { route: RouteData | null; ride: SimRide } | null = null;

/** Built lazily (and rebuilt only if the route data object changes). */
function ride(): SimRide {
  let route: RouteData | null = null;
  try {
    route = getRoute(SIMULATION_LINE);
  } catch {
    route = null;
  }
  if (!cache || cache.route !== route) cache = { route, ride: buildSimRide(route) };
  return cache.ride;
}

function scenario(): SimulationScenario {
  const r = ride();
  const curveText = r.segment.curves
    .map((c) => `${c.turn === 'left' ? '좌' : '우'} R${Math.round(c.radiusM)}`)
    .join(' · ');
  return {
    id: DEFAULT_SCENARIO_ID,
    titleKo: `${r.label} 주행 시뮬레이션`,
    summaryKo: `정차 → 가속 → 곡선(${curveText}) → 정차를 반복 재생합니다. 실제 열차와 무관한 시뮬레이션입니다.${
      r.usesRouteData ? '' : ' (노선 곡선 데이터가 없어 가상 구간을 사용합니다.)'
    }`,
    durationS: r.durationS,
  };
}

export const listSimulationScenarios: ListSimulationScenarios = () => [scenario()];

export const getSimulationScenario: GetSimulationScenario = (id) =>
  id === DEFAULT_SCENARIO_ID ? scenario() : null;

/** Simulated ride behind a scenario id (used by the forecast service). */
export function getSimulationRide(id: string): SimRide | null {
  return id === DEFAULT_SCENARIO_ID ? ride() : null;
}
