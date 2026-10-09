// Technique-shop HTTP router — v0.15.0.
//
// 術式卡只能在「天際百貨」（霓港區，t_temple tile）購買。其它地方的
// 商店看不到術式卡。15 張全部來自 cards/techniques.ts 的 catalog，
// 售價 / 上限寫死。
//
// 路由：
//   GET  /api/shop/techniques              — 列出全部 15 張 + 玩家持有 count
//   POST /api/shop/techniques/:id/buy      — 購買 1 張（須在 t_temple、有足夠潮幣）
//   GET  /api/me/techniques                — 玩家擁有的術式卡

import { Router, type Request, type Response } from 'express'
import { requireAuth, type AuthConfig } from './auth.js'
import {
  TECHNIQUE_CARDS,
  TechniqueShopErrorObj,
  TechniqueShopStore,
  findTechnique,
} from '../cards/techniques.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import { accountId } from '../identity/principal.js'
import { OwnedFeatureError, OwnedFeatureTransaction, ownedFeatureErrorStatus } from './ownedFeatureTransaction.js'

const NEON_PORT_TILE = 't_temple' // 霓港區 tile id

export function createOwnedTechniqueRouter(input: {
  db: import('better-sqlite3').Database
  jobs: Pick<PlayerJobsStore, 'peekWallet' | 'addGold'>
  runtime: Pick<SimulationRuntime, 'getAdmittedPlayerWorldActors' | 'getPlayerWorldGridPose'>
  authConfig: AuthConfig
  /** The normal factory shares this exact projection with combat. */
  store?: TechniqueShopStore
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)
  const store = input.store ?? new TechniqueShopStore(input.db)
  const transaction = new OwnedFeatureTransaction(input.db, input.authConfig)
  router.use(['/shop/techniques', '/me/techniques'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.vary('Cookie'); res.vary('Origin'); next()
  })

  router.get('/shop/techniques', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const owned = store.listOwned(accountId)
    const ownedById = new Map(owned.map((r) => [r.card_id, r.count]))
    const items = TECHNIQUE_CARDS.map((c) => ({
      id: c.id,
      nameZh: c.nameZh,
      nameEn: c.nameEn,
      category: c.category,
      priceGold: c.priceGold,
      maxOwnedPerPlayer: c.maxOwnedPerPlayer,
      description: c.description,
      effectDescription: c.effectDescription,
      ownedCount: ownedById.get(c.id) ?? 0,
    }))
    res.json({ items, locationTile: NEON_PORT_TILE })
  })

  router.get('/me/techniques', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const owned = store.listOwned(accountId)
    res.json({
      owned: owned.map((r) => {
        const card = findTechnique(r.card_id)
        return {
          cardId: r.card_id,
          count: r.count,
          lastPurchasedAt: r.last_purchased_at,
          card: card
            ? {
                nameZh: card.nameZh,
                nameEn: card.nameEn,
                category: card.category,
                description: card.description,
                effectDescription: card.effectDescription,
              }
            : null,
        }
      }),
    })
  })

  router.post('/shop/techniques/:id/buy', auth, (req: Request, res: Response) => {
    try {
      const raw = req.params.id, cardId = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN
      const card = Number.isSafeInteger(cardId) ? findTechnique(cardId) : null
      if (!card) throw new TechniqueShopErrorObj('CARD_NOT_FOUND', 'Technique card not found.')
      const result = transaction.run(req, 'shop/techniques/buy', { cardId }, actor => {
        const location = input.runtime.getAdmittedPlayerWorldActors().find(row => row.accountId === actor)
        const pose = input.runtime.getPlayerWorldGridPose(accountId(actor))
        if (!location || !pose) throw new OwnedFeatureError(409, 'WORLD_CONNECTION_REQUIRED', 'An admitted canonical world position is required.')
        if (location.tileId !== NEON_PORT_TILE) {
          throw new TechniqueShopErrorObj('NOT_IN_NEON_PORT', 'Technique cards are sold only at 天際百貨 (霓港區).')
        }
        const wallet = input.jobs.peekWallet(actor)
        if (!wallet) throw new OwnedFeatureError(409, 'WALLET_REQUIRED', 'The existing game wallet is not initialized.')
        if (wallet.gold < card.priceGold) {
          throw new TechniqueShopErrorObj('NOT_ENOUGH_GOLD', `Need ${card.priceGold} gold, have ${wallet.gold}.`)
        }
        const count = store.countOwned(actor, cardId)
        if (count >= card.maxOwnedPerPlayer) {
          throw new TechniqueShopErrorObj('OWNED_LIMIT_REACHED', `Already owns ${count} (limit ${card.maxOwnedPerPlayer}).`)
        }
        // Balance deduction, owned projection, and retry receipt share ONE DB transaction.
        const newWallet = input.jobs.addGold(actor, -card.priceGold)
        const owned = store.addOwned(actor, cardId, Date.now())
        return { status: 200, body: { owned, wallet: newWallet, card } }
      })
      res.status(result.status).json(result.body)
    } catch (error) {
      const canonical = ownedFeatureErrorStatus(error)
      if (canonical) { res.status(canonical.status).json({ error: canonical.code, message: canonical.message }); return }
      if (error instanceof TechniqueShopErrorObj) {
        res.status(error.code === 'CARD_NOT_FOUND' ? 404 : 409).json({ error: error.code, message: error.message })
        return
      }
      console.error('[techniques] purchase failed', error)
      res.status(500).json({ error: 'INTERNAL_ERROR' })
    }
  })

  return router
}
