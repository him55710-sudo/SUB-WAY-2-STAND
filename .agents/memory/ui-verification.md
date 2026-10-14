---
name: Mobile UI verification and labeling rules
description: How to verify ride/live/degraded states (screenshots vs testing subagent), a typecheck env quirk, and the data-source labeling rule.
---

- Screenshots cannot tap, so the ride screen is reachable directly via `/ride?sim=1` (auto-starts the labeled simulation).
  To see other forecast phases (now / suppressed), temporarily change the simulation's starting elapsed time locally and
  revert afterwards — never commit that change.
  **Why:** the simulation always starts at t=0, which is the "approach" phase.

- If mobile `typecheck` fails with "Cannot find type definition file for 'node'", run `pnpm install --frozen-lockfile`
  at the repo root; it only relinks and does not change the lockfile.

- Live ride and degraded feeds (missing key, offline) need taps, so use the testing subagent. It can restart the API workflow
  with `SEOUL_SUBWAY_API_KEY=""` or stop it, then must restore it with no overrides. Give it event order, not exact seconds:
  its screenshot intervals drift by 10+ s, so a strict timing check reports a false failure.
  **Why:** a run was marked "failure" only because the "now" cue appeared earlier on its drifting clock than the plan said.

- Fixture (example) trains must never show the live source label. The ride screen's pinned source pill switches to a warn-tone
  "예시 데이터 · 실제 관측 아님" for fixture trains; simulation uses the lavender "시뮬레이션 · 가상 선로".
  **Why:** user profile rule — never present mock data as real observations.
  **How to apply:** any new screen that shows train/forecast data must carry the same three-way label (live / fixture / simulation).
  The live path no longer has fixture trains at all; the route card says "검수 노선 자료" only if every curve is `curated`.
