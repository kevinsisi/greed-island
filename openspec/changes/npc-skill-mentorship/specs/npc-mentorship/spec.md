## ADDED Requirements

### Requirement: NPC_MENTORSHIP_STARTED command is registered and validated

The system SHALL register `NPC_MENTORSHIP_STARTED` as a valid command in `LivingWorldRuleEngine`. Its payload SHALL contain `{ mentorNpcId: string; menteeNpcId: string; skillId: string; tick: number }`. The validator MUST reject if `mentorNpcId === menteeNpcId`, `skillId` is not in `SKILL_IDS`, or either NPC ID is empty.

#### Scenario: valid mentorship is accepted

- **WHEN** `NPC_MENTORSHIP_STARTED` is submitted with distinct mentor and mentee IDs and a valid skillId
- **THEN** the rule engine accepts it and emits `NPC_MENTORSHIP_STARTED` event
- **AND** the `SkillXpProjection` row for the mentee has `mentorId` set to the mentor's ID

#### Scenario: self-mentorship is rejected

- **WHEN** `NPC_MENTORSHIP_STARTED` has `mentorNpcId === menteeNpcId`
- **THEN** the rule engine rejects with a validation error

### Requirement: Mentorship engine emits XP increments and NPC_MENTORSHIP_COMPLETED

Each tick, the mentorship engine SHALL find all active mentorships (projection rows where `mentorId !== null`) and emit `NPC_OBSERVED_SKILL` for the mentee with `SKILL_XP_PER_MENTOR_TICK` XP gain. When the mentee's accumulated XP reaches or exceeds `SKILL_XP_LEVEL_THRESHOLD`, the engine SHALL emit `NPC_MENTORSHIP_COMPLETED`.

#### Scenario: mentee accumulates XP each tick

- **GIVEN** an active mentorship for mentee `npc_b` in skill `fishing`
- **WHEN** the mentorship engine runs for 1 tick
- **THEN** the mentee's `fishing` XP increases by `SKILL_XP_PER_MENTOR_TICK`

#### Scenario: mentorship completes when XP threshold is reached

- **GIVEN** an active mentorship and the mentee's XP is one increment below `SKILL_XP_LEVEL_THRESHOLD`
- **WHEN** the engine processes the next tick
- **THEN** `NPC_MENTORSHIP_COMPLETED` event is emitted with `{ mentorNpcId, menteeNpcId, skillId, finalLevel }`
- **AND** the mentee's `level` increments by 1
- **AND** `mentorId` is cleared (set to `null`) in the projection row

### Requirement: NPC_MENTORSHIP_COMPLETED constants are in world config

`SKILL_XP_PER_OBSERVE`, `SKILL_XP_PER_MENTOR_TICK`, and `SKILL_XP_LEVEL_THRESHOLD` SHALL be exported from `config/world.ts` as named constants. No magic numbers in seeder, engine, or projection logic.

#### Scenario: constants are used in XP calculation

- **WHEN** `NPC_OBSERVED_SKILL` event is projected
- **THEN** the XP delta applied is exactly `SKILL_XP_PER_OBSERVE` (not a hardcoded literal)
