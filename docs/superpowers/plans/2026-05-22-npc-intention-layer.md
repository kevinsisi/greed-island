# NPC Intention Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire NPC beliefs (v0.50.0 BeliefProjection) to physical behavior via a rule-based IntentStack — NPCs flee dangerous tiles, seek food, avoid enemy faction zones, and adjust behavior weights from accumulated outcomes (Reflection / learning).

**Architecture:** `IntentPlanner` (pure functions) computes `IntentStack` from beliefs + profile weights + learning multipliers; `IntentProjection` stores `Reflection` records event-sourced from `NPC_INTENT_RESOLVED` events for boot-persistent learning; `NpcRuntimeState.intentOverride` (highest-priority targetTile) drives physical NPC movement. Runtime orchestrates intent resolution detection (pre-NpcEngine-tick) and recomputation cadence (post-belief-update).

**Tech Stack:** TypeScript, Vitest, existing `BeliefProjection`, `NpcEngine`, `SimulationRuntime`, `livingWorldCommands.ts` event pattern.

---

## File Map

| Op | Path | Responsibility |
|---|---|---|
| MODIFY | `packages/server/src/config/world.ts` | 5 new constants (INTENT_*) |
| MODIFY | `packages/server/src/kernel/livingWorldCommands.ts` | `IntentKind` type + `NpcIntentResolvedCmd` + register event |
| MODIFY | `packages/server/src/projections/beliefProjection.ts` | Add `factionId?: string` to `BeliefRow`; store in faction_control upsert |
| MODIFY | `packages/server/src/sim/npcEngine.ts` | Import `IntentKind`; add `intentOverride` to `NpcRuntimeState`; `setIntentOverride` / `clearIntentOverride`; targetTile priority |
| CREATE | `packages/server/src/projections/intentProjection.ts` | `Reflection` type + `IntentProjection` class (event-sourced) |
| CREATE | `packages/server/src/projections/intentProjection.test.ts` | 12 tests |
| CREATE | `packages/server/src/sim/intentPlanner.ts` | `IntentEntry`, `IntentStack`, `computeIntentStack`, `selectHighestIntent` (pure) |
| CREATE | `packages/server/src/sim/intentPlanner.test.ts` | 18 tests |
| MODIFY | `packages/server/src/sim/runtime.ts` | Wire intentProjection field + resolution detection + recompute cadence + fan-out + boot hydration |
| MODIFY | `docs/WORLD_CAPABILITIES.md` | §12.5.6 shipped note |
| MODIFY | `PROGRESS.md` | v0.51.0 handoff snapshot |

---

### Task 1: Add constants to config/world.ts

**Files:**
- Modify: `packages/server/src/config/world.ts`

- [ ] **Step 1: Add the five new constants after `MORTALITY_CADENCE_TICKS` (line ~248)**

```typescript
// NPC Intention Layer (v0.51.0)
export const INTENT_RECOMPUTE_INTERVAL = TICKS_PER_HOUR * 2
export const INTENT_OVERRIDE_DURATION_TICKS = TICKS_PER_HOUR * 6
export const INTENT_URGENCY_THRESHOLD = 30
export const REFLECTION_DURATION_TICKS = TICKS_PER_DAY * 30
export const MAX_REFLECTIONS_PER_NPC = 20
```

- [ ] **Step 2: Verify build passes**

```bash
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/config/world.ts
git commit -m "feat(config): add NPC intention layer constants (v0.51.0)"
```

---

### Task 2: Add IntentKind + NPC_INTENT_RESOLVED to livingWorldCommands.ts

**Files:**
- Modify: `packages/server/src/kernel/livingWorldCommands.ts`

Context: `LIVING_WORLD_COMMAND_TYPES` is a `const` array ending around line 198. `LivingWorldCommandPayload` union ends around line 1480 with `| FactionNpcLoyaltyShiftedCmd`. New type definitions go after line 372 (`FactionNpcLoyaltyShiftedCmd` definition).

- [ ] **Step 1: Add `IntentKind` and `NpcIntentResolvedCmd` type definitions after `FactionNpcLoyaltyShiftedCmd` definition (after line ~372)**

```typescript
// NPC Intention Layer (v0.51.0)
export type IntentKind = 'survival' | 'economic' | 'social' | 'ecosystem'

export type NpcIntentResolvedCmd = Readonly<{
  npcId: string
  intentType: IntentKind
  targetTile: string
  outcome: 'success' | 'failure'
  urgencyAtDispatch: number
  resolvedAtTick: number
}>
```

- [ ] **Step 2: Register `'NPC_INTENT_RESOLVED'` in `LIVING_WORLD_COMMAND_TYPES` array (before the `] as const` that closes the array, after `'FACTION_NPC_LOYALTY_SHIFTED'`)**

```typescript
  // NPC Intention Layer (v0.51.0)
  'NPC_INTENT_RESOLVED',
] as const
```

- [ ] **Step 3: Add `| NpcIntentResolvedCmd` to `LivingWorldCommandPayload` union (after `| FactionNpcLoyaltyShiftedCmd`)**

```typescript
  | FactionNpcLoyaltyShiftedCmd
  | NpcIntentResolvedCmd
```

- [ ] **Step 4: Verify build passes**

```bash
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/kernel/livingWorldCommands.ts
git commit -m "feat(events): add NPC_INTENT_RESOLVED event type and IntentKind (v0.51.0)"
```

---

### Task 3: Extend BeliefRow with factionId

**Files:**
- Modify: `packages/server/src/projections/beliefProjection.ts`
- Test: `packages/server/src/projections/beliefProjection.test.ts`

Context: `BeliefRow` interface is around line 20. `applyFactionSeized()` writes the faction_control upsert at line ~83. The `readStr` helper exists internally; `data.factionId` is in the event payload (same as `data.tileId`).

- [ ] **Step 1: Write the failing test — add to `beliefProjection.test.ts` inside the `describe('BeliefProjection')` block**

```typescript
it('FACTION_TILE_SEIZED → faction_control belief stores factionId', () => {
  const proj = new BeliefProjection()
  const locs = new Map([['npc-a', 't_dock']])
  proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
    tileId: 't_dock', factionId: 'militia', previousFactionId: null,
    seizedAtTick: 10, narration: 'x'
  }), locs)
  const ctrl = proj.getBeliefs('npc-a').find(b => b.subject === 'faction_control')!
  expect(ctrl.factionId).toBe('militia')
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd packages/server && npx vitest run src/projections/beliefProjection.test.ts
```

