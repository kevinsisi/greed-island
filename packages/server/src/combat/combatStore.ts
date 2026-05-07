// Combat session store — Phase B 用的 in-memory + SQLite append-log。
//
// Phase B 是「單擊判決」，但仍需記錄一場戰鬥的回合 / hp / 結果，
// 才能做：
//   * 玩家 reload 後仍看到尚未結束的戰鬥
//   * Since-Last-Visit 顯示「不在時打了 N 場」（v0.15 first cut 只算總場次）
//   * 後 Phase C / D 可從 combat_log replay
//
// Schema:
//   CREATE TABLE combat_sessions (
//     combat_id TEXT PRIMARY KEY,
//     player_account_id INTEGER NOT NULL,
//     npc_id TEXT NOT NULL,
//     tile_id TEXT NOT NULL,
//     started_tick INTEGER NOT NULL,
//     player_hp INTEGER NOT NULL,
//     npc_hp INTEGER NOT NULL,
//     combat_round INTEGER NOT NULL DEFAULT 0,
//     state TEXT NOT NULL DEFAULT 'active', -- active | resolved
//     outcome TEXT,                          -- player_victory | npc_victory | fled | NULL
//     resolved_tick INTEGER
//   );
//
//   CREATE TABLE combat_log (
//     id INTEGER PK AUTOINCREMENT,
//     combat_id TEXT NOT NULL,
//     tick INTEGER NOT NULL,
//     combat_round INTEGER NOT NULL,
//     event_type TEXT NOT NULL,
//     payload_json TEXT NOT NULL,
//     occurred_at INTEGER NOT NULL,
//     deterministic_key TEXT NOT NULL
//   );

import type Database from 'better-sqlite3'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'

type DatabaseConnection = Database.Database

export type CombatState = 'active' | 'resolved'
export type CombatOutcome = 'player_victory' | 'npc_victory' | 'fled'

export type CombatSessionRow = Readonly<{
  combat_id: string
  player_account_id: number
  npc_id: string
  tile_id: string
  started_tick: number
  player_hp: number
  npc_hp: number
  combat_round: number
  state: CombatState
  outcome: CombatOutcome | null
  resolved_tick: number | null
}>

export type CombatLogRow = Readonly<{
  id: number
  combat_id: string
  tick: number
  combat_round: number
  event_type: string
  payload_json: string
  occurred_at: number
  deterministic_key: string
}>

export class CombatStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'CombatStoreError'
  }
}

