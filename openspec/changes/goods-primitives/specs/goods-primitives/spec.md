# goods-primitives Specification

## Purpose

Defines the goods substrate: a typed catalog of tradeable entities, five core Commands/Events that model the lifecycle of goods (`GOODS_EXTRACTED → GOODS_STORED → GOODS_PROCESSED → GOODS_CONSUMED / GOODS_DESTROYED`), and a `GoodsInventoryProjection` that tracks per-owner quantities. This is Phase 2 slice 1 — the foundation that later logistics, production chain, and market slices will build on.

## Requirements

### Requirement: Goods species catalog is a frozen const

The runtime SHALL define exactly 10 goods species in a frozen const `GOODS_CATALOG` in `packages/server/src/goods/catalog.ts`. No goods species may be created at runtime. The catalog MUST include: `meat`, `fish`, `brine`, `lumber`, `ore`, `grain`, `refined_salt`, `iron_ingot`, `bread`, `tools`. Each entry MUST carry `speciesId`, `nameZh`, `unit` (piece/kg/bundle), and `tier` (raw/processed/manufactured).

#### Scenario: Catalog is frozen and complete

- **WHEN** `listGoodsSpecies()` is called at runtime
- **THEN** it MUST return exactly 10 species
- **AND** the returned array MUST be deep-frozen (modification attempt throws in strict mode)
- **AND** every species MUST have non-empty `speciesId`, `nameZh`, `unit`, `tier`

#### Scenario: Unknown goods species rejected

- **WHEN** a `GOODS_EXTRACTED` Command carries `goodsSpeciesId = "platinum_bar"` (not in catalog)
- **THEN** the Rule Engine MUST reject the Command and append a `COMMAND_REJECTED` event with `reason = "unknown_goods_species"`

### Requirement: GOODS_EXTRACTED flows through Command → Rule Engine → Event

A `GOODS_EXTRACTED` Command SHALL be the authoritative signal that goods entered the world from a natural source (ecosystem harvest, mining, farming). The Rule Engine MUST validate the command and emit a `GOODS_EXTRACTED` Event. No code path MUST mutate `GoodsInventoryProjection` directly.

#### Scenario: Valid extraction produces event and updates projection

- **WHEN** `GOODS_EXTRACTED { goodsSpeciesId: "meat", quantity: 1, ownerId: "npc_hunter_1", ownerType: "npc" }` is submitted
- **THEN** a `GOODS_EXTRACTED` Event MUST be committed to EventLog
- **AND** `GoodsInventoryProjection.getQuantity("npc_hunter_1", "npc", "meat")` MUST increase by 1

#### Scenario: Zero quantity is rejected

- **WHEN** `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 0, ownerId: "npc_1", ownerType: "npc" }` is submitted
- **THEN** the Rule Engine MUST reject the Command with `reason = "quantity_must_be_positive"`

### Requirement: GOODS_CONSUMED deducts from inventory with floor guard

A `GOODS_CONSUMED` Command SHALL deduct quantity from the owner's inventory. The Rule Engine MUST reject the command if inventory would go below zero.

#### Scenario: Consumption within available quantity

- **WHEN** `npc_hunter_1` has 3 meat in inventory
- **AND** `GOODS_CONSUMED { goodsSpeciesId: "meat", quantity: 2, ownerId: "npc_hunter_1", ownerType: "npc" }` is submitted
- **THEN** a `GOODS_CONSUMED` Event MUST be committed
- **AND** `getQuantity("npc_hunter_1", "npc", "meat")` MUST equal 1

#### Scenario: Consumption exceeding available quantity is rejected

- **WHEN** `npc_hunter_1` has 1 meat in inventory
- **AND** `GOODS_CONSUMED { goodsSpeciesId: "meat", quantity: 5, ownerId: "npc_hunter_1", ownerType: "npc" }` is submitted
- **THEN** the Rule Engine MUST reject the Command with `reason = "insufficient_goods"`
- **AND** the inventory MUST remain unchanged at 1

### Requirement: GOODS_DESTROYED removes goods unconditionally

A `GOODS_DESTROYED` Command SHALL reduce inventory. If quantity exceeds available, the inventory MUST be zeroed (not negative), not rejected. This models spoilage and loss events that cannot be retried.

#### Scenario: Destruction zeroes inventory when quantity exceeds available

