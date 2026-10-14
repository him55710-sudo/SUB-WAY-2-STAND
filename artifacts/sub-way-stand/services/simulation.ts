/**
 * Simulation scenarios — STUB. Owner: physics task.
 * Scenarios are entirely invented tracks, never linked to a real train.
 */
import type { GetSimulationScenario, ListSimulationScenarios, SimulationScenario } from '@/contracts';
import { SYN_A, SYN_PARAMS, trackLength } from '@/lib/physics';

const SCENARIOS: SimulationScenario[] = [
  {
    id: 'sim-syn-a',
    titleKo: '가상 선로 SYN-A 체험',
    summaryKo: '가상 선로(좌 R450 · 우 R300 곡선)를 달리는 시뮬레이션입니다. 실제 열차와 무관합니다.',
    durationS: Math.round(trackLength(SYN_A) / SYN_PARAMS.baseSpeed),
  },
];

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].id;

export const listSimulationScenarios: ListSimulationScenarios = () => SCENARIOS;

export const getSimulationScenario: GetSimulationScenario = (id) =>
  SCENARIOS.find((s) => s.id === id) ?? null;
