// 紋卡 / 紋典 / 交易 HTTP 端點。
// 端點：
//   GET    /api/cards/active?tileId=...      列出 tile 內目前 available + 自己 held 的 drops
//   GET    /api/cards/held                   列出自己現在 held 的 drops（跨 tile）
//   POST   /api/cards/pickup    {dropId}     撿起一張 drop → 啟動 60 秒
//   POST   /api/cards/store     {dropId, slotType}  收入紋典
//   POST   /api/cards/release   {dropId}     把 held 卡丟回原地
//   GET    /api/cards/since-last-visit       玩家不在時的紋卡摘要
//
//   GET    /api/codex                         自己的紋典
//   POST   /api/codex/materialize {codexId}   現形（不可逆）
//
//   GET    /api/trade/list                    pending 交易 (incoming + outgoing)
//   POST   /api/trade/propose   {targetUserId, offeredCodexId, requestedCardId}
//   POST   /api/trade/accept/:tradeId
//   POST   /api/trade/reject/:tradeId
//   POST   /api/trade/cancel/:tradeId
//
// 所有寫入操作都走 CardActionPipeline → command 驗證 → 寫 card_action_log
// → projection（CardWorldStore SQL mutation）一次 transaction 完成。

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
import {
  CardActionPipeline,
  CardCommandError,
  cardCommandErrorStatus,
} from './cardCommands.js'
import type { AccountStore } from './accounts.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'

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
  /** 顯示用「剩餘秒數」— 後端可能加入 ±N 秒精力誤差讓低能量玩家看不準。
   *  null 代表沒有 deadline (state='available' / 'stored' / 'expired')。 */
  perceivedSecondsLeft?: number | null
  /** 後端真實秒數（不加誤差）— 給 telemetry / debug，前端不要顯示。 */
  rawSecondsLeft?: number | null
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

const TICK_DURATION_MS = 5_000
/** 精力 < 30 時 timer 顯示 ±5 秒誤差；精力 < 60 時 ±2 秒；其他正常。 */
const TIMER_JITTER_BANDS: ReadonlyArray<{ minEnergy: number; maxJitterSec: number }> = [
  { minEnergy: 60, maxJitterSec: 0 },
  { minEnergy: 30, maxJitterSec: 2 },
  { minEnergy: 0, maxJitterSec: 5 },
]

function deadlineTickFor(row: DropRow): number | null {
  if (row.state === 'available') return row.expires_at_tick
  if (row.state === 'held') return row.store_deadline_tick
  return null
}

/**
 * 計算給玩家看的「剩餘秒數」。能量低時加上 deterministic ±N 秒誤差，
 * 讓玩家感覺自己沒辦法精準掌握 60 秒。jitter 由 (dropId, deadlineTick)
 * 決定，所以同一張卡每次 poll 都會看到相同誤差，不會抖動。
 */
function perceivedSecondsLeft(
  row: DropRow,
  currentTick: number,
  energy: number
): { perceived: number | null; raw: number | null } {
  const deadline = deadlineTickFor(row)
  if (deadline === null) return { perceived: null, raw: null }
  const ticksLeft = deadline - currentTick
  const rawSec = Math.max(0, Math.round((ticksLeft * TICK_DURATION_MS) / 1000))
  // 找對應的 jitter band（從高 → 低 energy）
  let maxJitter = 0
  for (const band of TIMER_JITTER_BANDS) {
    if (energy >= band.minEnergy) {
      maxJitter = band.maxJitterSec
      break
    }
  }
  if (maxJitter === 0) {
    return { perceived: rawSec, raw: rawSec }
  }
  // deterministic ±maxJitter：用 (dropId * 31 + deadline) % (2*maxJitter+1) - maxJitter
  const seed = (row.id * 31 + deadline) >>> 0
  const offset = (seed % (2 * maxJitter + 1)) - maxJitter
  return { perceived: Math.max(0, rawSec + offset), raw: rawSec }
}

