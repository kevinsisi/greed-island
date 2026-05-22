# NPC Belief + Perception Layer — Design Spec (v0.50.0)

**Date:** 2026-05-22  
**Status:** Approved  
**Phase reference:** WORLD_CAPABILITIES.md §12.5 Layer 2 — Cognitive Runtime  
**Principle served:** Local Knowledge Principle (§12.5.2), Intention Principle (§12.5.2)

---

## Goal

Each NPC maintains a subjective, event-sourced worldview (beliefs). When a player
talks to an NPC, the AI dialog prompt includes the NPC's personal beliefs — not
ground truth. Beliefs diverge from reality as time passes or when the NPC has not
locally observed recent events.

Observable output: NPC dialog lines reference their own beliefs using hedged
language proportional to confidence ("我聽說", "我不確定"). High-confidence
beliefs stated directly.

---

## Architecture

```
Existing Events (FACTION_TILE_SEIZED, NPC_ATTACKED, GOODS_CONSUMED, ECOSYSTEM_TICK…)
    ↓  fan-out in runtime.ts (same pattern as BuildingStateProjection)
BeliefProjection.apply(event)
    ↓
BeliefRow[] per NPC — persists in memory, hydrates from EventLog on boot
    ↓
runtime.getBeliefs(npcId) → formatBeliefContext(rows) → AiDialogContext.beliefContext
    ↓
Gemini prompt — NPC answers from subjective worldview, not world truth
```

**Architecture laws that apply:**
- Beliefs are derived from Events only — no Commands, no direct state reads
- BeliefProjection is read-only for callers; only the projection mutates its own rows
- AI is still read-only narrator — beliefs inform prompts, AI cannot write beliefs back

---

## BeliefRow Schema

```typescript
// packages/server/src/projections/beliefProjection.ts

export type BeliefSubjectKind =
  | 'tile_safety'       // "T03 is dangerous"
  | 'goods_scarcity'    // "food supply is tight"
  | 'ecosystem_health'  // "fish stocks are depleted"
  | 'faction_control'   // "tile is under faction control"

export type BeliefValue =
  | 'dangerous' | 'safe'
  | 'scarce' | 'abundant'
  | 'depleted' | 'recovering'
  | 'controlled' | 'contested' | 'free'

export type EmotionalTag = 'fear' | 'worry' | 'relief' | 'anger' | 'hope'

export interface BeliefRow {
  npcId: string
  subject: BeliefSubjectKind
  qualifier: string         // tileId | goodsType | tileId
  value: BeliefValue
  confidence: number        // 0–100; decays per day
  observedAtTick: number
  decayRatePerDay: number   // confidence lost per 24 ticks
  emotionalTag?: EmotionalTag
}
```

---

## Perception Rules

| Situation | Confidence range |
|---|---|
| Event occurred on NPC's current `tileId` | 85–95 |
| Event occurred on adjacent tile | 35–50 |
| Event occurred on non-adjacent tile | not perceived |

Confidence decay runs every 24 ticks (1 in-game day) in `runtime.ts`.
When confidence ≤ 0, the row is deleted (belief forgotten).

---

## Event Triggers (v0.50.0 scope)

