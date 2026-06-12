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

export class NpcAgentRunner {
  private readonly inFlight = new Set<string>()

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
      void this.deliberate(profile, currentTick)
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
      if (!tile) return
      const entries = this.deps.computeIntentEntries(profile.id)
      // 沒有任何壓力/目標脈絡時不浪費 AI 呼叫；freeform 仍需要一點真實世界刺激。
      if (entries.length === 0) return

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
      const proposal = parseFreeformAgentProposal(result.text)
      if (!proposal) return
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
    } catch {
      // AI 不可用：本輪靜默放棄，確定性 planner 接手。
    } finally {
      this.inFlight.delete(profile.id)
    }
  }
}

function hashId(id: string): number {
  let hash = 5381
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0
  }
  return hash
}
