# NPC Memory System: Dialog Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `SqliteNpcMemoryStore` with locality-aware fan-out for 8 new event types, importance-tier decay filtering, and NPC dialog injection — completing Cognitive Runtime Layer 2 Step 4.

**Architecture:** Add `projectWithLocality(event, npcTileMap)` alongside the existing `project()` method (backward compatible), add `formatMemoryContext(npcId, currentTick)` with SQL decay filtering, then wire into the same 4-file dialog injection pattern as v0.50 Belief and v0.52 Reflection.

**Tech Stack:** TypeScript, `better-sqlite3`, vitest, existing `SqliteNpcMemoryStore` (kernel/npcMemory.ts)

---

## File Map

| File | Change |
|---|---|
| `packages/server/src/config/world.ts` | Add 4 decay/limit constants |
| `packages/server/src/kernel/npcMemory.ts` | Add `projectWithLocality()` + `formatMemoryContext()` + helpers |
| `packages/server/src/kernel/npcMemory.test.ts` | Create: ~20 tests for new methods |
| `packages/server/src/npcs/aiDialog.ts` | Add `memoryContext?` to `AiDialogContext` + `buildMemoryBlock()` + inject into prompt |
| `packages/server/src/npcs/aiDialog.test.ts` | Add 3 tests for `buildMemoryBlock` |
| `packages/server/src/sim/runtime.ts` | Add `projectWithLocality` calls + `getFormattedMemoryContext()` getter |
| `packages/server/src/http/npc.ts` | Fill `memoryContext` in dialogCtx |

---

## Task 1: Add World Constants

**Files:**
- Modify: `packages/server/src/config/world.ts`

- [ ] **Step 1: Add 4 constants after `MAX_REFLECTION_CONTEXT_BULLETS`**

Find `MAX_REFLECTION_CONTEXT_BULLETS` (or the last constant before end of file) and add after it:

```typescript
export const MEMORY_DIALOG_MAX_BULLETS = 5
// Decay thresholds: memories older than these tick counts are excluded from dialog context.
// importance >= 9 (permanent) never expires.
export const MEMORY_VERY_HIGH_DECAY_TICKS = 30 * TICKS_PER_DAY  // importance 7–8
export const MEMORY_HIGH_DECAY_TICKS = 7 * TICKS_PER_DAY         // importance 5–6
export const MEMORY_NORMAL_DECAY_TICKS = 2 * TICKS_PER_DAY       // importance 1–4
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```
cd packages/server && npm run build
```

Expected: Build succeeds (these are just constant exports).

- [ ] **Step 3: Commit**

```
git add packages/server/src/config/world.ts
git commit -m "feat(memory): add MEMORY_DIALOG_MAX_BULLETS + decay tick constants"
```

---

## Task 2: Write Failing Tests for `projectWithLocality`

**Files:**
- Create: `packages/server/src/kernel/npcMemory.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/server/src/kernel/npcMemory.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { SqliteNpcMemoryStore } from './npcMemory.js'
import type { Event } from './types.js'

function makeStore() {
  const db = new Database(':memory:')
  return { store: new SqliteNpcMemoryStore(db), db }
}

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  tick = 100
): Event {
  return {
    sequence: 1,
    eventType,
    commandId: 'cmd-1',
    submittedAt: new Date().toISOString(),
    tick,
    payload: {
      actorType: 'npc',
      actorId: 'test-npc',
      data,
      narration: null,
    },
  } as unknown as Event
}

// npcId → tileId
type NpcTileMap = ReadonlyMap<string, string>

