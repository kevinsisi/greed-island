# NPC Belief + Perception Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each NPC accumulates event-sourced, locality-aware beliefs (tile safety, goods scarcity, ecosystem health, faction control) that decay over time and are injected into AI dialog prompts so NPCs speak from a subjective worldview.

**Architecture:** A new `BeliefProjection` class listens to existing world Events (`FACTION_TILE_SEIZED`, `ANIMAL_ATTACKED_NPC`, `GOODS_CONSUMED`) plus a runtime cadence for ecosystem beliefs. Each call to `apply(event, npcLocations)` writes/updates belief rows only for NPCs whose current tile matches the event tile (direct) or is adjacent (indirect). Confidence decays via a `tick(currentTick)` method called every `TICKS_PER_DAY`; rows reaching ≤ 0 are deleted. No EventLog boot hydration — beliefs start empty on restart and repopulate quickly from live events.

**Tech Stack:** TypeScript, Vitest, existing kernel Event types (`FACTION_TILE_SEIZED`, `ANIMAL_ATTACKED_NPC`, `GOODS_CONSUMED`), `SimulationRuntime` (`getNpcs()` for NPC locations), `AiDialogContext` in `aiDialog.ts`.

**Spec:** `docs/superpowers/specs/2026-05-22-npc-belief-perception-design.md`

---

## File Map

| Action | Path | What it holds |
|---|---|---|
| CREATE | `packages/server/src/projections/beliefProjection.ts` | All types, `BeliefProjection` class, `TILE_ADJACENCY`, `formatBeliefContext` |
| CREATE | `packages/server/src/projections/beliefProjection.test.ts` | All unit tests |
| MODIFY | `packages/server/src/sim/runtime.ts` | Wire projection (field, fan-out, decay cadence, ecosystem cadence, getter) |
| MODIFY | `packages/server/src/npcs/aiDialog.ts` | `beliefContext?: string` on `AiDialogContext`, `buildBeliefBlock` |
| MODIFY | `packages/server/src/http/npc.ts` | Inject belief context into `dialogCtx` |
| MODIFY | `docs/WORLD_CAPABILITIES.md` | Mark Layer 2 Belief+Perception shipped (v0.50.0) |
| MODIFY | `PROGRESS.md` | v0.50.0 handoff snapshot |

---

## Task 1 — BeliefProjection types + skeleton

**Files:**
- Create: `packages/server/src/projections/beliefProjection.ts`
- Create: `packages/server/src/projections/beliefProjection.test.ts`

- [ ] **Step 1: Write the failing type test**

```typescript
// packages/server/src/projections/beliefProjection.test.ts
import { describe, it, expect } from 'vitest'
import { BeliefProjection } from './beliefProjection.js'

describe('BeliefProjection', () => {
  it('getBeliefs returns empty array for unknown npc', () => {
    const proj = new BeliefProjection()
    expect(proj.getBeliefs('npc-x')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```powershell
cd packages/server
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create beliefProjection.ts with types + skeleton**

```typescript
// packages/server/src/projections/beliefProjection.ts
import type { Event } from '../kernel/types.js'

export type BeliefSubjectKind =
  | 'tile_safety'
  | 'goods_scarcity'
  | 'ecosystem_health'
  | 'faction_control'

export type BeliefValue =
  | 'dangerous' | 'safe'
  | 'scarce' | 'abundant'
  | 'depleted' | 'recovering'
  | 'controlled' | 'contested' | 'free'

export type EmotionalTag = 'fear' | 'worry' | 'relief' | 'anger' | 'hope'

export interface BeliefRow {
  npcId: string
  subject: BeliefSubjectKind
  qualifier: string
  value: BeliefValue
  confidence: number
  observedAtTick: number
  decayRatePerDay: number
  emotionalTag?: EmotionalTag
}

// World tile adjacency (borders).
export const TILE_ADJACENCY: Readonly<Record<string, readonly string[]>> = {
  t_central: ['t_dock', 't_forest', 't_ruin', 't_temple', 't_dimai'],
  t_dock:    ['t_central', 't_forest'],
  t_forest:  ['t_central', 't_dock', 't_mountain'],
  t_ruin:    ['t_central', 't_temple'],
  t_temple:  ['t_central', 't_ruin', 't_dimai'],
  t_dimai:   ['t_central', 't_temple', 't_mountain'],
  t_mountain: ['t_forest', 't_dimai'],
}

// Row key: npcId + '|' + subject + '|' + qualifier
function rowKey(npcId: string, subject: BeliefSubjectKind, qualifier: string): string {
  return `${npcId}|${subject}|${qualifier}`
}

export class BeliefProjection {
  private readonly rows = new Map<string, BeliefRow>()

  apply(_event: Event, _npcLocations: ReadonlyMap<string, string>): void {
    // TODO: implement per-event handlers
  }

  tick(_currentTick: number): void {
    // TODO: decay confidence by decayRatePerDay; delete rows ≤ 0
  }

  updateEcosystemBeliefs(
    _tileId: string,
    _densityPct: number,
    _currentTick: number,
    _npcLocations: ReadonlyMap<string, string>,
  ): void {
    // TODO: write ecosystem_health beliefs when densityPct < 0.20
  }

  getBeliefs(npcId: string): readonly BeliefRow[] {
    return [...this.rows.values()].filter(r => r.npcId === npcId)
  }

  // Internal helpers
  protected upsert(row: BeliefRow): void {
    this.rows.set(rowKey(row.npcId, row.subject, row.qualifier), row)
  }
}
```

