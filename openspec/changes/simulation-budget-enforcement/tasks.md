# Tasks — Simulation Budget Enforcement

## 1. Command cap observability (this slice — ✅ shipped)

- [x] 1.1 Add `MAX_COMMANDS_PER_TICK_SOFT_CAP` constant in `packages/server/src/config/world.ts`. Default `5000`.
- [x] 1.2 Track per-tick command count on `SimulationRuntime`: `lastTickCommandCount`, `peakTickCommandCount`, `softCapHitCount`.
- [x] 1.3 In `runTick()`, after the `commands` array is fully built (right before the rule-engine dispatch), update the three stats and `console.warn` if over the soft cap (no rejection).
- [x] 1.4 Add `TickCommandStats` type and `tickCommandStats` field on `WorldSnapshot` (`{ lastTick, peak, softCap, softCapHitCount }`).
- [x] 1.5 Expose on `/api/dashboard` payload — `/api/dashboard` returns the snapshot in `world`, so the new field rides along; web `ServerWorldSnapshot` type updated.
- [x] 1.6 Add focused tests: `packages/server/src/sim/runtimeBudget.test.ts` covers stat exposure, peak monotonicity, no-warning under normal load, soft-cap counter at 0 under normal load.

## 2. Command cap enforcement (next slice)

- [ ] 2.1 Add `MAX_COMMANDS_PER_TICK_HARD_CAP` constant (default `8000`).
- [ ] 2.2 When commands exceed hard cap, sort by deterministic key, slice first N, log overflow to `rejected_command_log` with `rejectionCode = 'COMMAND_CAP_EXCEEDED'`.
- [ ] 2.3 Add replay test: same EventLog + same cap → same kept-vs-rejected partition.

## 3. NPC partitioning (later slice)

- [ ] 3.1 Define partition policy: active set = NPCs touched by player in last K ticks OR with pending intent; background set = the rest.
- [ ] 3.2 Background NPCs run a cheap-policy path (schedule lookup + mood/health drift only, no interactions).
- [ ] 3.3 Deterministic round-robin: every NPC gets a full update at least once per N ticks regardless of partition.
- [ ] 3.4 Replay test.

## 4. Regional activation (later slice)

- [ ] 4.1 Define active region: any tile with player presence within K ticks OR flagged by a world rule.
- [ ] 4.2 Inactive areas: run low-frequency drift only (every 10th tick).
- [ ] 4.3 Replay test.

## 5. Verification (per slice)

### Slice 1 (this commit)

- [x] 5.1 `npm test` passes (223 server + 34 web; +4 from runtimeBudget.test.ts).
- [x] 5.2 `npm run build:server` + `npm run build:web` pass.
- [x] 5.3 `npx openspec validate simulation-budget-enforcement --strict` passes.
- [ ] 5.4 Commit + push + CI/Deploy Dev green.
- [ ] 5.5 Update `PROGRESS.md` and `ROADMAP.md`.

### Slices 2-4 verification still pending — re-use this section as each lands.
