// NpcAgentRunner — 把「每個 NPC 都是 AI agent」接上 tick 迴圈的排程器。
//
// 節奏：每個 NPC 以 NPC_AGENT_DECISION_INTERVAL_TICKS 為週期、由 npcId hash
// 錯相輪到一次。輪到時非阻塞地呼叫 AI（不佔 tick 路徑），AI 從 server 算
// 好的合法選項中選一個 → 包成 NPC_AGENT_DECISION command 走 Rule Engine。
//
// 失敗策略（integration-robustness）：AI 不可用 / 超時 / 解析失敗 → 本輪
// 靜默放棄，確定性 intent planner 照常運作；不重試（下個週期自然再來）。

import type { SettingsStore } from '../http/settings.js'
import type { NpcProfile } from './types.js'
import { generateWithProviders } from './aiProvider.js'
import { isOpenCodeConfigured } from './openCodeClient.js'
import {
  buildFreeformAgentPrompt,
  parseFreeformAgentProposal,
  resolveFreeformAgentProposal,
  type FreeformAgentResolution,
} from './npcAgent.js'
import type { IntentEntry } from '../sim/intentPlanner.js'
import { NPC_AGENT_DECISION_INTERVAL_TICKS } from '../config/world.js'

export type NpcAgentDeps = Readonly<{
  /** 只回傳活著、可決策的 NPC。 */
  listAgentNpcs: () => readonly NpcProfile[]
  getNpcTile: (npcId: string) => string | null
  /** server 端確定性 intent stack（合法選項來源）。 */
  computeIntentEntries: (npcId: string) => readonly IntentEntry[]
  getNeedsLine: (npcId: string) => string
  getLifeGoalContext: (npcId: string) => string
  getBeliefContext: (npcId: string) => string
  getReflectionContext: (npcId: string) => string
  submitDecision: (input: {
    profile: NpcProfile
    tile: string
    resolution: FreeformAgentResolution
    decidedAtTick: number
  }) => void
}>

export type NpcAgentDiagnostics = Readonly<{
  enabled: boolean
  configured: boolean
  inFlight: number
  dueCount: number
  skippedNoTile: number
  emptyIntentEntriesCount: number
  providerSuccessCount: number
  parseFailureCount: number
  submitCount: number
  errorCount: number
  lastAttempt: NpcAgentAttempt | null
  lastSuccess: NpcAgentAttempt | null
  lastError: NpcAgentAttempt | null
}>

export type NpcAgentAttempt = Readonly<{
  tick: number
  npcId: string
  status: 'success' | 'no_tile' | 'no_intent_entries' | 'parse_failed' | 'error'
  provider?: string
  action?: string
  accepted?: boolean
  reason?: string
}>

export class NpcAgentRunner {
  private readonly inFlight = new Set<string>()
  private dueCount = 0
  private skippedNoTile = 0
  private emptyIntentEntriesCount = 0
  private providerSuccessCount = 0
  private parseFailureCount = 0
  private submitCount = 0
  private errorCount = 0
  private lastAttempt: NpcAgentAttempt | null = null
  private lastSuccess: NpcAgentAttempt | null = null
  private lastError: NpcAgentAttempt | null = null

  constructor(
    private readonly settings: SettingsStore,
    private readonly deps: NpcAgentDeps
  ) {}

  /** 每 tick 呼叫；只挑「這一 tick 輪到」的 NPC 非阻塞出題。 */
  tick(currentTick: number): void {
    if (!this.isEnabled()) return
    for (const profile of this.deps.listAgentNpcs()) {
      const phase = hashId(profile.id) % NPC_AGENT_DECISION_INTERVAL_TICKS
      if (currentTick % NPC_AGENT_DECISION_INTERVAL_TICKS !== phase) continue
      if (this.inFlight.has(profile.id)) continue
      this.dueCount += 1
      void this.deliberate(profile, currentTick)
    }
  }

  getDiagnostics(): NpcAgentDiagnostics {
    return {
      enabled: this.isEnabled(),
      configured: isOpenCodeConfigured(this.settings) || this.settings.countActive() > 0,
      inFlight: this.inFlight.size,
      dueCount: this.dueCount,
      skippedNoTile: this.skippedNoTile,
      emptyIntentEntriesCount: this.emptyIntentEntriesCount,
      providerSuccessCount: this.providerSuccessCount,
      parseFailureCount: this.parseFailureCount,
      submitCount: this.submitCount,
      errorCount: this.errorCount,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
    }
  }

