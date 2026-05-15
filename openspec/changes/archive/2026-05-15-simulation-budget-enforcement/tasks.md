# Tasks — Simulation Budget Enforcement

## 1. Command cap observability (this slice — ✅ shipped)

- [x] 1.1 Add `MAX_COMMANDS_PER_TICK_SOFT_CAP` constant in `packages/server/src/config/world.ts`. Default `5000`.
- [x] 1.2 Track per-tick command count on `SimulationRuntime`: `lastTickCommandCount`, `peakTickCommandCount`, `softCapHitCount`.
- [x] 1.3 In `runTick()`, after the `commands` array is fully built (right before the rule-engine dispatch), update the three stats and `console.warn` if over the soft cap (no rejection).
- [x] 1.4 Add `TickCommandStats` type and `tickCommandStats` field on `WorldSnapshot` (`{ lastTick, peak, softCap, softCapHitCount }`).
- [x] 1.5 Expose on `/api/dashboard` payload — `/api/dashboard` returns the snapshot in `world`, so the new field rides along; web `ServerWorldSnapshot` type updated.
- [x] 1.6 Add focused tests: `packages/server/src/sim/runtimeBudget.test.ts` covers stat exposure, peak monotonicity, no-warning under normal load, soft-cap counter at 0 under normal load.

## 2. Command cap enforcement (this slice — ✅ shipped)

- [x] 2.1 Add `MAX_COMMANDS_PER_TICK_HARD_CAP = 8000` constant + `COMMAND_CAP_REJECTION_CODE = 'COMMAND_CAP_EXCEEDED'` in `config/world.ts`.
- [x] 2.2 Pure helper `packages/server/src/sim/commandBudget.ts::applyCommandHardCap(commands, hardCap)` returns `{ kept, rejected }` partition. Sorts by `commandId` ascending only when over cap (preserves natural order under cap). `runTick()` calls helper, records overflow via `eventStore.recordRejectedCommand(...)`, downstream rule-engine loop iterates `acceptedCommands` (the kept partition).
- [x] 2.3 Replay tests: `commandBudget.test.ts` covers determinism across runtime collection order; `runtimeBudget.test.ts` confirms no false rejections under real 50-NPC load.

## 3. NPC partitioning

### Slice 3a — partition computation + snapshot exposure (this commit)

- [x] 3.1 Define partition policy: deterministic round-robin via stable content-hash of NPC id mod `NPC_PARTITION_PERIOD = 4`. Active bucket per tick is `tick mod period`. Every NPC active exactly once per period. (Pending-intent + player-recency criteria deferred to slice 3b.)
- [x] 3.2 Pure helper `packages/server/src/sim/npcPartition.ts::partitionNpcsForTick(npcIds, tick, period)` returns `{ active: Set<string>, period, totalCount, activeCount }`.
- [x] 3.3 Runtime computes partition each tick (cheap O(N) char-code hash), stores `lastActiveNpcCount`, exposes `WorldSnapshot.npcPartition`.
- [x] 3.4 Replay tests: every NPC active once per full period; partition deterministic across runtime instances; input-order-independent.

### Slice 3b — wire active set into NpcEngine filtering (next slice)

- [x] 3.5 Plumb `activeNpcSet` into `NpcEngine.tick` via `NpcTickContext`.
- [x] 3.6 Filter Phase 2 productive-action candidates to active NPCs only.
- [x] 3.7 Filter Phase 3 interaction candidates to active NPCs only.
- [x] 3.8 Add allow-list overrides: NPCs with `activity='move'`, `dialogHold`, or `personalityOverride.targetTile` are always active regardless of bucket.
- [x] 3.9 Update existing tests in `cityLife.test.ts` / `npcEngine.test.ts` / `runtimeExpansion.test.ts` / `runtimePresence.test.ts` for any productive/interaction-event count changes.

## 4. Regional activation (Slice 4 — shipped)