- **WHEN** `npc_1` has 2 fish
- **AND** `GOODS_DESTROYED { goodsSpeciesId: "fish", quantity: 10, ownerId: "npc_1", ownerType: "npc" }` is submitted
- **THEN** a `GOODS_DESTROYED` Event MUST be committed
- **AND** `getQuantity("npc_1", "npc", "fish")` MUST equal 0

### Requirement: GoodsInventoryProjection is rebuilt deterministically from EventLog

`GoodsInventoryProjection` MUST implement `rebuildFromEvents(events)` and `canonicalHash()`. On server boot it MUST be hydrated from EventLog using `readEventsByTypes(GOODS_BOOT_EVENT_TYPES)`.

#### Scenario: Rebuild produces identical projection

- **WHEN** a sequence of `GOODS_EXTRACTED`, `GOODS_CONSUMED`, `GOODS_DESTROYED` events is committed
- **AND** the projection is cleared and rebuilt from the same events
- **THEN** `canonicalHash()` MUST return the same value before and after rebuild

#### Scenario: Boot hydration wires goods into large-log fast-boot path

- **WHEN** the server boots with an EventLog containing more than `BOOT_PROJECTION_REBUILD_EVENT_LIMIT` events
- **THEN** `GoodsInventoryProjection` MUST be rebuilt by `readEventsByTypes(GOODS_BOOT_EVENT_TYPES)`
- **AND** `getQuantity()` MUST return correct values immediately after boot

### Requirement: E0 harvest events promote to GOODS_EXTRACTED in the same tick

When the runtime commits a `MEAT_HARVESTED` or `FISHERY_HARVESTED` event, it MUST enqueue a `GOODS_EXTRACTED` follow-on Command in the same world tick. The follow-on command MUST use the original event's `actorId` as `ownerId` and `ownerType = "npc"`.

#### Scenario: MEAT_HARVESTED triggers GOODS_EXTRACTED:meat

- **WHEN** a `MEAT_HARVESTED` event for `actorId = "npc_hunter_1"` is committed in tick T
- **THEN** a `GOODS_EXTRACTED { goodsSpeciesId: "meat", quantity: 1, ownerId: "npc_hunter_1", ownerType: "npc" }` Command MUST be submitted in tick T
- **AND** the resulting `GOODS_EXTRACTED` Event MUST appear in EventLog for tick T

#### Scenario: FISHERY_HARVESTED triggers GOODS_EXTRACTED:fish

- **WHEN** a `FISHERY_HARVESTED` event for `actorId = "npc_fisher_1"` is committed in tick T
- **THEN** a `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 1, ownerId: "npc_fisher_1", ownerType: "npc" }` Command MUST be submitted in tick T

### Requirement: NPC productive actions emit GOODS_EXTRACTED on accepted outputs

When an NPC's productive action is accepted by the Rule Engine and the action yields a physical output, the runtime MUST enqueue a `GOODS_EXTRACTED` command for the appropriate goods species.

#### Scenario: Forest hunter productive action produces meat

- **WHEN** a forest hunter NPC's `productive_action` Command with `actionType = "hunt"` is accepted
- **AND** the Rule Engine emits an `NPC_PRODUCTIVE_ACTION_ACCEPTED` event
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "meat", quantity: 1, ownerId: <npcId>, ownerType: "npc" }`

#### Scenario: Mountain miner productive action produces ore

- **WHEN** a mountain NPC's `productive_action` Command with `actionType = "mine"` is accepted
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "ore", quantity: 1, ownerId: <npcId>, ownerType: "npc" }`

#### Scenario: Salt-marsh fisher productive action produces fish

- **WHEN** a salt-marsh fisher NPC's `productive_action` Command with `actionType = "fish"` is accepted
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 1, ownerId: <npcId>, ownerType: "npc" }`

### Requirement: GET /api/goods/inventory/:ownerId returns current inventory

The server SHALL expose `GET /api/goods/inventory/:ownerId` returning the owner's full inventory as a JSON array of `{ goodsSpeciesId, quantity, nameZh, unit }` entries. Empty slots MUST be omitted. This endpoint MUST serve data directly from `GoodsInventoryProjection`, not from a DB query.

#### Scenario: Inventory endpoint returns non-empty items only

- **WHEN** `npc_hunter_1` has 3 meat and 0 fish in inventory
- **AND** `GET /api/goods/inventory/npc_hunter_1` is called
- **THEN** the response MUST contain exactly one entry: `{ goodsSpeciesId: "meat", quantity: 3, nameZh: "肉", unit: "piece" }`
- **AND** fish MUST NOT appear in the response