describe('SqliteNpcMemoryStore.projectWithLocality', () => {
  it('FACTION_TILE_SEIZED: same-tile NPC gets importance 9 with fear tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 100,
      narration: 'The tide hunters seized the forest.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-guard', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(9)
    expect(rows[0]!.content).toMatchObject({ kind: 'faction.tile_seized', emotionalTag: 'fear' })
  })

  it('FACTION_TILE_SEIZED: adjacent-tile NPC gets importance 7 (9 - 2)', () => {
    const { store } = makeStore()
    // t_central is adjacent to t_forest in TILE_ADJACENCY
    const npcMap: NpcTileMap = new Map([['npc-merchant', 't_central']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 100,
      narration: '',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-merchant', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
  })

  it('FACTION_TILE_SEIZED: distant NPC gets no row', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-recluse', 't_desert']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 100,
      narration: '',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-recluse', 1, 10)
    expect(rows).toHaveLength(0)
  })

  it('ANIMAL_ATTACKED_NPC: victim always gets importance 8', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-fisher', 't_salt_marsh']])
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1',
      animalId: 'wolf-1',
      speciesId: 'fog_wolf',
      npcId: 'npc-fisher',
      tileId: 't_salt_marsh',
      attackedAtTick: 100,
      damage: { mood: -10, health: -5 },
      narration: 'The wolf attacked.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-fisher', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(8)
    expect(rows[0]!.content).toMatchObject({ kind: 'animal.attacked_npc', emotionalTag: 'fear' })
  })

  it('ANIMAL_ATTACKED_NPC: same-tile witness gets importance 7', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([
      ['npc-fisher', 't_salt_marsh'],
      ['npc-witness', 't_salt_marsh'],
    ])
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1',
      animalId: 'wolf-1',
      speciesId: 'fog_wolf',
      npcId: 'npc-fisher',
      tileId: 't_salt_marsh',
      attackedAtTick: 100,
      damage: { mood: -10, health: -5 },
      narration: 'The wolf attacked.',
    })
    store.projectWithLocality(ev, npcMap)
    const witnessRows = store.getImportant('npc-witness', 1, 10)
    expect(witnessRows).toHaveLength(1)
    expect(witnessRows[0]!.importance).toBe(7)
    expect(witnessRows[0]!.content).toMatchObject({ kind: 'animal.attacked_npc.witnessed' })
  })

  it('MIGRATION_WAVE_STARTED: same-tile NPC gets importance 7 with awe tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-nomad', 't_desert']])
    const ev = makeEvent('MIGRATION_WAVE_STARTED', {
      waveId: 'wave-1',
      speciesId: 'desert_hawk',
      fromTileId: 't_desert',
      toTileId: 't_mountain',
      startedAtTick: 100,
      migrationType: 'seasonal',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-nomad', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
    expect(rows[0]!.content).toMatchObject({ kind: 'migration.wave_started', emotionalTag: 'awe' })
  })

  it('SPECIES_EXTINCT: stored under world key with importance 8 and grief tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_forest']])
    const ev = makeEvent('SPECIES_EXTINCT', {
      speciesId: 'forest_deer',
      lastSeenTick: 95,
      affectedTileIds: ['t_forest'],
    })
    store.projectWithLocality(ev, npcMap)
    // stored under 'world', not the NPC
    const worldRows = store.getRecent('world', 10)
    const match = worldRows.find((r) => (r.content as Record<string, unknown>).kind === 'species.extinct')
    expect(match).toBeDefined()
    expect(match!.importance).toBe(8)
    expect(match!.content).toMatchObject({ emotionalTag: 'grief', speciesId: 'forest_deer' })
  })

  it('SETTLEMENT_FORMED: same-tile NPC gets importance 7 with relief tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-settler', 't_salt_marsh']])
    const ev = makeEvent('SETTLEMENT_FORMED', {
      settlementId: 'sett-1',
      tileId: 't_salt_marsh',
      formedAtTick: 100,
      founderNpcIds: ['npc-settler'],
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-settler', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
    expect(rows[0]!.content).toMatchObject({ kind: 'settlement.formed', emotionalTag: 'relief' })
  })

  it('SETTLEMENT_DECLINED: same-tile NPC gets importance 9 with fear tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-villager', 't_ruin']])
    const ev = makeEvent('SETTLEMENT_DECLINED', {
      settlementId: 'sett-old',
      tileId: 't_ruin',
      stability: 10,
      declinedAtTick: 100,
      narration: 'The settlement has fallen.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-villager', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(9)
    expect(rows[0]!.content).toMatchObject({ kind: 'settlement.declined', emotionalTag: 'fear' })
  })

  it('GOODS_TRANSPORT_LOST: carrier NPC gets importance 5 with anger tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-carrier', 't_dock']])
    const ev = makeEvent('GOODS_TRANSPORT_LOST', {
      transportId: 'trans-1',
      routeId: 'route-1',
      goodsId: 'fish',
      quantity: 10,
      carrierNpcId: 'npc-carrier',
      fromTileId: 't_salt_marsh',
      toTileId: 't_central',
      reason: 'storm',
      lostAtTick: 100,
      narration: 'The cargo was lost at sea.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-carrier', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(5)
    expect(rows[0]!.content).toMatchObject({ kind: 'goods.transport_lost', emotionalTag: 'anger' })
  })

  it('COMBAT_DEFEAT: defeated actor gets importance 7 with fear tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-fighter', 't_temple']])
    const ev = makeEvent('COMBAT_DEFEAT', {
      combatId: 'c-1',
      combatTick: 50,
      actorId: 'npc-fighter',
      defeatedByActorId: 'npc-boss',
      finalHp: 0,
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-fighter', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
    expect(rows[0]!.content).toMatchObject({ kind: 'combat.defeat', emotionalTag: 'fear' })
  })

  it('projectWithLocality is idempotent — duplicate call yields same row count', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 100,
      narration: '',
    })
    store.projectWithLocality(ev, npcMap)
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-guard', 1, 10)
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd packages/server && npx vitest run src/kernel/npcMemory.test.ts
```

Expected: FAIL — `store.projectWithLocality is not a function`

---

## Task 3: Implement `projectWithLocality` in npcMemory.ts

**Files:**
- Modify: `packages/server/src/kernel/npcMemory.ts`

- [ ] **Step 1: Add import for `TILE_ADJACENCY` and decay constants at the top of npcMemory.ts**

After the existing imports, add:

```typescript
import { TILE_ADJACENCY } from '../projections/beliefProjection.js'
import {
  MEMORY_VERY_HIGH_DECAY_TICKS,
  MEMORY_HIGH_DECAY_TICKS,
  MEMORY_NORMAL_DECAY_TICKS,
  MEMORY_DIALOG_MAX_BULLETS,
} from '../config/world.js'
```

- [ ] **Step 2: Add `projectWithLocality` method to the `SqliteNpcMemoryStore` class**

Add after the existing `project(event: Event)` method:

```typescript
/**
 * Project an event into per-NPC memory rows using locality-based fan-out.
 * Same-tile NPCs receive full importance; adjacent-tile NPCs receive
 * importance - 2 (floor 1). Distant NPCs receive no row.
 * Called alongside project() from the runtime fan-out loop.
 */
