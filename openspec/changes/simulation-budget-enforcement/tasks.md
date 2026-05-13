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

- [ ] 3.5 Plumb `activeNpcSet` into `NpcEngine.tick` via `NpcTickContext`.
- [ ] 3.6 Filter Phase 2 productive-action candidates to active NPCs only.
- [ ] 3.7 Filter Phase 3 interaction candidates to active NPCs only.
- [ ] 3.8 Add allow-list overrides: NPCs with `activity='move'`, `dialogHold`, or `personalityOverride.targetTile` are always active regardless of bucket.
- [ ] 3.9 Update existing tests in `cityLife.test.ts` / `npcEngine.test.ts` / `runtimeExpansion.test.ts` / `runtimePresence.test.ts` for any productive/interaction-event count changes.

## 4. Regional activation (later slice)

- [ ] 4.1 Define active region: any tile with player presence within K ticks OR flagged by a world rule.
- [ ] 4.2 Inactive areas: run low-frequency drift only (every 10th tick).
- [ ] 4.3 Replay test.

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
- [ ] 5.14 Commit + push + CI/Deploy Dev green.
- [ ] 5.15 Update `PROGRESS.md` and `ROADMAP.md`.

### Slices 3b-4 verification still pending — re-use this section as each lands.