- [ ] **Step 4: Run test — should pass**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): BeliefProjection skeleton + types"
```

---

## Task 2 — FACTION_TILE_SEIZED handler

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.ts`
- Modify: `packages/server/src/projections/beliefProjection.test.ts`

The `FACTION_TILE_SEIZED` event payload (inside `event.payload.data`) has: `{ tileId, factionId, seizedAtTick }`.

- [ ] **Step 1: Add failing tests**

Add inside `describe('BeliefProjection', () => {` in `beliefProjection.test.ts`:

```typescript
import type { Event } from '../kernel/types.js'

function ev(tick: number, eventType: string, data: unknown): Event {
  return {
    id: `ev-${tick}-${eventType}`,
    eventType,
    actorId: 'system',
    sequence: tick,
    tick,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

it('FACTION_TILE_SEIZED on NPC tile → tile_safety dangerous, confidence 90, fear', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-a', 't_dock']])
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
  }), locs)
  const beliefs = proj.getBeliefs('npc-a')
  expect(beliefs).toHaveLength(2) // tile_safety + faction_control
  const safety = beliefs.find(b => b.subject === 'tile_safety')!
  expect(safety.value).toBe('dangerous')
  expect(safety.confidence).toBe(90)
  expect(safety.emotionalTag).toBe('fear')
  expect(safety.qualifier).toBe('t_dock')
})

it('FACTION_TILE_SEIZED → faction_control belief', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-a', 't_dock']])
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'militia', previousFactionId: null, seizedAtTick: 10, narration: 'x'
  }), locs)
  const ctrl = proj.getBeliefs('npc-a').find(b => b.subject === 'faction_control')!
  expect(ctrl.value).toBe('controlled')
  expect(ctrl.qualifier).toBe('t_dock')
  expect(ctrl.confidence).toBe(90)
})

it('FACTION_TILE_SEIZED on adjacent tile → confidence 40', () => {
  const proj = new BeliefProjection()
  // npc-a is on t_central; t_dock is adjacent to t_central
  const locs = new Map([['npc-a', 't_central']])
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
  }), locs)
  const safety = proj.getBeliefs('npc-a').find(b => b.subject === 'tile_safety')!
  expect(safety.confidence).toBe(40)
})

it('FACTION_TILE_SEIZED on non-adjacent tile → no belief written', () => {
  const proj = new BeliefProjection()
  // npc-a is on t_mountain; t_dock is not adjacent to t_mountain
  const locs = new Map([['npc-a', 't_mountain']])
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
  }), locs)
  expect(proj.getBeliefs('npc-a')).toHaveLength(0)
})

it('FACTION_TILE_SEIZED with NPC not in locations map → no belief', () => {
  const proj = new BeliefProjection()
  const locs = new Map<string, string>() // empty
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
  }), locs)
  // no NPCs → no beliefs written
  expect([...proj.getBeliefs('npc-any')]).toHaveLength(0)
})
```

- [ ] **Step 2: Run — confirm all new tests fail**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: FAIL on new tests (skeleton `apply` does nothing).

- [ ] **Step 3: Implement `apply` for FACTION_TILE_SEIZED**

Replace the `apply` method stub in `beliefProjection.ts`:

```typescript
apply(event: Event, npcLocations: ReadonlyMap<string, string>): void {
  const data = readPayloadData(event)
  if (!data) return

  switch (event.eventType) {
    case 'FACTION_TILE_SEIZED':
      this.applyFactionSeized(data, event.tick ?? 0, npcLocations)
      break
  }
}

private applyFactionSeized(
  data: Record<string, unknown>,
  tick: number,
  npcLocations: ReadonlyMap<string, string>,
): void {
  const tileId = readStr(data.tileId)
  if (!tileId) return
  for (const [npcId, npcTile] of npcLocations) {
    const conf = perceiveConfidence(npcTile, tileId)
    if (conf === 0) continue
    this.upsert({
      npcId, subject: 'tile_safety', qualifier: tileId,
      value: 'dangerous', confidence: conf, observedAtTick: tick,
      decayRatePerDay: 2, emotionalTag: 'fear',
    })
    this.upsert({
      npcId, subject: 'faction_control', qualifier: tileId,
      value: 'controlled', confidence: conf, observedAtTick: tick,
      decayRatePerDay: 1,
    })
  }
}
```

Add these helper functions at the bottom of the file (outside the class):

