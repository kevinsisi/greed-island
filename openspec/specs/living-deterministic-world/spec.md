# living-deterministic-world Specification

## Purpose
TBD - created by archiving change living-deterministic-world. Update Purpose after archive.
## Requirements
### Requirement: Living world commands are typed
The system SHALL define a closed catalog of domain Commands for the living world. Every Command MUST declare a command type, an actor identity, an actor type (`player`, `npc`, or `system`), a tick number, and a typed payload.

#### Scenario: Unknown command type is rejected
- **WHEN** a Command with a type outside the catalog is submitted
- **THEN** the Rule Engine MUST reject it with code `UNKNOWN_COMMAND` and the EventLog MUST remain unchanged

#### Scenario: Catalog covers world behavior
- **WHEN** the runtime needs to express NPC movement, NPC activity change, NPC interaction, area pressure, weather change, season change, world-event spawn or end, building enter or leave, rare-window open or close, and tick advance
- **THEN** each MUST be expressible as a domain Command from the catalog

### Requirement: Rule Engine compiles every domain command
The Rule Engine SHALL be the only valid path from domain Command to Event. The runtime, NPC engine, area-state engine, building runtime, and world-event engine MUST NOT append Events to the EventLog directly.

#### Scenario: Runtime cannot bypass Rule Engine
- **WHEN** the runtime resolves a tick
- **THEN** every Event written to `event_log` for that tick MUST originate from a `RuleResult.events` array produced by `KernelRuleEngine.evaluate`

#### Scenario: Domain command produces typed event
- **WHEN** an `NPC_MOVE` Command with `{ from, to, activity }` is accepted
- **THEN** the resulting Event MUST be typed `NPC_MOVE` with the same `from`, `to`, `activity`, the submitting actor as `actorId`, and a deterministic key derived from `(commandType, actorId, payload, tick, rulesetVersion)`

### Requirement: Domain commands validate against prior world state
The Rule Engine SHALL validate each domain Command against `WorldState(t-1)` before producing an Event. Invalid commands MUST be rejected without state mutation.

#### Scenario: NPC_MOVE rejects mismatched origin
- **WHEN** an `NPC_MOVE` Command claims `from = t_market` but the NPC's projected tile is `t_central`
- **THEN** the Rule Engine MUST reject with code `INVALID_STATE` and reason describing the mismatch

#### Scenario: BUILDING_ENTER rejects unknown building
- **WHEN** a `BUILDING_ENTER` Command names a building id not in the catalog
- **THEN** the Rule Engine MUST reject with code `INVALID_PAYLOAD`

### Requirement: WorldState is a pure projection of typed events
WorldState SHALL be derived from the EventLog by a pure reducer that understands every domain event type. The reducer MUST NOT depend on hidden mutable runtime state, wall-clock time, or external IO.

#### Scenario: Replay yields identical world state
- **WHEN** the same EventLog is reduced twice
- **THEN** the resulting NPC tiles, NPC activities, area faction percentages, area resources, weather, season, building occupants, rare-window state, and active world events MUST be byte-for-byte identical between reductions

#### Scenario: Projection covers living-world facets
- **WHEN** a caller requests the `LivingWorldProjection`
- **THEN** the response MUST expose NPC state, area state, building occupants, weather, season, rare window, and active world events derived from the EventLog

### Requirement: NPC memory is derived from events
The system SHALL derive an `npc_memory` projection from the EventLog. Memories MUST be append-only rows with `(npc_id, memory_type, content_json, tick, importance)` and MUST be rebuildable by replaying the EventLog.

#### Scenario: Interaction creates memories for both NPCs
- **WHEN** an `NPC_INTERACT` Event with participants `(a, b)` and mode `argue` is committed at tick `t`
- **THEN** `npc_memory` MUST contain at least one row for `npc_id = a` and one for `npc_id = b`, both with `memory_type = 'interaction'`, importance reflecting `argue` (≥ 5), and `tick = t`

#### Scenario: Replay rebuilds identical memories
- **WHEN** `npc_memory` is dropped and the projection is rebuilt from the EventLog
- **THEN** the resulting rows MUST match the original rows by `(npc_id, memory_type, content_json, tick, importance)`

#### Scenario: NPC policy may read memories
- **WHEN** an NPC policy is asked to decide for tick `t`
- **THEN** it MAY read `getRecentMemories(npcId, limit)` and `getImportantMemories(npcId, threshold)` from the projection, but MUST NOT depend on memories created in the same tick

### Requirement: NPC relationships are derived from interactions
The system SHALL derive an `npc_relationships` projection from `NPC_INTERACT` events. Each row MUST be keyed by canonical `(npc_a, npc_b)` ordering with `npc_a < npc_b`, MUST track `relationship_type ∈ {neutral, friend, rival}`, `trust ∈ [0, 100]`, and a JSON `history` of recent interactions.

