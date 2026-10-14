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
  voice card shows **사용할 수 없음**, which is the intended silent fallback.
  Narrate the on-screen text instead.

---

## Path A — Simulation (guaranteed, ~60 s)

Use this path first. It works offline and without the API key.

| Time | Do | Say |
|---|---|---|
| 0:00 | On **열차 선택**, tap **시뮬레이션으로 체험** (가상 선로 SYN-A). | "This is an invented track: a left curve with a 450 m radius, then a right curve with a 300 m radius. It is clearly labeled simulation." |
| 0:05 | **탑승 안내** opens. Point at the `[시뮬레이션]` title and the forecast card. | "Every second it computes which side you'll be pushed to, the time window until curve entry, and lateral acceleration as ranges, not single numbers." |
| ~0:07 | Phone speaks: **"시뮬레이션 안내: 약 10초 후 왼쪽 곡선입니다. 오른쪽으로 쏠림에 대비하세요."** + one vibration pulse. | "That's the pre-warning, about 10 seconds before the earliest possible entry. Note the 'simulation' prefix, so it can never be mistaken for a live train." |
| ~0:16 | Phone speaks: **"시뮬레이션 안내: 지금 곡선 진입. 오른쪽 쏠림 주의."** + three strong taps. | "And that's the entry cue, with a different vibration so you can tell them apart without looking." |
| ~0:18 | Point at the explanation lines while the train is inside the curve (forecast suppressed). | "Inside the curve the forecast pauses and explains why. It doesn't repeat itself; each curve gets one warning and one cue." |
| ~0:22 | Toggle **음성 안내** off, then on. | "Voice can be muted instantly. Vibration still works, and turning voice back on never replays an old warning." |
| ~0:29 | The second curve (right, R300) is announced: "…오른쪽 곡선입니다. 왼쪽으로 쏠림에 대비하세요." | "Right curve, so you lean left. The direction comes from physics: a = v²/R." |

The simulated loop repeats about every 48 s, so you can wait for the next
announcement if you miss one. Times are approximate.

## Path B — Live train (~45 s)

| Time | Do | Say |
|---|---|---|
| 0:00 | Back to **열차 선택**. Show the live list for line 2 and the feed status line. | "These are real trains from the Seoul Open Data realtime feed, through our server proxy. The API key never reaches the phone." |
| 0:10 | Tap a train that is moving (state 출발 or 전역출발 if available). | "The feed is station-level only: last station, state and timestamp. No speed, no GPS." |
| 0:15 | On **탑승 안내**, point at **실시간 추정** and the state/reason. | "So live forecasts are estimates with ranges, built from station positions and approximate curve geometry." |
| 0:25 | Most likely the forecast is **중지** (stopped at a station, stale or uncertain). Point at the reason. | "This is the honest part: when the data can't support a forecast, it stays silent and tells you why, instead of guessing. Voice never speaks while suppressed." |
| 0:35 | If the forecast is active, wait for the spoken pre-warning (no simulation prefix). | "When it's confident enough, the same voice and vibration cues run on the live estimate." |

**If live data is not available** (no key, quota, upstream down), the feed
status says so (`missing_key` / `quota` / `unavailable`), and any example trains
are tagged **[예시]**. Say: "No live data right now, and the app says so
instead of faking it," then return to Path A.

## Closing line (10 s)

"Physics-based, explainable, and honest about uncertainty. Simulation is always
labeled, live forecasts are ranges, and when in doubt, it stays quiet."

## Quick troubleshooting

| Symptom | Cause / fix |
|---|---|
| No voice on phone | Volume / silent switch; device has no Korean TTS voice (card shows 사용할 수 없음). Install a Korean voice in the OS TTS settings. |
| No voice in browser | Browser has no Korean voice, or the tab was never clicked (autoplay policy). Click once, or use the phone. |
| No vibration | Web browsers mostly don't support it; `EXPO_PUBLIC_FLAG_HAPTICS=0` disables it. |
| Live list empty | Key missing, quota hit, or flag `EXPO_PUBLIC_FLAG_LIVE_TRAINS=0`. Use the simulation. |
