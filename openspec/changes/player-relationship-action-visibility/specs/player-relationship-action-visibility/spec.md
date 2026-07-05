## ADDED Requirements

### Requirement: Relationship actions are visible in area NPC state

The system SHALL surface recent player↔NPC relationship-driven world actions as player-facing NPC behavior badges.

#### Scenario: Caution action appears as a caution badge

- **GIVEN** a nearby NPC has a recent `NPC_FREEFORM_ACTION_PROPOSED` event whose proposal indicates player relationship caution
- **WHEN** the area NPC behavior projection builds the NPC badge
- **THEN** the badge SHALL show the NPC is cautious of the player.

#### Scenario: Affinity action appears as a social badge

- **GIVEN** a nearby NPC has a recent `NPC_FREEFORM_ACTION_PROPOSED` event whose proposal indicates player relationship affinity
- **WHEN** the area NPC behavior projection builds the NPC badge
- **THEN** the badge SHALL show the NPC wants to talk with or approach the player.

#### Scenario: Reciprocity action appears as a trade badge

- **GIVEN** a nearby NPC has a recent `NPC_FREEFORM_ACTION_PROPOSED` event whose proposal indicates player relationship reciprocity
- **WHEN** the area NPC behavior projection builds the NPC badge
- **THEN** the badge SHALL show the NPC is preserving a trade or work opportunity.

#### Scenario: Visibility comes from replayed events

- **GIVEN** the relationship action is present in event history
- **WHEN** the client rebuilds area state from recent events
- **THEN** the badge SHALL be derived from those events, not from hidden local state.
