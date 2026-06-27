## ADDED Requirements

### Requirement: NPC freeform actions include mundane life diversity

NPC freeform actions SHALL support validated action kinds for shopping/procurement, learning, and invention so non-combat living-world behavior does not collapse into generic work/build narration.

#### Scenario: food pressure creates procurement

- **GIVEN** an NPC whose strongest need or life goal is food/eating
- **WHEN** the deterministic world-law planner crosses its action threshold
- **THEN** it SHALL propose an accepted `buy_goods` action
- **AND** the player-facing narration SHALL mention shopping/procurement rather than public-space construction.

#### Scenario: learning goals create study

- **GIVEN** an NPC whose life goal is `learn_skill`
- **WHEN** the learning pressure drives the action choice
- **THEN** it SHALL propose an accepted `learn` action with study/apprenticeship narration.

#### Scenario: patient knowledge-heavy NPCs create ideas

- **GIVEN** an NPC with a learning goal and high patience or knowledge/invention role pressure
- **WHEN** the deterministic world-law planner crosses its action threshold
- **THEN** it SHALL propose an accepted `invent` action with experiment/prototype narration.
