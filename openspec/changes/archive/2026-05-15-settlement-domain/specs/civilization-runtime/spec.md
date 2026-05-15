# Spec — civilization-runtime capability (Settlement Domain)

First slice of the Layer 3 Civilization Runtime capability. Introduces the Settlement domain object, emergent formation policy, projection contract, and HTTP read surface. Population / decline / takeover / goods / logistics are deferred to follow-up slices.

## ADDED Requirements

### Requirement: A Settlement SHALL be a real domain entity, not a tile label

The runtime MUST persist Settlement as a distinct entity with identity, location, founding tick, and founding members. A Settlement is **orthogonal** to the underlying tile and to the existing `lifeExpansion.unlockedTileIds` terrain-unlock mechanism — the tile may exist without a settlement, and a settlement may form on an existing tile.

#### Scenario: Settlement carries identity and founding metadata

- **GIVEN** the runtime has recorded a `SETTLEMENT_FORMED` event
- **WHEN** a caller queries `/api/settlements/:id`
- **THEN** the response MUST include `id`, `tileId`, `formedAtTick`, and `founderNpcIds`

#### Scenario: Settlement is independent of tile unlock

- **GIVEN** tile `t_X` exists in the map graph and is `unlocked`
- **AND** no `SETTLEMENT_FORMED` event has been committed for `t_X`
- **WHEN** a caller queries `/api/settlements`
- **THEN** the response MUST NOT include a settlement at `t_X`

### Requirement: Settlement formation SHALL flow through Command → Rule Engine → Event

A Settlement MUST come into existence only via a `SETTLEMENT_FORMED` Command accepted by the Rule Engine and committed as a typed Event. No runtime path may insert a Settlement directly into the projection.

#### Scenario: Command carries deterministic payload

- **WHEN** the runtime submits a `SETTLEMENT_FORMED` Command
- **THEN** the payload MUST include `settlementId`, `tileId`, `formedAtTick`, and a non-empty `founderNpcIds` array (length ≥ `SETTLEMENT_FORMATION_MIN_NPCS`)
- **AND** `founderNpcIds` MUST be sorted lexicographically so identical inputs yield identical events

#### Scenario: Settlement id is deterministic

- **GIVEN** identical `tileId`, `formedAtTick`, and `founderNpcIds`
- **WHEN** the runtime derives the settlement id
- **THEN** the resulting id MUST be reproducible across replays

### Requirement: Settlement formation SHALL emerge from sustained NPC co-presence

The runtime MUST emit `SETTLEMENT_FORMED` when a tile has had at least `SETTLEMENT_FORMATION_MIN_NPCS` outdoor (non-building, non-moving) NPCs continuously present for at least `SETTLEMENT_FORMATION_MIN_TICKS` consecutive ticks, and no settlement currently exists for that tile.

#### Scenario: Threshold not met → no formation

- **GIVEN** tile `t_X` has 2 outdoor NPCs co-located for 30 consecutive ticks
- **WHEN** the runtime evaluates formation detection on tick N
- **THEN** no `SETTLEMENT_FORMED` event MUST be emitted for `t_X`

#### Scenario: Threshold met exactly → formation

- **GIVEN** tile `t_X` has 3 outdoor NPCs co-located for `SETTLEMENT_FORMATION_MIN_TICKS` consecutive ticks
- **AND** no settlement currently exists at `t_X`
- **WHEN** the runtime evaluates formation detection
- **THEN** exactly one `SETTLEMENT_FORMED` event MUST be emitted with `tileId = 't_X'`
- **AND** `founderNpcIds` MUST be the lexicographically-sorted list of those 3 NPC ids

#### Scenario: Already-formed tile is not re-formed

- **GIVEN** tile `t_X` already has a settlement
- **AND** new NPCs cluster at `t_X` meeting the threshold
- **WHEN** the runtime evaluates formation detection
- **THEN** no additional `SETTLEMENT_FORMED` event MUST be emitted for `t_X`

### Requirement: Settlements projection SHALL be replayable from EventLog

The `settlements` projection MUST expose `rebuildFromEvents(events)` that drops all rows and recomputes from `SETTLEMENT_FORMED` events. The result of `rebuildFromEvents` MUST be byte-for-byte identical across replays of the same EventLog.

#### Scenario: Rebuild produces identical canonical hash

- **GIVEN** two projection instances `A` and `B`
- **WHEN** both invoke `rebuildFromEvents(eventLog)` with the same input
- **THEN** the canonical JSON hash of `A.getAll()` MUST equal that of `B.getAll()`

### Requirement: Settlement formation SHALL be visible via HTTP read surface

The server MUST expose `GET /api/settlements` returning the full settlement list and `GET /api/settlements/:id` returning a single settlement. These are read-only projections — no POST/PUT/DELETE that would mutate settlement state.

#### Scenario: Empty world has no settlements

- **GIVEN** a freshly-booted runtime with no `SETTLEMENT_FORMED` events in the EventLog
- **WHEN** a caller invokes `GET /api/settlements`
- **THEN** the response MUST be `{ settlements: [] }`

#### Scenario: After formation the settlement is visible

- **GIVEN** a `SETTLEMENT_FORMED` event was committed for tile `t_X` with id `S1` and founder ids `['n1', 'n2', 'n3']`
- **WHEN** a caller invokes `GET /api/settlements`
- **THEN** the response MUST include a settlement entry with `id = 'S1'`, `tileId = 't_X'`, and `founderNpcIds = ['n1', 'n2', 'n3']`
