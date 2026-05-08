## MODIFIED Requirements

### Requirement: Kernel supports deterministic replay validation
The system SHALL include replay validation proving that identical EventLog input produces identical WorldState and identical AI snapshot input. Deterministic world-adjacent engines that feed server-authoritative commands, including card-drop generation, MUST also have replay validation proving identical committed facts for identical tick, ruleset, world fact, and store inputs.

#### Scenario: Replay validates projection identity
- **WHEN** a replay test reduces the same EventLog fixture multiple times
- **THEN** each reduction MUST produce the same WorldState hash or equivalent canonical representation

#### Scenario: Replay validates AI input identity
- **WHEN** a replay test creates AI snapshots from the same EventLog fixture multiple times
- **THEN** each AI snapshot input MUST be identical

#### Scenario: Replay validates deterministic card-drop facts
- **WHEN** a replay test runs card-drop generation twice from identical tick, ruleset, weather, rare-window, catalog, tile, and card-store inputs
- **THEN** each run MUST produce equivalent card-drop facts, excluding non-authoritative audit metadata such as wall-clock timestamps and store-local row ids
