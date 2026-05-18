## ADDED Requirements

### Requirement: marsh_yak SHALL be registered as a domesticable livestock species
`SPECIES_CATALOG` SHALL include a `marsh_yak` entry with `category: 'livestock'`, biome affinity `salt_marsh`, and domestication-relevant fields: edible yield, byproducts (milk, hide), and a defined `carryingCapacity`.

#### Scenario: marsh_yak appears in SPECIES_CATALOG
- **WHEN** `listSpeciesByCategory('livestock')` is called
- **THEN** it MUST return at least one entry with `id: 'marsh_yak'`

#### Scenario: marsh_yak has required byproducts
- **WHEN** the `marsh_yak` species definition is accessed
- **THEN** `byproducts` MUST include `'milk'` and `'hide'`

---

### Requirement: Domestication SHALL follow Command -> Rule Engine -> Event -> Projection
All livestock state changes (domestication, breeding, slaughter, mount assignment) MUST be represented as events in the EventLog. No livestock state SHALL be mutated outside the projection rebuild path.

#### Scenario: ANIMAL_DOMESTICATED event updates livestock registry
- **WHEN** an `ANIMAL_DOMESTICATED` event is appended to the EventLog
- **THEN** `LivestockRegistryProjection` for the target settlement MUST include that animal with role `'livestock'`

#### Scenario: LIVESTOCK_BRED event creates new animal
- **WHEN** a `LIVESTOCK_BRED` event is appended
- **THEN** `AnimalPopulationProjection` MUST show one additional animal of that species at the settlement tile with `ownerSettlementId` set

#### Scenario: LIVESTOCK_SLAUGHTERED event removes animal
- **WHEN** a `LIVESTOCK_SLAUGHTERED` event is appended
- **THEN** `LivestockRegistryProjection` MUST no longer contain that animal id

#### Scenario: MOUNT_ASSIGNED event links animal to NPC
- **WHEN** a `MOUNT_ASSIGNED` event is appended
- **THEN** `LivestockRegistryProjection` MUST show that animal with role `'mount'` and `mountedBy` equal to the assigned NPC id

---

### Requirement: LivestockRegistryProjection SHALL track per-settlement owned animals
`LivestockRegistryProjection` MUST maintain a map from settlement id to a list of owned animals, each with `animalId`, `speciesId`, `role` (`'livestock' | 'mount'`), `mountedBy` (NPC id or null), and `acquiredAtTick`.

#### Scenario: Registry is empty when no domestication has occurred
- **WHEN** no `ANIMAL_DOMESTICATED` event has been recorded for a settlement
- **THEN** `LivestockRegistryProjection.getBySettlement(settlementId)` MUST return an empty array

#### Scenario: Registry rebuilds correctly from EventLog
- **WHEN** the projection is rebuilt from scratch using the EventLog
- **THEN** the registry MUST equal the registry computed from an incremental run

---

### Requirement: DomesticationPlanner SHALL emit intents only when conditions are met
`planDomestication` MUST return a `DomesticationIntent` only when: (a) wild population of the livestock species on the settlement tile ≥ `DOMESTICATION_MIN_WILD_POP`, (b) current livestock count for that settlement < `ranchCapacity`, and (c) the settlement has a completed ranch building.

#### Scenario: Intent emitted when conditions satisfied
- **WHEN** `planDomestication` is called with wildCount ≥ threshold, livestock < capacity, and ranch present
- **THEN** it MUST return a `DomesticationIntent` for that species and settlement

#### Scenario: No intent when wild population too low
- **WHEN** `planDomestication` is called with wildCount < `DOMESTICATION_MIN_WILD_POP`
- **THEN** it MUST return null

#### Scenario: No intent when ranch at capacity
- **WHEN** `planDomestication` is called with livestock count ≥ `ranchCapacity`
- **THEN** it MUST return null