Expected: FAIL — `ctrl.factionId` is undefined.

- [ ] **Step 3: Add `factionId?: string` to `BeliefRow` interface**

Add after `decayRatePerDay: number`:
```typescript
factionId?: string
```

- [ ] **Step 4: Pass factionId in `applyFactionSeized()` — replace the faction_control upsert block**

```typescript
// In applyFactionSeized(), replace the second upsert (faction_control):
const factionId = readStr(data.factionId)
this.upsert({
  npcId, subject: 'faction_control', qualifier: tileId,
  value: 'controlled', confidence: conf, observedAtTick: tick,
  decayRatePerDay: 1, factionId: factionId || undefined,
})
```

- [ ] **Step 5: Run tests — all 24 must pass**

```bash
cd packages/server && npx vitest run src/projections/beliefProjection.test.ts
```

Expected: 24 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/projections/beliefProjection.ts packages/server/src/projections/beliefProjection.test.ts
git commit -m "feat(belief): store factionId in faction_control BeliefRow (v0.51.0)"
```

---

### Task 4: Add intentOverride to NpcRuntimeState + set/clear methods

**Files:**
- Modify: `packages/server/src/sim/npcEngine.ts`
- Modify: `packages/server/src/sim/npcEngine.test.ts`

Context:
- `NpcRuntimeState` is at line ~163. `personalityOverride` is line 179.
- `hydrate()` is at line ~377. personalityOverride deserialization ends ~line 398.
- `const next: NpcRuntimeState` object is at line ~422.
- `targetTile` assignment is at line ~825: `const targetTile = personalityOverride?.targetTile ?? scheduleTarget`
- `IntentKind` will be imported from `'../kernel/livingWorldCommands.js'`

- [ ] **Step 1: Write failing tests — add to `npcEngine.test.ts`**

```typescript
import { NpcEngine, type NpcRuntimeState } from './npcEngine.js'
// (NpcEngine already imported; add to existing describe block)

it('setIntentOverride sets intentOverride on NPC state', () => {
  const engine = new NpcEngine([makeProfile()])
  engine.setIntentOverride('test.npc', {
    targetTile: 't_dock',
    expiresAtTick: 9999,
    intentType: 'survival',
    urgency: 80,
    reason: 'flee test',
  })
  const state = engine.getState('test.npc')!
  expect(state.intentOverride?.targetTile).toBe('t_dock')
  expect(state.intentOverride?.intentType).toBe('survival')
  expect(state.intentOverride?.urgency).toBe(80)
})

it('clearIntentOverride removes intentOverride', () => {
  const engine = new NpcEngine([makeProfile()])
  engine.setIntentOverride('test.npc', {
    targetTile: 't_dock', expiresAtTick: 9999, intentType: 'survival', urgency: 80, reason: 'test'
  })
  engine.clearIntentOverride('test.npc')
  const state = engine.getState('test.npc')!
  expect(state.intentOverride ?? null).toBeNull()
})

