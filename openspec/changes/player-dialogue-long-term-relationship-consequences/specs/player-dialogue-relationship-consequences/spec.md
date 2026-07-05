## ADDED Requirements

### Requirement: Replayable player dialogue relationship arcs

The system SHALL maintain a deterministic projection of long-term player↔NPC relationship consequences from committed `PLAYER_NPC_DIALOGUE` events.

#### Scenario: Rebuild from dialogue events

- **GIVEN** two `PLAYER_NPC_DIALOGUE` events for the same `playerAccountId` and `npcId`
- **WHEN** the projection rebuilds from those events
- **THEN** it records the latest trust, accumulated resentment, accumulated familiarity, total interaction count, last intent, last player message, and last tick.

#### Scenario: Ignore malformed events

- **GIVEN** an unrelated event or a malformed `PLAYER_NPC_DIALOGUE` event missing required player/NPC/trust fields
- **WHEN** the projection applies the event
- **THEN** no relationship row is created.

### Requirement: Dialogue prompts include replayed relationship context

The system SHALL include the replayed player↔NPC relationship context in AI dialog prompts when available.

#### Scenario: Existing long-term relationship affects future reply context

- **GIVEN** an NPC has prior `PLAYER_NPC_DIALOGUE` events with a player
- **WHEN** that player speaks to the NPC again through direct interact or local shout
- **THEN** the AI dialog context includes a deterministic relationship summary derived from EventLog, and the prompt instructs the NPC to reflect low trust/high resentment or high trust naturally in tone.
