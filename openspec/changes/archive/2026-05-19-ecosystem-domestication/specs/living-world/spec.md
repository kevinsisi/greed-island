## ADDED Requirements

### Requirement: ANIMAL_DOMESTICATED command SHALL be accepted with valid payload
The Rule Engine MUST accept `ANIMAL_DOMESTICATED` commands. The payload MUST include `animalId` (string), `settlementId` (string), `speciesId` (string), and `tick` (number). The Rule Engine MUST reject the command if `animalId` does not exist in the animal population or `ownerSettlementId` is already set.

#### Scenario: Valid domestication command accepted
- **WHEN** an `ANIMAL_DOMESTICATED` command is submitted with a valid wild animal id and a settlement with ranch capacity
- **THEN** the Rule Engine MUST emit an `ANIMAL_DOMESTICATED` event appended to the EventLog

#### Scenario: Domestication rejected for already-owned animal
- **WHEN** an `ANIMAL_DOMESTICATED` command references an animal with `ownerSettlementId` already set
- **THEN** the Rule Engine MUST reject the command without emitting any event

---

### Requirement: LIVESTOCK_BRED command SHALL be accepted with valid payload
The Rule Engine MUST accept `LIVESTOCK_BRED` commands. The payload MUST include `settlementId` (string), `speciesId` (string), `newAnimalId` (string), and `tick` (number).

#### Scenario: Valid breed command creates new animal
- **WHEN** a `LIVESTOCK_BRED` command is submitted for a settlement with ≥ 2 same-species livestock and capacity available
- **THEN** the Rule Engine MUST emit a `LIVESTOCK_BRED` event, and `AnimalPopulationProjection` MUST include the new animal with `ownerSettlementId` set

---

### Requirement: LIVESTOCK_SLAUGHTERED command SHALL be accepted with valid payload
The Rule Engine MUST accept `LIVESTOCK_SLAUGHTERED` commands. The payload MUST include `animalId` (string), `settlementId` (string), `speciesId` (string), `goods` (array of `{ goodsId: string, amount: number }`), and `tick` (number).

#### Scenario: Valid slaughter command removes animal and emits goods
- **WHEN** a `LIVESTOCK_SLAUGHTERED` command is submitted
- **THEN** the Rule Engine MUST emit `LIVESTOCK_SLAUGHTERED` and `GOODS_EXTRACTED` events
- **AND** the animal MUST be removed from `LivestockRegistryProjection`

---

### Requirement: MOUNT_ASSIGNED command SHALL be accepted with valid payload
The Rule Engine MUST accept `MOUNT_ASSIGNED` commands. The payload MUST include `animalId` (string), `npcId` (string), `settlementId` (string), and `tick` (number). The Rule Engine MUST reject if the animal is already mounted or not owned by the settlement.

#### Scenario: Valid mount assignment accepted
- **WHEN** a `MOUNT_ASSIGNED` command is submitted for an unassigned mount-eligible animal
- **THEN** the Rule Engine MUST emit a `MOUNT_ASSIGNED` event
- **AND** `LivestockRegistryProjection` MUST show `role: 'mount'` and `mountedBy` set for that animal

#### Scenario: Mount assignment rejected for already-mounted animal
- **WHEN** a `MOUNT_ASSIGNED` command references an animal already in `role: 'mount'`
- **THEN** the Rule Engine MUST reject the command