it('intentOverride.targetTile takes priority over scheduleTarget in tick', () => {
  const engine = new NpcEngine([makeProfile()])
  // During first half of day, schedule sends NPC to t_central
  // We override with t_mountain — the engine should use t_mountain as the target
  engine.setIntentOverride('test.npc', {
    targetTile: 't_mountain',
    expiresAtTick: TICKS_PER_DAY,
    intentType: 'survival',
    urgency: 80,
    reason: 'flee',
  })
  engine.tick(1, {
    areaSafety: new Map(), areaEconomy: new Map(),
    weather: '晴', rareWindowOpen: false
  })
  const state = engine.getState('test.npc')!
  expect(state.targetTile).toBe('t_mountain')
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd packages/server && npx vitest run src/sim/npcEngine.test.ts
```

Expected: 3 new tests FAIL (setIntentOverride not a function).

- [ ] **Step 3: Add `import type { IntentKind } from '../kernel/livingWorldCommands.js'` to npcEngine.ts imports**

Add after the existing imports at the top of npcEngine.ts:
```typescript
import type { IntentKind } from '../kernel/livingWorldCommands.js'
```

- [ ] **Step 4: Add `intentOverride` field to `NpcRuntimeState` after `personalityOverride` (line ~179)**

```typescript
/** v0.51.0: Belief-driven intent override — highest-priority targetTile. Cleared after NPC arrives or expires. */
intentOverride?: {
  targetTile: string
  expiresAtTick: number
  intentType: IntentKind
  urgency: number
  reason: string
} | null
```

- [ ] **Step 5: Add intentOverride deserialization in `hydrate()` after personalityOverride block (after line ~398, before `let travelRoute`)**

```typescript
let intentOverride: NpcRuntimeState['intentOverride'] = null
if (r.intentOverride && typeof r.intentOverride === 'object') {
  const io = r.intentOverride as Partial<{
    targetTile: string; expiresAtTick: number; intentType: string; urgency: number; reason: string
  }>
  if (typeof io.targetTile === 'string' && typeof io.expiresAtTick === 'number') {
    intentOverride = {
      targetTile: io.targetTile,
      expiresAtTick: io.expiresAtTick,
      intentType: (io.intentType ?? 'survival') as IntentKind,
      urgency: typeof io.urgency === 'number' ? io.urgency : 0,
      reason: typeof io.reason === 'string' ? io.reason : 'persisted',
    }
  }
}
```

- [ ] **Step 6: Add `intentOverride,` to `const next: NpcRuntimeState` initialization object (after `personalityOverride,`)**

```typescript
intentOverride,
```

- [ ] **Step 7: Change targetTile priority at line ~825**

Replace:
```typescript
const targetTile = personalityOverride?.targetTile ?? scheduleTarget
```
With:
```typescript
const targetTile = before.intentOverride?.targetTile
  ?? personalityOverride?.targetTile
  ?? scheduleTarget
```

- [ ] **Step 8: Add `setIntentOverride` and `clearIntentOverride` public methods — add after the `hydrate` method (line ~448)**

```typescript
setIntentOverride(npcId: string, override: NonNullable<NpcRuntimeState['intentOverride']>): void {
  const state = this.state.get(npcId)
  if (!state) return
  this.state.set(npcId, { ...state, intentOverride: override })
}

clearIntentOverride(npcId: string): void {
  const state = this.state.get(npcId)
  if (!state) return
  this.state.set(npcId, { ...state, intentOverride: null })
}
```

- [ ] **Step 9: Run tests — all must pass**

```bash
cd packages/server && npx vitest run src/sim/npcEngine.test.ts
```

Expected: all tests pass (existing + 3 new).

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/sim/npcEngine.ts packages/server/src/sim/npcEngine.test.ts
git commit -m "feat(npc): add intentOverride to NpcRuntimeState with set/clear methods (v0.51.0)"
```

---

### Task 5: Create IntentProjection

**Files:**
- Create: `packages/server/src/projections/intentProjection.ts`
- Create: `packages/server/src/projections/intentProjection.test.ts`

- [ ] **Step 1: Write failing tests — create `intentProjection.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { IntentProjection } from './intentProjection.js'
import type { Event } from '../kernel/types.js'
import { TICKS_PER_DAY } from '../config/world.js'

function mkEvent(
  tick: number,
  npcId: string,
  intentType: string,
  outcome: 'success' | 'failure',
): Event {
  return {
    id: `ev-${tick}-${npcId}`,
    eventType: 'NPC_INTENT_RESOLVED',
    actorId: npcId,
    sequence: tick,
    tick,
    timestamp: new Date().toISOString(),
    payload: {
      data: {
        npcId,
        intentType,
        outcome,
        targetTile: 't_central',
        urgencyAtDispatch: 50,
        resolvedAtTick: tick,
      },
    },
  } as unknown as Event
}

describe('IntentProjection', () => {
  it('getReflections returns empty for unknown npc', () => {
    expect(new IntentProjection().getReflections('npc-x')).toHaveLength(0)
  })

  it('getLearningWeights returns {} for unknown npc', () => {
    expect(new IntentProjection().getLearningWeights('npc-x', 100)).toEqual({})
  })

  it('success outcome → reflection urgencyDelta=+0.1, emotionalImpact=+10', () => {
    const proj = new IntentProjection()
    proj.project(mkEvent(0, 'npc-a', 'survival', 'success'))
    const r = proj.getReflections('npc-a')
    expect(r).toHaveLength(1)
    expect(r[0]!.urgencyDelta).toBe(0.1)
    expect(r[0]!.emotionalImpact).toBe(10)
    expect(r[0]!.intentType).toBe('survival')
  })

  it('failure outcome → reflection urgencyDelta=-0.1, emotionalImpact=-10', () => {
    const proj = new IntentProjection()
    proj.project(mkEvent(0, 'npc-a', 'economic', 'failure'))
    const r = proj.getReflections('npc-a')
    expect(r[0]!.urgencyDelta).toBe(-0.1)
    expect(r[0]!.emotionalImpact).toBe(-10)
  })

  it('getLearningWeights: one success → multiplier 1.1', () => {
    const proj = new IntentProjection()
    proj.project(mkEvent(0, 'npc-a', 'survival', 'success'))
    expect(proj.getLearningWeights('npc-a', 100).survival).toBeCloseTo(1.1)
  })

  it('getLearningWeights: one failure → multiplier 0.9', () => {
    const proj = new IntentProjection()
    proj.project(mkEvent(0, 'npc-a', 'survival', 'failure'))
    expect(proj.getLearningWeights('npc-a', 100).survival).toBeCloseTo(0.9)
  })

  it('getLearningWeights: 6 successes clamps at 1.5', () => {
    const proj = new IntentProjection()
    for (let i = 0; i < 6; i++) proj.project(mkEvent(i * 10, 'npc-a', 'survival', 'success'))
    expect(proj.getLearningWeights('npc-a', 100).survival).toBeLessThanOrEqual(1.5)
  })

  it('getLearningWeights: 6 failures clamps at 0.5', () => {
    const proj = new IntentProjection()
    for (let i = 0; i < 6; i++) proj.project(mkEvent(i * 10, 'npc-a', 'survival', 'failure'))
    expect(proj.getLearningWeights('npc-a', 100).survival).toBeGreaterThanOrEqual(0.5)
  })

  it('getLearningWeights: expired reflection not counted', () => {
    const proj = new IntentProjection()
    proj.project(mkEvent(0, 'npc-a', 'survival', 'success'))
    // REFLECTION_DURATION_TICKS = TICKS_PER_DAY * 30
    expect(proj.getLearningWeights('npc-a', TICKS_PER_DAY * 31).survival).toBeUndefined()
  })

  it('different intentTypes tracked independently', () => {
    const proj = new IntentProjection()
    proj.project(mkEvent(0, 'npc-a', 'survival', 'success'))
    proj.project(mkEvent(1, 'npc-a', 'economic', 'failure'))
    const w = proj.getLearningWeights('npc-a', 100)
    expect(w.survival).toBeCloseTo(1.1)
    expect(w.economic).toBeCloseTo(0.9)
  })

  it('ignores non-NPC_INTENT_RESOLVED events', () => {
    const proj = new IntentProjection()
    const other = {
      id: 'x', eventType: 'FACTION_TILE_SEIZED', actorId: 'sys', sequence: 1, tick: 1,
      timestamp: '', payload: { data: {} },
    } as unknown as Event
    proj.project(other)
    expect(proj.getReflections('npc-x')).toHaveLength(0)
  })

  it('caps at MAX_REFLECTIONS_PER_NPC=20, oldest dropped', () => {
    const proj = new IntentProjection()
    for (let i = 0; i < 25; i++) proj.project(mkEvent(i * 10, 'npc-a', 'survival', 'success'))
    expect(proj.getReflections('npc-a')).toHaveLength(20)
  })

  it('rebuildFromEvents restores state: net +0.1 -0.1 = 1.0 multiplier', () => {
    const events = [mkEvent(0, 'npc-a', 'survival', 'success'), mkEvent(10, 'npc-a', 'survival', 'failure')]
    const proj = new IntentProjection()
    proj.rebuildFromEvents(events)
    expect(proj.getReflections('npc-a')).toHaveLength(2)
    const w = proj.getLearningWeights('npc-a', 100)
    expect(w.survival).toBeCloseTo(1.0)
  })
})
```

- [ ] **Step 2: Run to confirm all 12 tests fail**

```bash
cd packages/server && npx vitest run src/projections/intentProjection.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `intentProjection.ts`**

```typescript
import type { Event } from '../kernel/types.js'
import type { IntentKind } from '../kernel/livingWorldCommands.js'
import { MAX_REFLECTIONS_PER_NPC, REFLECTION_DURATION_TICKS } from '../config/world.js'

export interface Reflection {
  triggeringEventId: string
  intentType: IntentKind
  emotionalImpact: number
  urgencyDelta: number
  startTick: number
  durationTicks: number
}

export const INTENT_PROJECTION_BOOT_EVENT_TYPES = ['NPC_INTENT_RESOLVED'] as const

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  return payload as Record<string, unknown>
}

export class IntentProjection {
  private readonly reflectionsByNpc = new Map<string, Reflection[]>()

  project(event: Event): void {
    if (event.eventType !== 'NPC_INTENT_RESOLVED') return
    const data = readData(event)
    if (!data) return
    const npcId = typeof data.npcId === 'string' ? data.npcId : null
    const intentType = typeof data.intentType === 'string' ? data.intentType as IntentKind : null
    const outcome = data.outcome === 'success' ? 'success'
      : data.outcome === 'failure' ? 'failure' : null
    if (!npcId || !intentType || !outcome) return

    const reflection: Reflection = {
      triggeringEventId: String(event.sequence ?? event.id),
      intentType,
      emotionalImpact: outcome === 'success' ? 10 : -10,
      urgencyDelta: outcome === 'success' ? 0.1 : -0.1,
      startTick: event.tick ?? 0,
      durationTicks: REFLECTION_DURATION_TICKS,
    }

    const list = this.reflectionsByNpc.get(npcId) ?? []
    list.push(reflection)
    if (list.length > MAX_REFLECTIONS_PER_NPC) list.shift()
    this.reflectionsByNpc.set(npcId, list)
  }

  getLearningWeights(
    npcId: string,
    currentTick: number,
  ): Readonly<Partial<Record<IntentKind, number>>> {
    const reflections = this.reflectionsByNpc.get(npcId) ?? []
    const active = reflections.filter(r => currentTick - r.startTick < r.durationTicks)
    if (active.length === 0) return {}

    const totals: Partial<Record<IntentKind, number>> = {}
    for (const r of active) {
      totals[r.intentType] = (totals[r.intentType] ?? 0) + r.urgencyDelta
    }

    const result: Partial<Record<IntentKind, number>> = {}
    for (const [kind, delta] of Object.entries(totals) as [IntentKind, number][]) {
      result[kind] = Math.max(0.5, Math.min(1.5, 1.0 + delta))
    }
    return result
  }

  getReflections(npcId: string): readonly Reflection[] {
    return this.reflectionsByNpc.get(npcId) ?? []
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.reflectionsByNpc.clear()
    for (const ev of events) this.project(ev)
  }
}
```

- [ ] **Step 4: Run tests — all 12 must pass**

```bash
cd packages/server && npx vitest run src/projections/intentProjection.test.ts
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/projections/intentProjection.ts packages/server/src/projections/intentProjection.test.ts
git commit -m "feat(projection): IntentProjection with Reflection-based learning (v0.51.0)"
```

---

### Task 6: Create IntentPlanner (pure functions)

**Files:**
- Create: `packages/server/src/sim/intentPlanner.ts`
- Create: `packages/server/src/sim/intentPlanner.test.ts`

Context: `MAP_ADJACENCY` in `mapGraph.ts` has the correct world adjacency (use this, NOT `TILE_ADJACENCY` from beliefProjection which is a separate, simplified copy). `BeliefRow` is from `beliefProjection.ts`. `NpcProfile` has `personality: Record<string, number|string>` with optional keys `safetyWeight`, `economyWeight`, `factionLoyalty`. `IntentKind` and `NpcRuntimeState['intentOverride']` from their respective files.

- [ ] **Step 1: Write failing tests — create `intentPlanner.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { computeIntentStack, selectHighestIntent } from './intentPlanner.js'
import type { BeliefRow } from '../projections/beliefProjection.js'
import type { NpcProfile } from '../npcs/types.js'
import { TICKS_PER_DAY } from '../config/world.js'

function makeProfile(overrides: Partial<NpcProfile['personality']> = {}): NpcProfile {
  return {
    id: 'npc-test',
    name: { zh: '測試', en: 'Test' },
    role: { zh: '測試', en: 'Test' },
    defaultLocation: 't_central',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'neutral', ...overrides },
  }
}