projectWithLocality(
  event: Event,
  npcTileMap: ReadonlyMap<string, string>
): void {
  if (typeof event.tick !== 'number') return
  const payload = event.payload
  if (!isLivingWorldEventPayload(payload)) return
  const data = payload.data as Record<string, unknown>
  const tick = event.tick

  const insert = this.db.prepare(
    `INSERT OR IGNORE INTO npc_memory
      (npc_id, memory_type, content_json, content_hash, tick, importance)
     VALUES (@npcId, @memoryType, @contentJson, @contentHash, @tick, @importance)`
  )

  const rows = deriveLocalityRows(event.eventType, data, tick, npcTileMap, payload.narration ?? null)
  insertMemoryRows(insert, rows, tick)
}
```

- [ ] **Step 3: Add `deriveLocalityRows` function at module level (after existing `deriveMemoryRows`)**

```typescript
function deriveLocalityRows(
  eventType: string,
  data: Record<string, unknown>,
  tick: number,
  npcTileMap: ReadonlyMap<string, string>,
  narration: string | null
): readonly DerivedMemoryRow[] {
  switch (eventType) {
    case 'FACTION_TILE_SEIZED': {
      const tileId = data.tileId as string
      const factionId = data.factionId as string
      const previousFactionId = (data.previousFactionId as string | null) ?? null
      return fanOutByLocality(npcTileMap, tileId, 9, {
        kind: 'faction.tile_seized',
        tileId,
        factionId,
        previousFactionId,
        emotionalTag: 'fear',
        narration,
        tick,
      }, 'event')
    }

    case 'ANIMAL_ATTACKED_NPC': {
      const victimNpcId = data.npcId as string
      const speciesId = data.speciesId as string
      const tileId = data.tileId as string
      const rows: DerivedMemoryRow[] = [
        {
          npcId: victimNpcId,
          memoryType: 'event',
          content: { kind: 'animal.attacked_npc', speciesId, tileId, emotionalTag: 'fear', narration, tick },
          importance: 8,
        },
      ]
      for (const [npcId, npcTile] of npcTileMap) {
        if (npcId === victimNpcId) continue
        if (npcTile === tileId) {
          rows.push({
            npcId,
            memoryType: 'observation',
            content: { kind: 'animal.attacked_npc.witnessed', speciesId, victimNpcId, tileId, emotionalTag: 'fear', narration, tick },
            importance: 7,
          })
        } else if ((TILE_ADJACENCY[npcTile] ?? []).includes(tileId)) {
          rows.push({
            npcId,
            memoryType: 'observation',
            content: { kind: 'animal.attacked_npc.heard', speciesId, victimNpcId, tileId, emotionalTag: 'fear', tick },
            importance: Math.max(1, 7 - 2),
          })
        }
      }
      return rows
    }

    case 'MIGRATION_WAVE_STARTED': {
      const fromTileId = data.fromTileId as string
      const toTileId = data.toTileId as string
      const speciesId = data.speciesId as string
      return fanOutByLocality(npcTileMap, fromTileId, 7, {
        kind: 'migration.wave_started',
        speciesId,
        fromTileId,
        toTileId,
        emotionalTag: 'awe',
        tick,
      }, 'observation')
    }

    case 'SPECIES_EXTINCT': {
      const speciesId = data.speciesId as string
      const lastSeenTick = data.lastSeenTick as number
      return [
        {
          npcId: 'world',
          memoryType: 'event',
          content: { kind: 'species.extinct', speciesId, lastSeenTick, emotionalTag: 'grief', tick },
          importance: 8,
        },
      ]
    }

    case 'SETTLEMENT_FORMED': {
      const tileId = data.tileId as string
      const settlementId = data.settlementId as string
      return fanOutByLocality(npcTileMap, tileId, 7, {
        kind: 'settlement.formed',
        tileId,
        settlementId,
        emotionalTag: 'relief',
        tick,
      }, 'event')
    }

    case 'SETTLEMENT_DECLINED': {
      const tileId = data.tileId as string
      const settlementId = data.settlementId as string
      return fanOutByLocality(npcTileMap, tileId, 9, {
        kind: 'settlement.declined',
        tileId,
        settlementId,
        emotionalTag: 'fear',
        tick,
      }, 'event')
    }

    case 'GOODS_TRANSPORT_LOST': {
      const carrierNpcId = data.carrierNpcId as string
      const goodsId = data.goodsId as string
      const fromTileId = data.fromTileId as string
      const toTileId = data.toTileId as string
      const lostNarration = typeof data.narration === 'string' ? data.narration : null
      return [
        {
          npcId: carrierNpcId,
          memoryType: 'event',
          content: { kind: 'goods.transport_lost', goodsId, fromTileId, toTileId, emotionalTag: 'anger', narration: lostNarration, tick },
          importance: 5,
        },
      ]
    }

    case 'COMBAT_DEFEAT': {
      const actorId = data.actorId as string
      const defeatedByActorId = data.defeatedByActorId as string | undefined
      const rows: DerivedMemoryRow[] = [
        {
          npcId: actorId,
          memoryType: 'event',
          content: { kind: 'combat.defeat', defeatedByActorId: defeatedByActorId ?? null, emotionalTag: 'fear', tick },
          importance: 7,
        },
      ]
      const defeatedTile = npcTileMap.get(actorId)
      if (defeatedTile) {
        for (const [npcId, npcTile] of npcTileMap) {
          if (npcId === actorId) continue
          if (npcTile === defeatedTile) {
            rows.push({
              npcId,
              memoryType: 'observation',
              content: { kind: 'combat.defeat.witnessed', defeatedNpcId: actorId, emotionalTag: 'fear', tick },
              importance: 6,
            })
          }
        }
      }
      return rows
    }

    default:
      return []
  }
}