  private isEnabled(): boolean {
    if (this.settings.getSetting('npc_agent_enabled') === 'false') return false
    return isOpenCodeConfigured(this.settings) || this.settings.countActive() > 0
  }

  private async deliberate(profile: NpcProfile, decidedAtTick: number): Promise<void> {
    this.inFlight.add(profile.id)
    try {
      const tile = this.deps.getNpcTile(profile.id)
      if (!tile) {
        this.skippedNoTile += 1
        this.lastAttempt = { tick: decidedAtTick, npcId: profile.id, status: 'no_tile' }
        return
      }
      const entries = this.deps.computeIntentEntries(profile.id)
      if (entries.length === 0) {
        this.emptyIntentEntriesCount += 1
      }

      const { systemPrompt, userPrompt } = buildFreeformAgentPrompt({
        profile,
        currentTile: tile,
        needsLine: this.deps.getNeedsLine(profile.id),
        lifeGoalContext: this.deps.getLifeGoalContext(profile.id),
        beliefContext: this.deps.getBeliefContext(profile.id),
        reflectionContext: this.deps.getReflectionContext(profile.id),
        worldTick: decidedAtTick,
      })

      const result = await generateWithProviders(this.settings, {
        systemPrompt,
        userPrompt,
        temperature: 0.8,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        thinkingBudget: 0,
      })
      this.providerSuccessCount += 1
      const proposal = parseFreeformAgentProposal(result.text)
      if (!proposal) {
        this.parseFailureCount += 1
        const attempt: NpcAgentAttempt = {
          tick: decidedAtTick,
          npcId: profile.id,
          status: 'parse_failed',
          provider: result.provider,
          reason: 'provider returned non-conforming freeform JSON',
        }
        this.lastAttempt = attempt
        this.lastError = attempt
        return
      }
      const livingNpcIds = new Set(this.deps.listAgentNpcs().map((p) => p.id))
      const resolution = resolveFreeformAgentProposal(proposal, {
        currentTile: tile,
        defaultTile: profile.defaultLocation,
        livingNpcIds,
        getNpcTile: this.deps.getNpcTile,
      })
      this.deps.submitDecision({
        profile,
        tile,
        resolution,
        decidedAtTick,
      })
      this.submitCount += 1
      const attempt: NpcAgentAttempt = {
        tick: decidedAtTick,
        npcId: profile.id,
        status: 'success',
        provider: result.provider,
        action: resolution.resolved.kind,
        accepted: resolution.accepted,
      }
      this.lastAttempt = attempt
      this.lastSuccess = attempt
    } catch (err) {
      // AI 不可用：本輪靜默放棄，確定性 planner 接手。
      this.errorCount += 1
      const attempt: NpcAgentAttempt = {
        tick: decidedAtTick,
        npcId: profile.id,
        status: 'error',
        reason: err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240),
      }
      this.lastAttempt = attempt
      this.lastError = attempt
    } finally {
      this.inFlight.delete(profile.id)
    }
  }
}

export function narrateFreeformAgentDecision(
  npcNameZh: string,
  resolution: FreeformAgentResolution,
): string {
  const utterance = resolution.proposal.utterance?.trim()
  if (resolution.accepted && utterance) return `${npcNameZh}喃喃自語：「${utterance}」`
  if (resolution.accepted) {
    return `${npcNameZh}照著自己的念頭決定${freeformActionLabel(resolution.resolved.kind)}。`
  }
  return `${npcNameZh}冒出一個念頭，但世界規則沒有讓它成行。`
}

function freeformActionLabel(kind: FreeformAgentResolution['resolved']['kind']): string {
  switch (kind) {
    case 'travel': return '換個地方走走'
    case 'work': return '找件事做'
    case 'build': return '動手修建或開新建案'
    case 'rest': return '先讓自己休息'
    case 'socialize': return '找人說話'
    case 'buy_card': return '追一張想要的紋卡'
    case 'challenge_combat': return '準備挑戰或威嚇對手'
    case 'spread_rumor': return '把消息放出去'
    case 'custom_social_scene': return '處理一段日常關係'
  }
}

function hashId(id: string): number {
  let hash = 5381
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0
  }
  return hash
}
