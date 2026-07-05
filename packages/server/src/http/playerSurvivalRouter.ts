// SP1 — Player Survival Needs: GET /player/needs + POST /player/eat.
// Lazy reconcile: compare stored asOfTick vs currentTick; only emit
// PLAYER_NEEDS_RECONCILED when ≥1 integer tick boundary is crossed AND
// values actually changed (throttle prevents event flood on rapid reads).

import { Router, type Request, type Response } from 'express'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { seedState, reconcile, applyEat } from '../projections/playerSurvival.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { requireAuth, type AuthConfig } from './auth.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import { PLAYER_EAT_RATION_GOLD_COST } from '../config/world.js'

export function createPlayerSurvivalRouter(input: {
  runtime: SimulationRuntime
  jobs: PlayerJobsStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)

  function getOrSeedState(accountId: number, currentTick: number) {
    const projection = input.runtime.getPlayerSurvivalProjection()
    const stored = projection.getState(accountId)
    if (stored) return stored

    const initial = seedState(currentTick)
    const cmd = makeLivingWorldCommand(
      'PLAYER_NEEDS_SEEDED',
      String(accountId),
      'player',
      currentTick,
      Date.now(),
      { accountId, asOfTick: initial.asOfTick, nourishment: initial.nourishment, vigor: initial.vigor, collapsed: initial.collapsed },
    )
    input.runtime.submitLivingWorldCommand(cmd)
    return projection.getState(accountId) ?? initial
  }

  router.get('/player/needs', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) { res.status(401).json({ error: 'UNAUTHORIZED' }); return }
    const accountId = Number(claims.sub)
    if (!Number.isFinite(accountId) || accountId <= 0) { res.status(400).json({ error: 'INVALID_ACCOUNT' }); return }

    const currentTick = input.runtime.getCurrentTick()
    const state = getOrSeedState(accountId, currentTick)
    const reconciled = reconcile(state, currentTick)

    // Throttle: only record if ≥1 integer tick elapsed and values changed
    if (Math.floor(currentTick) > Math.floor(state.asOfTick)) {
      const changed =
        reconciled.nourishment !== state.nourishment ||
        reconciled.vigor !== state.vigor ||
        reconciled.collapsed !== state.collapsed
      if (changed) {
        if (!state.collapsed && reconciled.collapsed) {
          const collapseCmd = makeLivingWorldCommand(
            'PLAYER_COLLAPSED',
            String(accountId),
            'player',
            currentTick,
            Date.now(),
            { accountId, tick: currentTick },
          )
          input.runtime.submitLivingWorldCommand(collapseCmd)
        }
        const reconcileCmd = makeLivingWorldCommand(
          'PLAYER_NEEDS_RECONCILED',
          String(accountId),
          'player',
          currentTick,
          Date.now(),
          {
            accountId,
            asOfTick: reconciled.asOfTick,
            nourishment: reconciled.nourishment,
            vigor: reconciled.vigor,
            collapsed: reconciled.collapsed,
          },
        )
        input.runtime.submitLivingWorldCommand(reconcileCmd)
      }
    }

    res.json(reconciled)
  })

  router.post('/player/eat', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) { res.status(401).json({ error: 'UNAUTHORIZED' }); return }
    const accountId = Number(claims.sub)
    if (!Number.isFinite(accountId) || accountId <= 0) { res.status(400).json({ error: 'INVALID_ACCOUNT' }); return }

    const currentTick = input.runtime.getCurrentTick()
    const state = getOrSeedState(accountId, currentTick)

    const wallet = input.jobs.getWallet(accountId)
    if (wallet.gold < PLAYER_EAT_RATION_GOLD_COST) {
      res.status(402).json({
        accepted: false,
        error: 'INSUFFICIENT_GOLD',
        goldRequired: PLAYER_EAT_RATION_GOLD_COST,
        goldAvailable: wallet.gold,
      })
      return
    }

    input.jobs.addGold(accountId, -PLAYER_EAT_RATION_GOLD_COST)

    const afterEat = applyEat(state, currentTick)
    const cmd = makeLivingWorldCommand(
      'PLAYER_ATE',
      String(accountId),
      'player',
      currentTick,
      Date.now(),
      {
        accountId,
        asOfTick: afterEat.asOfTick,
        nourishment: afterEat.nourishment,
        vigor: afterEat.vigor,
        collapsed: afterEat.collapsed,
        goldCost: PLAYER_EAT_RATION_GOLD_COST,
      },
    )
    const event = input.runtime.submitLivingWorldCommand(cmd)
    if (!event) {
      input.jobs.addGold(accountId, PLAYER_EAT_RATION_GOLD_COST)
      res.status(422).json({ accepted: false, error: 'COMMAND_REJECTED' })
      return
    }

    res.json({ accepted: true, needs: afterEat })
  })

  return router
}
