---
name: Task-agent coordination on this project
description: How main-agent work interacts with the parallel project tasks (#1 skeleton → #2–#5 parallel → #6 integration → #7 line diagram)
---

- The user runs a parallel project-task plan with a file-ownership map: services/trains/route data → backend task;
  physics/forecast/simulation → physics task; screens/components/theme → UI task; guidance/README/docs → voice/docs task;
  contracts/flags/session/layouts/route files/package.json → integrator (main agent).
  **Why:** the user wants no file edited by two agents at once.
  **How to apply:** while those tasks are pending or running, the main agent only touches integrator files or fixes merges.

- A task merge shows "MERGING … WAITING_FOR_LOCK" while the main agent is mid-turn; it proceeds after the main turn ends.
  **How to apply:** don't keep editing main during a pending merge. Finish, keep main compiling, end the turn.

- Keep exactly one guidance (speech/haptic decision) policy and one ride-session store. Extend the existing ones instead of
  adding parallel versions.
  **Why:** duplicate policies left over from before the task split made the integration review ambiguous about which one ran.

- Mobile `pnpm test` runs both `tests/**/*.test.ts` and `tests/**/*.test.mts` (Node runner, type stripping; a bare
  directory arg fails). `lib/` files may value-import each other with relative `./x.ts`
  paths (Node type-stripping and Metro both resolve them); never value-import `@/…` or React Native from `lib/`.
- A fresh task fork may lack installed devDeps (e.g. `@types/node` → typecheck TS2688). `pnpm install --frozen-lockfile`
  fixes it without touching the lockfile. Typed-route errors on `/ride` mean the Expo workflow needs a restart.
- `pnpm add` in this monorepo re-resolves unrelated peers (e.g. orval's typescript), churning the lockfile.
  **How to apply:** keep only the new package's hunks in `pnpm-lock.yaml`, then confirm with `pnpm install --frozen-lockfile`.
- Node's type stripping rejects TS-only runtime syntax in `lib/` (constructor parameter properties, enums, namespaces);
  tsc accepts it, so only the Node test run catches it. Use plain fields.