#### Scenario: Chat raises trust, argue lowers it
- **WHEN** two NPCs `(a, b)` accumulate one `chat` and one `argue` interaction
- **THEN** their relationship row MUST end with `trust = base + 1 − 2 = base − 1`, clamped to `[0, 100]`

#### Scenario: Threshold crosses promote and demote relationship type
- **WHEN** trust rises strictly above 75 from below
- **THEN** `relationship_type` MUST transition to `friend`
- **WHEN** trust falls strictly below 25 from above
- **THEN** `relationship_type` MUST transition to `rival`
- **WHEN** trust is in the closed interval `[25, 75]`
- **THEN** `relationship_type` MAY remain `neutral` if it was previously `neutral`, and MUST not jump directly between `friend` and `rival` without crossing the neutral band

#### Scenario: Replay rebuilds identical relationships
- **WHEN** `npc_relationships` is dropped and the projection is rebuilt from the EventLog
- **THEN** the resulting rows MUST match the original by `(npc_a, npc_b, relationship_type, trust, history)`

### Requirement: Emotional state is a pure derivation
Per-NPC emotional state SHALL be a pure function over recent memories, relationship rows, and current area pressure. The system MUST NOT store `attachment`, `tension`, `trust`, or `loss` as a separate writable scalar.

#### Scenario: Same inputs yield same emotional snapshot
- **WHEN** `runtime.getNpcEmotionalSnapshot(npcId)` is called twice with no intervening Events
- **THEN** the returned `{ attachment, tension, trust, loss }` MUST be identical

#### Scenario: Loss reflects rivalry and area pressure
- **WHEN** an NPC has at least one `rival` relationship and lives in an area whose `factionTension` is high
- **THEN** the snapshot's `loss` field MUST be strictly greater than for an NPC with no rival relationships in a calm area

### Requirement: Offline catch-up summary is deterministic
The system SHALL provide a `summarizeWindow(sinceTick, untilTick)` function and a `/api/world/catch-up` endpoint that produce a deterministic summary of the EventLog window grouped by area, NPC, and faction.

#### Scenario: Identical window yields identical summary
- **WHEN** `summarizeWindow(sinceTick, untilTick)` is called twice for the same window
- **THEN** the returned text and structured groups MUST be byte-for-byte identical

#### Scenario: Endpoint reports latest tick
- **WHEN** `/api/world/catch-up?sinceTick=N` is called
- **THEN** the response MUST include `latestTick` equal to the most recent committed tick at the time of call, and `events` covering only the window `(N, latestTick]`

### Requirement: Deterministic replay is validated
The system SHALL include a replay test that loads a fixture EventLog and asserts identical WorldState, identical NPC memory rows, and identical NPC relationship rows on two independent reductions.

#### Scenario: Replay validates living-world projection identity
- **WHEN** the replay test reduces the same EventLog twice
- **THEN** the WorldState canonical hash, the NPC memory canonical hash, and the NPC relationship canonical hash MUST all match between reductions

#### Scenario: Reducer reads only EventLog
- **WHEN** the replay test reduces the EventLog with all other tables empty
- **THEN** the resulting WorldState, memory, and relationship rows MUST match a baseline produced from the same EventLog

### Requirement: Living-world law is enforced
The runtime SHALL enforce the law that intent flows through Commands, the Rule Engine is the only compiler, the EventLog is the only truth, NPC memory and relationships are projections of that truth, emotional state is a derivation, AI is a read-only renderer, and the world advances deterministically without players.

#### Scenario: Direct mutation has no authoritative path
- **WHEN** any caller attempts to mutate NPC tile, NPC mood, area resources, building occupants, weather, season, rare window, active world events, NPC memory, or NPC relationships without producing a domain Command and committing the resulting Event
- **THEN** the kernel API MUST provide no path for that mutation to become part of the next `LivingWorldProjection`

#### Scenario: Empty player input still advances world
- **WHEN** a tick has no player commands
- **THEN** the runtime MUST still collect NPC, area, building, weather, season, and world-event Commands and commit any accepted Events deterministically through the Rule Engine

### Requirement: Catalog covers ecosystem migration events
The living-world command catalog SHALL include `ANIMAL_MIGRATED` and
`MIGRATION_WAVE_STARTED` as typed commands with validated payloads.
`ANIMAL_MIGRATED` MUST declare `animalId`, `speciesId`, `fromTileId`, `toTileId`,
`migratedAtTick`, and `migrationType` (`'pressure' | 'seasonal'`).
`MIGRATION_WAVE_STARTED` MUST declare `waveId`, `speciesId`, `fromTileId`,
`toTileId`, `startedAtTick`, and `migrationType`.

#### Scenario: ANIMAL_MIGRATED with missing fromTileId is rejected
- **WHEN** an `ANIMAL_MIGRATED` command is submitted without `fromTileId`
- **THEN** the Rule Engine MUST reject it with code `INVALID_PAYLOAD`

