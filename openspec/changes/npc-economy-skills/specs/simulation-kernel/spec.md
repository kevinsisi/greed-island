## ADDED Requirements

### Requirement: NPC productive actions persist personal civic state

Accepted `NPC_PRODUCTIVE_ACTION` events SHALL update a deterministic NPC civic projection containing personal gold and skill XP.

#### Scenario: Work changes personal state
- **WHEN** an accepted `NPC_PRODUCTIVE_ACTION` with domain `trade`, `service`, `build`, or `learn` is reduced
- **THEN** the target NPC's civic record SHALL be updated in replayable state derived from the EventLog

#### Scenario: Learning accumulates skill XP
- **WHEN** an accepted `NPC_PRODUCTIVE_ACTION` has domain `learn`
- **THEN** the target NPC's `knowledge` XP SHALL increase even if personal gold does not

#### Scenario: Projection is replayable
- **WHEN** the same productive EventLog is reduced twice
- **THEN** the NPC civic records SHALL be identical
