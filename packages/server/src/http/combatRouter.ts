// Combat HTTP API — Phase B (v0.15.0).
//
// 路由：
//   POST /api/combat/initiate { targetNpcId }
//        → 開戰（玩家必須跟 NPC 同 tile）
//        → 同時 emit COMBAT_INITIATE event 進 LivingWorld EventLog
//   POST /api/combat/:id/action { action: 'attack'|'defend'|'flee', cardId? }
//        → 跑一回合，emit COMBAT_DAMAGE / COMBAT_DEFEND / COMBAT_FLEE / COMBAT_RESOLVE
//   GET  /api/combat/active
//        → 玩家目前是否有 active 戰鬥
//   GET  /api/combat/:id
//        → 取一場戰鬥的 snapshot + log
//
// 所有狀態改變都走 runtime.submitLivingWorldCommand() — 嚴格遵守
// ARCHITECTURE.md §1.1 命令-事件分離：HTTP 層只負責驗證 + 構造命令，
// 真正的 mutation 由 LivingWorldRuleEngine 編譯成 Event 寫進 EventLog；
// CombatStore 是 SQLite 投影（projection）。

import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import { requireAuth, type AuthConfig } from './auth.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import type { SocialStore } from './socialStore.js'
import { CombatStore } from '../combat/combatStore.js'
import { ANIMAL_COMBAT_AGGRESSION_THRESHOLD, COMBAT_INITIAL_HP, COMBAT_NPC_INCAP_TICKS } from '../combat/commands.js'
import { allowedClassesFor, computeHandLoadout, type HandCardView } from '../combat/handLoadout.js'
import { TechniqueShopStore } from '../cards/techniques.js'
import { getSpecies } from '../ecosystem/species.js'
import {
  makeLivingWorldCommand,
  type LivingWorldActorType,
} from '../kernel/livingWorldCommands.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'

