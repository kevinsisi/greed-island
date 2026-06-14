## MODIFIED Requirements

### Requirement: Living world commands are typed

The system SHALL define a closed catalog of domain Commands for the living world. Every Command MUST declare a command type, an actor identity, an actor type (`player`, `npc`, or `system`), a tick number, and a typed payload. Weather-agent intent MUST be expressible as a typed system command before any weather outcome is committed.

#### Scenario: Unknown command type is rejected

- **WHEN** a Command with a type outside the catalog is submitted
- **THEN** the Rule Engine MUST reject it with code `UNKNOWN_COMMAND` and the EventLog MUST remain unchanged

#### Scenario: Catalog covers world behavior

- **WHEN** the runtime needs to express NPC movement, NPC activity change, NPC interaction, area pressure, weather-agent intent, weather change, season change, world-event spawn or end, building enter or leave, rare-window open or close, and tick advance
- **THEN** each MUST be expressible as a domain Command from the catalog

### Requirement: WorldState is a pure projection of typed events

WorldState SHALL be derived from the EventLog by a pure reducer that understands every domain event type. The reducer MUST NOT depend on hidden mutable runtime state, wall-clock time, external IO, or AI output. Weather-agent mood/thought state MUST be a projection of committed weather-agent and weather-change events.

#### Scenario: Replay yields identical world state

- **WHEN** the same EventLog is reduced twice
- **THEN** the resulting NPC tiles, NPC activities, area faction percentages, area resources, weather, weather-agent mood/thoughts, season, building occupants, rare-window state, and active world events MUST be byte-for-byte identical between reductions

#### Scenario: Projection covers living-world facets

- **WHEN** a caller requests the `LivingWorldProjection`
- **THEN** the response MUST expose NPC state, area state, building occupants, weather, weather-agent metadata, season, rare window, and active world events derived from the EventLog

### Requirement: Living-world law is enforced

The runtime SHALL enforce the law that intent flows through Commands, the Rule Engine is the only compiler, the EventLog is the only truth, NPC memory and relationships are projections of that truth, weather-agent mood and thoughts are projections of that truth, emotional state is a derivation, AI is a read-only renderer, and the world advances deterministically without players.

#### Scenario: Direct mutation has no authoritative path

- **WHEN** any caller attempts to mutate NPC tile, NPC mood, area resources, building occupants, weather, weather-agent thoughts, season, rare window, active world events, NPC memory, or NPC relationships without producing a domain Command and committing the resulting Event
- **THEN** the kernel API MUST provide no path for that mutation to become part of the next `LivingWorldProjection`

#### Scenario: Empty player input still advances world

- **WHEN** a tick has no player commands
- **THEN** the runtime MUST still collect NPC, area, building, weather-agent intent, weather, season, and world-event Commands and commit any accepted Events deterministically through the Rule Engine
