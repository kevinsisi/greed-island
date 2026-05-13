# Proposal — Ecosystem Fishery Density (Phase E0.4)

## Why

E0.2/E0.3 gave the ecosystem a wildlife population and a first hunting path.
`docs/WORLD_CAPABILITIES.md` §34 still calls out fishery density separately:
coastal work should reduce local fish availability and emit collapse warnings
when overworked.

This slice adds tile-level `fisheryDensity` so fisher-like NPC work can affect a
real ecosystem projection before Phase 2 goods turns harvests into inventory.

## What Changes

- Add `FISHERY_HARVESTED` and `FISHERY_COLLAPSED` commands/events.
- Add `FisheryDensityProjection` keyed by coastal tile id.
- Add deterministic fisher policy that reduces density from fisher/fishmonger/net
  mender productive work on coastal water tiles.
- Emit `FISHERY_COLLAPSED` once a tile crosses the collapse threshold.

## Out Of Scope

- Goods inventory, market pricing, recovery/regrowth, extinction arcs.
- Species-specific fishery beyond tile-level density.
