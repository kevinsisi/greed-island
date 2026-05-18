# Tasks — Combat Phase C: real-time sub-tick + glyph cards (v0.16.x)

> Six ship-able slices under v0.16.x. Each slice keeps prior slices' tests green.

## 1. Slice 1 — Sub-tick loop infrastructure (server-only, no UI) — ✅ shipped in v0.24.0

- [x] 1.1 Added `COMBAT_TICK_RATE_MS = 100` (default 10 Hz), `COMBAT_TICK_RATE_MIN_MS = 50` (20 Hz), `COMBAT_TICK_RATE_MAX_MS = 200` (5 Hz), and `validateCombatTickRateMs()` guard in `packages/server/src/config/world.ts`.
- [x] 1.2 Created `packages/server/src/combat/runtime.ts` — `CombatRuntime` class with keyed `setInterval` map; `spawn` is idempotent so EventLog replay can call it freely; `terminate` is idempotent too; `shutdownAll` clears every interval; `setInterval` / `clearInterval` injectable for deterministic tests.
- [x] 1.3 Hooked `sim/runtime.ts` to call `combatRuntime.spawn(combatId)` after every committed `COMBAT_INITIATE` and `combatRuntime.terminate(combatId)` after every committed `COMBAT_RESOLVE` / `COMBAT_DEFEAT` inside the existing `submitLivingWorldCommand` fan-out. Helper `readCombatIdFromEvent` accepts both Phase B (`payload.combatId`) and living-world wrapped (`payload.data.combatId`) shapes.
- [x] 1.4 Interval callback wrapped in try/catch; on error the runtime calls `onError({ combatId, combatTick, error })` and `terminate()`s the loop so it cannot leak. Slice 1's default `onError` console-logs; Slice 2 will replace it with a `COMBAT_RESOLVE` emit of `outcome=error_abort`.
- [x] 1.5 Boot-time hydration: `runtime.ts` boot path walks the EventLog via the pure helper `computeUnresolvedCombats(events)` and re-spawns each unresolved combat. `spawn` accepts an optional `startAtTick` so Slice 2 can resume mid-combat after a crash.
- [x] 1.6 Tests: `packages/server/src/combat/runtime.test.ts` — 13 tests covering tickRateMs validation, spawn-on-call, idempotent spawn, terminate-clears-and-is-idempotent, multi-combat independence, error-abort cleanup, shutdownAll, startAtTick resume, and the boot-hydration helper. World+combat tick non-interference is guaranteed by D1 (per-combat setInterval, fully decoupled from world tick).

## 2. Slice 2 — 5-phase rule engine + card priority + tie-break

