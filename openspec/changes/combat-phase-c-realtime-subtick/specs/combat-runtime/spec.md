# Spec delta — combat-runtime (Phase C)

## ADDED Requirements

### Requirement: Sub-tick loop is spawned and terminated per active combat

The combat runtime SHALL spawn a dedicated sub-tick loop for each active combat when its `COMBAT_INITIATE` event is committed, and SHALL terminate the loop when `COMBAT_RESOLVE` or `COMBAT_DEFEAT` for that `combatId` is committed. Loop rate MUST equal `config.combatTickRate` (default 100ms = 10 Hz, allowed range 5–20 Hz).

#### Scenario: Loop spawn on initiate

- **WHEN** a `COMBAT_INITIATE` event for `combatId = X` is committed to EventLog
- **THEN** the runtime MUST spawn exactly one sub-tick loop keyed by `X` at `config.combatTickRate` ms
- **AND** no other combat's loop is affected

#### Scenario: Loop termination on resolve

- **WHEN** a `COMBAT_RESOLVE` or `COMBAT_DEFEAT` event for `combatId = X` is committed
- **THEN** the sub-tick loop for `X` MUST be cleared within one sub-tick interval
- **AND** no further combat events for `X` are emitted by the runtime

### Requirement: 5-phase engine processes each sub-tick in fixed order

Within a single sub-tick `T`, `CombatRuleEngine` MUST process commands in five phases in this exact order: `STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE`. All events produced in sub-tick `T` MUST be appended in a single SQLite transaction; SSE fan-out MUST happen only after commit.

#### Scenario: Phase ordering within a sub-tick

- **WHEN** at sub-tick `T` an active DOT, a player `COMBAT_CARD_PLAY` (FIRE_LASH), and a defeat condition are all in play
- **THEN** events MUST appear in EventLog in order: `COMBAT_STATUS_TICK` (DOT) → `COMBAT_CARD_PLAY_ACCEPTED` (FIRE_LASH) → `COMBAT_DAMAGE` (FIRE_LASH effect) → `COMBAT_DEFEAT` (if target hp ≤ 0) → `COMBAT_RESOLVE` (if victory condition met)

#### Scenario: Atomic commit per sub-tick

- **WHEN** the rule engine processes sub-tick `T` and the SQLite transaction fails partway
- **THEN** no events for `T` MUST be visible in EventLog
- **AND** the runtime MUST retry `T` on the next loop iteration without skipping commands

### Requirement: Card play resolves by fixed priority table with deterministic tie-break

When multiple `COMBAT_CARD_PLAY` commands are gathered in the same sub-tick, `CombatRuleEngine` MUST sort them by `(priority asc, actorId asc, commandId asc)` and process them in that order. The priority table MUST be defined in `cards/catalog.ts` as a frozen const; cards MUST be assigned exactly one of these priority classes:

```
PHASE_SHIFT, COUNTERSPELL, INTERRUPT : 0
NO_ESCAPE, SILENCE, STUN              : 1
FIRE_LASH, TIDE_STRIKE, MEND          : 2
SHIELD, HASTE, REGEN                  : 3
DOT_TICK, BUFF_TICK                   : 4
```

`commandId` MUST be `hashSeed(commandType, actorId, tick, combatTick, payloadCanonical)`.

#### Scenario: Same priority tie-broken by actorId then commandId

- **WHEN** Actor A and Actor B both play `FIRE_LASH` at the same sub-tick
- **AND** `actorId(A) < actorId(B)` lexicographically
- **THEN** A's card MUST resolve before B's
- **AND** if `actorId(A) == actorId(B)`, the one with the lower `commandId` resolves first

#### Scenario: Priority 0 cards bypass target-lock validation

- **WHEN** Actor A is target-locked by a prior `COMBAT_TARGET_LOCK`
- **AND** A plays a priority-0 card (e.g. `PHASE_SHIFT`) in a later sub-tick
- **THEN** the rule engine MUST emit `COMBAT_CARD_PLAY_ACCEPTED` despite the lock
- **AND** a priority-≥1 card from A in the same sub-tick MUST emit `COMBAT_CARD_PLAY_REJECTED` with `reason=target_locked`

### Requirement: CombatStore is a read-only projection of EventLog

`CombatStore` MUST NOT accept writes from HTTP handlers or any source other than the EventLog reducer. All combat state mutations MUST flow `HTTP → submitLivingWorldCommand → Rule Engine → EventLog → reducer → CombatStore`. On server boot, `CombatStore` MUST rebuild its entire state by replaying combat events from EventLog.

#### Scenario: HTTP handler does not write to CombatStore directly

- **WHEN** a `POST /api/combat/:id/play` request is handled
- **THEN** no code path between the HTTP handler and the EventLog commit MUST mutate `CombatStore`
- **AND** `CombatStore` MUST only be updated by the reducer reading the committed event

#### Scenario: Boot-time hydration from EventLog

