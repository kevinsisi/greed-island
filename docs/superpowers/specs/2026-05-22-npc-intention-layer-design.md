# NPC Intention Layer Design Spec

**Version target:** v0.51.0  
**Date:** 2026-05-22  
**World Capabilities reference:** §12.5.6 Intention System, §12.5.7 Planning System, §12.5.9 Reflection System

---

## Goal

Connect NPC beliefs (v0.50.0 BeliefProjection) to physical behavior: NPCs with high-confidence dangerous beliefs will flee to safer tiles, seek food, avoid enemy-faction tiles, and build reinforcing or dampening learning weights from past outcomes. Learning weights survive server restart via EventLog hydration.

---

## Architecture

```
BeliefProjection (v0.50.0)
    ↓ getBeliefs(npcId)
IntentPlanner.computeIntentStack(beliefs, profile, learningWeights)
    → IntentStack { entries: IntentEntry[] sorted high→low urgency }
    ↓ selectHighestIntent(stack, threshold=30, currentOverride)
    → best IntentEntry | null
        ↓ runtime.npcEngine.setIntentOverride(npcId, { targetTile, expiresAtTick, intentType, urgency, reason })
            ↓ npcEngine.ts: intentOverride.targetTile takes priority over personalityOverride.targetTile

When NPC.tile === intentOverride.targetTile (success)
  OR currentTick >= intentOverride.expiresAtTick (failure):
    → runtime emits NPC_INTENT_RESOLVED { npcId, intentType, outcome, ... }
        ↓ IntentProjection.project(event)
            → stores Reflection { urgencyDelta, durationTicks }
            → getLearningWeights() returns updated urgencyMultiplier per intentType
```

Architecture law: IntentPlanner is a pure function (no side effects). IntentProjection is event-sourced state. Runtime orchestrates both. AI remains read-only narrator; intent decisions are rule-based.

---

## Intent Types

Four intent kinds (Reflection is a cross-cutting mechanism, not a 5th intent):

```typescript
type IntentKind = 'survival' | 'economic' | 'social' | 'ecosystem'
```

### Urgency Calculation

Each intent's urgency = `relevantBeliefConfidence × profileWeight × learningMultiplier`

| IntentKind | Triggering belief | Condition | profileWeight source |
|---|---|---|---|
| `survival` | tile_safety 'dangerous' | on NPC's current tile | `numOrDefault(profile.personality.safetyWeight, 1.0)` |
| `economic` | goods_scarcity 'scarce' | on current tile or adjacent | `numOrDefault(profile.personality.economyWeight, 0.7)` |
| `social` | faction_control 'controlled' by enemy | on current tile | `numOrDefault(profile.personality.factionLoyalty, 0.5)` |
| `ecosystem` | ecosystem_health 'depleted' | on current tile | `0.4` (fixed; few NPCs respond strongly) |

Enemy faction determination: compare `npc.state.faction` against the `qualifier` of the faction_control BeliefRow (belief stores which faction controls the tile). If NPC has no faction set, social intent never fires.

### targetTile Selection

Each intent must select a concrete `targetTile`:

- **survival / social (flee)**: scan `TILE_ADJACENCY[currentTile]`. Pick tile with no tile_safety 'dangerous' belief, or lowest-confidence-dangerous belief. If all adjacent tiles are dangerous, pick `profile.defaultLocation`.
- **economic**: scan `TILE_ADJACENCY[currentTile]`. Pick tile with no goods_scarcity 'scarce' belief for same goodsId. If none found, pick profile.defaultLocation.
- **ecosystem**: scan `TILE_ADJACENCY[currentTile]`. Pick tile with no ecosystem_health 'depleted' belief. If all adjacent depleted, pick profile.defaultLocation.
- **social (seek allied faction)**: not implemented in v0.51.0. Social intent is flee-only in this release.

### selectHighestIntent Override Threshold

New intent overrides existing `intentOverride` only if:
1. `stack.entries[0].urgency > INTENT_URGENCY_THRESHOLD` (= 30), AND
2. `currentOverride === null` OR `stack.entries[0].urgency > currentOverride.urgency × 1.5`

Condition 2 prevents thrashing — a new intent must be 50% stronger than current to displace it.

---

## Reflection System (§12.5.9)

