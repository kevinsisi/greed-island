## Context

Phase B (`combat-phase-b-single-shot`, shipped v0.15.0) validated the Command → Rule Engine → Event combat pipeline at single-shot granularity:

- One world tick = one full combat decision; no sub-tick.
- No glyph cards; only `attack`/`defend`/`flee`.
- HTTP request/response per action; no SSE; no prediction.
- `CombatStore` keeps in-memory + SQLite combat session tables but is **not** a pure projection of EventLog yet (`ARCHITECTURE.md §11.4`).

Phase C is the upgrade pass that retires every one of those simplifications without breaking deployed clients. The hard part is doing it while preserving the deterministic-replay guarantee from `combat-runtime` (the capability spec defined in `combat-system/`).

## Goals / Non-Goals

**Goals:**

- Sub-tick loop default 10 Hz, configurable 5–20 Hz via `combatTickRate`, decoupled from the 5s world tick.
- Glyph cards as a typed Command source, compiled to sub-events by the rule engine.
- Deterministic priority resolution for overlapping card plays in the same sub-tick.
- `CombatStore` becomes a read-only projection of committed EventLog combat events — closes `§11.4`.
- Combat events join the canonical EventLog (no separate authoritative log) — partially closes `§11.2`.
- SSE-driven client projection with optimistic prediction + reconcile-on-mismatch.
- Mid-flight combats survive deploy via boot-time hydration from EventLog.
- Phase B HTTP `POST /api/combat/:id/action` remains live through v0.16.x.

**Non-Goals:**

- Full `worldEffects` reducer (loot drops, faction shifts) — payload defined, reducer deferred to Phase D.
- AI ambient combat narrator hooks — Phase D.
- NPC card AI planner — Phase C reuses Phase B's `seededRandInt(deckSize)`.
- Card schema migration — Phase C decorates the existing catalog with `priority`; no DB shape change.
- Sunsetting Phase B HTTP — planned for v0.17+, not this release.

## Decisions

### D1. Sub-tick loop spawned per active combat, not a global scheduler

`CombatRuntime` listens for committed `COMBAT_INITIATE` events. For each, it spawns a dedicated `setInterval` keyed by `combatId` at `config.combatTickRate` ms. The interval is cleared on the committed `COMBAT_RESOLVE` / `COMBAT_DEFEAT` for that `combatId`.

Alternatives considered:

- One global `setInterval` driving all combats — rejected because a long-running combat would force every other combat to run at the slowest rate, and a stuck loop affects everyone.
- World-tick-driven sub-tick fan-out — rejected because the world tick is 5s; we'd need a second clock anyway.

### D2. Both world tick and combat sub-tick write to the same EventLog

No second log, no shadow log. Ordering key: `(tick asc, combatTick asc, actorId asc, commandId asc)`. SQLite row-level locking serializes writes; readers always see a consistent prefix.

Alternative: separate `combat_event_log` table — rejected because it would re-introduce the `§11.2` violation we're trying to close.

### D3. Card priority table is fixed in code, not data

```
PHASE_SHIFT, COUNTERSPELL, INTERRUPT : 0   // pre-empt
NO_ESCAPE, SILENCE, STUN              : 1   // control
FIRE_LASH, TIDE_STRIKE, MEND          : 2   // direct effect
SHIELD, HASTE, REGEN                  : 3   // defensive setup
DOT_TICK, BUFF_TICK                   : 4   // passive tick
```

Same priority → lexicographic `(actorId asc, commandId asc)`.
`commandId = hashSeed(commandType, actorId, tick, combatTick, payloadCanonical)` — same hashSeed used at `packages/server/src/combat/commands.ts:82-96`.

Alternative: data-driven priority per card row — rejected for v1. Priority is a structural property of the *interaction class*, not the individual card; a data-driven table invites accidental priority churn that breaks replay.

### D4. 5-phase rule engine per sub-tick `T`

1. `STATUS_TICK`: for each active status → emit `COMBAT_STATUS_TICK`; decrement remaining; if 0 → `COMBAT_STATUS_END`.
2. `CARD_PLAY`: gather all `COMBAT_CARD_PLAY` for `T` → sort by priority + tie-break → for each in order: validate target (alive / not locked unless priority 0) → emit `COMBAT_CARD_PLAY_ACCEPTED` → look up `card.effect` in catalog → emit sub-commands (`COMBAT_DAMAGE` / `COMBAT_STATUS_APPLY` / etc.).
3. `DAMAGE/HEAL`: clamp hp; apply mitigation from prior-turn `COMBAT_DEFEND` if applicable.
4. `DEFEAT`: any actor with `hp ≤ 0` → `COMBAT_DEFEAT`; mark defeated.
5. `RESOLVE`: if victory condition met → `COMBAT_RESOLVE`; cancel pending channels.

The phases run inside a single SQLite transaction. SSE flush happens after commit.

### D5. Client prediction model

