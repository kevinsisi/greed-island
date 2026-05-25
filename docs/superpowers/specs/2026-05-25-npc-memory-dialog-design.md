# v0.53.0 — NPC Memory System: Dialog Injection

**Date:** 2026-05-25
**Phase:** Cognitive Runtime Layer 2, Step 4
**Scope:** Extend `SqliteNpcMemoryStore` with locality fan-out + decay filtering + dialog injection

---

## 1. Problem Statement

`SqliteNpcMemoryStore` exists since v0.15.x and handles 11 event types, but:
- World-level events (`NPC_DECEASED`) are stored under `npcId: 'world'`, not per witnessing NPC
- No locality-based fan-out (no concept of who was on the same tile)
- No decay mechanism — all memories persist forever
- Never injected into AI dialog — NPCs have no voice for their past experiences

The Cognitive Runtime pipeline (`Perception → Belief → Intent → Reflection → Memory`) has a missing last step: memory is not fed back into NPC narration.

---

## 2. Goals

- Expand the event catalog with locality-aware fan-out for 8 new event types
- Add importance-tier decay filtering (query-layer, not schema deletion)
- Inject formatted memory context into NPC AI dialog (`buildMemoryBlock`)
- Follow the exact same 4-file modification pattern as v0.50 (Belief) and v0.52 (Reflection)

**Out of scope (v0.54+):** Intent urgency boost from memory (`getMemoryUrgencyBoost`)

---

## 3. Architecture

### 3.1 Files Modified (no new projection class)

| File | Change |
|---|---|
| `kernel/npcMemory.ts` | `projectWithLocality()` + expanded event catalog + `formatMemoryContext()` |
| `sim/runtime.ts` | fan-out call + `getFormattedMemoryContext()` getter |
| `npcs/aiDialog.ts` | `AiDialogContext.memoryContext?` + `buildMemoryBlock()` |
| `http/npc.ts` | fill `memoryContext` in dialogCtx |
| `config/world.ts` | 4 new constants |

Existing `project(event)` on `SqliteNpcMemoryStore` is **not changed** — backward compatible. `projectWithLocality()` is called in parallel from the runtime tick fan-out loop.

---

## 4. Locality Fan-out

### 4.1 `projectWithLocality(event, npcTileMap)` Signature

```typescript
projectWithLocality(
  event: Event,
  npcTileMap: ReadonlyMap<string, string>  // npcId → tileId
): void
```

### 4.2 Locality Rules

Identical to `BeliefProjection.apply()`. Uses `TILE_ADJACENCY` imported from `projections/beliefProjection.ts` (already exported):
- **Same tile** → full importance value
- **Adjacent tile** (TILE_ADJACENCY 7-neighbor graph) → `importance - 2` (floor 1)
- **Distant** → not recorded

### 4.3 New Event Catalog

| Event Type | Base Importance | Fan-out Target | Emotional Tag |
|---|---|---|---|
| `FACTION_TILE_SEIZED` | 9 | Same-tile NPCs (personal), adjacent - 2 | `fear` |
| `ANIMAL_ATTACKED_NPC` | 8 | Victim NPC (direct) + same-tile witnesses | `fear` |
| `MIGRATION_WAVE_STARTED` | 7 | Same-tile / adjacent NPCs | `awe` |
| `SPECIES_EXTINCT` | 8 | `npcId: 'world'` (world-scoped, not fan-out per NPC) | `grief` |
| `SETTLEMENT_FORMED` | 7 | Same-tile NPCs (7), adjacent (5) | `relief` |
| `SETTLEMENT_DECLINE` | 9 | Same-tile NPCs | `fear` |
| `GOODS_TRANSPORT_LOST` | 5 | Carrier NPC (npcId in payload) | `anger` |
| `COMBAT_ENDED` | 7 | Both combatants (direct) + same-tile witnesses (6) | `fear` |

Existing 11 event types in `project()` remain unchanged (no locality upgrade needed — they are already per-NPC or world-scoped correctly).

---

## 5. Decay Filtering

Decay is applied at **query time** in `formatMemoryContext()` — no schema change, no row deletion. Historical data is preserved for chronicle and analytics.

### 5.1 Decay Thresholds (world.ts constants)

```typescript
MEMORY_DIALOG_MAX_BULLETS    = 5
MEMORY_VERY_HIGH_DECAY_TICKS = 30 * TICKS_PER_DAY   // importance 7–8
MEMORY_HIGH_DECAY_TICKS      =  7 * TICKS_PER_DAY   // importance 5–6
MEMORY_NORMAL_DECAY_TICKS    =  2 * TICKS_PER_DAY   // importance 1–4
```

Memories with `importance >= 9` never expire.

### 5.2 `emotionalTag` Storage