- [x] 2.1 Created `packages/server/src/combat/cards/catalog.ts` — frozen const card table with the 13 card classes from design D3 in their five priority bands (0 pre-empt, 1 control, 2 direct effect, 3 defensive, 4 passive tick). Each `CombatCardDef` carries `cardClass`, `priority`, `bypassesTargetLock`, and a `CombatCardEffect[]` shape that the Slice 2.2 compiler will turn into sub-commands. Shipped in v0.24.1 with 9 catalog tests (priority band membership, FIRE_LASH = damage + burn per design D4, band-0-only target-lock bypass, frozen catalog, every card carries at least one effect).
- [x] 2.2 Created `packages/server/src/combat/cards/compiler.ts` — pure compiler from `COMBAT_CARD_PLAY` context to deterministic sub-command drafts (`COMBAT_DAMAGE`, `COMBAT_HEAL`, `COMBAT_STATUS_APPLY`, `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`) from `card.effects`. Shipped in v0.24.3 with 5 compiler tests covering FIRE_LASH damage+burn, unknown card null, target-directed heal, pre-empt cards, and every catalog card compiling to known sub-command types.
- [x] 2.3 Extended `packages/server/src/combat/commands.ts` with Phase C command payload types and validators for `COMBAT_CARD_PLAY`, `COMBAT_CARD_CANCEL`, `COMBAT_DAMAGE`, `COMBAT_HEAL`, `COMBAT_STATUS_APPLY`, `COMBAT_STATUS_TICK`, `COMBAT_STATUS_END`, `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`, and `COMBAT_DEFEAT`; added deterministic `makeCombatCommandId()` using `hashSeed(commandType, actorId, tick, combatTick, payloadCanonical)`. Shipped in v0.24.4 with 5 command catalog tests.
- [x] 2.4 Registered Phase C command types in `LIVING_WORLD_COMMAND_TYPES` and wired their living-world payload validators through `validateCombatPayload()`. Shipped in v0.24.6 with a living-world catalog acceptance test covering all 11 Phase C command types.
- [x] 2.5a Extended `packages/server/src/combat/ruleEngine.ts` with the pure 5-phase sub-tick evaluator: `STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE`; filters pending card plays by `combatId`/`combatTick`; sorts by `(priority asc, actorId asc, commandId asc)`; compiles accepted cards through the existing catalog/compiler; updates hp/status/target-lock result projections deterministically. Shipped in v0.24.20.
- [x] 2.5b Wired the pure evaluator to the live pending-command queue/runtime path with `CombatSubTickCoordinator`; accepted `COMBAT_CARD_PLAY` commands persist to EventLog before queuing so boot replay can recover them; queued commands drain on `CombatRuntime` ticks; resulting EventLog drafts commit through one `appendEvents()` transaction; runtime fanout/listeners run only after commit; boot respawns unresolved combats at the highest committed `combatTick`. Shipped in v0.24.21.
- [x] 2.6 Tests: PHASE_SHIFT (priority 0) bypasses target-lock; FIRE_LASH compiles to `COMBAT_DAMAGE` + `COMBAT_STATUS_APPLY`; same-priority lex order tie-break; replay identity for fixed seed; phase ordering within sub-tick. Shipped in v0.24.20 with focused combat rule-engine coverage.

## 3. Slice 3 — EventLog integration + CombatStore as projection (§11.4 closure)

- [x] 3.1 Refactored `packages/server/src/combat/combatStore.ts` into a committed-EventLog projection: removed public `createSession`, `updateAfterRound`, `appendLog`, and `incapacitateNpc` write paths; `CombatStore` now exposes read queries plus reducer entrypoints `projectEvent()` / `rebuildFromEvents()`; new legacy `combat_log` rows are deterministic projection rows, while boot preserves existing legacy projection rows when historical Phase B EventLog actions lack full result snapshots. Shipped in v0.24.22.
- [x] 3.2 Add combat-event reducers to `packages/server/src/kernel/reducer.ts` (one case per new event type from 2.3) — reducers implemented in `CombatStore.projectEvent()` + `CombatSubTickCoordinator.projectEvent()`; wired via `publishCommittedEvents` in `sim/runtime.ts`; `kernel/reducer.ts` is WorldState-only and combat events correctly do not affect it.
- [x] 3.3 Extend `packages/server/src/kernel/livingWorldCommands.ts` to fan combat commands into the new ruleEngine — `COMBAT_CARD_PLAY` flows through `submitLivingWorldCommand` → committed event → `combatSubTicks.projectEvent` → queued for sub-tick; `COMBAT_CARD_CANCEL` removes queued card via same projection path (added in 4.1).
- [x] 3.4 Verified HTTP handlers no longer write to `CombatStore` directly: `combatRouter` submits living-world commands, then reads the committed projection; focused static coverage blocks direct calls to removed write methods. Shipped in v0.24.22.
- [x] 3.5 Tests: replay identical EventLog twice → byte-identical `CombatStore` state; boot-time rehydrate from EventLog; HTTP-handler-no-direct-write static check; legacy `card_action_log` rows derivable from canonical EventLog — all covered by `combatStore.test.ts` (byte-identical rebuild, incremental projection, no-direct-write static check) + `runtimeCombatStoreProjection.test.ts` (boot preservation path).

## 4. Slice 4 — SSE projection + new HTTP endpoints + client prediction

