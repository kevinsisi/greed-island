## Why

NPCs now move, work, trade, serve, learn, and repair, but those actions still do
not produce enough long-term motive. A living city needs pressure and attachment:
people need food, rest, money, safety, housing, relationships, family, and goals
that can change the city around them.

This change makes city expansion a result of deterministic NPC life pressure
instead of random generation or AI-authored story text. NPC productive actions
will accumulate into life goals, households, and construction projects that can
unlock real buildings and new map areas through the Command -> Rule Engine ->
Event -> Projection pipeline.

## What Changes

- Add deterministic NPC needs and life goals as world facts: hunger/energy,
  money pressure, housing pressure, safety pressure, and goals such as earning,
  improving housing, forming a family, opening a shop, and joining construction.
- Add household facts for committed relationships, marriage-like commitment, and
  children as dependents. Children are not full NPC actors in the first slice.
- Add construction projects whose progress is advanced by committed productive
  actions and whose completion emits authoritative expansion events.
- Add real expansion projections: newly constructed buildings appear in building
  APIs and area maps; unlocked tiles appear in the world map and can later be
  used by movement and area APIs.
- Keep AI read-only. AI may describe committed life/expansion events but cannot
  create families, buildings, map tiles, or project progress.

## Implementation Slices

1. **Life pressure foundation**: derive per-NPC needs and life goals from
   deterministic ticks, activity, area safety/economy, and existing profile data.
2. **Household foundation**: commit deterministic relationship/household events
   when stable conditions are met; children are household dependents only.
3. **Expansion foundation**: accumulate construction progress from productive
   actions and complete projects into map/building unlock events.
4. **UI visibility**: surface NPC goals, households, construction progress,
   newly unlocked buildings, and newly unlocked map areas.

## Non-Goals

- No NPC death in the first slice.
- No child growth into full NPC actors in the first slice.
- No AI-authored state mutation.
- No destructive migration of existing EventLog data.

## Impact

- Backend: simulation runtime, living-world command catalog, building catalog,
  map graph, catch-up summaries, and projection hydration.
- Frontend: NPC detail, Since Last Visit, Hub/Area map visibility, and building
  lists.
- Tests: deterministic replay, command validation, expansion projection, and UI
  projection coverage.