function makeBeliefRow(overrides: Partial<BeliefRow>): BeliefRow {
  return {
    npcId: 'npc-test', subject: 'tile_safety', qualifier: 't_forest',
    value: 'dangerous', confidence: 80, observedAtTick: 0,
    decayRatePerDay: 2, emotionalTag: 'fear',
    ...overrides,
  }
}

describe('computeIntentStack', () => {
  it('returns empty entries when no relevant beliefs', () => {
    const stack = computeIntentStack('npc-test', [], makeProfile(), {}, 't_central', 'neutral', 0)
    expect(stack.entries).toHaveLength(0)
  })

  it('survival intent fires on current tile tile_safety=dangerous', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'tile_safety', qualifier: 't_forest', value: 'dangerous', confidence: 80 }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_forest', 'neutral', 0)
    const s = stack.entries.find(e => e.kind === 'survival')
    expect(s).toBeDefined()
    expect(s!.urgency).toBeCloseTo(80) // conf 80 × safetyWeight 1.0 × multiplier 1.0
  })

  it('survival intent does NOT fire when current tile has no danger belief', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'tile_safety', qualifier: 't_dock', value: 'dangerous', confidence: 80 }),
    ]
    // NPC is on t_forest, danger belief is about t_dock — no survival intent
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_forest', 'neutral', 0)
    expect(stack.entries.find(e => e.kind === 'survival')).toBeUndefined()
  })

  it('survival targetTile is a safe adjacent tile (MAP_ADJACENCY)', () => {
    // NPC on t_forest; t_dock is adjacent (MAP_ADJACENCY: t_forest → t_desert,t_mountain,t_central)
    // We give dangerous belief for t_forest, no beliefs for t_mountain or t_central
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'tile_safety', qualifier: 't_forest', value: 'dangerous', confidence: 70 }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_forest', 'neutral', 0)
    const s = stack.entries.find(e => e.kind === 'survival')!
    // targetTile must be one of MAP_ADJACENCY['t_forest'] = ['t_desert','t_mountain','t_central']
    expect(['t_desert', 't_mountain', 't_central']).toContain(s.targetTile)
  })

  it('economic intent fires on current tile goods_scarcity=scarce', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'goods_scarcity', qualifier: 't_dock', value: 'scarce', confidence: 60, emotionalTag: 'worry' }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile({ economyWeight: 0.7 }), {}, 't_dock', 'neutral', 0)
    const e = stack.entries.find(e => e.kind === 'economic')
    expect(e).toBeDefined()
    expect(e!.urgency).toBeCloseTo(42) // 60 × 0.7 × 1.0
  })

  it('economic intent does NOT fire when scarcity is on a different tile', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'goods_scarcity', qualifier: 't_dock', value: 'scarce', confidence: 60, emotionalTag: 'worry' }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_forest', 'neutral', 0)
    expect(stack.entries.find(e => e.kind === 'economic')).toBeUndefined()
  })

  it('ecosystem intent fires on current tile ecosystem_health=depleted', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'ecosystem_health', qualifier: 't_forest', value: 'depleted', confidence: 70, emotionalTag: 'anger' }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_forest', 'neutral', 0)
    const eco = stack.entries.find(e => e.kind === 'ecosystem')
    expect(eco).toBeDefined()
    expect(eco!.urgency).toBeCloseTo(28) // 70 × 0.4 × 1.0
  })

  it('social intent fires when faction_control=controlled by enemy faction', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'faction_control', qualifier: 't_dock', value: 'controlled', confidence: 80, factionId: 'guild' }),
    ]
    const profile = makeProfile({ factionLoyalty: 0.8 })
    // NPC is from 'temple_guard' faction; 'guild' controls t_dock — enemy territory
    const stack = computeIntentStack('npc-test', beliefs, profile, {}, 't_dock', 'temple_guard', 0)
    const social = stack.entries.find(e => e.kind === 'social')
    expect(social).toBeDefined()
    expect(social!.urgency).toBeCloseTo(64) // 80 × 0.8 × 1.0
  })

  it('social intent does NOT fire when faction_control is own faction', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'faction_control', qualifier: 't_dock', value: 'controlled', confidence: 80, factionId: 'guild' }),
    ]
    // NPC IS from 'guild' — home territory, no flee intent
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_dock', 'guild', 0)
    expect(stack.entries.find(e => e.kind === 'social')).toBeUndefined()
  })

  it('social intent does NOT fire for neutral NPC', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'faction_control', qualifier: 't_dock', value: 'controlled', confidence: 80, factionId: 'guild' }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), {}, 't_dock', 'neutral', 0)
    expect(stack.entries.find(e => e.kind === 'social')).toBeUndefined()
  })

  it('entries sorted descending by urgency', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'tile_safety', qualifier: 't_forest', value: 'dangerous', confidence: 40 }),
      makeBeliefRow({ subject: 'goods_scarcity', qualifier: 't_forest', value: 'scarce', confidence: 90, emotionalTag: 'worry' }),
    ]
    const profile = makeProfile({ economyWeight: 0.9 })
    const stack = computeIntentStack('npc-test', beliefs, profile, {}, 't_forest', 'neutral', 0)
    for (let i = 0; i < stack.entries.length - 1; i++) {
      expect(stack.entries[i]!.urgency).toBeGreaterThanOrEqual(stack.entries[i + 1]!.urgency)
    }
  })

  it('learningWeights multiplier applied to urgency', () => {
    const beliefs: BeliefRow[] = [
      makeBeliefRow({ subject: 'tile_safety', qualifier: 't_forest', value: 'dangerous', confidence: 80 }),
    ]
    const stack = computeIntentStack('npc-test', beliefs, makeProfile(), { survival: 1.3 }, 't_forest', 'neutral', 0)
    const s = stack.entries.find(e => e.kind === 'survival')!
    expect(s.urgency).toBeCloseTo(104) // 80 × 1.0 × 1.3 = 104, clamped to 100
    expect(s.urgency).toBeLessThanOrEqual(100) // clamped
  })
})

