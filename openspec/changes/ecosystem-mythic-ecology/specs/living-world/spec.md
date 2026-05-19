# living-world Delta Specification (ecosystem-mythic-ecology)

## ADDED Requirements

### Requirement: LivingWorldCommandPayload SHALL include WORLD_EVENT_SPAWNED and WORLD_EVENT_RESOLVED
The `LivingWorldCommandPayload` union MUST include `WORLD_EVENT_SPAWNED` with payload `{ eventKind: string; tileId: string; linkedAnimalId: string; speciesId: string; severity: number; tick: number }` and `WORLD_EVENT_RESOLVED` with payload `{ linkedAnimalId: string; tileId: string; speciesId: string; resolutionTick: number }`.

#### Scenario: WORLD_EVENT_SPAWNED accepted by Rule Engine
- **WHEN** a `WORLD_EVENT_SPAWNED` command is submitted with a valid legendary animal payload
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

#### Scenario: WORLD_EVENT_RESOLVED accepted by Rule Engine
- **WHEN** a `WORLD_EVENT_RESOLVED` command references a `linkedAnimalId` that has an active world event
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

### Requirement: LivingWorldCommandPayload SHALL include LEGENDARY_HUNT_STARTED and LEGENDARY_HUNT_CONCLUDED
The `LivingWorldCommandPayload` union MUST include `LEGENDARY_HUNT_STARTED` with payload `{ worldEventId: string; linkedAnimalId: string; tileId: string; hunterNpcIds: string[]; startedAtTick: number }` and `LEGENDARY_HUNT_CONCLUDED` with payload `{ worldEventId: string; linkedAnimalId: string; tileId: string; concludedAtTick: number; outcome: 'killed' | 'migrated' | 'starved' }`.

#### Scenario: LEGENDARY_HUNT_STARTED accepted when hunter threshold met
- **WHEN** `LEGENDARY_HUNT_STARTED` is submitted with ≥ 3 hunter NPC ids and a valid world event id
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

#### Scenario: LEGENDARY_HUNT_CONCLUDED accepted on creature death
- **WHEN** `LEGENDARY_HUNT_CONCLUDED` is submitted after the world event is resolved
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

### Requirement: LivingWorldCommandPayload SHALL include four faction ecology command types
The `LivingWorldCommandPayload` union MUST include:
- `FOREST_CLEARCUT_ORDERED` with payload `{ factionId: string; tileId: string; pressureLevel: number; tick: number }`
- `FISHING_QUOTA_ENFORCED` with payload `{ factionId: string; tileId: string; fisheryDensity: number; tick: number }`
- `INDUSTRIAL_SITE_SABOTAGED` with payload `{ factionId: string; tileId: string; livestockCount: number; tick: number }`
- `RITUAL_ECOSYSTEM_MANIPULATION` with payload `{ factionId: string; tick: number }`

#### Scenario: FOREST_CLEARCUT_ORDERED accepted with valid faction and tile
- **WHEN** `FOREST_CLEARCUT_ORDERED` is submitted by the guild faction with a valid forest tile
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

#### Scenario: RITUAL_ECOSYSTEM_MANIPULATION accepted unconditionally
- **WHEN** `RITUAL_ECOSYSTEM_MANIPULATION` is submitted by `hidden_overseer` faction
- **THEN** the Rule Engine MUST accept it regardless of ecosystem state
