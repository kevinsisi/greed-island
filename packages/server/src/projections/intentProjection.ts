import type { Event } from '../kernel/types.js'
import type { IntentKind } from '../kernel/livingWorldCommands.js'
import { REFLECTION_DURATION_TICKS, MAX_REFLECTIONS_PER_NPC, MAX_REFLECTION_CONTEXT_BULLETS } from '../config/world.js'

interface Reflection {
  triggeringEventId: string   // EventLog sequence number (event.eventId, a string)
  intentType: IntentKind
  emotionalImpact: number     // +10 (success) | -10 (failure)
  urgencyDelta: number        // +0.1 (success) | -0.1 (failure)
  startTick: number           // resolvedAtTick from the event
  durationTicks: number       // always REFLECTION_DURATION_TICKS
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const INTENT_LABELS: Record<IntentKind, { zh: string; action: string }> = {
  survival:  { zh: '生存',  action: '嘗試逃離危險地區' },
  economic:  { zh: '經濟',  action: '尋找物資' },
  social:    { zh: '社交',  action: '回避敵對勢力' },
  ecosystem: { zh: '生態',  action: '遠離環境惡化地區' },
}

export function formatReflectionContext(
  reflections: readonly Reflection[],
  currentTick: number,
): string {
  const active = reflections.filter(r => currentTick - r.startTick < r.durationTicks)
  if (active.length === 0) return ''
  const recent = active.slice(-MAX_REFLECTION_CONTEXT_BULLETS)
  const bullets = recent.map(r => {
    const label = INTENT_LABELS[r.intentType]
    const outcome = r.emotionalImpact > 0
      ? '→ 成功（你對自身判斷更有信心）'
      : '→ 失敗（你仍感到不安，下次更謹慎）'
    return `  · 【${label.zh}】${label.action} ${outcome}`
  })
  return [
    '### 你的近期行動記憶（意圖成敗形成的印象）',
    ...bullets,
  ].join('\n')
}

export class IntentProjection {
  private readonly reflectionsByNpc = new Map<string, Reflection[]>()

  project(event: Event): void {
    if (event.eventType !== 'NPC_INTENT_RESOLVED') return

    const data = (event.payload as { data?: unknown } | null)?.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') return

    const { npcId, intentType, outcome, resolvedAtTick } = data
    if (typeof npcId !== 'string' || !npcId) return
    if (typeof intentType !== 'string' || !intentType) return
    if (typeof resolvedAtTick !== 'number') return

    const isSuccess = outcome === 'success'
    const reflection: Reflection = {
      triggeringEventId: event.eventId,
      intentType: intentType as IntentKind,
      emotionalImpact: isSuccess ? 10 : -10,
      urgencyDelta: isSuccess ? 0.1 : -0.1,
      startTick: resolvedAtTick,
      durationTicks: REFLECTION_DURATION_TICKS,
    }

    let list = this.reflectionsByNpc.get(npcId)
    if (!list) {
      list = []
      this.reflectionsByNpc.set(npcId, list)
    }
    list.push(reflection)

    // Trim oldest first if over cap
    if (list.length > MAX_REFLECTIONS_PER_NPC) {
      list.splice(0, list.length - MAX_REFLECTIONS_PER_NPC)
    }
  }

  getLearningWeights(npcId: string, currentTick: number): Readonly<Partial<Record<IntentKind, number>>> {
    const list = this.reflectionsByNpc.get(npcId)
    if (!list || list.length === 0) return {}

    // Accumulate urgencyDelta per intentType for active reflections only
    const deltasByType = new Map<IntentKind, number>()
    for (const r of list) {
      const age = currentTick - r.startTick
      if (age >= r.durationTicks) continue  // expired

      const current = deltasByType.get(r.intentType) ?? 0
      deltasByType.set(r.intentType, current + r.urgencyDelta)
    }

    if (deltasByType.size === 0) return {}

    const result: Partial<Record<IntentKind, number>> = {}
    for (const [intentType, delta] of deltasByType) {
      result[intentType] = clamp(1.0 + delta, 0.5, 1.5)
    }
    return result
  }

  getReflections(npcId: string): readonly Reflection[] {
    return this.reflectionsByNpc.get(npcId) ?? []
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.reflectionsByNpc.clear()
    for (const ev of events) {
      this.project(ev)
    }
  }
}
