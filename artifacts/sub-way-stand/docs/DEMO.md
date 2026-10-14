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

## Path A — Simulation (guaranteed, ~70 s)

Use this path first. It works offline and without the API key. Times are
measured from the tap and come from the simulation model (one lap ≈ 113 s).

| Time | Do | Say |
|---|---|---|
| 0:00 | On **열차 선택**, tap **시뮬레이션으로 체험**. | "This is a virtual train on Line 2, 신촌 to 홍대입구, using curves we approximated from station coordinates. It is clearly labeled simulation, not a real train." |
| 0:00–0:08 | **탑승 안내** opens on **정차 중**. Point at the pinned **시뮬레이션 · 가상 선로** pill and the **가상 주행** badge on the route card. | "While the train is stopped there is no forecast. The app pauses instead of guessing." |
| ~0:08 | The hero switches to a sway direction (**오른쪽**) with a countdown window, e.g. "47–58초". | "Every second it computes which side you'll be pushed to and the time window until curve entry, as a range, not a single number. The route card shows the curve ahead: left, radius 840 m." |
| 0:10–0:45 | Open **왜 이렇게 예측했나요?** and walk through the lines while the countdown runs. Optionally toggle **음성 안내** off and on. | "Each forecast explains itself: which curve, its radius and source, speed and position. Voice can be muted instantly, and turning it back on never replays an old warning." |
| ~0:49 | Phone speaks: **"시뮬레이션 안내: 약 10초 후 왼쪽 곡선입니다. 오른쪽으로 쏠림에 대비하세요."** + one vibration pulse. | "That's the pre-warning, about 10 seconds before the earliest possible entry. Note the 'simulation' prefix, so it can never be mistaken for a live train." |
| ~0:59 | Phone speaks: **"시뮬레이션 안내: 지금 곡선 진입. 오른쪽 쏠림 주의."** + three strong taps. | "And that's the entry cue, with a different vibration so you can tell them apart without looking. Left curve, so you're pushed right: a = v²/R." |
| ~1:24 | Hero shows **예고할 곡선 없음**, then **정차 중** at 홍대입구 (~1:44). | "One warning and one cue per curve, no repeats. The gentle first curve (R2050) is below the comfort threshold, so it is never announced." |

If you miss a cue, the lap restarts at ~1:53 and announces again.

## Path B — Live train (~40 s)

| Time | Do | Say |
|---|---|---|
| 0:00 | Back to **열차 선택**. Show the **실시간** banner and the Line 2 list with per-train freshness (`N초 전 관측`). | "These are real trains from the Seoul Open Data realtime feed, through our server proxy. The API key never reaches the phone." |
| 0:10 | Tap a train that is moving (state 출발 or 진입). | "The feed is station-level only: last station, state and timestamp. No speed, no GPS." |
| 0:15 | On **탑승 안내**, point at **실시간 관측 기반 추정**, the freshness badge and the route card badge **역 좌표 근사 곡선**. | "We place the train between stations from that state, as a range, on our Line 2 route model." |
| 0:25 | The hero shows **확신이 낮아 안내 보류**. Open **왜 이렇게 예측했나요?**. | "This is the honest part. The curve ahead comes from station coordinates, not surveyed track, so for a real train the app refuses to give a direction and says why, instead of guessing. Voice never speaks while held. With verified curve data the same pipeline would speak; our integration tests prove that path." |

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

## Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| No voice on phone | Volume / silent switch; device has no Korean TTS voice (card shows 사용 불가). Install a Korean voice in the OS TTS settings. |
| No voice in browser | Browser has no Korean voice, or the tab was never clicked (autoplay policy). Click once, or use the phone. |
| No vibration | Web browsers mostly don't support it; `EXPO_PUBLIC_FLAG_HAPTICS=0` disables it. |
| Live list empty | Key missing, quota hit, or flag `EXPO_PUBLIC_FLAG_LIVE_TRAINS=0`. Use the simulation. |
| Simulation button missing | `EXPO_PUBLIC_FLAG_SIMULATION_FALLBACK=0`. Unset it and restart Expo. |
