# Spec — ecosystem-runtime capability (Simple Hunting)

## ADDED Requirements

### Requirement: Simple hunting SHALL flow through typed ecosystem events

The runtime MUST represent a successful simple hunt as typed living-world events:
`ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`,
`CARCASS_CREATED`, and `MEAT_HARVESTED`. These events MUST be produced by
Commands accepted by the Rule Engine, not by direct projection mutation.

#### Scenario: Successful hunt emits the event chain

- **GIVEN** a hunter-role NPC has a valid prey animal on the same tile
- **WHEN** the runtime plans a simple hunt
- **THEN** the accepted event chain MUST identify the hunt id, NPC id, target
  animal id, species id, tile id, carcass id, harvested quantity, and tick

### Requirement: Hunting SHALL require hunter role, food pressure, and prey

The simple hunting planner MUST only emit a hunt when the NPC role is a hunter,
the NPC's food need is elevated, and `animal_population` has at least one edible
same-tile animal id available.

#### Scenario: Non-hunter does not hunt

- **GIVEN** a non-hunter NPC has high food pressure and prey exists on the tile
- **WHEN** hunting is planned
- **THEN** no hunting commands MUST be emitted

#### Scenario: No prey does not hunt

- **GIVEN** a hunter NPC has high food pressure
- **AND** no same-tile edible animal population exists
- **WHEN** hunting is planned
- **THEN** no hunting commands MUST be emitted

### Requirement: Animal population SHALL decrease when an animal is killed

The `animal_population` projection MUST reduce the population row count when an
`ANIMAL_KILLED` event references an existing animal id in that row. Replaying the
same EventLog MUST produce the same canonical hash.

#### Scenario: Spawn then kill leaves zero population

- **GIVEN** an `ANIMAL_SPAWNED` event for `animal-a`
- **AND** a later `ANIMAL_KILLED` event for `animal-a`
- **WHEN** `animal_population` rebuilds from EventLog
- **THEN** the row for that species and tile MUST have count `0`
- **AND** duplicate kill events MUST NOT reduce count below `0`

### Requirement: Meat harvest SHALL credit NPC civic economy

Accepted `MEAT_HARVESTED` events MUST update the NPC civic record with a
deterministic gold gain. This is a placeholder bridge toward Phase 2 goods
inventory, not a full goods/storage implementation.

#### Scenario: Meat harvest adds civic gold

- **GIVEN** an accepted `MEAT_HARVESTED` command with `goldValue = 4`
- **WHEN** the runtime reduces accepted commands for the tick
- **THEN** the hunter's `lifeExpansion.npcCivicRecords[npcId].gold` MUST increase by `4`
