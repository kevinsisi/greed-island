# Design — District Sub-tile Terrain (Sprint 4)

## Principle alignment

- **Player perception**: the visual layer must read honestly. People
  appearing on open water break that contract. This slice closes the
  visual gap without renegotiating the server-side semantics.
- **ARCHITECTURE.md §0 Read-only renderer**: the client may add
  rendering rules and player-movement guards over the existing
  server-authoritative state; it must not invent new world facts.
- **Part I §6 Ecosystem Vision**: a "carmine port" district carries
  piers, decks and shallow water — not an empty sea.

## Architecture

```
AreaScene.create()
    │
    ├── drawBackground()
    │       └── for each (col,row):
    │              terrain = terrainMaskForDistrict(tileId)?.[row][col] ?? 'land'
    │              fill cell with COLOR_FOR_TERRAIN[terrain]
    │
    ├── spawnPlayer() / setupInput()
    │       └── isAreaWalkable(x, y) gates physics + pointer target
    │             - falls back to true for land districts (no mask)
    │             - returns false on open_water cells
    │
    └── spawnNpcs()
            └── if terrain at NPC's subCol/subRow === 'open_water':
                   sprite.alpha = 0.85
                   add ⛵ emoji overlay above the name label
```

## Decision log

### D1 — String-row blueprint per district
**Chose**: each district's mask is encoded as `string[]` (one row per
`AREA_GRID_ROWS`), one character per cell, with a glyph→terrain map.

**Why**: easy to read and edit in the source file; auditable diff.
No need for JSON resource files or assets at this stage.

### D2 — Player movement blocked by `open_water` only
**Chose**: only `open_water` is unwalkable. `shallow_water` is
walkable (knee-deep wading) so the player can still reach the dock
edge.

**Why**: gives the player a "step in but stop at the rope" feel
without locking access to the iconic pier rail.

### D3 — NPC sprites stay at server-given sub-cells
**Chose**: do not snap NPC sprites to nearest walkable cell.

**Why**: snapping would invent positional state not in the EventLog,
violating "AI is a read-only renderer". Instead, show a visual hint
(boat emoji + alpha) that the NPC is fishing from offshore. Future
slice can gate server sub-cell selection with the mask.

### D4 — Three water districts have their own mask shape
**Chose**: hand-author the three water-biome masks instead of a
procedural function.

**Why**: the macro-tile geography differs (port-with-pier vs
salt-marsh outer ring vs neon harbor). Hand-authored masks read
honestly. Procedural generation can come later when more districts
adopt sub-tile terrain.

### D5 — Default of `'land'` for unmaskable districts
**Chose**: `terrainMaskForDistrict()` returns `null` for the 5 land
districts; AreaScene treats `null` as "full land" and keeps the
existing single-color path.

**Why**: zero behavior change for land districts. Reviewer can
visually confirm that forests, mountains, ruins, deserts and the
central plaza all render exactly as before.

## Determinism notes

- The mask is a pure literal; no RNG; no per-tick state.
- Player movement gate is a deterministic boolean over the mask;
  same input always produces the same result.
- NPC sprite alpha / emoji overlay is a deterministic function of
  the server-given sub-cell coords + the mask. Replays produce the
  same visuals.

## Failure modes & guards

- **Mask row width mismatch**: a defensive runtime check in
  `terrainMaskForDistrict` verifies that each district's mask has
  exactly `AREA_GRID_ROWS` rows of `AREA_GRID_COLS` chars; mismatch
  falls back to "all land" so the game stays playable.
- **Player at boundary of open_water**: physics already collides
  with canvas bounds; the walkability gate joins the same code path
  via `setVelocity(0,0)` on the offending axis.
- **NPC sub-cell beyond mask**: out-of-bounds cells are treated as
  `'land'` (no overlay).

## Testing strategy

- Pure helper tests on `terrainMaskForDistrict` + `isWalkableTerrain`
  for the three water districts.
- AreaScene rendering tests cannot easily exercise Phaser, but the
  walkability helper is fully testable.

## Rollout

- Version bump v0.22.0 → v0.23.0.
- No data migration.
- Backward compatible — older clients still see the flat color
  block; new clients see the textured mask.
