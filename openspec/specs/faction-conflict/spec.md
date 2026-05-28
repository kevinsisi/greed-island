# faction-conflict Specification

## Purpose
Defines faction territorial dominance: when a faction's control score crosses the dominance threshold on a tile, a `FACTION_TILE_SEIZED` event is committed to the EventLog. NPC loyalty shifts are recorded via `FACTION_NPC_LOYALTY_SHIFTED`. A `FactionControlProjection` makes dominance state replayable, and the player snapshot exposes which tiles their faction controls.

## Requirements

### Requirement: FACTION_TILE_SEIZED SHALL be emitted when a faction crosses the dominance threshold
When `areaStateEngine.tick()` produces a new `dominantFaction` different from the previous dominant faction on a tile, the runtime SHALL emit `FACTION_TILE_SEIZED` with `tileId`, `factionId`, `previousFactionId | null`, `seizedAtTick`. The dominance threshold is control ≥ 60 with a hysteresis buffer of 5 points over all rivals.

#### Scenario: New dominant faction triggers seizure event
- **WHEN** a tile's dominant faction changes from `tide_hunters` to `guild`
- **THEN** `FACTION_TILE_SEIZED` MUST be emitted with `factionId = 'guild'`, `previousFactionId = 'tide_hunters'`, and `tileId` matching the tile

#### Scenario: Dominant faction unchanged does not emit seizure
- **WHEN** `areaStateEngine.tick()` runs and the dominant faction on a tile remains the same
- **THEN** `FACTION_TILE_SEIZED` MUST NOT be emitted for that tile

#### Scenario: First seizure has null previousFactionId
- **WHEN** a tile transitions from no dominant faction (below threshold) to a dominant faction for the first time
- **THEN** `FACTION_TILE_SEIZED` MUST be emitted with `previousFactionId = null`

### Requirement: FactionControlProjection SHALL maintain a replay-safe dominance map
`FactionControlProjection` MUST project `FACTION_TILE_SEIZED` events into `Map<tileId, FactionId>`. It MUST implement `dominantFactionOf(tileId): FactionId | null`, `dominantTilesOf(factionId): readonly string[]`, `rebuildFromEvents(events)`, and `list(): readonly FactionControlRow[]`.

#### Scenario: Projection tracks latest dominant faction per tile
- **WHEN** `FACTION_TILE_SEIZED` events for tile `t1` arrive in sequence (first `guild`, then `tide_hunters`)
- **THEN** `projection.dominantFactionOf('t1')` MUST return `'tide_hunters'`

#### Scenario: Boot hydration restores faction territory
- **GIVEN** the EventLog contains `FACTION_TILE_SEIZED` events
- **WHEN** `FactionControlProjection.rebuildFromEvents(events)` is called
- **THEN** `dominantFactionOf` MUST return the latest dominant faction for each tile

#### Scenario: Unknown tile returns null
- **WHEN** `dominantFactionOf` is called for a tile with no seizure history
- **THEN** the result MUST be `null`

### Requirement: FACTION_NPC_LOYALTY_SHIFTED SHALL be emitted when an NPC's faction-lean diverges from the new dominant
After a `FACTION_TILE_SEIZED` event on a tile, for each NPC currently present on that tile whose `factionLean` differs from the new dominant faction and the new dominant is not `'civilian'`, the runtime SHALL emit `FACTION_NPC_LOYALTY_SHIFTED` with `npcId`, `tileId`, `fromFaction`, `toFaction`, `shiftedAtTick`.

#### Scenario: NPC loyalty shifts when dominant faction changes
- **WHEN** tile `t1` is seized by `guild` and NPC `'npc_trader_1'` on that tile has `factionLean = 'tide_hunters'`
- **THEN** `FACTION_NPC_LOYALTY_SHIFTED` MUST be emitted with `npcId = 'npc_trader_1'`, `fromFaction = 'tide_hunters'`, `toFaction = 'guild'`

#### Scenario: NPC already aligned with new dominant does not shift
- **WHEN** tile `t1` is seized by `guild` and NPC `'npc_smith_1'` already has `factionLean = 'guild'`
- **THEN** `FACTION_NPC_LOYALTY_SHIFTED` MUST NOT be emitted for `npc_smith_1`

#### Scenario: Civilian seizure does not emit loyalty shifts
- **WHEN** tile `t1`'s dominant faction becomes `'civilian'` (below threshold or returning to neutral)
- **THEN** `FACTION_NPC_LOYALTY_SHIFTED` MUST NOT be emitted for any NPC on that tile

### Requirement: The world snapshot SHALL expose playerFactionTerritories
`getSnapshot()` MUST include `playerFactionTerritories: string[]` — the list of tile IDs where at least one of the authenticated player's `factionIds` is the current dominant faction per `FactionControlProjection`.

#### Scenario: Player sees their faction's controlled tiles
- **GIVEN** player has `factionIds = ['guild']` and `guild` is dominant on tiles `['t3', 't5']`
- **WHEN** `getSnapshot()` is called
- **THEN** `playerFactionTerritories` MUST contain `['t3', 't5']`

#### Scenario: Player with no faction membership sees empty list
- **GIVEN** player has `factionIds = []`
- **WHEN** `getSnapshot()` is called
- **THEN** `playerFactionTerritories` MUST be `[]`
