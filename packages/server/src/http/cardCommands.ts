// 紋卡 Command → Rule Engine → Event 管線。
// ARCHITECTURE.md §1.1 要求所有改變狀態的動作都先以 Command 表達意圖，
// 經由 Rule Engine 驗證後才產生 Event；CardWorldStore 是這些 Event 的
// projection（投影），其本身的 SQL mutations 必須在 Rule Engine 接受
// 之後才執行。
//
// 紋卡資料屬 ARCHITECTURE.md §8 定義的「orthogonal stores」（不進入
// simulation EventLog），因此這裡用獨立的 `card_action_log` 表
// 存放 CardEvent 作為審計 + replay 來源。Since-Last-Visit 也從這個
// log 查詢「玩家不在時掉了什麼」「被誰撿走」。
//
// Command 類型與資料：
//   CARD_DROP_SPAWN     系統 → 世界 (因 weather/area/rare-window)
//   CARD_DROP_EXPIRE    系統 → 世界 (60 秒未撿 / 60 秒未收進紋典)
//   CARD_PICKUP         玩家 → 撿起一張地上 drop (啟動 60s 倒數)
//   CARD_RELEASE        玩家 → 把 held 卡丟回地上 (重新 60s 計時)
//   CARD_STORE          玩家 → 把 held 卡收入紋典定序欄/隨攜欄
//   CARD_MATERIALIZE    玩家 → 紋典中拿出實體卡 (不可逆)
//   CARD_TRADE_PROPOSE  玩家 → 對另一玩家提議交換
//   CARD_TRADE_ACCEPT   被對方接受
//   CARD_TRADE_REJECT   被對方拒絕
//   CARD_TRADE_CANCEL   提議方撤銷
//
// 每個 Event 都記 (tick, payload, playerId)；deterministicKey 由
// (commandType, actorId, tick, payload) hash 產生，符合 §1.3。
//
// 為了保留既有 CardWorldStore 的原子性（DB transaction），我們的
// 「Rule Engine」並不獨立做 SQL：它是 pure validator + event 製造
// 機。實際的 store mutation 與 event 寫入在 router/engine 的
// `applyCardCommand(cmd)` 函式裡用同一個 SQLite transaction 完成，
// 確保「Rule Engine 接受 → Event 寫入 → Projection mutation」三件事
// 不能拆開。

import type Database from 'better-sqlite3'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import {
  CardWorldStore,
  CardWorldError,
  type DropRow,
  type CodexRow,
  type TradeRow,
  type SlotType,
} from './cardWorldStore.js'

type DatabaseConnection = Database.Database

// -- Command 類型 -----------------------------------------------------

export const CARD_COMMAND_TYPES = [
  'CARD_DROP_SPAWN',
  'CARD_DROP_EXPIRE',
  'CARD_PICKUP',
  'CARD_RELEASE',
  'CARD_STORE',
  'CARD_MATERIALIZE',
  'CARD_TRADE_PROPOSE',
  'CARD_TRADE_ACCEPT',
  'CARD_TRADE_REJECT',
  'CARD_TRADE_CANCEL',
] as const
export type CardCommandType = (typeof CARD_COMMAND_TYPES)[number]

const SYSTEM_ACTOR = 'system'

export type CardCommand =
  | Readonly<{
      type: 'CARD_DROP_SPAWN'
      actorId: typeof SYSTEM_ACTOR
      tick: number
      cardId: number
      tileId: string
      x: number
      y: number
      reason: 'baseline' | 'weather' | 'rare_window' | 'seed' | 'combat_loot'
    }>
  | Readonly<{
      type: 'CARD_DROP_EXPIRE'
      actorId: typeof SYSTEM_ACTOR
      tick: number
      dropId: number
      cardId: number
      tileId: string
      cause: 'unpicked' | 'unstored'
    }>
  | Readonly<{
      type: 'CARD_PICKUP'
      actorId: number // accountId
      tick: number
      dropId: number
    }>
  | Readonly<{
      type: 'CARD_RELEASE'
      actorId: number
      tick: number
      dropId: number
    }>
  | Readonly<{
      type: 'CARD_STORE'
      actorId: number
      tick: number
      dropId: number
      slotType: SlotType
    }>
  | Readonly<{
      type: 'CARD_MATERIALIZE'
      actorId: number
      tick: number
      codexId: number
    }>
  | Readonly<{
      type: 'CARD_TRADE_PROPOSE'
      actorId: number
      tick: number
      targetId: number
      offeredCodexId: number
      requestedCardId: number
    }>
  | Readonly<{
      type: 'CARD_TRADE_ACCEPT'
      actorId: number
      tick: number
      tradeId: number
    }>
  | Readonly<{
      type: 'CARD_TRADE_REJECT'
      actorId: number
      tick: number
      tradeId: number
    }>
  | Readonly<{
      type: 'CARD_TRADE_CANCEL'
      actorId: number
      tick: number
      tradeId: number
    }>

