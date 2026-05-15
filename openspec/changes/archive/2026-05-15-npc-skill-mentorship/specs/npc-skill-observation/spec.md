## ADDED Requirements

### Requirement: NPC_OBSERVED_SKILL command is registered and validated

The system SHALL register `NPC_OBSERVED_SKILL` as a valid command in `LivingWorldRuleEngine`. Its payload SHALL contain `{ npcId: string; skillId: string; sourceEventType: string; tick: number }`. The validator MUST reject if `skillId` is not in `SKILL_IDS`, `npcId` is empty, or `tick` is not a non-negative integer.

#### Scenario: valid payload is accepted

- **WHEN** `NPC_OBSERVED_SKILL` is submitted with payload `{ npcId: 'npc_a', skillId: 'hunting', sourceEventType: 'ANIMAL_HUNT_RESOLVED', tick: 100 }`
- **THEN** the rule engine accepts it and emits `NPC_OBSERVED_SKILL` event

#### Scenario: unknown skillId is rejected

- **WHEN** `NPC_OBSERVED_SKILL` is submitted with `skillId: 'magic'`
- **THEN** the rule engine rejects with a validation error

### Requirement: Observation seeder fires after accepted productive events

After `ANIMAL_HUNT_RESOLVED`, `FISHERY_HARVESTED`, or `BUILDING_CONSTRUCTED` events are accepted, the seeder SHALL query all NPCs present on the same `tileId` (excluding the actor NPC) and enqueue `NPC_OBSERVED_SKILL` commands for up to 3 co-present NPCs. The `skillId` SHALL be `'hunting'` for hunt events, `'fishing'` for fishery events, and `'construction'` for building events.

#### Scenario: co-present NPCs gain observation XP after a hunt

- **GIVEN** NPCs `npc_b` and `npc_c` are on tile `tile_1` where `npc_a` just completed `ANIMAL_HUNT_RESOLVED`
- **WHEN** the observation seeder processes the accepted event
- **THEN** `NPC_OBSERVED_SKILL` commands are enqueued for `npc_b` and `npc_c` with `skillId='hunting'`

#### Scenario: actor NPC is excluded from observation

- **WHEN** the seeder runs for `npc_a`'s own hunt event
- **THEN** no `NPC_OBSERVED_SKILL` is enqueued for `npc_a`

#### Scenario: cap at 3 observers

- **GIVEN** 5 NPCs are co-present on the tile of a productive event
- **WHEN** the seeder runs
- **THEN** at most 3 `NPC_OBSERVED_SKILL` commands are enqueued
