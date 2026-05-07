// NPC memory projection — a derivation over the EventLog. Every
// committed living-world event that an NPC witnesses or participates
// in produces one or more rows in `npc_memory`. The projection is
// rebuildable: drop the table, replay the EventLog, get identical
// rows back.
//
// Memory is intentionally additive — a row is appended for every
// salient event. Importance is a deterministic 1..10 score derived
// from event type + payload, so policies can ask for "top-N most
// important memories" without scanning the whole table.

import Database from 'better-sqlite3'
import { hashCanonicalJson, toCanonicalJson } from './canonicalJson.js'
import type { Event } from './types.js'
import type {
  AreaPressureCmd,
  BuildingEnterCmd,
  BuildingLeaveCmd,
  LivingWorldEventPayload,
  NpcInteractCmd,
  NpcMoveCmd,
  SeasonChangeCmd,
  WeatherChangeCmd
} from './livingWorldCommands.js'

type DatabaseConnection = Database.Database

export type NpcMemoryType =
  | 'interaction'
  | 'observation'
  | 'event'
  | 'movement'
  | 'environment'

export type NpcMemoryRow = Readonly<{
  id: number
  npcId: string
  memoryType: NpcMemoryType
  contentJson: string
  tick: number
  importance: number
}>

export type NpcMemoryRecord = Readonly<{
  id: number
  npcId: string
  memoryType: NpcMemoryType
  content: Record<string, unknown>
  tick: number
  importance: number
}>

export class SqliteNpcMemoryStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeNpcMemorySchema(db)
  }

  /**
   * Project a single committed event into memory rows. Idempotent on
   * `(npc_id, memory_type, tick, content_hash)` — replaying the same
   * event twice yields the same rows.
   */
  project(event: Event): void {
    if (typeof event.tick !== 'number') return
    const payload = event.payload
    if (!isLivingWorldEventPayload(payload)) return
    const data = payload.data

    const tick = event.tick
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO npc_memory
        (npc_id, memory_type, content_json, content_hash, tick, importance)
       VALUES (@npcId, @memoryType, @contentJson, @contentHash, @tick, @importance)`
    )

    const rows = deriveMemoryRows(event.eventType, data, tick, payload.narration ?? null)
    for (const row of rows) {
      const contentJson = toCanonicalJson(row.content)
      const contentHash = hashCanonicalJson({
        type: row.memoryType,
        content: row.content,
        tick
      })
      insert.run({
        npcId: row.npcId,
        memoryType: row.memoryType,
        contentJson,
        contentHash,
        tick,
        importance: row.importance
      })
    }
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.db.exec('DELETE FROM npc_memory')
    const tx = this.db.transaction(() => {
      for (const event of events) this.project(event)
    })
    tx()
  }

  getRecent(npcId: string, limit = 20): NpcMemoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, npc_id as npcId, memory_type as memoryType, content_json as contentJson,
                tick, importance
           FROM npc_memory
          WHERE npc_id = ?
          ORDER BY tick DESC, id DESC
          LIMIT ?`
      )
      .all(npcId, limit) as Array<{
      id: number
      npcId: string
      memoryType: NpcMemoryType
      contentJson: string
      tick: number
      importance: number
    }>
    return rows.map(rowToRecord)
  }

  getImportant(npcId: string, threshold = 6, limit = 20): NpcMemoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, npc_id as npcId, memory_type as memoryType, content_json as contentJson,
                tick, importance
           FROM npc_memory
          WHERE npc_id = ? AND importance >= ?
          ORDER BY importance DESC, tick DESC, id DESC
          LIMIT ?`
      )
      .all(npcId, threshold, limit) as Array<{
      id: number
      npcId: string
      memoryType: NpcMemoryType
      contentJson: string
      tick: number
      importance: number
    }>
    return rows.map(rowToRecord)
  }

  countFor(npcId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM npc_memory WHERE npc_id = ?')
      .get(npcId) as { c: number }
    return row.c
  }

  /** Deterministic canonical hash of all rows — used by replay tests. */
  canonicalHash(): string {
    const rows = this.db
      .prepare(
        `SELECT npc_id, memory_type, content_json, tick, importance
           FROM npc_memory
          ORDER BY tick ASC, npc_id ASC, memory_type ASC, content_json ASC, importance ASC`
      )
      .all() as Array<{
      npc_id: string
      memory_type: string
      content_json: string
      tick: number
      importance: number
    }>
    return hashCanonicalJson(
      rows.map((r) => ({
        npcId: r.npc_id,
        memoryType: r.memory_type,
        content: JSON.parse(r.content_json) as unknown,
        tick: r.tick,
        importance: r.importance
      }))
    )
  }
}

export function initializeNpcMemorySchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS npc_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      npc_id TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      tick INTEGER NOT NULL,
      importance INTEGER NOT NULL,
      UNIQUE (npc_id, memory_type, tick, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_npc_memory_npc ON npc_memory(npc_id);
    CREATE INDEX IF NOT EXISTS idx_npc_memory_tick ON npc_memory(tick);
    CREATE INDEX IF NOT EXISTS idx_npc_memory_importance ON npc_memory(importance);
  `)
}

