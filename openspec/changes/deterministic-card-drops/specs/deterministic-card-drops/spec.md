## ADDED Requirements

### Requirement: Card drop rolls are deterministic
The system SHALL derive card-drop spawn chance, rank selection, entry selection, and map coordinates from deterministic seed material. The seed material MUST include the current tick, tile id, roll purpose, ruleset version, weather, rare-window state, and engine phase.

#### Scenario: Identical inputs produce identical drops
- **WHEN** two independent card-drop engines run the same tick with the same catalog, tile ids, ruleset version, weather, rare-window state, and existing card world state
- **THEN** both engines MUST emit equivalent `CARD_DROP_SPAWN` facts with the same card ids, tile ids, coordinates, and reasons, excluding non-authoritative audit metadata and store-local row ids

#### Scenario: Different roll purposes do not collide
- **WHEN** the engine needs separate values for spawn chance, rank selection, entry selection, x coordinate, and y coordinate
- **THEN** each value MUST be derived using a distinct roll purpose in the seed material

### Requirement: Initial seed drops are deterministic
The system SHALL use the same deterministic roll mechanism for boot-time seed drops as for normal tick drops.

#### Scenario: Restart with same inputs produces same seed drops
- **WHEN** two fresh stores call `seedInitialDrops` with the same current tick, catalog, tile ids, ruleset version, weather, and rare-window state
- **THEN** both stores MUST contain the same seeded card drops and matching `CARD_DROP_SPAWN` event payloads except for non-authoritative audit metadata

### Requirement: Client does not author card drops
The system SHALL keep card-drop generation server-authoritative. Clients MUST only render card drops returned by server projections and MUST NOT predict, create, or mutate card-drop facts locally.

#### Scenario: Renderer cannot create a drop
- **WHEN** a client route mounts, unmounts, refreshes, or changes scene
- **THEN** no card drop MUST appear unless it exists in the server-provided card-drop projection or is returned by a server card API

### Requirement: Transitional card action log scope is explicit
The system SHALL document that deterministic card drops still write through `CardActionPipeline` and the transitional `card_action_log` until a later change migrates card events into canonical `event_log`.

#### Scenario: Deterministic RNG fix does not imply full EventLog compliance
- **WHEN** the deterministic card-drop change is completed
- **THEN** architecture documentation MUST mark `Math.random()` in `CardDropEngine` as addressed while keeping the `card_action_log` migration listed as an open non-conformance
