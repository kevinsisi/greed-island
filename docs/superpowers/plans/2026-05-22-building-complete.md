# Building Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land terrain masks for all 6 non-water tiles, building lifecycle states (under_construction / operational / damaged / abandoned), NPC occupant activity visible in BuildingPage, and building visual states in AreaScene.

**Architecture:** Static hand-authored terrain masks per tile + dynamic building overlay via `effectiveTerrainAt()`; `BuildingStateProjection` tracks lifecycle from EventLog; NPC dispersal filters to walkable cells; AreaScene uses glyph/color per state.

**Tech Stack:** TypeScript, Vitest, Phaser 3, SQLite EventLog

---

## File Map

**Create:**
- `packages/server/src/projections/buildingState.ts` — BuildingStateProjection
- `packages/server/src/projections/buildingState.test.ts` — unit tests

**Modify:**
- `packages/web/src/game/terrainMask.ts` — new types, 6 tile masks, effectiveTerrainAt, walkableCellsForTile
- `packages/server/src/kernel/livingWorldCommands.ts` — 3 new command types
- `packages/server/src/sim/runtime.ts` — projection wiring + triggers
- `packages/server/src/sim/npcEngine.ts` — terrain-aware dispersal
- `packages/server/src/http/areaRouter.ts` — inject state/health into building list
- `packages/server/src/http/buildingRouter.ts` — inject domain/narration into occupant list
- `packages/web/src/api/client.ts` — extend AreaMapBuilding + BuildingOccupantView types
- `packages/web/src/pages/AreaPage.tsx` — pass state/health to AreaScene
- `packages/web/src/game/AreaScene.ts` — terrain rendering, speed modifier, building visual states
- `packages/web/src/pages/BuildingPage.tsx` — occupant domain + narration display

---

## Task 1: Terrain types + speed table in terrainMask.ts

**Files:**
- Modify: `packages/web/src/game/terrainMask.ts`

- [ ] **Step 1: Add land terrain types and speed table**

Open `packages/web/src/game/terrainMask.ts`. After the existing `SubcellTerrain` type and `COLOR_FOR_TERRAIN`, add:

```typescript
// Land terrain types (non-water biomes)
export type LandTerrain = 'open' | 'rough' | 'path' | 'blocked' | 'building'

// All terrain types combined
export type AnyTerrain = SubcellTerrain | LandTerrain

export const TERRAIN_SPEED_MODIFIER: Readonly<Record<AnyTerrain, number>> = {
  // water types (player can't enter open_water)
  land: 1.0,
  pier: 1.0,
  shore: 0.9,
  shallow_water: 0.7,
  open_water: 0,
  // land types
  open: 1.0,
  rough: 0.75,
  path: 1.15,
  blocked: 0,
  building: 0,
}

export const LAND_COLOR_FOR_TERRAIN: Readonly<Record<LandTerrain, number>> = {
  open: 0x6b8a4b,      // muted green
  rough: 0x7a6a3a,     // earthy brown
  path: 0x9a8a6a,      // pale ochre
  blocked: 0x2a2a2a,   // near-black
  building: 0x3a3a3a,  // dark grey (hidden under building sprite)
}

export function isWalkableLand(t: LandTerrain): boolean {
  return t !== 'blocked' && t !== 'building'
}
```

- [ ] **Step 2: Write failing test for speed table**

