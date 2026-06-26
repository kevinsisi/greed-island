## Why

The project north star is not a static RPG content loop. Greed Island should feel like a Hunter x Hunter–style game island whose world keeps operating when the player is not steering it: NPCs learn, construction creates capability beyond buildings, and civilization develops its own goals and technology.

Before this change, learning and construction events existed, but the world had no durable layer that could say: “these repeated facts have become a world goal” or “this repeated practice has become technology.” That made autonomy look like local NPC behavior instead of a self-running civilization.

## What Changes

- Add typed world-civilization commands/events:
  - `WORLD_GOAL_DECLARED`
  - `WORLD_GOAL_PROGRESS_RECORDED`
  - `WORLD_TECH_DISCOVERED`
- Add a projection that rebuilds current world goals and discovered technologies from EventLog.
- Add a deterministic planner that converts repeated learning / construction evidence into world-level goals and technology.
- Wire the planner into runtime ticks so civilization can form goals from recent accepted events.
- Keep AI read-only: technology and goals are only committed through typed commands validated by the Rule Engine.

## Out of Scope

- Full tech tree balancing.
- Player-facing tech UI.
- Multi-stage research projects with resource costs.
- Rich civilization strategy planning across factions.

Those should build on this event/projection substrate instead of bypassing it.