describe('selectHighestIntent', () => {
  function mkStack(urgency: number): import('./intentPlanner.js').IntentStack {
    return {
      npcId: 'npc-a',
      computedAtTick: 0,
      entries: urgency > 0 ? [{ kind: 'survival', urgency, targetTile: 't_central', reason: 'test' }] : [],
    }
  }

  it('returns null when entries is empty', () => {
    expect(selectHighestIntent(mkStack(0), 30, null)).toBeNull()
  })

  it('returns null when highest urgency below threshold', () => {
    expect(selectHighestIntent(mkStack(20), 30, null)).toBeNull()
  })

  it('returns entry when urgency >= threshold and no current override', () => {
    const best = selectHighestIntent(mkStack(50), 30, null)
    expect(best).not.toBeNull()
    expect(best!.kind).toBe('survival')
  })

  it('returns null when new urgency < currentOverride.urgency × 1.5 (no thrashing)', () => {
    const current = { targetTile: 't_dock', expiresAtTick: 9999, intentType: 'survival' as const, urgency: 60, reason: 'existing' }
    // new urgency=50, current=60 → 50 < 60×1.5=90 → do not replace
    expect(selectHighestIntent(mkStack(50), 30, current)).toBeNull()
  })

  it('returns entry when new urgency >= currentOverride.urgency × 1.5', () => {
    const current = { targetTile: 't_dock', expiresAtTick: 9999, intentType: 'survival' as const, urgency: 30, reason: 'existing' }
    // new urgency=50, current=30 → 50 >= 30×1.5=45 → replace
    expect(selectHighestIntent(mkStack(50), 30, current)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd packages/server && npx vitest run src/sim/intentPlanner.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `intentPlanner.ts`**

```typescript
import type { NpcProfile } from '../npcs/types.js'
import type { BeliefRow } from '../projections/beliefProjection.js'
import type { IntentKind } from '../kernel/livingWorldCommands.js'
import type { NpcRuntimeState } from './npcEngine.js'
import { MAP_ADJACENCY } from './mapGraph.js'

export interface IntentEntry {
  kind: IntentKind
  urgency: number
  targetTile: string
  reason: string
}

export interface IntentStack {
  npcId: string
  entries: IntentEntry[]
  computedAtTick: number
}

function numOrDefault(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function adjacentTo(tile: string): readonly string[] {
  return MAP_ADJACENCY[tile] ?? []
}

function safestNeighbor(tile: string, beliefs: readonly BeliefRow[], fallback: string): string {
  const neighbors = adjacentTo(tile)
  if (neighbors.length === 0) return fallback
  const dangerSet = new Set(
    beliefs.filter(b => b.subject === 'tile_safety' && b.value === 'dangerous').map(b => b.qualifier)
  )
  const safe = neighbors.filter(n => !dangerSet.has(n))
  if (safe.length > 0) return safe[0]!
  // All neighbors have danger beliefs — pick lowest-confidence dangerous tile
  return neighbors.reduce((best, n) => {
    const bc = beliefs.find(b => b.subject === 'tile_safety' && b.qualifier === n)?.confidence ?? 0
    const bestC = beliefs.find(b => b.subject === 'tile_safety' && b.qualifier === best)?.confidence ?? 0
    return bc < bestC ? n : best
  }, neighbors[0]!)
}

function abundantNeighbor(tile: string, beliefs: readonly BeliefRow[], fallback: string): string {
  const neighbors = adjacentTo(tile)
  if (neighbors.length === 0) return fallback
  return (
    neighbors.find(
      n => !beliefs.some(b => b.subject === 'goods_scarcity' && b.qualifier === n && b.value === 'scarce')
    ) ?? fallback
  )
}

function healthyNeighbor(tile: string, beliefs: readonly BeliefRow[], fallback: string): string {
  const neighbors = adjacentTo(tile)
  if (neighbors.length === 0) return fallback
  const depleted = new Set(
    beliefs.filter(b => b.subject === 'ecosystem_health' && b.value === 'depleted').map(b => b.qualifier)
  )
  return neighbors.find(n => !depleted.has(n)) ?? fallback
}

function survivalEntry(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  tile: string,
  multiplier: number,
): IntentEntry | null {
  const b = beliefs.find(r => r.subject === 'tile_safety' && r.value === 'dangerous' && r.qualifier === tile)
  if (!b) return null
  const weight = numOrDefault(profile.personality.safetyWeight, 1.0)
  return {
    kind: 'survival',
    urgency: Math.min(100, b.confidence * weight * multiplier),
    targetTile: safestNeighbor(tile, beliefs, profile.defaultLocation),
    reason: `tile_safety=dangerous on ${tile} conf=${b.confidence}`,
  }
}

function economicEntry(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  tile: string,
  multiplier: number,
): IntentEntry | null {
  const b = beliefs.find(r => r.subject === 'goods_scarcity' && r.value === 'scarce' && r.qualifier === tile)
  if (!b) return null
  const weight = numOrDefault(profile.personality.economyWeight, 0.7)
  return {
    kind: 'economic',
    urgency: Math.min(100, b.confidence * weight * multiplier),
    targetTile: abundantNeighbor(tile, beliefs, profile.defaultLocation),
    reason: `goods_scarcity=scarce on ${b.qualifier} conf=${b.confidence}`,
  }
}

function socialEntry(
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  npcFaction: string,
  tile: string,
  multiplier: number,
): IntentEntry | null {
  if (!npcFaction || npcFaction === 'neutral') return null
  const b = beliefs.find(
    r =>
      r.subject === 'faction_control' &&
      r.value === 'controlled' &&
      r.qualifier === tile &&
      r.factionId !== undefined &&
      r.factionId !== npcFaction
  )
  if (!b) return null
  const weight = numOrDefault(profile.personality.factionLoyalty, 0.5)
  return {
    kind: 'social',
    urgency: Math.min(100, b.confidence * weight * multiplier),
    targetTile: safestNeighbor(tile, beliefs, profile.defaultLocation),
    reason: `faction_control=${b.factionId} on ${tile} conf=${b.confidence}`,
  }
}

function ecosystemEntry(
  beliefs: readonly BeliefRow[],
  tile: string,
  fallback: string,
  multiplier: number,
): IntentEntry | null {
  const b = beliefs.find(r => r.subject === 'ecosystem_health' && r.value === 'depleted' && r.qualifier === tile)
  if (!b) return null
  return {
    kind: 'ecosystem',
    urgency: Math.min(100, b.confidence * 0.4 * multiplier),
    targetTile: healthyNeighbor(tile, beliefs, fallback),
    reason: `ecosystem_health=depleted on ${tile} conf=${b.confidence}`,
  }
}

export function computeIntentStack(
  npcId: string,
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  learningWeights: Readonly<Partial<Record<IntentKind, number>>>,
  currentTile: string,
  npcFaction: string,
  currentTick: number,
): IntentStack {
  const sm = learningWeights.survival ?? 1.0
  const em = learningWeights.economic ?? 1.0
  const som = learningWeights.social ?? 1.0
  const ecm = learningWeights.ecosystem ?? 1.0

  const entries: IntentEntry[] = []
  const s = survivalEntry(beliefs, profile, currentTile, sm)
  if (s) entries.push(s)
  const e = economicEntry(beliefs, profile, currentTile, em)
  if (e) entries.push(e)
  const so = socialEntry(beliefs, profile, npcFaction, currentTile, som)
  if (so) entries.push(so)
  const eco = ecosystemEntry(beliefs, currentTile, profile.defaultLocation, ecm)
  if (eco) entries.push(eco)

  entries.sort((a, b) => b.urgency - a.urgency)
  return { npcId, entries, computedAtTick: currentTick }
}

export function selectHighestIntent(
  stack: IntentStack,
  threshold: number,
  currentOverride: NpcRuntimeState['intentOverride'],
): IntentEntry | null {
  const best = stack.entries[0]
  if (!best || best.urgency < threshold) return null
  if (currentOverride && best.urgency < currentOverride.urgency * 1.5) return null
  return best
}
```

- [ ] **Step 4: Run tests — all 18 must pass**

```bash
cd packages/server && npx vitest run src/sim/intentPlanner.test.ts
```

Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/sim/intentPlanner.ts packages/server/src/sim/intentPlanner.test.ts
git commit -m "feat(planner): IntentPlanner pure functions — computeIntentStack + selectHighestIntent (v0.51.0)"
```

---

### Task 7: Wire runtime.ts

**Files:**
- Modify: `packages/server/src/sim/runtime.ts`

Context:
- Import block: around lines 16–240. Add imports after existing intent-related ones.
- Field declarations: around line 521. `beliefProjection` is at line 522.
- `tick()` method starts around line 1618. `npcEngine.tick()` is called at line 1682.
- Belief decay cadence is at lines 3289–3301.
- Fan-out block (committed events projection loop) is around lines 4309–4352. `buildingStateProjection.project(ev)` is at line 4317. `beliefProjection.apply(ev, ...)` is at line 1553 (event fan-out inside `commitLivingWorldCommand`).
- `hydrateFromEventLog()` ends around line 4999 with `buildingStateProjection.rebuildFromEvents(...)`.
- Boot event type constants: defined around lines 241–329.

- [ ] **Step 1: Add imports at the top of runtime.ts — add after the `BeliefProjection` import line (~214)**

```typescript
import { IntentProjection, INTENT_PROJECTION_BOOT_EVENT_TYPES } from '../projections/intentProjection.js'
import { computeIntentStack, selectHighestIntent } from '../sim/intentPlanner.js'
import {
  INTENT_RECOMPUTE_INTERVAL,
  INTENT_OVERRIDE_DURATION_TICKS,
  INTENT_URGENCY_THRESHOLD,
} from '../config/world.js'
```

Note: `computeIntentStack` and `selectHighestIntent` are in the same file (`runtime.ts` IS in `sim/`), so the import path is just `'./intentPlanner.js'`.

- [ ] **Step 2: Add `INTENT_BOOT_EVENT_TYPES` constant near the other boot event type constants (~line 326)**

```typescript
const INTENT_BOOT_EVENT_TYPES = INTENT_PROJECTION_BOOT_EVENT_TYPES
```

- [ ] **Step 3: Add `intentProjection` private field after `beliefProjection` field (~line 522)**

```typescript
private readonly intentProjection = new IntentProjection()
```

- [ ] **Step 4: Add intent resolution detection BEFORE `npcEngine.tick()` call (~line 1680)**

Insert this block between the `npcsInsideBuildings` computation and the `npcEngine.tick()` call:
```typescript
// Intent resolution detection — must run BEFORE npcEngine.tick() so cleared overrides
// don't carry into this tick's movement decision.
const resolvedIntentDrafts: EventDraft[] = []
for (const npc of this.getNpcs()) {
  const io = npc.state.intentOverride
  if (!io) continue
  let outcome: 'success' | 'failure' | null = null
  if (npc.state.tile === io.targetTile) outcome = 'success'
  else if (nextTick >= io.expiresAtTick) outcome = 'failure'
  if (outcome) {
    resolvedIntentDrafts.push(makeLivingWorldCommand(
      'NPC_INTENT_RESOLVED', npc.id, 'system', nextTick, submittedAt,
      {
        npcId: npc.id, intentType: io.intentType, targetTile: io.targetTile,
        outcome, urgencyAtDispatch: io.urgency, resolvedAtTick: nextTick,
      }
    ) as unknown as EventDraft)
    this.npcEngine.clearIntentOverride(npc.id)
  }
}
```

- [ ] **Step 5: Add `resolvedIntentDrafts` to the typedDrafts block — after `const typedDrafts: EventDraft[] = []` definition (~line 3863)**

```typescript
for (const d of resolvedIntentDrafts) typedDrafts.push(d)
```

- [ ] **Step 6: Add intent recompute cadence AFTER belief decay cadence (~line 3301, after the ecosystem beliefs block)**

```typescript
// Intent recompute cadence — every INTENT_RECOMPUTE_INTERVAL ticks per NPC (phase-offset)
for (const profile of this.profiles) {
  const phase = this.profiles.indexOf(profile) % INTENT_RECOMPUTE_INTERVAL
  if (nextTick % INTENT_RECOMPUTE_INTERVAL !== phase) continue
  const npcState = this.npcEngine.getState(profile.id)
  if (!npcState) continue
  const beliefs = this.beliefProjection.getBeliefs(profile.id)
  const weights = this.intentProjection.getLearningWeights(profile.id, nextTick)
  const stack = computeIntentStack(
    profile.id, beliefs, profile, weights, npcState.tile, npcState.faction, nextTick
  )
  const best = selectHighestIntent(stack, INTENT_URGENCY_THRESHOLD, npcState.intentOverride)
  if (best) {
    this.npcEngine.setIntentOverride(profile.id, {
      targetTile: best.targetTile,
      expiresAtTick: nextTick + INTENT_OVERRIDE_DURATION_TICKS,
      intentType: best.kind,
      urgency: best.urgency,
      reason: best.reason,
    })
  }
}
```

- [ ] **Step 7: Add `intentProjection.project(ev)` in the committed events fan-out block (~line 4317)**

After `this.beliefProjection.apply(ev, ...)` in the fan-out loop, add:
```typescript
this.intentProjection.project(ev)
```

Note: The `beliefProjection.apply()` is inside `commitLivingWorldCommand()` at line ~1553. The main fan-out block at line ~4313 iterates committed events. Find the line `this.buildingStateProjection.project(ev)` and add `this.intentProjection.project(ev)` right after it.

- [ ] **Step 8: Add boot hydration for intentProjection in `hydrateFromEventLog()` (~line 4998, after buildingState hydration)**

```typescript
const intentEvents = this.store.readEventsByTypes(INTENT_BOOT_EVENT_TYPES)
this.intentProjection.rebuildFromEvents(intentEvents)
```

- [ ] **Step 9: Verify build passes**

```bash
cd packages/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Run full test suite**

```bash
cd packages/server && npx vitest run
```

Expected: all tests pass (existing 812 + new ~30 = ~842). No regressions.

- [ ] **Step 11: Run web build check**

```bash
cd packages/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add packages/server/src/sim/runtime.ts
git commit -m "feat(runtime): wire IntentProjection + intent resolution + recompute cadence (v0.51.0)"
```

---

### Task 8: Update docs + bump version

**Files:**
- Modify: `docs/WORLD_CAPABILITIES.md`
- Modify: `PROGRESS.md`
- Modify: `packages/server/package.json` and `packages/web/package.json` (bump to 0.51.0)

- [ ] **Step 1: Add v0.51.0 shipped block to WORLD_CAPABILITIES.md §12.5.6**

In `docs/WORLD_CAPABILITIES.md`, find `## 12.5.6 Intention System` (~line 1268) and add after the heading:

```markdown
> **v0.51.0 shipped (2026-05-22):**
> - `IntentProjection` (`projections/intentProjection.ts`) — event-sourced `Reflection` records (§12.5.9); `getLearningWeights(npcId, tick)` returns per-intentType `urgencyMultiplier ∈ [0.5, 1.5]`; boot-hydrates from `NPC_INTENT_RESOLVED` EventLog events
> - `IntentPlanner` (`sim/intentPlanner.ts`) — pure `computeIntentStack(beliefs, profile, weights, tile, faction, tick)` + `selectHighestIntent(stack, threshold, currentOverride)`; 4 intent types: survival/economic/social/ecosystem; target tile selected from `MAP_ADJACENCY`
> - `NpcRuntimeState.intentOverride` — highest-priority targetTile field; cleared by runtime on arrival or expiry; persisted via `NPC_STATE_RECORDED` snapshot
> - Intent resolution detection pre-NpcEngine-tick: arrival → `'success'`, expiry → `'failure'` → `NPC_INTENT_RESOLVED` event emitted
> - Recompute cadence: every `INTENT_RECOMPUTE_INTERVAL = TICKS_PER_HOUR × 2` ticks per NPC (phase-offset); threshold=30
> - `BeliefRow.factionId?` field added — stored on faction_control beliefs so social intent can compare enemy vs own faction
> - Critical: `IntentPlanner` imports `MAP_ADJACENCY` from `mapGraph.ts` (canonical adjacency), NOT `TILE_ADJACENCY` from `beliefProjection.ts` (diverged copy)
```

- [ ] **Step 2: Update §29 status table in WORLD_CAPABILITIES.md — change v0.50.0 reference to v0.51.0**

Find the line with `v0.50.0` in the status table and update to `v0.51.0`.

- [ ] **Step 3: Add v0.51.0 handoff snapshot at top of PROGRESS.md**

```markdown
## 2026-05-22 — Handoff Snapshot @ v0.51.0

### Current Version
`0.51.0` — TypeScript build clean. All tests pass. Commits pushed to `main`.

### What Was Shipped (v0.50.0 → v0.51.0)

**v0.51.0 — NPC Intention Layer (Cognitive Runtime Layer 2 Phase 2)**

**新增檔案：**
- `packages/server/src/projections/intentProjection.ts` — `IntentProjection` class；`Reflection` struct（§12.5.9）；`getLearningWeights(npcId, tick)`；`INTENT_PROJECTION_BOOT_EVENT_TYPES`；boot hydrate from `NPC_INTENT_RESOLVED` events
- `packages/server/src/projections/intentProjection.test.ts` — 12 tests
- `packages/server/src/sim/intentPlanner.ts` — pure `computeIntentStack` + `selectHighestIntent`；4 intent types；`MAP_ADJACENCY` for target tile selection
- `packages/server/src/sim/intentPlanner.test.ts` — 18 tests

**修改檔案：**
- `packages/server/src/config/world.ts`：5 constants（INTENT_RECOMPUTE_INTERVAL/INTENT_OVERRIDE_DURATION_TICKS/INTENT_URGENCY_THRESHOLD/REFLECTION_DURATION_TICKS/MAX_REFLECTIONS_PER_NPC）
- `packages/server/src/kernel/livingWorldCommands.ts`：`IntentKind` type + `NpcIntentResolvedCmd` + `'NPC_INTENT_RESOLVED'` in LIVING_WORLD_COMMAND_TYPES
- `packages/server/src/projections/beliefProjection.ts`：`BeliefRow.factionId?: string` + store in faction_control upsert
- `packages/server/src/sim/npcEngine.ts`：`intentOverride` field + `setIntentOverride`/`clearIntentOverride` + targetTile priority `intentOverride > personalityOverride > scheduleTarget`
- `packages/server/src/sim/runtime.ts`：`intentProjection` field + resolution detection pre-NpcEngine-tick + recompute cadence + fan-out + boot hydration

**架構關鍵點：**
- `IntentPlanner` 是純函數；只用 beliefs + profile + learningWeights 決策；零 AI 呼叫
- `intentOverride` 優先級最高 — 覆蓋 personalityOverride（個性 nudge）和 scheduleTarget
- `MAP_ADJACENCY`（mapGraph.ts）是目標 tile 選擇的權威 adjacency；`TILE_ADJACENCY`（beliefProjection.ts）僅用於 confidence locality，兩者有差異，v0.52.0 統一
- NPC_INTENT_RESOLVED event 在 NpcEngine.tick() 之前 emit 並 clearIntentOverride，避免死亡 override 影響當前 tick
- `Reflection` records 存活 `REFLECTION_DURATION_TICKS = TICKS_PER_DAY × 30`（30 in-game days）；最多 `MAX_REFLECTIONS_PER_NPC = 20` 筆；`urgencyMultiplier ∈ [0.5, 1.5]`

**Next:** v0.52.0 — Reflection 注入 dialog context（getReflections → aiDialog.ts）；或統一 TILE_ADJACENCY vs MAP_ADJACENCY
```

- [ ] **Step 4: Bump version in both package.json files**

In `packages/server/package.json`: `"version": "0.51.0"`
In `packages/web/package.json`: `"version": "0.51.0"`

- [ ] **Step 5: Final full test run + build**

```bash
cd packages/server && npx vitest run
cd packages/web && npm run build
```

Expected: all tests pass, web build succeeds (chunk size warning is acceptable).

- [ ] **Step 6: Commit + push**

```bash
git add docs/WORLD_CAPABILITIES.md PROGRESS.md packages/server/package.json packages/web/package.json
git commit -m "chore: bump to 0.51.0; update WORLD_CAPABILITIES §12.5.6 + PROGRESS handoff"
git push
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task covering it |
|---|---|
| IntentKind type | Task 2 |
| NpcIntentResolvedCmd event | Task 2 |
| BeliefRow.factionId for social intent | Task 3 |
| intentOverride on NpcRuntimeState | Task 4 |
| setIntentOverride / clearIntentOverride | Task 4 |
| intentOverride > personalityOverride priority | Task 4 |
| IntentProjection + Reflection (§12.5.9) | Task 5 |
| computeIntentStack + selectHighestIntent | Task 6 |
| urgency formula per intent type | Task 6 |
| MAP_ADJACENCY for targetTile selection | Task 6 |
| Runtime wiring: resolution + cadence + fan-out + boot | Task 7 |
| INTENT_RECOMPUTE_INTERVAL, INTENT_URGENCY_THRESHOLD, etc. | Task 1 |
| WORLD_CAPABILITIES §12.5.6 + PROGRESS update | Task 8 |

### Type Consistency Check

- `IntentKind` defined in Task 2 (`livingWorldCommands.ts`); imported in Tasks 4, 5, 6, 7 ✓
- `IntentEntry.kind: IntentKind` used in Task 6; matches Task 2 type ✓
- `computeIntentStack(npcId, beliefs, profile, learningWeights, currentTile, npcFaction, currentTick)` — 7 params; runtime call in Task 7 matches ✓
- `selectHighestIntent(stack, threshold, currentOverride)` — 3 params; runtime call in Task 7 matches ✓
- `NpcRuntimeState['intentOverride']` shape used in Task 7 `setIntentOverride` call matches Task 4 definition ✓
- `rebuildFromEvents(events)` in Task 5 matches call in Task 7 boot hydration ✓
- `INTENT_PROJECTION_BOOT_EVENT_TYPES` exported in Task 5; imported in Task 7 ✓
