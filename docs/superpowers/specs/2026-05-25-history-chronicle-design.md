# v0.54.0 — History Chronicle Projection

**Date:** 2026-05-25  
**Phase:** Civilization Runtime Layer 3, Phase 5 (§40.4)  
**Scope:** `history_chronicle` SQLite projection — arc detection, backend API, runtime getter

---

## 1. Problem Statement

The world's EventLog accumulates thousands of events — faction wars, species extinctions, settlement formations, great migrations — but none of these are surfaced as emergent narrative arcs. §43.1 criterion 4 (world continues after player leaves, with visible arc deltas) and §43.2 criteria 10–11 (extinct species visible only in old chronicles, world is civilization trapped inside living planet) are unverifiable without a `history_chronicle` projection.

---

## 2. Goals

- Detect 7 arc types from committed events (deterministic, no AI)
- Store arcs in `history_chronicle` SQLite table (event-sourced projection, rebuildable)
- Expose via `runtime.getHistoryArcs()` getter and `GET /api/history` endpoint
- ~15 new tests
- No frontend in this release (v0.54.1)

**Out of scope:** AI-phrased arcs, arc closing/ending events, frontend HistoryPanel

---

## 3. Architecture

### 3.1 Files Modified

| File | Change |
|---|---|
| `projections/historyProjection.ts` | New: `HistoryChronicleProjection` class + arc detection + schema init |
| `projections/historyProjection.test.ts` | New: ~15 tests |
| `sim/runtime.ts` | Wire `historyProjection.project(ev)` in both fan-out locations + add `getHistoryArcs()` getter |
| `http/world.ts` | Add `GET /api/history` endpoint |

---

## 4. Data Model

```typescript
export type HistoryArcType =
  | 'settlement_formation'
  | 'faction_war'
  | 'founder_heir'
  | 'decline'
  | 'ecological_collapse'
  | 'great_migration'
  | 'extinction'

export type HistoryArc = Readonly<{
  id: number
  arcType: HistoryArcType
  tileId: string | null
  npcId: string | null
  factionId: string | null
  speciesId: string | null
  startTick: number
  narrationZh: string
  openingEventType: string
  contentHash: string
}>
```

### 4.1 Schema

```sql
CREATE TABLE IF NOT EXISTS history_chronicle (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  arc_type            TEXT NOT NULL,
  tile_id             TEXT,
  npc_id              TEXT,
  faction_id          TEXT,
  species_id          TEXT,
  start_tick          INTEGER NOT NULL,
  narration_zh        TEXT NOT NULL,
  opening_event_type  TEXT NOT NULL,
  content_hash        TEXT NOT NULL,
  UNIQUE(content_hash)
);
CREATE INDEX IF NOT EXISTS idx_history_arc_type ON history_chronicle(arc_type);
CREATE INDEX IF NOT EXISTS idx_history_tile ON history_chronicle(tile_id);
CREATE INDEX IF NOT EXISTS idx_history_tick ON history_chronicle(start_tick);
```

`content_hash` = `sha256(arcType + '|' + openingEventType + '|' + startTick + '|' + (tileId ?? '') + '|' + (speciesId ?? '') + '|' + (factionId ?? '') + '|' + (npcId ?? ''))` — prevents duplicate arcs on replay.

---

## 5. Arc Detection Rules

All detection is deterministic — no AI, no randomness. Each trigger event maps to exactly one arc row.

| Trigger Event | arcType | Extracted Fields | narrationZh Template |
|---|---|---|---|
| `SETTLEMENT_FORMED` | `settlement_formation` | `tileId`, `settlementId` | `{tileId} 聚落於第 {startTick} 轉正式成立` |
| `FACTION_TILE_SEIZED` | `faction_war` | `tileId`, `factionId`, `previousFactionId` | `{factionId} 於第 {startTick} 轉奪取 {tileId}，取代 {previousFactionId ?? '無主'}` |
| `NPC_HEIR_ASSIGNED` | `founder_heir` | `heirNpcId`, `deceasedNpcId`, `householdId` | `{heirNpcId} 於第 {startTick} 轉繼承 {householdId} 家業，延續 {deceasedNpcId} 的傳統` |
| `SETTLEMENT_DECLINED` | `decline` | `tileId`, `settlementId` | `{tileId} 聚落於第 {startTick} 轉走向衰敗` |
| `FISHERY_COLLAPSED` | `ecological_collapse` | `tileId` | `{tileId} 漁場於第 {startTick} 轉崩潰` |
| `MIGRATION_WAVE_STARTED` | `great_migration` | `speciesId`, `fromTileId`, `toTileId` | `{speciesId} 大遷徙浪潮於第 {startTick} 轉自 {fromTileId} 啟動，目標 {toTileId}` |
| `SPECIES_EXTINCT` | `extinction` | `speciesId`, `lastSeenTick` | `{speciesId} 物種於第 {startTick} 轉宣告滅絕` |

