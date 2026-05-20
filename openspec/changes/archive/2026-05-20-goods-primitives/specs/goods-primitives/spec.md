## ADDED Requirements

### Requirement: Settlement food consumption cadence SHALL deplete settlement storage each hour
The runtime SHALL emit `GOODS_CONSUMED` from settlement storage once per `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS` (= `TICKS_PER_HOUR`). The consumed quantity SHALL be `min(heldFoodUnits, population × SETTLEMENT_FOOD_UNITS_PER_NPC)`. If settlement has no population or no food-type goods in storage, no command is emitted. This ensures food pressure increases naturally when ecosystem collapse stops food supply.

#### Scenario: Settlement with food and population consumes food each cadence tick
- **WHEN** a settlement has 10 food units in storage and a population of 2 NPCs
- **AND** `currentTick % SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS === 0`
- **THEN** `GOODS_CONSUMED { quantity: 4, holderType: "settlement", ... }` MUST be emitted
- **AND** after the event is committed, settlement held food MUST be 6

#### Scenario: Partial consumption when storage is below required amount
- **WHEN** a settlement has 2 food units in storage but population requires 10 units
- **AND** `currentTick % SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS === 0`
- **THEN** `GOODS_CONSUMED { quantity: 2 }` MUST be emitted (consumes what is available)
- **AND** settlement held food MUST be 0 after the event

#### Scenario: No consumption emitted when settlement has no population
- **WHEN** a settlement has food in storage but `populationNpcIds` is empty
- **AND** cadence tick fires
- **THEN** no `GOODS_CONSUMED` command MUST be emitted for that settlement

#### Scenario: No consumption emitted outside cadence ticks
- **WHEN** `currentTick % SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS !== 0`
- **THEN** no `GOODS_CONSUMED` command MUST be emitted by the settlement consumption block

### Requirement: Ecosystem collapse SHALL cascade into SETTLEMENT_DECLINED via food shortage
When the local ecosystem (fishery + animal population) collapses such that no food is produced for a settlement, the settlement SHALL eventually emit `SETTLEMENT_DECLINED` through the existing food pressure → stability → status chain.

#### Scenario: Fishery collapse + no hunters leads to SETTLEMENT_DECLINED
- **GIVEN** a settlement with population 2 and 20 food units in storage
- **AND** fishery density = 0 (collapsed) and no hunting events since last cadence
- **WHEN** enough cadence ticks pass to deplete storage
- **THEN** `SETTLEMENT_DECLINED` MUST be emitted after food pressure exceeds the stability threshold

#### Scenario: Steady food supply prevents SETTLEMENT_DECLINED
- **GIVEN** a settlement receiving 1 `GOODS_TRANSPORT_ARRIVED:fish` per cadence from active fishery
- **WHEN** cadence ticks pass
- **THEN** `SETTLEMENT_DECLINED` MUST NOT be emitted while food supply keeps pace with consumption
