---
name: Phone motion sensing decisions
description: Semantics of the phone stop detector + live-forecast sensor gate that integration work must keep consistent.
---

- The phone sensor only DETECTS an ongoing stop and may only HOLD a live forecast (suppress as existing
  `stationary` / `delayed`); it never creates, moves or strengthens one, and simulation is never gated.
  **Why:** task scope + user rule that nothing simulated/estimated is presented as more than it is.
- A held stop is released only by a provider observation newer than the stop start (or another train).
  A non-decisive window (handling / low confidence / stale / no-data) keeps the last hold instead of releasing it.
  **Why:** contaminated windows must neither confirm a restart nor end a stop.
- Detector thresholds are hand-picked uncalibrated defaults; tests use synthetic traces only. Don't describe
  them as tuned or validated on Seoul rides.
- Gyro is used only as a magnitude (platform axis conventions differ); forward axis comes from post-departure accel.
- iOS motion permission text lives in the expo-sensors config plugin; Expo Go ignores it (dev builds only).
