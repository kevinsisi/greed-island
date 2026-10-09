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

import { Router, json, type Request, type Response } from 'express'
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
import { CanonicalGameplayAuthority, reauthorizeGameplayMutation, sendGameplayError } from './gameplayAuthority.js'
import { assertExpectedAccountContext } from '../identity/authRouter.js'
import { accountId } from '../identity/principal.js'
import { PlayerWorldError } from '../playerWorld/types.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'

export type ManagedCombatRouter = Router & { closeStreams(): void }
export function createCombatRouter(input: {
  store: CombatStore
  runtime: SimulationRuntime
  jobs: PlayerJobsStore
  social?: Pick<SocialStore, 'getPlayerLocation'>
  authority?: CanonicalGameplayAuthority
  techniques?: Pick<TechniqueShopStore, 'listOwned'>
  authConfig: AuthConfig
  db: Database.Database
}): ManagedCombatRouter {
  const router = Router() as ManagedCombatRouter
  const streams = new Set<() => void>(), accountStreamCounts = new Map<number, number>()
  let stopped = false
  router.closeStreams = () => { stopped = true; for (const close of [...streams]) close() }
  const auth = requireAuth(input.authConfig)
  const store = input.store
  // v0.90.0 — 術式卡 ↔ 戰鬥手牌：手牌由玩家持有的戰鬥型術式卡決定
  // （天際百貨購買），基本牌 TIDE_STRIKE / MEND 人人都有。
  const techniques = input.techniques ?? new TechniqueShopStore(input.db)
  const playerLocation = (id: number) => {
    if (!input.authority) return input.social?.getPlayerLocation(id) ?? null
    const position = input.authority.requirePosition(id)
    return { tile_id: position.tileId }
  }
  const spatial = (req: Request, res: Response, session?: import('../combat/combatStore.js').CombatSessionRow, allowFlee = false) => {
    if (!reauthorizeGameplayMutation(input.authConfig, req, res, req.auth!.sub)) return false
    if (!input.authority) return true
    try {
      const position = input.authority.requirePosition(req.auth!.sub)
      if (session && !allowFlee) {
        if (position.tileId !== session.tile_id) throw new PlayerWorldError(409, 'COMBAT_NOT_LOCAL', 'Combat is not in the canonical player region.')
        if (session.enemy_type !== 'animal') input.authority.requireNearbyNpc(req.auth!.sub, session.npc_id)
        else if (position.interior) throw Object.assign(new Error(), { code: 'BUILDING_EXIT_REQUIRED' })
      }
      return true
    } catch (error) { sendGameplayError(res, error); return false }
  }
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

    if (!spatial(req, res)) return
    if (input.authority) { try { input.authority.requireNearbyNpc(accountId, targetNpcId) } catch (error) { sendGameplayError(res, error); return } }
    // 同 tile 才能戰鬥
    let playerLoc
    try { playerLoc = playerLocation(accountId) } catch (error) { sendGameplayError(res, error); return }
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

    let playerLoc
    try { playerLoc = playerLocation(accountId) } catch (error) { sendGameplayError(res, error); return }
    if (!playerLoc) {
      res.status(409).json({ error: 'PLAYER_LOCATION_UNKNOWN' })
      return
    }

    if (!spatial(req, res)) return
    if (input.authority?.requirePosition(accountId).interior) { res.status(409).json({ error: 'BUILDING_EXIT_REQUIRED' }); return }
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

    if (!spatial(req, res, session)) return
    const snapshot = input.runtime.getCombatSnapshot(combatId)
    if (!snapshot?.actors.some(actor => actor.actorId === targetActorId) || !snapshot.actors.some(actor => actor.actorId === String(accountId))) {
      res.status(400).json({ error: 'TARGET_NOT_IN_COMBAT' }); return
    }
    // v0.90.0 — 只能施放自己持有的術式卡解鎖的戰鬥卡（+基本牌）。
    const allowed = allowedClassesFor(
      techniques.listOwned(accountId).filter((row) => row.count > 0).map((row) => row.card_id)
    )
    if (!allowed.has(cardClass as never)) {
      res.status(403).json({ error: 'CARD_NOT_OWNED', cardClass })
      return
    }

    const authorize = () => {
      const current = input.authConfig.reauthorizeMutation(req)
      if (current.sub !== accountId) throw Object.assign(new Error(), { code: 'ACCOUNT_CHANGED' })
      if (input.authority) {
        const currentPosition = input.authority.requirePosition(accountId), currentSession = store.getSession(combatId)
        if (!currentSession || currentSession.player_account_id !== accountId || currentSession.state !== 'active' || currentPosition.tileId !== currentSession.tile_id) throw new Error('Combat context changed.')
        if (currentSession.enemy_type !== 'animal') input.authority.requireNearbyNpc(accountId, currentSession.npc_id)
        else if (currentPosition.interior) throw new Error('Outdoor animal combat requires exterior admission.')
      }
      const owned = allowedClassesFor(techniques.listOwned(accountId).filter(row => row.count > 0).map(row => row.card_id))
      if (!owned.has(cardClass as never)) throw new Error('Combat card ownership changed.')
    }
    const result = input.runtime.submitCombatCardPlay({ accountId, combatId, cardClass, targetActorId, authorize })
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

    if (!spatial(req, res, session, true)) return
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

  router.get('/combat/:id/stream', (req: Request, res: Response) => {
    if (stopped) { res.status(503).json({ error: 'SERVER_CLOSING' }); return }
    let current
    try {
      current = input.authConfig.resolve(req)
      if (!current) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' })
      assertExpectedAccountContext(typeof req.query.expectedAccountId === 'string' ? req.query.expectedAccountId : undefined, { accountId: accountId(current.sub), role: current.role })
    } catch (error) { sendGameplayError(res, error); return }
    const account = current, combatId = req.params.id ?? '', session = store.getSession(combatId)
    if (!session) { res.status(404).json({ error: 'COMBAT_NOT_FOUND' }); return }
    if (session.player_account_id !== account.sub) { res.status(403).json({ error: 'FORBIDDEN' }); return }
    if (streams.size >= 200 || (accountStreamCounts.get(account.sub) ?? 0) >= 4) { res.status(429).json({ error: 'STREAM_LIMIT' }); return }
    const token = input.authConfig.token(req)
    let ended = false, unsubscribe = () => {}, unwatch = () => {}
    let keepalive: ReturnType<typeof setInterval> | undefined
    const cleanup = () => {
      if (ended) return; ended = true
      if (keepalive) clearInterval(keepalive)
      unsubscribe(); unwatch(); streams.delete(cleanup)
      const count = (accountStreamCounts.get(account.sub) ?? 1) - 1
      if (count) accountStreamCounts.set(account.sub, count); else accountStreamCounts.delete(account.sub)
      req.off('close', cleanup); req.off('error', cleanup); res.off('error', cleanup); res.end()
    }
    const valid = () => {
      const principal = input.authConfig.authService.resolve(token)
      if (!principal || principal.accountId !== account.sub || principal.role !== account.role || store.getSession(combatId)?.player_account_id !== account.sub) {
        if (!ended) { try { res.write('event: session.invalidated\ndata: {"error":"UNAUTHORIZED"}\n\n') } finally { cleanup() } }
        return false
      }
      return true
    }
    const write = (name: string, payload: unknown) => {
      if (ended || !valid()) return
      const frame = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`
      if (Buffer.byteLength(frame, 'utf8') > 128 * 1024 || !res.write(frame)) cleanup()
    }
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders?.()
    streams.add(cleanup); accountStreamCounts.set(account.sub, (accountStreamCounts.get(account.sub) ?? 0) + 1); req.on('close', cleanup); req.on('error', cleanup); res.on('error', cleanup)
    unsubscribe = input.runtime.subscribeCombatEvents(combatId, (ev, tickDigest) => write('event', { eventType: ev.eventType, payload: ev.payload, tickDigest }))
    unwatch = input.authConfig.authService.onRevoked(id => { if (id === account.sub) valid() })
    keepalive = setInterval(() => { if (!ended && valid() && !res.write(': keepalive\n\n')) cleanup() }, 5000)
    const snapshot = input.runtime.getCombatSnapshot(combatId); if (snapshot) write('snapshot', snapshot)
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

    if (!spatial(req, res, session, action === 'flee')) return
    // For NPC combats, verify the NPC still exists. Animal combats skip this check.
    if (session.enemy_type !== 'animal' && action !== 'flee') {
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


/** Reviewed normal composition accepts the one attached jobs/technique/runtime authority. */
export function createUnifiedCombatRouter(input: Omit<Parameters<typeof createCombatRouter>[0], 'social' | 'authority' | 'techniques'> & { techniques: Pick<TechniqueShopStore, 'listOwned'> }): ManagedCombatRouter {
  const router = Router() as ManagedCombatRouter
  router.use('/combat', json({ limit: 4096, strict: true }))
  router.use('/combat', (req, res, next) => {
    if (req.body !== undefined && Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 4096) { res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return }
    next()
  })
  const combat = createCombatRouter({ ...input, authority: new CanonicalGameplayAuthority(input.runtime) })
  router.use(combat); router.closeStreams = () => combat.closeStreams()
  return router
}