```typescript
function readPayloadData(event: Event): Record<string, unknown> | null {
  const data = (event.payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return null
  return data as Record<string, unknown>
}

function readStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function perceiveConfidence(npcTile: string, eventTile: string): number {
  if (npcTile === eventTile) return 90
  const adjacent = TILE_ADJACENCY[npcTile] ?? []
  if (adjacent.includes(eventTile)) return 40
  return 0
}
```

- [ ] **Step 4: Run — all tests pass**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: PASS on all tests so far.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): FACTION_TILE_SEIZED belief handler"
```

---

## Task 3 — ANIMAL_ATTACKED_NPC handler

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.ts`
- Modify: `packages/server/src/projections/beliefProjection.test.ts`

The `ANIMAL_ATTACKED_NPC` payload (inside `event.payload.data`) has: `{ npcId, tileId, attackId, animalId, speciesId, attackedAtTick, damage: { mood, health }, narration }`.

- [ ] **Step 1: Add failing tests**

```typescript
it('ANIMAL_ATTACKED_NPC on NPC tile → tile_safety dangerous, confidence 90', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-b', 't_forest']])
  proj.apply(ev(20, 'ANIMAL_ATTACKED_NPC', {
    attackId: 'atk-1', animalId: 'wolf-1', speciesId: 'fog_wolf',
    npcId: 'npc-b', tileId: 't_forest', attackedAtTick: 20,
    damage: { mood: -10, health: -15 }, narration: 'attacked'
  }), locs)
  const safety = proj.getBeliefs('npc-b').find(b => b.subject === 'tile_safety')!
  expect(safety).toBeDefined()
  expect(safety.value).toBe('dangerous')
  expect(safety.confidence).toBe(90)
  expect(safety.emotionalTag).toBe('fear')
})

it('ANIMAL_ATTACKED_NPC: bystander NPC on same tile also gets belief', () => {
  const proj = new BeliefProjection()
  // npc-b is the victim; npc-c is also on t_forest
  const locs = new Map([['npc-b', 't_forest'], ['npc-c', 't_forest']])
  proj.apply(ev(20, 'ANIMAL_ATTACKED_NPC', {
    attackId: 'atk-1', animalId: 'wolf-1', speciesId: 'fog_wolf',
    npcId: 'npc-b', tileId: 't_forest', attackedAtTick: 20,
    damage: { mood: -10, health: -15 }, narration: 'attacked'
  }), locs)
  expect(proj.getBeliefs('npc-c').find(b => b.subject === 'tile_safety')).toBeDefined()
})

it('ANIMAL_ATTACKED_NPC: NPC on adjacent tile gets confidence 40', () => {
  const proj = new BeliefProjection()
  // npc-d is on t_central; t_forest is adjacent
  const locs = new Map([['npc-d', 't_central']])
  proj.apply(ev(20, 'ANIMAL_ATTACKED_NPC', {
    attackId: 'atk-1', animalId: 'wolf-1', speciesId: 'fog_wolf',
    npcId: 'npc-x', tileId: 't_forest', attackedAtTick: 20,
    damage: { mood: -10, health: -15 }, narration: 'attacked'
  }), locs)
  const safety = proj.getBeliefs('npc-d').find(b => b.subject === 'tile_safety')!
  expect(safety.confidence).toBe(40)
})
```

- [ ] **Step 2: Run — confirm new tests fail**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: FAIL on ANIMAL_ATTACKED_NPC tests.

- [ ] **Step 3: Add `ANIMAL_ATTACKED_NPC` case to `apply` and handler method**

In the `apply` switch block, add:

```typescript
    case 'ANIMAL_ATTACKED_NPC':
      this.applyAnimalAttack(data, event.tick ?? 0, npcLocations)
      break
```

Add handler method to the class:

```typescript
private applyAnimalAttack(
  data: Record<string, unknown>,
  tick: number,
  npcLocations: ReadonlyMap<string, string>,
): void {
  const tileId = readStr(data.tileId)
  if (!tileId) return
  for (const [npcId, npcTile] of npcLocations) {
    const conf = perceiveConfidence(npcTile, tileId)
    if (conf === 0) continue
    this.upsert({
      npcId, subject: 'tile_safety', qualifier: tileId,
      value: 'dangerous', confidence: conf, observedAtTick: tick,
      decayRatePerDay: 3, emotionalTag: 'fear',
    })
  }
}
```

- [ ] **Step 4: Run — all tests pass**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): ANIMAL_ATTACKED_NPC belief handler"
```

---

## Task 4 — GOODS_CONSUMED food scarcity handler

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.ts`
- Modify: `packages/server/src/projections/beliefProjection.test.ts`

`GOODS_CONSUMED` payload (inside `event.payload.data`) has: `{ goodsId, quantity, holderType, holderId, tileId, consumedAtTick, narration }`.

Food goods IDs: `'fish'`, `'meat'`, `'grain'` (see `SETTLEMENT_FOOD_GOODS` in `config/world.ts`).

Trigger: when `goodsId` is one of `FOOD_GOODS_IDS` and `holderType === 'settlement'` or `'npc'`, write `goods_scarcity: scarce` for nearby NPCs.

