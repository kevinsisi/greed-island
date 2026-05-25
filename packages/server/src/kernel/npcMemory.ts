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
  FactionNpcLoyaltyShiftedCmd,
  LivingWorldEventPayload,
  NpcDeceasedCmd,
  NpcHeirAssignedCmd,
  NpcInteractCmd,
  NpcMoveCmd,
  NpcProductiveActionCmd,
  NpcRumorSpreadCmd,
  PlayerIntervenecmd,
  SeasonChangeCmd,
  WeatherChangeCmd
} from './livingWorldCommands.js'
import { TILE_ADJACENCY } from '../projections/beliefProjection.js'
import {
  MEMORY_VERY_HIGH_DECAY_TICKS,
  MEMORY_HIGH_DECAY_TICKS,
  MEMORY_NORMAL_DECAY_TICKS,
  MEMORY_DIALOG_MAX_BULLETS,
} from '../config/world.js'

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

export type PlayerDialogMemoryInput = Readonly<{
  npcId: string
  playerAccountId: string
  intent: string
  playerMessage: string
  replyZh: string
  replyEn: string
  tick: number
  trustAfter: number
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
    insertMemoryRows(insert, rows, tick)
  }

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

  rememberPlayerDialog(input: PlayerDialogMemoryInput): void {
    if (!Number.isFinite(input.tick)) return
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO npc_memory
        (npc_id, memory_type, content_json, content_hash, tick, importance)
       VALUES (@npcId, @memoryType, @contentJson, @contentHash, @tick, @importance)`
    )
    insertMemoryRows(
      insert,
      [
        {
          npcId: input.npcId,
          memoryType: 'interaction',
          content: {
            kind: 'player.dialog',
            playerAccountId: input.playerAccountId,
            intent: input.intent,
            playerMessage: input.playerMessage,
            replyZh: input.replyZh,
            replyEn: input.replyEn,
            trustAfter: input.trustAfter,
            tick: input.tick
          },
          importance: input.playerMessage.trim().length > 0 ? 6 : 4
        }
      ],
      input.tick
    )
  }

  rebuildFromEvents(events: readonly Event[]): void {
    // NOTE: projectWithLocality() is intentionally not called here.
    // Locality rows (written during live sim via projectWithLocality) depend on
    // NPC tile positions at event time — state not stored in the EventLog.
    // After restart, locality rows are absent; only project() rows are rebuilt.
    // This is the same trade-off as BeliefProjection (no boot hydration).
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

  countAll(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM npc_memory')
      .get() as { c: number }
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
    case 'PLAYER_INTERVENE': {
      const d = data as PlayerIntervenecmd
      const importance = d.intentClass === 'threaten' || d.intentClass === 'provoke'
        ? 7
        : d.intentClass === 'mediate'
        ? 6
        : 3
      const baseContent = {
        kind: 'player.intervene',
        playerAccountId: d.playerAccountId,
        tile: d.tile,
        intentClass: d.intentClass,
        message: d.message,
        narration,
        tick
      } as const
      return [
        {
          npcId: d.npcA,
          memoryType: 'interaction',
          content: { ...baseContent, otherNpc: d.npcB },
          importance
        },
        {
          npcId: d.npcB,
          memoryType: 'interaction',
          content: { ...baseContent, otherNpc: d.npcA },
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
    case 'NPC_PRODUCTIVE_ACTION': {
      const d = data as NpcProductiveActionCmd
      const importance = d.domain === 'build' || d.domain === 'learn' ? 6 : 5
      return [
        {
          npcId: d.npcId,
          memoryType: 'event',
          content: {
            kind: 'productive.action',
            tile: d.tile,
            activity: d.activity,
            domain: d.domain,
            metric: d.metric,
            delta: d.delta,
            narration,
            tick
          },
          importance
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
    case 'NPC_RUMOR_SPREAD': {
      const d = data as NpcRumorSpreadCmd
      const content = { kind: 'rumor.spread', topic: d.topic, subjectId: d.subjectId, tileId: d.tileId, accuracy: d.accuracy, tick } as const
      return [
        { npcId: d.fromNpcId, memoryType: 'event', content, importance: 3 },
        { npcId: d.toNpcId, memoryType: 'event', content, importance: 3 },
      ]
    }
    case 'NPC_DECEASED': {
      const d = data as NpcDeceasedCmd
      return [
        {
          npcId: 'world',
          memoryType: 'event',
          content: { kind: 'npc.deceased', npcId: d.npcId, householdId: d.householdId, tileId: d.tileId, narration, tick },
          importance: 8
        }
      ]
    }
    case 'NPC_HEIR_ASSIGNED': {
      const d = data as NpcHeirAssignedCmd
      return [
        {
          npcId: d.heirNpcId,
          memoryType: 'event',
          content: { kind: 'npc.heir_assigned', householdId: d.householdId, deceasedNpcId: d.deceasedNpcId, narration, tick },
          importance: 9
        }
      ]
    }
    case 'FACTION_NPC_LOYALTY_SHIFTED': {
      const d = data as FactionNpcLoyaltyShiftedCmd
      return [
        {
          npcId: d.npcId,
          memoryType: 'event',
          content: { kind: 'faction.loyalty_shifted', tileId: d.tileId, fromFaction: d.fromFaction, toFaction: d.toFaction, narration, tick },
          importance: 8
        }
      ]
    }
    default:
      return []
  }
}

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
      const lostNarration = narration
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
      rows.push({ npcId, memoryType, content: { ...contentBase }, importance: baseImportance })
    } else if ((TILE_ADJACENCY[npcTile] ?? []).includes(eventTileId)) {
      rows.push({ npcId, memoryType, content: { ...contentBase }, importance: Math.max(1, baseImportance - 2) })
    }
  }
  return rows
}

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
    case 'npc.heir_assigned':
      return `繼承了 ${content.householdId} 家業，成為戶主${content.narration ? `（${content.narration}）` : ''}`
    case 'npc.deceased':
      return `得知 ${content.npcId} 已離世於 ${content.tileId}${content.narration ? `（${content.narration}）` : ''}`
    case 'faction.loyalty_shifted':
      return `效忠從 ${content.fromFaction} 轉向 ${content.toFaction}${content.narration ? `（${content.narration}）` : ''}`
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

function insertMemoryRows(
  insert: Database.Statement,
  rows: readonly DerivedMemoryRow[],
  tick: number
): void {
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
