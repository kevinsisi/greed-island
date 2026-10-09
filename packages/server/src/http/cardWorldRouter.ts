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
import type Database from 'better-sqlite3'
import { accountId } from '../identity/principal.js'
import type { CanonicalAccountView } from './canonicalAccountView.js'
import { OwnedFeatureError, OwnedFeatureTransaction, ownedFeatureErrorStatus } from './ownedFeatureTransaction.js'
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
  energy: number | null
): { perceived: number | null; raw: number | null } {
  const deadline = deadlineTickFor(row)
  if (deadline === null) return { perceived: null, raw: null }
  const ticksLeft = deadline - currentTick
  const rawSec = Math.max(0, Math.round((ticksLeft * TICK_DURATION_MS) / 1000))
  if (energy === null) return { perceived: null, raw: rawSec }
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
  ctx: { tick: number; energy: number | null }
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

function tradeToDto(row: TradeRow, accounts: CanonicalAccountView): TradeDto {
  const proposer = accounts.findById(row.proposer_id)
  const target = accounts.findById(row.target_id)
  const fallbackName = (id: number) => `#${id}`
  const proposerName = proposer
    ? proposer.displayName
    : fallbackName(row.proposer_id)
  const targetName = target
    ? target.displayName
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
  const canonical = ownedFeatureErrorStatus(err)
  if (canonical) { res.status(canonical.status).json({ error: canonical.code, message: canonical.message }); return }
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
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^[1-9][0-9]*$/.test(v) ? Number(v) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function readSlotType(body: unknown): SlotType | null {
  if (!body || typeof body !== 'object') return null
  const v = (body as Record<string, unknown>).slotType
  if (v === 'sequencing' || v === 'carry') return v
  return null
}

/** Reviewed owned-card adapter; composition supplies one DB, cookie authority and world. */
export function createOwnedCardRouter(input: {
  db: Database.Database
  store: CardWorldStore
  pipeline: CardActionPipeline
  runtime: Pick<SimulationRuntime, 'getCurrentTick' | 'getAdmittedPlayerWorldActors' | 'getPlayerWorldGridPose'>
  accounts: CanonicalAccountView
  jobs: Pick<PlayerJobsStore, 'peekWallet'>
  authConfig: AuthConfig
}): Router {
  const router = Router(), auth = requireAuth(input.authConfig)
  const transaction = new OwnedFeatureTransaction(input.db, input.authConfig)
  const energyOf = (id: number): number | null => input.jobs.peekWallet(id)?.energy ?? null
  router.use(['/cards', '/codex', '/trade'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.vary('Cookie'); res.vary('Origin'); next()
  })
  const admitted = (id: number) => {
    const actor = input.runtime.getAdmittedPlayerWorldActors().find(row => row.accountId === id)
    if (!actor) throw new OwnedFeatureError(409, 'WORLD_CONNECTION_REQUIRED', 'An admitted world connection is required.')
    const pose = input.runtime.getPlayerWorldGridPose(accountId(id))
    if (!pose) throw new OwnedFeatureError(409, 'WORLD_POSITION_UNAVAILABLE', 'A canonical exterior position is required.')
    return { actor, pose }
  }
  const dropContext = (id: number) => ({ tick: input.runtime.getCurrentTick(), energy: energyOf(id) })
  const validDrop = (dropId: number, tick: number) => {
    const drop = input.store.getDrop(dropId)
    if (!drop) throw new CardWorldError('DROP_NOT_FOUND', 'Drop not found.')
    const deadline = deadlineTickFor(drop)
    if (deadline !== null && deadline <= tick) throw new CardWorldError('DROP_UNAVAILABLE', 'The sixty-second deadline has passed.')
    return drop
  }
  const numberField = (req: Request, field: string, code: string) => {
    const value = readNumberField(req.body, field)
    if (value === null || value <= 0) throw new CardCommandError(code, field + ' must be a positive safe integer.')
    return value
  }
  const mutate = (route: string, req: Request, res: Response, intent: unknown,
    commit: (id: number) => { status: number; body: unknown }) => {
    try { const result = transaction.run(req, route, intent, commit); res.status(result.status).json(result.body) }
    catch (error) { sendCardError(res, error) }
  }

  router.get('/cards/active', auth, (req, res) => {
    const tileId = typeof req.query.tileId === 'string' ? req.query.tileId : ''
    if (!tileId || tileId.length > 128) return sendCardError(res, new CardWorldError('INVALID_TILE', 'tileId query is required.'))
    const me = req.auth!.sub, ctx = dropContext(me)
    const drops = input.store.listActiveDropsInTile(tileId).filter(drop =>
      (drop.state === 'available' || drop.holder_account_id === me) && (deadlineTickFor(drop) ?? -1) > ctx.tick)
    res.json({ tileId, ...ctx, walletInitialized: ctx.energy !== null, drops: drops.map(drop => dropToDto(drop, ctx)) })
  })
  router.get('/cards/held', auth, (req, res) => {
    const me = req.auth!.sub, ctx = dropContext(me)
    res.json({ ...ctx, walletInitialized: ctx.energy !== null,
      drops: input.store.listHeldByPlayer(me).filter(drop => (deadlineTickFor(drop) ?? -1) > ctx.tick).map(drop => dropToDto(drop, ctx)) })
  })
  router.get('/cards/since-last-visit', auth, (req, res) => {
    const me = req.auth!.sub
    res.json({ ...input.pipeline.sinceLastVisit(me, input.accounts.getLastSeenTick(me)), currentTick: input.runtime.getCurrentTick() })
  })
  router.post('/cards/visit', auth, (req, res) => mutate('cards/visit', req, res, {}, me => {
    const currentTick = input.runtime.getCurrentTick()
    input.accounts.setLastSeenTick(me, currentTick)
    return { status: 200, body: { currentTick } }
  }))
  router.get('/codex', auth, (req, res) => res.json({
    sequencingSlotCount: SEQUENCING_SLOT_COUNT, carrySlotCount: CARRY_SLOT_COUNT,
    entries: input.store.listCodexForAccount(req.auth!.sub).map(codexToDto),
  }))
  router.get('/trade/list', auth, (req, res) => {
    const lists = input.store.listTradesForAccount(req.auth!.sub)
    res.json({ incoming: lists.incoming.map(row => tradeToDto(row, input.accounts)),
      outgoing: lists.outgoing.map(row => tradeToDto(row, input.accounts)) })
  })

  for (const action of ['pickup', 'store', 'release'] as const) {
    router.post('/cards/' + action, auth, (req, res) => {
      try {
        const dropId = numberField(req, 'dropId', 'INVALID_DROP'), slotType = readSlotType(req.body)
        if (action === 'store' && slotType === null) throw new CardCommandError('INVALID_SLOT', 'slotType must be sequencing or carry.')
        mutate('cards/' + action, req, res, { dropId, ...(action === 'store' ? { slotType } : {}) }, me => {
          const { actor, pose } = admitted(me), ctx = dropContext(me), drop = validDrop(dropId, ctx.tick)
          if (action === 'pickup') {
            // Existing card drops use a 600 × 400 canvas of 40px cells. Cell
            // centres are +0.5; the canonical world facade is its inverse.
            if (actor.tileId !== drop.tile_id || Math.hypot(pose.subCol - (drop.x / 40 - 0.5), pose.subRow - (drop.y / 40 - 0.5)) > 1.4) {
              throw new OwnedFeatureError(409, 'DROP_OUT_OF_REACH', 'Move within pickup range of the drop.')
            }
            const result = input.pipeline.pickup({ type: 'CARD_PICKUP', actorId: me, tick: ctx.tick, dropId })
            return { status: 200, body: { drop: dropToDto(result.drop, ctx) } }
          }
          if (action === 'store') {
            const result = input.pipeline.store_({ type: 'CARD_STORE', actorId: me, tick: ctx.tick, dropId, slotType: slotType! })
            return { status: 200, body: { drop: dropToDto(result.drop, ctx), codex: codexToDto(result.codex) } }
          }
          const result = input.pipeline.release({ type: 'CARD_RELEASE', actorId: me, tick: ctx.tick, dropId })
          return { status: 200, body: { drop: dropToDto(result.drop, ctx) } }
        })
      } catch (error) { sendCardError(res, error) }
    })
  }
  router.post('/codex/materialize', auth, (req, res) => {
    try {
      const codexId = numberField(req, 'codexId', 'INVALID_CODEX')
      mutate('codex/materialize', req, res, { codexId }, me => {
        admitted(me)
        const result = input.pipeline.materialize({ type: 'CARD_MATERIALIZE', actorId: me, tick: input.runtime.getCurrentTick(), codexId })
        return { status: 200, body: { materialized: codexToDto(result.codex) } }
      })
    } catch (error) { sendCardError(res, error) }
  })
  router.post('/trade/propose', auth, (req, res) => {
    try {
      const targetId = numberField(req, 'targetUserId', 'INVALID_TARGET'), offeredCodexId = numberField(req, 'offeredCodexId', 'INVALID_OFFER')
      const requestedCardId = numberField(req, 'requestedCardId', 'INVALID_REQUEST')
      mutate('trade/propose', req, res, { targetId, offeredCodexId, requestedCardId }, me => {
        admitted(me)
        if (!input.accounts.findById(targetId)) throw new CardCommandError('TARGET_NOT_FOUND', 'Target user not found.')
        const result = input.pipeline.proposeTrade({ type: 'CARD_TRADE_PROPOSE', actorId: me, tick: input.runtime.getCurrentTick(), targetId, offeredCodexId, requestedCardId })
        return { status: 201, body: { trade: tradeToDto(result.trade, input.accounts) } }
      })
    } catch (error) { sendCardError(res, error) }
  })
  for (const action of ['accept', 'reject', 'cancel'] as const) {
    router.post('/trade/' + action + '/:tradeId', auth, (req, res) => {
      const tradeId = parsePositiveInt(req.params.tradeId)
      if (tradeId === null) return sendCardError(res, new CardCommandError('INVALID_TRADE', 'Invalid trade id.'))
      mutate('trade/' + action, req, res, { tradeId }, me => {
        admitted(me)
        const tick = input.runtime.getCurrentTick(), trade = input.store.getTrade(tradeId)
        if (!trade) throw new CardWorldError('TRADE_NOT_FOUND', 'Trade not found.')
        if (action === 'accept' && !input.accounts.findById(trade.proposer_id)) throw new CardCommandError('TARGET_NOT_FOUND', 'The proposer is unavailable.')
        const result = action === 'accept' ? input.pipeline.acceptTrade({ type: 'CARD_TRADE_ACCEPT', actorId: me, tick, tradeId })
          : action === 'reject' ? input.pipeline.rejectTrade({ type: 'CARD_TRADE_REJECT', actorId: me, tick, tradeId })
          : input.pipeline.cancelTrade({ type: 'CARD_TRADE_CANCEL', actorId: me, tick, tradeId })
        return { status: 200, body: { trade: tradeToDto(result.trade, input.accounts) } }
      })
    })
  }
  router.get('/cards/config', (_req, res) => res.json({
    sixtySecondRuleTicks: SIXTY_SECOND_RULE_TICKS, sequencingSlotCount: SEQUENCING_SLOT_COUNT, carrySlotCount: CARRY_SLOT_COUNT,
  }))
  return router
}

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
