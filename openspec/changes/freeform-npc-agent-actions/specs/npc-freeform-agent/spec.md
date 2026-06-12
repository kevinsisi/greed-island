## ADDED Requirements

### Requirement: NPCs SHALL be allowed to propose freeform actions

The NPC agent prompt SHALL ask the AI for a structured JSON action proposal rather than a numbered choice only. The proposal MUST include at least `action`, `target`, `reason`, `risk`, `expectedOutcome`, and `utterance` fields. The prompt MUST tell the AI to act as the NPC, using persona, needs, beliefs, life goal, and recent context.

#### Scenario: Agent returns a creative social action

- **GIVEN** an NPC with a faction, needs, and relationship context
- **WHEN** the agent deliberates
- **THEN** the AI MAY propose a concrete action such as visiting, challenging, trading with, warning, or gossiping about another NPC
- **AND** the proposal is not automatically executed until server resolution accepts it

### Requirement: Freeform proposals SHALL be server-resolved into bounded action kinds

The server SHALL resolve freeform proposals into a bounded action taxonomy: `travel`, `work`, `rest`, `socialize`, `buy_card`, `challenge_combat`, `spread_rumor`, or `custom_social_scene`. Unknown action kinds, unknown tile targets, unknown/deceased NPC targets, and empty reasons MUST be rejected.

#### Scenario: Invalid invented action is rejected

- **GIVEN** an AI proposal with `action: "become_god"`
- **WHEN** the resolver evaluates it
- **THEN** the proposal MUST resolve as rejected
- **AND** no runtime state may change from that proposal

### Requirement: NPC_FREEFORM_ACTION_PROPOSED SHALL be a first-class command type

`NPC_FREEFORM_ACTION_PROPOSED` MUST be a `LivingWorldCommand` event carrying `{ npcId, tile, proposal, resolved, accepted, rejectionReason, decidedAtTick, narration }`. The validator MUST require a non-empty `npcId`, source `tile`, proposal object, resolved action object, boolean accepted flag, and non-empty rejection reason when `accepted=false`.

#### Scenario: Accepted proposal is committed as an event

- **GIVEN** a resolved proposal with `accepted=true` and action kind `socialize`
- **WHEN** the Rule Engine evaluates the command
- **THEN** it MUST append an `NPC_FREEFORM_ACTION_PROPOSED` event with the normalized action and narration

### Requirement: Accepted freeform actions SHALL use deterministic runtime consequences

On a committed accepted freeform proposal, runtime SHALL apply only deterministic consequences owned by the server. Travel-like actions set an NPC intent override toward a server-validated tile. Social/rumor/custom scene actions MAY publish narration. Rejected proposals MUST NOT set intent overrides or otherwise mutate runtime state.

#### Scenario: Travel proposal steers through intent override

- **GIVEN** an accepted proposal with resolved action `{ kind: "travel", targetTile: "t_dock" }`
- **WHEN** the event is published
- **THEN** the NPC's intent override MUST target `t_dock`
- **AND** the override reason MUST identify the freeform agent action

### Requirement: AI-provided world mutations SHALL NOT be trusted

The resolver and runtime MUST ignore AI-provided claims about granting cards, changing money, changing health, winning combat, moving instantly, or modifying relationships. Such claims may appear in raw proposal text but SHALL NOT be applied unless a separate server-authored command validates and emits those effects.

#### Scenario: Proposal claims a card reward

- **GIVEN** an AI proposal saying the NPC takes a rare card as part of the action
- **WHEN** the proposal is accepted as a social scene
- **THEN** no card ownership event MUST be emitted by the freeform agent path