Create `packages/web/src/game/terrainMask.test.ts` (if it doesn't exist) and add:

```typescript
import { describe, it, expect } from 'vitest'
import { TERRAIN_SPEED_MODIFIER, isWalkableLand } from './terrainMask'

describe('terrain speed modifiers', () => {
  it('open is full speed', () => {
    expect(TERRAIN_SPEED_MODIFIER.open).toBe(1.0)
  })
  it('rough is 0.75x', () => {
    expect(TERRAIN_SPEED_MODIFIER.rough).toBe(0.75)
  })
  it('path is 1.15x', () => {
    expect(TERRAIN_SPEED_MODIFIER.path).toBe(1.15)
  })
  it('blocked and building are impassable', () => {
    expect(TERRAIN_SPEED_MODIFIER.blocked).toBe(0)
    expect(TERRAIN_SPEED_MODIFIER.building).toBe(0)
  })
  it('isWalkableLand returns false for blocked and building', () => {
    expect(isWalkableLand('blocked')).toBe(false)
    expect(isWalkableLand('building')).toBe(false)
    expect(isWalkableLand('open')).toBe(true)
    expect(isWalkableLand('rough')).toBe(true)
    expect(isWalkableLand('path')).toBe(true)
  })
})
```

- [ ] **Step 3: Run test — verify pass**

```
npx vitest run packages/web/src/game/terrainMask.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 4: Commit**

```
git add packages/web/src/game/terrainMask.ts packages/web/src/game/terrainMask.test.ts
git commit -m "feat(terrain): LandTerrain types, speed modifiers, isWalkableLand"
```

---

## Task 2: 6 biome masks + effectiveTerrainAt + walkableCellsForTile

Building positions by tile (from `packages/server/src/buildings/catalog.ts`):
- **t_forest**: (1,3), (13,3)
- **t_mountain**: (4,1)
- **t_desert**: (2,3), (9,3)
- **t_central**: (4,1), (9,8), (4,8), (1,8)
- **t_ruin**: (2,3), (7,3), (1,8)
- **t_dimai**: (7,0), (12,1)

Legend: `o`=open, `r`=rough, `p`=path, `X`=blocked. Each row **must be exactly 15 chars**. Building anchor cells must be `o` or `r` (not `X`).

**Files:**
- Modify: `packages/web/src/game/terrainMask.ts`

- [ ] **Step 1: Add LAND_MASKS constant**

In `terrainMask.ts`, add after the color tables:

```typescript
// Each row: exactly 15 chars. o=open r=rough p=path X=blocked
export const LAND_MASKS: Readonly<Record<string, readonly string[]>> = {

  // t_forest 潮見丘 — dense forest edges, central clearing, winding path
  // buildings: (1,3)=cottage, (13,3)=lookout — both must be 'o'
  t_forest: [
    'XXXXXXXXXXXXXXX', // 0
    'XoooooooooooooX', // 1
    'XooorrooooooooX', // 2
    'oopppooooooopoX', // 3  col1=o(cottage), col13=o(lookout)
    'XoopppooooooooX', // 4
    'XroXXXXXXrooooX', // 5  blocked forest cluster
    'XoooooXXrrooooX', // 6
    'XoooooorroooooX', // 7  VERIFY length=15
    'XrroooooooooooX', // 8
    'XXXXXXXXXXXXXXX', // 9
  ],

  // t_mountain 煙嵐山 — cliffs, rocky ledges, narrow path
  // buildings: (4,1)=dojo — must be 'o'
  t_mountain: [
    'XXXXXoooXXXXXXX', // 0  narrow cliff pass
    'XXXXooopXXXXXXX', // 1  col4=o(dojo), col7=p(path entry)
    'XXrroopppooXXXX', // 2  VERIFY length=15
    'XrrrooopppooooX', // 3
    'XXoopppppoorroX', // 4  VERIFY length=15
    'XXrroooppooXXXX', // 5  VERIFY length=15
    'XrrrooppooooXXX', // 6  VERIFY length=15
    'XoopppooooorrroX', // 7 VERIFY length=15 — trim if needed
    'XoopppooooooooX', // 8
    'XXXXXpppXXXXXXX', // 9  bottom cliff pass
  ],

  // t_desert 潮聲區 — sand flats, dune ridges, rocky outcrops
  // buildings: (2,3)=walkup, (9,3)=forge — both must be 'o'
  t_desert: [
    'ooooooooooooooo', // 0  open flat desert
    'orrrooooooorrrr', // 1
    'ooppooooooooooo', // 2
    'ooooooooooooooo', // 3  col2=o(walkup), col9=o(forge)
    'rrrooooooooorrr', // 4  dune ridges
    'rrrooooooooorrr', // 5
    'oooopppppoooooo', // 6  trail through
    'oooopppppoooooo', // 7
    'orrrroooooorrrr', // 8
    'ooooooooooooooo', // 9
  ],

  // t_central 夜潮區 — urban grass, paths, open plazas
  // buildings: (4,1), (9,8), (4,8), (1,8) — all must be 'o'
  t_central: [
    'ooooooooooooooo', // 0
    'opppoooooooooop', // 1  col4=o(grocer), paths along edge
    'ooopppoooooooop', // 2
    'oooopppppoooooo', // 3
    'ooooooooooooooo', // 4
    'pppoooooooooopp', // 5
    'pppooooooooooop', // 6
    'ooooooooooooooo', // 7
    'opooooooopoooop', // 8  col1=o(guild), col4=o(stall), col9=o(exchange)
    'ooooooooooooooo', // 9
  ],

  // t_ruin 鏽灣區 — collapsed walls, rubble, open ruin floor
  // buildings: (2,3)=pier⚓, (7,3)=archive, (1,8)=forge — all must be 'o'
  t_ruin: [
    'XrrroooooooorrrX', // 0 VERIFY length=15 — trim if 16
    'XoooooooooooooX', // 1
    'XoorroooooorroX', // 2
    'XooooooooooooooX', // 3 VERIFY — col2=o(pier), col7=o(archive)
    'XrrrooooooorrroX', // 4 VERIFY length=15
    'XooooXXXXooooooX', // 5 VERIFY — collapsed section
    'XoooooXXooooooX', // 6
    'XrrooooooooorroX', // 7 VERIFY
    'XooooooooooooooX', // 8 col1=o(forge) VERIFY length=15
    'XrrroooooooorrrX', // 9 VERIFY
  ],

  // t_dimai 地脈層 — underground ruin, ley-line channels, archways
  // buildings: (7,0)=archway◈, (12,1)=tower✧ — both must be 'o'
  t_dimai: [
    'XXXXXXXoXXXXXXX', // 0  col7=o(archway)
    'XrrrrrrooooopXX', // 1  col12=o(tower), col11=p (VERIFY length=15)
    'XrrrrrrroooopoX', // 2
    'XoopppppooorrooX', // 3 VERIFY
    'XoopppppooorrooX', // 4 VERIFY
    'XooooooooooooooX', // 5 VERIFY
    'XrrooooooooooorX', // 6
    'XrrooooooooooorX', // 7
    'XrrooooooooooorX', // 8
    'XXXXXXXXXXXXXXX', // 9
  ],
}
```

> **IMPORTANT:** Every row must be exactly 15 chars. Add this assertion to the test (next step) — it will catch any typos.

- [ ] **Step 2: Write failing tests for masks + helpers**

Add to `packages/web/src/game/terrainMask.test.ts`:

```typescript
import { LAND_MASKS, effectiveTerrainAt, walkableCellsForTile, LandTerrain } from './terrainMask'

describe('LAND_MASKS', () => {
  it('every tile mask has 10 rows of exactly 15 chars', () => {
    for (const [tileId, rows] of Object.entries(LAND_MASKS)) {
      expect(rows.length, `${tileId}: row count`).toBe(10)
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i]!.length, `${tileId} row ${i}`).toBe(15)
      }
    }
  })

  it('building anchor cells are walkable in mask', () => {
    const anchors: [string, number, number][] = [
      ['t_forest', 1, 3], ['t_forest', 13, 3],
      ['t_mountain', 4, 1],
      ['t_desert', 2, 3], ['t_desert', 9, 3],
      ['t_central', 4, 1], ['t_central', 9, 8], ['t_central', 4, 8], ['t_central', 1, 8],
      ['t_ruin', 2, 3], ['t_ruin', 7, 3], ['t_ruin', 1, 8],
      ['t_dimai', 7, 0], ['t_dimai', 12, 1],
    ]
    for (const [tileId, col, row] of anchors) {
      const ch = LAND_MASKS[tileId]?.[row]?.[col]
      expect(['o', 'r', 'p'], `${tileId}(${col},${row})=${ch}`).toContain(ch)
    }
  })
})

describe('effectiveTerrainAt', () => {
  it('returns building for a building anchor cell (non-abandoned)', () => {
    const result = effectiveTerrainAt('t_forest', 1, 3, [{ col: 1, row: 3, state: 'operational' }])
    expect(result).toBe('building')
  })

  it('returns rough for abandoned building', () => {
    const result = effectiveTerrainAt('t_forest', 1, 3, [{ col: 1, row: 3, state: 'abandoned' }])
    expect(result).toBe('rough')
  })

  it('returns static terrain when no building at cell', () => {
    // col 0, row 0 in t_forest = 'X' → blocked
    const result = effectiveTerrainAt('t_forest', 0, 0, [])
    expect(result).toBe('blocked')
  })

  it('returns open for water tile without land mask (falls back to land)', () => {
    // Water tiles use the existing SubcellTerrain system — effectiveTerrainAt returns the water type
    const result = effectiveTerrainAt('t_dock', 0, 0, [])
    expect(result).toBe('land') // t_dock row0 col0 = 'L' → land
  })
})