#### Scenario: ANIMAL_MIGRATED with identical fromTileId and toTileId is rejected
- **WHEN** an `ANIMAL_MIGRATED` command has `fromTileId === toTileId`
- **THEN** the Rule Engine MUST reject it with code `INVALID_PAYLOAD`

#### Scenario: MIGRATION_WAVE_STARTED with invalid migrationType is rejected
- **WHEN** a `MIGRATION_WAVE_STARTED` command carries `migrationType` outside
  `['pressure', 'seasonal']`
- **THEN** the Rule Engine MUST reject it with code `INVALID_PAYLOAD`

### Requirement: ANIMAL_KILLED command and event are defined

The system SHALL define `ANIMAL_KILLED` as a command and event type in the living-world command catalog. The payload MUST include `huntId`, `predatorSpeciesId`, `predatorAnimalId`, `preySpeciesId`, `preyAnimalId`, `tileId`, and `killedAtTick`.

#### Scenario: Validator rejects mismatched tile
- **WHEN** an `ANIMAL_KILLED` command payload has `tileId` that is empty or missing
- **THEN** the Rule Engine MUST reject with `INVALID_PAYLOAD`

#### Scenario: Validator rejects same predator and prey animal id
- **WHEN** `predatorAnimalId === preyAnimalId`
- **THEN** the Rule Engine MUST reject with `INVALID_PAYLOAD`

### Requirement: ANIMAL_DIED_STARVATION command and event are defined

The system SHALL define `ANIMAL_DIED_STARVATION` as a command and event type in the living-world command catalog. The payload MUST include `starvationId`, `predatorSpeciesId`, `predatorAnimalId`, `tileId`, and `diedAtTick`.

#### Scenario: Validator rejects empty starvationId
- **WHEN** an `ANIMAL_DIED_STARVATION` command payload has an empty or missing `starvationId`
- **THEN** the Rule Engine MUST reject with `INVALID_PAYLOAD`

### Requirement: AnimalPopulationProjection handles predation events

`AnimalPopulationProjection.project()` MUST handle `ANIMAL_KILLED` (remove prey animal id from prey row) and `ANIMAL_DIED_STARVATION` (remove predator animal id from predator row). Both operations MUST be no-ops if the named animal id is not present in the row.

#### Scenario: Replay is idempotent for predation events
- **WHEN** the same EventLog containing `ANIMAL_KILLED` and `ANIMAL_DIED_STARVATION` events is replayed twice
- **THEN** `AnimalPopulationProjection.canonicalHash()` MUST return the same value both times

### Requirement: The living-world catalog SHALL register four aggression commands

The catalog in `packages/server/src/kernel/livingWorldCommands.ts` MUST
include `ANIMAL_TARGETED_NPC`, `ANIMAL_ATTACKED_NPC`, `ANIMAL_FLED`,
and `ANIMAL_RETALIATED` with payload validators that enforce non-empty
identifiers and integer non-negative tick fields. The Rule Engine MUST
reject any payload that fails validation.

#### Scenario: Validator rejects an empty animalId on attack

- **GIVEN** a command `ANIMAL_ATTACKED_NPC` with
  `payload.data.animalId = ''`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST be rejected
- **AND** no event MUST be appended to the EventLog

#### Scenario: Valid attack payload passes validation

- **GIVEN** a command `ANIMAL_ATTACKED_NPC` with
  `payload.data = { animalId: 'a_wolf_001', npcId: 'npc_yuna', speciesId: 'fog_wolf', tileId: 't_forest', damage: { mood: -10, health: -10 }, attackedAtTick: 100, narration: '...' }`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST pass validation
- **AND** the matching event MUST be appended to the EventLog

### Requirement: The living-world catalog SHALL register the defense party command

The catalog in `packages/server/src/kernel/livingWorldCommands.ts` MUST
include `NPC_DEFENSE_PARTY_FORMED` with a validator that requires a
non-empty `partyId`, a non-empty `targetAnimalId`, a non-empty
`tileId`, an integer non-negative `formedAtTick`, and a
`memberNpcIds` array of length `>= DEFENSE_PARTY_MIN_MEMBERS`.

#### Scenario: Validator rejects a party with one member

- **GIVEN** a command `NPC_DEFENSE_PARTY_FORMED` with
  `payload.data.memberNpcIds = ['npc_solo']`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST be rejected
- **AND** no event MUST be appended to the EventLog

#### Scenario: Valid party formation passes validation

- **GIVEN** a command `NPC_DEFENSE_PARTY_FORMED` with
  `payload.data = { partyId: 'defense.abc', targetAnimalId: 'a_wolf_001', targetSpeciesId: 'fog_wolf', tileId: 't_forest', victimNpcId: 'npc_yuna', memberNpcIds: ['npc_anton', 'npc_kai'], reactionToAttackId: 'attack.a_wolf_001.t_forest.100', formedAtTick: 101, narration: '...' }`
- **WHEN** the Rule Engine validates the command
- **THEN** the command MUST pass validation

