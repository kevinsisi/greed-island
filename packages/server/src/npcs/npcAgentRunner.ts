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
import {
  NPC_AGENT_DECISION_INTERVAL_TICKS,
  NPC_AGENT_MAX_DELIBERATIONS_PER_TICK,
  NPC_AGENT_MAX_RETRIES,
  NPC_AGENT_RETRY_BASE_DELAY_MS,
} from '../config/world.js'

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
  /** 每個 NPC 上次「被出題」的 tick（出題當下即記，非等成功）；staleness 排程用。 */
  private readonly lastDeliberatedTick = new Map<string, number>()
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

  /**
   * 每 tick 呼叫；以 staleness（最久沒思考者先）挑選合格 NPC 非阻塞出題，
   * 受全域每 tick 硬上限封頂（成本與 NPC 數量脫鉤）。
   */
  tick(currentTick: number): void {
    if (!this.isEnabled()) return
    const interval = this.intervalTicks()
    const maxPerTick = this.maxPerTick()
    if (maxPerTick <= 0) return

    // 合格 = 距上次出題 ≥ interval（從未出題 = 最合格）且非 in-flight。
    const eligible = this.deps
      .listAgentNpcs()
      .filter((p) => {
        if (this.inFlight.has(p.id)) return false
        const last = this.lastDeliberatedTick.get(p.id)
        return last === undefined || currentTick - last >= interval
      })
      // staleness 降序（從未出題 → +∞ 最優先）；同齡以 hashId 穩定 tie-break。
      .sort((a, b) => {
        const sa = staleness(this.lastDeliberatedTick.get(a.id), currentTick)
        const sb = staleness(this.lastDeliberatedTick.get(b.id), currentTick)
        if (sa !== sb) return sb - sa
        return hashId(a.id) - hashId(b.id)
      })

    for (const profile of eligible.slice(0, maxPerTick)) {
      // 出題當下即記，避免重試期間/同批內被重複選，並讓輪轉前進。
      this.lastDeliberatedTick.set(profile.id, currentTick)
      this.dueCount += 1
      void this.deliberate(profile, currentTick)
    }
  }

  /** settings 覆寫優先，缺值/非法回退常數預設。 */
  private intervalTicks(): number {
    return readPositiveIntSetting(this.settings, 'npc_agent_interval_ticks', NPC_AGENT_DECISION_INTERVAL_TICKS)
  }

  private maxPerTick(): number {
    return readPositiveIntSetting(this.settings, 'npc_agent_max_per_tick', NPC_AGENT_MAX_DELIBERATIONS_PER_TICK)
  }

  private maxRetries(): number {
    return readNonNegativeIntSetting(this.settings, 'npc_agent_max_retries', NPC_AGENT_MAX_RETRIES)
  }

  private retryBaseDelayMs(): number {
    return readNonNegativeIntSetting(this.settings, 'npc_agent_retry_base_ms', NPC_AGENT_RETRY_BASE_DELAY_MS)
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

      // 暫時性失敗（provider throw / 回傳無法解析的 JSON）指數退避重試；
      // 任一次嘗試成功即送出，全敗才表面化（不 throw 給 tick 路徑）。
      const maxRetries = this.maxRetries()
      let proposal: ReturnType<typeof parseFreeformAgentProposal> = null
      let lastProvider: string | undefined
      const parseFailReason = 'provider returned non-conforming freeform JSON'
      let lastErrorMessage: string | null = null
      for (let attemptNo = 0; attemptNo <= maxRetries; attemptNo += 1) {
        if (attemptNo > 0) await sleep(this.retryBaseDelayMs() * 2 ** (attemptNo - 1))
        try {
          const result = await generateWithProviders(this.settings, {
            systemPrompt,
            userPrompt,
            temperature: 0.8,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
            thinkingBudget: 0,
          })
          this.providerSuccessCount += 1
          lastProvider = result.provider
          lastErrorMessage = null
          const parsed = parseFreeformAgentProposal(result.text)
          if (parsed) {
            proposal = parsed
            break // 成功
          }
          // provider 有回應但格式不合 → 視為暫時性，退避重試
        } catch (err) {
          lastErrorMessage = err instanceof Error ? err.message : String(err)
          // 暫時性 provider 失敗 → 退避重試
        }
      }

      if (!proposal) {
        // 重試耗盡：依「最後一次是 provider 失敗還是 parse 失敗」記對應診斷。
        const status: NpcAgentAttempt['status'] = lastErrorMessage ? 'error' : 'parse_failed'
        if (status === 'error') this.errorCount += 1
        else this.parseFailureCount += 1
        const attempt: NpcAgentAttempt = {
          tick: decidedAtTick,
          npcId: profile.id,
          status,
          ...(lastProvider ? { provider: lastProvider } : {}),
          reason: lastErrorMessage ? lastErrorMessage.slice(0, 240) : parseFailReason,
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
        ...(lastProvider ? { provider: lastProvider } : {}),
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
    case 'buy_goods': return '購物採買物資'
    case 'learn': return '學習或拜師練習'
    case 'invent': return '發想實驗或原型'
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

/** 距上次出題的 tick 數；從未出題 → +∞（最優先輪轉）。 */
function staleness(lastTick: number | undefined, currentTick: number): number {
  return lastTick === undefined ? Number.POSITIVE_INFINITY : currentTick - lastTick
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readPositiveIntSetting(store: SettingsStore, key: string, fallback: number): number {
  const raw = store.getSetting(key)
  if (raw === null) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function readNonNegativeIntSetting(store: SettingsStore, key: string, fallback: number): number {
  const raw = store.getSetting(key)
  if (raw === null) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
