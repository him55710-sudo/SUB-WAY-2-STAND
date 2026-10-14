---
name: Mobile UI verification and labeling rules
description: How to screenshot the ride screen without taps, a typecheck env quirk, and the honesty rule for fixture/simulation labels.
---

- Screenshots cannot tap, so the ride screen is reachable directly via `/ride?sim=1` (auto-starts the labeled simulation).
  To see other forecast phases (now / suppressed), temporarily change the simulation's starting elapsed time locally and
  revert afterwards — never commit that change.
  **Why:** the simulation always starts at t=0, which is the "approach" phase.

- If mobile `typecheck` fails with "Cannot find type definition file for 'node'", run `pnpm install --frozen-lockfile`
  at the repo root; it only relinks and does not change the lockfile.

- Fixture (example) trains must never show the live source label. The ride screen's pinned source pill switches to a warn-tone
  "예시 데이터 · 실제 관측 아님" for fixture trains; simulation uses the lavender "시뮬레이션 · 가상 선로".
  **Why:** user profile rule — never present mock data as real observations.
  **How to apply:** any new screen that shows train/forecast data must carry the same three-way label (live / fixture / simulation).