export function initializeCombatSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS combat_sessions (
      combat_id TEXT PRIMARY KEY,
      player_account_id INTEGER NOT NULL,
      npc_id TEXT NOT NULL,
      tile_id TEXT NOT NULL,
      started_tick INTEGER NOT NULL,
      player_hp INTEGER NOT NULL,
      npc_hp INTEGER NOT NULL,
      combat_round INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'active',
      outcome TEXT,
      resolved_tick INTEGER,
      FOREIGN KEY (player_account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_combat_sessions_player
      ON combat_sessions(player_account_id, state);
    CREATE INDEX IF NOT EXISTS idx_combat_sessions_npc
      ON combat_sessions(npc_id, state);

    CREATE TABLE IF NOT EXISTS combat_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      combat_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      combat_round INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      deterministic_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_combat_log_combat
      ON combat_log(combat_id, id);
    CREATE INDEX IF NOT EXISTS idx_combat_log_tick
      ON combat_log(tick);
  `)
}

export class CombatStore {
  /** NPC id → tick at which they recover from incapacitation. */
  private readonly npcIncapMap = new Map<string, number>()

  constructor(private readonly db: DatabaseConnection) {
    initializeCombatSchema(db)
  }

  /** 玩家是否已經有一場 active 戰鬥？（每位玩家同時只能有一場 Phase B） */
  getActiveSessionForPlayer(playerId: number): CombatSessionRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM combat_sessions
         WHERE player_account_id = ? AND state = 'active'
         ORDER BY started_tick DESC LIMIT 1`
      )
      .get(playerId) as CombatSessionRow | undefined
    return row ?? null
  }

  getSession(combatId: string): CombatSessionRow | null {
    const row = this.db
      .prepare('SELECT * FROM combat_sessions WHERE combat_id = ?')
      .get(combatId) as CombatSessionRow | undefined
    return row ?? null
  }

  createSession(input: {
    combatId: string
    playerAccountId: number
    npcId: string
    tileId: string
    startedTick: number
    playerHp: number
    npcHp: number
  }): CombatSessionRow {
    this.db
      .prepare(
        `INSERT INTO combat_sessions
           (combat_id, player_account_id, npc_id, tile_id, started_tick,
            player_hp, npc_hp, combat_round, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')`
      )
      .run(
        input.combatId,
        input.playerAccountId,
        input.npcId,
        input.tileId,
        input.startedTick,
        input.playerHp,
        input.npcHp
      )
    return {
      combat_id: input.combatId,
      player_account_id: input.playerAccountId,
      npc_id: input.npcId,
      tile_id: input.tileId,
      started_tick: input.startedTick,
      player_hp: input.playerHp,
      npc_hp: input.npcHp,
      combat_round: 0,
      state: 'active',
      outcome: null,
      resolved_tick: null,
    }
  }

  updateAfterRound(input: {
    combatId: string
    nextRound: number
    playerHp: number
    npcHp: number
    resolved: null | {
      outcome: CombatOutcome
      tick: number
    }
  }): CombatSessionRow {
    const tx = this.db.transaction(() => {
      if (input.resolved) {
        this.db
          .prepare(
            `UPDATE combat_sessions
               SET combat_round = ?, player_hp = ?, npc_hp = ?,
                   state = 'resolved', outcome = ?, resolved_tick = ?
               WHERE combat_id = ?`
          )
          .run(
            input.nextRound,
            input.playerHp,
            input.npcHp,
            input.resolved.outcome,
            input.resolved.tick,
            input.combatId
          )
      } else {
        this.db
          .prepare(
            `UPDATE combat_sessions
               SET combat_round = ?, player_hp = ?, npc_hp = ?
               WHERE combat_id = ?`
          )
          .run(input.nextRound, input.playerHp, input.npcHp, input.combatId)
      }
      const row = this.db
        .prepare('SELECT * FROM combat_sessions WHERE combat_id = ?')
        .get(input.combatId) as CombatSessionRow | undefined
      if (!row) {
        throw new CombatStoreError('SESSION_NOT_FOUND', 'combat session disappeared')
      }
      return row
    })
    return tx()
  }

  appendLog(input: {
    combatId: string
    tick: number
    combatRound: number
    eventType: string
    payload: Record<string, unknown>
  }): CombatLogRow {
    const seed = {
      combatId: input.combatId,
      combatRound: input.combatRound,
      eventType: input.eventType,
      payload: input.payload,
    }
    const deterministicKey = hashCanonicalJson(seed)
    const occurredAt = Date.now()
    const result = this.db
      .prepare(
        `INSERT INTO combat_log
           (combat_id, tick, combat_round, event_type, payload_json, occurred_at, deterministic_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.combatId,
        input.tick,
        input.combatRound,
        input.eventType,
        JSON.stringify(input.payload),
        occurredAt,
        deterministicKey
      )
    return {
      id: Number(result.lastInsertRowid),
      combat_id: input.combatId,
      tick: input.tick,
      combat_round: input.combatRound,
      event_type: input.eventType,
      payload_json: JSON.stringify(input.payload),
      occurred_at: occurredAt,
      deterministic_key: deterministicKey,
    }
  }

  listLog(combatId: string): CombatLogRow[] {
    return this.db
      .prepare('SELECT * FROM combat_log WHERE combat_id = ? ORDER BY id ASC')
      .all(combatId) as CombatLogRow[]
  }

  /** Mark NPC incapacitated until tick T. After T NPC can fight again. */
  incapacitateNpc(npcId: string, untilTick: number): void {
    this.npcIncapMap.set(npcId, untilTick)
  }

  isNpcIncapacitated(npcId: string, currentTick: number): boolean {
    const until = this.npcIncapMap.get(npcId)
    if (until === undefined) return false
    if (currentTick >= until) {
      this.npcIncapMap.delete(npcId)
      return false
    }
    return true
  }

  countCombatsSinceTick(playerAccountId: number, sinceTick: number): {
    total: number
    won: number
    lost: number
    fled: number
  } {
    const rows = this.db
      .prepare(
        `SELECT outcome FROM combat_sessions
         WHERE player_account_id = ? AND state = 'resolved' AND resolved_tick > ?`
      )
      .all(playerAccountId, sinceTick) as Array<{ outcome: CombatOutcome }>
    let won = 0
    let lost = 0
    let fled = 0
    for (const r of rows) {
      if (r.outcome === 'player_victory') won++
      else if (r.outcome === 'npc_victory') lost++
      else if (r.outcome === 'fled') fled++
    }
    return { total: rows.length, won, lost, fled }
  }
}
