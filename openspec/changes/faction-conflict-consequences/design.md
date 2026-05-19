## Context

Four factions (`tide_hunters`, `free_runners`, `guild`, `civilian`) each maintain a 0–100 influence score per tile in `AreaState.factionControl`. The `areaStateEngine` recalculates this in-memory each tick as NPCs move and act. When a faction exceeds ~60 it becomes dominant and generates a `WorldAgendaDirective`. However, dominance transitions are never stamped into the EventLog — they are ephemeral. On restart, the control map re-initialises from zero. A player who joins a faction via `PLAYER_JOINED_FACTION` has their `factionIds[]` tracked, but that list has no observable consequence anywhere in the world.

## Goals / Non-Goals

**Goals:**
- Stamp `FACTION_TILE_SEIZED` into the EventLog whenever the dominant faction on a tile changes (threshold: control ≥ 60 and strictly higher than all rivals).
- Stamp `FACTION_NPC_LOYALTY_SHIFTED` when an NPC's faction-lean flips because their tile changed dominant faction.
- Add `FactionControlProjection` that rebuilds dominance map from EventLog on boot — making faction territory replay-safe.
- Expose `playerFactionTerritories: string[]` in the world snapshot (tile IDs where the player's factions are dominant).
- Add chronicle narration for both new event types.

**Non-Goals:**
- No player action to directly attack or challenge a faction (that is Phase 5 Card combat / Phase 6 player actions).
- No economic or resource consequences from seizure (requires Phase 2 Goods).
- No UI changes to the frontend (snapshot field is exposed; existing PlayerCivilizationPanel reads it).

## Decisions

**Decision: Seizure detection in `areaStateEngine`, not a separate planner**
The `areaStateEngine.tick()` already computes `dominantFaction` each tick. Add a comparison with previous dominant faction; if it changed, emit a `FACTION_TILE_SEIZED` intent. This keeps the detection co-located with the data.
Alternative: a separate `factionConflictPlanner.ts`. Rejected — adds indirection with no benefit since the data is already computed in `areaStateEngine`.

**Decision: Dominance threshold = 60, hysteresis buffer = 5**
A faction seizes when control ≥ 60 and leads all rivals by ≥ 5 points. This prevents rapid oscillation if two factions sit at 60/58. The `WorldAgendaDirective` already uses 60 as its trigger, so we keep constants consistent.

**Decision: `FactionControlProjection` is a new projection file, not added to `AreaState`**
`AreaState` is a tick-level ephemeral working surface; it should not be the EventLog projection. `FactionControlProjection` projects `FACTION_TILE_SEIZED` only, is boot-hydrated from the EventLog's large-log else-branch, and exposes `dominantFactionOf(tileId): FactionId | null`.

**Decision: `FACTION_NPC_LOYALTY_SHIFTED` is emitted when NPC's tile changes dominant faction AND NPC's existing `factionLean` does not already match new dominant**
This prevents churning loyalty shifts for civilian-aligned NPCs or NPCs whose lean already matches. Only non-civilian faction changes emit this event.

**Decision: `playerFactionTerritories` derived at snapshot time from `FactionControlProjection` + player's `factionIds[]`**
No new projection needed. At `getSnapshot()` time, intersect player's faction membership list with the tiles where those factions are dominant.

## Risks / Trade-offs

**[Risk] First boot has no `FACTION_TILE_SEIZED` events → `FactionControlProjection` starts empty**
→ Mitigation: `FactionControlProjection` returns `null` for unknown tiles; the snapshot sends an empty `playerFactionTerritories` on first boot until seizure events accumulate. This is correct — no territory has been formally contested yet.

**[Risk] areaStateEngine `dominantFaction` is recomputed from NPC positions each tick — adding seizure detection adds one comparison per tick per tile (7 tiles)**
→ Trivial overhead. No mitigation needed.

**[Risk] NPC loyalty shift may happen every time dominant faction changes, spamming the EventLog**
→ Mitigation: Only emit `FACTION_NPC_LOYALTY_SHIFTED` when an NPC's `factionLean` actually differs from new dominant faction, and cap at one emission per NPC per seizure event (guard in planner by checking current lean).