describe('walkableCellsForTile', () => {
  it('returns only non-blocked, non-building cells', () => {
    const cells = walkableCellsForTile('t_forest', [{ col: 1, row: 3, state: 'operational' }])
    // (1,3) is a building → not included
    expect(cells.find(c => c.col === 1 && c.row === 3)).toBeUndefined()
    // (0,0) is blocked → not included
    expect(cells.find(c => c.col === 0 && c.row === 0)).toBeUndefined()
    // (1,1) is open → included
    expect(cells.find(c => c.col === 1 && c.row === 1)).toBeDefined()
  })
})
```

- [ ] **Step 3: Run tests — verify they fail (functions not yet implemented)**

```
npx vitest run packages/web/src/game/terrainMask.test.ts
```

Expected: FAIL — `effectiveTerrainAt is not a function`, mask length errors if rows are wrong (fix rows first).

- [ ] **Step 4: Fix any mask length errors**

The test output will name the exact `tileId row N` that is the wrong length. Fix those rows in `LAND_MASKS` until the mask length test passes before proceeding.

- [ ] **Step 5: Implement effectiveTerrainAt and walkableCellsForTile**

In `terrainMask.ts`, add after `LAND_MASKS`:

```typescript
const LAND_GLYPH_TO_TERRAIN: Readonly<Record<string, LandTerrain>> = {
  o: 'open',
  r: 'rough',
  p: 'path',
  X: 'blocked',
}

function staticLandTerrainAt(tileId: string, col: number, row: number): LandTerrain {
  const ch = LAND_MASKS[tileId]?.[row]?.[col]
  return (ch ? LAND_GLYPH_TO_TERRAIN[ch] : null) ?? 'open'
}

export function effectiveTerrainAt(
  tileId: string,
  col: number,
  row: number,
  buildings: readonly { col: number; row: number; state: string }[],
): AnyTerrain {
  // Check dynamic building overlay first
  const b = buildings.find(b => b.col === col && b.row === row)
  if (b) return b.state === 'abandoned' ? 'rough' : 'building'

  // Water tiles use existing SubcellTerrain system
  if (LAND_MASKS[tileId] === undefined) {
    const water = terrainAt(tileId, col, row) // existing function
    return water
  }

  return staticLandTerrainAt(tileId, col, row)
}

export function walkableCellsForTile(
  tileId: string,
  buildings: readonly { col: number; row: number; state: string }[],
): readonly { col: number; row: number }[] {
  const result: { col: number; row: number }[] = []
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 15; col++) {
      const t = effectiveTerrainAt(tileId, col, row, buildings)
      if (t !== 'blocked' && t !== 'building' && t !== 'open_water') {
        result.push({ col, row })
      }
    }
  }
  return result
}
```

- [ ] **Step 6: Run tests — verify all pass**

```
npx vitest run packages/web/src/game/terrainMask.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```
git add packages/web/src/game/terrainMask.ts packages/web/src/game/terrainMask.test.ts
git commit -m "feat(terrain): 6 biome masks, effectiveTerrainAt, walkableCellsForTile"
```

---

## Task 3: Building lifecycle commands

**Files:**
- Modify: `packages/server/src/kernel/livingWorldCommands.ts`

- [ ] **Step 1: Add 3 command types to the union array**

Find the line `'BUILDING_CONSTRUCTED',` in the `LIVING_WORLD_COMMAND_TYPES` array and add after it:

```typescript
  'BUILDING_DAMAGED',
  'BUILDING_REPAIRED',
  'BUILDING_ABANDONED',
```

- [ ] **Step 2: Add payload types**

Find the `BuildingConstructedCmd` type (near `BUILDING_CONSTRUCTED` validator) and add after it:

```typescript
export type BuildingDamagedCmd = {
  buildingId: string
  tileId: string
  health: number    // 0–100 clamped
  cause: 'combat' | 'neglect'
}

export type BuildingRepairedCmd = {
  buildingId: string
  tileId: string
  health: number    // 0–100 clamped
  repairedByNpcId: string
}

export type BuildingAbandonedCmd = {
  buildingId: string
  tileId: string
  lastActivityTick: number
}
```

- [ ] **Step 3: Add validators**

In the `COMMAND_VALIDATORS` object, add after the `BUILDING_CONSTRUCTED` validator:

```typescript
  BUILDING_DAMAGED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.health !== 'number' || p.health < 0 || p.health > 100) return 'health must be 0–100'
    if (p.cause !== 'combat' && p.cause !== 'neglect') return 'cause must be combat or neglect'
    return null
  },
  BUILDING_REPAIRED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.health !== 'number' || p.health < 0 || p.health > 100) return 'health must be 0–100'
    if (typeof p.repairedByNpcId !== 'string' || !p.repairedByNpcId) return 'repairedByNpcId required'
    return null
  },
  BUILDING_ABANDONED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.buildingId !== 'string' || !p.buildingId) return 'buildingId required'
    if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
    if (typeof p.lastActivityTick !== 'number') return 'lastActivityTick required'
    return null
  },
```

- [ ] **Step 4: TypeScript check**

```
npx tsc --noEmit -p packages/server/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 5: Run full test suite**

```
npx vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/kernel/livingWorldCommands.ts
git commit -m "feat(building): BUILDING_DAMAGED, BUILDING_REPAIRED, BUILDING_ABANDONED commands"
```

---

## Task 4: BuildingStateProjection

**Files:**
- Create: `packages/server/src/projections/buildingState.ts`
- Create: `packages/server/src/projections/buildingState.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/projections/buildingState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BuildingStateProjection } from './buildingState.js'

function ev(tick: number, eventType: string, data: unknown) {
  return { sequence: tick, eventType, data, tick, submittedAt: 0, actorId: 'system', actorType: 'system' as const }
}