- [ ] **Step 1: Add failing tests**

```typescript
it('GOODS_CONSUMED fish on NPC tile → goods_scarcity scarce, confidence 80', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-e', 't_dock']])
  proj.apply(ev(30, 'GOODS_CONSUMED', {
    goodsId: 'fish', quantity: 10,
    holderType: 'settlement', holderId: 'settlement-dock', tileId: 't_dock',
    consumedAtTick: 30, narration: 'consumed'
  }), locs)
  const scarcity = proj.getBeliefs('npc-e').find(b => b.subject === 'goods_scarcity')!
  expect(scarcity).toBeDefined()
  expect(scarcity.value).toBe('scarce')
  expect(scarcity.qualifier).toBe('fish')
  expect(scarcity.confidence).toBe(80)
  expect(scarcity.emotionalTag).toBe('worry')
})

it('GOODS_CONSUMED non-food goods → no belief', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-f', 't_dock']])
  proj.apply(ev(30, 'GOODS_CONSUMED', {
    goodsId: 'refined_salt', quantity: 5,
    holderType: 'settlement', holderId: 'settlement-dock', tileId: 't_dock',
    consumedAtTick: 30, narration: 'consumed'
  }), locs)
  expect(proj.getBeliefs('npc-f')).toHaveLength(0)
})

it('GOODS_CONSUMED on adjacent tile → confidence 35', () => {
  const proj = new BeliefProjection()
  // npc-g on t_central; t_dock adjacent
  const locs = new Map([['npc-g', 't_central']])
  proj.apply(ev(30, 'GOODS_CONSUMED', {
    goodsId: 'meat', quantity: 3,
    holderType: 'npc', holderId: 'npc-x', tileId: 't_dock',
    consumedAtTick: 30, narration: 'consumed'
  }), locs)
  const scarcity = proj.getBeliefs('npc-g').find(b => b.subject === 'goods_scarcity')!
  expect(scarcity.confidence).toBe(35)
})
```

- [ ] **Step 2: Run — confirm new tests fail**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

- [ ] **Step 3: Add food goods constant + GOODS_CONSUMED case**

At the top of `beliefProjection.ts`, after imports, add:

```typescript
const FOOD_GOODS_IDS = new Set(['fish', 'meat', 'grain'])
```

In the `apply` switch block, add:

```typescript
    case 'GOODS_CONSUMED':
      this.applyGoodsConsumed(data, event.tick ?? 0, npcLocations)
      break
```

Add handler method:

```typescript
private applyGoodsConsumed(
  data: Record<string, unknown>,
  tick: number,
  npcLocations: ReadonlyMap<string, string>,
): void {
  const goodsId = readStr(data.goodsId)
  if (!FOOD_GOODS_IDS.has(goodsId)) return
  const tileId = readStr(data.tileId)
  if (!tileId) return
  for (const [npcId, npcTile] of npcLocations) {
    const rawConf = perceiveConfidence(npcTile, tileId)
    if (rawConf === 0) continue
    // direct = 80, adjacent = 35 (lower than safety events; food scarcity is indirect signal)
    const conf = rawConf === 90 ? 80 : 35
    this.upsert({
      npcId, subject: 'goods_scarcity', qualifier: goodsId,
      value: 'scarce', confidence: conf, observedAtTick: tick,
      decayRatePerDay: 4, emotionalTag: 'worry',
    })
  }
}
```

- [ ] **Step 4: Run — all tests pass**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): GOODS_CONSUMED food scarcity belief handler"
```

---

## Task 5 — Confidence decay + getBeliefs + duplicate replacement

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.ts`
- Modify: `packages/server/src/projections/beliefProjection.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
it('tick() decays confidence by decayRatePerDay per 24 ticks', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-a', 't_dock']])
  proj.apply(ev(100, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null,
    seizedAtTick: 100, narration: 'x'
  }), locs)
  // tile_safety: decayRatePerDay=2 → after 1 day (24 ticks) confidence drops by 2
  proj.tick(124) // 24 ticks later
  const safety = proj.getBeliefs('npc-a').find(b => b.subject === 'tile_safety')!
  expect(safety.confidence).toBe(88) // 90 - 2
})

it('tick() removes rows when confidence reaches 0', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-a', 't_dock']])
  // Manually write a near-zero confidence row
  proj.apply(ev(0, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null,
    seizedAtTick: 0, narration: 'x'
  }), locs)
  // 45 days × 2/day = 90 → confidence hits 0
  proj.tick(45 * 24)
  expect(proj.getBeliefs('npc-a').find(b => b.subject === 'tile_safety')).toBeUndefined()
})

it('second event on same subject replaces row (latest wins)', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-a', 't_dock']])
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null,
    seizedAtTick: 10, narration: 'x'
  }), locs)
  proj.apply(ev(50, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'militia', previousFactionId: 'guild',
    seizedAtTick: 50, narration: 'x'
  }), locs)
  const allSafety = proj.getBeliefs('npc-a').filter(b => b.subject === 'tile_safety')
  // still just one row (not two)
  expect(allSafety).toHaveLength(1)
  expect(allSafety[0]!.observedAtTick).toBe(50)
})
```

