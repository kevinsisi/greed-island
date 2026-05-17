// Combat session store — SQLite projection of committed combat EventLog rows.
//
// Phase B 是「單擊判決」，但仍需投影一場戰鬥的回合 / hp / 結果，
// 才能做：
//   * 玩家 reload 後仍看到尚未結束的戰鬥
//   * Since-Last-Visit 顯示「不在時打了 N 場」（v0.15 first cut 只算總場次）
//   * 後 Phase C / D 可從 canonical EventLog replay 出 legacy combat_log rows
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
import { hashCanonicalJson, toCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

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
    CREATE INDEX IF NOT EXISTS idx_combat_log_deterministic_key
      ON combat_log(deterministic_key);
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

  listLog(combatId: string): CombatLogRow[] {
    return this.db
      .prepare('SELECT * FROM combat_log WHERE combat_id = ? ORDER BY id ASC')
      .all(combatId) as CombatLogRow[]
  }

  projectEvent(event: Event): void {
    this.projectCommittedEvent(event)
  }

  rebuildFromEvents(events: readonly Event[]): void {
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence)
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM combat_log').run()
      this.db.prepare('DELETE FROM combat_sessions').run()
      this.npcIncapMap.clear()
      for (const event of ordered) this.projectCommittedEvent(event)
    })
    tx()
  }

  hasProjectionRows(): boolean {
    const sessions = this.db.prepare('SELECT COUNT(*) AS count FROM combat_sessions').get() as { count: number }
    const logs = this.db.prepare('SELECT COUNT(*) AS count FROM combat_log').get() as { count: number }
    return sessions.count > 0 || logs.count > 0
  }

  canSafelyRebuildFromEvents(events: readonly Event[]): boolean {
    for (const event of events) {
      if (event.eventType !== 'COMBAT_PLAYER_ACTION') continue
      const payload = readCombatPayload(event.payload)
      if (
        readNumber(payload, 'playerHpAfter') === null ||
        readNumber(payload, 'npcHpAfter') === null ||
        !Array.isArray(payload.events)
      ) return false
    }
    return true
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
      .all(playerAccountId, sinceTick) as Array<{ outcome: CombatOutcome | null }>
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

  private projectCommittedEvent(event: Event): void {
    const payload = readCombatPayload(event.payload)
    const combatId = readString(payload, 'combatId')
    if (!combatId) return

    switch (event.eventType) {
      case 'COMBAT_INITIATE':
        this.projectInitiate(event, combatId, payload)
        return
      case 'COMBAT_PLAYER_ACTION':
        this.projectPlayerAction(event, combatId, payload)
        return
      case 'COMBAT_RESOLVE':
        this.projectResolve(event, combatId, payload)
        this.appendProjectedLog(event, combatId, event.eventType, payload, 0)
        return
      case 'COMBAT_DAMAGE':
        if (this.hasProjectedLog(event, event.eventType, payload, 0)) return
        this.projectDamage(event, combatId, payload)
        this.appendProjectedLog(event, combatId, event.eventType, payload, 0)
        return
      case 'COMBAT_HEAL':
        if (this.hasProjectedLog(event, event.eventType, payload, 0)) return
        this.projectHeal(event, combatId, payload)
        this.appendProjectedLog(event, combatId, event.eventType, payload, 0)
        return
      case 'COMBAT_DEFEAT':
        if (this.hasProjectedLog(event, event.eventType, payload, 0)) return
        this.projectDefeat(event, combatId, payload)
        this.appendProjectedLog(event, combatId, event.eventType, payload, 0)
        return
      case 'COMBAT_DEFEND':
      case 'COMBAT_FLEE':
      case 'COMBAT_CARD_IGNORED':
      case 'COMBAT_CARD_PLAY':
      case 'COMBAT_CARD_PLAY_ACCEPTED':
      case 'COMBAT_CARD_PLAY_REJECTED':
      case 'COMBAT_STATUS_APPLY':
      case 'COMBAT_STATUS_TICK':
      case 'COMBAT_STATUS_END':
      case 'COMBAT_TARGET_LOCK':
      case 'COMBAT_TARGET_LOCK_FAIL':
      case 'COMBAT_PHASE_SHIFT':
      case 'COMBAT_FLEE_ATTEMPT':
        this.appendProjectedLog(event, combatId, event.eventType, payload, 0)
        return
    }
  }

  private projectInitiate(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const playerAccountId = readAccountId(payload, 'playerAccountId') ?? readAccountId(payload, 'playerActorId')
    const npcId = readString(payload, 'npcId') ?? readString(payload, 'npcActorId')
    const tileId = readString(payload, 'tile') ?? readString(payload, 'tileId')
    const playerHp = readNumber(payload, 'playerCombatHp') ?? readNumber(payload, 'playerHp')
    const npcHp = readNumber(payload, 'npcCombatHp') ?? readNumber(payload, 'npcHp')
    if (playerAccountId === null || !npcId || !tileId || playerHp === null || npcHp === null) return

    this.db
      .prepare(
        `INSERT OR IGNORE INTO combat_sessions
           (combat_id, player_account_id, npc_id, tile_id, started_tick,
            player_hp, npc_hp, combat_round, state)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')`
      )
      .run(
        combatId,
        playerAccountId,
        npcId,
        tileId,
        event.tick ?? 0,
        Math.max(0, Math.floor(playerHp)),
        Math.max(0, Math.floor(npcHp))
      )
    this.appendProjectedLog(event, combatId, 'COMBAT_INITIATE', payload, 0)
  }

  private projectPlayerAction(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const combatRound = readRound(payload)
    const playerHpAfter = readNumber(payload, 'playerHpAfter')
    const npcHpAfter = readNumber(payload, 'npcHpAfter')
    if (combatRound !== null && playerHpAfter !== null && npcHpAfter !== null) {
      this.db
        .prepare(
          `UPDATE combat_sessions
             SET combat_round = CASE WHEN combat_round > ? THEN combat_round ELSE ? END,
                 player_hp = ?, npc_hp = ?
             WHERE combat_id = ?`
        )
        .run(
          combatRound,
          combatRound,
          Math.max(0, Math.floor(playerHpAfter)),
          Math.max(0, Math.floor(npcHpAfter)),
          combatId
        )
    }

    const resultEvents = readProjectedEvents(payload, combatId)
    if (resultEvents.length === 0) {
      this.appendProjectedLog(event, combatId, 'COMBAT_PLAYER_ACTION', payload, 0)
      return
    }
    resultEvents
      .filter((resultEvent) => resultEvent.eventType !== 'COMBAT_RESOLVE')
      .forEach((resultEvent, index) => {
        this.appendProjectedLog(event, combatId, resultEvent.eventType, resultEvent.payload, index)
      })
  }

  private projectResolve(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const outcome = readOutcome(payload)
    const finalPlayerHp = readNumber(payload, 'finalPlayerHp')
    const finalNpcHp = readNumber(payload, 'finalNpcHp')
    const durationRounds = readNumber(payload, 'durationRounds') ?? readNumber(payload, 'combatTick')
    const resolvedTick = event.tick ?? 0
    if (!outcome || finalPlayerHp === null || finalNpcHp === null || durationRounds === null) return

    this.db
      .prepare(
        `UPDATE combat_sessions
           SET combat_round = CASE WHEN combat_round > ? THEN combat_round ELSE ? END,
               player_hp = ?, npc_hp = ?, state = 'resolved', outcome = ?, resolved_tick = ?
           WHERE combat_id = ?`
      )
      .run(
        durationRounds,
        durationRounds,
        Math.max(0, Math.floor(finalPlayerHp)),
        Math.max(0, Math.floor(finalNpcHp)),
        outcome,
        resolvedTick,
        combatId
      )

    const row = this.getSession(combatId)
    const npcIncapTicks = readNumber(payload, 'npcIncapacitatedTicks') ?? 0
    if (row && npcIncapTicks > 0) this.npcIncapMap.set(row.npc_id, resolvedTick + npcIncapTicks)
  }

  private projectDamage(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const amount = readNumber(payload, 'amount')
    if (amount === null || amount <= 0) return
    this.applyHpDelta(event, combatId, payload, -amount)
  }

  private projectHeal(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const amount = readNumber(payload, 'amount')
    if (amount === null || amount <= 0) return
    this.applyHpDelta(event, combatId, payload, amount)
  }

  private projectDefeat(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const actorId = readString(payload, 'actorId') ?? readString(payload, 'targetActorId')
    if (!actorId) return
    const session = this.getSession(combatId)
    if (!session) return
    const combatRound = readRound(payload) ?? event.tick ?? session.combat_round
    if (actorId === String(session.player_account_id)) {
      this.updateSessionHp(combatId, combatRound, 0, session.npc_hp, {
        outcome: 'npc_victory',
        tick: event.tick ?? 0,
      })
    } else if (actorId === session.npc_id) {
      this.updateSessionHp(combatId, combatRound, session.player_hp, 0, {
        outcome: 'player_victory',
        tick: event.tick ?? 0,
      })
    }
  }

  private applyHpDelta(
    event: Event,
    combatId: string,
    payload: Readonly<Record<string, unknown>>,
    delta: number,
  ): void {
    const targetActorId = readString(payload, 'targetActorId')
    if (!targetActorId) return
    const session = this.getSession(combatId)
    if (!session) return
    const combatRound = readRound(payload) ?? event.tick ?? session.combat_round
    if (targetActorId === String(session.player_account_id)) {
      this.updateSessionHp(combatId, combatRound, Math.max(0, session.player_hp + delta), session.npc_hp)
    } else if (targetActorId === session.npc_id) {
      this.updateSessionHp(combatId, combatRound, session.player_hp, Math.max(0, session.npc_hp + delta))
    }
  }

  private updateSessionHp(
    combatId: string,
    combatRound: number,
    playerHp: number,
    npcHp: number,
    resolved: { outcome: CombatOutcome; tick: number } | null = null,
  ): void {
    const isResolved = resolved !== null
    this.db
      .prepare(
        `UPDATE combat_sessions
           SET combat_round = CASE WHEN combat_round > ? THEN combat_round ELSE ? END,
               player_hp = ?, npc_hp = ?,
               state = CASE WHEN ? THEN 'resolved' ELSE state END,
               outcome = CASE WHEN ? THEN ? ELSE outcome END,
               resolved_tick = CASE WHEN ? THEN COALESCE(resolved_tick, ?) ELSE resolved_tick END
           WHERE combat_id = ?`
      )
      .run(
        combatRound,
        combatRound,
        playerHp,
        npcHp,
        isResolved ? 1 : 0,
        isResolved ? 1 : 0,
        resolved?.outcome ?? null,
        isResolved ? 1 : 0,
        resolved?.tick ?? null,
        combatId,
      )
  }

  private appendProjectedLog(
    event: Event,
    combatId: string,
    eventType: string,
    payload: Readonly<Record<string, unknown>>,
    index: number,
  ): void {
    const combatRound = readRound(payload) ?? readRound(readCombatPayload(event.payload)) ?? 0
    const deterministicKey = projectedLogKey(event, combatId, combatRound, eventType, payload, index)
    const existing = this.db
      .prepare('SELECT 1 FROM combat_log WHERE deterministic_key = ? LIMIT 1')
      .get(deterministicKey)
    if (existing) return
    this.db
      .prepare(
        `INSERT INTO combat_log
           (combat_id, tick, combat_round, event_type, payload_json, occurred_at, deterministic_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        combatId,
        event.tick ?? 0,
        combatRound,
        eventType,
        toCanonicalJson(payload),
        event.occurredAt,
        deterministicKey
      )
  }

  private hasProjectedLog(
    event: Event,
    eventType: string,
    payload: Readonly<Record<string, unknown>>,
    index: number,
  ): boolean {
    const combatId = readString(payload, 'combatId')
    if (!combatId) return false
    const combatRound = readRound(payload) ?? readRound(readCombatPayload(event.payload)) ?? 0
    const deterministicKey = projectedLogKey(event, combatId, combatRound, eventType, payload, index)
    const existing = this.db
      .prepare('SELECT 1 FROM combat_log WHERE deterministic_key = ? LIMIT 1')
      .get(deterministicKey)
    return !!existing
  }
}

function projectedLogKey(
  event: Event,
  combatId: string,
  combatRound: number,
  eventType: string,
  payload: Readonly<Record<string, unknown>>,
  index: number,
): string {
  return hashCanonicalJson({
    sourceEventId: event.eventId,
    index,
    combatId,
    combatRound,
    eventType,
    payload,
  })
}

type ProjectedCombatEvent = Readonly<{
  eventType: string
  payload: Readonly<Record<string, unknown>>
}>

function readCombatPayload(payload: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(payload)) return {}
  if (isRecord(payload.data)) return payload.data
  return payload
}

function readString(payload: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(payload: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readAccountId(payload: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = payload[key]
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function readOutcome(payload: Readonly<Record<string, unknown>>): CombatOutcome | null {
  const outcome = payload.outcome
  if (outcome === 'player_victory' || outcome === 'npc_victory' || outcome === 'fled') return outcome
  return null
}

function readRound(payload: Readonly<Record<string, unknown>>): number | null {
  const combatRound = readNumber(payload, 'combatRound')
  if (combatRound !== null) return Math.max(0, Math.floor(combatRound))
  const combatTick = readNumber(payload, 'combatTick')
  return combatTick === null ? null : Math.max(0, Math.floor(combatTick))
}

function readProjectedEvents(
  payload: Readonly<Record<string, unknown>>,
  combatId: string,
): readonly ProjectedCombatEvent[] {
  const events = payload.events
  if (!Array.isArray(events)) return []
  const projected: ProjectedCombatEvent[] = []
  for (const event of events) {
    if (!isRecord(event)) continue
    const eventType = readString(event, 'eventType')
    const eventPayload = isRecord(event.payload) ? event.payload : null
    if (!eventType || !eventPayload) continue
    const eventCombatId = readString(eventPayload, 'combatId')
    if (eventCombatId !== combatId) continue
    projected.push({ eventType, payload: eventPayload })
  }
  return projected
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