- [x] 4.1 Define active region: any tile with player presence within K ticks OR flagged by a world rule.
  - Implemented as: any tile where a current NPC has `lastActedTick >= tick - TILE_ACTIVITY_RECENCY_TICKS` OR any active world event whose scope includes the tile. Pure helper `packages/server/src/sim/tileActivation.ts::computeActiveTiles`. Constants `TILE_ACTIVITY_RECENCY_TICKS = 60` and `TILE_INACTIVE_DRIFT_PERIOD = 10` in `config/world.ts`.
- [x] 4.2 Inactive areas: run low-frequency drift only (every 10th tick).
  - Gate applied in `runtime.ts` to the three ecology planners that run unconditionally per tick: predation (kill + starvation branches, including Sprint 2B aggression chain), reproduction, migration. Helper `tileShouldRunEcology({ tileId, tick, activeTiles, inactiveDriftPeriod })` returns `true` when the tile is active OR when `tick % inactiveDriftPeriod === 0`. NPC-triggered ecology (NPC hunt, fishery harvest) stays unchanged — these are naturally gated by NPC presence.
- [x] 4.3 Replay test.
  - 9 unit tests on `tileActivation`: empty/populated/world-event/boundary recency cases + drift-period semantics. Full suite (487 server + 39 web) passes.

## 5. Verification (per slice)

### Slice 1 (shipped)

- [x] 5.1 `npm test` passes (223 server + 34 web; +4 from runtimeBudget.test.ts).
- [x] 5.2 `npm run build:server` + `npm run build:web` pass.
- [x] 5.3 `npx openspec validate simulation-budget-enforcement --strict` passes.
- [x] 5.4 Commit + push + CI/Deploy Dev green (commit `f020c5e`, CI `25787482933`, Deploy `25787482860`).
- [x] 5.5 Update `PROGRESS.md` and `ROADMAP.md`.

### Slice 2 (shipped)

- [x] 5.6 `npm test` passes (230 server + 34 web).
- [x] 5.7 `npm run build:server` + `npm run build:web` pass.
- [x] 5.8 `npx openspec validate simulation-budget-enforcement --strict` passes.
- [x] 5.9 Commit + push + CI/Deploy Dev green (commit `f97038f`, CI `25789026698`, Deploy `25789026661`).
- [x] 5.10 Update `PROGRESS.md` and `ROADMAP.md`.

### Slice 3a (this commit)

- [x] 5.11 `npm test` passes (240 server + 34 web; +10 from `npcPartition.test.ts`, +2 from runtimeBudget partition tests, -2 from inline rewrite).
- [x] 5.12 `npm run build:server` + `npm run build:web` pass.
- [x] 5.13 `npx openspec validate simulation-budget-enforcement --strict` passes with the new partition requirements.
- [x] 5.14 Commit + push + CI/Deploy Dev green.
- [x] 5.15 Update `PROGRESS.md` and `ROADMAP.md`.

### Slice 3b (this commit)

- [x] 5.16 `npm run test -w @greed-island/server -- npcEngine runtimeBudget runtimePresence runtimeExpansion` passes.
- [x] 5.17 `npm test` passes (266 server + 34 web).
- [x] 5.18 `npm run build:server` + `npm run build:web` pass; `npx tsc -p packages/server/tsconfig.json --noEmit` + `packages/web/tsconfig.json --noEmit` pass.
- [x] 5.19 `npx openspec validate simulation-budget-enforcement --strict` and `npx openspec validate --all --strict` pass.
- [x] 5.20 Commit + push + CI/Deploy Dev green (commit `23cfca6`, CI `25791664215`, Deploy `25791664183`).
- [x] 5.21 Update `PROGRESS.md` and `ROADMAP.md`.

### Slice 4 (shipped)

- [x] 5.22 `npm run test -w @greed-island/server -- sim/tileActivation` passes (9 tests).
- [x] 5.23 `npm test` passes (487 server + 39 web).
- [x] 5.24 `npm run build:server` + `npm run build:web` pass.
- [x] 5.25 `npx openspec validate simulation-budget-enforcement --strict` and `npx openspec validate --all --strict` pass.
- [x] 5.26 Commit + push + CI/Deploy Dev green.
- [x] 5.27 Update `PROGRESS.md` and `ROADMAP.md`.
