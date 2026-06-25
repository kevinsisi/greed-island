## ADDED Requirements

### Requirement: Reflection proposals must be validated before commit

The system SHALL treat AI or deterministic reflection output as a proposal until a validator accepts it. The validator MUST reject proposals without memory evidence, with out-of-bounds personality deltas, unknown life-goal kinds, unknown relationship targets, or excessive relationship deltas.

#### Scenario: Ungrounded AI proposal is rejected

- **GIVEN** an NPC reflection proposal without evidence and with out-of-range deltas
- **WHEN** the validator runs
- **THEN** the proposal is rejected
- **AND** no committed personality update is produced

### Requirement: Committed cognitive updates are bounded and explainable

The system SHALL convert accepted proposals into committed cognitive update data containing bounded personality deltas, optional self-authored life goal, bounded relationship updates, and human-readable evidence-backed summaries.

#### Scenario: Safety reflection becomes bounded personality growth

- **GIVEN** an NPC with fear memory and survival-dominant cognitive profile
- **WHEN** a valid reflection proposal is committed
- **THEN** the committed update may increase safety/patience within the allowed range
- **AND** may keep or form a safety-oriented life goal
- **AND** may strengthen an existing relationship dimension within the allowed range

### Requirement: NPC UI exposes fine-grained cognitive evolution summary

The system SHALL expose an additive `cognitiveEvolution` summary on NPC snapshots so the frontend can show recent reflection, personality trace, life-goal trace, and relationship trace without inventing those details client-side.

#### Scenario: Area NPC list shows evolution trace

- **WHEN** an NPC snapshot includes `cognitiveEvolution`
- **THEN** the Area NPC list may show the personality/reflection trace under the cognitive line
- **AND** legacy clients that ignore the field remain compatible
