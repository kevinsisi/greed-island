# Proposal — Ecosystem Simple Hunting (Phase E0.3)

## Why

E0.2 made wildlife spawn into EventLog and `animal_population`, but population
only increases. `docs/WORLD_CAPABILITIES.md` §34 requires the next slice to make
hunters interact with nearby prey and turn ecosystem events into early economic
value, before Phase 2 goods/logistics can honestly consume ecosystem outputs.

This slice adds the smallest real hunting path: hunter-role NPC productive work
can start and resolve a hunt against an existing animal population row, kill one
animal, create a carcass, harvest meat, and credit the NPC's civic economy.

## What Changes

- Add typed commands/events:
  - `ANIMAL_HUNT_STARTED`
  - `ANIMAL_HUNT_RESOLVED`
  - `ANIMAL_KILLED`
  - `CARCASS_CREATED`
  - `MEAT_HARVESTED`
- Add a deterministic simple hunting planner that:
  - only considers hunter-role NPCs,
  - requires elevated food pressure,
  - chooses same-tile edible prey from `animal_population`,
  - derives hunt/carcass ids from canonical hashes.
- Extend `AnimalPopulationProjection` so `ANIMAL_KILLED` removes the killed
  animal id from the `(speciesId, tileId)` population row.
- Extend `LifeExpansionState` reduction so accepted `MEAT_HARVESTED` credits
  NPC `civic.gold` as a placeholder bridge toward Phase 2 goods.

## Out Of Scope

- Multi-tick hunts, combat rolls, injury, failure consequences.
- Fishery density and fisher behavior (E0.4).
- Carcass inventory projection or true goods inventory (Phase 2).
- Migration/reproduction/extinction balancing (E1+).
