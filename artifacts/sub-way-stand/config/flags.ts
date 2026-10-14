/**
 * Feature flags + app config. Owner: integrator.
 *
 * Every flag defaults to ON. Turn one off for a demo/fallback by setting the
 * matching env var to "0" before starting Expo, e.g.
 *   EXPO_PUBLIC_FLAG_LIVE_TRAINS=0
 *
 * Required fallback when a flag is OFF (services must honour this):
 * - liveTrains:         no network calls; candidate list is empty with an
 *                       explanatory feed message; users use the simulation.
 * - physicsForecast:    useForecast returns a suppressed forecast
 *                       (suppressReason "flag-disabled").
 * - voiceGuidance:      useGuidance reports available=false and never speaks.
 * - haptics:            no haptic feedback is fired.
 * - simulationFallback: the "시뮬레이션으로 체험" entry is hidden.
 */
export interface FeatureFlags {
  liveTrains: boolean;
  physicsForecast: boolean;
  voiceGuidance: boolean;
  haptics: boolean;
  simulationFallback: boolean;
}

// Expo inlines EXPO_PUBLIC_* only for static `process.env.EXPO_PUBLIC_X` reads.
const off = (value: string | undefined) => value === '0' || value === 'false';

export const FLAGS: Readonly<FeatureFlags> = Object.freeze({
  liveTrains: !off(process.env.EXPO_PUBLIC_FLAG_LIVE_TRAINS),
  physicsForecast: !off(process.env.EXPO_PUBLIC_FLAG_PHYSICS_FORECAST),
  voiceGuidance: !off(process.env.EXPO_PUBLIC_FLAG_VOICE_GUIDANCE),
  haptics: !off(process.env.EXPO_PUBLIC_FLAG_HAPTICS),
  simulationFallback: !off(process.env.EXPO_PUBLIC_FLAG_SIMULATION_FALLBACK),
});

export const APP_CONFIG = Object.freeze({
  /** Line shown on the train-select screen. */
  defaultLine: 2,
  /** Forecast recompute interval. */
  forecastTickMs: 1000,
});