- **WHEN** the server boots and the EventLog contains a not-yet-resolved combat with last committed event at `(tick=T, combatTick=C)`
- **THEN** `CombatStore` MUST rebuild that combat's state from all events with `combatId = X`
- **AND** the runtime MUST resume the sub-tick loop for `X` at `combatTick = C + 1`

### Requirement: SSE projection delivers authoritative events to clients

The server SHALL push every committed combat event to subscribed clients via SSE. Each pushed event MUST include `tickDigest = hash(combatId + combatTick + hp[*] + statusBag + phases)`. Clients SHALL maintain a `CombatProjection` derived purely from received events and MUST treat predictions as non-authoritative.

#### Scenario: Tick digest mismatch triggers snapshot fetch

- **WHEN** a client's locally derived `tickDigest` for sub-tick `T` does not equal the server-pushed `tickDigest` for `T`
- **THEN** the client MUST fetch `GET /api/combat/:id/snapshot`
- **AND** replace its local `CombatProjection` with the snapshot

#### Scenario: Snapshot equals deterministic reduction

- **WHEN** the client requests `GET /api/combat/:id/snapshot` at sub-tick `T`
- **THEN** the response MUST equal the deterministic reduction of all events with `combatId = X` and `combatTick ≤ T`

### Requirement: Client prediction reconciles to authoritative events without UX disruption on amount mismatch

The client MUST treat optimistic predicted deltas from `cards/catalog.ts` as non-authoritative and MUST reconcile to the server-emitted event when it arrives. Reconcile rules:

- If the command was rejected: the client MUST roll back the prediction and surface a user-visible toast.
- If the command was accepted but the actual damage/heal/status amount differs from the predicted amount: the client MUST silently reconcile the projection to the authoritative amount with no toast.

#### Scenario: Reject triggers rollback + toast

- **WHEN** the client predicts `hp[target] -= 20` and the server returns `COMBAT_CARD_PLAY_REJECTED`
- **THEN** the client MUST restore `hp[target]` to its pre-prediction value
- **AND** a user-visible toast MUST inform the player why the card was rejected

#### Scenario: Accept with different amount reconciles silently

- **WHEN** the client predicts `hp[target] -= 20` and the authoritative `COMBAT_DAMAGE` event has `amount = 25`
- **THEN** the client MUST update its projection to reflect `hp[target] -= 25`
- **AND** MUST NOT show a toast

### Requirement: Combat events join the canonical EventLog with deterministic ordering

All Phase C combat command types (`COMBAT_CARD_PLAY`, `COMBAT_CARD_CANCEL`, `COMBAT_DAMAGE`, `COMBAT_HEAL`, `COMBAT_STATUS_APPLY`, `COMBAT_STATUS_TICK`, `COMBAT_STATUS_END`, `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`, `COMBAT_DEFEAT`) MUST be written to the canonical EventLog (not a side log). Concurrent writes from the world tick and one or more combat sub-tick loops MUST be serialized by SQLite row-level locking and ordered by `(tick asc, combatTick asc, actorId asc, commandId asc)`.

#### Scenario: Concurrent world-tick and sub-tick writes preserve total order

- **WHEN** a world-tick reducer commits an event at `(tick=T, combatTick=0)` while a sub-tick loop commits an event at `(tick=T, combatTick=5)`
- **THEN** both events MUST appear in EventLog
- **AND** the world-tick event MUST precede the sub-tick event in the canonical ordering

#### Scenario: Legacy card_action_log remains as a sub-log with replay contract

- **WHEN** Phase C writes a card event
- **THEN** the canonical EventLog MUST be the sole authoritative record
- **AND** any rows in legacy `card_action_log` MUST be derivable from the canonical EventLog via deterministic projection

### Requirement: Phase B HTTP endpoint remains compatible through v0.16.x

`POST /api/combat/:id/action` MUST keep working through every v0.16.x release. Phase B `attack` / `defend` / `flee` actions MUST route through the new rule engine producing canonical events. Removal MUST be scheduled no earlier than v0.17.0.

#### Scenario: Phase B action routes through Phase C engine

- **WHEN** a client posts `POST /api/combat/:id/action { action: "attack" }` against a Phase C server
- **THEN** the server MUST treat it as a non-card command and route it through the 5-phase engine
- **AND** the resulting events MUST be byte-identical to Phase B for the same `(combatId, actorId, combatRound)` seed

### Requirement: Sub-tick latency stays within budget

For every sub-tick at the default `combatTickRate = 100ms`, server-side processing latency (gather → 5-phase engine → commit → SSE flush) MUST stay under `combatTickMs / 2` at p99 across a 1000-event replay test.

#### Scenario: Latency benchmark gate

- **WHEN** the 1000-event combat replay test runs at 10 Hz
- **THEN** p99 sub-tick latency MUST be under 50 ms
- **AND** the release MUST NOT ship if this gate fails
