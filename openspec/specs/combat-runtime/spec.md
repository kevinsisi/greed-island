# combat-runtime Specification

## Purpose

Defines the combat sub-runtime as a high-frequency extension of the
deterministic simulation kernel, not a parallel system. Combat actions
flow through the same Command → Rule Engine → Event pipeline as world
simulation, only on an accelerated sub-tick clock (`combatTickRate` ∈
[5, 20] Hz) within a single world tick. This capability fixes the
authoritativeness contract for combat: card plays are typed Commands,
card effects are compiled by `CombatRuleEngine` into typed sub-events,
priority resolution is deterministic, clients hold projections only,
and combat outcomes feed the world reducer through a single
`COMBAT_RESOLVE` event whose `worldEffects` enumerate every
cross-domain consequence (hp delta, faction shift, loot, relationships,
history). AI is restricted to read-only narration and MUST NOT alter
hp, damage, priority, or outcome. Combat state is fully replayable from
EventLog and compactable after a retention window so the sub-tick
firehose does not bloat long-term storage. The release that ships this
spec (Phase B, v0.15) realises the single-shot judgement subset of the
contract; later phases (C/D) extend it to real-time sub-tick play and
full world feedback while remaining bound by every requirement below.

## Requirements

### Requirement: Combat sub-tick is deterministic and decoupled from world tick

The combat runtime SHALL run on its own sub-tick clock (`combatTickRate` ∈ [5, 20] Hz) while keeping the world tick at 5s. Combat events MUST NOT depend on wall-clock time for ordering or rule meaning.

#### Scenario: Combat events ordered by (worldTick, combatTick)

- **WHEN** two combat events from the same `combatId` are reduced
- **THEN** they MUST be ordered first by `tick` (world tick), then by `payload.combatTick` (combat-internal monotonic counter), then by `(actorId, commandId)` lexicographic

#### Scenario: Replay produces identical combat outcome

- **WHEN** the same EventLog is reduced twice
- **THEN** all combat outcomes MUST be byte-identical (hp / status / outcome / loot)

### Requirement: Card play is a typed Command, not a direct effect

A card "play" SHALL be expressed as a `COMBAT_CARD_PLAY` Command. The card's effects (damage, status, defense) MUST be compiled by `CombatRuleEngine` into sub-commands (`COMBAT_DAMAGE` / `COMBAT_STATUS_APPLY` / etc.) that become typed Events. Clients MUST NOT compute card effects locally as authoritative — only as optimistic prediction.

#### Scenario: Server is authoritative for damage

- **WHEN** a client predicts `damage = 30` for a card play
- **AND** the server's rule engine computes `damage = 25`
- **THEN** the client MUST reconcile to 25 once it receives the authoritative `COMBAT_DAMAGE` event

### Requirement: Card interactions resolve by deterministic priority table

When multiple `COMBAT_CARD_PLAY` commands target overlapping state in the same combat sub-tick, `CombatRuleEngine` MUST resolve them by a fixed priority table. Same-priority cards MUST tie-break by `(actorId, commandId)` lexicographic.

#### Scenario: PHASE_SHIFT resolves before NO_ESCAPE

- **WHEN** Actor A plays `NO_ESCAPE` and Actor B plays `PHASE_SHIFT` in the same combat sub-tick
- **THEN** `PHASE_SHIFT` (priority 0) MUST resolve first
- **AND** B enters `phase=alt`
- **AND** the subsequent `NO_ESCAPE` resolution MUST emit `COMBAT_TARGET_LOCK_FAIL` because B is no longer on the main phase

### Requirement: Client maintains projection only, never authoritative state

Combat client code SHALL maintain a `CombatProjection` derived purely from received Events. Client SHALL NOT write to `hp`, `status`, `phase`, `locked` based on local computation alone — those values are derived from authoritative events.

#### Scenario: Optimistic prediction is reconciled

- **WHEN** the client optimistically updates `hp[target] -= predictedDamage`
- **AND** the server-authoritative `COMBAT_DAMAGE` event arrives with a different amount
- **THEN** the client MUST update its projection to match the event's amount, not the prediction

