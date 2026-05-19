# npc-mortality Specification

## Purpose
Defines age-based NPC death: each NPC has a deterministic lifespan; when `currentTick - effectiveBornAtTick >= lifespanTicks(npcId)` the NPC dies and a `NPC_DECEASED` event enters the canonical EventLog.

## ADDED Requirements

### Requirement: Each NPC SHALL have a deterministic lifespan derived from their id
`lifespanTicks(npcId) = NPC_BASE_LIFESPAN_TICKS + hashInt(npcId) % NPC_LIFESPAN_VARIANCE_TICKS`. The computation MUST be pure and replay-safe. Constants: `NPC_BASE_LIFESPAN_TICKS = 120_960`, `NPC_LIFESPAN_VARIANCE_TICKS = 60_480`.

#### Scenario: Same NPC always gets same lifespan
- **WHEN** `lifespanTicks('npc_guard_1')` is called twice
- **THEN** both calls MUST return the identical value

### Requirement: The mortality planner SHALL emit NPC_DECEASED when a living NPC exceeds their lifespan
The planner runs every `MORTALITY_CADENCE_TICKS` ticks. For each NPC not in `NpcMortalityProjection.deceasedIds`, if `currentTick - effectiveBornAtTick >= lifespanTicks(npcId)`, it MUST emit `NPC_DECEASED`.

#### Scenario: NPC dies when age exceeds lifespan
- **WHEN** `currentTick - effectiveBornAtTick >= lifespanTicks(npcId)` for a living NPC
- **THEN** `NPC_DECEASED` MUST be emitted with `npcId`, `tileId`, `deceasedAtTick`

#### Scenario: Planner skips already-deceased NPCs
- **WHEN** `NpcMortalityProjection` already contains an NPC's id
- **THEN** the planner MUST NOT emit a second `NPC_DECEASED` for that NPC

### Requirement: NpcMortalityProjection SHALL track living and deceased NPCs
`NpcMortalityProjection` projects `NPC_DECEASED` events into `Map<npcId, deceasedAtTick>`. It MUST implement `isDeceased(npcId): boolean`, `deceasedAtTick(npcId): number | null`, `list(): readonly NpcMortalityRow[]`, and `rebuildFromEvents(events)`.

#### Scenario: Deceased NPC appears in projection after event
- **WHEN** `NPC_DECEASED` event for npcId `'npc_fisher_1'` is projected
- **THEN** `projection.isDeceased('npc_fisher_1')` MUST return `true`

#### Scenario: Boot hydration restores mortality state
- **GIVEN** an EventLog containing `NPC_DECEASED` events
- **WHEN** `NpcMortalityProjection.rebuildFromEvents(events)` is called
- **THEN** `isDeceased` MUST return `true` for all previously-deceased NPCs

### Requirement: NPC_DECEASED SHALL be wired into runtime boot hydration and per-event fan-out
`NPC_DECEASED` MUST be added to `MORTALITY_BOOT_EVENT_TYPES` for selective large-log hydration. The per-event fan-out loop MUST call `mortalityProjection.project(ev)` for each `NPC_DECEASED` event.

#### Scenario: Boot hydration restores deceased NPCs from EventLog
- **GIVEN** the EventLog contains an `NPC_DECEASED` event
- **WHEN** runtime boot hydration reads `MORTALITY_BOOT_EVENT_TYPES`
- **THEN** `mortalityProjection.isDeceased(npcId)` MUST return `true`

### Requirement: The NPC state snapshot SHALL mark deceased NPCs
When building `getSnapshot().npcs`, any NPC whose id appears in `NpcMortalityProjection.deceasedIds` MUST have `deceased: true` in their snapshot entry. The frontend SHALL filter deceased NPCs from interactive lists (hire, dialog) but they remain visible in chronicle.

#### Scenario: Deceased NPC flagged in snapshot
- **WHEN** `NPC_DECEASED` has been committed for npcId `'npc_merchant_1'`
- **THEN** `getSnapshot().npcs.find(n => n.id === 'npc_merchant_1').deceased` MUST be `true`
