# SUB WAY 2 STAND

A Korean mobile app for people standing on a Seoul subway train. It tells you
which way your body will sway before the train enters a curve, and says it out
loud ("약 10초 후 오른쪽 곡선입니다. 왼쪽으로 쏠림에 대비하세요.") with a
matching vibration, so you can brace without looking at the screen.

The app is strict about honesty: every number on screen is labeled as a
**live estimate**, **fixture** (bundled example) or **simulation**. When the data
is not good enough, it stays silent and shows the reason instead of guessing.

---

## How it works (user journey)

1. **열차 선택**: pick a live train on a line (from the Seoul realtime feed),
   or choose **시뮬레이션으로 체험** to try an invented track.
2. **탑승 안내**: the ride screen recomputes a forecast every second:
   which side you will be pushed to, the time window until curve entry, the
   lateral acceleration range and a confidence level. It also explains why it
   made that forecast, or why it is suppressed.
3. **Voice + haptics**: about 10 s before the earliest possible curve entry the
   app speaks once in Korean, then gives a short "지금 곡선 진입" cue at entry.
   Each cue has its own vibration pattern.

## Architecture

pnpm monorepo:

| Package | Role |
|---|---|
| `lib/api-spec/openapi.yaml` | API contract (`GET /api/subway/trains`). Orval generates `@workspace/api-client-react` (React Query hooks) and `@workspace/api-zod` (server validation). |
| `artifacts/api-server` | Express 5 proxy for the Seoul Open Data realtime train-position API. Server-side cache, daily quota guard, freshness checks. **The API key never leaves the server.** |
| `artifacts/sub-way-stand` | Expo 57 + expo-router app (this folder). |

Inside the app, screens only call services; each service implements a
signature from `contracts/index.ts`:

```
screens/  ──▶ services/trains.ts      live trains + route data (via the API)
          ──▶ services/forecast.ts    Forecast every second (lib/physics.ts)
          ──▶ services/simulation.ts  invented demo scenarios
          ──▶ services/guidance.ts    Korean TTS + haptics (lib/guidanceRules.ts)
config/flags.ts   feature flags (all ON by default)
```

### Physics (short version)

The model treats the passenger as a point mass in a steady turn. It does not
model suspension, cabin vibration or crowds.

- Lateral acceleration `a_y = v²·κ − g·sin θ` (κ = 1/R, cant θ only when known).
- Left curve → pushed right, right curve → pushed left.
- Entry window = `[d_min / v_max, d_max / v_min]` from distance and speed
  ranges. If the window is too wide, the sway direction is ambiguous, or the
  train is stopped, stale, delayed or lost, the forecast is **suppressed** with
  a reason.

### Voice guidance rules (`lib/guidanceRules.ts`, unit-tested)

| Rule | Behaviour |
|---|---|
| Pre-warning | Once per curve, when an *active* forecast's earliest entry is ≤ 10 s. Skipped if it would arrive later than 3 s before entry. Says the **earliest** time, rounded. |
| Now cue | Once per curve, when the earliest entry is ≤ 1 s: "지금 곡선 진입. 왼쪽 쏠림 주의." |
| Dedupe | One announcement of each kind per curve approach. Flicker back to a curve passed moments ago stays silent. A new approach is announced again: the curve comes back from outside the 10 s window (for example the next simulation lap), or more than 20 s have passed. |
| Suppression | Nothing is spoken while the forecast is suppressed. If a pre-warning is still pending when the forecast flips to suppressed, speech is stopped and a silent "안내 취소" event is shown. |
| Simulation | Every simulated announcement starts with "시뮬레이션 안내:". |
| Foreground only | When the app goes to the background, speech and pending vibrations stop. No cue is decided until the app is active again, so a curve that is still ahead is announced on return with the current time. |
| Toggle | The 음성 안내 switch mutes speech immediately. Turning it back on never replays an old warning. Vibration is a separate cue (haptics flag). |
| Availability | Voice is reported `available: false` when the flag is off or no Korean TTS voice is found. On web this means the browser must list a Korean voice. The screen then shows a silent notice. Haptics are skipped where unsupported. |

Haptics: pre-warning = one "warning" notification pulse; now cue = three heavy
taps 140 ms apart.