| Event type | Belief written | Qualifier | Confidence | Decay/day | Emotion |
|---|---|---|---|---|---|
| `FACTION_TILE_SEIZED` | `tile_safety: dangerous` | `event.tileId` | 90 (same tile) / 40 (adjacent) | 2 | `fear` |
| `FACTION_TILE_SEIZED` | `faction_control: controlled` | `event.tileId` | 90 / 40 | 1 | — |
| `ANIMAL_ATTACKED_NPC` (victim on NPC's tile) | `tile_safety: dangerous` | victim's `tileId` | 90 (same tile) / 40 (adjacent) | 3 | `fear` |
| `GOODS_CONSUMED` with famine flag | `goods_scarcity: scarce` | goodsType | 80 (same tile) / 35 (adjacent) | 4 | `worry` |
| Ecosystem cadence (every 48 ticks, species < 20% capacity) | `ecosystem_health: depleted` | tileId | 70 | 2 | `anger` |

Note: `ANIMAL_ATTACKED_NPC` is defined in `livingWorldCommands.ts:149`.  
Note: No `ECOSYSTEM_TICK` event exists — ecosystem beliefs are updated via a runtime cadence
loop in `runtime.ts` that calls `beliefProjection.updateEcosystemBeliefs(tileId, speciesData)`.
This method directly writes belief rows rather than processing an event.

"Adjacent tile" = tiles sharing a border in the 6-tile world map (define adjacency
as a static constant `TILE_ADJACENCY: Record<string, string[]>` in `beliefProjection.ts`).

---

## Dialog Integration

### AiDialogContext extension

Add to `AiDialogContext` in `packages/server/src/npcs/aiDialog.ts`:

```typescript
beliefContext?: string  // pre-formatted block, injected into prompt
```

### formatBeliefContext helper

```typescript
// packages/server/src/projections/beliefProjection.ts
export function formatBeliefContext(rows: BeliefRow[], currentTick: number): string {
  const alive = rows.filter(r => r.confidence > 0)
  if (alive.length === 0) return ''
  const lines = alive.map(r => {
    const daysAgo = Math.floor((currentTick - r.observedAtTick) / 24)
    const hedge = r.confidence >= 70 ? '' : r.confidence >= 40 ? '（不確定）' : '（只是聽說）'
    return `- ${subjectLabel(r)}：${valueLabel(r.value)}${hedge}，${daysAgo}天前觀察`
  })
  return `【NPC主觀信念 — 可能與事實不符】\n${lines.join('\n')}`
}
```

### Prompt injection rule (anti-hallucination extension)

Append this constraint block to the Gemini NPC dialog prompt when `beliefContext` is present:

> NPC 只能引用「主觀信念」區中明確列出的事實。  
> 信心≥70% → 可以直接陳述；信心40–69% → 必須用「我聽說」「大概」；信心<40% → 必須用「也許」「我不確定」。  
> 不可虛構未列出的地名、人物或事件。

This extends the existing §AI Narration 反幻覺鐵則 to belief-driven dialog.

---

## Files

| Action | Path | Responsibility |
|---|---|---|
| CREATE | `packages/server/src/projections/beliefProjection.ts` | BeliefRow type, BeliefProjection class, formatBeliefContext |
| CREATE | `packages/server/src/projections/beliefProjection.test.ts` | Unit tests: event triggers, confidence decay, perception locality |
| MODIFY | `packages/server/src/sim/runtime.ts` | Wire BeliefProjection (field, fan-out, boot hydration, decay cadence, getBeliefs getter) |
| MODIFY | `packages/server/src/npcs/aiDialog.ts` | Add `beliefContext?: string` to AiDialogContext |
| MODIFY | `packages/server/src/http/npc.ts` | Call `runtime.getBeliefs(npcId)` + `formatBeliefContext` when building AiDialogContext |
| MODIFY | `docs/WORLD_CAPABILITIES.md` | Mark Layer 2 Belief+Perception as shipped in v0.50.0 baseline |
| MODIFY | `PROGRESS.md` | v0.50.0 handoff snapshot |

---

## Testing Strategy

**Unit tests (beliefProjection.test.ts):**
- `FACTION_TILE_SEIZED` on NPC's tile → belief row with confidence 90, emotionalTag 'fear'
- `FACTION_TILE_SEIZED` on adjacent tile → confidence 40
- `FACTION_TILE_SEIZED` on non-adjacent tile → no row written
- `ANIMAL_ATTACKED_NPC` on NPC's tile → belief `tile_safety: dangerous`, confidence 90, emotionalTag 'fear'
- Decay: after 24 ticks, confidence drops by decayRatePerDay
- Confidence ≤ 0 → row dropped from `getBeliefs()`
- Multiple events same subject → latest observation wins (confidence replaced, not stacked)
- `updateEcosystemBeliefs`: speciesDensity < 20% capacity → writes `ecosystem_health: depleted`
- `formatBeliefContext`: empty when no rows; hedge language by tier (≥70 direct, 40–69 "我聽說", <40 "也許")

**Integration test (npc.test.ts):**
- POST /api/npc/:id/interact — when NPC has a belief, AI dialog context contains `beliefContext` string

---

## Scope Boundary (v0.50.0)

**In scope:**
- BeliefProjection for 4 subject kinds
- Confidence decay
- Locality-based perception
- Dialog integration via AiDialogContext.beliefContext

**Explicitly out of scope (future versions):**
- Belief-driven NPC movement decisions (v0.51+)
- Belief propagation via NPC-to-NPC rumor (v0.51+)
- Full Intent layer (v0.52+)
- Planning and action selection (v0.53+)
- Player-observable belief inspector UI (after core loop)
