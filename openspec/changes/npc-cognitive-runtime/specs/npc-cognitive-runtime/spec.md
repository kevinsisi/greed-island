## ADDED Requirements

### Requirement: NPC cognitive profile is deterministic

The system SHALL derive each NPC's cognitive profile from committed projections, NPC profile personality, current tick, ruleset/world config, memories, beliefs, needs, and life goal. It MUST NOT depend on wall-clock time, random values, network timing, or unvalidated AI output.

#### Scenario: Same inputs produce same cognitive profile

- **WHEN** two runtimes derive a cognitive profile for the same NPC with identical inputs
- **THEN** the cognitive profile and planner decision MUST be byte-identical

### Requirement: Personality changes decisions under equal pressure

The system SHALL let persistent personality traits influence bounded planner scoring. Two NPCs with the same tile, needs, beliefs, and life goal MAY choose different intents when their personality weights differ.

#### Scenario: Greedy NPC prioritizes economy

- **WHEN** a high-greed/economy NPC and a high-safety NPC face equal economic and safety pressure
- **THEN** the greedy NPC SHOULD choose an economic plan while the safety-weighted NPC SHOULD choose survival

### Requirement: Memory and belief affect NPC thought without bypassing rules

The system SHALL incorporate existing memory and belief projections into cognitive thought and urgency, but cognitive output SHALL only affect the world through typed Commands accepted by the Rule Engine.

#### Scenario: Dangerous memory raises survival urgency

- **WHEN** an NPC has recent important fear/danger memory or belief
- **THEN** the cognitive runtime MAY raise survival urgency and explain the thought in the committed decision reason
- **AND** no WorldState mutation occurs unless the resulting command is accepted

### Requirement: Current thought is public projection data

The system SHALL expose an additive  for NPCs so players can see why an NPC is acting. This line SHALL be derived from committed profile/projection data and the latest server-authoritative agent decision, not invented by frontend rendering.

#### Scenario: Existing clients remain compatible

- **WHEN** a caller reads 
- **THEN** all existing NPC fields remain available
- **AND**  is optional/additive