- [ ] **Step 2: Run — confirm new tests fail**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

- [ ] **Step 3: Implement `tick()`**

Replace the `tick` stub in `BeliefProjection`:

```typescript
tick(currentTick: number): void {
  const daysElapsed = Math.floor(currentTick / 24)
  for (const [key, row] of this.rows) {
    const daysObserved = Math.floor(row.observedAtTick / 24)
    const daysPassed = daysElapsed - daysObserved
    if (daysPassed <= 0) continue
    const newConf = row.confidence - row.decayRatePerDay * daysPassed
    if (newConf <= 0) {
      this.rows.delete(key)
    } else {
      this.rows.set(key, { ...row, confidence: newConf, observedAtTick: currentTick })
    }
  }
}
```

Note: `upsert()` uses the `rowKey` which is deterministic, so the second `apply` call for the same npcId+subject+qualifier naturally replaces the first — no extra code needed.

- [ ] **Step 4: Run — all tests pass**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): confidence decay + tick() method"
```

---

## Task 6 — updateEcosystemBeliefs + formatBeliefContext

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.ts`
- Modify: `packages/server/src/projections/beliefProjection.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
it('updateEcosystemBeliefs: densityPct < 0.20 on NPC tile → ecosystem_health depleted', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-h', 't_forest']])
  proj.updateEcosystemBeliefs('t_forest', 0.15, 500, locs)
  const eco = proj.getBeliefs('npc-h').find(b => b.subject === 'ecosystem_health')!
  expect(eco).toBeDefined()
  expect(eco.value).toBe('depleted')
  expect(eco.qualifier).toBe('t_forest')
  expect(eco.confidence).toBe(70)
  expect(eco.emotionalTag).toBe('anger')
})

it('updateEcosystemBeliefs: densityPct >= 0.20 → no belief', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-h', 't_forest']])
  proj.updateEcosystemBeliefs('t_forest', 0.50, 500, locs)
  expect(proj.getBeliefs('npc-h').find(b => b.subject === 'ecosystem_health')).toBeUndefined()
})

it('formatBeliefContext: empty rows → empty string', () => {
  const { formatBeliefContext } = await import('./beliefProjection.js')
  expect(formatBeliefContext([], 0)).toBe('')
})

it('formatBeliefContext: confidence ≥70 → direct statement (no hedge)', () => {
  const { formatBeliefContext } = await import('./beliefProjection.js')
  const rows: BeliefRow[] = [{
    npcId: 'npc-x', subject: 'tile_safety', qualifier: 't_dock',
    value: 'dangerous', confidence: 85, observedAtTick: 0,
    decayRatePerDay: 2, emotionalTag: 'fear'
  }]
  const out = formatBeliefContext(rows, 0)
  expect(out).toContain('危險')
  expect(out).not.toContain('聽說')
  expect(out).not.toContain('也許')
})

it('formatBeliefContext: confidence 40–69 → 「我聽說」hedge', () => {
  const { formatBeliefContext } = await import('./beliefProjection.js')
  const rows: BeliefRow[] = [{
    npcId: 'npc-x', subject: 'tile_safety', qualifier: 't_dock',
    value: 'dangerous', confidence: 50, observedAtTick: 0,
    decayRatePerDay: 2,
  }]
  const out = formatBeliefContext(rows, 0)
  expect(out).toContain('聽說')
})

it('formatBeliefContext: confidence <40 → 「也許」hedge', () => {
  const { formatBeliefContext } = await import('./beliefProjection.js')
  const rows: BeliefRow[] = [{
    npcId: 'npc-x', subject: 'goods_scarcity', qualifier: 'fish',
    value: 'scarce', confidence: 20, observedAtTick: 0,
    decayRatePerDay: 4,
  }]
  const out = formatBeliefContext(rows, 0)
  expect(out).toContain('也許')
})
```

- [ ] **Step 2: Run — confirm new tests fail**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

- [ ] **Step 3: Implement `updateEcosystemBeliefs` + `formatBeliefContext`**

Replace the `updateEcosystemBeliefs` stub in `BeliefProjection`:

```typescript
updateEcosystemBeliefs(
  tileId: string,
  densityPct: number,
  currentTick: number,
  npcLocations: ReadonlyMap<string, string>,
): void {
  if (densityPct >= 0.20) return
  for (const [npcId, npcTile] of npcLocations) {
    const conf = perceiveConfidence(npcTile, tileId)
    if (conf === 0) continue
    const adjustedConf = conf === 90 ? 70 : 30
    this.upsert({
      npcId, subject: 'ecosystem_health', qualifier: tileId,
      value: 'depleted', confidence: adjustedConf, observedAtTick: currentTick,
      decayRatePerDay: 2, emotionalTag: 'anger',
    })
  }
}
```

Add `formatBeliefContext` as an exported function at the bottom of the file:

