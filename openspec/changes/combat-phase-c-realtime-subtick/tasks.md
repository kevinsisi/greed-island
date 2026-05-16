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
- [ ] 2.4 Register new commands in `LIVING_WORLD_COMMAND_TYPES`
- [ ] 2.5 Extend `packages/server/src/combat/ruleEngine.ts` with 5-phase pipeline: `STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE`; gather pending commands; sort by `(priority asc, actorId asc, commandId asc)`; commit single SQLite tx; flush SSE after commit
- [ ] 2.6 Tests: PHASE_SHIFT (priority 0) bypasses target-lock; FIRE_LASH compiles to `COMBAT_DAMAGE` + `COMBAT_STATUS_APPLY`; same-priority lex order tie-break; replay identity for fixed seed; phase ordering within sub-tick

## 3. Slice 3 — EventLog integration + CombatStore as projection (§11.4 closure)

- [ ] 3.1 Refactor `packages/server/src/combat/combatStore.ts` — remove all write paths except reducer; `CombatStore` exposes read-only queries
- [ ] 3.2 Add combat-event reducers to `packages/server/src/kernel/reducer.ts` (one case per new event type from 2.3)
- [ ] 3.3 Extend `packages/server/src/kernel/livingWorldCommands.ts` to fan combat commands into the new ruleEngine
- [ ] 3.4 Verify HTTP handlers no longer write to `CombatStore` directly; only via reducer
- [ ] 3.5 Tests: replay identical EventLog twice → byte-identical `CombatStore` state; boot-time rehydrate from EventLog; HTTP-handler-no-direct-write static check; legacy `card_action_log` rows derivable from canonical EventLog

## 4. Slice 4 — SSE projection + new HTTP endpoints + client prediction

- [ ] 4.1 Extend `packages/server/src/http/combatRouter.ts`: `POST /api/combat/:id/play { cardId, target }`, `POST /api/combat/:id/cancel { commandId }`, `GET /api/combat/:id/snapshot`
- [ ] 4.2 Keep Phase B `POST /api/combat/:id/action` working through compat shim that routes through the new rule engine (per design Migration step 2)
- [ ] 4.3 Extend `packages/server/src/http/server.ts` to push committed combat events via SSE; include `tickDigest = hash(combatId + combatTick + hp + statusBag + phases)` on every push
- [ ] 4.4 Create `packages/web/src/state/CombatProjection.ts` — pure derive from received events; reject local writes to `hp` / `status` / `phase` / `locked`
- [ ] 4.5 Extend `packages/web/src/api/client.ts` — `combatPlay`, `combatCancel`, `combatSnapshot`
- [ ] 4.6 Client prediction: on `combatPlay`, apply predicted delta from card catalog; on reject → rollback + toast; on accept-with-different-amount → silent reconcile; on `tickDigest` mismatch → fetch snapshot
- [ ] 4.7 Tests: SSE delivery happy path; tickDigest mismatch → snapshot path; reject → rollback + toast; silent reconcile on amount mismatch; legacy Phase B `/action` byte-identical events for the same seed

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