export function createCombatRouter(input: {
  store: CombatStore
  runtime: SimulationRuntime
  jobs: PlayerJobsStore
  social: SocialStore
  authConfig: AuthConfig
  db: Database.Database
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)
  const store = input.store
  // v0.90.0 — 術式卡 ↔ 戰鬥手牌：手牌由玩家持有的戰鬥型術式卡決定
  // （天際百貨購買），基本牌 TIDE_STRIKE / MEND 人人都有。
  const techniques = new TechniqueShopStore(input.db)
  const handFor = (accountId: number): HandCardView[] =>
    computeHandLoadout(
      techniques.listOwned(accountId).filter((row) => row.count > 0).map((row) => row.card_id)
    )

  router.get('/combat/active', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const session = store.getActiveSessionForPlayer(accountId)
    if (!session) {
      res.json({ active: null })
      return
    }
    res.json({ active: toClientSession(session), log: store.listLog(session.combat_id), hand: handFor(accountId), usedCardClasses: [...usedCardClassesInCombat(store, session.combat_id)] })
  })

  router.get('/combat/:id', auth, (req: Request, res: Response) => {
    const combatId = req.params.id ?? ''
    const session = store.getSession(combatId)
    if (!session) {
      res.status(404).json({ error: 'COMBAT_NOT_FOUND' })
      return
    }
    if (session.player_account_id !== req.auth!.sub) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }
    res.json({ session: toClientSession(session), log: store.listLog(combatId), hand: handFor(req.auth!.sub), usedCardClasses: [...usedCardClassesInCombat(store, combatId)] })
  })

  router.post('/combat/initiate', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const body = (req.body ?? {}) as { targetNpcId?: unknown }
    const targetNpcId = typeof body.targetNpcId === 'string' ? body.targetNpcId : null
    if (!targetNpcId) {
      res.status(400).json({ error: 'TARGET_REQUIRED' })
      return
    }

    // 玩家不能同時打多場
    const existingActive = store.getActiveSessionForPlayer(accountId)
    if (existingActive) {
      res.status(409).json({ error: 'ALREADY_IN_COMBAT', combatId: existingActive.combat_id })
      return
    }

    const profile = input.runtime.findProfile(targetNpcId)
    if (!profile) {
      res.status(404).json({ error: 'NPC_NOT_FOUND' })
      return
    }
    const npcs = input.runtime.getNpcs()
    const npcSummary = npcs.find((n) => n.id === targetNpcId)
    if (!npcSummary) {
      res.status(404).json({ error: 'NPC_NOT_FOUND' })
      return
    }

    // 同 tile 才能戰鬥
    const playerLoc = input.social.getPlayerLocation(accountId)
    if (!playerLoc) {
      res.status(409).json({ error: 'PLAYER_LOCATION_UNKNOWN' })
      return
    }
    if (playerLoc.tile_id !== npcSummary.location) {
      res
        .status(409)
        .json({
          error: 'NOT_SAME_TILE',
          playerTile: playerLoc.tile_id,
          npcTile: npcSummary.location,
        })
      return
    }

    const currentTick = input.runtime.getCurrentTick()
    if (store.isNpcIncapacitated(targetNpcId, currentTick)) {
      res.status(409).json({ error: 'NPC_INCAPACITATED' })
      return
    }

    // 玩家 energy 0 不能挑戰
    const wallet = input.jobs.getWallet(accountId)
    if (wallet.energy <= 0) {
      res.status(409).json({ error: 'ENERGY_DEPLETED' })
      return
    }

    const combatId = `combat_${currentTick}_${accountId}_${targetNpcId}_${hashCanonicalJson({ accountId, targetNpcId, currentTick }).slice(0, 8)}`
    const narration = `${npcSummary.name.zh ?? targetNpcId} 對玩家 #${accountId} 起手。`
    const command = makeLivingWorldCommand(
      'COMBAT_INITIATE',
      String(accountId),
      'player' as LivingWorldActorType,
      currentTick,
      Date.now(),
      {
        combatId,
        playerAccountId: String(accountId),
        npcId: targetNpcId,
        tile: playerLoc.tile_id,
        playerCombatHp: COMBAT_INITIAL_HP,
        npcCombatHp: COMBAT_INITIAL_HP,
        reason: 'player_challenge',
        narration,
      }
    )

    const committed = input.runtime.submitLivingWorldCommand(command)
    if (!committed) {
      res.status(500).json({ error: 'COMBAT_INITIATE_REJECTED' })
      return
    }

    const session = store.getSession(combatId)
    if (!session) {
      res.status(500).json({ error: 'COMBAT_PROJECTION_MISSING' })
      return
    }

    res.json({ session: toClientSession(session), log: store.listLog(combatId), hand: handFor(accountId), usedCardClasses: [...usedCardClassesInCombat(store, combatId)] })
  })

  router.post('/combat/initiate-animal', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const body = (req.body ?? {}) as { targetAnimalId?: unknown; speciesId?: unknown }
    const targetAnimalId = typeof body.targetAnimalId === 'string' ? body.targetAnimalId : null
    const speciesId = typeof body.speciesId === 'string' ? body.speciesId : null
    if (!targetAnimalId || !speciesId) {
      res.status(400).json({ error: 'TARGET_ANIMAL_AND_SPECIES_REQUIRED' })
      return
    }

    const species = getSpecies(speciesId)
    if (!species) {
      res.status(404).json({ error: 'SPECIES_NOT_FOUND' })
      return
    }
    if (species.aggression < ANIMAL_COMBAT_AGGRESSION_THRESHOLD) {
      res.status(409).json({ error: 'ANIMAL_NOT_AGGRESSIVE', aggression: species.aggression })
      return
    }

    const existingActive = store.getActiveSessionForPlayer(accountId)
    if (existingActive) {
      res.status(409).json({ error: 'ALREADY_IN_COMBAT', combatId: existingActive.combat_id })
      return
    }

    const playerLoc = input.social.getPlayerLocation(accountId)
    if (!playerLoc) {
      res.status(409).json({ error: 'PLAYER_LOCATION_UNKNOWN' })
      return
    }

    // Verify the animal exists on the player's tile.
    const population = input.runtime.getAnimalPopulation()
    const animalRow = population.find(
      (r) => r.speciesId === speciesId && r.tileId === playerLoc.tile_id && r.animalIds.includes(targetAnimalId)
    )
    if (!animalRow) {
      res.status(404).json({ error: 'ANIMAL_NOT_FOUND_ON_TILE' })
      return
    }

    // Extinction protection: block combat if species count on tile ≤ 3.
    if (animalRow.count <= 3) {
      res.status(409).json({ error: 'SPECIES_NEAR_EXTINCTION', count: animalRow.count })
      return
    }

    const wallet = input.jobs.getWallet(accountId)
    if (wallet.energy <= 0) {
      res.status(409).json({ error: 'ENERGY_DEPLETED' })
      return
    }

    const currentTick = input.runtime.getCurrentTick()
    const combatId = `combat_${currentTick}_${accountId}_${targetAnimalId}_${hashCanonicalJson({ accountId, targetAnimalId, currentTick }).slice(0, 8)}`
    const narration = `玩家 #${accountId} 對 ${speciesId} 發起戰鬥。`
    const command = makeLivingWorldCommand(
      'COMBAT_INITIATE',
      String(accountId),
      'player' as LivingWorldActorType,
      currentTick,
      Date.now(),
      {
        combatId,
        playerAccountId: String(accountId),
        enemyType: 'animal',
        animalId: targetAnimalId,
        speciesId,
        tile: playerLoc.tile_id,
        playerCombatHp: COMBAT_INITIAL_HP,
        npcCombatHp: COMBAT_INITIAL_HP,
        reason: 'player_challenge',
        narration,
      }
    )

    const committed = input.runtime.submitLivingWorldCommand(command)
    if (!committed) {
      res.status(500).json({ error: 'COMBAT_INITIATE_REJECTED' })
      return
    }

    const session = store.getSession(combatId)
    if (!session) {
      res.status(500).json({ error: 'COMBAT_PROJECTION_MISSING' })
      return
    }

    res.json({ session: toClientSession(session), log: store.listLog(combatId), hand: handFor(accountId), usedCardClasses: [...usedCardClassesInCombat(store, combatId)] })
  })

  // ── Phase C endpoints ────────────────────────────────────────────────
  router.post('/combat/:id/play', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const combatId = req.params.id ?? ''
    const body = (req.body ?? {}) as { cardClass?: unknown; targetActorId?: unknown }

    const cardClass = typeof body.cardClass === 'string' && body.cardClass.length > 0 ? body.cardClass : null
    const targetActorId = typeof body.targetActorId === 'string' && body.targetActorId.length > 0 ? body.targetActorId : null
    if (!cardClass || !targetActorId) {
      res.status(400).json({ error: 'CARD_CLASS_AND_TARGET_REQUIRED' })
      return
    }

    const session = store.getSession(combatId)
    if (!session) {
      res.status(404).json({ error: 'COMBAT_NOT_FOUND' })
      return
    }
    if (session.player_account_id !== accountId) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }
    if (session.state !== 'active') {
      res.status(409).json({ error: 'COMBAT_RESOLVED' })
      return
    }

    // v0.90.0 — 只能施放自己持有的術式卡解鎖的戰鬥卡（+基本牌）。
    const allowed = allowedClassesFor(
      techniques.listOwned(accountId).filter((row) => row.count > 0).map((row) => row.card_id)
    )
    if (!allowed.has(cardClass as never)) {
      res.status(403).json({ error: 'CARD_NOT_OWNED', cardClass })
      return
    }

    const result = input.runtime.submitCombatCardPlay({ accountId, combatId, cardClass, targetActorId })
    if (!result) {
      res.status(409).json({ error: 'CARD_PLAY_REJECTED' })
      return
    }
    res.json({ accepted: true, commandId: result.commandId })
  })

  router.post('/combat/:id/cancel', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const combatId = req.params.id ?? ''
    const body = (req.body ?? {}) as { commandId?: unknown }

    const cancelCommandId = typeof body.commandId === 'string' && body.commandId.length > 0 ? body.commandId : null
    if (!cancelCommandId) {
      res.status(400).json({ error: 'COMMAND_ID_REQUIRED' })
      return
    }

    const session = store.getSession(combatId)
    if (!session) {
      res.status(404).json({ error: 'COMBAT_NOT_FOUND' })
      return
    }
    if (session.player_account_id !== accountId) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }

    const cancelled = input.runtime.submitCombatCardCancel({ accountId, combatId, cancelCommandId })
    res.json({ cancelled, commandId: cancelCommandId })
  })

  router.get('/combat/:id/snapshot', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const combatId = req.params.id ?? ''

    const session = store.getSession(combatId)
    if (!session) {
      res.status(404).json({ error: 'COMBAT_NOT_FOUND' })
      return
    }
    if (session.player_account_id !== accountId) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }

    const snapshot = input.runtime.getCombatSnapshot(combatId)
    if (!snapshot) {
      res.status(404).json({ error: 'SNAPSHOT_NOT_FOUND' })
      return
    }
    res.json(snapshot)
  })

  router.get('/combat/:id/stream', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const combatId = req.params.id ?? ''

    const session = store.getSession(combatId)
    if (!session) {
      res.status(404).json({ error: 'COMBAT_NOT_FOUND' })
      return
    }
    if (session.player_account_id !== accountId) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()
    res.write('retry: 5000\n\n')

    const snapshot = input.runtime.getCombatSnapshot(combatId)
    if (snapshot) sendCombatSseEvent(res, 'snapshot', snapshot)

    const unsubscribe = input.runtime.subscribeCombatEvents(combatId, (ev, tickDigest) => {
      sendCombatSseEvent(res, 'event', { eventType: ev.eventType, payload: ev.payload, tickDigest })
    })

    const keepalive = setInterval(() => { res.write(': keepalive\n\n') }, 25_000)

    const cleanup = () => {
      clearInterval(keepalive)
      unsubscribe()
      try { res.end() } catch { /* socket already closed */ }
    }

    req.on('close', cleanup)
    req.on('error', cleanup)
  })

  // ── Phase B（回合制：一般戰鬥 + v0.90.0 術式卡牌戰鬥） ───────────────
  router.post('/combat/:id/action', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const combatId = req.params.id ?? ''
    const body = (req.body ?? {}) as { action?: unknown; cardId?: unknown; cardClass?: unknown }

    const session = store.getSession(combatId)
    if (!session) {
      res.status(404).json({ error: 'COMBAT_NOT_FOUND' })
      return
    }
    if (session.player_account_id !== accountId) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return
    }
    if (session.state !== 'active') {
      res.status(409).json({ error: 'COMBAT_RESOLVED' })
      return
    }

    const action = body.action
    if (action !== 'attack' && action !== 'defend' && action !== 'flee') {
      res.status(400).json({ error: 'INVALID_ACTION' })
      return
    }

    // For NPC combats, verify the NPC still exists. Animal combats skip this check.
    if (session.enemy_type !== 'animal') {
      const profile = input.runtime.findProfile(session.npc_id)
      const npcSummary = input.runtime.getNpcs().find((n) => n.id === session.npc_id)
      if (!profile || !npcSummary) {
        res.status(404).json({ error: 'NPC_NOT_FOUND' })
        return
      }
    }

    const cardIdInput = typeof body.cardId === 'number' ? body.cardId : undefined

    // v0.90.0 — 術式卡施放：必須持有（天際百貨購買）且每場戰鬥每張限用一次
    //（HxH 一次性術式感）。已用過的卡從 combat_log 的 COMBAT_PLAYER_ACTION
    // payload.cardClass 判定 — log 是事件投影，replay 一致。
    const cardClassInput = typeof body.cardClass === 'string' && body.cardClass.length > 0
      ? body.cardClass
      : undefined
    if (cardClassInput !== undefined) {
      const allowed = allowedClassesFor(
        techniques.listOwned(accountId).filter((row) => row.count > 0).map((row) => row.card_id)
      )
      if (!allowed.has(cardClassInput as never)) {
        res.status(403).json({ error: 'CARD_NOT_OWNED', cardClass: cardClassInput })
        return
      }
      const usedClasses = usedCardClassesInCombat(store, combatId)
      if (usedClasses.has(cardClassInput)) {
        res.status(409).json({ error: 'CARD_ALREADY_USED', cardClass: cardClassInput })
        return
      }
    }

    const submitted = input.runtime.submitCombatRoundAction({
      accountId,
      combatId,
      action,
      ...(cardIdInput !== undefined ? { cardId: cardIdInput } : {}),
      ...(cardClassInput !== undefined ? { cardClass: cardClassInput } : {}),
    })
    if (!submitted) {
      res.status(500).json({ error: 'COMBAT_ACTION_REJECTED' })
      return
    }

    const { result, session: updatedSession } = submitted

    res.json({
      session: toClientSession(updatedSession),
      events: result.events,
      resolved: result.resolved,
      log: store.listLog(combatId),
    })
  })

  return router
}

