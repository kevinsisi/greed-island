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

### Requirement: NPC skills affect future productive output

NPC skill XP SHALL deterministically increase future productive action delta for the matching domain without reading external state or randomness.

#### Scenario: Matching skill increases delta
- **WHEN** an NPC has accumulated XP for the skill mapped to a productive domain
- **THEN** future productive actions in that domain SHALL use a skill-adjusted delta

#### Scenario: Non-matching skill does not increase delta
- **WHEN** an NPC has commerce XP but performs a learn action
- **THEN** the commerce XP SHALL NOT increase the learn action delta
