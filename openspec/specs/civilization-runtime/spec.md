# civilization-runtime Specification

## Purpose
TBD - created by archiving change goods-primitives. Update Purpose after archive.
## Requirements
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

### Requirement: Logistics command primitives SHALL be typed living-world events

The living-world command catalog MUST include typed commands for opening and
closing trade routes and for goods transport start, arrival, and loss. Transport
start commands MUST include route id, goods id, positive quantity, source holder,
destination holder, source/destination tile, carrier NPC id, and tick metadata.
Transport resolution commands MUST include enough route, goods, quantity, carrier,
tile, reason/status, and tick metadata to project arrival or loss deterministically.

#### Scenario: Transport command validates

- **WHEN** a valid `GOODS_TRANSPORT_STARTED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `GOODS_TRANSPORT_STARTED` event

### Requirement: Logistics projections SHALL be replayable

The runtime MUST maintain logistics projections over typed logistics events,
including open trade routes and goods transport rows. Rebuilding from the same
EventLog MUST produce the same canonical hash.

#### Scenario: Transport arrives

- **GIVEN** a `GOODS_TRANSPORT_STARTED` event exists
- **WHEN** a matching `GOODS_TRANSPORT_ARRIVED` event is projected
- **THEN** the transport row MUST report status `arrived`

### Requirement: Source goods SHALL move through logistics before settlement storage

The runtime SHALL move ecosystem-sourced goods through logistics when they are
stored on an NPC outside `t_central`. It MUST plan an abstract logistics chain:
route opened if needed, source
inventory consumed for loading, transport started, transport arrived, and goods
stored on the central settlement holder.

#### Scenario: Fish moves from fisher to central settlement

- **GIVEN** an NPC on `t_dock` stores 12 fish goods
- **WHEN** runtime side effects are planned
- **THEN** it MUST emit transport events and a central settlement `GOODS_STORED`
  event for 12 fish

### Requirement: Storms SHALL be able to destroy in-transit goods

The runtime SHALL allow active storm world events to destroy in-transit goods.
If an active `weather.storm` world event is present while an abstract goods
transport is planned, it MUST emit `GOODS_TRANSPORT_LOST` instead of
`GOODS_TRANSPORT_ARRIVED` and MUST NOT store the transported goods at the
destination. Storms MUST NOT damage buildings or cities in this slice.

#### Scenario: Storm destroys shipment

- **GIVEN** an active `weather.storm` world event
- **WHEN** a fisher NPC attempts to move 12 fish goods to the central settlement
- **THEN** the runtime MUST emit `GOODS_TRANSPORT_LOST` with reason `storm`
- **AND** no destination `GOODS_STORED` event is emitted for that shipment

### Requirement: Logistics SHALL be visible to GM observers

The web client MUST render `WorldSnapshot.facts.logistics` in the GM/admin world
observer page, including route id, source/destination tiles, goods id, carrier,
quantity, status, and updated tick.

#### Scenario: GM views logistics

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** `facts.logistics` contains routes or transports
- **THEN** the page MUST display those rows without requiring raw JSON inspection

### Requirement: Production recipes SHALL be deterministic runtime data

The runtime MUST define production recipes as deterministic data, not AI
narration. Each recipe MUST include recipe id, input goods id and quantity,
output goods id and quantity, eligible holder/building or settlement context, and
tick metadata needed to replay production decisions.

#### Scenario: Salt recipe is available

- **WHEN** the production recipe catalog is read
- **THEN** it MUST include a deterministic recipe for `salt_marsh_brine` to
  `refined_salt`

### Requirement: Production chains SHALL process inventory through typed events

When an eligible production holder has enough input inventory, the runtime MUST
emit a `GOODS_PROCESSED` command through the Rule Engine. The resulting event
MUST subtract input goods and add output goods through `GoodsInventoryProjection`.

#### Scenario: Brine becomes refined salt

- **GIVEN** an eligible holder has enough `salt_marsh_brine` inventory
- **WHEN** production planning runs
- **THEN** the runtime MUST emit `GOODS_PROCESSED` for `refined_salt`
- **AND** the goods inventory projection MUST reduce `salt_marsh_brine` and
  increase `refined_salt`

### Requirement: Production SHALL not fabricate missing inputs

The runtime MUST NOT emit `GOODS_PROCESSED` when the selected holder lacks the
required input quantity. Missing inputs MUST leave inventory unchanged.

#### Scenario: No brine means no salt

- **GIVEN** an eligible holder has zero `salt_marsh_brine`
- **WHEN** production planning runs
- **THEN** no `GOODS_PROCESSED` event for `refined_salt` is emitted

### Requirement: Production facts SHALL be visible to GM observers

The web client MUST render production-chain facts in the GM/admin world observer
page and label them as production-chain state rather than market prices.

#### Scenario: GM views production state

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** production-chain facts exist in `WorldSnapshot.facts`
- **THEN** the page MUST display recipe/output state without requiring raw JSON
  inspection

### Requirement: Market price discovery SHALL be a typed living-world event

The living-world command catalog MUST include `MARKET_PRICE_DISCOVERED`. Each
price event MUST include market id, settlement id, goods id, supply quantity,
demand quantity, discovered price in gold, tick metadata, and narration. Price
discovery MUST pass through the Rule Engine before it reaches any projection.

#### Scenario: Market price command validates

- **WHEN** a valid `MARKET_PRICE_DISCOVERED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `MARKET_PRICE_DISCOVERED` event

### Requirement: Market prices SHALL be derived from projected supply and demand

The runtime MUST calculate settlement goods prices from deterministic market
metadata and projected settlement inventory. The calculation MUST NOT use AI
narration, random numbers, or frontend state.

#### Scenario: Scarcity raises price

- **GIVEN** central settlement demand for `refined_salt` is greater than supply
- **WHEN** market pricing runs
- **THEN** the discovered `refined_salt` price MUST be higher than its base price

#### Scenario: Adequate supply lowers pressure

- **GIVEN** central settlement supply for a goods id meets or exceeds demand
- **WHEN** market pricing runs
- **THEN** the discovered price MUST be less than or equal to the scarcity price
  for the same goods id when supply is zero

### Requirement: Market price projection SHALL be replayable

The runtime MUST maintain `marketPrices` as a projection over
`MARKET_PRICE_DISCOVERED` events keyed by settlement id and goods id. Rebuilding
from the same EventLog MUST produce the same canonical hash.

#### Scenario: Latest price wins

- **GIVEN** two `MARKET_PRICE_DISCOVERED` events exist for the same settlement
  and goods id
- **WHEN** the projection rebuilds
- **THEN** it MUST report the latest event's price and tick

### Requirement: Market prices SHALL be visible to GM observers

The web client MUST render `WorldSnapshot.facts.marketPrices` in the GM/admin
world observer page and label them as price projection state rather than NPC
purchase transactions.

#### Scenario: GM views market prices

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** `facts.marketPrices` contains rows
- **THEN** the page MUST display settlement id, goods id, supply, demand, price,
  and updated tick without requiring raw JSON inspection

