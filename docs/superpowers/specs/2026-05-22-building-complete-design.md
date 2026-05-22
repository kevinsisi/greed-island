# Building Complete — Design Spec

**Date:** 2026-05-22  
**Status:** Approved, pending implementation plan  
**Next phase:** NPC-as-agent (thinking / research / culture)

---

## Scope

Four tightly coupled sub-systems shipped as one OpenSpec change:

1. **Terrain Layer** — 5 non-water biome masks + shared semantic types + speed modifiers
2. **Building Lifecycle** — states, new commands, BuildingStateProjection
3. **NPC Work Visibility** — occupant activity shown inside BuildingPage
4. **Building Visual States** — glyph/color driven by lifecycle state

---

## 1. Terrain Layer

### Shared Semantic Terrain Types

All non-water biomes share this vocabulary (existing water types unchanged):

| Type | Speed Modifier | Description |
|------|---------------|-------------|
| `open` | 1.0× | Clear ground (grass, open ruin, sand flats) |
| `rough` | 0.75× | Difficult terrain (undergrowth, rubble, dunes) |
| `path` | 1.15× | Trail or paved corridor |
| `blocked` | impassable | Cliff, dense forest, collapsed wall |
| `building` | impassable | Dynamic overlay from building catalog |

Existing water types (`land`, `pier`, `shore`, `shallow_water`, `open_water`) are unchanged.

### Per-Biome Hand-Authored Masks (15×10 ASCII)

Each biome has a mask string array in `terrainMask.ts`. Glyph-to-type mapping per biome:

| Biome | Palette | `blocked` source |
|-------|---------|-----------------|
| `forest` | clearing / undergrowth / dense trees | dense forest clusters |
| `mountain` | rocky path / steep / cliff | cliff faces |
| `desert` | sand / dune / hardpan | boulder outcrops |
| `ruin` | open ruin / rubble / collapse | collapsed wall sections |
| `grass` | field / mud / trail | none (fully walkable) |

### Building Dynamic Overlay

Buildings are NOT written into the static mask. They are overlaid at runtime:

```typescript
function effectiveTerrainAt(
  tileId: string,
  col: number,
  row: number,
  buildings: readonly { col: number; row: number; state: BuildingState }[]
): LandTerrain {
  const b = buildings.find(b => b.col === col && b.row === row)
  if (b) return b.state === 'abandoned' ? 'rough' : 'building'
  return staticTerrainAt(tileId, col, row)
}
```

Abandoned buildings degrade to `rough` (can be traversed as ruins). All other states are `building` (impassable).

### Speed Modifier Application

Player only (frontend `AreaScene.ts`):
```typescript
const mod = TERRAIN_SPEED[effectiveTerrain]  // lookup table
this.player.setVelocity(vx * PLAYER_SPEED * mod, vy * PLAYER_SPEED * mod)
```

NPC `crossTileRouteTicks` speed modifiers deferred to NPC-agent phase.

### NPC Dispersal — Terrain Aware

`npcEngine.ts` `dispersedSubAnchor()` and `subAnchor()` must only place NPCs on walkable cells. The server needs access to terrain data:

- Export `walkableCellsForTile(tileId, buildings)` from `terrainMask.ts` — returns `{col, row}[]` of all non-blocked, non-building cells
- `npcEngine.ts` calls this once per tile per tick (cached), filters candidate sub-anchors to walkable set before selection

---

## 2. Building Lifecycle

### States

```typescript
type BuildingState =
  | 'under_construction'  // project initiated, not yet complete
  | 'operational'         // normal (default for catalog static buildings)
  | 'damaged'             // health < 50 or post-combat
  | 'abandoned'           // no NPC activity for threshold ticks
```

### New Command Types

Added to `livingWorldCommands.ts`:

```typescript
BUILDING_DAMAGED: {
  buildingId: string
  tileId: string
  health: number          // 0–100, clamped
  cause: 'combat' | 'neglect'
}

BUILDING_REPAIRED: {
  buildingId: string
  tileId: string
  health: number
  repairedByNpcId: string
}

BUILDING_ABANDONED: {
  buildingId: string
  tileId: string
  lastActivityTick: number
}
```

`BUILDING_UPGRADED` deferred to NPC-agent / research phase.

### BuildingStateProjection

New projection in `packages/server/src/projections/buildingState.ts`:

```typescript
type BuildingStateRow = {
  buildingId: string
  tileId: string
  state: BuildingState
  health: number           // 0–100, default 100
  lastActivityTick: number
}
```

Event reduce rules:
- `BUILDING_CONSTRUCTED` → `operational`, health = 100
- `BUILDING_DAMAGED` → `damaged`, health = payload.health
- `BUILDING_REPAIRED` → `operational`, health = payload.health
- `BUILDING_ABANDONED` → `abandoned`

