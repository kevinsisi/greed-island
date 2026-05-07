// 紋卡世界存儲：負責三大區塊
//   1. world_card_drops — 世界中目前在地圖上閃爍/被某玩家持有的紋卡
//   2. player_codex     — 玩家紋典（定序欄 + 隨攜欄）
//   3. card_trades      — 紋卡交易提議
//
// 全部用 SQLite 寫真資料，不再 mock。所有時間都用 simulation tick
// 表示，wall-clock 只用在排序顯示。
//
// 「六十秒法則」：
//   * 一個 drop 在地上沒人撿 → 12 ticks (60s) 後 expire
//   * 一個 drop 被撿起變成 held → 12 ticks (60s) 後 expire 並消失
//   * store 後改寫進 player_codex，drop row 改 state='stored'
//
// 「存世上限」：
//   每張卡片同時存在於世界上的數量 = drops (available + held)
//                                    + 所有玩家 codex 中此卡 - materialize 過的不算
//   超過 cap 不再 spawn。Cap 由 rank 決定。
//
// Slot rules:
//   * sequencing 欄 100 格，slot_index = card_id（必須對應）
//   * carry 欄 45 格，slot_index 1..45 可放任何卡
//   * 每格只能放一張卡

import type Database from 'better-sqlite3'
import type { CardCatalog, CardCatalogEntry, CardRank } from '../cards/types.js'

type DatabaseConnection = Database.Database

export const SEQUENCING_SLOT_COUNT = 100
export const CARRY_SLOT_COUNT = 45
/** 60 秒 ÷ 5 秒/tick = 12 tick */
export const SIXTY_SECOND_RULE_TICKS = 12

export type DropState = 'available' | 'held' | 'expired' | 'stored'
export type SlotType = 'sequencing' | 'carry'
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'

/** 各等級的「同時存世上限」基準。後續可由 catalog 覆寫。 */
export const RANK_EXISTENCE_CAP: Readonly<Record<CardRank, number>> = {
  SS: 1,
  S: 2,
  A: 4,
  B: 6,
  C: 8,
  D: 10,
  E: 12,
  F: 16,
  G: 20,
  H: 25,
}

export type DropRow = Readonly<{
  id: number
  card_id: number
  tile_id: string
  x: number
  y: number
  dropped_at_tick: number
  expires_at_tick: number
  state: DropState
  holder_account_id: number | null
  pickup_at_tick: number | null
  store_deadline_tick: number | null
}>

export type CodexRow = Readonly<{
  id: number
  account_id: number
  card_id: number
  slot_type: SlotType
  slot_index: number
  obtained_tick: number
  obtained_at: number
}>

export type TradeRow = Readonly<{
  id: number
  proposer_id: number
  target_id: number
  offered_codex_id: number
  offered_card_id: number
  requested_card_id: number
  status: TradeStatus
  created_at: number
  resolved_at: number | null
}>

export class CardWorldError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'CardWorldError'
  }
}