function fanOutByLocality(
  npcTileMap: ReadonlyMap<string, string>,
  eventTileId: string,
  baseImportance: number,
  contentBase: Record<string, unknown>,
  memoryType: NpcMemoryType
): readonly DerivedMemoryRow[] {
  const rows: DerivedMemoryRow[] = []
  for (const [npcId, npcTile] of npcTileMap) {
    if (npcTile === eventTileId) {
      rows.push({ npcId, memoryType, content: contentBase, importance: baseImportance })
    } else if ((TILE_ADJACENCY[npcTile] ?? []).includes(eventTileId)) {
      rows.push({ npcId, memoryType, content: contentBase, importance: Math.max(1, baseImportance - 2) })
    }
  }
  return rows
}
```

- [ ] **Step 4: Run Task 2 tests to verify they pass**

```
cd packages/server && npx vitest run src/kernel/npcMemory.test.ts
```

Expected: All 11 tests in the `projectWithLocality` describe block PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

```
cd packages/server && npx vitest run
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```
git add packages/server/src/kernel/npcMemory.ts packages/server/src/kernel/npcMemory.test.ts
git commit -m "feat(memory): add projectWithLocality with 8 event types + locality fan-out"
```

---

## Task 4: Write Failing Tests for `formatMemoryContext`

**Files:**
- Modify: `packages/server/src/kernel/npcMemory.test.ts`

- [ ] **Step 1: Add `formatMemoryContext` test block to the end of `npcMemory.test.ts`**

