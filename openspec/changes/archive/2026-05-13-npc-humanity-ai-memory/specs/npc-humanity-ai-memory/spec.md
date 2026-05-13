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

#### Scenario: NPC in transit is not duplicated in a local scene
- **GIVEN** an NPC presence has `activity = move` and a `travelRoute`
- **WHEN** Hub, Area, and Building projections render from `/api/npcs`
- **THEN** Hub MAY show that NPC on the route segment
- **AND** Area scenes MUST NOT show that NPC as a local outdoor occupant
- **AND** Building scenes MUST NOT show that NPC unless `buildingId` names that building

### Requirement: NPC travel exposes a worldline segment

The system SHALL expose an NPC's current cross-district movement as a server-
authoritative `travelRoute` containing the segment origin, segment destination,
final target tile, and start tick. Renderers MUST use this route for travel
visualization instead of inventing independent NPC copies per scene.

#### Scenario: Moving NPC has a route segment
- **GIVEN** an NPC moves from tile `a` toward target tile `c`
- **WHEN** the next validated step is tile `b`
- **THEN** `/api/npcs` MUST expose `activity = move`
- **AND** `travelRoute.fromTile = a`
- **AND** `travelRoute.toTile = b`
- **AND** `travelRoute.targetTile = c`

#### Scenario: Arrived NPC resumes local presence
- **GIVEN** an NPC has reached its target tile
- **WHEN** the NPC resumes idle, work, trade, eat, sleep, or patrol activity
- **THEN** `travelRoute` MUST be null
- **AND** the relevant Area or Building projection MAY show that NPC from the
  same presence tuple

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

### Requirement: NPCs expose deterministic agent state

The system SHALL model each NPC as a deterministic runtime agent with identity,
bounded permissions, active task state, and last-decision metadata derived from
profile data and committed simulation state. This agent state MUST remain a
projection over deterministic inputs; AI MUST NOT directly choose the active task
or mutate the agent state.

#### Scenario: NPC state includes agent metadata
- **GIVEN** an NPC profile is loaded by the runtime
- **WHEN** `/api/npcs` or runtime snapshots expose that NPC
- **THEN** the NPC internal state SHOULD include an `agent` object with profile
  id, permission labels, active task, and last decision metadata
- **AND** the active task MUST be derived from schedule, deterministic nudge,
  movement, or committed interaction state

#### Scenario: Social interaction becomes an active task
- **WHEN** two NPCs produce a committed interaction candidate during a tick
- **THEN** each participant's agent state SHOULD mark a bounded social task
- **AND** the task MUST expire deterministically without relying on wall-clock time

#### Scenario: Player dialog holds NPC presence
- **GIVEN** a logged-in player opens a dialog with an NPC
- **WHEN** the client submits the authenticated dialog-hold command
- **THEN** the NPC agent state SHOULD mark a bounded `player-dialog` task
- **AND** NPC movement/schedule changes MUST NOT move that NPC until the hold
  expires or is refreshed
- **AND** the hold MUST be persisted through the deterministic world state path,
  not only through a frontend dialog overlay

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

#### Scenario: AI chronicle rendering uses bounded JSON retries
- **WHEN** AI chronicle rendering is requested
- **THEN** the AI call MUST request JSON structured output explicitly
- **AND** each chronicle render attempt MUST have a timeout
- **AND** transient failures SHOULD retry with backoff before deterministic fallback
- **AND** the response SHOULD expose attempt metadata for success and fallback cases

#### Scenario: AI cannot invent named actors
- **GIVEN** the grounded chronicle input lists allowed NPC, building, and
  location names
- **WHEN** AI renders chronicle text
- **THEN** it MUST only use those explicit names or generic unnamed references