type DerivedMemoryRow = Readonly<{
  npcId: string
  memoryType: NpcMemoryType
  content: Record<string, unknown>
  importance: number
}>

function deriveMemoryRows(
  eventType: string,
  data: unknown,
  tick: number,
  narration: string | null
): readonly DerivedMemoryRow[] {
  switch (eventType) {
    case 'NPC_INTERACT': {
      const d = data as NpcInteractCmd
      const importance = d.mode === 'argue' ? 7 : 4
      const baseContent = {
        kind: 'interaction',
        tile: d.tile,
        mode: d.mode,
        narration,
        tick
      } as const
      return [
        {
          npcId: d.participants[0],
          memoryType: 'interaction',
          content: { ...baseContent, withNpc: d.participants[1] },
          importance
        },
        {
          npcId: d.participants[1],
          memoryType: 'interaction',
          content: { ...baseContent, withNpc: d.participants[0] },
          importance
        }
      ]
    }
    case 'NPC_MOVE': {
      const d = data as NpcMoveCmd
      // Most moves are low-importance noise; only "reachedDest" is
      // worth remembering as a deliberate journey.
      if (!d.reachedDest) return []
      return [
        {
          npcId: d.npcId,
          memoryType: 'movement',
          content: { kind: 'arrival', from: d.from, to: d.to, tick },
          importance: 2
        }
      ]
    }
    case 'BUILDING_ENTER': {
      const d = data as BuildingEnterCmd
      return [
        {
          npcId: d.npcId,
          memoryType: 'event',
          content: {
            kind: 'building.enter',
            buildingId: d.buildingId,
            tileId: d.tileId,
            tick
          },
          importance: 3
        }
      ]
    }
    case 'BUILDING_LEAVE': {
      const d = data as BuildingLeaveCmd
      return [
        {
          npcId: d.npcId,
          memoryType: 'event',
          content: {
            kind: 'building.leave',
            buildingId: d.buildingId,
            tileId: d.tileId,
            tick
          },
          importance: 2
        }
      ]
    }
    case 'AREA_PRESSURE': {
      const d = data as AreaPressureCmd
      // Area pressure is an environment fact — not tied to a single
      // NPC. We don't fan it out per-NPC here to keep the table from
      // exploding; runtime can compose "witnessed" memories on demand
      // when an NPC's tile matches.
      return [
        {
          npcId: `area:${d.tileId}`,
          memoryType: 'environment',
          content: { kind: d.kind, tileId: d.tileId, detail: d.detail, tick },
          importance: 5
        }
      ]
    }
    case 'WEATHER_CHANGE': {
      const d = data as WeatherChangeCmd
      return [
        {
          npcId: 'world',
          memoryType: 'environment',
          content: { kind: 'weather', from: d.from, to: d.to, tick },
          importance: 2
        }
      ]
    }
    case 'SEASON_CHANGE': {
      const d = data as SeasonChangeCmd
      return [
        {
          npcId: 'world',
          memoryType: 'environment',
          content: { kind: 'season', from: d.from, to: d.to, tick },
          importance: 4
        }
      ]
    }
    default:
      return []
  }
}

function rowToRecord(row: {
  id: number
  npcId: string
  memoryType: NpcMemoryType
  contentJson: string
  tick: number
  importance: number
}): NpcMemoryRecord {
  return {
    id: row.id,
    npcId: row.npcId,
    memoryType: row.memoryType,
    content: JSON.parse(row.contentJson) as Record<string, unknown>,
    tick: row.tick,
    importance: row.importance
  }
}

function isLivingWorldEventPayload(value: unknown): value is LivingWorldEventPayload {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  if (typeof r.actorType !== 'string') return false
  if (!('data' in r) || typeof r.data !== 'object' || r.data === null) return false
  return true
}
