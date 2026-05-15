## Why

`docs/WORLD_CAPABILITIES.md` Phase 1 §33.2 requires NPC state to move off the
generic `FACT_SET` path into typed events plus a replayable `npc_state`
projection. Right now `SimulationRuntime` still writes `npc.state.<id>` FACT_SET
snapshots for every NPC change and hydrates `NpcEngine` from those facts on
boot. That keeps NPC state inside the transitional §11.5 path.

The smallest correct slice is to introduce a typed NPC state event carrying the
authoritative `NpcRuntimeState` snapshot, rebuild a dedicated
`NpcStateProjection` from those events, and switch boot hydration to prefer the
typed projection with FACT_SET as legacy fallback.

## What Changes

- Add typed living-world command/event `NPC_STATE_RECORDED`.
- Add `NpcStateProjection` with `rebuildFromEvents()`, `project(event)`,
  `getByNpcId()`, `getAll()`, and canonical-hash coverage.
- `SimulationRuntime` stops writing `npc.state.<id>` FACT_SET entries for new
  NPC state changes. Instead, it emits `NPC_STATE_RECORDED` commands/events.
- Boot hydration rebuilds `NpcStateProjection` from EventLog and feeds
  `NpcEngine.hydrate(...)` from the projection first; old `npc.state.<id>`
  facts remain as compatibility fallback for pre-migration logs.
- `NPC_STATE_RECORDED` is internal typed truth and MUST NOT surface as a public
  narrative/chronicle event.

## Impact

- Closes the NPC-state portion of `ARCHITECTURE.md §11.5`.
- Keeps the rest of FACT_SET transitional domains unchanged for now.
- Reduces dependence on `WorldSnapshot.facts['npc.state.*']`; the authoritative
  NPC source becomes the typed projection + runtime state map.
