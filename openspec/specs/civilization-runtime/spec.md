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

### Requirement: A Settlement SHALL be a real domain entity, not a tile label

The runtime MUST persist Settlement as a distinct entity with identity, location, founding tick, and founding members. A Settlement is **orthogonal** to the underlying tile and to the existing `lifeExpansion.unlockedTileIds` terrain-unlock mechanism — the tile may exist without a settlement, and a settlement may form on an existing tile.

#### Scenario: Settlement carries identity and founding metadata

- **GIVEN** the runtime has recorded a `SETTLEMENT_FORMED` event
- **WHEN** a caller queries `/api/settlements/:id`
- **THEN** the response MUST include `id`, `tileId`, `formedAtTick`, and `founderNpcIds`

#### Scenario: Settlement is independent of tile unlock

- **GIVEN** tile `t_X` exists in the map graph and is `unlocked`
- **AND** no `SETTLEMENT_FORMED` event has been committed for `t_X`
- **WHEN** a caller queries `/api/settlements`
- **THEN** the response MUST NOT include a settlement at `t_X`

### Requirement: Settlement formation SHALL flow through Command → Rule Engine → Event

A Settlement MUST come into existence only via a `SETTLEMENT_FORMED` Command accepted by the Rule Engine and committed as a typed Event. No runtime path may insert a Settlement directly into the projection.

#### Scenario: Command carries deterministic payload

- **WHEN** the runtime submits a `SETTLEMENT_FORMED` Command
- **THEN** the payload MUST include `settlementId`, `tileId`, `formedAtTick`, and a non-empty `founderNpcIds` array (length ≥ `SETTLEMENT_FORMATION_MIN_NPCS`)
- **AND** `founderNpcIds` MUST be sorted lexicographically so identical inputs yield identical events

#### Scenario: Settlement id is deterministic

- **GIVEN** identical `tileId`, `formedAtTick`, and `founderNpcIds`
- **WHEN** the runtime derives the settlement id
- **THEN** the resulting id MUST be reproducible across replays

### Requirement: Settlement formation SHALL emerge from sustained NPC co-presence

The runtime MUST emit `SETTLEMENT_FORMED` when a tile has had at least `SETTLEMENT_FORMATION_MIN_NPCS` outdoor (non-building, non-moving) NPCs continuously present for at least `SETTLEMENT_FORMATION_MIN_TICKS` consecutive ticks, and no settlement currently exists for that tile.

#### Scenario: Threshold not met → no formation

- **GIVEN** tile `t_X` has 2 outdoor NPCs co-located for 30 consecutive ticks
- **WHEN** the runtime evaluates formation detection on tick N
- **THEN** no `SETTLEMENT_FORMED` event MUST be emitted for `t_X`

#### Scenario: Threshold met exactly → formation

- **GIVEN** tile `t_X` has 3 outdoor NPCs co-located for `SETTLEMENT_FORMATION_MIN_TICKS` consecutive ticks
- **AND** no settlement currently exists at `t_X`
- **WHEN** the runtime evaluates formation detection
- **THEN** exactly one `SETTLEMENT_FORMED` event MUST be emitted with `tileId = 't_X'`
- **AND** `founderNpcIds` MUST be the lexicographically-sorted list of those 3 NPC ids

#### Scenario: Already-formed tile is not re-formed

- **GIVEN** tile `t_X` already has a settlement
- **AND** new NPCs cluster at `t_X` meeting the threshold
- **WHEN** the runtime evaluates formation detection
- **THEN** no additional `SETTLEMENT_FORMED` event MUST be emitted for `t_X`

### Requirement: Settlements projection SHALL be replayable from EventLog

The `settlements` projection MUST expose `rebuildFromEvents(events)` that drops all rows and recomputes from `SETTLEMENT_FORMED` events. The result of `rebuildFromEvents` MUST be byte-for-byte identical across replays of the same EventLog.

#### Scenario: Rebuild produces identical canonical hash