// -- Event 類型 -------------------------------------------------------

export type CardEvent = Readonly<{
  id: number
  eventType: CardCommandType
  actorId: string // 'system' 或 numeric account id 字串化
  tick: number
  payload: Record<string, unknown>
  occurredAt: number
  deterministicKey: string
}>

export class CardCommandError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'CardCommandError'
  }
}

// -- card_action_log schema ------------------------------------------

export function initializeCardActionLogSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      deterministic_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_card_action_log_tick ON card_action_log(tick);
    CREATE INDEX IF NOT EXISTS idx_card_action_log_type ON card_action_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_card_action_log_actor ON card_action_log(actor_id);
  `)
}

// -- Pipeline: command → validate → event + projection --------------

/**
 * 紋卡命令派遣器。每個方法：
 *   1. 用 CardWorldStore 既有的 SQL 邏輯做驗證 + mutation（在 transaction 內）
 *   2. 同 transaction 寫一筆 CardEvent 到 card_action_log
 *   3. 回傳給 caller 一份「事件 + 投影結果」
 *
 * 對外契約：呼叫端只能透過這層。CardWorldStore 直接 mutation
 * 仍可以用（內部測試用），但 router 路徑必須走這條 pipeline。
 */
export class CardActionPipeline {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly store: CardWorldStore
  ) {
    initializeCardActionLogSchema(db)
  }

  // ---- 系統命令 ----

  spawnDrop(cmd: Extract<CardCommand, { type: 'CARD_DROP_SPAWN' }>): {
    drop: DropRow | null
    event: CardEvent | null
  } {
    return this.runInTx(() => {
      const drop = this.store.spawnDrop({
        cardId: cmd.cardId,
        tileId: cmd.tileId,
        x: cmd.x,
        y: cmd.y,
        currentTick: cmd.tick,
      })
      if (!drop) {
        // Cap 已滿：不算錯誤，只是不 spawn；因此也不寫 event
        return { drop: null, event: null }
      }
      const event = this.appendEvent(cmd.type, cmd.actorId, cmd.tick, {
        dropId: drop.id,
        cardId: drop.card_id,
        tileId: drop.tile_id,
        x: drop.x,
        y: drop.y,
        reason: cmd.reason,
        expiresAtTick: drop.expires_at_tick,
      })
      return { drop, event }
    })
  }

  /**
   * 跑過期檢查。`expireOverdueDrops` 已經把 state 改 'expired'；我們
   * 在它之前先 snapshot 出哪些 row 即將到期，逐筆寫 CARD_DROP_EXPIRE
   * 事件，再一起呼叫 expireOverdueDrops 完成 mutation。
   */
  expireOverdueDrops(currentTick: number): {
    available: number
    held: number
    events: CardEvent[]
  } {
    return this.runInTx(() => {
      const events: CardEvent[] = []
      const overdueAvailable = this.db
        .prepare(
          `SELECT id, card_id, tile_id FROM world_card_drops
             WHERE state='available' AND expires_at_tick <= ?`
        )
        .all(currentTick) as Array<{ id: number; card_id: number; tile_id: string }>
      const overdueHeld = this.db
        .prepare(
          `SELECT id, card_id, tile_id FROM world_card_drops
             WHERE state='held' AND store_deadline_tick IS NOT NULL
               AND store_deadline_tick <= ?`
        )
        .all(currentTick) as Array<{ id: number; card_id: number; tile_id: string }>
      for (const row of overdueAvailable) {
        events.push(
          this.appendEvent('CARD_DROP_EXPIRE', SYSTEM_ACTOR, currentTick, {
            dropId: row.id,
            cardId: row.card_id,
            tileId: row.tile_id,
            cause: 'unpicked',
          })
        )
      }
      for (const row of overdueHeld) {
        events.push(
          this.appendEvent('CARD_DROP_EXPIRE', SYSTEM_ACTOR, currentTick, {
            dropId: row.id,
            cardId: row.card_id,
            tileId: row.tile_id,
            cause: 'unstored',
          })
        )
      }
      const result = this.store.expireOverdueDrops(currentTick)
      return { ...result, events }
    })
  }

  // ---- 玩家命令 ----

  pickup(cmd: Extract<CardCommand, { type: 'CARD_PICKUP' }>): {
    drop: DropRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const drop = this.store.pickupDrop({
        dropId: cmd.dropId,
        accountId: cmd.actorId,
        currentTick: cmd.tick,
      })
      const event = this.appendEvent('CARD_PICKUP', String(cmd.actorId), cmd.tick, {
        dropId: drop.id,
        cardId: drop.card_id,
        tileId: drop.tile_id,
        storeDeadlineTick: drop.store_deadline_tick,
      })
      return { drop, event }
    })
  }

  release(cmd: Extract<CardCommand, { type: 'CARD_RELEASE' }>): {
    drop: DropRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const drop = this.store.releaseHeldDrop({
        dropId: cmd.dropId,
        accountId: cmd.actorId,
        currentTick: cmd.tick,
      })
      const event = this.appendEvent('CARD_RELEASE', String(cmd.actorId), cmd.tick, {
        dropId: drop.id,
        cardId: drop.card_id,
        tileId: drop.tile_id,
        expiresAtTick: drop.expires_at_tick,
      })
      return { drop, event }
    })
  }

  store_(cmd: Extract<CardCommand, { type: 'CARD_STORE' }>): {
    drop: DropRow
    codex: CodexRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const result = this.store.storeDropToCodex({
        dropId: cmd.dropId,
        accountId: cmd.actorId,
        slotType: cmd.slotType,
        currentTick: cmd.tick,
      })
      const event = this.appendEvent('CARD_STORE', String(cmd.actorId), cmd.tick, {
        dropId: result.drop.id,
        cardId: result.codex.card_id,
        slotType: result.codex.slot_type,
        slotIndex: result.codex.slot_index,
      })
      return { ...result, event }
    })
  }

  materialize(cmd: Extract<CardCommand, { type: 'CARD_MATERIALIZE' }>): {
    codex: CodexRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const codex = this.store.materializeCodexEntry({
        codexId: cmd.codexId,
        accountId: cmd.actorId,
      })
      const event = this.appendEvent('CARD_MATERIALIZE', String(cmd.actorId), cmd.tick, {
        codexId: codex.id,
        cardId: codex.card_id,
      })
      return { codex, event }
    })
  }

  proposeTrade(cmd: Extract<CardCommand, { type: 'CARD_TRADE_PROPOSE' }>): {
    trade: TradeRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const trade = this.store.proposeTrade({
        proposerId: cmd.actorId,
        targetId: cmd.targetId,
        offeredCodexId: cmd.offeredCodexId,
        requestedCardId: cmd.requestedCardId,
      })
      const event = this.appendEvent('CARD_TRADE_PROPOSE', String(cmd.actorId), cmd.tick, {
        tradeId: trade.id,
        targetId: trade.target_id,
        offeredCodexId: trade.offered_codex_id,
        offeredCardId: trade.offered_card_id,
        requestedCardId: trade.requested_card_id,
      })
      return { trade, event }
    })
  }

  acceptTrade(cmd: Extract<CardCommand, { type: 'CARD_TRADE_ACCEPT' }>): {
    trade: TradeRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const trade = this.store.acceptTrade({
        tradeId: cmd.tradeId,
        accountId: cmd.actorId,
        currentTick: cmd.tick,
      })
      const event = this.appendEvent('CARD_TRADE_ACCEPT', String(cmd.actorId), cmd.tick, {
        tradeId: trade.id,
        proposerId: trade.proposer_id,
        offeredCardId: trade.offered_card_id,
        requestedCardId: trade.requested_card_id,
      })
      return { trade, event }
    })
  }

  rejectTrade(cmd: Extract<CardCommand, { type: 'CARD_TRADE_REJECT' }>): {
    trade: TradeRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const trade = this.store.rejectTrade({
        tradeId: cmd.tradeId,
        accountId: cmd.actorId,
      })
      const event = this.appendEvent('CARD_TRADE_REJECT', String(cmd.actorId), cmd.tick, {
        tradeId: trade.id,
        proposerId: trade.proposer_id,
      })
      return { trade, event }
    })
  }

  cancelTrade(cmd: Extract<CardCommand, { type: 'CARD_TRADE_CANCEL' }>): {
    trade: TradeRow
    event: CardEvent
  } {
    return this.runInTx(() => {
      const trade = this.store.cancelTrade({
        tradeId: cmd.tradeId,
        accountId: cmd.actorId,
      })
      const event = this.appendEvent('CARD_TRADE_CANCEL', String(cmd.actorId), cmd.tick, {
        tradeId: trade.id,
        targetId: trade.target_id,
      })
      return { trade, event }
    })
  }

  // ---- 查詢：since-last-visit + 最近事件 ----

  /**
   * 玩家不在時，世界發生了多少跟紋卡相關的事？
   *   - dropsSpawned: 系統掉了多少張卡
   *   - dropsCollectedByOthers: 被其他玩家撿走多少
   *   - dropsExpired: 過期消失多少
   * sinceTick = 玩家上次離線的 tick；含等於 sinceTick 的不算。
   */
  sinceLastVisit(
    accountId: number,
    sinceTick: number
  ): {
    dropsSpawned: number
    dropsCollectedByOthers: number
    dropsExpired: number
    sinceTick: number
  } {
    const dropsSpawned = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM card_action_log
             WHERE event_type='CARD_DROP_SPAWN' AND tick > ?`
        )
        .get(sinceTick) as { c: number }
    ).c
    const dropsCollectedByOthers = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM card_action_log
             WHERE event_type='CARD_PICKUP' AND tick > ? AND actor_id <> ?`
        )
        .get(sinceTick, String(accountId)) as { c: number }
    ).c
    const dropsExpired = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM card_action_log
             WHERE event_type='CARD_DROP_EXPIRE' AND tick > ?`
        )
        .get(sinceTick) as { c: number }
    ).c
    return {
      dropsSpawned: Number(dropsSpawned ?? 0),
      dropsCollectedByOthers: Number(dropsCollectedByOthers ?? 0),
      dropsExpired: Number(dropsExpired ?? 0),
      sinceTick,
    }
  }

  recentEvents(limit = 50): CardEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM card_action_log ORDER BY id DESC LIMIT ?`
      )
      .all(Math.min(500, Math.max(1, limit))) as Array<{
      id: number
      event_type: string
      actor_id: string
      tick: number
      payload_json: string
      occurred_at: number
      deterministic_key: string
    }>
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type as CardCommandType,
      actorId: row.actor_id,
      tick: row.tick,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      occurredAt: row.occurred_at,
      deterministicKey: row.deterministic_key,
    }))
  }

  // ---- 內部工具 ----

  private appendEvent(
    type: CardCommandType,
    actorId: string,
    tick: number,
    payload: Record<string, unknown>
  ): CardEvent {
    // ARCHITECTURE.md §1.3 — deterministicKey 不可包含 wall-clock。
    // (commandType, actorId, tick, payload) → hash
    const seed = { eventType: type, actorId, tick, payload }
    const deterministicKey = hashCanonicalJson(seed)
    const occurredAt = Date.now() // wall-clock 只當 audit metadata
    const result = this.db
      .prepare(
        `INSERT INTO card_action_log
           (event_type, actor_id, tick, payload_json, occurred_at, deterministic_key)
           VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(type, actorId, tick, JSON.stringify(payload), occurredAt, deterministicKey)
    return {
      id: Number(result.lastInsertRowid),
      eventType: type,
      actorId,
      tick,
      payload,
      occurredAt,
      deterministicKey,
    }
  }

  private runInTx<T>(fn: () => T): T {
    const tx = this.db.transaction(fn)
    try {
      return tx()
    } catch (err) {
      // 把 CardWorldError 重新包成 CardCommandError，給 router 同樣的
      // 結構去翻譯成 HTTP status code
      if (err instanceof CardWorldError) {
        throw new CardCommandError(err.code, err.message)
      }
      throw err
    }
  }
}

// 輔助：給 router 把 CardCommandError code 翻成 HTTP status
export function cardCommandErrorStatus(code: string): number {
  if (code === 'DROP_NOT_FOUND' || code === 'CODEX_NOT_FOUND' || code === 'TRADE_NOT_FOUND')
    return 404
  if (code === 'FORBIDDEN') return 403
  if (
    code === 'OFFER_LOCKED' ||
    code === 'SEQUENCING_SLOT_OCCUPIED' ||
    code === 'CARRY_FULL' ||
    code === 'NOT_PENDING' ||
    code === 'DROP_UNAVAILABLE' ||
    code === 'OFFER_GONE' ||
    code === 'TARGET_LACKS_CARD' ||
    code === 'NOT_HOLDING'
  )
    return 409
  return 400
}
