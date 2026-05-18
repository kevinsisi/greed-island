# Proposal — Combat Phase C: real-time sub-tick + glyph cards

## Why

Phase B (v0.15.0) shipped single-shot combat over the Command → Rule Engine → Event pipeline and proved the contract holds for a real domain. Phase C is the upgrade that makes combat actually *feel* real-time: a sub-tick clock decoupled from the 5s world tick, glyph cards as the primary Command source, and a deterministic priority engine that resolves overlapping plays. This release also closes `ARCHITECTURE.md §11.4` by making `CombatStore` a read-only projection of EventLog and partially addresses `§11.2` by promoting card actions into the canonical EventLog.

Doing sub-tick + cards together is necessary because card resolution is what *requires* sub-tick ordering — splitting them again would just create another half-baked vertical slice.

## What Changes

### Sub-tick loop (server)

- New `combatTickRate` config (default 10 Hz, range 5–20 Hz). World tick stays at 5s.
- On `COMBAT_INITIATE` committed → spawn a `setInterval` combat loop; on `COMBAT_RESOLVE` / `COMBAT_DEFEAT` → clear it.
- World tick and combat sub-tick run concurrently; both write to the same `EventLog` with row-level locking. Ordering by `(tick asc, combatTick asc, actorId asc, commandId asc)` preserves determinism.
- On server boot, hydrate combat state from `EventLog` and resume at `lastCommittedCombatTick + 1`.

### New combat commands

`COMBAT_CARD_PLAY`, `COMBAT_CARD_CANCEL`, `COMBAT_DAMAGE`, `COMBAT_HEAL`, `COMBAT_STATUS_APPLY`, `COMBAT_STATUS_TICK`, `COMBAT_STATUS_END`, `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`, `COMBAT_DEFEAT`. All join `LIVING_WORLD_COMMAND_TYPES`.

### 5-phase rule engine (per combat sub-tick)

`STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE`.

Card priority table 0..4 with deterministic tie-break `(priority desc, actorId asc, commandId asc)`. `commandId = hashSeed(commandType, actorId, tick, combatTick, payloadCanonical)` following the Phase B pattern at `packages/server/src/combat/commands.ts:82-96`.

### EventLog refactor

- `CombatStore` becomes read-only projection (no side-channel writes).
- Combat reducers move under `kernel/reducer.ts` so combat events are canonical EventLog citizens.
- Legacy `card_action_log` rows preserved but formally specced as a sub-log with a replay contract; new card events write to the canonical log only.

### Client (web)

- SSE-driven `CombatProjection` derives state from authoritative events.
- Client prediction from card catalog with reconcile-on-reject (toast + rollback) and silent reconcile on accept-but-different-amount.
- `tickDigest = hash(combatId + combatTick + hp + statusBag + phases)` sanity check. Mismatch → `GET /api/combat/:id/snapshot`.
- New endpoints: `POST /api/combat/:id/play`, `POST /api/combat/:id/cancel`, `GET /api/combat/:id/snapshot`.
- New Phaser `CombatScene` + extended `CombatHud` with card hand + server-driven animations.

### Compatibility

- Phase B HTTP `POST /api/combat/:id/action` keeps working through v0.16.x; sunset in v0.17+.
- v0.16 binary reads existing Phase B events with no schema migration.
- Mid-flight combats survive deploy via EventLog hydration.

## Capabilities

### New Capabilities

(none — Phase C extends the existing `combat-runtime` capability defined in `combat-system/`)

### Modified Capabilities

- `combat-runtime`: tightens determinism contract from "spec-only" to "live sub-tick loop"; adds card priority + commandId tie-break; adds client prediction + reconcile rules; adds SSE projection + tickDigest sanity; adds boot-time hydration from EventLog; tightens CombatStore-as-projection clause from §11.4.

## Impact

- **Affected specs**: `combat-runtime` (modified — see specs/combat-runtime/spec.md). No new capabilities.
- **Affected code**:
  - new — `packages/server/src/combat/runtime.ts`, `combat/cards/compiler.ts`, `combat/cards/catalog.ts`, `packages/web/src/state/CombatProjection.ts`, `packages/web/src/components/game/CombatScene.ts`
  - extended — `packages/server/src/combat/commands.ts`, `combat/ruleEngine.ts`, `combat/combatStore.ts`, `kernel/reducer.ts`, `kernel/livingWorldCommands.ts`, `sim/runtime.ts`, `http/combatRouter.ts`, `http/server.ts`, `packages/web/src/api/client.ts`, `packages/web/src/components/game/CombatHud.tsx`
- **Risk**:
  - Two concurrent write paths (world tick + sub-tick) into one EventLog → mitigated by SQLite row-level lock + deterministic ordering key.
  - Sub-tick loop leak on crash → mitigated by hydrate-on-boot resuming at `lastCommittedCombatTick + 1` and clearing intervals on resolve.
  - Client prediction divergence → bounded by `tickDigest` mismatch + snapshot fallback.
- **Non-conformance impact**:
  - Closes `§11.4` (combat side effects fully event-sourced).
  - Tightens `§0.5` (Rule Engine sole compiler — card effects).
  - Validates `§1.2` (EventLog sole truth — combat state).
  - Partially closes `§11.2` (card events join canonical log; legacy log specced as sub-log).
  - Out of scope: `§11.3`, `§11.5`, `§11.6`, `§11.8`, `§11.9`.
- **Out of scope (Phase D)**:
  - Full `worldEffects` reducer (loot drops, faction shifts) — payload defined, reducer deferred.
  - AI ambient combat narrator hooks.
  - NPC card AI planner (Phase C uses `seededRandInt(deckSize)` from Phase B).

## Open Questions — Answered (v0.25.x)

1. **Multi-tick card channeling vs instant-cast only in v1?**
   → **Instant-cast only in v1.** All Phase C cards resolve within the same sub-tick they are submitted for. Multi-tick channeling deferred to Phase D. (Confirmed by Phase C implementation: `evaluateCombatSubTick` resolves all pending commands in one pass.)

2. **NPC card AI: keep `seededRandInt(deck)` for v1, planner in Phase D — confirm?**
   → **Confirmed: `seededRandInt` approach retained for v1.** Phase C NPC card play is driven by the Phase B `seededRandInt(deckSize)` style selection inside `CombatRuntime` tick callback. Planner (intent-weighted, persona-aware) deferred to Phase D.

3. **Damage formula: card stats replace Phase B fixed formula, or layer on top?**
   → **Replace for Phase C.** Phase C cards use `effect.power` directly (e.g. FIRE_LASH = 18, TIDE_STRIKE = 22) as the authoritative damage value. The Phase B `base + greedBoost - patienceMitigation + crit` formula applies only to Phase B `/action` commands. The two paths are separate and the Phase B compat shim remains intact through v0.16.x.

4. **Snapshot retention duration after combat resolves?**
   → **No explicit TTL in v1.** `CombatSubTickCoordinator` retains the in-memory projection indefinitely until server restart. The `GET /api/combat/:id/snapshot` endpoint returns the last known snapshot even after `resolved = true`. Explicit TTL or garbage-collection deferred to Phase D.

5. **AoE cards (nullable target) in v1, or strictly single-target?**
   → **Strictly single-target in v1.** All Phase C card effects require a non-null `targetActorId`. The compiler rejects cards without a target. AoE (nullable target, multi-target fan-out) deferred to Phase D.