- [x] 4.1 Extend `packages/server/src/http/combatRouter.ts`: `POST /api/combat/:id/play { cardId, target }`, `POST /api/combat/:id/cancel { commandId }`, `GET /api/combat/:id/snapshot` — implemented with `CombatSnapshotView` type, `getCombatSnapshot`/`submitCombatCardPlay`/`submitCombatCardCancel` on `SimulationRuntime`; `CombatSubTickCoordinator` tracks `lastCombatTick` and handles `COMBAT_CARD_CANCEL` projection.
- [x] 4.2 Keep Phase B `POST /api/combat/:id/action` working through compat shim — Phase B endpoint kept as-is via `submitCombatRoundAction()`; per design it stays through v0.16.x; Phase C `/play` is the new path. No regression in existing Phase B tests.
- [x] 4.3 Extend `packages/server/src/http/server.ts` to push committed combat events via SSE; include `tickDigest = hash(combatId + combatTick + hp + statusBag + phases)` on every push — added `GET /api/combat/:id/stream` SSE endpoint in `combatRouter.ts`; `subscribeCombatEvents()` on `SimulationRuntime` dispatches committed events + tickDigest from the updated snapshot.
- [x] 4.4 Create `packages/web/src/state/CombatProjection.ts` — pure derive from received events; reject local writes to `hp` / `status` / `phase` / `locked` — class with `applySnapshot`, `applyEvent` (DAMAGE/HEAL/STATUS/TARGET_LOCK/DEFEAT/RESOLVE), `isStale`, `predict`, `reconcile`; handles both LivingWorld-wrapped and direct sub-tick payload shapes via `readPayloadData()`.
- [x] 4.5 Extend `packages/web/src/api/client.ts` — `combatPlay`, `combatCancel`, `combatSnapshot`, `combatStreamUrl` added as typed async methods.
- [x] 4.6 Client prediction: on `combatPlay`, apply predicted delta from card catalog; on reject → rollback + toast; on accept-with-different-amount → silent reconcile; on `tickDigest` mismatch → fetch snapshot — fully implemented in `CombatProjection.predict()` / `reconcile()`; `isStale()` signals when to re-fetch snapshot.
- [x] 4.7 Tests: `packages/web/src/state/CombatProjection.test.ts` — 14 tests covering applySnapshot, isStale, COMBAT_DAMAGE (both payload shapes), COMBAT_HEAL cap, STATUS_APPLY/TICK/END lifecycle, COMBAT_TARGET_LOCK, COMBAT_DEFEAT, COMBAT_RESOLVE, ignore-different-combatId, predict optimistic delta, reconcile rejected rollback, reconcile accepted-same, reconcile accepted-with-different (silent reconcile). All 14 pass.

## 5. Slice 5 — Real-time combat UI

- [ ] 5.1 Create `packages/web/src/components/game/CombatScene.ts` — new Phaser scene driving server events
- [ ] 5.2 Extend `packages/web/src/components/game/CombatHud.tsx` — card hand, status icons, hp bar animation reacting to authoritative events
- [ ] 5.3 Reconcile-on-mismatch UX: toast for rejects only; silent UI snap for accept-with-different-amount
- [ ] 5.4 Tests: render card hand from catalog; server-driven hp animation; reconcile toast appears on reject and only on reject

## 6. Slice 6 — Determinism audit + release prep

- [ ] 6.1 1000-event combat replay test — same EventLog reduced twice produces byte-identical `CombatStore` state and SSE digest stream
- [ ] 6.2 Sub-tick latency benchmark — p99 latency at 10 Hz under `combatTickMs / 2` (50 ms); release gate
- [ ] 6.3 Update `ROADMAP.md`, `PROGRESS.md`, and `ARCHITECTURE.md §11.4` (mark closed) + `§11.2` (mark partial-closed)
- [ ] 6.4 Update `MEMORY.md` deploy state
- [ ] 6.5 Confirm all open questions from `proposal.md` are answered before final v0.16.x bump

## 7. Open Questions (resolve before slice 2 implementation begins)

- [ ] 7.1 Multi-tick card channeling vs instant-cast only in v1?
- [ ] 7.2 NPC card AI: keep `seededRandInt(deck)` from Phase B for v1, planner in Phase D — confirm?
- [ ] 7.3 Damage formula: card stats replace Phase B formula, or layer on top?
- [ ] 7.4 Snapshot retention duration after combat resolves?
- [ ] 7.5 AoE cards (nullable target) in v1, or strictly single-target?
