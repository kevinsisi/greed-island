# ecosystem-runtime Delta Specification (ecosystem-mythic-ecology)

## ADDED Requirements

### Requirement: Ecosystem runtime SHALL include legendary spawn cadence block
The runtime's E4 cadence block MUST invoke `legendarySpawnPlanner` every `LEGENDARY_SPAWN_CADENCE_TICKS` ticks. The planner result MAY include `ANIMAL_SPAWNED` commands for legendary species. When a legendary `ANIMAL_SPAWNED` event is committed, the runtime fan-out MUST immediately emit `WORLD_EVENT_SPAWNED` with `{ eventKind, tileId, linkedAnimalId, speciesId, severity, tick }`.

#### Scenario: Legendary animal spawned triggers world event
- **WHEN** a legendary `ANIMAL_SPAWNED` event is committed with `animal.speciesId` having `rarity: 'legendary'`
- **THEN** the runtime fan-out MUST emit `WORLD_EVENT_SPAWNED` for that animal in the same tick

#### Scenario: Non-legendary animal spawned does not trigger world event
- **WHEN** a regular (non-legendary) `ANIMAL_SPAWNED` event is committed
- **THEN** the runtime MUST NOT emit `WORLD_EVENT_SPAWNED`

### Requirement: Ecosystem runtime fan-out SHALL resolve world events on animal death or migration
When the runtime commits `ANIMAL_KILLED`, `ANIMAL_STARVED`, or `ANIMAL_MIGRATED` for an animal that has an active world event, it MUST emit `WORLD_EVENT_RESOLVED` with the same `linkedAnimalId` and the resolution tick.

#### Scenario: Legendary creature death resolves world event
- **WHEN** `ANIMAL_KILLED` is committed for an animal tracked in `WorldEventProjection`
- **THEN** `WORLD_EVENT_RESOLVED` MUST be emitted within the same tick

#### Scenario: Non-legendary animal death does not emit world event resolved
- **WHEN** `ANIMAL_KILLED` is committed for a non-legendary animal
- **THEN** `WORLD_EVENT_RESOLVED` MUST NOT be emitted

### Requirement: WorldEventProjection SHALL be wired into boot hydration and fan-out
`WorldEventProjection` MUST be added to `ECOSYSTEM_BOOT_EVENT_TYPES`, wired into both the large-log else-branch boot path and the per-event fan-out loop, following the same pattern as `AnimalPopulationProjection` and `LivestockRegistryProjection`.

#### Scenario: WorldEventProjection hydrates correctly on boot
- **GIVEN** an EventLog containing `WORLD_EVENT_SPAWNED` and `WORLD_EVENT_RESOLVED` events
- **WHEN** the runtime boots
- **THEN** `worldEventProjection.getActiveByTile(tileId)` MUST reflect only unresolved events

### Requirement: Ecosystem runtime SHALL include faction ecology cadence block
The runtime's E4 cadence block MUST invoke `factionEcologyPlanner` every `FACTION_ECOLOGY_CADENCE_TICKS` ticks. The planner MUST read current ecosystem pressure, fishery density, and livestock counts to determine which faction ecology commands to emit.

#### Scenario: Faction ecology planner called on cadence
- **WHEN** `FACTION_ECOLOGY_CADENCE_TICKS` ticks have elapsed
- **THEN** `factionEcologyPlanner` MUST be invoked and its commands submitted through the Rule Engine

### Requirement: Ecosystem runtime SHALL include legendary hunt detection each tick
`legendaryHuntPlanner` MUST be invoked each tick for all active world events. It MUST read the NPC list to count hunter-role NPCs on each legendary creature's tile and maintain in-memory hunt tracking state.

#### Scenario: Hunt detection runs each tick without blocking
- **WHEN** the runtime runs a tick with active world events
- **THEN** `legendaryHuntPlanner` MUST execute in O(active world events) time