- **GIVEN** two projection instances `A` and `B`
- **WHEN** both invoke `rebuildFromEvents(eventLog)` with the same input
- **THEN** the canonical JSON hash of `A.getAll()` MUST equal that of `B.getAll()`

### Requirement: Settlement formation SHALL be visible via HTTP read surface

The server MUST expose `GET /api/settlements` returning the full settlement list and `GET /api/settlements/:id` returning a single settlement. These are read-only projections — no POST/PUT/DELETE that would mutate settlement state.

#### Scenario: Empty world has no settlements

- **GIVEN** a freshly-booted runtime with no `SETTLEMENT_FORMED` events in the EventLog
- **WHEN** a caller invokes `GET /api/settlements`
- **THEN** the response MUST be `{ settlements: [] }`

#### Scenario: After formation the settlement is visible

- **GIVEN** a `SETTLEMENT_FORMED` event was committed for tile `t_X` with id `S1` and founder ids `['n1', 'n2', 'n3']`
- **WHEN** a caller invokes `GET /api/settlements`
- **THEN** the response MUST include a settlement entry with `id = 'S1'`, `tileId = 't_X'`, and `founderNpcIds = ['n1', 'n2', 'n3']`

### Requirement: Settlement state SHALL extend beyond formation metadata

The runtime SHALL maintain a replayable settlement-state projection for each formed settlement. Each row MUST include the existing formation fields (`id`, `tileId`, `formedAtTick`, `founderNpcIds`) plus population ids, settlement-held storage summary, bounded pressure scores, stability score, status, and `updatedAtTick`.

#### Scenario: Settlement state includes civilization fields

- **GIVEN** a settlement has formed and state events have been committed
- **WHEN** a caller reads the settlement projection
- **THEN** the row MUST include population ids, storage summary, pressure, stability, status, and updated tick
- **AND** the row MUST still include id, tile id, founding tick, and founder NPC ids

#### Scenario: Formation-only settlement has deterministic defaults

- **GIVEN** only a `SETTLEMENT_FORMED` event exists for a settlement
- **WHEN** the settlement projection rebuilds
- **THEN** the settlement MUST have empty population/storage summaries, zero pressure scores, stability `100`, status `stable`, and `updatedAtTick = formedAtTick`

### Requirement: Settlement updates SHALL flow through typed living-world events

Population, storage, pressure, stability, decline, and recovery changes SHALL be represented as typed living-world Commands accepted by the Rule Engine and committed as typed Events. No runtime path may mutate settlement projection rows directly.

#### Scenario: Pressure update command validates

