import { Router, type Request, type Response } from 'express'
import { requireAuth, type AuthConfig } from './auth.js'
import { makeLivingWorldCommand, isLivingWorldCommandType } from '../kernel/livingWorldCommands.js'
import type { SimulationRuntime } from '../sim/runtime.js'

const PLAYER_CIVILIZATION_COMMAND_TYPES = new Set([
  'PLAYER_PICKED_UP_GOODS',
  'PLAYER_DEPOSIT_GOODS',
  'PLAYER_TRADED_GOODS',
  'PLAYER_HUNTED_ANIMAL',
  'PLAYER_FISHED',
  'PLAYER_DOMESTICATED_ANIMAL',
  'PLAYER_PROTECTED_REGION',
  'PLAYER_HIRED_NPC',
  'PLAYER_DISMISSED_NPC',
  'PLAYER_SPONSORED_CONSTRUCTION',
  'PLAYER_FOUNDED_SETTLEMENT',
  'PLAYER_CLAIMED_TERRITORY',
  'PLAYER_JOINED_FACTION',
  'PLAYER_LEFT_FACTION',
  'PLAYER_LED_FACTION',
  'PLAYER_PLAYED_CARD',
])

export function createPlayerCivilizationRouter(input: {
  runtime: SimulationRuntime
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)

  router.post('/world/player-action', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    const { type, payload } = req.body as { type: unknown; payload: unknown }
    if (typeof type !== 'string' || !PLAYER_CIVILIZATION_COMMAND_TYPES.has(type)) {
      res.status(400).json({ accepted: false, reason: 'unknown or disallowed command type' })
      return
    }
    if (!isLivingWorldCommandType(type)) {
      res.status(400).json({ accepted: false, reason: 'unknown command type' })
      return
    }
    const tick = input.runtime.getCurrentTick()
    const accountId = String(claims.sub)
    const mergedPayload = {
      ...(typeof payload === 'object' && payload !== null ? payload : {}),
      playerAccountId: accountId,
      tick,
    }
    const command = makeLivingWorldCommand(type, accountId, 'player', tick, Date.now(), mergedPayload)
    const event = input.runtime.submitLivingWorldCommand(command)
    if (!event) {
      res.status(422).json({ accepted: false, reason: 'rule engine rejected' })
      return
    }
    res.json({ accepted: true, tick })
  })

  router.get('/world/player-state', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    const snapshot = input.runtime.getPlayerCivilizationSnapshot(String(claims.sub))
    res.json(snapshot)
  })

  return router
}
