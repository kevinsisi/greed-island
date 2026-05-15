# Spec — civilization-runtime capability (Goods Primitives)

## ADDED Requirements

### Requirement: Goods command primitives SHALL be typed living-world events

The living-world command catalog MUST include typed goods commands for
extraction, storage, processing, consumption, and destruction. Each goods event
MUST include a goods id, positive quantity, a location or holder, tick metadata,
and narration so later market/logistics/production slices can replay them.

#### Scenario: Goods command validates

- **WHEN** a valid `GOODS_EXTRACTED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `GOODS_EXTRACTED` event

### Requirement: Goods inventory SHALL be replayable

The runtime MUST maintain `goodsInventory` as a projection over typed goods
events keyed by holder type, holder id, and goods id. Rebuilding from the same
EventLog MUST produce the same canonical hash.

#### Scenario: Storing goods increments inventory

- **GIVEN** an NPC has no fish inventory
- **WHEN** `GOODS_STORED` stores 12 fish on that NPC
- **THEN** `goodsInventory` MUST report quantity 12 for that NPC and goods id

#### Scenario: Consumption cannot make inventory negative

- **GIVEN** an NPC has 5 meat inventory
- **WHEN** `GOODS_CONSUMED` consumes 8 meat from that NPC
- **THEN** `goodsInventory` MUST report quantity 0, not a negative number

### Requirement: Ecosystem outputs SHALL promote into goods

Accepted ecosystem harvest events MUST promote into goods primitives before any
market or cooking logic can consume them. `MEAT_HARVESTED` MUST create and store
`meat` goods on the hunter NPC; `FISHERY_HARVESTED` MUST create and store `fish`
goods on the fisher NPC.

#### Scenario: Fishery harvest becomes fish goods

- **WHEN** a fisher NPC produces an accepted `FISHERY_HARVESTED` event
- **THEN** the runtime MUST also emit `GOODS_EXTRACTED` and `GOODS_STORED` for
  `fish` on that NPC

### Requirement: Goods inventory SHALL be visible to GM observers

The web client MUST render `WorldSnapshot.facts.goodsInventory` in the GM/admin
world observer page and label it as inventory substrate rather than completed
market, cooking, or logistics behavior.

#### Scenario: GM views goods inventory

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** `facts.goodsInventory` contains rows
- **THEN** the page MUST display holder, goods id, quantity, tile, and updated
  tick for each row