## Data sources and honesty labels

| Data | Source | Label in the app |
|---|---|---|
| Train observations | Seoul Open Data Plaza `realtimePosition` (lines 1–9) through our proxy. **Station-level only**: last station, state (진입/도착/출발/전역출발), direction, timestamp. No coordinates, no speed, no curve timing. | live (`origin: 'live'`), with freshness |
| Example trains | Bundled fixture trains, used before the live feed is connected | `[예시]`, `origin: 'fixture'` |
| Station positions | Approximate public station coordinates | station-level, approximate |
| Curve geometry | Approximated from station geometry or curated by hand. **Not surveyed track alignment.** | `source: 'station-geometry-approx' \| 'curated'` with a confidence |
| Live forecast | Estimated from station-level data + approximate curves, shown as ranges | `실시간 추정` (`source: 'live-estimate'`) |
| Simulation | Invented track **SYN-A** (left R450, right R300) at 12–16 m/s. Not linked to any real train. | `[시뮬레이션]`, spoken prefix "시뮬레이션 안내:" |

Because the live feed has no speed or exact position, live forecasts are
estimates. They are often suppressed (for example when the train is stopped
at a station or the observation is stale). That is intended behaviour.

## Run it

On Replit the two workflows start automatically:

- **API Server**: `pnpm --filter @workspace/api-server run dev`
- **expo**: `pnpm --filter @workspace/sub-way-stand run dev`. Scan the QR
  code with **Expo Go** for voice and vibration on a real phone. The web
  preview also works, but voice there depends on the browser's Korean voice,
  and vibration is usually unavailable.

### Required secret

| Name | Where | Without it |
|---|---|---|
| `SEOUL_SUBWAY_API_KEY` | API server env (Replit Secrets). Get a key from the Seoul Open Data Plaza (data.seoul.go.kr), realtime subway position API. | `/api/subway/trains` returns `status: "missing_key"`. Use the simulation. |

### Feature flags (mobile, all default ON)

Set to `0` before starting Expo to switch off:
`EXPO_PUBLIC_FLAG_LIVE_TRAINS`, `EXPO_PUBLIC_FLAG_PHYSICS_FORECAST`,
`EXPO_PUBLIC_FLAG_VOICE_GUIDANCE`, `EXPO_PUBLIC_FLAG_HAPTICS`,
`EXPO_PUBLIC_FLAG_SIMULATION_FALLBACK`. Turning one off degrades safely
(simulation only, muted, or suppressed). It never crashes.

### Tests and checks

```bash
pnpm --filter @workspace/sub-way-stand test       # mobile unit tests (node --test)
pnpm --filter @workspace/sub-way-stand typecheck
pnpm run typecheck                                 # whole monorepo
```

Mobile tests run under plain Node with type stripping. Keep tested logic in
pure modules under `lib/` (type-only imports, relative paths with `.ts`).

## Known limitations

- **No speed or exact position in the live feed.** Live timing is an estimate
  with wide ranges and is suppressed whenever it is uncertain.
- **Curve geometry is approximate**, not surveyed alignment. Cant is usually
  unknown and ignored. Expect direction to be right more often than timing.
- **Simplified physics**: point mass and steady turn. No suspension, jerk
  comfort model, crowding or braking or acceleration on straights.
- **Quota**: the Seoul API allows about 1000 calls a day. The proxy caches and
  keeps a reserve, so during heavy demos it can report `quota`.
- **Upstream transport**: the realtime API is called at
  `http://swopenapi.seoul.go.kr` (plain HTTP; the HTTPS host timed out from
  Replit during development). The key is only used server-side, but it
  travels unencrypted on the server→Seoul hop until the proxy moves to TLS.
- **TTS quality depends on the device.** Phones without a Korean voice
  (or browsers without one) report voice as unavailable.
- **Guidance works only in the foreground.** Leaving the app stops speech
  and pauses cues. There is no background audio session, so the screen must
  stay open.
- This is a hackathon MVP and **not a safety device**. Hold the handrail.

## Demo

See [`docs/DEMO.md`](docs/DEMO.md) for a 2-minute judge walkthrough
(simulation and live paths).
