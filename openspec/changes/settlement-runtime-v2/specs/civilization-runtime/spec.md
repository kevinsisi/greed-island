# Spec delta — civilization-runtime (Settlement Runtime v2)

## ADDED Requirements

### Requirement: Settlement state SHALL extend beyond formation metadata

The runtime SHALL maintain a replayable settlement-state projection for each formed settlement. Each row MUST include the existing formation fields (`id`, `tileId`, `formedAtTick`, `founderNpcIds`) plus population ids, settlement-held storage summary, bounded pressure scores, stability score, status, and `updatedAtTick`.

#### Scenario: Settlement state includes civilization fields

- **GIVEN** a settlement has formed and state events have been committed
- **WHEN** a caller reads the settlement projection
- **THEN** the row MUST include population ids, storage summary, pressure, stability, status, and updated tick
- **AND** the row MUST still include id, tile id, founding tick, and founder NPC ids

#### Scenario: Formation-only settlement has deterministic defaults

- **GIVEN** only a `SETTLEMENT_FORMED` event exists for a settlement
- **WHEN** the settlement projection rebuilds
- **THEN** the settlement MUST have empty population/storage summaries, zero pressure scores, stability `100`, status `stable`, and `updatedAtTick = formedAtTick`

### Requirement: Settlement updates SHALL flow through typed living-world events

Population, storage, pressure, stability, decline, and recovery changes SHALL be represented as typed living-world Commands accepted by the Rule Engine and committed as typed Events. No runtime path may mutate settlement projection rows directly.

#### Scenario: Pressure update command validates

- **WHEN** a valid `SETTLEMENT_PRESSURE_UPDATED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `SETTLEMENT_PRESSURE_UPDATED` event

#### Scenario: Invalid pressure is rejected

- **WHEN** a `SETTLEMENT_PRESSURE_UPDATED` command contains any pressure score below `0` or above `100`
- **THEN** the Rule Engine MUST reject the command and emit no event

### Requirement: Settlement population SHALL derive from authoritative NPC presence

Settlement population summaries SHALL be derived from server-authoritative NPC state and committed through typed settlement events. Frontend actors, AI narration, and decorative map elements MUST NOT create or modify settlement population.

#### Scenario: Outdoor present NPCs become population summary

- **GIVEN** formed settlement `S1` is on tile `t_X`
- **AND** NPCs `n1`, `n2`, and `n3` have authoritative presence at `t_X`
- **WHEN** the settlement engine plans population updates
- **THEN** it MAY emit `SETTLEMENT_POPULATION_UPDATED` for `S1` with sorted population ids `['n1', 'n2', 'n3']`

#### Scenario: Fake UI actors cannot affect population

- **GIVEN** the frontend renders any local-only marker or animation
- **WHEN** settlement population is projected
- **THEN** the marker or animation MUST have no effect on settlement population ids

### Requirement: Settlement storage summary SHALL derive from goods inventory

Settlement storage summaries SHALL be derived from committed goods events projected by `GoodsInventoryProjection` for `holderType = 'settlement'`. Storage summaries MUST NOT fabricate goods that are absent from the goods inventory projection.

#### Scenario: Settlement-held goods appear in storage summary

- **GIVEN** `GoodsInventoryProjection` reports 12 fish for `holderType='settlement'` and `holderId='settlement.t_central'`
- **WHEN** the settlement engine plans storage updates for that settlement
- **THEN** the resulting settlement storage summary MUST include fish quantity 12

#### Scenario: Missing goods are not fabricated

- **GIVEN** no goods inventory row exists for `refined_salt` at settlement `S1`
- **WHEN** the settlement storage summary is projected
- **THEN** `refined_salt` MUST be absent or have quantity 0

### Requirement: Settlement pressure SHALL be deterministic and bounded

The settlement engine SHALL compute pressure scores for `food`, `safety`, `economy`, and `logistics` using deterministic inputs from existing projections. Each score MUST be an integer in the range `0..100` and MUST be independent of wall-clock time, AI output, and frontend state.

#### Scenario: Food shortage raises food pressure

- **GIVEN** a settlement has population greater than zero and no settlement-held food goods
- **WHEN** the settlement engine computes pressure
- **THEN** food pressure MUST be greater than it would be with adequate food supply

#### Scenario: Transport loss raises logistics pressure

- **GIVEN** a settlement has a recent `GOODS_TRANSPORT_LOST` event on an expected supply route
- **WHEN** the settlement engine computes pressure
- **THEN** logistics pressure MUST increase within the bounded `0..100` range

### Requirement: Settlement stability SHALL change through one event per settlement per tick

The settlement engine SHALL derive stability from pressure and emit at most one `SETTLEMENT_STABILITY_CHANGED` event per settlement per world tick. Stability MUST be an integer in the range `0..100`.

#### Scenario: High pressure lowers stability once

- **GIVEN** settlement `S1` has high food and logistics pressure on tick `T`
- **WHEN** the settlement engine plans stability updates for tick `T`
- **THEN** it MUST emit at most one `SETTLEMENT_STABILITY_CHANGED` event for `S1`
- **AND** the resulting stability MUST remain between `0` and `100`

### Requirement: Settlement decline and recovery SHALL be explicit state transitions

When stability crosses configured thresholds, the runtime SHALL emit `SETTLEMENT_DECLINED` or `SETTLEMENT_RECOVERED` events. Decline and recovery MUST update settlement status but MUST NOT delete, split, conquer, or abandon a settlement in this change.

#### Scenario: Stability below decline threshold marks declining

- **GIVEN** settlement `S1` has stability below the configured decline threshold
- **WHEN** the settlement engine plans status updates
- **THEN** it MUST emit `SETTLEMENT_DECLINED`
- **AND** the settlement projection MUST report status `declining`

#### Scenario: Stability above recovery threshold marks recovering or stable

- **GIVEN** settlement `S1` was declining and its stability rises above the configured recovery threshold
- **WHEN** the settlement engine plans status updates
- **THEN** it MUST emit `SETTLEMENT_RECOVERED`
- **AND** the settlement projection MUST no longer report status `declining`

### Requirement: Settlement observability SHALL use authoritative read models only

GM/admin settlement observability SHALL render data from `WorldSnapshot.facts` or settlement HTTP read endpoints. The UI MUST NOT invent people, crowds, storage, pressure, or settlement status that is absent from server projections.

#### Scenario: GM views settlement state

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** settlement state rows exist
- **THEN** the page MUST display status, population count, storage summary, pressure scores, stability, and updated tick from server data

#### Scenario: Hub map remains non-authoritative for population

- **WHEN** the Hub map renders a settlement badge or status indicator
- **THEN** it MUST derive that indicator from server settlement state
- **AND** it MUST NOT render fake people or decorative crowds as settlement population
