# Tasks — Settlement Runtime v2

> Purpose: turn settlements from formation-only records into authoritative civilization state. No fake Hub actors or frontend-invented life are allowed.

## 0. Planning

- [x] 0.1 Create OpenSpec change `settlement-runtime-v2` with proposal, design, tasks, and `civilization-runtime` spec delta.
- [x] 0.2 Resolve open questions in `proposal.md` before Slice 1 implementation.

## 1. Slice 1 — Domain, commands, projection

- [x] 1.1 Extend `livingWorldCommands.ts` with typed settlement commands/events: `SETTLEMENT_POPULATION_UPDATED`, `SETTLEMENT_STORAGE_UPDATED`, `SETTLEMENT_PRESSURE_UPDATED`, `SETTLEMENT_STABILITY_CHANGED`, `SETTLEMENT_DECLINED`, `SETTLEMENT_RECOVERED`.
- [x] 1.2 Define payload validators with bounded numeric ranges, positive/non-negative quantities, sorted ids, and deterministic tick metadata.
- [x] 1.3 Extend `SettlementsProjection` from formation-only rows to settlement state rows while preserving existing `/api/settlements` fields.
- [x] 1.4 Add `rebuildFromEvents()` canonical-hash tests for formation plus every new settlement event type.
- [x] 1.5 Add rule-engine tests proving every new command compiles to a typed event and invalid payloads are rejected.

## 2. Slice 2 — SettlementEngine pressure planner

- [x] 2.1 Create pure `settlementEngine.ts` planner that accepts settlements, NPC presence, goods inventory, logistics, market prices, fishery density, animal population, household economy, and current tick.
- [x] 2.2 Compute bounded `food`, `safety`, `economy`, and `logistics` pressure scores using named constants from `config/world.ts`.
- [x] 2.3 Derive one pressure/stability command per settlement per tick at most; no duplicate pressure events in the same tick.
- [x] 2.4 Tests: no population means no pressure spike; low food raises food pressure; storm transport loss raises logistics pressure; fishery collapse raises food pressure; pressure values clamp to `0..100`.

## 3. Slice 3 — Runtime wiring

- [x] 3.1 Wire the planner into `SimulationRuntime.runTick()` after goods/logistics/ecology projections have current inputs and before command budget partitioning.
- [x] 3.2 Ensure every planned state change goes through `makeLivingWorldCommand()` and `LivingWorldRuleEngine.evaluate()` before EventLog commit.
- [x] 3.3 Keep routine settlement events out of public ticker surfaces unless explicitly localized and meaningful.
- [x] 3.4 Tests: repeated identical EventLog replay produces byte-identical settlement rows; hard command cap rejects overflow deterministically without partially mutating settlement state.

## 4. Slice 4 — Read surfaces and GM observability

- [x] 4.1 Expose settlement state in `WorldSnapshot.facts` and keep `/api/settlements` backward-compatible for existing formation fields.
- [x] 4.2 Update GM/admin observer page to show settlement status, population count, storage summary, pressure, stability, and updated tick.
- [x] 4.3 Add web tests for empty settlement state, stable settlement, and declining settlement display.
- [x] 4.4 Confirm Hub map still does not render fake people, fake crowds, or decorative activity actors.

## 5. Slice 5 — Verification, docs, release follow-through

- [x] 5.1 `npx openspec validate --all --strict` passes.
- [x] 5.2 Full `npm test` passes.
- [x] 5.3 `npm run build` passes; known Vite chunk warning is acceptable.
- [x] 5.4 Update `PROGRESS.md` with completed slices, verification evidence, CI/CD/deploy state, and remaining blockers.
- [ ] 5.5 Commit, push, wait for CI/CD, and live-smoke the deployed version before reporting runtime success.

## Current Progress

- Slice 4 complete locally: `23/26` tasks complete.
- Settlement runtime state is exposed through snapshot facts, `/api/settlements` remains backward-compatible, and GM/admin observability reads only authoritative settlement rows.
- Next actionable slice: commit, push, wait for CI/CD, and live-smoke (`5.5`).
