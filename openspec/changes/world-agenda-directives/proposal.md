## Why

Event motivation currently explains local actions after the fact. That makes the
world feel like a pool of canned NPC reasons instead of a city shaped by
government, factions, and hidden island pressure.

## What Changes

- Add deterministic `WorldAgendaDirective` derivation from existing area
  resources, faction control, and active world events.
- Route NPC life-goal, productive-action, and construction motivation through
  the directive first, then role interpretation, then personal need.
- Keep directives derived-only for this slice: no new writable state or AI
  authoring of world intent.

## Impact

- Motivations read as top-down causal chains: sponsor -> directive -> role
  interpretation -> NPC response.
- Replay remains deterministic because directives are pure projections over
  committed/current simulation state.