describe('BuildingStateProjection', () => {
  it('returns operational/100 by default for unknown building', () => {
    const proj = new BuildingStateProjection()
    const row = proj.getState('b_unknown')
    expect(row).toEqual({ buildingId: 'b_unknown', tileId: '', state: 'operational', health: 100, lastActivityTick: 0 })
  })

  it('BUILDING_CONSTRUCTED → operational, health 100', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('operational')
    expect(row.health).toBe(100)
  })

  it('BUILDING_DAMAGED → damaged, health set', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_DAMAGED', { buildingId: 'b_x', tileId: 't_forest', health: 40, cause: 'combat' }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('damaged')
    expect(row.health).toBe(40)
  })

  it('BUILDING_REPAIRED → operational, health set', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_DAMAGED', { buildingId: 'b_x', tileId: 't_forest', health: 40, cause: 'combat' }))
    proj.project(ev(3, 'BUILDING_REPAIRED', { buildingId: 'b_x', tileId: 't_forest', health: 85, repairedByNpcId: 'npc-a' }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('operational')
    expect(row.health).toBe(85)
  })

  it('BUILDING_ABANDONED → abandoned', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(5, 'BUILDING_ABANDONED', { buildingId: 'b_x', tileId: 't_forest', lastActivityTick: 4 }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('abandoned')
  })

  it('list() returns all known buildings', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_a', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_CONSTRUCTED', { buildingId: 'b_b', tileId: 't_ruin', projectId: 'p2' }))
    expect(proj.list().length).toBe(2)
  })

  it('getByTile() returns buildings on tile', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_a', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_CONSTRUCTED', { buildingId: 'b_b', tileId: 't_ruin', projectId: 'p2' }))
    expect(proj.getByTile('t_forest').length).toBe(1)
    expect(proj.getByTile('t_ruin').length).toBe(1)
    expect(proj.getByTile('t_mountain').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — verify fail**

```
npx vitest run packages/server/src/projections/buildingState.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement BuildingStateProjection**

Create `packages/server/src/projections/buildingState.ts`:

```typescript
export type BuildingState = 'under_construction' | 'operational' | 'damaged' | 'abandoned'

export type BuildingStateRow = {
  buildingId: string
  tileId: string
  state: BuildingState
  health: number
  lastActivityTick: number
}

export const BUILDING_STATE_BOOT_EVENT_TYPES = [
  'BUILDING_CONSTRUCTED',
  'BUILDING_DAMAGED',
  'BUILDING_REPAIRED',
  'BUILDING_ABANDONED',
] as const

function readString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function readNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

export class BuildingStateProjection {
  private rows = new Map<string, BuildingStateRow>()

  project(event: { eventType: string; data: unknown; tick?: number }): void {
    const data = event.data as Record<string, unknown>
    if (!data) return
    const buildingId = readString(data.buildingId)
    if (!buildingId) return
    const tileId = readString(data.tileId)

    switch (event.eventType) {
      case 'BUILDING_CONSTRUCTED':
        this.rows.set(buildingId, { buildingId, tileId, state: 'operational', health: 100, lastActivityTick: event.tick ?? 0 })
        break
      case 'BUILDING_DAMAGED': {
        const existing = this.rows.get(buildingId)
        this.rows.set(buildingId, {
          buildingId,
          tileId: tileId || existing?.tileId || '',
          state: 'damaged',
          health: Math.max(0, Math.min(100, readNumber(data.health, 50))),
          lastActivityTick: existing?.lastActivityTick ?? 0,
        })
        break
      }
      case 'BUILDING_REPAIRED': {
        const existing = this.rows.get(buildingId)
        this.rows.set(buildingId, {
          buildingId,
          tileId: tileId || existing?.tileId || '',
          state: 'operational',
          health: Math.max(0, Math.min(100, readNumber(data.health, 100))),
          lastActivityTick: event.tick ?? existing?.lastActivityTick ?? 0,
        })
        break
      }
      case 'BUILDING_ABANDONED': {
        const existing = this.rows.get(buildingId)
        this.rows.set(buildingId, {
          buildingId,
          tileId: tileId || existing?.tileId || '',
          state: 'abandoned',
          health: existing?.health ?? 50,
          lastActivityTick: readNumber(data.lastActivityTick, 0),
        })
        break
      }
    }
  }

  getState(buildingId: string): BuildingStateRow {
    return this.rows.get(buildingId) ?? {
      buildingId,
      tileId: '',
      state: 'operational',
      health: 100,
      lastActivityTick: 0,
    }
  }

  getByTile(tileId: string): readonly BuildingStateRow[] {
    return [...this.rows.values()].filter(r => r.tileId === tileId)
  }

  list(): readonly BuildingStateRow[] {
    return [...this.rows.values()]
  }

  rebuildFromEvents(events: readonly { eventType: string; data: unknown; tick?: number }[]): void {
    this.rows.clear()
    for (const ev of events) this.project(ev)
  }
}
```

- [ ] **Step 4: Run tests — verify all pass**

```
npx vitest run packages/server/src/projections/buildingState.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```
git add packages/server/src/projections/buildingState.ts packages/server/src/projections/buildingState.test.ts
git commit -m "feat(building): BuildingStateProjection with lifecycle state tracking"
```

---

## Task 5: Runtime wiring — projection + triggers

**Files:**
- Modify: `packages/server/src/sim/runtime.ts`

- [ ] **Step 1: Import and instantiate BuildingStateProjection**

At the top of `runtime.ts`, add import:

```typescript
import { BuildingStateProjection, BUILDING_STATE_BOOT_EVENT_TYPES, type BuildingState } from '../projections/buildingState.js'
```

In the class field declarations (near `private readonly constructionProjects`), add:

```typescript
private readonly buildingStateProjection = new BuildingStateProjection()
```

- [ ] **Step 2: Wire fan-out loops**

Find both fan-out loops (search for `this.constructionProjects.project(ev)`). After each, add:

```typescript
this.buildingStateProjection.project(ev)
```

- [ ] **Step 3: Wire boot hydration**

Find the large-log boot path (search for `CONSTRUCTION_PROJECT_PROGRESS` in the boot hydration block). In the same else-branch that checks `BUILDING_STATE_BOOT_EVENT_TYPES`, add `...BUILDING_STATE_BOOT_EVENT_TYPES` to the selective boot set, then call `this.buildingStateProjection.project(ev)` for matching events.

Pattern to follow (same as `constructionProjects` boot):
```typescript
if (BUILDING_STATE_BOOT_EVENT_TYPES.includes(ev.eventType as any)) {
  this.buildingStateProjection.project(ev)
}
```

- [ ] **Step 4: Add FACTION_TILE_SEIZED → BUILDING_DAMAGED trigger**

In the accepted-command fan-out section, find where `FACTION_TILE_SEIZED` events are handled. After the existing handling, add:

```typescript
if (ev.eventType === 'FACTION_TILE_SEIZED') {
  const tileId = (ev.data as Record<string, unknown>).tileId as string | undefined
  if (tileId) {
    const allBuildings = [...BUILDINGS.filter(b => b.tileId === tileId),
                         ...this.completedConstructionBuildingDefs().filter(b => b.tileId === tileId)]
    for (const b of allBuildings) {
      const current = this.buildingStateProjection.getState(b.id)
      const newHealth = Math.max(0, current.health - 30)
      commands.push(makeLivingWorldCommand(
        'BUILDING_DAMAGED',
        SIM_ACTOR_WORLD,
        'system',
        nextTick,
        submittedAt,
        { buildingId: b.id, tileId, health: newHealth, cause: 'combat' } satisfies BuildingDamagedCmd,
        `${b.nameZh} 在派系衝突中受損，健康值降至 ${newHealth}。`,
      ))
    }
  }
}
```

You will need to import `BUILDINGS` from the building catalog and `BuildingDamagedCmd` from `livingWorldCommands.ts`.

- [ ] **Step 5: Add NPC build-domain → BUILDING_REPAIRED trigger**

In the `NPC_PRODUCTIVE_ACTION` accepted-event handling block, after the existing handling, add:

```typescript
if (ev.eventType === 'NPC_PRODUCTIVE_ACTION') {
  const d = ev.data as Record<string, unknown>
  if (d.domain === 'build' && typeof d.tile === 'string') {
    // Find any building the NPC is inside on this tile
    const npcId = (ev.data as Record<string, unknown>).npcId as string | undefined
    if (npcId) {
      const buildingId = this.getNpcBuildingId(npcId)
      if (buildingId) {
        const current = this.buildingStateProjection.getState(buildingId)
        if (current.health < 100) {
          const newHealth = Math.min(100, current.health + 5)
          commands.push(makeLivingWorldCommand(
            'BUILDING_REPAIRED',
            npcId,
            'npc',
            nextTick,
            submittedAt,
            { buildingId, tileId: current.tileId, health: newHealth, repairedByNpcId: npcId },
            `建築健康值恢復至 ${newHealth}。`,
          ))
        }
      }
    }
  }
}
```

- [ ] **Step 6: Add abandonment cadence check**

Find where other cadence checks run (e.g., the mortality cadence block). Add a building abandonment check:

```typescript
// Building abandonment: runs every TICKS_PER_HOUR * 48
const BUILDING_ABANDONMENT_TICKS = TICKS_PER_HOUR * 48
if (nextTick % BUILDING_ABANDONMENT_TICKS === 0) {
  const allBuildings = [...BUILDINGS, ...this.completedConstructionBuildingDefs()]
  for (const b of allBuildings) {
    const row = this.buildingStateProjection.getState(b.id)
    if (row.state === 'abandoned') continue  // already abandoned
    // Check if any NPC has been in this building recently
    const hasOccupant = [...this.npcEngine.getAllStates()].some(
      ([, s]) => this.buildingRuntime.isNpcInside(s.id ?? '', b.id, s, this.completedConstructionBuildingDefs())
    )
    if (!hasOccupant && (nextTick - row.lastActivityTick) >= BUILDING_ABANDONMENT_TICKS) {
      commands.push(makeLivingWorldCommand(
        'BUILDING_ABANDONED',
        SIM_ACTOR_WORLD,
        'system',
        nextTick,
        submittedAt,
        { buildingId: b.id, tileId: b.tileId, lastActivityTick: row.lastActivityTick },
        `${b.nameZh} 長期無人使用，已廢棄。`,
      ))
    }
  }
}
```

- [ ] **Step 7: Add public getter**

```typescript
getBuildingState(buildingId: string) {
  return this.buildingStateProjection.getState(buildingId)
}

getBuildingStatesByTile(tileId: string) {
  return this.buildingStateProjection.getByTile(tileId)
}
```

- [ ] **Step 8: TypeScript check + full test run**

```
npx tsc --noEmit -p packages/server/tsconfig.json
npx vitest run
```

Expected: 0 TS errors, all tests pass.

- [ ] **Step 9: Commit**

```
git add packages/server/src/sim/runtime.ts
git commit -m "feat(building): wire BuildingStateProjection + lifecycle triggers in runtime"
```

---

## Task 6: NPC dispersal — terrain-aware

**Files:**
- Modify: `packages/server/src/sim/npcEngine.ts`

The `dispersedSubAnchor` and `subAnchor` functions currently pick any cell in the inner 13×8 range. They need to filter to walkable cells.

- [ ] **Step 1: Import walkableCellsForTile**

The terrain mask module is in `packages/web/`. To avoid a server→web dependency, copy the pure logic into a shared location OR duplicate the essential lookup in npcEngine.

**Chosen approach:** Add a `getWalkableCells(tileId, buildings)` helper to `npcEngine.ts` that directly reads `LAND_MASKS` (duplicate the import for server use — no Phaser dependency).

At the top of `npcEngine.ts`, add:

```typescript
// Minimal land terrain walkability check (mirrors terrainMask.ts logic, no Phaser dep)
const LAND_MASK_SERVER: Readonly<Record<string, readonly string[]>> = {
  t_forest:   [ 'XXXXXXXXXXXXXXX','XoooooooooooooX','XooorrooooooooX','oopppooooooopoX','XoopppooooooooX','XroXXXXXXrooooX','XoooooXXrrooooX','XoooooorroooooX','XrroooooooooooX','XXXXXXXXXXXXXXX' ],
  t_mountain: [ 'XXXXXoooXXXXXXX','XXXXooopXXXXXXX','XXrroopppooXXXX','XrrrooopppooooX','XXoopppppoorroX','XXrroooppooXXXX','XrrrooppooooXXX','XoopppooooorrroX','XoopppooooooooX','XXXXXpppXXXXXXX' ],
  t_desert:   [ 'ooooooooooooooo','orrrooooooorrrr','ooppooooooooooo','ooooooooooooooo','rrrooooooooorrr','rrrooooooooorrr','oooopppppoooooo','oooopppppoooooo','orrrroooooorrrr','ooooooooooooooo' ],
  t_central:  [ 'ooooooooooooooo','opppoooooooooop','ooopppoooooooop','oooopppppoooooo','ooooooooooooooo','pppoooooooooopp','pppooooooooooop','ooooooooooooooo','opooooooopoooop','ooooooooooooooo' ],
  t_ruin:     [ 'XrrroooooooorrrX','XoooooooooooooX','XoorroooooorroX','XooooooooooooooX','XrrrooooooorrroX','XooooXXXXooooooX','XoooooXXooooooX','XrrooooooooorroX','XooooooooooooooX','XrrroooooooorrrX' ],
  t_dimai:    [ 'XXXXXXXoXXXXXXX','XrrrrrrooooopXX','XrrrrrrroooopoX','XoopppppooorrooX','XoopppppooorrooX','XooooooooooooooX','XrrooooooooooorX','XrrooooooooooorX','XrrooooooooooorX','XXXXXXXXXXXXXXX' ],
}

function isLandWalkable(tileId: string, col: number, row: number): boolean {
  const ch = LAND_MASK_SERVER[tileId]?.[row]?.[col]
  if (ch === undefined) return true  // water tiles / unknown = walkable
  return ch !== 'X'
}
```

> **Note:** Keep `LAND_MASK_SERVER` in sync with `LAND_MASKS` in `terrainMask.ts`. If masks change, update both.

- [ ] **Step 2: Add walkable cell cache per tile**

Add a private cache field to `NpcEngine`:

```typescript
private walkableCellCache = new Map<string, readonly {col:number,row:number}[]>()

private getWalkableCellsForTile(
  tileId: string,
  buildings: readonly {col:number, row:number, state: string}[]
): readonly {col:number, row:number}[] {
  // Cache key: tileId + building states (invalidate when buildings change)
  const key = `${tileId}:${buildings.map(b => `${b.col},${b.row},${b.state}`).join('|')}`
  if (this.walkableCellCache.has(key)) return this.walkableCellCache.get(key)!
  const cells: {col:number, row:number}[] = []
  for (let r = SUB_INNER_MIN_ROW; r <= SUB_INNER_MAX_ROW; r++) {
    for (let c = SUB_INNER_MIN_COL; c <= SUB_INNER_MAX_COL; c++) {
      const isBuilding = buildings.some(b => b.col === c && b.row === r && b.state !== 'abandoned')
      if (!isBuilding && isLandWalkable(tileId, c, r)) cells.push({ col: c, row: r })
    }
  }
  this.walkableCellCache.set(key, cells)
  return cells
}
```

- [ ] **Step 3: Update dispersedSubAnchor to use walkable cells**

The `dispersedSubAnchor` function currently computes a grid position mathematically. Refactor it to pick from walkable cells:

```typescript
function dispersedSubAnchor(
  rank: number,
  total: number,
  walkable: readonly {col:number,row:number}[]
): { col: number; row: number } {
  if (walkable.length === 0) return { col: SUB_INNER_MIN_COL, row: SUB_INNER_MIN_ROW }
  // Spread evenly across walkable cells by rank
  const idx = Math.min(rank, walkable.length - 1)
  const step = Math.max(1, Math.floor(walkable.length / Math.max(total, 1)))
  const picked = walkable[(idx * step) % walkable.length]!
  return picked
}
```

Find all call sites of `dispersedSubAnchor(rank, total)` and add the walkable cells parameter. The call site is inside the dispersal loop — compute walkable cells once per tile group:

```typescript
// in the dispersal loop, before the inner rank loop:
const walkable = this.getWalkableCellsForTile(tile, buildingsOnTile)
// then call:
const target = dispersedSubAnchor(rank, total, walkable)
```

You'll need to pass `buildingsOnTile` — this comes from the runtime. Update `NpcEngine.computeNextTick(ctx)` to accept building states from runtime:

```typescript
// In NpcTickContext type (near top of npcEngine.ts), add:
buildingStates: readonly { buildingId: string; tileId: string; col: number; row: number; state: string }[]
```

Then in the runtime's call to `npcEngine.computeNextTick(ctx)`, add:

```typescript
buildingStates: BUILDINGS.map(b => ({
  buildingId: b.id,
  tileId: b.tileId,
  col: b.placement.col,
  row: b.placement.row,
  state: this.buildingStateProjection.getState(b.id).state,
})),
```

- [ ] **Step 4: Update subAnchor for walkable cells**

Similarly update `subAnchor` (used for individual NPC waypoints):

```typescript
function subAnchor(
  npcId: string,
  tile: string,
  activity: NpcActivity,
  tick: number,
  walkable: readonly {col:number,row:number}[]
): { col: number; row: number } {
  if (walkable.length === 0) return { col: SUB_INNER_MIN_COL, row: SUB_INNER_MIN_ROW }
  const refreshIdx = Math.floor(tick / NPC_LOCAL_WAYPOINT_REFRESH_TICKS)
  const h = hashStr(`${npcId}|${tile}|${activity}|${refreshIdx}`)
  return walkable[h % walkable.length]!
}
```

Update all `subAnchor(...)` call sites to pass `walkable`.

- [ ] **Step 5: TypeScript check + full test run**

```
npx tsc --noEmit -p packages/server/tsconfig.json
npx vitest run
```

Expected: 0 TS errors, all tests pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/sim/npcEngine.ts
git commit -m "feat(terrain): NPC dispersal and waypoints respect terrain blocking"
```

---

## Task 7: Area API — inject building state/health

**Files:**
- Modify: `packages/server/src/http/areaRouter.ts`
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Extend AreaMapBuilding type in client.ts**

Find `ServerBuildingDef` or the inline building type returned by the area API. In `packages/web/src/api/client.ts`, find the area response building type and add:

```typescript
// In the building item type returned by GET /api/area/:tileId:
state: 'under_construction' | 'operational' | 'damaged' | 'abandoned'
health: number
constructionProgress?: number  // only when under_construction
```

Also update `AreaMapBuilding` (used by AreaPage.tsx → AreaScene.ts):

```typescript
export type AreaMapBuilding = {
  id: string
  nameZh: string
  type: string
  col: number
  row: number
  glyph: string
  size: number
  enterable: boolean
  state: 'under_construction' | 'operational' | 'damaged' | 'abandoned'
  health: number
  constructionProgress?: number
}
```

- [ ] **Step 2: Inject state into areaRouter.ts**

In `packages/server/src/http/areaRouter.ts`, find the handler that builds the building list. It currently maps from the building catalog/views. Inject state:

```typescript
// Find where buildings are mapped for the response, add:
const bState = runtime.getBuildingStatesByTile(tileId)
const stateMap = new Map(bState.map(s => [s.buildingId, s]))

// In the building mapping:
buildings: allBuildingViews.map(view => {
  const s = stateMap.get(view.def.id)
  // construction progress: check constructionProjects
  const project = runtime.visibleAutonomousConstructionProjects()
    .find(p => p.buildingId === view.def.id && p.completedAtTick === null)
  return {
    ...existingBuildingFields,
    state: s?.state ?? 'operational',
    health: s?.health ?? 100,
    constructionProgress: project
      ? Math.round((project.progress / (project.totalProgress || 1)) * 100)
      : undefined,
  }
})
```

You may need to make `visibleAutonomousConstructionProjects()` public or add a new getter.

- [ ] **Step 3: TypeScript check**

```
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add packages/server/src/http/areaRouter.ts packages/web/src/api/client.ts
git commit -m "feat(building): area API returns building state/health/constructionProgress"
```

---

## Task 8: AreaScene — terrain rendering + speed modifier + building visual states

**Files:**
- Modify: `packages/web/src/game/AreaScene.ts`
- Modify: `packages/web/src/pages/AreaPage.tsx`

- [ ] **Step 1: Update AreaPage to pass state/health to AreaScene**

In `packages/web/src/pages/AreaPage.tsx`, find the `mapBuildings` useMemo:

```typescript
const mapBuildings = useMemo<AreaMapBuilding[]>(() =>
  buildings.map((view) => ({
    id: view.def.id,
    nameZh: view.def.nameZh,
    type: view.def.type,
    col: view.def.placement.col,
    row: view.def.placement.row,
    glyph: view.def.placement.glyph,
    size: view.def.placement.size,
    enterable: view.def.enterable,
    // Add:
    state: (view as any).state ?? 'operational',
    health: (view as any).health ?? 100,
    constructionProgress: (view as any).constructionProgress,
  })),
  [buildings]
)
```

(`view` may already carry `state`/`health` from the API response depending on your client type — remove the `as any` casts once types are aligned.)

- [ ] **Step 2: Update drawBackground() for land terrain**

In `packages/web/src/game/AreaScene.ts`, find `drawBackground()`. After the existing water tile branch, add a land tile branch using the new functions:

```typescript
import { effectiveTerrainAt, TERRAIN_SPEED_MODIFIER, LAND_COLOR_FOR_TERRAIN, type LandTerrain } from './terrainMask'

// In drawBackground():
private drawBackground(): void {
  const def = DISTRICTS[this.tileId] ?? DISTRICTS.t_road
  const g = this.add.graphics()

  const buildingOverlay = this.buildings.map(b => ({
    col: b.col, row: b.row, state: b.state ?? 'operational'
  }))

  for (let row = 0; row < AREA_GRID_ROWS; row++) {
    for (let col = 0; col < AREA_GRID_COLS; col++) {
      const checker = (col + row) % 2 === 0
      const terrain = effectiveTerrainAt(this.tileId, col, row, buildingOverlay)

      let fill: number
      if (terrain === 'land' || terrain === 'pier' || terrain === 'shore' ||
          terrain === 'shallow_water' || terrain === 'open_water') {
        // Water tiles: existing logic
        const base = COLOR_FOR_TERRAIN[terrain as SubcellTerrain]
        fill = checker ? base : darken(base, 0x101010)
      } else {
        // Land tiles: new logic
        const base = LAND_COLOR_FOR_TERRAIN[terrain as LandTerrain]
        fill = checker ? base : darken(base, 0x080808)
      }

      g.fillStyle(fill, 1)
      g.fillRect(col * AREA_TILE_SIZE, row * AREA_TILE_SIZE, AREA_TILE_SIZE, AREA_TILE_SIZE)
      g.strokeRect(col * AREA_TILE_SIZE, row * AREA_TILE_SIZE, AREA_TILE_SIZE, AREA_TILE_SIZE)
    }
  }
}
```

- [ ] **Step 3: Apply speed modifier to player movement**

Find `handleMovement()` in `AreaScene.ts`. Add speed modifier lookup:

```typescript
// After computing vx, vy (before setVelocity):
const playerCol = Math.floor(this.player.x / AREA_TILE_SIZE)
const playerRow = Math.floor(this.player.y / AREA_TILE_SIZE)
const currentTerrain = effectiveTerrainAt(this.tileId, playerCol, playerRow, buildingOverlay)
const speedMod = TERRAIN_SPEED_MODIFIER[currentTerrain] ?? 1.0

this.player.setVelocity((vx / len) * PLAYER_SPEED * speedMod, (vy / len) * PLAYER_SPEED * speedMod)
```

Store `buildingOverlay` as a class field updated whenever buildings change (set in `spawnBuildings()` and `updateBuildings()`).

- [ ] **Step 4: Update isAreaWalkable to use effectiveTerrainAt**

Replace the existing `isAreaWalkable` implementation:

```typescript
private isAreaWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= AREA_CANVAS_WIDTH || y >= AREA_CANVAS_HEIGHT) return false
  const col = Math.floor(x / AREA_TILE_SIZE)
  const row = Math.floor(y / AREA_TILE_SIZE)
  const terrain = effectiveTerrainAt(this.tileId, col, row, this.buildingOverlay)
  return terrain !== 'open_water' && terrain !== 'blocked' && terrain !== 'building'
}
```

- [ ] **Step 5: Update spawnBuildings() for visual states**

In `spawnBuildings()`, replace the fixed glyph rendering:

```typescript
private spawnBuildings(): void {
  this.buildingOverlay = this.buildings.map(b => ({ col: b.col, row: b.row, state: b.state ?? 'operational' }))

  for (const b of this.buildings) {
    const cx = b.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
    const cy = b.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
    const state = b.state ?? 'operational'

    // Glyph: state-driven
    const glyph = state === 'under_construction' ? '🚧'
                : state === 'abandoned'           ? '🏚'
                : b.glyph  // operational or damaged: use catalog glyph

    const labelColor = state === 'under_construction' ? '#f5c518'
                     : state === 'damaged'            ? '#e05a2b'
                     : state === 'abandoned'           ? '#888888'
                     : '#ffffff'

    const sprite = this.add.text(cx, cy, glyph, {
      fontSize: `${b.size + 4}px`,
      stroke: '#0a0a0a',
      strokeThickness: 3,
    }).setOrigin(0.5)

    // Damaged overlay
    if (state === 'damaged') {
      this.add.text(cx + b.size * 0.4, cy + b.size * 0.4, '⚠️', { fontSize: '12px' }).setOrigin(0.5)
    }

    // Name label
    this.add.text(cx, cy + b.size * 0.7, b.nameZh, {
      fontSize: '10px', color: labelColor,
    }).setOrigin(0.5, 0)

    // Construction progress bar
    if (state === 'under_construction' && b.constructionProgress !== undefined) {
      const barW = AREA_TILE_SIZE
      const barH = 4
      const bg = this.add.rectangle(cx, cy + b.size * 0.9, barW, barH, 0x333333).setOrigin(0.5, 0)
      const fill = this.add.rectangle(
        cx - barW / 2, cy + b.size * 0.9,
        barW * (b.constructionProgress / 100), barH, 0xf5c518
      ).setOrigin(0, 0)
    }

    // Hit rect (unchanged)
    const hitRect = this.add.rectangle(cx, cy, AREA_TILE_SIZE * 1.5, AREA_TILE_SIZE * 1.5, 0, 0)
    hitRect.setInteractive()
    // ... existing interaction logic
  }
}
```

- [ ] **Step 6: Web TypeScript check**

```
npx tsc --noEmit -p packages/web/tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 7: Web build check**

