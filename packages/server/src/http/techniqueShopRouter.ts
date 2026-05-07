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
import type { SocialStore } from './socialStore.js'

const NEON_PORT_TILE = 't_temple' // 霓港區 tile id

export function createTechniqueShopRouter(input: {
  db: import('better-sqlite3').Database
  jobs: PlayerJobsStore
  social: SocialStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)
  const store = new TechniqueShopStore(input.db)

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
      const accountId = req.auth!.sub
      const cardId = Number(req.params.id ?? '')
      const card = findTechnique(cardId)
      if (!card) {
        throw new TechniqueShopErrorObj('CARD_NOT_FOUND', `Technique card ${cardId} not found.`)
      }
      const playerLoc = input.social.getPlayerLocation(accountId)
      if (!playerLoc || playerLoc.tile_id !== NEON_PORT_TILE) {
        throw new TechniqueShopErrorObj(
          'NOT_IN_NEON_PORT',
          'Technique cards are sold only at 天際百貨 (霓港區). Move to the temple tile and try again.'
        )
      }
      const wallet = input.jobs.getWallet(accountId)
      if (wallet.gold < card.priceGold) {
        throw new TechniqueShopErrorObj(
          'NOT_ENOUGH_GOLD',
          `Need ${card.priceGold} gold, have ${wallet.gold}.`
        )
      }
      const ownedCount = store.countOwned(accountId, cardId)
      if (ownedCount >= card.maxOwnedPerPlayer) {
        throw new TechniqueShopErrorObj(
          'OWNED_LIMIT_REACHED',
          `Already owns ${ownedCount} (limit ${card.maxOwnedPerPlayer}).`
        )
      }
      // Deduct gold first; on success record purchase.
      const newWallet = input.jobs.addGold(accountId, -card.priceGold)
      const ownedRow = store.addOwned(accountId, cardId, Date.now())
      res.json({ owned: ownedRow, wallet: newWallet, card })
    } catch (err) {
      if (err instanceof TechniqueShopErrorObj) {
        const status =
          err.code === 'CARD_NOT_FOUND' ? 404 :
          err.code === 'NOT_IN_NEON_PORT' ? 409 :
          err.code === 'NOT_ENOUGH_GOLD' ? 409 :
          err.code === 'OWNED_LIMIT_REACHED' ? 409 :
          400
        res.status(status).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }
  })

  return router
}