```typescript
interface Reflection {
  triggeringEventId: string  // NPC_INTENT_RESOLVED event's EventLog sequence (string)
  intentType: IntentKind
  emotionalImpact: number    // +10 (success) | -10 (failure)
  urgencyDelta: number       // +0.1 (success) | -0.1 (failure)
  startTick: number
  durationTicks: number      // REFLECTION_DURATION_TICKS = TICKS_PER_DAY * 30
}
```

**urgencyMultiplier per intentType** = `clamp(1.0 + Σ(active reflections.urgencyDelta for this intentType), 0.5, 1.5)`

Active = `currentTick - startTick < durationTicks`.

Reflections are stored per NPC in `IntentProjection`. Capped at `MAX_REFLECTIONS_PER_NPC = 20` per NPC; oldest entries removed first when cap is exceeded.

---

## New Type: `IntentEntry` and `IntentStack`

```typescript
interface IntentEntry {
  kind: IntentKind
  urgency: number          // 0–100
  targetTile: string
  reason: string           // human-readable, e.g. "tile t_forest tile_safety=dangerous conf=85"
}

interface IntentStack {
  npcId: string
  entries: IntentEntry[]   // sorted descending by urgency
  computedAtTick: number
}
```

---

## New Event: `NPC_INTENT_RESOLVED`

Added to `livingWorldCommands.ts`:

```typescript
type NpcIntentResolvedPayload = {
  npcId: string
  intentType: IntentKind
  targetTile: string
  outcome: 'success' | 'failure'
  urgencyAtDispatch: number
  resolvedAtTick: number
}
```

Event is emitted directly by runtime (not via Command → RuleEngine path — same pattern as ecosystem cadence events). `actorId = npcId`, `submittedBy = 'system'`.

---

## New Constants (config/world.ts)

```typescript
export const INTENT_RECOMPUTE_INTERVAL = TICKS_PER_HOUR * 2    // 1,440 ticks — twice per in-game day
export const INTENT_OVERRIDE_DURATION_TICKS = TICKS_PER_HOUR * 6 // 4,320 ticks — ~6 real-world hours
export const INTENT_URGENCY_THRESHOLD = 30                      // minimum urgency to generate override
export const REFLECTION_DURATION_TICKS = TICKS_PER_DAY * 30    // 30 in-game days
export const MAX_REFLECTIONS_PER_NPC = 20
```

---

## NpcRuntimeState Extension (npcEngine.ts)

Add one field after `personalityOverride`:

```typescript
intentOverride?: {
  targetTile: string
  expiresAtTick: number
  intentType: IntentKind
  urgency: number
  reason: string
} | null
```

targetTile priority in `buildNextAgentState()` (line ~825):
```typescript
const targetTile = before.intentOverride?.targetTile
  ?? personalityOverride?.targetTile
  ?? scheduleTarget
```

New public methods on `NpcEngine`:
```typescript
setIntentOverride(npcId: string, override: NonNullable<NpcRuntimeState['intentOverride']>): void
clearIntentOverride(npcId: string): void
```

`intentOverride` must be serialized/deserialized in `restoreState()` and `snapshotAll()` with the same safe-cast pattern as `personalityOverride`.

---

## IntentPlanner (pure functions, packages/server/src/sim/intentPlanner.ts)

```typescript
export function computeIntentStack(
  npcId: string,
  beliefs: readonly BeliefRow[],
  profile: NpcProfile,
  learningWeights: Readonly<Partial<Record<IntentKind, number>>>,
  currentTile: string,
  currentTick: number,
): IntentStack

export function selectHighestIntent(
  stack: IntentStack,
  threshold: number,
  currentOverride: NpcRuntimeState['intentOverride'],
): IntentEntry | null
```

`computeIntentStack` internally calls helpers (not exported):
- `computeSurvivalUrgency(beliefs, profile, currentTile, multiplier): IntentEntry | null`
- `computeEconomicUrgency(beliefs, profile, currentTile, multiplier): IntentEntry | null`
- `computeSocialUrgency(beliefs, profile, currentTile, npcFaction, multiplier): IntentEntry | null`
- `computeEcosystemUrgency(beliefs, currentTile, multiplier): IntentEntry | null`

All helpers use `TILE_ADJACENCY` imported from `beliefProjection.ts`.

---

## IntentProjection (packages/server/src/projections/intentProjection.ts)