```
npm run build:web
```

Expected: clean (existing chunk-size warning is OK).

- [ ] **Step 8: Commit**

```
git add packages/web/src/game/AreaScene.ts packages/web/src/pages/AreaPage.tsx
git commit -m "feat(terrain): AreaScene renders biome terrain, speed modifiers, building visual states"
```

---

## Task 9: Building API — occupant domain + narration

**Files:**
- Modify: `packages/server/src/http/buildingRouter.ts`
- Modify: `packages/web/src/api/client.ts`

- [ ] **Step 1: Extend client type**

In `packages/web/src/api/client.ts`, find the building occupant type and add:

```typescript
export type BuildingOccupantView = {
  npcId: string
  nameZh: string
  activity: string
  domain?: string       // 'build' | 'learn' | 'trade' | 'service'
  narration?: string    // last productive action narration, shown as tooltip
}
```

- [ ] **Step 2: Inject domain + narration in buildingRouter.ts**

In `packages/server/src/http/buildingRouter.ts`, find where occupants are mapped. Add domain/narration from NPC state:

```typescript
// For each occupant NPC:
const npcState = runtime.getNpcState(npc.id)  // use existing public getter or add one
const lastProductive = runtime.getLastProductiveAction(npc.id)  // add this getter (see below)

occupants: occupantNpcs.map(npc => ({
  npcId: npc.id,
  nameZh: npc.nameZh,
  activity: runtime.getNpcActivity(npc.id) ?? 'idle',
  domain: lastProductive?.domain ?? undefined,
  narration: lastProductive?.narration ?? undefined,
}))
```

