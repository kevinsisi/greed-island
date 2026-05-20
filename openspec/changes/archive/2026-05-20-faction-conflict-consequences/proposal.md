## Why

Faction `factionControl` scores shift every tick, but no event is ever stamped into the EventLog when a faction seizes or loses a tile — so control changes are ephemeral, unnarrated, and have zero consequence for the player or for NPCs. A player who joined a faction has no way to see that faction winning or losing ground.

## What Changes

- Add `FACTION_TILE_SEIZED` event: emitted when a faction's control crosses the dominance threshold (≥60) on a tile, displacing the prior dominant faction.
- Add `FACTION_NPC_LOYALTY_SHIFTED` event: emitted when the dominant faction on a tile changes and NPC faction-lean flips to match.
- Add `FactionControlProjection`: projects `FACTION_TILE_SEIZED` into a queryable map of `tileId → dominantFactionId`, replays from EventLog.
- Wire the `areaStateEngine` dominant-faction transition into the EventLog path so changes are permanent and replayable.
- Add chronicle narration for faction seizure and NPC loyalty shift events.
- Expose player consequence: `getSnapshot()` includes `playerFactionTerritories` — tiles where the player's faction is dominant — so the player can watch their faction's footprint grow or shrink.

## Capabilities

### New Capabilities
- `faction-conflict`: Defines the faction dominance threshold, `FACTION_TILE_SEIZED` and `FACTION_NPC_LOYALTY_SHIFTED` event contracts, `FactionControlProjection`, and player faction territory snapshot field.

### Modified Capabilities
- `npc-humanity-ai-memory`: NPC loyalty-shift events must be included in `consultsEventTypes` for grounded NPC dialog about faction allegiance.

## Impact

- `packages/server/src/kernel/livingWorldCommands.ts` — add `FACTION_TILE_SEIZED`, `FACTION_NPC_LOYALTY_SHIFTED` to registry + validators
- `packages/server/src/projections/factionControl.ts` — new projection file
- `packages/server/src/sim/areaStateEngine.ts` — emit seizure intent when dominant faction transitions
- `packages/server/src/sim/runtime.ts` — wire planner, project events, boot hydration
- `packages/server/src/kernel/chronicleRenderer.ts` — narration for new events
- `packages/server/src/http/world.ts` — expose `playerFactionTerritories` in snapshot
