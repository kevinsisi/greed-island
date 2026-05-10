## ADDED Requirements

### Requirement: NPC presence is globally unique

The system SHALL expose each NPC as a single world actor with at most one visible
presence tuple at a time: tile, optional building, sub-position, activity, and
future intent. Interior and exterior scene data MUST derive from the same server
authority.

#### Scenario: NPC inside a building is not rendered outside
- **GIVEN** an NPC presence has `buildingId` set to a building on tile `t`
- **WHEN** the area scene for tile `t` requests its NPC list
- **THEN** that NPC MUST NOT appear in the outdoor area NPC list
- **AND** the building scene for that building MAY show that NPC inside

#### Scenario: Building occupants derive from NPC presence
- **GIVEN** `/api/npcs` reports NPC `n` with `buildingId = b`
- **WHEN** `/api/buildings/b` returns occupants
- **THEN** the occupant list MUST include `n`
- **AND** no independent occupant projection may contradict that presence

### Requirement: NPC movement is duty-weighted, not permanently role-locked

The system SHALL allow merchants, craftsmen, guards, priests, civic NPCs, and
other role-bearing NPCs to cross districts when deterministic needs, social
context, errands, danger, events, or memory-driven intent outweigh current duty.
Duty MAY bias movement strongly but MUST NOT be a permanent hard lock unless a
specific future story rule declares that actor immobile.

#### Scenario: Formerly locked NPC can leave home
- **GIVEN** a merchant, guard, craftsman, or priest has no hard story immobility
  rule
- **WHEN** the daily movement policy selects a non-duty exploration window
- **THEN** the NPC MAY move to another tile through validated movement events

### Requirement: NPC memories ground behavior and AI rendering

The system SHALL persist player-to-NPC and NPC-to-NPC interaction facts as
memory projection data that can ground future dialog, movement intent, and
chronicle rendering.

#### Scenario: Player interaction becomes NPC memory
- **WHEN** a player sends a meaningful message to an NPC
- **THEN** the interaction facts MUST be persisted in that NPC's memory
- **AND** later AI dialog or chronicle rendering MAY cite the memory only within
  the facts available to the prompt

#### Scenario: NPC interaction updates both participants
- **WHEN** two NPCs interact through a committed event
- **THEN** both NPCs SHOULD receive memory rows for that interaction
- **AND** relationship projection SHOULD update from the same committed event

### Requirement: AI chronicle rendering is grounded and non-authoritative

The system SHALL use AI to render natural chronicle text from committed event
snapshots and memory snippets. AI MUST NOT create Events, mutate WorldState,
directly move NPCs, or name NPCs/buildings/locations not present in its grounded
input.

#### Scenario: AI chronicle failure does not alter truth
- **WHEN** AI chronicle rendering times out or fails
- **THEN** the committed event and world projection MUST remain unchanged
- **AND** the response SHOULD expose degraded source metadata instead of silently
  pretending AI succeeded

#### Scenario: AI cannot invent named actors
- **GIVEN** the grounded chronicle input lists allowed NPC, building, and
  location names
- **WHEN** AI renders chronicle text
- **THEN** it MUST only use those explicit names or generic unnamed references
