## ADDED Requirements

### Requirement: Life goals SHALL be projected per NPC

The server MUST provide a `LifeGoalsProjection` that consumes `NPC_LIFE_GOAL_SET` events (payload.data pattern) and exposes `latestFor(npcId)` returning the newest goal row (`kind`, `pressure`, `narration`, `needs`, `setAtTick`). The projection MUST ignore malformed payloads, MUST NOT regress to an older sequence, and MUST be rebuilt in the small-log full-rebuild boot branch. On large-log availability-first boots the projection is intentionally NOT deep-hydrated (v0.87.13 OOM policy: only liveness-critical batches replay); dialog grounding MUST degrade gracefully via the live-derive fallback in that mode.

#### Scenario: Latest goal wins

- **GIVEN** an NPC with NPC_LIFE_GOAL_SET events at sequence 5 (kind `earn_money`) and sequence 9 (kind `rest`)
- **WHEN** `latestFor(npcId)` is called
- **THEN** it MUST return the `rest` goal

#### Scenario: Small-log boot replay restores goals

- **GIVEN** a restart from a small EventLog containing NPC_LIFE_GOAL_SET events
- **WHEN** the full-rebuild boot branch completes
- **THEN** `latestFor` MUST return the same rows as before the restart

#### Scenario: Large-log boot degrades to live-derive fallback

- **GIVEN** a large-log availability-first boot where the projection was not hydrated
- **WHEN** `getFormattedLifeGoalContext(npcId)` is called
- **THEN** it MUST return the live-derived current goal instead of an empty context

### Requirement: Life goals SHALL ground AI dialog

`AiDialogContext` MUST accept an optional `lifeGoalContext` string, built by `runtime.getFormattedLifeGoalContext(npcId)`: the committed goal from `LifeGoalsProjection` when present, otherwise a live `deriveNpcLifeView` derivation. The system prompt MUST include a life-goal block with anti-hallucination rules (the NPC may speak about this goal, may not invent other life plans).

#### Scenario: NPC can speak about its committed goal

- **GIVEN** an NPC whose latest life goal narration is 「增加收入，讓生活不被物價追著跑。」
- **WHEN** the dialog system prompt is built
- **THEN** the prompt MUST contain that narration and the usage-rules block

#### Scenario: Empty context adds no block

- **GIVEN** an NPC with no committed goal and no derivable life view
- **WHEN** the system prompt is built
- **THEN** no life-goal block is added

### Requirement: Life goals SHALL bias intent urgency

`computeIntentStack` MUST accept an optional `lifeGoalBoost: Partial<Record<IntentKind, number>>` applied additively to the matching intent kind's multiplier. The runtime MUST derive the boost from the NPC's latest committed goal: goal kind maps to an intent kind (eat/rest/seek_safety/secure_home→survival, earn_money/build_city/learn_skill→economic, form_family→social) and the magnitude scales with goal pressure, capped at a named constant.

#### Scenario: Boost raises only the matching kind

- **GIVEN** beliefs producing both survival and economic intents with equal base urgency
- **WHEN** `lifeGoalBoost = { economic: 0.25 }` is passed
- **THEN** the economic urgency MUST increase by the boosted multiplier while survival stays unchanged