```typescript
describe('SqliteNpcMemoryStore.formatMemoryContext', () => {
  it('returns empty string when no memories exist', () => {
    const { store } = makeStore()
    const result = store.formatMemoryContext('npc-nobody', 1000)
    expect(result).toBe('')
  })

  it('returns bullet list for active memories', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 100,
      narration: '',
    }, 100)
    store.projectWithLocality(ev, npcMap)
    const result = store.formatMemoryContext('npc-guard', 200)
    expect(result).toContain('[importance:9]')
    expect(result).toContain('t_forest')
  })

  it('includes world-scoped memories (SPECIES_EXTINCT)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_forest']])
    const ev = makeEvent('SPECIES_EXTINCT', {
      speciesId: 'forest_deer',
      lastSeenTick: 100,
      affectedTileIds: ['t_forest'],
    }, 100)
    store.projectWithLocality(ev, npcMap)
    const result = store.formatMemoryContext('npc-hunter', 200)
    expect(result).toContain('forest_deer')
  })

  it('caps output at MEMORY_DIALOG_MAX_BULLETS (5)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    // Insert 7 memories at different ticks
    for (let i = 0; i < 7; i++) {
      const ev = makeEvent('FACTION_TILE_SEIZED', {
        tileId: 't_forest',
        factionId: 'tide_hunters',
        previousFactionId: null,
        seizedAtTick: 100 + i,
        narration: `event-${i}`,
      }, 100 + i)
      store.projectWithLocality(ev, npcMap)
    }
    const result = store.formatMemoryContext('npc-guard', 500)
    const lines = result.split('\n').filter((l) => l.startsWith('-'))
    expect(lines.length).toBeLessThanOrEqual(5)
  })

  it('importance-9 memory survives past MEMORY_VERY_HIGH_DECAY_TICKS', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 0,
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // Way beyond decay threshold
    const result = store.formatMemoryContext('npc-guard', 999999)
    expect(result).not.toBe('')
  })

  it('importance-5 memory is excluded after MEMORY_HIGH_DECAY_TICKS', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-carrier', 't_dock']])
    const ev = makeEvent('GOODS_TRANSPORT_LOST', {
      transportId: 'trans-1',
      routeId: 'route-1',
      goodsId: 'fish',
      quantity: 5,
      carrierNpcId: 'npc-carrier',
      fromTileId: 't_dock',
      toTileId: 't_central',
      reason: 'storm',
      lostAtTick: 0,
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // MEMORY_HIGH_DECAY_TICKS = 7 * TICKS_PER_DAY = 7 * 17280 = 120960
    // Use currentTick well past that threshold
    const result = store.formatMemoryContext('npc-carrier', 200000)
    expect(result).toBe('')
  })

  it('orders by importance DESC then recency DESC', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    // Low-importance event first
    const evLow = makeEvent('GOODS_TRANSPORT_LOST', {
      transportId: 'trans-2',
      routeId: 'route-2',
      goodsId: 'fish',
      quantity: 5,
      carrierNpcId: 'npc-guard',
      fromTileId: 't_dock',
      toTileId: 't_forest',
      reason: 'storm',
      lostAtTick: 200,
      narration: '',
    }, 200)
    store.projectWithLocality(evLow, npcMap)
    // High-importance event second
    const evHigh = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 100,
      narration: '',
    }, 100)
    store.projectWithLocality(evHigh, npcMap)
    const result = store.formatMemoryContext('npc-guard', 300)
    const lines = result.split('\n').filter((l) => l.startsWith('-'))
    // High importance (9) should appear before low (5)
    const firstImportance = lines[0]!.match(/\[importance:(\d+)\]/)?.[1]
    expect(Number(firstImportance)).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Run tests to verify the new block fails**

```
cd packages/server && npx vitest run src/kernel/npcMemory.test.ts
```

Expected: `formatMemoryContext` tests FAIL — method does not exist yet.

---

## Task 5: Implement `formatMemoryContext` in npcMemory.ts

**Files:**
- Modify: `packages/server/src/kernel/npcMemory.ts`

- [ ] **Step 1: Add `formatMemoryContext` method to `SqliteNpcMemoryStore` class**

Add after the `projectWithLocality` method:

```typescript
/**
 * Returns a formatted Chinese bullet list of active (non-decayed) NPC memories
 * for injection into the AI dialog system prompt.
 * Queries both personal (npc_id = npcId) and world-scoped (npc_id = 'world') rows.
 * Returns '' when no active memories exist — callers must guard on empty string.
 */