```typescript
export class IntentProjection {
  private readonly reflectionsByNpc = new Map<string, Reflection[]>()

  project(event: Event): void
  // Handles NPC_INTENT_RESOLVED only. Reads event.payload.data (nested pattern).
  // Creates Reflection from outcome. Trims to MAX_REFLECTIONS_PER_NPC.

  getLearningWeights(npcId: string, currentTick: number): Readonly<Partial<Record<IntentKind, number>>>
  // Returns effective urgencyMultiplier per intentType from active reflections.
  // If no reflections for a type, that key is absent (caller defaults to 1.0).

  getReflections(npcId: string): readonly Reflection[]
  // For future dialog injection (v0.52+).
}
```

Boot hydration: add `'NPC_INTENT_RESOLVED'` to the boot event types set in `hydrateFromEventLog()`, follow the existing large-log else-branch pattern (same as `BuildingStateProjection`).

---

## Runtime.ts Changes

**New field:**
```typescript
private readonly intentProjection = new IntentProjection()
```

**Intent resolution detection** (runs every tick, before intent recompute cadence, inside typedDrafts block):
```typescript
for (const npc of this.getNpcs()) {
  const io = npc.state.intentOverride
  if (!io) continue

  let outcome: 'success' | 'failure' | null = null
  if (npc.state.tile === io.targetTile) outcome = 'success'
  else if (nextTick >= io.expiresAtTick) outcome = 'failure'

  if (outcome) {
    typedDrafts.push(makeLivingWorldCommand(
      'NPC_INTENT_RESOLVED', npc.id, 'system', nextTick, submittedAt,
      { npcId: npc.id, intentType: io.intentType, targetTile: io.targetTile,
        outcome, urgencyAtDispatch: io.urgency, resolvedAtTick: nextTick }
    ) as unknown as EventDraft)
    this.npcEngine.clearIntentOverride(npc.id)
  }
}
```

**Intent recompute cadence** (runs after belief decay, before NPC engine tick):
```typescript
if (nextTick % INTENT_RECOMPUTE_INTERVAL !== undefined) {  // always run, phase-offset per NPC
  for (const npc of this.getNpcs()) {
    const phase = hashStr(npc.id) % INTENT_RECOMPUTE_INTERVAL
    if (nextTick % INTENT_RECOMPUTE_INTERVAL !== phase) continue

    const profile = this.getProfileForNpc(npc.id)
    if (!profile) continue

    const beliefs = this.beliefProjection.getBeliefs(npc.id)
    const weights = this.intentProjection.getLearningWeights(npc.id, nextTick)
    const stack = computeIntentStack(npc.id, beliefs, profile, weights, npc.location, nextTick)
    const best = selectHighestIntent(stack, INTENT_URGENCY_THRESHOLD, npc.state.intentOverride)

    if (best) {
      this.npcEngine.setIntentOverride(npc.id, {
        targetTile: best.targetTile,
        expiresAtTick: nextTick + INTENT_OVERRIDE_DURATION_TICKS,
        intentType: best.kind,
        urgency: best.urgency,
        reason: best.reason,
      })
    }
  }
}
```

**Fan-out** (add after `this.beliefProjection.apply(...)`):
```typescript
this.intentProjection.project(ev)
```

---

## Files Created / Modified

| Op | File | Description |
|---|---|---|
| CREATE | `packages/server/src/projections/intentProjection.ts` | IntentProjection class + Reflection type |
| CREATE | `packages/server/src/projections/intentProjection.test.ts` | ~20 tests |
| CREATE | `packages/server/src/sim/intentPlanner.ts` | computeIntentStack + selectHighestIntent (pure) |
| CREATE | `packages/server/src/sim/intentPlanner.test.ts` | ~25 tests |
| MODIFY | `packages/server/src/kernel/livingWorldCommands.ts` | NPC_INTENT_RESOLVED event type + payload |
| MODIFY | `packages/server/src/config/world.ts` | 5 new constants |
| MODIFY | `packages/server/src/sim/npcEngine.ts` | intentOverride field + 2 public methods + targetTile priority |
| MODIFY | `packages/server/src/sim/runtime.ts` | intentProjection field + resolution detection + recompute cadence + fan-out |

---

## What This Does NOT Include (v0.51.0 scope boundary)

- Social seek (moving toward ally-faction tiles) — flee only in v0.51.0
- Reflection injection into dialog context — v0.52.0
- Long-term intentions (become wealthy, protect family) — future
- Ideological / emotional intent types — future
- IntentStack exposure via HTTP API — future