- **WHEN** a valid `SETTLEMENT_PRESSURE_UPDATED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `SETTLEMENT_PRESSURE_UPDATED` event

#### Scenario: Invalid pressure is rejected

- **WHEN** a `SETTLEMENT_PRESSURE_UPDATED` command contains any pressure score below `0` or above `100`
- **THEN** the Rule Engine MUST reject the command and emit no event

### Requirement: Settlement population SHALL derive from authoritative NPC presence

Settlement population summaries SHALL be derived from server-authoritative NPC state and committed through typed settlement events. Frontend actors, AI narration, and decorative map elements MUST NOT create or modify settlement population.

#### Scenario: Outdoor present NPCs become population summary

- **GIVEN** formed settlement `S1` is on tile `t_X`
- **AND** NPCs `n1`, `n2`, and `n3` have authoritative presence at `t_X`
- **WHEN** the settlement engine plans population updates
- **THEN** it MAY emit `SETTLEMENT_POPULATION_UPDATED` for `S1` with sorted population ids `['n1', 'n2', 'n3']`

#### Scenario: Fake UI actors cannot affect population

- **GIVEN** the frontend renders any local-only marker or animation
- **WHEN** settlement population is projected
- **THEN** the marker or animation MUST have no effect on settlement population ids

### Requirement: Settlement storage summary SHALL derive from goods inventory

Settlement storage summaries SHALL be derived from committed goods events projected by `GoodsInventoryProjection` for `holderType = 'settlement'`. Storage summaries MUST NOT fabricate goods that are absent from the goods inventory projection.

#### Scenario: Settlement-held goods appear in storage summary

- **GIVEN** `GoodsInventoryProjection` reports 12 fish for `holderType='settlement'` and `holderId='settlement.t_central'`
- **WHEN** the settlement engine plans storage updates for that settlement
- **THEN** the resulting settlement storage summary MUST include fish quantity 12

#### Scenario: Missing goods are not fabricated

- **GIVEN** no goods inventory row exists for `refined_salt` at settlement `S1`
- **WHEN** the settlement storage summary is projected
- **THEN** `refined_salt` MUST be absent or have quantity 0

### Requirement: Settlement pressure SHALL be deterministic and bounded

The settlement engine SHALL compute pressure scores for `food`, `safety`, `economy`, and `logistics` using deterministic inputs from existing projections. Each score MUST be an integer in the range `0..100` and MUST be independent of wall-clock time, AI output, and frontend state.

#### Scenario: Food shortage raises food pressure

- **GIVEN** a settlement has population greater than zero and no settlement-held food goods
- **WHEN** the settlement engine computes pressure
- **THEN** food pressure MUST be greater than it would be with adequate food supply

#### Scenario: Transport loss raises logistics pressure

- **GIVEN** a settlement has a recent `GOODS_TRANSPORT_LOST` event on an expected supply route
- **WHEN** the settlement engine computes pressure
- **THEN** logistics pressure MUST increase within the bounded `0..100` range

### Requirement: Settlement stability SHALL change through one event per settlement per tick

The settlement engine SHALL derive stability from pressure and emit at most one `SETTLEMENT_STABILITY_CHANGED` event per settlement per world tick. Stability MUST be an integer in the range `0..100`.

#### Scenario: High pressure lowers stability once

- **GIVEN** settlement `S1` has high food and logistics pressure on tick `T`
- **WHEN** the settlement engine plans stability updates for tick `T`
- **THEN** it MUST emit at most one `SETTLEMENT_STABILITY_CHANGED` event for `S1`
- **AND** the resulting stability MUST remain between `0` and `100`

### Requirement: Settlement decline and recovery SHALL be explicit state transitions

When stability crosses configured thresholds, the runtime SHALL emit `SETTLEMENT_DECLINED` or `SETTLEMENT_RECOVERED` events. Decline and recovery MUST update settlement status but MUST NOT delete, split, conquer, or abandon a settlement in this change.

#### Scenario: Stability below decline threshold marks declining

- **GIVEN** settlement `S1` has stability below the configured decline threshold
- **WHEN** the settlement engine plans status updates
- **THEN** it MUST emit `SETTLEMENT_DECLINED`
- **AND** the settlement projection MUST report status `declining`

#### Scenario: Stability above recovery threshold marks recovering or stable

- **GIVEN** settlement `S1` was declining and its stability rises above the configured recovery threshold
- **WHEN** the settlement engine plans status updates
- **THEN** it MUST emit `SETTLEMENT_RECOVERED`
- **AND** the settlement projection MUST no longer report status `declining`

### Requirement: Settlement observability SHALL use authoritative read models only

GM/admin settlement observability SHALL render data from `WorldSnapshot.facts` or settlement HTTP read endpoints. The UI MUST NOT invent people, crowds, storage, pressure, or settlement status that is absent from server projections.

#### Scenario: GM views settlement state

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** settlement state rows exist
- **THEN** the page MUST display status, population count, storage summary, pressure scores, stability, and updated tick from server data

#### Scenario: Hub map remains non-authoritative for population

- **WHEN** the Hub map renders a settlement badge or status indicator
- **THEN** it MUST derive that indicator from server settlement state
- **AND** it MUST NOT render fake people or decorative crowds as settlement population