formatMemoryContext(npcId: string, currentTick: number): string {
  const rows = this.db
    .prepare(
      `SELECT memory_type as memoryType, content_json as contentJson, tick, importance
         FROM npc_memory
        WHERE (npc_id = ? OR npc_id = 'world')
          AND (
            importance >= 9
            OR (importance >= 7 AND ? - tick <= ?)
            OR (importance >= 5 AND ? - tick <= ?)
            OR (? - tick <= ?)
          )
        ORDER BY importance DESC, tick DESC
        LIMIT ?`
    )
    .all(
      npcId,
      currentTick, MEMORY_VERY_HIGH_DECAY_TICKS,
      currentTick, MEMORY_HIGH_DECAY_TICKS,
      currentTick, MEMORY_NORMAL_DECAY_TICKS,
      MEMORY_DIALOG_MAX_BULLETS
    ) as Array<{
    memoryType: NpcMemoryType
    contentJson: string
    tick: number
    importance: number
  }>

  if (rows.length === 0) return ''

  return rows
    .map((r) => {
      const c = JSON.parse(r.contentJson) as Record<string, unknown>
      const emotionalTag = typeof c.emotionalTag === 'string' ? c.emotionalTag : 'neutral'
      return `- [importance:${r.importance}] ${describeMemoryContent(c, emotionalTag)}`
    })
    .join('\n')
}
```

- [ ] **Step 2: Add `describeMemoryContent` and `emotionalTagZh` helper functions at module level**

Add after `fanOutByLocality`:

```typescript
function describeMemoryContent(content: Record<string, unknown>, emotionalTag: string): string {
  const kind = content.kind as string
  switch (kind) {
    case 'faction.tile_seized':
      return `目睹 ${content.tileId} 發生派系奪權（${content.factionId} 取代 ${content.previousFactionId ?? '無主'}），感到${emotionalTagZh(emotionalTag)}`
    case 'animal.attacked_npc':
      return `遭 ${content.speciesId} 攻擊於 ${content.tileId}，感到${emotionalTagZh(emotionalTag)}`
    case 'animal.attacked_npc.witnessed':
      return `目睹 ${content.victimNpcId} 在 ${content.tileId} 遭 ${content.speciesId} 攻擊，感到${emotionalTagZh(emotionalTag)}`
    case 'animal.attacked_npc.heard':
      return `聽聞 ${content.tileId} 附近有動物攻擊事件，感到${emotionalTagZh(emotionalTag)}`
    case 'migration.wave_started':
      return `目睹 ${content.speciesId} 大遷徙浪潮自 ${content.fromTileId} 啟動，感到${emotionalTagZh(emotionalTag)}`
    case 'species.extinct':
      return `得知 ${content.speciesId} 物種宣告滅絕，感到${emotionalTagZh(emotionalTag)}`
    case 'settlement.formed':
      return `目睹 ${content.tileId} 聚落正式成立，感到${emotionalTagZh(emotionalTag)}`
    case 'settlement.declined':
      return `目睹 ${content.tileId} 聚落走向衰敗，感到${emotionalTagZh(emotionalTag)}`
    case 'goods.transport_lost':
      return `貨物（${content.goodsId}）在 ${content.fromTileId}→${content.toTileId} 途中遺失，感到${emotionalTagZh(emotionalTag)}`
    case 'combat.defeat':
      return `在戰鬥中落敗${content.defeatedByActorId ? `（敗給 ${content.defeatedByActorId}）` : ''}，感到${emotionalTagZh(emotionalTag)}`
    case 'combat.defeat.witnessed':
      return `目睹 ${content.defeatedNpcId} 在戰鬥中落敗，感到${emotionalTagZh(emotionalTag)}`
    default: {
      if (typeof content.narration === 'string' && content.narration.length > 0) {
        return content.narration
      }
      return `[${kind}]`
    }
  }
}

function emotionalTagZh(tag: string): string {
  const MAP: Record<string, string> = {
    fear: '恐懼',
    grief: '悲傷',
    relief: '欣慰',
    anger: '憤怒',
    awe: '驚嘆',
    neutral: '平靜',
  }
  return MAP[tag] ?? tag
}
```

- [ ] **Step 3: Run all npcMemory tests to verify they pass**

```
cd packages/server && npx vitest run src/kernel/npcMemory.test.ts
```

Expected: All 18 tests PASS.

- [ ] **Step 4: Run full suite to verify no regressions**

```
cd packages/server && npx vitest run
```

- [ ] **Step 5: Commit**

```
git add packages/server/src/kernel/npcMemory.ts packages/server/src/kernel/npcMemory.test.ts
git commit -m "feat(memory): add formatMemoryContext with decay filtering + Chinese descriptions"
```

---

## Task 6: Dialog Injection — `buildMemoryBlock` + `AiDialogContext`

**Files:**
- Modify: `packages/server/src/npcs/aiDialog.ts`
- Modify: `packages/server/src/npcs/aiDialog.test.ts`

- [ ] **Step 1: Add 3 tests to aiDialog.test.ts first**

Find the `buildReflectionBlock` tests in `aiDialog.test.ts` and add after them:

```typescript
describe('buildMemoryBlock', () => {
  it('returns [] when ctx is undefined', () => {
    expect(buildMemoryBlock(undefined)).toEqual([])
  })

  it('returns [] when ctx is empty string', () => {
    expect(buildMemoryBlock('')).toEqual([])
  })

  it('returns header line + ctx when ctx is present', () => {
    const ctx = '- [importance:9] 目睹派系奪權，感到恐懼'
    const result = buildMemoryBlock(ctx)
    expect(result.length).toBeGreaterThan(0)
    expect(result.join('\n')).toContain('個人記憶')
    expect(result.join('\n')).toContain(ctx)
  })
})
```

Also add `buildMemoryBlock` to the import at the top of aiDialog.test.ts:

```typescript
import { ..., buildMemoryBlock } from './aiDialog.js'
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd packages/server && npx vitest run src/npcs/aiDialog.test.ts
```

Expected: FAIL — `buildMemoryBlock` not exported.

- [ ] **Step 3: Add `memoryContext` to `AiDialogContext` in aiDialog.ts**

Find the `AiDialogContext` type definition and add the new optional field after `reflectionContext`:

```typescript
  reflectionContext?: string
  memoryContext?: string
