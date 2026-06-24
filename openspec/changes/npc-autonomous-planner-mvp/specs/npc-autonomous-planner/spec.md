## ADDED Requirements

### Requirement: NPCs SHALL commit deterministic autonomous-planner decisions
The system SHALL periodically derive a short-horizon autonomous plan for eligible living NPCs using deterministic inputs only: current tick, profile, current NPC state, needs/area pressure, committed beliefs, life-goal boost, memory urgency boost, and existing intent stack. The selected plan MUST be submitted as an `NPC_AGENT_DECISION` command and accepted by the Rule Engine before it influences movement or activity.

#### Scenario: Planner decision is a committed event
- **WHEN** an eligible NPC reaches its planner cadence tick
- **THEN** the runtime MUST submit an `NPC_AGENT_DECISION` command through the Rule Engine
- **AND** the EventLog MUST contain a committed `NPC_AGENT_DECISION` event for that NPC
- **AND** the event payload MUST include `npcId`, `tile`, `chosenIntent`, `targetTile`, `urgency`, `reason`, and `decidedAtTick`

#### Scenario: Planner does not bypass Rule Engine
- **WHEN** the planner selects an intent target
- **THEN** no NPC movement, activity, or intent steering may become authoritative until the corresponding command is accepted by the Rule Engine

### Requirement: Planner decisions SHALL steer through existing NPC intent paths
Accepted autonomous-planner decisions SHALL reuse the existing `NPC_AGENT_DECISION` application path and `intentOverride` steering. Intent choices MUST resolve through normal `NPC_MOVE`, `NPC_ACTIVITY_CHANGE`, `NPC_PRODUCTIVE_ACTION`, and `NPC_INTENT_RESOLVED` behavior rather than directly mutating world facts.

#### Scenario: Intent choice steers movement
- **WHEN** an accepted planner decision chooses `economic`, `social`, `survival`, or `ecosystem` with a non-null `targetTile`
- **THEN** the NPC engine MUST receive an intent override for that target
- **AND** subsequent movement MUST be emitted as normal `NPC_MOVE` commands/events

#### Scenario: Follow schedule clears override
- **WHEN** an accepted planner decision chooses `follow_schedule`
- **THEN** the runtime MUST clear the NPC's current intent override
- **AND** the NPC MUST return to the normal schedule/personality movement path

### Requirement: Planner output SHALL remain deterministic and AI-independent
The autonomous planner MUST NOT call AI providers, use wall-clock time, use random values, or depend on asynchronous provider results. Identical profile/state/projection inputs at the same tick MUST produce the same selected plan.

#### Scenario: Same inputs produce same plan
- **WHEN** the planner is called twice with identical inputs
- **THEN** both outputs MUST be deeply equal

#### Scenario: AI unavailable does not disable planner
- **WHEN** no AI provider is configured or the freeform NPC agent is disabled
- **THEN** the deterministic planner MUST still produce eligible planner decisions on its cadence

### Requirement: Planner decisions SHALL be inspectable as NPC cognition
Planner decisions SHALL include human-readable Traditional Chinese narration/motivation that explains the concrete pressure, goal, or schedule reason behind the decision without leaking internal ids as public-facing prose.

#### Scenario: Decision explains why NPC changed direction
- **WHEN** a planner decision chooses a non-schedule intent
- **THEN** the committed event narration or motivation MUST explain the pressure or goal that caused the NPC to pursue the target tile
- **AND** the public-facing prose MUST use NPC names and location names where available instead of raw `household.*` ids

#### Scenario: Agent state records planner source
- **WHEN** an accepted planner decision changes the NPC's current intent
- **THEN** that NPC's deterministic agent metadata SHOULD expose planner-derived last decision information through existing NPC state projection
