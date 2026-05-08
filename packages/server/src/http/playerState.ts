// Per-user (per-account) state stores.
//
// player_npc_relations  — one row per (account, npc), tracks the
// player's personal trust value with each NPC plus total interactions.
// trust is per-user; the global NPC profile only seeds the initial value.
//
// personal_events       — append-only log of the player's NPC dialog
// turns. Personal events never appear in the public world event log.
//
// World-level events (weather, NPC routine moves, rare windows) stay in
// the kernel event store and are visible to every authenticated client.
// Personal interactions stay in this file.

import type Database from 'better-sqlite3'

type DatabaseConnection = Database.Database

export const RELATIONSHIP_MIN = 0
export const RELATIONSHIP_MAX = 100

export type RelationRow = Readonly<{
  account_id: number
  npc_id: string
  trust: number
  interaction_count: number
  last_interaction_tick: number
  updated_at: number
}>

export type RelationRecord = Readonly<{
  accountId: number
  npcId: string
  trust: number
  interactionCount: number
  lastInteractionTick: number
  updatedAt: number
}>

export type PersonalEventRow = Readonly<{
  id: number
  account_id: number
  npc_id: string
  intent: string
  player_message: string
  line_zh: string
  line_en: string
  tick: number
  occurred_at: number
  trust_after: number
}>

export type PersonalEventRecord = Readonly<{
  id: number
  accountId: number
  npcId: string
  intent: string
  playerMessage: string
  lineZh: string
  lineEn: string
  tick: number
  occurredAt: number
  trustAfter: number
}>

export function initializePlayerStateSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_npc_relations (
      account_id INTEGER NOT NULL,
      npc_id TEXT NOT NULL,
      trust INTEGER NOT NULL,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      last_interaction_tick INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, npc_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_relations_account ON player_npc_relations(account_id);

    CREATE TABLE IF NOT EXISTS personal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      npc_id TEXT NOT NULL,
      intent TEXT NOT NULL,
      player_message TEXT NOT NULL DEFAULT '',
      line_zh TEXT NOT NULL,
      line_en TEXT NOT NULL,
      tick INTEGER NOT NULL,
      occurred_at INTEGER NOT NULL,
      trust_after INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_personal_events_account_npc
      ON personal_events(account_id, npc_id, id);
  `)

  const columns = db.prepare('PRAGMA table_info(personal_events)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'player_message')) {
    db.exec("ALTER TABLE personal_events ADD COLUMN player_message TEXT NOT NULL DEFAULT ''")
  }
}

export class PlayerStateStore {
  constructor(private readonly db: DatabaseConnection) {
    initializePlayerStateSchema(db)
  }

  getRelation(accountId: number, npcId: string): RelationRecord | null {
    const row = this.db
      .prepare('SELECT * FROM player_npc_relations WHERE account_id = ? AND npc_id = ?')
      .get(accountId, npcId) as RelationRow | undefined
    return row ? toRelationRecord(row) : null
  }

  listRelations(accountId: number): RelationRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM player_npc_relations WHERE account_id = ? ORDER BY npc_id')
      .all(accountId) as RelationRow[]
    return rows.map(toRelationRecord)
  }

  upsertRelation(input: {
    accountId: number
    npcId: string
    trust: number
    interactionCount: number
    lastInteractionTick: number
  }): RelationRecord {
    const trust = clampTrust(input.trust)
    const updatedAt = Date.now()
    this.db
      .prepare(
        `INSERT INTO player_npc_relations
           (account_id, npc_id, trust, interaction_count, last_interaction_tick, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, npc_id) DO UPDATE SET
           trust = excluded.trust,
           interaction_count = excluded.interaction_count,
           last_interaction_tick = excluded.last_interaction_tick,
           updated_at = excluded.updated_at`
      )
      .run(
        input.accountId,
        input.npcId,
        trust,
        input.interactionCount,
        input.lastInteractionTick,
        updatedAt
      )
    return {
      accountId: input.accountId,
      npcId: input.npcId,
      trust,
      interactionCount: input.interactionCount,
      lastInteractionTick: input.lastInteractionTick,
      updatedAt,
    }
  }

  appendPersonalEvent(input: {
    accountId: number
    npcId: string
    intent: string
    playerMessage: string
    lineZh: string
    lineEn: string
    tick: number
    trustAfter: number
  }): PersonalEventRecord {
    const occurredAt = Date.now()
    const result = this.db
      .prepare(
        `INSERT INTO personal_events
           (account_id, npc_id, intent, player_message, line_zh, line_en, tick, occurred_at, trust_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.accountId,
        input.npcId,
        input.intent,
        input.playerMessage,
        input.lineZh,
        input.lineEn,
        input.tick,
        occurredAt,
        clampTrust(input.trustAfter)
      )
    return {
      id: Number(result.lastInsertRowid),
      accountId: input.accountId,
      npcId: input.npcId,
      intent: input.intent,
      playerMessage: input.playerMessage,
      lineZh: input.lineZh,
      lineEn: input.lineEn,
      tick: input.tick,
      occurredAt,
      trustAfter: clampTrust(input.trustAfter),
    }
  }

  listPersonalEvents(input: {
    accountId: number
    npcId?: string
    limit: number
  }): PersonalEventRecord[] {
    const limit = Math.max(1, Math.min(200, Math.floor(input.limit)))
    const rows = input.npcId
      ? (this.db
          .prepare(
            `SELECT * FROM personal_events
             WHERE account_id = ? AND npc_id = ?
             ORDER BY id DESC LIMIT ?`
          )
          .all(input.accountId, input.npcId, limit) as PersonalEventRow[])
      : (this.db
          .prepare(
            `SELECT * FROM personal_events
             WHERE account_id = ?
             ORDER BY id DESC LIMIT ?`
          )
          .all(input.accountId, limit) as PersonalEventRow[])
    return rows.map(toPersonalEventRecord)
  }
}

export function clampTrust(value: number): number {
  if (!Number.isFinite(value)) return RELATIONSHIP_MIN
  return Math.max(RELATIONSHIP_MIN, Math.min(RELATIONSHIP_MAX, Math.round(value)))
}

function toRelationRecord(row: RelationRow): RelationRecord {
  return {
    accountId: row.account_id,
    npcId: row.npc_id,
    trust: row.trust,
    interactionCount: row.interaction_count,
    lastInteractionTick: row.last_interaction_tick,
    updatedAt: row.updated_at,
  }
}

function toPersonalEventRecord(row: PersonalEventRow): PersonalEventRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    npcId: row.npc_id,
    intent: row.intent,
    playerMessage: row.player_message,
    lineZh: row.line_zh,
    lineEn: row.line_en,
    tick: row.tick,
    occurredAt: row.occurred_at,
    trustAfter: row.trust_after,
  }
}