```

- [ ] **Step 4: Add `buildMemoryBlock` function to aiDialog.ts**

Add after `buildReflectionBlock`:

```typescript
export function buildMemoryBlock(memoryContext: string | undefined): string[] {
  if (!memoryContext || memoryContext.trim().length === 0) return []
  return [
    memoryContext,
    '',
    '⚠️ 個人記憶使用規則：',
    '- 僅引用以下實際記錄的記憶，不可虛構記憶以外的事件',
    '- 可自然融入對話，表達情緒、態度、或過去的經歷',
    '- 不要逐字列出記憶清單，要自然融入人物個性',
    '',
  ]
}
```

- [ ] **Step 5: Inject `buildMemoryBlock` into `buildSystemPrompt`**

Find the line `...buildReflectionBlock(ctx.reflectionContext),` and add after it:

```typescript
    ...buildMemoryBlock(ctx.memoryContext),
```

- [ ] **Step 6: Run aiDialog tests to verify they pass**

```
cd packages/server && npx vitest run src/npcs/aiDialog.test.ts
```

Expected: All tests PASS including the 3 new `buildMemoryBlock` tests.

- [ ] **Step 7: Commit**

```
git add packages/server/src/npcs/aiDialog.ts packages/server/src/npcs/aiDialog.test.ts
git commit -m "feat(memory): add AiDialogContext.memoryContext + buildMemoryBlock dialog injection"
```

---

## Task 7: Wire `runtime.ts` and `npc.ts`

**Files:**
- Modify: `packages/server/src/sim/runtime.ts`
- Modify: `packages/server/src/http/npc.ts`

- [ ] **Step 1: Add `projectWithLocality` calls in runtime.ts — two fan-out locations**

In runtime.ts there are two places where `this.npcMemory.project(ev)` is called (lines ~1563 and ~4380). Add `projectWithLocality` call immediately after each existing `project` call.

**Location 1** (main tick fan-out, inside the small-log committed loop):

Find:
```typescript
      if (this.npcMemory) this.npcMemory.project(ev)
      if (this.npcRelationships) this.npcRelationships.project(ev)
      this.constructionProjects.project(ev)
      this.buildingStateProjection.project(ev)
      this.beliefProjection.apply(ev, new Map(this.getNpcs().map(n => [n.id, n.location])))
```

Replace with:
```typescript
      if (this.npcMemory) {
        const npcTileMap = new Map(this.getNpcs().map(n => [n.id, n.location]))
        this.npcMemory.project(ev)
        this.npcMemory.projectWithLocality(ev, npcTileMap)
      }
      if (this.npcRelationships) this.npcRelationships.project(ev)
      this.constructionProjects.project(ev)
      this.buildingStateProjection.project(ev)
      this.beliefProjection.apply(ev, new Map(this.getNpcs().map(n => [n.id, n.location])))
```

**Location 2** (large-log else-branch committed loop, ~line 4380):

Find:
```typescript
        if (this.npcMemory) this.npcMemory.project(ev)
        if (this.npcRelationships) this.npcRelationships.project(ev)
        this.constructionProjects.project(ev)
        this.buildingStateProjection.project(ev)
        this.npcStateProjection.project(ev)
```

Replace with:
```typescript
        if (this.npcMemory) {
          const npcTileMap = new Map(this.getNpcs().map(n => [n.id, n.location]))
          this.npcMemory.project(ev)
          this.npcMemory.projectWithLocality(ev, npcTileMap)
        }
        if (this.npcRelationships) this.npcRelationships.project(ev)
        this.constructionProjects.project(ev)
        this.buildingStateProjection.project(ev)
        this.npcStateProjection.project(ev)
```

- [ ] **Step 2: Add `getFormattedMemoryContext` getter to runtime.ts**

Find `getFormattedReflectionContext` (around line 1167) and add after it:

```typescript
  /** v0.53.0 — NPC's episodic memory (formatted string for AI dialog prompt). */
  getFormattedMemoryContext(npcId: string): string {
    if (!this.npcMemory) return ''
    return this.npcMemory.formatMemoryContext(npcId, this.currentTick)
  }
```

- [ ] **Step 3: Fill `memoryContext` in npc.ts dialog handler**

Find in `npc.ts` (around line 234–258):

```typescript
        const beliefCtx = input.runtime.getFormattedBeliefContext(npcId) || undefined
        const reflectionCtx = input.runtime.getFormattedReflectionContext(npcId) || undefined

        const dialogCtx: AiDialogContext = {
          ...
          ...(beliefCtx ? { beliefContext: beliefCtx } : {}),
          ...(reflectionCtx ? { reflectionContext: reflectionCtx } : {}),
        }
