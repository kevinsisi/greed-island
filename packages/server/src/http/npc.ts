// NPC interaction router. Endpoints here are per-user and require auth.
//
//   POST /api/npc/:npcId/interact   submit a dialog intent, get the
//                                   NPC's reply line for *this* player
//                                   (driven by the player's personal
//                                   trust value with that NPC), and
//                                   append a personal_events row.
//
//   GET  /api/npc/:npcId/history    list this player's recent dialog
//                                   turns with the given NPC.
//
// The world event log (kernel events) is NOT touched here — player NPC
// dialog is intentionally a private slice. Public events (NPC routine
// moves, weather, rare windows) keep flowing through SimulationRuntime.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import { requireAuth, type AuthConfig } from './auth.js'
import {
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
  type PlayerStateStore,
  clampTrust,
} from './playerState.js'
import {
  INTERACT_INTENTS,
  isInteractIntent,
  pickLine,
  tierForRelationship,
  type InteractIntent,
} from '../npcs/dialog.js'

const TRUST_DELTAS: Readonly<Record<InteractIntent, number>> = {
  greet: 1,
  ask: 0,
  trade: 0,
  leave: 0,
}

const HISTORY_DEFAULT_LIMIT = 20
const HISTORY_MAX_LIMIT = 100

export function createNpcRouter(input: {
  runtime: SimulationRuntime
  store: PlayerStateStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)

  router.post('/npc/:npcId/interact', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    const npcId = String(req.params.npcId ?? '')
    const profile = input.runtime.findProfile(npcId)
    if (!profile) {
      res.status(404).json({ error: 'NPC_NOT_FOUND', message: `Unknown NPC id: ${npcId}` })
      return
    }
    const intent = readIntent(req.body)
    if (intent === null) {
      res.status(400).json({
        error: 'INVALID_INTENT',
        message: `intent must be one of: ${INTERACT_INTENTS.join(', ')}`,
      })
      return
    }

    const tick = input.runtime.getCurrentTick()
    const baseTrust =
      typeof profile.personality.trustBase === 'number'
        ? clampTrust(profile.personality.trustBase)
        : 50
    const existing = input.store.getRelation(claims.sub, npcId)
    const previousTrust = existing ? existing.trust : baseTrust
    const previousCount = existing ? existing.interactionCount : 0

    const trustAfter = applyTrustDelta(previousTrust, intent, profile)
    const tier = tierForRelationship(trustAfter)
    const rotationSeed = tick + Math.floor(trustAfter) + previousCount
    const line = pickLine(npcId, intent, tier, rotationSeed)

    const relation = input.store.upsertRelation({
      accountId: claims.sub,
      npcId,
      trust: trustAfter,
      interactionCount: previousCount + 1,
      lastInteractionTick: tick,
    })

    const personalEvent = input.store.appendPersonalEvent({
      accountId: claims.sub,
      npcId,
      intent,
      lineZh: line.zh,
      lineEn: line.en,
      tick,
      trustAfter: relation.trust,
    })

    res.json({
      npcId,
      intent,
      tick,
      line,
      relationship: {
        trust: relation.trust,
        previousTrust,
        delta: relation.trust - previousTrust,
        tier,
        interactionCount: relation.interactionCount,
        min: RELATIONSHIP_MIN,
        max: RELATIONSHIP_MAX,
      },
      personalEvent: {
        id: personalEvent.id,
        occurredAt: new Date(personalEvent.occurredAt).toISOString(),
        intent: personalEvent.intent,
      },
    })
  })

  router.get('/npc/:npcId/history', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    const npcId = String(req.params.npcId ?? '')
    const profile = input.runtime.findProfile(npcId)
    if (!profile) {
      res.status(404).json({ error: 'NPC_NOT_FOUND' })
      return
    }
    const limit = clampInt(req.query.limit, 1, HISTORY_MAX_LIMIT, HISTORY_DEFAULT_LIMIT)
    const rows = input.store.listPersonalEvents({
      accountId: claims.sub,
      npcId,
      limit,
    })
    const relation = input.store.getRelation(claims.sub, npcId)
    const baseTrust =
      typeof profile.personality.trustBase === 'number'
        ? clampTrust(profile.personality.trustBase)
        : 50
    const trust = relation ? relation.trust : baseTrust
    res.json({
      npcId,
      relationship: {
        trust,
        tier: tierForRelationship(trust),
        interactionCount: relation ? relation.interactionCount : 0,
        lastInteractionTick: relation ? relation.lastInteractionTick : 0,
        min: RELATIONSHIP_MIN,
        max: RELATIONSHIP_MAX,
        seeded: relation === null,
      },
      events: rows.map((row) => ({
        id: row.id,
        intent: row.intent,
        line: { zh: row.lineZh, en: row.lineEn },
        tick: row.tick,
        occurredAt: new Date(row.occurredAt).toISOString(),
        trustAfter: row.trustAfter,
      })),
    })
  })

  return router
}

function readIntent(body: unknown): InteractIntent | null {
  if (!body || typeof body !== 'object') return null
  const raw = (body as { intent?: unknown }).intent
  return isInteractIntent(raw) ? raw : null
}

function applyTrustDelta(
  previous: number,
  intent: InteractIntent,
  profile: { personality: Readonly<Record<string, number | string>> }
): number {
  let delta = TRUST_DELTAS[intent]
  if (intent === 'trade') {
    if (previous < 30) delta -= 1
    else if (previous >= 60) delta += 1
  }
  if (intent === 'leave') {
    delta -= 0
  }
  if (intent === 'greet') {
    const patience =
      typeof profile.personality.patience === 'number' ? profile.personality.patience : 0.5
    if (patience < 0.3) delta = 0
  }
  return clampTrust(previous + delta)
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