---

## 6. HistoryChronicleProjection Class

```typescript
export class HistoryChronicleProjection {
  constructor(private readonly db: Database.Database) {
    initializeHistoryChronicleSchema(db)
  }

  project(event: Event): void {
    // Extract arc from event, INSERT OR IGNORE by content_hash
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.db.exec('DELETE FROM history_chronicle')
    const tx = this.db.transaction(() => {
      for (const ev of events) this.project(ev)
    })
    tx()
  }

  getArcs(options?: {
    tileId?: string
    arcType?: HistoryArcType
    limit?: number
  }): HistoryArc[] {
    // SELECT with optional WHERE clause, ORDER BY start_tick DESC, LIMIT
  }

  canonicalHash(): string {
    // sha256 of all rows ordered deterministically — used in replay tests
  }
}
```

---

## 7. Runtime Integration

```typescript
// sim/runtime.ts — added to both fan-out locations (same pattern as npcMemory)
this.historyProjection.project(ev)

// New getter:
getHistoryArcs(options?: { tileId?: string; arcType?: string; limit?: number }): HistoryArc[] {
  return this.historyProjection.getArcs(options)
}
```

`historyProjection` is initialized in the runtime constructor alongside other projections. It IS included in `rebuildFromEvents` boot path (unlike `projectWithLocality` — history arcs are deterministic from EventLog alone).

---

## 8. API Endpoint

```
GET /api/history
  ?tileId=t_forest          (optional filter)
  &type=extinction           (optional filter by arcType)
  &limit=20                  (optional, default 50, max 200)

Response 200: {
  arcs: HistoryArc[]
}
```

Located in `http/world.ts` alongside existing world-level endpoints.

---

## 9. Testing Strategy (~15 tests)

### `historyProjection.test.ts`

- `project(SETTLEMENT_FORMED)` → inserts `settlement_formation` arc with correct tileId, narrationZh, startTick
- `project(FACTION_TILE_SEIZED)` → inserts `faction_war` arc with correct factionId + previousFactionId
- `project(NPC_HEIR_ASSIGNED)` → inserts `founder_heir` arc with heirNpcId, deceasedNpcId, householdId
- `project(SETTLEMENT_DECLINED)` → inserts `decline` arc
- `project(FISHERY_COLLAPSED)` → inserts `ecological_collapse` arc
- `project(MIGRATION_WAVE_STARTED)` → inserts `great_migration` arc with speciesId, fromTileId, toTileId
- `project(SPECIES_EXTINCT)` → inserts `extinction` arc with speciesId
- `project(unknown event type)` → no row inserted (default case)
- `project(same event twice)` → idempotent — still only 1 row (INSERT OR IGNORE)
- `rebuildFromEvents([...])` → clears table and re-projects; same arc count
- `getArcs()` → returns all arcs ordered by start_tick DESC
- `getArcs({ tileId: 't_forest' })` → returns only arcs for that tile
- `getArcs({ arcType: 'extinction' })` → returns only extinction arcs
- `getArcs({ limit: 2 })` → caps at 2 results
- `canonicalHash()` → same hash after rebuild

---

## 10. Invariants

- `project()` is always called via the simulation fan-out — history projection is read from EventLog, never written by AI
- `rebuildFromEvents` produces identical rows to live projection (deterministic)
- `content_hash` uniqueness ensures idempotency — replaying the same event never creates duplicate arcs
- No LivingWorldEventPayload check needed — these events have varied payload shapes; each case typecasts directly

---

## 11. Success Criteria

- Build clean (`npm run build` in `packages/server`)
- All 885 existing tests pass + ~15 new tests
- `getHistoryArcs()` returns a non-empty list after committing `SPECIES_EXTINCT` and `SETTLEMENT_FORMED` events
- `GET /api/history?type=extinction` returns 200 with arc data
- `rebuildFromEvents` produces canonical hash identical to live-projected hash