```typescript
export function formatBeliefContext(rows: readonly BeliefRow[], currentTick: number): string {
  const alive = rows.filter(r => r.confidence > 0)
  if (alive.length === 0) return ''
  const lines = alive.map(r => {
    const daysAgo = Math.floor((currentTick - r.observedAtTick) / 24)
    const hedge = r.confidence >= 70 ? '' : r.confidence >= 40 ? '（我聽說）' : '（也許）'
    return `- ${subjectLabel(r)}：${valueLabel(r.value)}${hedge}，${daysAgo}天前觀察`
  })
  return `【NPC主觀信念 — 可能與事實不符】\n${lines.join('\n')}`
}

function subjectLabel(row: BeliefRow): string {
  switch (row.subject) {
    case 'tile_safety': return `${row.qualifier}安全狀況`
    case 'goods_scarcity': return `${row.qualifier}供應`
    case 'ecosystem_health': return `${row.qualifier}生態`
    case 'faction_control': return `${row.qualifier}控制勢力`
  }
}

function valueLabel(value: BeliefValue): string {
  const map: Record<BeliefValue, string> = {
    dangerous: '危險', safe: '安全',
    scarce: '緊張', abundant: '充裕',
    depleted: '枯竭', recovering: '恢復中',
    controlled: '被控制', contested: '爭奪中', free: '自由',
  }
  return map[value]
}
```

- [ ] **Step 4: Run — all tests pass**

```powershell
npx vitest run src/projections/beliefProjection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full server test suite**

```powershell
npx vitest run
```

Expected: same pass count as before (no regressions).

- [ ] **Step 6: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): ecosystem beliefs + formatBeliefContext"
```

---

## Task 7 — Wire BeliefProjection into runtime.ts

**Files:**
- Modify: `packages/server/src/sim/runtime.ts`

Find these locations in `runtime.ts`:
- Import block (top of file, ~line 213 region)
- Private fields section (~line 520 region)
- Event fan-out loop (~lines 1544–1554)
- Tick/cadence section (search for `TICKS_PER_DAY` or `abandonmentCadence`)
- Boot section (~line 4976 region, after buildingState boot)
- Public getters section (~line 1141 region)

- [ ] **Step 1: Add import**

Near line 213 where `BuildingStateProjection` is imported:

```typescript
import { BeliefProjection, formatBeliefContext } from '../projections/beliefProjection.js'
```

- [ ] **Step 2: Add private field**

Near line 520 where `buildingStateProjection` field is declared:

```typescript
  private readonly beliefProjection = new BeliefProjection()
```

- [ ] **Step 3: Add to event fan-out loop**

In the event fan-out loop, after line 1545 (`this.buildingStateProjection.project(ev)`):

```typescript
      this.beliefProjection.apply(ev, new Map(this.getNpcs().map(n => [n.id, n.location])))
```

- [ ] **Step 4: Add decay cadence**

Find the section in the tick handler where abandonment cadence or other daily cadences run (search for `TICKS_PER_DAY` usage in cadence checks). Add alongside:

```typescript
      // BeliefProjection confidence decay — runs once per in-game day
      if (this.currentTick % TICKS_PER_DAY === 0) {
        this.beliefProjection.tick(this.currentTick)
      }
```

- [ ] **Step 5: Add ecosystem belief cadence**

`EcosystemRegionProjection.list()` returns rows with `{ tileId, pressureLevel }`. High pressure (≥ 80) indicates ecosystem stress — use it as a proxy for low species density.

Find a cadence section in the tick handler. Add (every 48 ticks):

```typescript
      // Ecosystem health beliefs — check ecosystem pressure every 48 ticks
      if (this.currentTick % 48 === 0) {
        const npcLocs = new Map(this.getNpcs().map(n => [n.id, n.location]))
        for (const region of this.ecosystemRegionProjection.list()) {
          // pressureLevel 0-100; high pressure ≈ low species density
          // densityPct = 1 - (pressureLevel / 100); threshold is 0.20 in BeliefProjection
          const densityPct = 1 - (region.pressureLevel / 100)
          this.beliefProjection.updateEcosystemBeliefs(
            region.tileId,
            densityPct,
            this.currentTick,
            npcLocs,
          )
        }
      }
```

`ecosystemRegionProjection.list()` is confirmed to exist (line 64 of `packages/server/src/projections/ecosystemRegion.ts`). No other method names needed.

- [ ] **Step 6: Add public getter**

Near the `getBuildingState` getter (~line 1141):

```typescript
  getBeliefs(npcId: string): readonly import('../projections/beliefProjection.js').BeliefRow[] {
    return this.beliefProjection.getBeliefs(npcId)
  }

  getFormattedBeliefContext(npcId: string): string {
    return formatBeliefContext(this.beliefProjection.getBeliefs(npcId), this.currentTick)
  }
```

- [ ] **Step 7: Build check**

```powershell
cd ..\.. # back to monorepo root
npm run build
```

Expected: clean build (no TypeScript errors). Fix any type errors.

- [ ] **Step 8: Full test suite**