function dropToDto(
  row: DropRow,
  ctx: { tick: number; energy: number }
): DropDto {
  const { perceived, raw } = perceivedSecondsLeft(row, ctx.tick, ctx.energy)
  const dto: DropDto = {
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
    perceivedSecondsLeft: perceived,
    rawSecondsLeft: raw,
  }
  return dto
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
  if (err instanceof CardCommandError) {
    res.status(cardCommandErrorStatus(err.code)).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof CardWorldError) {
    res
      .status(cardCommandErrorStatus(err.code))
      .json({ error: err.code, message: err.message })
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
  pipeline: CardActionPipeline
  runtime: SimulationRuntime
  accounts: AccountStore
  jobs: PlayerJobsStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)

  const energyOf = (accountId: number): number => {
    return input.jobs.getWallet(accountId).energy
  }

  // -- Drops --------------------------------------------------------

  router.get('/cards/active', auth, (req: Request, res: Response) => {
    const tileIdRaw = req.query.tileId
    const tileId = typeof tileIdRaw === 'string' ? tileIdRaw : ''
    if (tileId.length === 0) {
      return sendCardError(res, new CardWorldError('INVALID_TILE', 'tileId query is required.'))
    }
    const me = req.auth!.sub
    const tick = input.runtime.getCurrentTick()
    const energy = energyOf(me)
    const drops = input.store.listActiveDropsInTile(tileId)
    res.json({
      tileId,
      tick,
      energy,
      drops: drops.map((d) => dropToDto(d, { tick, energy })),
    })
  })

  router.get('/cards/held', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tick = input.runtime.getCurrentTick()
    const energy = energyOf(me)
    const drops = input.store.listHeldByPlayer(me)
    res.json({
      tick,
      energy,
      drops: drops.map((d) => dropToDto(d, { tick, energy })),
    })
  })

  router.post('/cards/pickup', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const dropId = readNumberField(req.body, 'dropId')
    if (dropId === null || dropId <= 0) {
      return sendCardError(res, new CardCommandError('INVALID_DROP', 'dropId is required.'))
    }
    try {
      const tick = input.runtime.getCurrentTick()
      const result = input.pipeline.pickup({
        type: 'CARD_PICKUP',
        actorId: me,
        tick,
        dropId,
      })
      const energy = energyOf(me)
      res.json({ drop: dropToDto(result.drop, { tick, energy }) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/cards/store', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const dropId = readNumberField(req.body, 'dropId')
    const slotType = readSlotType(req.body)
    if (dropId === null || dropId <= 0) {
      return sendCardError(res, new CardCommandError('INVALID_DROP', 'dropId is required.'))
    }
    if (slotType === null) {
      return sendCardError(
        res,
        new CardCommandError('INVALID_SLOT', 'slotType must be sequencing or carry.')
      )
    }
    try {
      const tick = input.runtime.getCurrentTick()
      const result = input.pipeline.store_({
        type: 'CARD_STORE',
        actorId: me,
        tick,
        dropId,
        slotType,
      })
      const energy = energyOf(me)
      res.json({
        drop: dropToDto(result.drop, { tick, energy }),
        codex: codexToDto(result.codex),
      })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/cards/release', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const dropId = readNumberField(req.body, 'dropId')
    if (dropId === null || dropId <= 0) {
      return sendCardError(res, new CardCommandError('INVALID_DROP', 'dropId is required.'))
    }
    try {
      const tick = input.runtime.getCurrentTick()
      const result = input.pipeline.release({
        type: 'CARD_RELEASE',
        actorId: me,
        tick,
        dropId,
      })
      const energy = energyOf(me)
      res.json({ drop: dropToDto(result.drop, { tick, energy }) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.get('/cards/since-last-visit', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const sinceTick = input.accounts.getLastSeenTick(me)
    const summary = input.pipeline.sinceLastVisit(me, sinceTick)
    // 摸一下 last_seen_tick：玩家看到摘要就算「visited」，下次顯示
    // 從這個 tick 之後算
    const currentTick = input.runtime.getCurrentTick()
    input.accounts.setLastSeenTick(me, currentTick)
    res.json({
      ...summary,
      currentTick,
    })
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
      return sendCardError(res, new CardCommandError('INVALID_CODEX', 'codexId is required.'))
    }
    try {
      const result = input.pipeline.materialize({
        type: 'CARD_MATERIALIZE',
        actorId: me,
        tick: input.runtime.getCurrentTick(),
        codexId,
      })
      res.json({ materialized: codexToDto(result.codex) })
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
      return sendCardError(res, new CardCommandError('INVALID_TARGET', 'targetUserId is required.'))
    }
    if (offeredCodexId === null || offeredCodexId <= 0) {
      return sendCardError(res, new CardCommandError('INVALID_OFFER', 'offeredCodexId is required.'))
    }
    if (requestedCardId === null || requestedCardId <= 0) {
      return sendCardError(
        res,
        new CardCommandError('INVALID_REQUEST', 'requestedCardId is required.')
      )
    }
    if (!input.accounts.findById(targetUserId)) {
      return sendCardError(res, new CardCommandError('TARGET_NOT_FOUND', 'Target user not found.'))
    }
    try {
      const result = input.pipeline.proposeTrade({
        type: 'CARD_TRADE_PROPOSE',
        actorId: me,
        tick: input.runtime.getCurrentTick(),
        targetId: targetUserId,
        offeredCodexId,
        requestedCardId,
      })
      res.status(201).json({ trade: tradeToDto(result.trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/trade/accept/:tradeId', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tradeId = parsePositiveInt(req.params.tradeId)
    if (tradeId === null) {
      return sendCardError(res, new CardCommandError('INVALID_TRADE', 'Invalid trade id.'))
    }
    try {
      const result = input.pipeline.acceptTrade({
        type: 'CARD_TRADE_ACCEPT',
        actorId: me,
        tick: input.runtime.getCurrentTick(),
        tradeId,
      })
      res.json({ trade: tradeToDto(result.trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/trade/reject/:tradeId', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tradeId = parsePositiveInt(req.params.tradeId)
    if (tradeId === null) {
      return sendCardError(res, new CardCommandError('INVALID_TRADE', 'Invalid trade id.'))
    }
    try {
      const result = input.pipeline.rejectTrade({
        type: 'CARD_TRADE_REJECT',
        actorId: me,
        tick: input.runtime.getCurrentTick(),
        tradeId,
      })
      res.json({ trade: tradeToDto(result.trade, input.accounts) })
    } catch (err) {
      sendCardError(res, err)
    }
  })

  router.post('/trade/cancel/:tradeId', auth, (req: Request, res: Response) => {
    const me = req.auth!.sub
    const tradeId = parsePositiveInt(req.params.tradeId)
    if (tradeId === null) {
      return sendCardError(res, new CardCommandError('INVALID_TRADE', 'Invalid trade id.'))
    }
    try {
      const result = input.pipeline.cancelTrade({
        type: 'CARD_TRADE_CANCEL',
        actorId: me,
        tick: input.runtime.getCurrentTick(),
        tradeId,
      })
      res.json({ trade: tradeToDto(result.trade, input.accounts) })
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
