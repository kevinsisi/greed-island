## ADDED Requirements

### Requirement: World advances while no user is connected
The simulation runtime SHALL continue to advance ticks, evaluate world rules, and execute NPC policies when no user is connected to the frontend. Connection presence MUST NOT be an input to the Rule Engine, NPC policies, or world rules.

#### Scenario: Empty session still advances world
- **WHEN** the runtime runs for a configured number of ticks with zero connected clients
- **THEN** the EventLog MUST grow from system and NPC activity, and the WorldState at the end MUST differ from the WorldState at the start

### Requirement: World keeps a per-actor history
The system SHALL preserve a per-actor history derived from the EventLog. Any rule, NPC policy, or projection MAY consult that history. The history MUST be a deterministic projection and MUST NOT be invented at runtime by AI.

#### Scenario: NPC reaction can reference prior actor events
- **WHEN** an actor has a committed history of past interactions with an NPC
- **THEN** the NPC's deterministic policy MUST be able to consult that history when generating its next command, and the same input MUST produce the same command on replay

### Requirement: Relationships decay deterministically
Social relationship state between actors and NPCs SHALL decay over simulation time when not maintained. The decay MUST be a deterministic function of tick-count delta, not wall-clock time, world config, and ruleset version.

#### Scenario: Decay is replayable
- **WHEN** the same EventLog and world config are replayed
- **THEN** the relationship state at any given tick MUST be identical across replays

#### Scenario: Decay creates a return reason
- **WHEN** an actor takes no action with an NPC across a configured threshold of ticks
- **THEN** the actor's relationship state with that NPC MUST move toward a less-favorable value as defined by the decay rule

### Requirement: Rare time-gated events occur on a deterministic schedule
The world SHALL support rare events whose availability is gated by simulation time. The schedule MUST be derivable from tick number plus world config so all observers see the same windows.

#### Scenario: Rare event windows are reproducible
- **WHEN** two servers running the same world config and ruleset advance to the same tick
- **THEN** they MUST identify the same set of currently-open rare-event windows

#### Scenario: Missing the window has cost
- **WHEN** a rare-event window opens and closes without an eligible interaction
- **THEN** the window MUST close without granting reward, and the next opening MUST be governed by the deterministic schedule, not by the missed attempt

### Requirement: Daily cadence is tick-counted, not wall-clock-counted
Daily quests, login rewards, and similar daily-cadence mechanics SHALL be expressed in tick-counted in-world days using an explicit tick-to-day mapping in world config. The cadence MUST NOT depend on the host's wall-clock day boundary.

#### Scenario: Daily reset is deterministic
- **WHEN** the runtime crosses an in-world day boundary as defined by world config
- **THEN** daily-cadence resets MUST occur at that tick on every replay, regardless of wall-clock host time at runtime

### Requirement: Outbound notification of significant events is a first-class concern
The platform SHALL treat outbound notification of significant events as a first-class concern with a dedicated capability slot, even if the production transport (web push, email, webhook) is delivered by a follow-up change. The simulation runtime MUST expose a deterministic stream of "notification-eligible" event summaries derived from committed events; transport delivery MUST be a downstream view consumer that cannot mutate the EventLog or WorldState.

#### Scenario: Notification stream is derived, not authoritative
- **WHEN** the notification stream is consumed
- **THEN** it MUST be a pure derivation of committed events, and consuming or failing to consume the stream MUST NOT alter WorldState or EventLog

#### Scenario: Significant-event detection is deterministic
- **WHEN** the same EventLog is processed twice
- **THEN** the set of events flagged as notification-eligible MUST be identical

### Requirement: Card discovery contributes to narrative progression
Each of the canonical 100 cards SHALL carry a story field (origin, lore context) in the catalog. When a card is discovered, the AI narration runtime MUST be able to render that story alongside the discovery moment, and the frontend MUST surface the story so progression feels narrative, not numeric.

#### Scenario: Discovery narration references catalog story
- **WHEN** a `CARD_DISCOVERED` event is committed
- **THEN** the narration worker input MUST include the card's catalog story field, and the frontend's discovery-detail view MUST display that story
