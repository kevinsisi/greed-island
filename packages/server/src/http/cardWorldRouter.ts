// 紋卡 / 紋典 / 交易 HTTP 端點。
// 端點：
//   GET    /api/cards/active?tileId=...      列出 tile 內目前 available + 自己 held 的 drops
//   GET    /api/cards/held                   列出自己現在 held 的 drops（跨 tile）
//   POST   /api/cards/pickup    {dropId}      撿起一張 drop → 啟動 60 秒
//   POST   /api/cards/store     {dropId, slotType}  收入紋典
//   POST   /api/cards/release   {dropId}      把 held 卡丟回原地
//
//   GET    /api/codex                         自己的紋典
//   POST   /api/codex/materialize {codexId}   現形（不可逆）
//
//   GET    /api/trade/list                    pending 交易 (incoming + outgoing)
//   POST   /api/trade/propose   {targetUserId, offeredCodexId, requestedCardId}
//   POST   /api/trade/accept/:tradeId
//   POST   /api/trade/reject/:tradeId
//   POST   /api/trade/cancel/:tradeId

import { Router, type Request, type Response } from 'express'
import { requireAuth, type AuthConfig } from './auth.js'
import {
  CardWorldError,
  CardWorldStore,
  type DropRow,
  type SlotType,
  type TradeRow,
  type CodexRow,
  SEQUENCING_SLOT_COUNT,
  CARRY_SLOT_COUNT,
  SIXTY_SECOND_RULE_TICKS,
} from './cardWorldStore.js'
import type { AccountStore } from './accounts.js'
import type { SimulationRuntime } from '../sim/runtime.js'

export type DropDto = {
  id: number
  cardId: number
  tileId: string
  x: number
  y: number
  droppedAtTick: number
  expiresAtTick: number
  state: DropRow['state']
  holderAccountId: number | null
  pickupAtTick: number | null
  storeDeadlineTick: number | null
}

export type CodexDto = {
  id: number
  cardId: number
  slotType: SlotType
  slotIndex: number
  obtainedTick: number
  obtainedAt: string
}

export type TradeDto = {
  id: number
  proposerId: number
  targetId: number
  proposerName: string
  targetName: string
  offeredCodexId: number
  offeredCardId: number
  requestedCardId: number
  status: TradeRow['status']
  createdAt: string
  resolvedAt: string | null
}

function dropToDto(row: DropRow): DropDto {
  return {
    id: row.id,
    cardId: row.card_id,
    tileId: row.tile_id,
    x: row.x,
    y: row.y,
    droppedAtTick: row.dropped_at_tick,
    expiresAtTick: row.expires_at_tick,
    state: row.state,
    holderAccountId: row.holder_account_id,
    pickupAtTick: row.pickup_at_tick,
    storeDeadlineTick: row.store_deadline_tick,
  }
}

function codexToDto(row: CodexRow): CodexDto {
  return {
    id: row.id,
    cardId: row.card_id,
    slotType: row.slot_type,
    slotIndex: row.slot_index,
    obtainedTick: row.obtained_tick,
    obtainedAt: new Date(row.obtained_at).toISOString(),
  }
}

function tradeToDto(row: TradeRow, accounts: AccountStore): TradeDto {
  const proposer = accounts.findById(row.proposer_id)
  const target = accounts.findById(row.target_id)
  const fallbackName = (id: number) => `#${id}`
  const proposerName = proposer
    ? proposer.nickname ?? proposer.email.split('@')[0] ?? fallbackName(row.proposer_id)
    : fallbackName(row.proposer_id)
  const targetName = target
    ? target.nickname ?? target.email.split('@')[0] ?? fallbackName(row.target_id)
    : fallbackName(row.target_id)
  return {
    id: row.id,
    proposerId: row.proposer_id,
    targetId: row.target_id,
    proposerName,
    targetName,
    offeredCodexId: row.offered_codex_id,
    offeredCardId: row.offered_card_id,
    requestedCardId: row.requested_card_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
  }
}

function sendCardError(res: Response, err: unknown): void {
  if (err instanceof CardWorldError) {
    const status =
      err.code === 'DROP_NOT_FOUND' || err.code === 'CODEX_NOT_FOUND' || err.code === 'TRADE_NOT_FOUND'
        ? 404
        : err.code === 'FORBIDDEN'
          ? 403
          : err.code === 'OFFER_LOCKED' ||
              err.code === 'SEQUENCING_SLOT_OCCUPIED' ||
              err.code === 'CARRY_FULL' ||
              err.code === 'NOT_PENDING' ||
              err.code === 'DROP_UNAVAILABLE'
            ? 409
            : 400
    res.status(status).json({ error: err.code, message: err.message })
    return
  }
  console.error('[cards] unhandled', err)
  res.status(500).json({ error: 'INTERNAL_ERROR' })
}

