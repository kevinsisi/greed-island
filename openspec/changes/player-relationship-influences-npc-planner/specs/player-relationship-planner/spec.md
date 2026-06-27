## ADDED Requirements

### Requirement: Player relationship history influences NPC planning

The system SHALL feed replayed player↔NPC relationship consequences into deterministic NPC planning.

#### Scenario: Hostile player history creates social caution intent

- **GIVEN** an NPC has no faction-control, scarcity, danger, or ecosystem pressure beliefs
- **AND** the NPC has replayed player relationship bias with high resentment or low trust
- **WHEN** the intent planner computes entries for that NPC
- **THEN** it emits a `social` caution intent with a reason containing `player_relationship`.

#### Scenario: No hidden state is used

- **GIVEN** player relationship history exists only as committed `PLAYER_NPC_DIALOGUE` events
- **WHEN** the server rebuilds projections from EventLog
- **THEN** the same planner bias is available for runtime planning and NPC agent legal-option generation.
