// LifeGoalsProjection — 每位 NPC 最近一次「公開立下的人生目標」
// (NPC_LIFE_GOAL_SET) 的投影。
//
// 來源事件由 runtime.planLifeGoalCommands 以 30-tick 節奏對壓力最高的
// NPC 發出（cityLife.deriveNpcLifeView 決定 goal kind / pressure）。這個
// 投影把「NPC 對世界承諾過的目標」變成可查詢狀態，供：
//   1. AI 對話注入（NPC 能談自己的人生目標 — 自主意識的表達層）
//   2. IntentPlanner 的 life-goal urgency 偏壓（目標回饋到行動層）
//
// 接線現況（v0.87.13 之後）：小 log boot 由 runtime.ts 的
// rebuildFromEvents(allEvents) 完整重建；大 log availability-first boot
// 「刻意不」深度補水本投影（v0.87.13 OOM 修復後只補 liveness 必需集），
// 對話注入靠 getFormattedLifeGoalContext 的 live-derive fallback 優雅降級。
// 若未來 materialized hydration 落地，boot event 集合就是 LIFE_GOALS_BOOT_EVENT_TYPES。

import type { Event } from '../kernel/types.js'

export const LIFE_GOALS_BOOT_EVENT_TYPES = ['NPC_LIFE_GOAL_SET'] as const

export type LifeGoalRow = Readonly<{
  npcId: string
  tile: string
  kind: string
  pressure: number
  narration: string
  needs: Readonly<Record<string, number>>
  setAtTick: number
  lastSequence: number
}>

export class LifeGoalsProjection {
  private latestByNpc = new Map<string, LifeGoalRow>()

  project(event: Event): void {
    if (event.eventType !== 'NPC_LIFE_GOAL_SET') return
    const data = (event.payload as { data?: unknown } | null)?.data as
      | Record<string, unknown>
      | undefined
    if (!data || typeof data !== 'object') return

    const npcId = data.npcId
    if (typeof npcId !== 'string' || npcId.length === 0) return
    const tile = typeof data.tile === 'string' ? data.tile : ''
    const goal = data.goal as Record<string, unknown> | undefined
    if (!goal || typeof goal !== 'object') return
    const kind = typeof goal.kind === 'string' ? goal.kind : ''
    if (kind.length === 0) return
    const pressure = typeof goal.pressure === 'number' && Number.isFinite(goal.pressure) ? goal.pressure : 0
    const narration = typeof goal.narration === 'string' ? goal.narration : ''
    const needsRaw = data.needs as Record<string, unknown> | undefined
    const needs: Record<string, number> = {}
    if (needsRaw && typeof needsRaw === 'object') {
      for (const [key, value] of Object.entries(needsRaw)) {
        if (typeof value === 'number' && Number.isFinite(value)) needs[key] = value
      }
    }

    const previous = this.latestByNpc.get(npcId)
    if (previous && previous.lastSequence >= event.sequence) return
    this.latestByNpc.set(npcId, {
      npcId,
      tile,
      kind,
      pressure,
      narration,
      needs,
      setAtTick: typeof event.tick === 'number' ? event.tick : 0,
      lastSequence: event.sequence,
    })
  }

  latestFor(npcId: string): LifeGoalRow | null {
    return this.latestByNpc.get(npcId) ?? null
  }

  list(): LifeGoalRow[] {
    return [...this.latestByNpc.values()].sort((a, b) => a.npcId.localeCompare(b.npcId))
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.latestByNpc = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }
}

const GOAL_KIND_LABELS: Readonly<Record<string, string>> = {
  eat: '先填飽肚子',
  rest: '好好休息',
  earn_money: '增加收入',
  secure_home: '改善住所',
  seek_safety: '尋求安全',
  form_family: '建立家庭',
  build_city: '投入城市建設',
  learn_skill: '累積知識與技能',
}

function lifeGoalKindLabel(kind: string): string {
  return GOAL_KIND_LABELS[kind] ?? kind
}

/**
 * 把最近一次人生目標格式化成對話 prompt 的 context block。
 * 回傳空字串表示沒有可注入的目標。
 */
export function formatLifeGoalContext(
  row: LifeGoalRow | null,
  currentTick: number,
  ticksPerDay: number
): string {
  if (!row) return ''
  const ageTicks = Math.max(0, currentTick - row.setAtTick)
  const ageDays = ticksPerDay > 0 ? Math.floor(ageTicks / ticksPerDay) : 0
  const ageText = ageDays <= 0 ? '最近' : `約 ${ageDays} 天前`
  const needsEntries = Object.entries(row.needs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key, value]) => `${needLabelZh(key)} ${Math.round(value)}`)
  const needsText = needsEntries.length > 0 ? `（最迫切的需求：${needsEntries.join('、')}）` : ''
  return [
    '### 你目前的人生目標（你自己立下的，不是別人指派的）',
    `  · ${ageText}，你把眼前生活目標定為：「${row.narration || lifeGoalKindLabel(row.kind)}」${needsText}`,
    `  · 目標方向：${lifeGoalKindLabel(row.kind)}；壓力指數 ${Math.round(row.pressure)} / 100`,
  ].join('\n')
}

function needLabelZh(key: string): string {
  switch (key) {
    case 'food': return '食物'
    case 'rest': return '休息'
    case 'money': return '金錢'
    case 'housing': return '住房'
    case 'safety': return '安全'
    default: return key
  }
}