- Client POSTs `POST /api/combat/:id/play { cardId, target }`.
- Client immediately applies a **predicted** delta from `cards/catalog.ts` (damage / status / heal). UI shows the predicted state.
- Server validates → appends events → responds `{ accepted, commandId, events[] }` AND pushes via SSE.
- On reject (validation fail) → toast + rollback to pre-prediction state.
- On accept with `actualDamage ≠ predictedDamage` → silently reconcile UI to actual amount (no toast).
- `tickDigest = hash(combatId + combatTick + hp[player] + hp[npc] + statusBag + phases)` accompanies every SSE event. Client compares against its derived digest; mismatch → `GET /api/combat/:id/snapshot`.

### D6. Failure / desync handling

| Failure | Recovery |
| --- | --- |
| Server reject (validation) | Client rollback + toast |
| `tickDigest` mismatch | Client `GET /api/combat/:id/snapshot` |
| Network split | Client 5s timeout → snapshot |
| Server crash mid-combat | On boot, hydrate from EventLog, resume loop at `lastCommittedCombatTick + 1` |

### D7. CombatStore becomes a read-only projection

`CombatStore` no longer writes from HTTP handlers. All writes flow:

```
HTTP → submitLivingWorldCommand → Rule Engine → EventLog (committed)
                                                  ↓ reducer
                                                  CombatStore (projection)
                                                  ↓
                                                  SSE fan-out
```

This closes `§11.4`.

### D8. Slicing under v0.16.x

Six ship-able slices, each its own version bump. Each slice keeps the previous slice's tests green:

1. Sub-tick loop infrastructure (spawn/kill; no UI). Server-only.
2. 5-phase rule engine + card priority + tie-break.
3. EventLog integration — `CombatStore` refactor to read-only projection.
4. SSE projection + client prediction + new HTTP endpoints.
5. Real-time UI (Phaser `CombatScene`, extended `CombatHud`).
6. Determinism audit + 1000-event replay test + ROADMAP/PROGRESS/MEMORY updates.

## Risks / Trade-offs

- **Concurrent writes (world tick + multiple combat sub-ticks) to EventLog** → Mitigation: SQLite row-level lock; ordering key includes both `tick` and `combatTick`; deterministic replay test (1000 events) gates the release.
- **Interval leak on uncaught error** → Mitigation: each interval callback wrapped in try/catch; rule-engine errors emit `COMBAT_RESOLVE` with `outcome=error_abort`, which clears the interval.
- **Client prediction divergence** → Mitigation: bounded by `tickDigest` check every sub-tick; snapshot endpoint is cheap (single reducer pass on EventLog).
- **Performance at 20 Hz × N combats** → Mitigation: default stays at 10 Hz; per-combat loop means 0 cost when no combats; benchmark gate in slice 6 — `sub-tick latency p99 < combatTickMs/2`.
- **Card catalog priority drift across versions** → Mitigation: priority table lives in `cards/catalog.ts` as a frozen const; any change requires a new OpenSpec change since it impacts replay.
- **Phase B clients posting `/api/combat/:id/action` mid-Phase-C-combat** → Mitigation: legacy endpoint routes through same `submitLivingWorldCommand` → Rule Engine treats it as a non-card command at priority 2. No special-casing.

## Migration Plan

1. Deploy slice 1 (sub-tick loop infrastructure). No client change. Existing Phase B combat path unaffected because `COMBAT_INITIATE` from Phase B does **not** trigger the new loop until slice 2 ships the rule-engine hook.
2. Deploy slice 2 (rule engine). `COMBAT_INITIATE` now spawns the sub-tick loop; Phase B `attack/defend/flee` actions get routed through the new engine but produce the same events as before (priority 2, no card payload).
3. Deploy slice 3 (`CombatStore` refactor). Internal only. EventLog becomes single source of truth.
4. Deploy slice 4 (SSE + prediction + new endpoints). New clients can use `/play`; old clients keep using `/action`.
5. Deploy slice 5 (UI). Card hand + Phaser scene ship.
6. Deploy slice 6 (audit). Run 1000-event replay test on the actual prod EventLog.

**Rollback**: each slice is rolled back by re-deploying the previous version's binary. The EventLog stays compatible because all new event types use `eventType` strings that older binaries' reducers skip (existing reducer behavior: unknown event = no-op).

**Sunset**: `POST /api/combat/:id/action` removed in v0.17+ once metrics show <1% of traffic uses it.

## Open Questions

1. **Multi-tick card channeling** vs instant-cast only in v1? Channeling requires a `COMBAT_CARD_CHANNEL_TICK` event family and a `cancelOnDamage` flag. Suggest: instant-cast only in v1, channeling in Phase D.
2. **NPC card AI**: keep `seededRandInt(deck)` from Phase B for v1, planner in Phase D — confirm?
3. **Damage formula**: do card stats (power/element/crit%) **replace** the Phase B `base + greedBoost - patienceMitigation` formula, or **layer** on top (e.g. `base + cardPower`)? Replacing is cleaner; layering preserves balance familiarity.
4. **Snapshot retention** after combat resolves: how long should `GET /api/combat/:id/snapshot` keep returning a real snapshot vs returning the compacted `COMBAT_HISTORY_COMPACT`? Suggest: 60s from Phase B retention, aligned with current `CombatStore` retention.
5. **AoE cards** (nullable `target`): include in v1 or strictly single-target? AoE complicates priority resolution (multi-target lock). Suggest: strictly single-target in v1.
