## ADDED Requirements

### Requirement: World civilization goals SHALL be durable EventLog facts

The simulation SHALL represent world-level goals as typed living-world events instead of roadmap-only prose or mutable runtime state.

#### Scenario: Declaring a world goal

- **GIVEN** the runtime identifies repeated evidence for a civilization need
- **WHEN** the planner proposes a world goal
- **THEN** the Rule Engine SHALL accept a valid `WORLD_GOAL_DECLARED` command
- **AND** the event payload SHALL include `goalId`, `domain`, `title`, `rationale`, `targetProgress`, `declaredAtTick`, and `narration`.

### Requirement: World technologies SHALL require committed evidence

The simulation SHALL only discover technology from prior committed world evidence.

#### Scenario: Discovering technology from learning and construction

- **GIVEN** at least three related evidence events such as skill observation, mentorship completion, or construction progress
- **WHEN** the deterministic world-civilization planner runs
- **THEN** it SHALL emit a `WORLD_TECH_DISCOVERED` command for the relevant domain
- **AND** the command SHALL include non-empty `evidenceEventIds`.

#### Scenario: Rejecting evidence-free technology

- **GIVEN** a `WORLD_TECH_DISCOVERED` command has no evidence event IDs
- **WHEN** it is evaluated by the Rule Engine
- **THEN** the command SHALL be rejected.

### Requirement: Runtime SHALL project world goals and technologies from EventLog

The runtime SHALL maintain a read projection of active/completed world goals and discovered technologies.

#### Scenario: Rebuilding civilization state

- **GIVEN** an EventLog containing `WORLD_GOAL_DECLARED`, `WORLD_GOAL_PROGRESS_RECORDED`, and `WORLD_TECH_DISCOVERED`
- **WHEN** the world-civilization projection rebuilds
- **THEN** it SHALL reconstruct goal progress and the discovered technology list solely from those events.
