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

- Main already holds pre-built, tested modules from before the task split (physics engine, alert policy, announcer,
  freshness, UI components, server proxy). Task agents should reuse them rather than re-create them.
