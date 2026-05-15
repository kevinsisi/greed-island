## 1. Command Catalog

- [x] 1.1 Add `NPC_STATE_RECORDED` to `LIVING_WORLD_COMMAND_TYPES`.
- [x] 1.2 Define `NpcStateRecordedCmd` payload carrying `{ npcId, state, narration }`.
- [x] 1.3 Add validator ensuring the state snapshot is structurally complete enough for `NpcEngine.hydrate(...)`.
- [x] 1.4 Extend command-catalog tests for the new type.

## 2. Projection

- [x] 2.1 Create `packages/server/src/projections/npcState.ts`.
- [x] 2.2 Implement `rebuildFromEvents(events)` and `project(event)` over `NPC_STATE_RECORDED`.
- [x] 2.3 Add `getByNpcId(npcId)` and `getAll()`.
- [x] 2.4 Add canonical-hash replay tests.

## 3. Runtime Integration

- [x] 3.1 `SimulationRuntime` constructs `NpcStateProjection` and rebuilds it from EventLog on boot.
- [x] 3.2 Boot hydration prefers the typed projection; `npc.state.<id>` FACT_SET remains only as fallback for legacy logs.
- [x] 3.3 Replace new NPC-state FACT_SET writes with `NPC_STATE_RECORDED` commands/events for both normal per-tick changed states and post-accepted social-task state changes.
- [x] 3.4 Suppress `NPC_STATE_RECORDED` from recent narrative / chronicle surfaces.

## 4. Verification

- [x] 4.1 Focused tests for `livingWorld`, `npcState` projection, and runtime NPC-state hydration pass.
- [x] 4.2 `npm test` passes.
- [x] 4.3 `npm run build:server` and `npx tsc -p packages/server/tsconfig.json --noEmit` pass.
- [x] 4.4 `npx openspec validate npc-state-typed-projection --strict` and `npx openspec validate --all --strict` pass.
- [x] 4.5 Update `PROGRESS.md` / `ROADMAP.md`, commit, push, and verify CI + Deploy Dev (commit `c3068f1`, CI `25794738289`, Deploy `25794738301`).
