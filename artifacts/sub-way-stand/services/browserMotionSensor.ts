import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { MotionSensorState } from '@/contracts';
import { browserMotionSample } from '../lib/browserMotion';
import { createMotionDetector } from '../lib/motionDetector';

/** The caller must request iOS motion permission from its button handler before enabling. */
export function useBrowserMotionSensor(enabled: boolean): MotionSensorState {
  const [state, setState] = useState<MotionSensorState>({ status: 'unavailable', reason: 'disabled' });
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') {
      setState({ status: 'unavailable', reason: 'disabled' });
      return;
    }
    if (typeof window === 'undefined' || !window.isSecureContext) {
      setState({ status: 'unavailable', reason: 'web' });
      return;
    }
    if (!('DeviceMotionEvent' in window)) {
      setState({ status: 'unavailable', reason: 'no-sensor' });
      return;
    }
    let detector = createMotionDetector();
    let timer: ReturnType<typeof setInterval> | null = null;
    let received = false;
    let startedAt = Date.now();
    const onMotion = (event: DeviceMotionEvent) => {
      const sample = browserMotionSample(event, Date.now(), performance.timeOrigin);
      if (!sample) return;
      received = true;
      detector.push(sample);
    };
    const stop = () => {
      window.removeEventListener('devicemotion', onMotion);
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (document.hidden || timer !== null) return;
      detector = createMotionDetector();
      received = false;
      startedAt = Date.now();
      setState({ status: 'starting' });
      window.addEventListener('devicemotion', onMotion);
      timer = setInterval(() => {
        const now = Date.now();
        if (!received) {
          if (now - startedAt >= 5_000) { stop(); setState({ status: 'unavailable', reason: 'no-sensor' }); }
          return;
        }
        const snapshot = detector.snapshot(now);
        setState({ ...snapshot, status: 'active', gravitySource: snapshot.gravitySource ?? 'low-pass', updatedAtMs: now });
      }, 500);
    };
    const onVisibility = () => {
      if (document.hidden) { stop(); setState({ status: 'starting' }); }
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled]);
  return state;
}
