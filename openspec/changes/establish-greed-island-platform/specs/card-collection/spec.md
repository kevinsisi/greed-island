## ADDED Requirements

### Requirement: Canonical card catalog is deterministic data
The card catalog SHALL contain the canonical 100 specified cards as deterministic, versioned data faithful to the source IP. Each catalog entry MUST include a stable card id, rank, Traditional-Chinese name, English name, description, discovery rule reference, and restriction rule reference. AI MUST NOT author or mutate catalog entries at runtime.

The catalog SHALL ship as a JSON file at `packages/server/src/cards/catalog.json` with a corresponding TypeScript schema. The repository SHALL ship the full 100-entry structure with id and rank slots populated; canonical name and description fields MAY be populated as data by the project owner without code changes.

#### Scenario: Catalog is replayable across servers
- **WHEN** two servers load the same catalog version
- **THEN** both servers MUST resolve the same set of cards with identical fields

### Requirement: Card discovery and ownership are events
Card discovery and card ownership transfers SHALL be represented as Events in the EventLog. The Rule Engine MUST be the only component that compiles a card-related Command into a `CARD_DISCOVERED` or `CARD_TRANSFERRED` Event.

#### Scenario: Card discovery is not a side channel
- **WHEN** a player or NPC discovers a card
- **THEN** an event of type `CARD_DISCOVERED` MUST be appended to the EventLog with the card id, the discoverer actor id, and the discovery context

### Requirement: Card progress is a pure projection
Per-actor card ownership and overall collection progress SHALL be derived from the EventLog by a pure projection. The projection MUST NOT depend on AI narration, network state, or non-deterministic input.

#### Scenario: Projection rebuild is identical
- **WHEN** the card-progress projection is rebuilt from the EventLog twice
- **THEN** both rebuilds MUST produce identical per-actor card ownership

### Requirement: Card-related rules respect kernel determinism
Card discovery and transfer rules MUST be deterministic, MUST NOT consult external IO, MUST NOT read same-tick partial state, and MUST be evaluated through the same Rule Engine as all other commands.

#### Scenario: Card rule replay is identical
- **WHEN** identical EventLog, world config, ruleset version, and pending command set are evaluated
- **THEN** card discovery and transfer outcomes MUST be identical
