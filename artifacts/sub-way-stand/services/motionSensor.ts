/**
 * Phone motion sensing. Owner: motion-sensing task.
 *
 * useMotionSensor — reads accelerometer + gyroscope at ≈50 Hz (expo-sensors)
 * while a consumer is mounted, feeds lib/motionDetector and publishes a
 * `MotionSensorState` about twice a second.
 * - Source: DeviceMotion when available (OS sensor-fusion gravity +
 *   rotation rate); otherwise Accelerometer + Gyroscope with a low-pass
 *   gravity estimate (the gyroscope is optional; without it the forward axis
 *   is never learned).
 * - `unavailable` (and no subscription) when FLAGS.motionSensor is off, the
 *   caller passes `enabled: false`, on web, without sensors, when motion
 *   permission is denied, or on a sensor error.
 * - Sensors are released while the app is in the background and on unmount.
 *
 * useSensorGate — holds the lib/sensorGate memory for a component and returns
 * the gated forecast. Live forecasts only; simulation passes through.
 *
 * This only DETECTS an ongoing stop. It never predicts one and never feeds
 * phone acceleration into the physics.
 */
import { Accelerometer, DeviceMotion, Gyroscope } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { FLAGS } from '@/config/flags';
import type {
  Forecast,
  MotionSensorState,
  MotionSensorUnavailableReason,
  TrainCandidate,
  UseMotionSensor,
} from '@/contracts';
import {
  type DetectorSnapshot,
  type MotionSample,
  type Vec3,
  GRAVITY_MS2,
  createMotionDetector,
} from '@/lib/motionDetector';
import {
  type SensorGateMemory,
  type SensorGateResult,
  applySensorGate,
  initialSensorGateMemory,
} from '@/lib/sensorGate';

/** ≈50 Hz. */
export const SENSOR_INTERVAL_MS = 20;
export const PUBLISH_INTERVAL_MS = 500;
/** A gyro reading older than this is not attached to an accelerometer sample. */
const GYRO_MAX_AGE_MS = 200;
const DEG_TO_RAD = Math.PI / 180;

type Removable = { remove(): void };
type Source = { kind: 'device-motion' } | { kind: 'accel-gyro'; gyro: boolean };
type PermissionApi = {
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
};

const unavailable = (reason: MotionSensorUnavailableReason): MotionSensorState => ({ status: 'unavailable', reason });

function blockedReason(enabled: boolean): MotionSensorUnavailableReason | null {
  if (!FLAGS.motionSensor) return 'flag-disabled';
  if (!enabled) return 'disabled';
  if (Platform.OS === 'web') return 'web';
  return null;
}

/**
 * Maps native sensor timestamps (seconds on a boot-relative clock) to epoch
 * ms, so sample spacing stays exact even when JS receives events in bursts.
 * Re-anchors after a device sleep / clock jump; falls back to Date.now().
 */
function makeClock() {
  let offset: number | null = null;
  return (timestampS: number | undefined): number => {
    const now = Date.now();
    if (typeof timestampS !== 'number' || !Number.isFinite(timestampS) || timestampS <= 0) return now;
    const native = timestampS * 1000;
    if (offset === null || native + offset > now + 1000 || native + offset < now - 5000) offset = now - native;
    return native + offset;
  };
}

function fromDeviceMotion(m: DeviceMotionMeasurement, clock: (t?: number) => number): MotionSample | null {
  const aig = m.accelerationIncludingGravity;
  if (!aig) return null;
  const lin = m.acceleration;
  const rr = m.rotationRate;
  return {
    tMs: clock(aig.timestamp),
    accel: { x: aig.x, y: aig.y, z: aig.z },
    gravity: lin ? { x: aig.x - lin.x, y: aig.y - lin.y, z: aig.z - lin.z } : null,
    // DeviceMotion reports deg/s; the detector wants rad/s.
    gyro: rr ? { x: rr.alpha * DEG_TO_RAD, y: rr.beta * DEG_TO_RAD, z: rr.gamma * DEG_TO_RAD } : null,
  };
}

async function pickSource(): Promise<Source | null> {
  if (await DeviceMotion.isAvailableAsync().catch(() => false)) return { kind: 'device-motion' };
  const [accel, gyro] = await Promise.all([
    Accelerometer.isAvailableAsync().catch(() => false),
    Gyroscope.isAvailableAsync().catch(() => false),
  ]);
  return accel ? { kind: 'accel-gyro', gyro } : null;
}

