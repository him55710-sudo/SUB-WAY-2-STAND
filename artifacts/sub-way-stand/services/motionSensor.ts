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
 *   caller passes `enabled: false`, without sensors, when motion
 *   permission is denied, or on a sensor error.
 * - Sensors are released while the app is in the background and on unmount.
 * - Web uses browser DeviceMotion events. usePhoneMotion provides the explicit
 *   permission button required by iOS; silent/desktop sensors report unavailable.
 *
 * useSensorGate — holds the lib/sensorGate memory for a component and returns
 * the gated forecast. Live forecasts only; simulation passes through.
 *
 * This only DETECTS an ongoing stop. It never predicts one and never feeds
 * phone acceleration into the physics.
 */
import { Accelerometer, DeviceMotion, Gyroscope } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';
import { useCallback, useEffect, useState } from 'react';
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
import { useBrowserMotionSensor } from './browserMotionSensor';

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
  const webState = useBrowserMotionSensor(enabled && FLAGS.motionSensor);
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

  return Platform.OS === 'web' ? (FLAGS.motionSensor ? webState : unavailable('flag-disabled')) : state;
};

/** Explicit permission action for the ride screen. Sensors remain off until the rider taps. */
export function usePhoneMotion(options: { enabled?: boolean } = {}) {
  const allowed = options.enabled ?? true;
  const [requested, setRequested] = useState(false);
  const [failure, setFailure] = useState<MotionSensorState | null>(null);
  const sensorReading = useMotionSensor({ enabled: allowed && requested });
  const sensor = allowed ? failure ?? sensorReading : unavailable('disabled');
  const requestPermission = useCallback(async () => {
    if (!allowed || !FLAGS.motionSensor) return;
    setFailure(null);
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.isSecureContext) { setFailure(unavailable('web')); return; }
      if (!('DeviceMotionEvent' in window)) { setFailure(unavailable('no-sensor')); return; }
      const MotionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      try {
        // Called before yielding: Safari requires this within the user's tap.
        if (MotionEvent.requestPermission && (await MotionEvent.requestPermission()) !== 'granted') {
          setFailure(unavailable('permission-denied'));
          return;
        }
      } catch { setFailure(unavailable('permission-denied')); return; }
    }
    setRequested(true);
  }, [allowed]);
  const disable = useCallback(() => { setRequested(false); setFailure(null); }, []);
  useEffect(() => { if (!allowed) { setRequested(false); setFailure(null); } }, [allowed]);
  let messageKo = '휴대폰 움직임을 참고해 안내를 보수적으로 조정해요. 열차 속도나 정차를 확정하지는 않아요.';
  if (sensor.status === 'starting') messageKo = '동작 센서 신호를 기다려요. 휴대폰을 안정적으로 놓아 주세요.';
  if (sensor.status === 'active') messageKo = sensor.quality === 'handling'
    ? '휴대폰을 움직이고 있어 판단을 보류해요. 센서값은 열차 속도가 아니에요.'
    : sensor.quality === 'no-data' ? '동작 센서 측정 준비 중이에요.' : '휴대폰 움직임 측정 중 · 열차 움직임과 다를 수 있어요.';
  if (sensor.status === 'unavailable') {
    if (sensor.reason === 'permission-denied') messageKo = '동작 센서 권한이 꺼져 있어요. 브라우저·기기 설정에서 허용할 수 있어요.';
    if (sensor.reason === 'no-sensor') messageKo = '이 기기·브라우저에서 동작 센서 신호를 받을 수 없어요. 위치·열차 관측 기반 안내를 사용해요.';
    if (sensor.reason === 'web') messageKo = '동작 센서는 HTTPS와 지원되는 휴대폰 브라우저에서 사용할 수 있어요.';
    if (sensor.reason === 'flag-disabled') messageKo = '동작 센서 기능이 꺼져 있어요.';
    if (sensor.reason === 'error') messageKo = '동작 센서를 읽지 못했어요. 센서를 끄고 다시 시도해 주세요.';
  }
  return { sensor, enabled: allowed && requested, requestPermission, disable, messageKo };
}

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
