# Proposal — Goods Logistics (Phase 2 §35.2)

## Why

`docs/WORLD_CAPABILITIES.md` §35.2 requires goods to move through logistics
before market formation. Phase 2 §35.1 now creates real `goodsInventory`, but
fish/meat still remain on the harvesting NPC unless a transport layer moves
them. Without routes and transport events, later market prices would still be
teleporting goods.

## What Changes

- Add logistics command/event primitives:
  - `TRADE_ROUTE_OPENED`
  - `TRADE_ROUTE_CLOSED`
  - `GOODS_TRANSPORT_STARTED`
  - `GOODS_TRANSPORT_ARRIVED`
  - `GOODS_TRANSPORT_LOST`
- Add replayable logistics projections for open trade routes and goods
  transports.
- When ecosystem-sourced goods are stored on an NPC outside `t_central`, the
  runtime opens an abstract route to the central settlement and emits a transport
  started/arrived chain. The source NPC inventory is consumed for loading and
  the central settlement receives stored goods.
- If an active `weather.storm` world event is present during loading, the same
  chain emits `GOODS_TRANSPORT_LOST` instead of arrival/storage.
- Expose logistics rows on the world snapshot and GM world observer page.

## Out Of Scope

- Multi-tick carrier travel, pathfinding risk beyond active storm events,
  warehouses/building capacity, market prices, player hauling, road
  construction, building/city damage, and predator/bandit loss.

## Impact

- Goods no longer merely appear on harvesters; they begin flowing from source
  tiles toward a settlement holder through typed logistics events.
- Creates the substrate for Phase 2 §35.3 production and §35.4 market formation.
