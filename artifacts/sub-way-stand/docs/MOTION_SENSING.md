# Phone motion sensing — stop detection

The live feed reports trains at station level only. When a train halts
between stations, the feed shows nothing new until the estimator's own
`delayed` bound runs out, so a curve countdown (and a voice warning) could
keep running for a train that is standing still. The rider's phone can see
that stop while it is happening.

Code: `lib/motionDetector.ts` (detector), `lib/sensorGate.ts` (gate),
`services/motionSensor.ts` (`useMotionSensor`, `useSensorGate`). Tests:
`tests/motionDetector.test.ts`, `tests/sensorGate.test.ts` (synthetic traces).
The ride screen wiring is a separate integration step; this module does not
change any screen.

## Detected, not predicted

| | |
|---|---|
| **Detected** | The train is standing still now (`stationary`), moving, or changing speed (`speed-changing`, or `accelerating` / `decelerating` once a forward axis is known). |
| **Not predicted** | When a train will stop, how long a stop will last, jolts or irregular vibration ahead. |
| **Never used for** | Train speed or acceleration in the physics. Phone acceleration includes the rider's own movement and is never fed into the forecast. |

Every user-facing line the gate writes says the stop was **detected by the
phone sensor** and is **not a prediction**.

## What the gate does (live forecasts only)

| Phone reading | Latest feed state | Result |
|---|---|---|
| Stop, confident | 출발 / 전역출발 (between stations) | Forecast suppressed as `stationary`: no sway, no ETA, confidence `unavailable`. The guidance rules then cancel any pending speech. |
| Stop, confident | 진입 / 도착 (at a station) | No change: normal dwell. |
| Renewed motion after such a stop | same observation | Suppressed as `delayed` until the feed sends an observation newer than the stop start (the position estimate no longer holds). |
| Handling, low confidence, stale, no data | any | No new decision. Without a stop already held, the forecast passes through. With one held, the last hold stays. |
| Sensor off, web, no sensor, permission denied | any | No effect at all. |
| Simulation forecast | — | Never touched. |

The gate can only hold a forecast. It never creates, moves or strengthens one,
and a forecast the estimator already suppressed keeps its own reason.

## Detector in short

- ≈50 Hz accelerometer + gyroscope. DeviceMotion supplies OS gravity
  separation when available; otherwise gravity is a low-pass estimate.
- Features: running-vibration RMS (1.5 s), sustained horizontal acceleration
  (2 s mean, gravity removed), gyro rotation rate, gravity-direction change.
- **Handling** (picked up, rotated, carried while walking): rotation, tilt
  change or shake above a threshold. While handled, and for 2 s afterwards,
  the state is frozen and confidence decays. No stop or restart is decided
  from a contaminated window.
- **Hysteresis**: `stationary` needs 4 s of low vibration and low horizontal
  acceleration; leaving it needs 3 s of motion evidence. Short pauses and bumps
  do not flip the state.
- **Forward axis**: learned from the acceleration just after a confirmed
  stop → move transition; dropped when the phone rotates more than 20°, after a
  sample gap, or without a gyroscope. Without it, speed changes are
  `speed-changing` (which can also be lateral acceleration in a curve).

## Where the thresholds come from

All thresholds are named constants at the top of `lib/motionDetector.ts`
and `lib/sensorGate.ts`. They are **uncalibrated defaults**: plausible
magnitudes for a phone on a metro train, picked by hand. None was fitted to
Seoul (or any) recorded rides. The tests use generated (synthetic) traces, so
they check the logic, not real-world accuracy.

## Limits

- **Handheld phone**: frequent handling keeps the detector in `handling`, so
  it makes few decisions. That is the safe direction (no hold), but a stop may
  go undetected.
- **Pocket or bag**: body movement adds vibration and rotation. A stop may be
  detected late or not at all, and walking is treated as handling.
- **No Seoul calibration**: vibration levels differ by train type, speed and
  track. A very smooth, slow train could look still; a stopped train with
  running HVAC or people moving nearby could look like it is moving.
- **Low-pass gravity fallback** (no DeviceMotion): after hard braking the
  estimate takes several seconds to settle, so the stop is detected later.
- Detection needs about 4 s of stillness, so very short halts are not held.
- iOS asks for motion permission (text set in `app.json`). Denied permission
  means `unavailable`, with no effect on any forecast.
- Turned off with `EXPO_PUBLIC_FLAG_MOTION_SENSOR=0` (see `config/flags.ts`).