`emotionalTag` is encoded inside `content_json` (e.g. `{ kind: 'faction.seized', emotionalTag: 'fear', ... }`). No schema change is needed — the existing `content_json TEXT` column already carries arbitrary JSON.

### 5.3 SQL Filter (pseudocode)

`formatMemoryContext` queries **both** personal memories (`npc_id = :npcId`) and world-scoped memories (`npc_id = 'world'`), then merges and re-sorts client-side:

```sql
WHERE (npc_id = :npcId OR npc_id = 'world')
  AND (
    importance >= 9
    OR (importance >= 7 AND :currentTick - tick <= :VERY_HIGH)
    OR (importance >= 5 AND :currentTick - tick <= :HIGH)
    OR (:currentTick - tick <= :NORMAL)
  )
ORDER BY importance DESC, tick DESC
LIMIT :MEMORY_DIALOG_MAX_BULLETS
```

---

## 6. `formatMemoryContext(npcId, currentTick)`

Returns a Chinese bullet list of active (non-decayed) memories, sorted by importance DESC then recency DESC, capped at `MEMORY_DIALOG_MAX_BULLETS`.

Returns `''` when no active memories exist (so `buildMemoryBlock` emits nothing).

**Example output:**
```
- [importance:9] 目睹 t_forest 派系奪權（潮獵會取代自由潮感者），感到恐懼
- [importance:8] 目擊 NPC 雲山 在 t_salt_marsh 遭動物攻擊
- [importance:7] 目睹大遷徙浪潮自 t_desert 啟動
```

---

## 7. Dialog Injection

### 7.1 `aiDialog.ts`

```typescript
// New field on AiDialogContext
memoryContext?: string

// New exported helper (guard identical to buildBeliefBlock / buildReflectionBlock)
export function buildMemoryBlock(ctx?: string): string[] {
  if (!ctx) return []
  return [
    '## 個人記憶（⚠️ 記憶規則：僅引用以下實際記錄，不可虛構記憶內容）',
    ctx
  ]
}
```

`buildSystemPrompt` injects `buildMemoryBlock` after `buildReflectionBlock`.

### 7.2 `runtime.ts`

```typescript
getFormattedMemoryContext(npcId: string): string {
  return this.npcMemoryStore.formatMemoryContext(npcId, this.currentTick)
}
```

`npcMemoryStore` already exists on runtime; `projectWithLocality()` is called in the fan-out loop alongside existing `project()`.

### 7.3 `npc.ts`

```typescript
const memoryCtx = input.runtime.getFormattedMemoryContext(npcId) || undefined
// spread into dialogCtx:
...(memoryCtx ? { memoryContext: memoryCtx } : {})
```

---

## 8. Testing Strategy

**Estimated: ~20 new tests**

### `npcMemory.test.ts` additions

- `projectWithLocality` same tile → correct importance + emotionalTag stored
- `projectWithLocality` adjacent tile → `importance - 2` stored
- `projectWithLocality` distant tile → no row inserted
- Each of the 8 new event types produces expected rows
- `formatMemoryContext` with no memories → returns `''`
- `formatMemoryContext` with 7 memories → returns at most 5 (MEMORY_DIALOG_MAX_BULLETS)
- `formatMemoryContext` orders by importance DESC, recency DESC
- Decay: importance-9 memory survives past `MEMORY_VERY_HIGH_DECAY_TICKS`
- Decay: importance-5 memory is excluded after `MEMORY_HIGH_DECAY_TICKS`

### `aiDialog.test.ts` additions

- `buildMemoryBlock(undefined)` → `[]`
- `buildMemoryBlock('')` → `[]`
- `buildMemoryBlock('some context')` → array with ⚠️ rule header + context

---

## 9. Invariants

- AI is still read-only: `memoryContext` is injected as prompt context only; no memory row is written by the AI
- `projectWithLocality()` is called **after** `project()` in the fan-out loop — same tick, same transaction
- `formatMemoryContext` returning `''` → `buildMemoryBlock` returns `[]` → no block injected into prompt (no empty section noise)
- The `npc_memory` SQLite table schema is unchanged — no migration needed
- `MEMORY_DIALOG_MAX_BULLETS = 5` matches `MAX_REFLECTION_CONTEXT_BULLETS = 5` for prompt budget parity

---

## 10. Success Criteria

- Build clean (`npm run build` in `packages/server`)
- All existing tests pass + ~20 new tests pass
- `getFormattedMemoryContext` returns non-empty string for an NPC that witnessed `FACTION_TILE_SEIZED` on its tile
- `buildSystemPrompt` output contains `## 個人記憶` section when `memoryContext` is present
- NPC on `t_forest` that witnessed a combat now has memory injected into dialog prompt
