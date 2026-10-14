# SUB WAY 2 STAND

Korean mobile app (Expo) that tells a standing Seoul subway rider which way they will sway before an upcoming curve, with honest labeling of live estimates, cached data, simulation and failure states (missing key, quota, offline).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, routed at `/api`)
- `pnpm --filter @workspace/sub-way-stand run dev` — Expo (web preview + Expo Go QR); `/ride?sim=1` opens the simulation directly
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/sub-way-stand test` — mobile unit + integration tests (Node built-in runner over `artifacts/sub-way-stand/tests/**/*.test.{ts,mts}`)
- `pnpm --filter @workspace/api-server test` — proxy tests + pinned response fixtures; `UPDATE_FIXTURES=1 …` regenerates `artifacts/api-server/tests/fixtures/*.json` after an intentional contract change
- Required env (API): `SEOUL_SUBWAY_API_KEY` — without it `/api/subway/trains` returns `status: missing_key`. Optional `SEOUL_SUBWAY_API_BASE`: HTTPS relay for the provider (plain-HTTP values are ignored)
- Mobile feature flags (all default ON): `EXPO_PUBLIC_FLAG_LIVE_TRAINS`, `EXPO_PUBLIC_FLAG_PHYSICS_FORECAST`, `EXPO_PUBLIC_FLAG_VOICE_GUIDANCE`, `EXPO_PUBLIC_FLAG_HAPTICS`, `EXPO_PUBLIC_FLAG_SIMULATION_FALLBACK` — set to `0` to turn off

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo 57 + expo-router (stack: `index` = 열차 선택, `ride` = 탑승 안내), TypeScript 6

## Where things live

- API contract: `lib/api-spec/openapi.yaml` (`GET /api/subway/trains`); proxy in `artifacts/api-server/src/lib/seoulSubway.ts`
- Mobile app: `artifacts/sub-way-stand/` (paths below are relative to it)
  - `contracts/index.ts` — every shared type + service signature (source of truth)
  - `config/flags.ts` — feature flags, required off-behaviour, app config
  - `session/RideSession.tsx` — current `RideSelection`
  - `services/*.ts` — implementations of the contract signatures; screens import only these
  - Pure, Node-testable logic: `services/trainFeed.ts` (API → candidates/feed), `data/line2.ts` + `data/routeGeometry.ts` (Line 2 loop, approximate curves, segment lookup), `lib/forecastEngine.ts` (live forecast), `lib/simulationRide.ts` (simulation), `lib/guidanceRules.ts` (speech/haptic decisions), `components/uiModel.ts` (labels)
  - `docs/DEMO.md` — 2-minute judge script; `README.md` — product, data-honesty and limitation notes

## File ownership (parallel tasks — do not edit files you don't own)

| Owner | Files (under `artifacts/sub-way-stand/` unless noted) |
|---|---|
| Integrator (contracts/skeleton, final integration) | `contracts/`, `config/`, `session/`, `app/**` (layouts + route files, which only re-export screens), `package.json`, `tsconfig.json`, `replit.md` |
| Backend/data (live trains proxy, route data) | `services/trains.ts`, `data/**` (route data), `artifacts/api-server/**`, `lib/api-spec/**` + generated clients |
| Physics (curve sway forecast) | `lib/physics.ts`, `services/forecast.ts`, `services/simulation.ts`, any new `lib/forecast*`/`lib/simulation*` |
| UI (screens, map, motion) | `screens/**`, `components/**`, `constants/colors.ts`, `hooks/useColors.ts` (theme) |
| Voice/docs (Korean voice, haptics) | `services/guidance.ts`, `README.md`, demo docs (`docs/**`) |
| Integrator — design system | `design/**` (Motion OS spec + tokens). Read-only for other tasks. |

- **Motion OS design pass:** the user confirmed **Motion OS — Dark Edition** (`design/motion-os.md`, tokens in `design/tokens.ts`) after the UI task started. It gets applied to `screens/**`, `components/**` and the theme files only **after the UI task merges**, as one pass by the main agent. If final integration has already started by then, it waits until that merges. Don't apply it piecemeal while another task owns those files.

- Tests: each owner adds its own `tests/<area>.test.ts`; don't edit another owner's test file.
- Need a contract or dependency change? Don't edit integrator files — note it in your task report.
- Every stub/fixture must stay visibly labeled (`origin: 'fixture'`, `source: 'simulation'`); never present it as live.

## Architecture decisions

- Screens depend only on `contracts/` signatures via `services/*`; each service started as a labeled stub so tasks can swap implementations without touching screens.
- The live feed is station-level only (no speed/position), so live forecasts are estimates with ranges and must suppress (with a reason) rather than guess.
- Flags default ON; turning one off must degrade safely (simulation, muted, or suppressed), never crash.
- Live sway direction is only given from verified (`curated`) curves. Bundled Line 2 curves are `station-geometry-approx`, so every live ride currently holds with `low-confidence` (확신이 낮아 안내 보류). This is intended until surveyed geometry exists; integration tests cover the verified path with a test-only curated variant.
- One shared payload for the contract: the API test pins schema-validated responses as JSON, and the mobile integration test reads those files and runs mapping → segment → forecast → guidance.

## Product

- **열차 선택:** live Line 2 trains (station-level Seoul feed via our proxy) with freshness, direction filter and station search; banner shows 실시간 / 캐시 / 키 없음 / 호출 한도 / 연결 불가. **시뮬레이션으로 체험** is always one tap away (unless its flag is off).
- **탑승 안내:** per-second forecast (sway side, entry window, confidence) with an explanation, a route strip of the current/next segment, and Korean voice + haptic cues (pre-warning ≈10 s before entry, then a "now" cue). Suppressed while stopped, stale, lost, uncertain or unverified. Simulation is a looping virtual ride on Line 2 신촌→홍대입구 and every cue starts with "시뮬레이션 안내:".

## User preferences

- **Design (confirmed 2026-10-14): Motion OS — Dark Edition.** Deep black / dark navy background, restrained neon-lime brand point, bold large type, very clear future sway direction and time. Use Wallet/Nothing/Linear as references only; don't copy them.
  - Seoul line colours are for line identity only.
  - Never show risk by colour alone.
  - No unnecessary cards, charts, shadows, gradients or menus. Only the two screens, Select Train and Motion Live.
  - Calm by default. Direction and a short motion effect stand out only for a trustworthy forecast.
  - Live, simulation and uncertain/held states must be unmistakable.
- **Priority:** a runnable native app and verification come before design polish. Design work must not collide with in-flight feature tasks.

## Gotchas

- **Upstream is plain HTTP by default:** the official provider only answers on `http://swopenapi.seoul.go.kr` (its HTTPS host timed out from Replit on 2026-10-14), so the key travels unencrypted on the server→Seoul hop. Set `SEOUL_SUBWAY_API_BASE` to an HTTPS relay to avoid it.
- API tests can't import `@workspace/api-zod` by package name under plain Node (its index re-exports extensionless paths); import `lib/api-zod/src/generated/api.ts` directly.
- Simulation timing (from `lib/simulationRide.ts`): 8 s dwell, pre-warning ≈49 s, now cue ≈59 s, lap ≈113 s. Keep `docs/DEMO.md` in step if the profile changes.
- `EXPO_PUBLIC_FLAG_*` are inlined when Metro bundles; restart Expo after changing them.

- Mobile tests run under plain Node (type stripping): import sources by relative path **with `.ts`**, use only `import type` from `@/contracts`; `@/` value imports and React Native modules don't resolve there. Keep testable logic in pure modules.
- Mobile uses TypeScript 6, whose default `types` is `[]`; `@types/node` is enabled explicitly in its tsconfig for `node:test`.
- Keep the mobile `@types/react` on `catalog:` — a second `@types/react` version gets hoisted and breaks the mockup-sandbox typecheck.
- Typed routes live in `.expo/types/router.d.ts`, generated by the Expo dev server; restart the Expo workflow after adding/removing route files or typecheck rejects the new paths.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