Default (no event): `operational`, health = 100 — applies to all catalog static buildings.

Boot hydration: selective from `['BUILDING_CONSTRUCTED', 'BUILDING_DAMAGED', 'BUILDING_REPAIRED', 'BUILDING_ABANDONED']`.

### Runtime Triggers

| Trigger | Emits | Health delta |
|---------|-------|-------------|
| `FACTION_TILE_SEIZED` accepted → buildings on that tile | `BUILDING_DAMAGED` cause=combat | −30, clamp 0 |
| NPC `domain: 'build'` productive action in building | `BUILDING_REPAIRED` | +5, clamp 100 |
| Cadence check: building with no NPC for N ticks | `BUILDING_ABANDONED` | — |

Cadence constant: `BUILDING_ABANDONMENT_TICKS = TICKS_PER_HOUR * 48` (2 in-world days).

---

## 3. NPC Work Visibility (BuildingPage only)

No changes to `AreaScene.ts`.

### Server: Occupant Response Extension

`GET /api/building/:id` occupant list gains two fields:

```typescript
type BuildingOccupantView = {
  npcId: string
  nameZh: string
  activity: NpcActivity
  domain?: ProductiveActionDomain  // from last NPC_PRODUCTIVE_ACTION
  narration?: string               // last productive action narration (tooltip)
}
```

Source: `NpcStateProjection` last-known state + last productive action payload. No new projection needed.

### Frontend: BuildingPage Display

```
安德烈     工作中 · 建造
古伊        交易中
米拉        學習中 · 正在研究地脈層礦物
（空）      無人在場
```

- `activity === 'work'` and `domain` present → show domain label
- Other activities → show activity label only
- `narration` as tooltip or second-line small text

---

## 4. Building Visual States

### AreaScene Glyph Rules

| State | Glyph | Label Color |
|-------|-------|-------------|
| `under_construction` | 🚧 | `#f5c518` yellow |
| `operational` | catalog glyph | `#ffffff` white (unchanged) |
| `damaged` | catalog glyph + `⚠️` overlay | `#e05a2b` orange-red |
| `abandoned` | 🏚 | `#888888` gray |

Construction progress bar: thin rectangle below glyph, width = `progress% × AREA_TILE_SIZE`.

### Data Flow

`GET /api/area/:tileId` building list gains `state`, `health`, `constructionProgress?` from `BuildingStateProjection`.

Final `AreaMapBuilding` type:

```typescript
type AreaMapBuilding = {
  // existing
  id: string; nameZh: string; type: string
  col: number; row: number; glyph: string; size: number; enterable: boolean
  // new
  state: BuildingState
  health: number
  constructionProgress?: number  // 0–100, only when under_construction
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/server/src/projections/buildingState.ts` | BuildingStateProjection |
| `packages/server/src/projections/buildingState.test.ts` | Projection unit tests |

## Files to Modify

| File | Change |
|------|--------|
| `packages/web/src/game/terrainMask.ts` | New terrain types, 5 biome masks, effectiveTerrainAt, walkableCellsForTile |
| `packages/server/src/kernel/livingWorldCommands.ts` | BUILDING_DAMAGED, BUILDING_REPAIRED, BUILDING_ABANDONED |
| `packages/server/src/sim/runtime.ts` | BuildingStateProjection field, fan-out, boot hydration, trigger logic |
| `packages/server/src/sim/npcEngine.ts` | dispersedSubAnchor/subAnchor terrain-aware filtering |
| `packages/web/src/game/AreaScene.ts` | effectiveTerrainAt usage, speed modifier, visual states |
| `packages/web/src/api/client.ts` | AreaMapBuilding + BuildingOccupantView type extension |
| `packages/web/src/pages/AreaPage.tsx` | Pass state/health to AreaScene mapBuildings |
| `packages/web/src/pages/BuildingPage.tsx` | Occupant domain + narration display |
| `packages/server/src/http/areaRouter.ts` | Inject state/health into building response |
| `packages/server/src/http/buildingRouter.ts` | Inject domain/narration into occupant response |

---

## Architecture Constraints

- All state changes via Command → Rule Engine → Event → Projection pipeline
- `effectiveTerrainAt` is a pure function; no side effects
- AI is read-only narrator; no AI involvement in building lifecycle decisions
- `walkableCellsForTile` result cached per tick per tile in npcEngine to avoid N² cost

---

## Next Phase (not in this change)

NPC-as-agent: autonomous thinking, research mechanics with real outcomes, cultural behaviors. Each NPC becomes a first-class agent with memory, goals, and decision autonomy.