async function ensurePermission(api: PermissionApi): Promise<boolean> {
  const current = await api.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await api.requestPermissionsAsync()).granted;
}

function toState(snap: DetectorSnapshot, source: Source, nowMs: number): MotionSensorState {
  return {
    status: 'active',
    state: snap.state,
    confidence: snap.confidence,
    quality: snap.quality,
    stateSinceMs: snap.stateSinceMs,
    forwardAxisCalibrated: snap.forwardAxisCalibrated,
    features: snap.features,
    gravitySource: snap.gravitySource ?? (source.kind === 'device-motion' ? 'device-motion' : 'low-pass'),
    updatedAtMs: nowMs,
  };
}

export const useMotionSensor: UseMotionSensor = (options = {}) => {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<MotionSensorState>(() => {
    const blocked = blockedReason(enabled);
    return blocked ? unavailable(blocked) : { status: 'starting' };
  });

  useEffect(() => {
    const blocked = blockedReason(enabled);
    if (blocked) {
      setState(unavailable(blocked));
      return;
    }

    let disposed = false;
    let source: Source | null = null;
    let subs: Removable[] = [];
    let timer: ReturnType<typeof setInterval> | null = null;
    const detector = createMotionDetector();

    const stop = () => {
      for (const s of subs) s.remove();
      subs = [];
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const fail = () => {
      stop();
      if (!disposed) setState(unavailable('error'));
    };
    const publish = () => {
      if (disposed || !source) return;
      const now = Date.now();
      setState(toState(detector.snapshot(now), source, now));
    };
    const feed = (sample: MotionSample | null) => {
      try {
        if (sample) detector.push(sample);
      } catch {
        fail();
      }
    };

    const start = () => {
      if (disposed || !source || subs.length > 0) return;
      const clock = makeClock();
      if (source.kind === 'device-motion') {
        DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);
        subs.push(DeviceMotion.addListener((m) => feed(fromDeviceMotion(m, clock))));
      } else {
        let gyro: { tMs: number; v: Vec3 } | null = null;
        if (source.gyro) {
          Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);
          subs.push(
            Gyroscope.addListener((g) => {
              gyro = { tMs: clock(g.timestamp), v: { x: g.x, y: g.y, z: g.z } };
            }),
          );
        }
        Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
        subs.push(
          Accelerometer.addListener((a) => {
            const tMs = clock(a.timestamp);
            feed({
              tMs,
              // Accelerometer reports g; the detector wants m/s².
              accel: { x: a.x * GRAVITY_MS2, y: a.y * GRAVITY_MS2, z: a.z * GRAVITY_MS2 },
              gravity: null,
              gyro: gyro && Math.abs(tMs - gyro.tMs) <= GYRO_MAX_AGE_MS ? gyro.v : null,
            });
          }),
        );
      }
      timer = setInterval(publish, PUBLISH_INTERVAL_MS);
      publish();
    };

    setState({ status: 'starting' });
    (async () => {
      try {
        const picked = await pickSource();
        if (disposed) return;
        if (!picked) {
          setState(unavailable('no-sensor'));
          return;
        }
        const granted = await ensurePermission(picked.kind === 'device-motion' ? DeviceMotion : Accelerometer);
        if (disposed) return;
        if (!granted) {
          setState(unavailable('permission-denied'));
          return;
        }
        source = picked;
        if (AppState.currentState !== 'background') start();
        else publish();
      } catch {
        fail();
      }
    })();

    // Release the sensors in the background; the detector sees the gap and resets.
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        stop();
        publish();
      } else if (s === 'active') {
        start();
      }
    });

    return () => {
      disposed = true;
      stop();
      appSub.remove();
    };
  }, [enabled]);

  return state;
};

/**
 * Applies the sensor gate to a forecast and keeps its memory across renders.
 * Uses the forecast's own `computedAt` as the gate clock (deterministic per tick).
 */
export function useSensorGate(
  forecast: Forecast,
  sensor: MotionSensorState,
  observation: TrainCandidate | null,
): SensorGateResult {
  const [memory, setMemory] = useState<SensorGateMemory>(initialSensorGateMemory);
  const result = applySensorGate({ forecast, sensor, observation, nowMs: Date.parse(forecast.computedAt), memory });
  useEffect(() => {
    if (result.memory !== memory) setMemory(result.memory);
  }, [result.memory, memory]);
  return result;
}
