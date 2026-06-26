## ADDED Requirements

### Requirement: Runtime SHALL prefer world-law freeform NPC actions over generic intent events

When an autonomous NPC tick has meaningful pressure above the configured threshold, runtime SHALL build a concrete `NPC_FREEFORM_ACTION_PROPOSED` command from world constraints, NPC identity, needs, life goal, memory context, cognitive profile, and legal tile scores. `NPC_AGENT_DECISION` SHALL remain available only when no world-law freeform action is warranted.

#### Scenario: Economic pressure becomes role-grounded work

- **GIVEN** an NPC with high money pressure, an economy-favorable adjacent tile, a role, and a life goal
- **WHEN** the world-law planner evaluates the NPC
- **THEN** it SHALL produce an accepted freeform proposal with action kind `work`
- **AND** the proposal reason SHALL include grounded pressure or life-goal context
- **AND** the resolved summary SHALL avoid generic labels such as only `生計與資源`

#### Scenario: No pressure stays quiet

- **GIVEN** an NPC whose needs, life goal, memory, and cognitive signals are below the autonomous threshold
- **WHEN** the planner evaluates the NPC
- **THEN** it SHALL emit no freeform action
- **AND** runtime MAY use the existing fallback planner path

### Requirement: NPC personality and cognition SHALL affect concrete action choice

The world-law planner SHALL vary concrete action choice based on cognitive dominant trait and pressure source. Equal pressure SHOULD not force all NPCs into the same tile/action template.

#### Scenario: Cautious and economic NPCs diverge

- **GIVEN** two NPC evaluations with similar money and safety pressure
- **AND** one has an economic-dominant cognitive profile
- **AND** another has a survival-dominant cognitive profile
- **WHEN** both are evaluated
- **THEN** the economic NPC MAY choose role-specific work at an economy-favorable tile
- **AND** the survival NPC MAY choose travel toward a safer tile

### Requirement: Generated tile names SHALL be preserved in world-law freeform events

World-law summaries, narration, and motivation SHALL use the localized generated tile name when one exists, and SHALL NOT leak the raw generated tile id in player-visible text.

#### Scenario: Existing intent points to a generated tile

- **GIVEN** a generated tile `t_frontier_badlands` named `荒土地帶`
- **AND** an NPC is continuing an existing intent override toward that tile
- **WHEN** runtime commits the world-law freeform event
- **THEN** the resolved summary, narration, and motivation SHALL contain `荒土地帶`
- **AND** they SHALL NOT contain `t_frontier_badlands`
