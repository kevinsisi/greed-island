## Overview

This slice introduces the first durable civilization-level substrate: world goals and technologies are now typed events, not roadmap prose or hidden mutable state.

The runtime observes already-accepted EventLog evidence such as skill observation, mentorship completion, construction progress, roads, walls, building upgrades, and goods processing. When enough related evidence accumulates and the technology is not already known, the deterministic planner emits a world goal and a technology discovery command. The Rule Engine validates those commands before they become events.

## Determinism

- Evidence comes from committed events only.
- Planner output is sorted by domain for stable command ordering.
- Command IDs remain content-hash based through `makeLivingWorldCommand`.
- Projection state is rebuilt from EventLog during small-log boot and selective deferred hydration during large-log boot.

## Layering

```text
NPC / construction / learning events
  → world civilization evidence collector
  → deterministic planner
  → WORLD_GOAL_DECLARED / WORLD_TECH_DISCOVERED commands
  → Rule Engine
  → EventLog
  → WorldCivilizationProjection
```

AI narration may describe these facts later, but cannot create them.