```powershell
cd packages/server
npx vitest run
```

Expected: same pass count as before.

- [ ] **Step 9: Commit**

```powershell
git add packages/server/src/sim/runtime.ts
git commit -m "feat(belief): wire BeliefProjection into runtime (fan-out + decay + ecosystem cadence)"
```

---

## Task 8 — AiDialogContext extension + buildBeliefBlock

**Files:**
- Modify: `packages/server/src/npcs/aiDialog.ts`

- [ ] **Step 1: Add `beliefContext` to AiDialogContext**

In `aiDialog.ts`, find the `AiDialogContext` type (line ~50). Add one field at the end:

```typescript
export type AiDialogContext = Readonly<{
  // ... existing fields unchanged ...
  tileHistoryArcs?: readonly TileHistoryArcContext[]
  beliefContext?: string   // ← add this line
}>
```

- [ ] **Step 2: Add `buildBeliefBlock` function**

Add after the existing `buildSkillBlock` function (~line 524):

```typescript
export function buildBeliefBlock(beliefContext: string | undefined): string[] {
  if (!beliefContext || beliefContext.trim().length === 0) return []
  return [
    beliefContext,
    '',
    '⚠️ 信念使用規則：',
    '- 信心≥70%：可以直接陳述（「我知道...」「那裡很危險...」）',
    '- 信心40–69%：必須用「我聽說」「大概」「好像」等表達',
    '- 信心<40%：必須用「也許」「我不確定」「有人提到但我不知道真假」',
    '- 禁止虛構信念列表以外的地名、人物或事件',
    '',
  ]
}
```

- [ ] **Step 3: Inject `buildBeliefBlock` into `buildSystemPrompt`**

In `buildSystemPrompt`, find where other blocks are spread (e.g., `...buildSkillBlock(ctx.skillLevels),`). Add after it:

```typescript
    ...buildBeliefBlock(ctx.beliefContext),
```

- [ ] **Step 4: Build check**

```powershell
npm run build
```

Expected: clean.

- [ ] **Step 5: Run aiDialog tests if they exist**

```powershell
cd packages/server
npx vitest run src/npcs/aiDialog.test.ts
```

Expected: PASS (new field is optional, no existing tests broken).

- [ ] **Step 6: Commit**

```powershell
git add packages/server/src/npcs/aiDialog.ts
git commit -m "feat(belief): AiDialogContext.beliefContext + buildBeliefBlock prompt injection"
```

---

## Task 9 — Inject beliefs in npc.ts interact endpoint

**Files:**
- Modify: `packages/server/src/http/npc.ts`

In `npc.ts`, the `dialogCtx` is built at ~line 234. The NPC's current tile is at `npcTile` (line ~171).

- [ ] **Step 1: Inject beliefContext into dialogCtx**

Find the block that builds `dialogCtx` (starts at `const dialogCtx: AiDialogContext = {`). After the last spread:

```typescript
          ...(skillLevels ? { skillLevels } : {}),
```

Add:

```typescript
          ...((() => {
            const bc = input.runtime.getFormattedBeliefContext(npcId)
            return bc ? { beliefContext: bc } : {}
          })()),
```

Or equivalently, before the `dialogCtx` object, add:

```typescript
        const beliefCtx = input.runtime.getFormattedBeliefContext(npcId)
```

Then in the spread:

```typescript
          ...(beliefCtx ? { beliefContext: beliefCtx } : {}),
```

- [ ] **Step 2: Build check**

```powershell
npm run build
```

Expected: clean.

- [ ] **Step 3: Run npc router tests**

```powershell
cd packages/server
npx vitest run src/http/npc.test.ts
```

Expected: PASS (belief injection is additive, no existing behavior changes).

- [ ] **Step 4: Commit**

```powershell
git add packages/server/src/http/npc.ts
git commit -m "feat(belief): inject NPC beliefs into AI dialog context"
```

---

## Task 10 — Integration smoke test

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.test.ts`

Add a smoke test confirming the full pipeline: event → belief → formatted context.

- [ ] **Step 1: Add smoke test**

```typescript
it('end-to-end: FACTION_TILE_SEIZED → formatBeliefContext includes hedge-appropriate text', async () => {
  const { formatBeliefContext } = await import('./beliefProjection.js')
  const proj = new BeliefProjection()
  const locs = new Map([['npc-z', 't_dock']])

  // Direct observation (confidence 90 → direct statement, no hedge)
  proj.apply(ev(0, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null,
    seizedAtTick: 0, narration: 'x'
  }), locs)

  const ctx = formatBeliefContext(proj.getBeliefs('npc-z'), 0)
  expect(ctx).toContain('NPC主觀信念')
  expect(ctx).toContain('危險')
  // confidence=90 → no hedge words
  expect(ctx).not.toContain('也許')

  // Adjacent observation (confidence 40 → 我聽說)
  const locs2 = new Map([['npc-z2', 't_central']])
  const proj2 = new BeliefProjection()
  proj2.apply(ev(0, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'guild', previousFactionId: null,
    seizedAtTick: 0, narration: 'x'
  }), locs2)
  const ctx2 = formatBeliefContext(proj2.getBeliefs('npc-z2'), 0)
  expect(ctx2).toContain('聽說')
})
```

- [ ] **Step 2: Run all tests**

```powershell
cd packages/server && npx vitest run
```

Expected: PASS.

- [ ] **Step 3: Full monorepo build**

```powershell
cd ..\.. && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```powershell
git add packages/server/src/projections/beliefProjection.test.ts
git commit -m "test(belief): end-to-end smoke test for belief→dialog pipeline"
```

