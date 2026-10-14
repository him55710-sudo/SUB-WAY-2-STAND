# SUB WAY 2 STAND — 2-minute judge demo

**One-line pitch:** "If you stand on the subway, this app tells you, in Korean
and with a vibration, which way you will sway before the curve. It never pretends
to know more than the data allows."

## Before you start (1 minute of setup, not part of the 2 minutes)

- Phone with **Expo Go**: scan the QR code from the `expo` workflow. Use a
  phone for voice and vibration. Volume up, silent mode off (Android), or
  use earphones.
- Check that the **API Server** workflow is running. If you want the live path,
  `SEOUL_SUBWAY_API_KEY` must be set in Secrets.
- Backup: the web preview works too. If the browser has no Korean voice, the
  voice card shows **사용 불가** ("이 기기 또는 설정에서 사용할 수 없어요"),
  which is the intended silent fallback. Narrate the on-screen text instead.
- Shortcut: `/ride?sim=1` opens the simulation directly.

---

## Path A — Simulation (follow the on-screen events)

Use this path first. The bundled simulation needs no live API key. The current
preferred segment is 잠실→잠실나루, from an unverified OSM railway centerline.
Use the displayed route, radius and countdown; do not recite old fixed demo
times or station-coordinate radii. Cant is unknown and explicitly assumed zero.

| Time | Do | Say |
|---|---|---|
| Start | On **열차 선택**, tap the simulation button. | "This is a virtual run on the displayed Line 2 segment using an unverified mapped railway path. The speed is simulated; it is not a real train measurement." |
| 0:00–0:08 | **탑승 안내** opens on **정차 중**. Point at the pinned **시뮬레이션 · 가상 선로** pill and the **가상 주행** badge on the route card. | "While the train is stopped there is no forecast. The app pauses instead of guessing." |
| After departure | Open the explanation card and point to the curve source, speed envelope and cant assumption. | "The model includes track-plane projection and cant: a = v²κ cosθ − g sinθ. It checks speed throughout the curve, not just peak speed." |
| Countdown enters the warning window | Show the direction and range; listen for the simulation-prefixed warning if Korean TTS is available. | "The range reflects assumptions in this simulation. Bounds are rounded outward. The arrow uses the travel direction as its reference." |
| Curve entry | Show the entry cue and the simulation label. | "With zero cant this left curve produces an outward push to the right. Known cant can reverse the direction at low speed, so conflicting predictions are held." |
| End of run | Show braking, then the next station dwell. | "Each curve gets one warning per approach. The 0.15 m/s² display threshold is an app setting, not a proven human comfort or safety limit." |

If you miss a cue, use the replay control or wait for the next simulated lap.

## Path B — Live train (~40 s)

| Time | Do | Say |
|---|---|---|
| 0:00 | Back to **열차 선택**. Show the **실시간** banner and the Line 2 list with per-train freshness (`N초 전 관측`). | "These are real trains from the Seoul Open Data realtime feed, through our server proxy. The API key never reaches the phone." |
| 0:10 | Tap a train that is moving (state 출발 or 진입). | "The feed is station-level only: last station, state and timestamp. No speed, no GPS." |
| 0:15 | On **탑승 안내**, point at **실시간 관측 기반 추정**, the freshness badge and the route card badge **역 좌표 근사 곡선**. | "We place the train between stations from that state, as a range, on our Line 2 route model." |
| 0:25 | Show the prediction hold and open the explanation card. | "The route is mapped or approximated, with no verified cant or actual speed. The app holds live direction guidance. Invented fixtures test the verified-data path; those tests do not establish real train accuracy." |

A stopped train shows **정차 중**; an old observation shows a stale reason; a
train that vanishes from the feed is marked **피드에서 사라짐**. A **캐시** badge
under the source pill means the server reused its last response (≤30 s old);
the freshness badge still shows the real observation age.

**If live data is not available**, the banner says so instead of showing any
trains: **키 없음** (no `SEOUL_SUBWAY_API_KEY`), **호출 한도** (daily quota),
or **연결 불가** (API server or provider unreachable). On the ride screen the
same state appears as a badge under the source pill. Say: "No live data right
now, and the app says so instead of faking it," then go back to Path A. The
simulation button stays on the screen in all of these cases.

## Closing line (10 s)

"Physics-based, explainable, and honest about uncertainty. Simulation is always
labeled, live forecasts are ranges, and when in doubt, it stays quiet."

For accuracy questions, show [물리 검증 결과와 심사 Q&A](PHYSICS_VALIDATION.md).
State that the analytical checks passed and field accuracy has not yet been measured.

## Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| No voice on phone | Volume / silent switch; device has no Korean TTS voice (card shows 사용 불가). Install a Korean voice in the OS TTS settings. |
| No voice in browser | Browser has no Korean voice, or the tab was never clicked (autoplay policy). Click once, or use the phone. |
| No vibration | Web browsers mostly don't support it; `EXPO_PUBLIC_FLAG_HAPTICS=0` disables it. |
| Live list empty | Key missing, quota hit, or flag `EXPO_PUBLIC_FLAG_LIVE_TRAINS=0`. Use the simulation. |
| Simulation button missing | `EXPO_PUBLIC_FLAG_SIMULATION_FALLBACK=0`. Unset it and restart Expo. |
