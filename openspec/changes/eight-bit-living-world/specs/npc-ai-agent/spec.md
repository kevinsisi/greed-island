## ADDED Requirements

### Requirement: NPC_AGENT_DECISION SHALL be a first-class command type

`NPC_AGENT_DECISION` MUST be a `LivingWorldCommand` with payload `{ npcId, tile, chosenIntent: 'follow_schedule'|IntentKind, targetTile: string|null, urgency: 0..100, reason, utterance: string|null, decidedAtTick, narration: string|null }`. The validator MUST reject unknown intents, intent choices without a targetTile, out-of-range urgency, and empty reasons.

#### Scenario: Validator accepts a survival choice and a follow_schedule choice

- **GIVEN** a payload choosing `survival` with `targetTile: 't_dock'` and one choosing `follow_schedule` with `targetTile: null`
- **WHEN** the rule engine evaluates both
- **THEN** both MUST be accepted

#### Scenario: Validator rejects an invented intent

- **GIVEN** a payload with `chosenIntent: 'conquer_world'`
- **WHEN** the rule engine evaluates it
- **THEN** it MUST be rejected

### Requirement: AI MAY only choose among server-computed legal options

The agent layer MUST build its option list from the deterministic intent stack (`computeIntentStack` entries, with all learning/memory/life-goal boosts applied) plus a `follow_schedule` option. The submitted command's `urgency` and `targetTile` MUST come from the chosen server option, never from AI output. The AI contributes only the choice index, a first-person reason, and an optional utterance (length-capped). On any AI failure (unavailable, timeout, parse failure) the round MUST be silently skipped, leaving the deterministic planner in control.

#### Scenario: AI numbers are not trusted

- **GIVEN** an AI reply attempting to inject `urgency: 999`
- **WHEN** the decision is submitted
- **THEN** the command MUST carry the server-computed urgency of the chosen option

#### Scenario: No real choice means no AI call

- **GIVEN** an NPC whose intent stack is empty (only follow_schedule available)
- **WHEN** the NPC's agent cadence slot arrives
- **THEN** no AI request is made

### Requirement: Agent decisions SHALL steer NPCs through the existing override path

On a committed `NPC_AGENT_DECISION` event, the runtime MUST apply the choice via `NpcEngine` intent overrides: intent choices set an override with the server urgency and `INTENT_OVERRIDE_DURATION_TICKS` expiry; `follow_schedule` clears any existing override. Utterances MUST surface as the event narration（「X 喃喃自語：…」）so the public ticker carries the NPC's voice.

#### Scenario: Decision moves the NPC

- **GIVEN** a committed decision choosing `survival` toward `t_dock` with urgency 62
- **WHEN** the event is published
- **THEN** the NPC's intentOverride MUST target `t_dock` until expiry

### Requirement: Agent cadence SHALL be staggered and non-blocking

Each living NPC MUST get at most one deliberation per `NPC_AGENT_DECISION_INTERVAL_TICKS`, phase-staggered by npcId hash, executed off the tick path with an in-flight guard, and globally disabled when no AI provider is configured or `npc_agent_enabled` is set to `'false'`.

#### Scenario: Disabled without providers

- **GIVEN** no Gemini keys and no OpenCode servers configured
- **WHEN** ticks advance
- **THEN** no agent deliberation runs and the simulation behaves exactly as before this change
