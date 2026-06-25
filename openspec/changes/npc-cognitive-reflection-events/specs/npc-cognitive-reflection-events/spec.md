## ADDED Requirements

### Requirement: NPC reflection commits must be EventLog facts

The system SHALL represent accepted long-term NPC reflection as a Rule Engine accepted `NPC_REFLECTION_COMMITTED` event so cognitive evolution can be rebuilt from EventLog instead of existing only as runtime snapshot data.

#### Scenario: Reflection commit is accepted as an event

- **GIVEN** a reflection commit with an NPC id, commit tick, source proposal tick, source, memory evidence, bounded personality deltas, optional life goal, bounded relationship deltas, summaries, and narration
- **WHEN** the living-world Rule Engine evaluates the command
- **THEN** it accepts the command
- **AND** emits a deterministic `NPC_REFLECTION_COMMITTED` event

### Requirement: Reflection commits must require memory evidence and bounded deltas

The system SHALL reject reflection commits that lack memory evidence, use unknown personality keys, exceed personality or relationship delta bounds, use unknown life-goal kinds, omit summaries, or provide invalid narration.

#### Scenario: Evidence-free reflection commit is rejected

- **GIVEN** an `NPC_REFLECTION_COMMITTED` command without memory evidence fragments
- **WHEN** the living-world Rule Engine evaluates the command
- **THEN** it rejects the command
- **AND** no reflection event is emitted

### Requirement: NPC cognitive projection must rebuild from EventLog

The system SHALL provide a deterministic per-NPC cognitive projection that rebuilds reflection count, accumulated personality deltas, current life-goal override, latest reflection summaries, evidence fragments, and relationship reflection trace from committed reflection events.

#### Scenario: Replaying reflection events restores NPC cognitive state

- **GIVEN** an EventLog containing one or more `NPC_REFLECTION_COMMITTED` events for an NPC
- **WHEN** the NPC cognitive projection rebuilds from those events
- **THEN** the resulting state contains the same reflection count, accumulated deltas, latest life goal, latest summary, and relationship reflection trace
