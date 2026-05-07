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
import { requireAuth, type AuthConfig } from './auth.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import type { SocialStore } from './socialStore.js'
import { CombatStore } from '../combat/combatStore.js'
import {
  evaluateCombatRound,
  type CombatActorTraits,
} from '../combat/ruleEngine.js'
import { COMBAT_INITIAL_HP, COMBAT_NPC_INCAP_TICKS } from '../combat/commands.js'
import {
  makeLivingWorldCommand,
  type LivingWorldActorType,
} from '../kernel/livingWorldCommands.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'

export function createCombatRouter(input: {
  db: import('better-sqlite3').Database
  runtime: SimulationRuntime
  jobs: PlayerJobsStore
  social: SocialStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)
  const store = new CombatStore(input.db)

  router.get('/combat/active', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const session = store.getActiveSessionForPlayer(accountId)
    if (!session) {
      res.json({ active: null })
      return
    }
    res.json({ active: toClientSession(session), log: store.listLog(session.combat_id) })
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
    res.json({ session: toClientSession(session), log: store.listLog(combatId) })
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
    const session = store.createSession({
      combatId,
      playerAccountId: accountId,
      npcId: targetNpcId,
      tileId: playerLoc.tile_id,
      startedTick: currentTick,
      playerHp: COMBAT_INITIAL_HP,
      npcHp: COMBAT_INITIAL_HP,
    })

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
    input.runtime.submitLivingWorldCommand(command)

    store.appendLog({
      combatId,
      tick: currentTick,
      combatRound: 0,
      eventType: 'COMBAT_INITIATE',
      payload: {
        playerAccountId: accountId,
        npcId: targetNpcId,
        tile: playerLoc.tile_id,
        playerHp: COMBAT_INITIAL_HP,
        npcHp: COMBAT_INITIAL_HP,
      },
    })

    res.json({ session: toClientSession(session), log: store.listLog(combatId) })
  })

  router.post('/combat/:id/action', auth, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const combatId = req.params.id ?? ''
    const body = (req.body ?? {}) as { action?: unknown; cardId?: unknown }

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

    const profile = input.runtime.findProfile(session.npc_id)
    if (!profile) {
      res.status(404).json({ error: 'NPC_NOT_FOUND' })
      return
    }
    const npcs = input.runtime.getNpcs()
    const npcSummary = npcs.find((n) => n.id === session.npc_id)
    if (!npcSummary) {
      res.status(404).json({ error: 'NPC_NOT_FOUND' })
      return
    }

    const playerHealth = 80 // 玩家固定值（沒有 mood/health 系統就先用 80）
    const npcHealth = Math.max(20, Math.min(100, npcSummary.health ?? 80))

    const playerTraits: CombatActorTraits & { actorId: string } = {
      actorId: String(accountId),
      // patience/greed 給玩家固定中性值；之後若導入 player profile 可改
      patience: 0.5,
      greed: 0.5,
      health: playerHealth,
    }
    const npcTraits: CombatActorTraits & { actorId: string } = {
      actorId: session.npc_id,
      patience: parseTrait(profile.personality.patience),
      greed: parseTrait(profile.personality.greed),
      health: npcHealth,
    }

    const nextRound = session.combat_round + 1
    const cardIdInput = typeof body.cardId === 'number' ? body.cardId : undefined

    const result = evaluateCombatRound({
      combatId,
      combatRound: nextRound,
      playerHp: session.player_hp,
      npcHp: session.npc_hp,
      playerAction: action,
      ...(cardIdInput !== undefined ? { playerCardId: cardIdInput } : {}),
      player: playerTraits,
      npc: npcTraits,
    })

    const currentTick = input.runtime.getCurrentTick()

    // Append log + EventLog event for each rule engine output
    for (const ev of result.events) {
      store.appendLog({
        combatId,
        tick: currentTick,
        combatRound: nextRound,
        eventType: ev.eventType,
        payload: ev.payload,
      })
    }

    // 1) Submit COMBAT_PLAYER_ACTION via LivingWorld pipeline (architecture compliance)
    const playerActionNarration = `玩家選擇 ${action}（回合 ${nextRound}）。`
    const playerCmd = makeLivingWorldCommand(
      'COMBAT_PLAYER_ACTION',
      String(accountId),
      'player' as LivingWorldActorType,
      currentTick,
      Date.now(),
      {
        combatId,
        playerAccountId: String(accountId),
        npcId: session.npc_id,
        combatRound: nextRound,
        action,
        ...(cardIdInput !== undefined ? { cardId: cardIdInput } : {}),
        narration: playerActionNarration,
      }
    )
    input.runtime.submitLivingWorldCommand(playerCmd)

    // 2) Update session state
    const resolvedTick = result.resolved ? currentTick : null
    const updatedSession = store.updateAfterRound({
      combatId,
      nextRound,
      playerHp: result.playerHpAfter,
      npcHp: result.npcHpAfter,
      resolved: result.resolved
        ? { outcome: result.resolved.outcome, tick: currentTick }
        : null,
    })

    // 3) If resolved, emit COMBAT_RESOLVE LivingWorld command + side-effects
    if (result.resolved) {
      const resolveNarration = `戰鬥結束：${result.resolved.outcome}（${nextRound} 回合）。`
      const resolveCmd = makeLivingWorldCommand(
        'COMBAT_RESOLVE',
        String(accountId),
        'player' as LivingWorldActorType,
        currentTick,
        Date.now(),
        {
          combatId,
          playerAccountId: String(accountId),
          npcId: session.npc_id,
          outcome: result.resolved.outcome,
          durationRounds: nextRound,
          finalPlayerHp: result.playerHpAfter,
          finalNpcHp: result.npcHpAfter,
          playerEnergyToZero: result.resolved.playerEnergyToZero,
          npcIncapacitatedTicks: result.resolved.npcIncapacitatedTicks,
          narration: resolveNarration,
        }
      )
      input.runtime.submitLivingWorldCommand(resolveCmd)

      // 玩家敗北 → energy=0
      if (result.resolved.playerEnergyToZero) {
        input.jobs.setEnergy(accountId, 0)
      }
      // NPC 敗北 → 倒地 incap N ticks
      if (result.resolved.npcIncapacitatedTicks > 0) {
        store.incapacitateNpc(
          session.npc_id,
          currentTick + result.resolved.npcIncapacitatedTicks
        )
      }
    }

    res.json({
      session: toClientSession(updatedSession),
      events: result.events,
      resolved: result.resolved,
      log: store.listLog(combatId),
    })
  })

  return router
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
  }
}

function parseTrait(v: number | string | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(1, v))
  return 0.5
}
