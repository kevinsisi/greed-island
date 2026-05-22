import type { Event } from '../kernel/types.js'
import type { IntentKind, NpcIntentResolvedCmd } from '../kernel/livingWorldCommands.js'
import { REFLECTION_DURATION_TICKS, MAX_REFLECTIONS_PER_NPC } from '../config/world.js'

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

export class IntentProjection {
  private readonly reflectionsByNpc = new Map<string, Reflection[]>()

  project(event: Event): void {
    if (event.eventType !== 'NPC_INTENT_RESOLVED') return

    const data = (event.payload as { data?: unknown } | null)?.data as NpcIntentResolvedCmd | undefined
    if (!data || typeof data !== 'object') return

    const { npcId, intentType, outcome, resolvedAtTick } = data
    if (!npcId || !intentType) return

    const isSuccess = outcome === 'success'
    const reflection: Reflection = {
      triggeringEventId: event.eventId,
      intentType,
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
}