---

## Task 11 — Docs + PROGRESS.md update

**Files:**
- Modify: `docs/WORLD_CAPABILITIES.md`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Mark Layer 2 Belief+Perception shipped in WORLD_CAPABILITIES.md**

Find the §12.5 section. In the Part II verified baseline or Phase IV plan entry for "Layer 2 Cognitive Runtime", add a note:

```
v0.50.0: BeliefProjection shipped — Belief+Perception layer operational.
4 belief subjects (tile_safety, goods_scarcity, ecosystem_health, faction_control).
NPC dialog now references subjective beliefs with confidence-hedged language.
```

- [ ] **Step 2: Update PROGRESS.md**

Replace the current version header and update the handoff snapshot:

```markdown
## v0.50.0 — NPC Belief + Perception (2026-05-22)

**What shipped:**
- `BeliefProjection` — event-sourced subjective NPC worldview (4 belief types)
- Triggers: FACTION_TILE_SEIZED (tile_safety + faction_control), ANIMAL_ATTACKED_NPC (tile_safety),
  GOODS_CONSUMED food (goods_scarcity), ecosystem cadence (ecosystem_health)
- Locality-based perception: same-tile = 85–95% confidence, adjacent = 35–50%
- Confidence decay: `tick(currentTick)` every TICKS_PER_DAY; rows at ≤0 deleted
- Dialog integration: `AiDialogContext.beliefContext` + `buildBeliefBlock` prompt injection
- `buildBeliefBlock` injects hedge-language rules (≥70 direct, 40–69 "我聽說", <40 "也許")

**Critical facts:**
- BeliefProjection does NOT boot-hydrate from EventLog (needs NPC location at event-time)
- Beliefs repopulate from live events within minutes of restart
- TILE_ADJACENCY is defined in beliefProjection.ts — must stay in sync with world map
- `apply(event, npcLocations)` called in runtime.ts fan-out loop per event

**Next:** NPC Intention layer (v0.51) — long-term/short-term IntentStack driving behavior changes
```

- [ ] **Step 3: Run build + tests one final time**

```powershell
cd D:\Projects\_HomeProject\greed-island
npm run build
cd packages/server && npx vitest run
```

Expected: clean build + all tests pass.

- [ ] **Step 4: Commit + push**

```powershell
git add docs/WORLD_CAPABILITIES.md PROGRESS.md
git commit -m "docs: v0.50.0 handoff — NPC Belief+Perception layer"
git push
```

---

## Implementation Notes

**Key invariants the implementer must not break:**

1. `BeliefProjection.apply()` is called inside the event fan-out loop, which runs on every committed event. It must never throw — wrap in try/catch if uncertain about payload shape.

2. `readPayloadData(event)` extracts `event.payload.data` (not flat `event.payload`) — this is the kernel Event shape. All three event types (FACTION_TILE_SEIZED, ANIMAL_ATTACKED_NPC, GOODS_CONSUMED) follow this pattern.

3. `perceiveConfidence(npcTile, eventTile)`: direct = 90, adjacent = 40, non-adjacent = 0. The exact confidence values are contract — tests assert them.

4. `tick()` updates `observedAtTick` to `currentTick` when decaying (so decay is calculated from the last decay tick, not the original observation). Without this update, rows decay faster than expected on each subsequent call.

5. `upsert()` uses `rowKey(npcId, subject, qualifier)` as Map key — so a second event on the same subject+qualifier naturally replaces the first row. "Latest observation wins" is automatic.

6. `getFormattedBeliefContext(npcId)` on `SimulationRuntime` calls both `getBeliefs` and `formatBeliefContext` and is the single call site in `npc.ts`.

7. `buildBeliefBlock` in `aiDialog.ts` receives the pre-formatted string (not raw rows) — aiDialog.ts does not import from beliefProjection.ts.

**Confirmed ecosystem projection methods:**

- `this.ecosystemRegionProjection.list()` → `EcosystemRegionRow[]` with `{ tileId, pressureLevel }`. Confirmed in `packages/server/src/projections/ecosystemRegion.ts:64`.
- `GOODS_CONSUMED` payload includes `tileId` (confirmed from settlement food consumption emitter in `runtime.ts:3748`).
- `animalPopulationProjection` has `list()` → `AnimalPopulationRow[]` and `countSpeciesOnTile(speciesId, tileId)`, but no per-tile total method — use `ecosystemRegionProjection.list()` pressure proxy instead (see Task 7 Step 5).
