// SP1 — Player Survival Needs: GET /player/needs + POST /player/eat.
// Lazy reconcile: compare stored asOfTick vs currentTick; only emit
// PLAYER_NEEDS_RECONCILED when ≥1 integer tick boundary is crossed AND
// values actually changed (throttle prevents event flood on rapid reads).

import { Router, json, type Request, type Response } from 'express'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { seedState, reconcile, applyEat } from '../projections/playerSurvival.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { requireAuth, type AuthConfig } from './auth.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import { CanonicalGameplayAuthority, reauthorizeGameplayMutation, sendGameplayError } from './gameplayAuthority.js'
import { PLAYER_EAT_RATION_GOLD_COST } from '../config/world.js'

export function createPlayerSurvivalRouter(input: {
  runtime: SimulationRuntime
  jobs: PlayerJobsStore
  authConfig: AuthConfig
  authority?: CanonicalGameplayAuthority
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)

  function getOrSeedState(accountId: number, currentTick: number, req: Request) {
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
    if (input.authority) input.runtime.submitAuthorizedPlayerCommand(cmd, { authorize: () => { input.authConfig.reauthorizeMutation(req); input.authority!.requirePosition(accountId) } })
    else input.runtime.submitLivingWorldCommand(cmd)
    return projection.getState(accountId) ?? initial
  }

  router.get('/player/needs', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub, tick = input.runtime.getCurrentTick()
    const state = input.runtime.getPlayerSurvivalProjection().getState(accountId) ?? seedState(tick)
    res.json(reconcile(state, tick))
  })

  router.post('/player/needs/reconcile', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) { res.status(401).json({ error: 'UNAUTHORIZED' }); return }
    const accountId = Number(claims.sub)
    if (!Number.isFinite(accountId) || accountId <= 0) { res.status(400).json({ error: 'INVALID_ACCOUNT' }); return }

    if (!reauthorizeGameplayMutation(input.authConfig, req, res, accountId)) return
    if (input.authority) { try { input.authority.requirePosition(accountId) } catch (error) { sendGameplayError(res, error); return } }
    const currentTick = input.runtime.getCurrentTick()
    const state = getOrSeedState(accountId, currentTick, req)
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
          if (input.authority) input.runtime.submitAuthorizedPlayerCommand(collapseCmd, { authorize: () => { input.authConfig.reauthorizeMutation(req); input.authority!.requirePosition(accountId) } })
        else input.runtime.submitLivingWorldCommand(collapseCmd)
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
        if (input.authority) input.runtime.submitAuthorizedPlayerCommand(reconcileCmd, { authorize: () => { input.authConfig.reauthorizeMutation(req); input.authority!.requirePosition(accountId) } })
        else input.runtime.submitLivingWorldCommand(reconcileCmd)
      }
    }

    res.json(reconciled)
  })

  router.post('/player/eat', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) { res.status(401).json({ error: 'UNAUTHORIZED' }); return }
    const accountId = Number(claims.sub)
    if (!Number.isFinite(accountId) || accountId <= 0) { res.status(400).json({ error: 'INVALID_ACCOUNT' }); return }

    if (!reauthorizeGameplayMutation(input.authConfig, req, res, accountId)) return
    if (input.authority) { try { input.authority.requirePosition(accountId) } catch (error) { sendGameplayError(res, error); return } }
    const currentTick = input.runtime.getCurrentTick()
    const state = input.runtime.getPlayerSurvivalProjection().getState(accountId) ?? seedState(currentTick)

    const wallet = input.authority ? input.jobs.peekWallet(accountId) ?? { gold: 0 } : input.jobs.getWallet(accountId)
    if (wallet.gold < PLAYER_EAT_RATION_GOLD_COST) {
      res.status(402).json({
        accepted: false,
        error: 'INSUFFICIENT_GOLD',
        goldRequired: PLAYER_EAT_RATION_GOLD_COST,
        goldAvailable: wallet.gold,
      })
      return
    }

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
    let event
    if (input.authority) {
      try { event = input.runtime.submitAuthorizedPlayerCommand(cmd, {
        authorize: () => { input.authConfig.reauthorizeMutation(req); input.authority!.requirePosition(accountId) },
        beforeCommit: () => {
          if ((input.jobs.peekWallet(accountId)?.gold ?? 0) < PLAYER_EAT_RATION_GOLD_COST) throw Object.assign(new Error(), { code: 'INSUFFICIENT_GOLD' })
          input.jobs.addGold(accountId, -PLAYER_EAT_RATION_GOLD_COST)
        },
      }) } catch (error) { sendGameplayError(res, error); return }
    } else {
      input.jobs.addGold(accountId, -PLAYER_EAT_RATION_GOLD_COST)
      try { event = input.runtime.submitLivingWorldCommand(cmd) }
      catch (error) { input.jobs.addGold(accountId, PLAYER_EAT_RATION_GOLD_COST); sendGameplayError(res, error); return }
      if (!event) input.jobs.addGold(accountId, PLAYER_EAT_RATION_GOLD_COST)
    }
    if (!event) { res.status(422).json({ accepted: false, error: 'COMMAND_REJECTED' }); return }

    res.json({ accepted: true, needs: afterEat })
  })

  return router
}


/** One canonical account/world authority; the GET path never seeds/reconciles facts. */
export function createUnifiedPlayerSurvivalRouter(input: Omit<Parameters<typeof createPlayerSurvivalRouter>[0], 'authority'>): Router {
  const router = Router()
  router.use('/player', json({ limit: 4096, strict: true }))
  router.use('/player', (req, res, next) => {
    if (req.body !== undefined && Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 4096) { res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return }
    if (req.body && Object.keys(req.body).length) { res.status(400).json({ error: 'INVALID_INPUT' }); return }
    next()
  })
  router.use(createPlayerSurvivalRouter({ ...input, authority: new CanonicalGameplayAuthority(input.runtime) }))
  return router
}