#### Scenario: No intent when no ranch building exists
- **WHEN** `planDomestication` is called without a completed ranch at the settlement
- **THEN** it MUST return null

---

### Requirement: BreedingPlanner SHALL emit breed intent at cadence
`planBreeding` MUST return a `BreedingIntent` when the settlement holds ≥ 2 animals of the same livestock species with `role: 'livestock'` and livestock count + 1 ≤ `ranchCapacity`. It MUST run only on `BREEDING_CADENCE_TICKS` intervals.

#### Scenario: Breed intent emitted at cadence with two adults
- **WHEN** `planBreeding` is called at a cadence tick with ≥ 2 same-species livestock
- **THEN** it MUST return exactly one `BreedingIntent`

#### Scenario: No breed intent when only one animal present
- **WHEN** `planBreeding` is called with only 1 animal of a given species
- **THEN** it MUST return null

#### Scenario: No breed intent when ranch at capacity
- **WHEN** `planBreeding` is called with livestock count = `ranchCapacity`
- **THEN** it MUST return null

---

### Requirement: SlaughterPlanner SHALL emit slaughter intent when overflow
`planSlaughter` MUST return a `SlaughterIntent` (identifying the oldest livestock animal) when livestock count > `ranchCapacity`. Slaughter MUST also trigger `GOODS_EXTRACTED` for the species' byproducts.

#### Scenario: Slaughter oldest when over capacity
- **WHEN** `planSlaughter` is called with livestock count > ranchCapacity
- **THEN** it MUST return a `SlaughterIntent` targeting the animal with the lowest `acquiredAtTick`

#### Scenario: No slaughter when within capacity
- **WHEN** `planSlaughter` is called with livestock count ≤ ranchCapacity
- **THEN** it MUST return null

---

### Requirement: MountPlanner SHALL assign mounts to unmounted NPC carriers
`planMountAssignment` MUST return `MountAssignmentIntent` entries pairing available mounts (livestock with `mountedBy === null` and species `mountEligible: true`) with NPC carriers that have no current mount, limited to one assignment per NPC.

#### Scenario: Mount assigned to unmounted carrier
- **WHEN** `planMountAssignment` is called with one mount-eligible animal and one unmounted carrier NPC at the same settlement
- **THEN** it MUST return one `MountAssignmentIntent` linking them

#### Scenario: No assignment when no eligible animals
- **WHEN** no unassigned mount-eligible livestock exist
- **THEN** `planMountAssignment` MUST return an empty array

---

### Requirement: Mounted NPCs SHALL travel faster than unmounted NPCs
The runtime MUST apply a `mountSpeedMultiplier` to NPC travel tick calculations when the NPC has a `mountedAnimalId`. The multiplier MUST be ≥ 1.2 (at least 20% faster).

#### Scenario: Mounted carrier covers ground faster
- **WHEN** two identical NPC carriers travel the same route, one mounted and one unmounted
- **THEN** the mounted carrier MUST arrive in fewer ticks

---

### Requirement: Ranch building type SHALL gate domestication capacity
A Ranch building MUST be defined in the construction catalog with a `livestockCapacity` property (default 8). A settlement without a completed Ranch MUST have `ranchCapacity = 0`.

#### Scenario: Ranch construction increases capacity
- **WHEN** a `BUILDING_COMPLETED` event for a Ranch is recorded
- **THEN** the settlement's effective `ranchCapacity` MUST increase by the ranch's `livestockCapacity`

#### Scenario: No ranch means no domestication
- **WHEN** `planDomestication` is called for a settlement with no completed Ranch
- **THEN** it MUST return null

---

### Requirement: Domestication planners SHALL be replayable
All planner outputs, when submitted as commands and processed through the Rule Engine, MUST produce identical projection state across replays given identical EventLog inputs.

#### Scenario: Replay produces same livestock registry
- **WHEN** `LivestockRegistryProjection` is rebuilt from the EventLog from scratch
- **THEN** the result MUST be identical to the incrementally-built projection