### Requirement: Combat resolution emits a single world-impact Event

When a combat ends, `CombatRuleEngine` MUST emit exactly one `COMBAT_RESOLVE` Event whose `payload.worldEffects` enumerates all cross-domain consequences (hp delta, faction shifts, loot drops, relationship shifts, history entry). Endpoints MUST NOT write directly to `npc_relations`, `world_card_drops`, `area_states` etc. as a post-combat side-channel.

#### Scenario: Faction shift goes through the event log

- **WHEN** a combat ends and the victor's faction gains influence
- **THEN** the faction influence change MUST appear in `COMBAT_RESOLVE.payload.worldEffects.factionShifts`
- **AND** the world reducer MUST be the path that updates `area.state.<tile>.factionControl`
- **AND** there MUST NOT be a direct DB write from the combat endpoint

### Requirement: AI participates in combat only as advisory narration

AI (Gemini ambient narrator) MAY render `pre-combat`, `mid-combat`, `post-combat` narration text. AI MUST NOT issue Combat Commands, MUST NOT modify priority resolution, MUST NOT change damage / hp / status calculations. AI failure MUST NOT affect combat outcome.

#### Scenario: AI failure does not block combat resolution

- **WHEN** the AI ambient narrator times out during a combat
- **THEN** the combat MUST still resolve correctly using deterministic narration templates
- **AND** the `COMBAT_RESOLVE` Event MUST still be emitted with all `worldEffects` intact

### Requirement: Combat state is replayable from EventLog

The combat runtime SHALL be reconstructable purely from EventLog. Snapshot endpoints (`GET /api/combat/:id/snapshot`) MUST be derivable from a deterministic reduction of all events for that `combatId`.

#### Scenario: Snapshot equals reduction

- **WHEN** the server returns a combat snapshot at sub-tick T
- **THEN** the snapshot MUST equal the deterministic reduction of all events with `combatTick ≤ T` for that `combatId`

### Requirement: Combat events use combatTick in the deterministic key

Combat-domain typed Events MUST include `combatTick` and `combatId` in the deterministic key seed alongside the existing `(eventType, actorId, tick, payload, ruleset, version)` fields. Two same-payload events at different `combatTick`s in the same world `tick` MUST produce different `deterministicKey`s.

#### Scenario: Identical payload at different combatTicks does not collide

- **WHEN** an actor plays the same card twice at world tick T but combatTick C and C+1
- **THEN** the two `COMBAT_CARD_PLAY` events MUST have different `deterministicKey`s
- **AND** both MUST be appendable to the EventLog without unique-key conflict

### Requirement: Combat runtime obeys the no-external-IO rule from the kernel spec

`CombatRuleEngine.evaluate()` MUST be deterministic and pure. It MUST NOT read DB, MUST NOT call AI, MUST NOT depend on hidden runtime state. All inputs are the Command and a snapshot of the relevant `CombatState`.

#### Scenario: Rule engine is replayable

- **WHEN** the same `COMBAT_CARD_PLAY` Command and the same `CombatState` snapshot are evaluated twice
- **THEN** the rule engine MUST produce equivalent `RuleResult`s

### Requirement: Combat retention compresses sub-tick history after grace period

After `COMBAT_RETENTION_DAYS` (default 7), the combat runtime SHALL compact a finished combat's sub-tick events (CARD_PLAY / DAMAGE / STATUS_*) into a single `COMBAT_HISTORY_COMPACT` event preserving `outcome` + final `worldEffects` + AI narration. The compact event MUST be sufficient for the world reducer to derive faction / relationship / history state without the original sub-tick events.

#### Scenario: Retention preserves world-impacting fields

- **WHEN** a combat is compacted after the retention period
- **THEN** `COMBAT_HISTORY_COMPACT.payload` MUST contain `outcome`, `worldEffects`, and `narration`
- **AND** the world reducer MUST produce identical faction / relationship / history projection from the compacted event as it did from the full sub-tick chain