function readNumberField(body: unknown, field: string): number | null {
  if (!body || typeof body !== 'object') return null
  const v = (body as Record<string, unknown>)[field]
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function readSlotType(body: unknown): SlotType | null {
  if (!body || typeof body !== 'object') return null
  const v = (body as Record<string, unknown>).slotType
  if (v === 'sequencing' || v === 'carry') return v
  return null
}

export function createCardWorldRouter(input: {
  store: CardWorldStore
  runtime: SimulationRuntime
  accounts: AccountStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)

  // -- Drops --------------------------------------------------------

  router.get('/cards/active', auth, (req: Request, res: Response) => {
    const tileIdRaw = req.query.tileId
    const tileId = typeof tileIdRaw === 'string' ? tileIdRaw : ''
    if (tileId.length === 0) {
      return sendCardError(res, new CardWorldError('INVALID_TILE', 'tileId query is required.'))
    }
    const drops = input.store.listActiveDropsInTile(tileId)
    res.json({
      tileId,
      tick: input.runtime.getCurrentTick(),
      drops: drops.map(dropToDto),
    })
  })

  router.get('/cards/held', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const drops = input.store.listHeldByPlayer(me)
    res.json({ tick: input.runtime.getCurrentTick(), drops: drops.map(dropToDto) })
  })

  router.post('/cards/pickup', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const dropId = readNumberField(req.body, 'dropId')
    if (dropId === null || dropId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_DROP', 'dropId is required.'))
    }
    try {
      const drop = input.store.pickupDrop({
        dropId,
        accountId: me,
        currentTick: input.runtime.getCurrentTick(),
      })
      res.json({ drop: dropToDto(drop) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/cards/store', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const dropId = readNumberField(req.body, 'dropId')
    const slotType = readSlotType(req.body)
    if (dropId === null || dropId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_DROP', 'dropId is required.'))
    }
    if (slotType === null) {
      return sendCardError(res, new CardWorldError('INVALID_SLOT', 'slotType must be sequencing or carry.'))
    }
    try {
      const result = input.store.storeDropToCodex({
        dropId,
        accountId: me,
        slotType,
        currentTick: input.runtime.getCurrentTick(),
      })
      res.json({ drop: dropToDto(result.drop), codex: codexToDto(result.codex) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/cards/release', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const dropId = readNumberField(req.body, 'dropId')
    if (dropId === null || dropId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_DROP', 'dropId is required.'))
    }
    try {
      const drop = input.store.releaseHeldDrop({
        dropId,
        accountId: me,
        currentTick: input.runtime.getCurrentTick(),
      })
      res.json({ drop: dropToDto(drop) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  // -- Codex --------------------------------------------------------

  router.get('/codex', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const entries = input.store.listCodexForAccount(me)
    res.json({
      sequencingSlotCount: SEQUENCING_SLOT_COUNT,
      carrySlotCount: CARRY_SLOT_COUNT,
      entries: entries.map(codexToDto),
    })
  })

  router.post('/codex/materialize', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const codexId = readNumberField(req.body, 'codexId')
    if (codexId === null || codexId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_CODEX', 'codexId is required.'))
    }
    try {
      const removed = input.store.materializeCodexEntry({ codexId, accountId: me })
      res.json({ materialized: codexToDto(removed) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  // -- Trade --------------------------------------------------------

  router.get('/trade/list', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const lists = input.store.listTradesForAccount(me)
    res.json({
      incoming: lists.incoming.map((t) => tradeToDto(t, input.accounts)),
      outgoing: lists.outgoing.map((t) => tradeToDto(t, input.accounts)),
    })
  })

  router.post('/trade/propose', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const targetUserId = readNumberField(req.body, 'targetUserId')
    const offeredCodexId = readNumberField(req.body, 'offeredCodexId')
    const requestedCardId = readNumberField(req.body, 'requestedCardId')
    if (targetUserId === null || targetUserId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_TARGET', 'targetUserId is required.'))
    }
    if (offeredCodexId === null || offeredCodexId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_OFFER', 'offeredCodexId is required.'))
    }
    if (requestedCardId === null || requestedCardId <= 0) {
      return sendCardError(res, new CardWorldError('INVALID_REQUEST', 'requestedCardId is required.'))
    }
    if (!input.accounts.findById(targetUserId)) {
      return sendCardError(res, new CardWorldError('TARGET_NOT_FOUND', 'Target user not found.'))
    }
    try {
      const trade = input.store.proposeTrade({
        proposerId: me,
        targetId: targetUserId,
        offeredCodexId,
        requestedCardId,
      })
      res.status(201).json({ trade: tradeToDto(trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/trade/accept/:tradeId', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tradeId = parsePositiveInt(req.params.tradeId)
    if (tradeId === null) {
      return sendCardError(res, new CardWorldError('INVALID_TRADE', 'Invalid trade id.'))
    }
    try {
      const trade = input.store.acceptTrade({
        tradeId,
        accountId: me,
        currentTick: input.runtime.getCurrentTick(),
      })
      res.json({ trade: tradeToDto(trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/trade/reject/:tradeId', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tradeId = parsePositiveInt(req.params.tradeId)
    if (tradeId === null) {
      return sendCardError(res, new CardWorldError('INVALID_TRADE', 'Invalid trade id.'))
    }
    try {
      const trade = input.store.rejectTrade({ tradeId, accountId: me })
      res.json({ trade: tradeToDto(trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/trade/cancel/:tradeId', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tradeId = parsePositiveInt(req.params.tradeId)
    if (tradeId === null) {
      return sendCardError(res, new CardWorldError('INVALID_TRADE', 'Invalid trade id.'))
    }
    try {
      const trade = input.store.cancelTrade({ tradeId, accountId: me })
      res.json({ trade: tradeToDto(trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  // -- 公開常數 (給前端 60 秒倒數使用) -----------------------------
  router.get('/cards/config', (_req: Request, res: Response) => {
    res.json({
      sixtySecondRuleTicks: SIXTY_SECOND_RULE_TICKS,
      sequencingSlotCount: SEQUENCING_SLOT_COUNT,
      carrySlotCount: CARRY_SLOT_COUNT,
    })
  })

  return router
}

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
