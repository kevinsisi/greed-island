## ADDED Requirements

### Requirement: NPC dialog prompt includes the NPC's active rumors

When generating AI dialog for an NPC, the prompt builder SHALL include a rumors context block containing the NPC's active rumors from `RumorProjection`. The block MUST list up to 3 rumors ordered by descending accuracy. If the NPC has no active rumors, the block MUST be omitted or empty — it MUST NOT fabricate rumor content.

#### Scenario: Active rumors appear in dialog context

- **WHEN** NPC `shen_ruo_yun` holds a rumor with `topic = 'predator_death'`, `subjectId = 'fog_wolf'`, `tileId = 't_forest'`, `accuracy = 90`
- **AND** the player POSTs a message to `/api/npc/shen_ruo_yun/interact`
- **THEN** the AI prompt MUST include a context line such as "Heard: a fog_wolf died at t_forest (accuracy 90%)"
- **AND** the generated reply MAY reference the wolf death

#### Scenario: No rumors — block omitted

- **WHEN** NPC `shen_ruo_yun` holds no active rumors
- **AND** the player sends a message
- **THEN** the AI prompt MUST NOT include any fabricated rumor content
- **AND** `replySource` is unaffected (still `'ai'` or `'fallback'` per key pool state)

#### Scenario: At most 3 rumors passed to prompt

- **WHEN** an NPC holds 5 active rumors
- **THEN** the prompt context block MUST include only the top 3 by accuracy
