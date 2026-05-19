## ADDED Requirements

### Requirement: Wild population counts SHALL exclude domesticated animals
Spawning planners and predation planners MUST filter animal rows by `ownerSettlementId === null` before computing effective wild population for any decision (spawn budget, extinction threshold, predation target selection).

#### Scenario: Domesticated animals not counted in wild population
- **WHEN** a spawn planner evaluates the wild count for a tile
- **AND** some animals on that tile have `ownerSettlementId` set
- **THEN** those animals MUST NOT be included in the wild population count used for spawn decisions

#### Scenario: Extinction warning not triggered by domesticated-only survivors
- **WHEN** a species has zero wild animals (`ownerSettlementId === null`) on all tiles
- **AND** domesticated individuals of that species exist at settlements
- **THEN** the extinction planner MUST evaluate the species as extinct in the wild (zero wild count), not as recovered

#### Scenario: Predators do not target domesticated animals in wild predation
- **WHEN** the predation planner selects prey for a predator
- **THEN** animals with `ownerSettlementId !== null` MUST NOT be considered valid prey targets in the wild predation pass
