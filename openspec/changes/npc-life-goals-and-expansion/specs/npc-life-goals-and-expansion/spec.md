## ADDED Requirements

### Requirement: NPC life goals derive from deterministic pressure

The system SHALL derive NPC life goals from deterministic needs, profile data,
relationships, resources, housing, area conditions, and committed memories. AI
MUST NOT directly choose life goals or mutate goal facts.

#### Scenario: Need pressure changes behavior inputs
- **WHEN** an NPC has high hunger, fatigue, money pressure, housing pressure, or
  safety pressure
- **THEN** the deterministic NPC policy SHOULD prefer actions and life goals that
  reduce that pressure
- **AND** the selected goal SHOULD be exposed as a projection, not authored by AI

### Requirement: Households are committed world facts

The system SHALL represent committed relationships, households, and children as
EventLog-backed facts. Children MAY start as household dependents and MUST NOT be
treated as full NPC actors until a future growth rule promotes them.

#### Scenario: Stable relationship forms a household
- **GIVEN** two eligible NPCs have sufficient relationship stability, housing,
  food, and safety
- **WHEN** deterministic policy submits a household command
- **THEN** the Rule Engine MAY accept a household event
- **AND** replaying the EventLog MUST rebuild the same household facts

#### Scenario: Child is a dependent
- **WHEN** a child-birth event is accepted
- **THEN** the child MUST appear as a household dependent
- **AND** the child MUST NOT appear in `/api/npcs` as a full actor in the first
  implementation slice

### Requirement: Construction projects unlock real world structure

The system SHALL accumulate construction project progress from committed events
and complete projects through authoritative expansion events. Completed building
or map projects MUST be visible through normal API projections.

#### Scenario: Building project completes
- **GIVEN** committed productive actions have advanced a building construction
  project to its target progress
- **WHEN** the completion command is accepted
- **THEN** a building unlock event MUST be appended
- **AND** `/api/buildings` and the relevant Area map MUST include the new building

#### Scenario: Map project completes
- **GIVEN** committed productive actions have advanced a map expansion project to
  its target progress
- **WHEN** the completion command is accepted
- **THEN** a map tile unlock event MUST be appended
- **AND** `/api/map` and Hub navigation MUST include the unlocked tile

### Requirement: AI remains non-authoritative for life simulation

AI SHALL only narrate committed life and expansion facts. AI MUST NOT create
needs, goals, households, children, buildings, map tiles, or construction
progress.

#### Scenario: AI narration failure does not block life simulation
- **WHEN** AI narration for a household or expansion event fails
- **THEN** the committed EventLog facts and projections MUST remain unchanged
- **AND** deterministic fallback narration MAY be used
