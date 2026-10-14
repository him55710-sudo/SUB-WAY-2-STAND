---
name: Curve-sway forecast model decisions
description: Non-obvious choices in the live/simulated sway forecast that UI, voice and integration work must stay consistent with.
---

- `Forecast.segment` is the segment that CONTAINS `targetCurve` (so `targetCurve.startOffsetM` is placeable);
  `positionM` is the train's estimated range along that segment, 0 = not yet departed its from-station.
  When suppressed, `segment`/`positionM` describe the train's current-segment estimate instead.
  **Why:** the contract has one segment field; the curve must be locatable on it.
- A LIVE train never gets a sway direction unless the route is `curated` AND the target curve source is `curated`;
  fixture routes, `synthetic` and `station-geometry-approx` curves hold the forecast (`low-confidence`). An unverified
  curve ahead blocks verified ones behind it. Invented geometry is for the labeled simulation only.
  **Why:** design/motion-os.md requires LIVE + HOLD without verified geometry; a review rejected live directions from fixture curves.
- `etaWindowS = {0,0}` means "inside the curve now"; `min = 0` with `max > 0` means "may already be entering".
- Below-comfort curves (peak |a| < 0.15 m/s²) are skipped; if only weak curves remain the reason is `no-curve-ahead`
  (the integrator contract has no dedicated "too weak" reason). Cant-induced direction flips → `low-confidence`.
- Live confidence is effectively capped at `medium`: the ≥5 s "출발" report lag plus the speed band keep ETA spread > 5 s.
  Simulation can reach higher, but both are also capped by the curve data's own `confidence`.
  **Why:** honest uncertainty from station-level data was an explicit product requirement.
- 도착 (arrived) always suppresses as `stationary`, regardless of age, until a newer observation arrives.