export function initializeCardWorldSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_card_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      tile_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      dropped_at_tick INTEGER NOT NULL,
      expires_at_tick INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'available',
      holder_account_id INTEGER,
      pickup_at_tick INTEGER,
      store_deadline_tick INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_drops_state_tile ON world_card_drops(state, tile_id);
    CREATE INDEX IF NOT EXISTS idx_drops_holder ON world_card_drops(holder_account_id, state);
    CREATE INDEX IF NOT EXISTS idx_drops_card ON world_card_drops(card_id, state);

    CREATE TABLE IF NOT EXISTS player_codex (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      slot_type TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      obtained_tick INTEGER NOT NULL,
      obtained_at INTEGER NOT NULL,
      UNIQUE (account_id, slot_type, slot_index),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_codex_account ON player_codex(account_id);
    CREATE INDEX IF NOT EXISTS idx_codex_card ON player_codex(card_id);

    CREATE TABLE IF NOT EXISTS card_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposer_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      offered_codex_id INTEGER NOT NULL,
      offered_card_id INTEGER NOT NULL,
      requested_card_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      FOREIGN KEY (proposer_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_trades_proposer ON card_trades(proposer_id, status);
    CREATE INDEX IF NOT EXISTS idx_trades_target ON card_trades(target_id, status);
  `)
}

export class CardWorldStore {
  constructor(private readonly db: DatabaseConnection, private readonly catalog: CardCatalog) {
    initializeCardWorldSchema(db)
  }

  // ---- Drop 區段 ----

  /** 列出某 tile 內 state='available' 或被該 tile 內某玩家持有的 drops。 */
  listActiveDropsInTile(tileId: string): DropRow[] {
    return this.db
      .prepare(
        `SELECT * FROM world_card_drops
           WHERE tile_id = ? AND state IN ('available', 'held')
           ORDER BY dropped_at_tick ASC`
      )
      .all(tileId) as DropRow[]
  }

  /** 玩家目前持有但還未收入紋典的卡。 */
  listHeldByPlayer(accountId: number): DropRow[] {
    return this.db
      .prepare(
        `SELECT * FROM world_card_drops
           WHERE holder_account_id = ? AND state = 'held'
           ORDER BY pickup_at_tick ASC`
      )
      .all(accountId) as DropRow[]
  }

  getDrop(dropId: number): DropRow | null {
    const row = this.db
      .prepare('SELECT * FROM world_card_drops WHERE id = ?')
      .get(dropId) as DropRow | undefined
    return row ?? null
  }

  /** 玩家撿起一張在地上的紋卡。會啟動「六十秒法則」倒數。 */
  pickupDrop(input: { dropId: number; accountId: number; currentTick: number }): DropRow {
    const tx = this.db.transaction(() => {
      const drop = this.getDrop(input.dropId)
      if (!drop) throw new CardWorldError('DROP_NOT_FOUND', 'Drop not found.')
      if (drop.state !== 'available') {
        throw new CardWorldError('DROP_UNAVAILABLE', 'Drop is no longer available.')
      }
      const storeDeadline = input.currentTick + SIXTY_SECOND_RULE_TICKS
      this.db
        .prepare(
          `UPDATE world_card_drops
             SET state='held',
                 holder_account_id=?,
                 pickup_at_tick=?,
                 store_deadline_tick=?
             WHERE id=?`
        )
        .run(input.accountId, input.currentTick, storeDeadline, input.dropId)
      const updated = this.getDrop(input.dropId)
      if (!updated) throw new CardWorldError('DROP_NOT_FOUND', 'Drop disappeared during pickup.')
      return updated
    })
    return tx()
  }

  /** 玩家把自己持有的紋卡收入紋典。
   *  - sequencing 欄：必須 slot_index === card_id，且該格未被佔
   *  - carry 欄：自動找第一個空格 (1..CARRY_SLOT_COUNT)
   */
  storeDropToCodex(input: {
    dropId: number
    accountId: number
    slotType: SlotType
    currentTick: number
  }): { drop: DropRow; codex: CodexRow } {
    const tx = this.db.transaction(() => {
      const drop = this.getDrop(input.dropId)
      if (!drop) throw new CardWorldError('DROP_NOT_FOUND', 'Drop not found.')
      if (drop.state !== 'held' || drop.holder_account_id !== input.accountId) {
        throw new CardWorldError('NOT_HOLDING', 'You are not holding this card.')
      }
      let slotIndex: number
      if (input.slotType === 'sequencing') {
        slotIndex = drop.card_id
        const occupant = this.db
          .prepare(
            `SELECT id FROM player_codex
               WHERE account_id=? AND slot_type='sequencing' AND slot_index=?`
          )
          .get(input.accountId, slotIndex) as { id: number } | undefined
        if (occupant) {
          throw new CardWorldError('SEQUENCING_SLOT_OCCUPIED', `Sequencing slot #${slotIndex} is already occupied.`)
        }
      } else {
        slotIndex = this.findFirstFreeCarrySlot(input.accountId)
        if (slotIndex < 0) {
          throw new CardWorldError('CARRY_FULL', 'Carry slots are full.')
        }
      }
      const obtainedAt = Date.now()
      const result = this.db
        .prepare(
          `INSERT INTO player_codex
             (account_id, card_id, slot_type, slot_index, obtained_tick, obtained_at)
             VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.accountId,
          drop.card_id,
          input.slotType,
          slotIndex,
          input.currentTick,
          obtainedAt
        )
      this.db
        .prepare('UPDATE world_card_drops SET state=\'stored\' WHERE id=?')
        .run(input.dropId)
      const codex: CodexRow = {
        id: Number(result.lastInsertRowid),
        account_id: input.accountId,
        card_id: drop.card_id,
        slot_type: input.slotType,
        slot_index: slotIndex,
        obtained_tick: input.currentTick,
        obtained_at: obtainedAt,
      }
      const updatedDrop = this.getDrop(input.dropId)
      if (!updatedDrop) throw new CardWorldError('DROP_NOT_FOUND', 'Drop disappeared during store.')
      return { drop: updatedDrop, codex }
    })
    return tx()
  }

  /** 把 hand 中那張卡丟回地上（reset state='available' + 60s 重新計時）。 */
  releaseHeldDrop(input: { dropId: number; accountId: number; currentTick: number }): DropRow {
    const tx = this.db.transaction(() => {
      const drop = this.getDrop(input.dropId)
      if (!drop) throw new CardWorldError('DROP_NOT_FOUND', 'Drop not found.')
      if (drop.state !== 'held' || drop.holder_account_id !== input.accountId) {
        throw new CardWorldError('NOT_HOLDING', 'You are not holding this card.')
      }
      this.db
        .prepare(
          `UPDATE world_card_drops
             SET state='available',
                 holder_account_id=NULL,
                 pickup_at_tick=NULL,
                 store_deadline_tick=NULL,
                 expires_at_tick=?
             WHERE id=?`
        )
        .run(input.currentTick + SIXTY_SECOND_RULE_TICKS, input.dropId)
      const updated = this.getDrop(input.dropId)
      if (!updated) throw new CardWorldError('DROP_NOT_FOUND', 'Drop disappeared during release.')
      return updated
    })
    return tx()
  }

  /** 檢查 / 標記過期的 drops。tick 推進時由 SimulationRuntime 呼叫。 */
  expireOverdueDrops(currentTick: number): { available: number; held: number } {
    const expiredAvailable = this.db
      .prepare(
        `UPDATE world_card_drops
           SET state='expired'
           WHERE state='available' AND expires_at_tick <= ?`
      )
      .run(currentTick)
    const expiredHeld = this.db
      .prepare(
        `UPDATE world_card_drops
           SET state='expired'
           WHERE state='held' AND store_deadline_tick IS NOT NULL AND store_deadline_tick <= ?`
      )
      .run(currentTick)
    return {
      available: Number(expiredAvailable.changes ?? 0),
      held: Number(expiredHeld.changes ?? 0),
    }
  }

  /** Spawn 一張新 drop。會檢查存世上限。 */
  spawnDrop(input: {
    cardId: number
    tileId: string
    x: number
    y: number
    currentTick: number
  }): DropRow | null {
    const entry = this.findCatalogEntry(input.cardId)
    if (!entry) return null
    const cap = RANK_EXISTENCE_CAP[entry.rank]
    if (this.countCardInExistence(input.cardId) >= cap) return null

    const expires = input.currentTick + SIXTY_SECOND_RULE_TICKS
    const result = this.db
      .prepare(
        `INSERT INTO world_card_drops
           (card_id, tile_id, x, y, dropped_at_tick, expires_at_tick, state)
           VALUES (?, ?, ?, ?, ?, ?, 'available')`
      )
      .run(input.cardId, input.tileId, input.x, input.y, input.currentTick, expires)
    return {
      id: Number(result.lastInsertRowid),
      card_id: input.cardId,
      tile_id: input.tileId,
      x: input.x,
      y: input.y,
      dropped_at_tick: input.currentTick,
      expires_at_tick: expires,
      state: 'available',
      holder_account_id: null,
      pickup_at_tick: null,
      store_deadline_tick: null,
    }
  }

  /** 計算某張卡片目前在世界上的數量（drops + 紋典中佔的格子）。 */
  countCardInExistence(cardId: number): number {
    const dropsRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM world_card_drops
           WHERE card_id = ? AND state IN ('available', 'held')`
      )
      .get(cardId) as { c: number }
    const codexRow = this.db
      .prepare('SELECT COUNT(*) AS c FROM player_codex WHERE card_id = ?')
      .get(cardId) as { c: number }
    return Number(dropsRow.c ?? 0) + Number(codexRow.c ?? 0)
  }

  // ---- Codex 區段 ----

  listCodexForAccount(accountId: number): CodexRow[] {
    return this.db
      .prepare(
        `SELECT * FROM player_codex
           WHERE account_id = ?
           ORDER BY slot_type ASC, slot_index ASC`
      )
      .all(accountId) as CodexRow[]
  }

  getCodexEntry(codexId: number): CodexRow | null {
    const row = this.db
      .prepare('SELECT * FROM player_codex WHERE id = ?')
      .get(codexId) as CodexRow | undefined
    return row ?? null
  }

  /** 「現」（實體化）：把卡從紋典中拿出。不可逆。 */
  materializeCodexEntry(input: { codexId: number; accountId: number }): CodexRow {
    const tx = this.db.transaction(() => {
      const entry = this.getCodexEntry(input.codexId)
      if (!entry) throw new CardWorldError('CODEX_NOT_FOUND', 'Codex entry not found.')
      if (entry.account_id !== input.accountId) {
        throw new CardWorldError('FORBIDDEN', 'This codex entry belongs to another player.')
      }
      // 取消所有引用此 codex 的 pending trade
      this.db
        .prepare(
          `UPDATE card_trades SET status='cancelled', resolved_at=?
             WHERE offered_codex_id = ? AND status='pending'`
        )
        .run(Date.now(), input.codexId)
      this.db.prepare('DELETE FROM player_codex WHERE id = ?').run(input.codexId)
      return entry
    })
    return tx()
  }

  private findFirstFreeCarrySlot(accountId: number): number {
    const occupied = new Set(
      (this.db
        .prepare(
          `SELECT slot_index FROM player_codex
             WHERE account_id = ? AND slot_type = 'carry'`
        )
        .all(accountId) as Array<{ slot_index: number }>).map((r) => r.slot_index)
    )
    for (let i = 1; i <= CARRY_SLOT_COUNT; i += 1) {
      if (!occupied.has(i)) return i
    }
    return -1
  }

  // ---- Trade 區段 ----

  proposeTrade(input: {
    proposerId: number
    targetId: number
    offeredCodexId: number
    requestedCardId: number
  }): TradeRow {
    if (input.proposerId === input.targetId) {
      throw new CardWorldError('SELF_TRADE', 'You cannot trade with yourself.')
    }
    const offered = this.getCodexEntry(input.offeredCodexId)
    if (!offered) throw new CardWorldError('OFFER_NOT_FOUND', 'Offered codex entry not found.')
    if (offered.account_id !== input.proposerId) {
      throw new CardWorldError('FORBIDDEN', 'You do not own the offered card.')
    }
    if (
      !Number.isInteger(input.requestedCardId) ||
      input.requestedCardId < 1 ||
      input.requestedCardId > 100
    ) {
      throw new CardWorldError('INVALID_REQUEST', 'requestedCardId must be 1..100.')
    }
    // 確認對方目前的紋典裡有這張卡（取首筆）
    const targetHas = this.db
      .prepare(
        `SELECT id FROM player_codex
           WHERE account_id = ? AND card_id = ?
           ORDER BY id ASC LIMIT 1`
      )
      .get(input.targetId, input.requestedCardId) as { id: number } | undefined
    if (!targetHas) {
      throw new CardWorldError('TARGET_LACKS_CARD', 'Target does not own the requested card.')
    }
    // 同一個 offered codex 不能有兩筆 pending
    const dup = this.db
      .prepare(
        `SELECT id FROM card_trades
           WHERE offered_codex_id = ? AND status = 'pending'`
      )
      .get(input.offeredCodexId) as { id: number } | undefined
    if (dup) {
      throw new CardWorldError('OFFER_LOCKED', 'This card is already offered in another pending trade.')
    }
    const now = Date.now()
    const result = this.db
      .prepare(
        `INSERT INTO card_trades
           (proposer_id, target_id, offered_codex_id, offered_card_id, requested_card_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      )
      .run(
        input.proposerId,
        input.targetId,
        input.offeredCodexId,
        offered.card_id,
        input.requestedCardId,
        now
      )
    return {
      id: Number(result.lastInsertRowid),
      proposer_id: input.proposerId,
      target_id: input.targetId,
      offered_codex_id: input.offeredCodexId,
      offered_card_id: offered.card_id,
      requested_card_id: input.requestedCardId,
      status: 'pending',
      created_at: now,
      resolved_at: null,
    }
  }

  acceptTrade(input: { tradeId: number; accountId: number; currentTick: number }): TradeRow {
    const tx = this.db.transaction(() => {
      const trade = this.getTrade(input.tradeId)
      if (!trade) throw new CardWorldError('TRADE_NOT_FOUND', 'Trade not found.')
      if (trade.target_id !== input.accountId) {
        throw new CardWorldError('FORBIDDEN', 'Only the target can accept this trade.')
      }
      if (trade.status !== 'pending') {
        throw new CardWorldError('NOT_PENDING', 'Trade is not pending.')
      }
      // 找雙方對應的 codex entry
      const offered = this.getCodexEntry(trade.offered_codex_id)
      if (!offered || offered.account_id !== trade.proposer_id) {
        throw new CardWorldError('OFFER_GONE', 'Proposer no longer owns the offered card.')
      }
      const targetEntry = this.db
        .prepare(
          `SELECT * FROM player_codex
             WHERE account_id = ? AND card_id = ?
             ORDER BY id ASC LIMIT 1`
        )
        .get(trade.target_id, trade.requested_card_id) as CodexRow | undefined
      if (!targetEntry) {
        throw new CardWorldError('TARGET_LACKS_CARD', 'You no longer own the requested card.')
      }
      // 雙方互換：先把雙方的 codex row 都刪掉，再各自於自己的紋典放新卡
      // 為了避免 slot 衝突，新卡進 carry 欄第一格空位；如果 carry 滿就放原本對手的位置（同 slot_type / slot_index 同等於把 row 改 account_id 即可）
      this.db.prepare('DELETE FROM player_codex WHERE id = ?').run(offered.id)
      this.db.prepare('DELETE FROM player_codex WHERE id = ?').run(targetEntry.id)

      // proposer 收下 targetEntry.card_id
      this.placeCardForAccount(trade.proposer_id, trade.requested_card_id, input.currentTick)
      // target 收下 offered.card_id
      this.placeCardForAccount(trade.target_id, trade.offered_card_id, input.currentTick)

      const now = Date.now()
      this.db
        .prepare(`UPDATE card_trades SET status='accepted', resolved_at=? WHERE id=?`)
        .run(now, input.tradeId)
      // 如果有其他 pending trade 依賴於剛剛被搬走的 codex，全部 cancel
      this.db
        .prepare(
          `UPDATE card_trades SET status='cancelled', resolved_at=?
             WHERE id <> ? AND status='pending'
               AND (offered_codex_id = ? OR offered_codex_id = ?)`
        )
        .run(now, input.tradeId, offered.id, targetEntry.id)
      return { ...trade, status: 'accepted' as TradeStatus, resolved_at: now }
    })
    return tx()
  }

  rejectTrade(input: { tradeId: number; accountId: number }): TradeRow {
    const trade = this.getTrade(input.tradeId)
    if (!trade) throw new CardWorldError('TRADE_NOT_FOUND', 'Trade not found.')
    if (trade.target_id !== input.accountId) {
      throw new CardWorldError('FORBIDDEN', 'Only the target can reject this trade.')
    }
    if (trade.status !== 'pending') {
      throw new CardWorldError('NOT_PENDING', 'Trade is not pending.')
    }
    const now = Date.now()
    this.db
      .prepare(`UPDATE card_trades SET status='rejected', resolved_at=? WHERE id=?`)
      .run(now, input.tradeId)
    return { ...trade, status: 'rejected', resolved_at: now }
  }

  cancelTrade(input: { tradeId: number; accountId: number }): TradeRow {
    const trade = this.getTrade(input.tradeId)
    if (!trade) throw new CardWorldError('TRADE_NOT_FOUND', 'Trade not found.')
    if (trade.proposer_id !== input.accountId) {
      throw new CardWorldError('FORBIDDEN', 'Only the proposer can cancel this trade.')
    }
    if (trade.status !== 'pending') {
      throw new CardWorldError('NOT_PENDING', 'Trade is not pending.')
    }
    const now = Date.now()
    this.db
      .prepare(`UPDATE card_trades SET status='cancelled', resolved_at=? WHERE id=?`)
      .run(now, input.tradeId)
    return { ...trade, status: 'cancelled', resolved_at: now }
  }

  getTrade(tradeId: number): TradeRow | null {
    const row = this.db
      .prepare('SELECT * FROM card_trades WHERE id = ?')
      .get(tradeId) as TradeRow | undefined
    return row ?? null
  }

  listTradesForAccount(accountId: number): { incoming: TradeRow[]; outgoing: TradeRow[] } {
    const incoming = this.db
      .prepare(
        `SELECT * FROM card_trades
           WHERE target_id = ? AND status = 'pending'
           ORDER BY created_at DESC`
      )
      .all(accountId) as TradeRow[]
    const outgoing = this.db
      .prepare(
        `SELECT * FROM card_trades
           WHERE proposer_id = ? AND status = 'pending'
           ORDER BY created_at DESC`
      )
      .all(accountId) as TradeRow[]
    return { incoming, outgoing }
  }

  /** 內部用：交易完成後把卡放到玩家紋典空位（先 sequencing 對應格，否則 carry 第一格空位）。 */
  private placeCardForAccount(accountId: number, cardId: number, tick: number): void {
    const seqOccupant = this.db
      .prepare(
        `SELECT id FROM player_codex
           WHERE account_id = ? AND slot_type = 'sequencing' AND slot_index = ?`
      )
      .get(accountId, cardId) as { id: number } | undefined
    const slotType: SlotType = seqOccupant ? 'carry' : 'sequencing'
    const slotIndex = slotType === 'sequencing' ? cardId : this.findFirstFreeCarrySlot(accountId)
    if (slotIndex < 0) {
      throw new CardWorldError('CARRY_FULL', 'Recipient carry slots are full.')
    }
    this.db
      .prepare(
        `INSERT INTO player_codex
           (account_id, card_id, slot_type, slot_index, obtained_tick, obtained_at)
           VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(accountId, cardId, slotType, slotIndex, tick, Date.now())
  }

  private findCatalogEntry(cardId: number): CardCatalogEntry | null {
    for (const e of this.catalog.entries) if (e.id === cardId) return e
    return null
  }
}
