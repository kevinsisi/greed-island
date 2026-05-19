# npc-lineage Specification

## Purpose
Defines household membership and heir selection: on `NPC_DECEASED`, the system identifies the eldest surviving household member as heir and emits `HOUSEHOLD_INHERITANCE_ASSIGNED` + `NPC_HEIR_ASSIGNED`.

## ADDED Requirements

### Requirement: Each NPC SHALL belong to exactly one household
`householdId` is an optional field on `NpcProfile`. If absent, the NPC's own `id` MUST be used as their `householdId` (solo household). `NpcLineageProjection` MUST build household membership sets from profile data at boot.

#### Scenario: Solo NPC has their own household id
- **WHEN** an `NpcProfile` has no `householdId` field
- **THEN** `NpcLineageProjection.householdId(npcId)` MUST return `npcId`

### Requirement: On NPC_DECEASED, HOUSEHOLD_INHERITANCE_ASSIGNED SHALL be emitted
The heir selection planner MUST run immediately after the mortality planner emits `NPC_DECEASED`. It MUST find all living NPCs with the same `householdId`, sorted by `effectiveBornAtTick` ascending (oldest first). The first living member is the heir. If no living member exists, `heirId` is empty string. `HOUSEHOLD_INHERITANCE_ASSIGNED` MUST be emitted with `householdId`, `deceasedNpcId`, `heirId`, `amount: 0` (economic inheritance TBD in future goods integration).

#### Scenario: Oldest surviving household member becomes heir
- **GIVEN** household `'h_fisher'` has NPCs A (born tick 0) and B (born tick 1000), both living
- **WHEN** NPC A dies
- **THEN** `HOUSEHOLD_INHERITANCE_ASSIGNED` MUST be emitted with `heirId = B.id`

#### Scenario: No heir when household is empty
- **GIVEN** a solo-household NPC dies
- **WHEN** `NPC_DECEASED` is processed
- **THEN** `HOUSEHOLD_INHERITANCE_ASSIGNED` MUST be emitted with `heirId = ''`

### Requirement: NPC_HEIR_ASSIGNED SHALL be emitted to record the succession
After `HOUSEHOLD_INHERITANCE_ASSIGNED`, a `NPC_HEIR_ASSIGNED` event MUST be emitted with `householdId`, `deceasedNpcId`, `heirNpcId`, `assignedAtTick`. If `heirId` is empty, `NPC_HEIR_ASSIGNED` is NOT emitted.

#### Scenario: Heir assignment recorded in EventLog
- **WHEN** a non-solo household NPC dies with a surviving member
- **THEN** `NPC_HEIR_ASSIGNED` MUST appear in the EventLog with the correct `heirNpcId`

### Requirement: NpcLineageProjection SHALL expose household and heir history
`NpcLineageProjection` MUST implement `householdId(npcId): string`, `membersOf(householdId): readonly string[]`, `heirHistory(householdId): readonly NpcHeirRecord[]`. It projects both `NPC_HOUSEHOLD_FORMED` (if present) and `NPC_HEIR_ASSIGNED` events.

#### Scenario: Heir history tracks succession chain
- **GIVEN** NPC A then NPC B both die in household `'h_trader'`
- **WHEN** `NpcLineageProjection.heirHistory('h_trader')` is called
- **THEN** the result MUST contain two records showing the succession chain