```

Add after the `reflectionCtx` line and before `const dialogCtx`:

```typescript
        const memoryCtx = input.runtime.getFormattedMemoryContext(npcId) || undefined
```

Add after `...(reflectionCtx ? { reflectionContext: reflectionCtx } : {}),`:

```typescript
          ...(memoryCtx ? { memoryContext: memoryCtx } : {}),
```

- [ ] **Step 4: Build to verify TypeScript is clean**

```
cd packages/server && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Run full test suite**

```
cd packages/server && npx vitest run
```

Expected: All tests pass. Note the count — should be ~882+ (862 baseline + ~20 new).

- [ ] **Step 6: Commit**

```
git add packages/server/src/sim/runtime.ts packages/server/src/http/npc.ts
git commit -m "feat(memory): wire projectWithLocality fan-out + getFormattedMemoryContext into dialog pipeline"
```

---

## Task 8: Update Docs, Version Bump, and Push

**Files:**
- Modify: `package.json` (root), `packages/server/package.json`, `packages/web/package.json`
- Modify: `ROADMAP.md`
- Modify: `PROGRESS.md`
- Modify: `docs/WORLD_CAPABILITIES.md`

- [ ] **Step 1: Bump version to 0.53.0**

In root `package.json`, `packages/server/package.json`, and `packages/web/package.json`, change `"version": "0.52.0"` → `"version": "0.53.0"`.

Run the sync script after editing root:
```
node scripts/sync-version.mjs
```

- [ ] **Step 2: Add v0.53.0 entry at the top of ROADMAP.md**

Add before the `## v0.52.0` block:

```markdown
## v0.53.0 ✅ shipped — 2026-05-25

**主題：NPC 記憶對話注入（Memory Dialog Injection）**

- ✅ `projectWithLocality(event, npcTileMap)`：locality fan-out（同 tile 全額 importance，adjacent - 2，遠端不記）
- ✅ 8 種新事件覆蓋：FACTION_TILE_SEIZED / ANIMAL_ATTACKED_NPC / MIGRATION_WAVE_STARTED / SPECIES_EXTINCT / SETTLEMENT_FORMED / SETTLEMENT_DECLINED / GOODS_TRANSPORT_LOST / COMBAT_DEFEAT
- ✅ emotionalTag（fear / grief / relief / anger / awe）編碼入 content_json
- ✅ `formatMemoryContext(npcId, currentTick)`：decay 過濾（importance 9 永久；7–8 30天；5–6 7天；1–4 2天）；同時查個人與 world-scoped 記憶；最多 5 條中文子彈
- ✅ `buildMemoryBlock()` + `AiDialogContext.memoryContext?` → 注入 AI system prompt（無記憶時完全省略）
- ✅ `getFormattedMemoryContext(npcId)` runtime getter
- ✅ 4 個新常數：MEMORY_DIALOG_MAX_BULLETS / MEMORY_VERY_HIGH/HIGH/NORMAL_DECAY_TICKS
- ✅ ~20 新測試（npcMemory.test.ts + aiDialog.test.ts）；build 乾淨

---
```

- [ ] **Step 3: Update PROGRESS.md with v0.53.0 handoff snapshot**

Add new handoff block at the top (after the header, before the `## 2026-05-22` block). Use today's date `2026-05-25` and document what shipped, key architectural points, test count, and what's next.

- [ ] **Step 4: Update docs/WORLD_CAPABILITIES.md §12.5.10**

Find `## 12.5.10 Memory System` and add a shipped note after the heading:

```markdown
> **v0.53.0 — Memory Dialog Injection shipped.** `SqliteNpcMemoryStore.projectWithLocality()` provides locality-based fan-out for 8 event types; `formatMemoryContext()` applies importance-tier decay filtering; `buildMemoryBlock()` injects NPC episodic memory into AI dialog system prompt. ~20 tests in `npcMemory.test.ts`.
```

Also update the §29 status table version reference from v0.52.0 → v0.53.0.

- [ ] **Step 5: Commit docs + version**

```
git add package.json packages/server/package.json packages/web/package.json ROADMAP.md PROGRESS.md docs/WORLD_CAPABILITIES.md
git commit -m "chore: bump root + server + web to 0.53.0; NPC memory dialog injection complete"
```

- [ ] **Step 6: Push**

```
git push
```

- [ ] **Step 7: Verify final state**

```
cd packages/server && npx vitest run
cd packages/server && npm run build
curl -s http://127.0.0.1:8100/healthz
```

Expected: Tests pass, build clean, server healthy.