- [ ] **Step 3: Add getLastProductiveAction to runtime**

In `runtime.ts`, the NPC engine already tracks the last productive action in `NpcStateProjection`. Add a public getter:

```typescript
getLastProductiveAction(npcId: string): { domain: string; narration: string } | null {
  const state = this.npcStateProjection.getByNpcId(npcId)
  if (!state?.lastProductiveDomain) return null
  return { domain: state.lastProductiveDomain, narration: state.lastProductiveNarration ?? '' }
}
```

Check `NpcStateProjection` for what fields it tracks. If `lastProductiveDomain` doesn't exist, add it: in `NpcStateProjection.project()`, for `NPC_PRODUCTIVE_ACTION` events, store `domain` and `narration` from the payload.

- [ ] **Step 4: TypeScript check**

```
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/web/tsconfig.json
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/http/buildingRouter.ts packages/web/src/api/client.ts packages/server/src/sim/runtime.ts
git commit -m "feat(building): occupant domain and narration in building API"
```

---

## Task 10: BuildingPage — occupant activity display

**Files:**
- Modify: `packages/web/src/pages/BuildingPage.tsx`

- [ ] **Step 1: Update occupant rendering**

Find the occupant list in `BuildingPage.tsx`. Replace simple name list with:

```tsx
const DOMAIN_LABEL: Record<string, string> = {
  build: '建造',
  learn: '學習',
  trade: '交易',
  service: '服務',
}

const ACTIVITY_LABEL: Record<string, string> = {
  work: '工作中',
  sleep: '休息中',
  eat: '用餐中',
  idle: '待機',
  trade: '交易中',
  patrol: '巡邏中',
  move: '移動中',
}

// In JSX, replace existing occupant rows:
{occupants.length === 0 ? (
  <p className="text-sm text-gray-400">無人在場</p>
) : (
  <ul className="space-y-1">
    {occupants.map(occ => (
      <li key={occ.npcId} className="flex items-baseline gap-2 text-sm" title={occ.narration ?? ''}>
        <span className="font-medium text-white">{occ.nameZh}</span>
        <span className="text-gray-400">
          {ACTIVITY_LABEL[occ.activity] ?? occ.activity}
          {occ.domain && occ.activity === 'work' && ` · ${DOMAIN_LABEL[occ.domain] ?? occ.domain}`}
        </span>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 2: Web build check**

```
npm run build:web
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git add packages/web/src/pages/BuildingPage.tsx
git commit -m "feat(building): BuildingPage shows NPC occupant activity and domain"
```

---

## Task 11: Full verification + memory update

- [ ] **Step 1: Full test suite**

```
npx tsc --noEmit && npx vitest run
```

Expected: 0 TS errors, all tests pass (≥782 + new tests).

- [ ] **Step 2: Docker smoke test (optional but recommended)**

```
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml down
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml up -d --build
curl -s http://127.0.0.1:8100/healthz
```

Visit an area tile in browser: confirm terrain colors appear, buildings show correct state glyphs, player slows on rough terrain.

- [ ] **Step 3: Push**

```
git push
```

- [ ] **Step 4: Update PROGRESS.md**

Bump version to `0.49.0`. Record:
- What shipped
- Verification evidence (test count, TS clean)
- Next: NPC-agent phase (autonomous thinking, research, culture)

- [ ] **Step 5: Update memory**

Save project memory: v0.49.0 ships terrain + building lifecycle. Next phase is NPC-as-agent (each NPC is a true agent with memory, goals, decision autonomy, research outcomes).
