## ADDED Requirements

### Requirement: Relationship pressure produces concrete world actions

The system SHALL convert replayed player↔NPC relationship pressure into accepted deterministic world-law actions when the pressure clears the planner threshold.

#### Scenario: Caution becomes a warning action

- **GIVEN** an NPC has an intent entry whose reason contains `player_relationship_caution`
- **AND** the entry urgency is above the world-law threshold
- **WHEN** the world-law action planner runs
- **THEN** it proposes an accepted `spread_rumor` action that warns nearby people to keep distance.

#### Scenario: Affinity becomes a social approach action

- **GIVEN** an NPC has an intent entry whose reason contains `player_relationship_affinity`
- **AND** the entry urgency is above the world-law threshold
- **WHEN** the world-law action planner runs
- **THEN** it proposes an accepted `custom_social_scene` action for approaching or checking in with the trusted player.

#### Scenario: Reciprocity becomes a trade-work action

- **GIVEN** an NPC has an intent entry whose reason contains `player_relationship_reciprocity`
- **AND** the entry urgency is above the world-law threshold
- **WHEN** the world-law action planner runs
- **THEN** it proposes an accepted `work` action that preserves a concrete useful opportunity for the familiar trade partner.

#### Scenario: Actions remain replayable

- **GIVEN** relationship pressure is derived from replayed `PLAYER_NPC_DIALOGUE` events
- **WHEN** the relationship action is selected
- **THEN** it still flows through the existing `NPC_FREEFORM_ACTION_PROPOSED` command/event path, not through hidden runtime state.