function sendCombatSseEvent(res: import('express').Response, name: string, payload: unknown): void {
  res.write(`event: ${name}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/** v0.90.0 — 此戰鬥已施放過的術式卡類別（每場限用一次的依據）。 */
function usedCardClassesInCombat(store: CombatStore, combatId: string): Set<string> {
  const used = new Set<string>()
  for (const row of store.listLog(combatId)) {
    if (row.event_type !== 'COMBAT_PLAYER_ACTION') continue
    try {
      const payload = JSON.parse(row.payload_json) as { cardClass?: unknown }
      if (typeof payload.cardClass === 'string' && payload.cardClass.length > 0) {
        used.add(payload.cardClass)
      }
    } catch {
      // 壞 payload 跳過
    }
  }
  return used
}

function toClientSession(s: import('../combat/combatStore.js').CombatSessionRow) {
  return {
    combatId: s.combat_id,
    playerAccountId: s.player_account_id,
    npcId: s.npc_id,
    tileId: s.tile_id,
    startedTick: s.started_tick,
    playerHp: s.player_hp,
    npcHp: s.npc_hp,
    combatRound: s.combat_round,
    state: s.state,
    outcome: s.outcome,
    resolvedTick: s.resolved_tick,
    initialHp: COMBAT_INITIAL_HP,
    npcIncapTicks: COMBAT_NPC_INCAP_TICKS,
    enemyType: s.enemy_type,
    speciesId: s.species_id,
  }
}
