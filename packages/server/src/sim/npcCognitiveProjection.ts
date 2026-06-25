import type { Event } from '../kernel/types.js'
import type {
  NpcEvolutionLifeGoalKind,
  NpcPersonalityDeltaKey,
  NpcRelationshipEvolutionDimension,
} from './npcCognitiveEvolution.js'

export type NpcReflectionCommittedEventData = Readonly<{
  npcId: string
  committedAtTick: number
  sourceProposalTick: number
  source: 'ai_reflection' | 'deterministic_reflection'
  evidenceMemoryFragments: readonly string[]
  personalityDeltas: Readonly<Partial<Record<NpcPersonalityDeltaKey, number>>>
  lifeGoal: Readonly<{ kind: NpcEvolutionLifeGoalKind; pressure: number; narration: string }> | null
  relationshipDeltas: readonly Readonly<{
    targetNpcId: string
    dimension: NpcRelationshipEvolutionDimension
    delta: number
    reason: string
  }>[]
  summaryZh: string
  summaryEn: string
  narration: string | null
}>

export type NpcCognitiveProjectionState = Readonly<{
  npcId: string
  reflectionCount: number
  personalityDeltas: Readonly<Partial<Record<NpcPersonalityDeltaKey, number>>>
  currentLifeGoalOverride: Readonly<{ kind: NpcEvolutionLifeGoalKind; pressure: number; narration: string }> | null
  relationshipReflectionTrace: readonly Readonly<{
    targetNpcId: string
    dimension: NpcRelationshipEvolutionDimension
    delta: number
    reason: string
    tick: number
  }>[]
  lastReflectionTick: number | null
  lastReflectionSummaryZh: string | null
  lastReflectionSummaryEn: string | null
  evidenceMemoryFragments: readonly string[]
}>

export type NpcCognitiveProjection = ReadonlyMap<string, NpcCognitiveProjectionState>

export const NPC_COGNITIVE_PROJECTION_BOOT_EVENT_TYPES = ['NPC_REFLECTION_COMMITTED'] as const

export class NpcCognitiveProjectionStore {
  private states = new Map<string, NpcCognitiveProjectionState>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.states = new Map(rebuildNpcCognitiveProjection(events))
  }

  project(event: Event): void {
    if (event.eventType !== 'NPC_REFLECTION_COMMITTED') return
    const projected = rebuildNpcCognitiveProjection([event]).get(readNpcReflectionNpcId(event) ?? '')
    if (!projected) return
    const previous = this.states.get(projected.npcId)
    this.states.set(projected.npcId, mergeProjectedState(previous, projected))
  }

  get(npcId: string): NpcCognitiveProjectionState | null {
    return this.states.get(npcId) ?? null
  }

  list(): readonly NpcCognitiveProjectionState[] {
    return [...this.states.values()]
  }
}

export function rebuildNpcCognitiveProjection(events: readonly Event[]): NpcCognitiveProjection {
  const states = new Map<string, MutableNpcCognitiveProjectionState>()

  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.eventType !== 'NPC_REFLECTION_COMMITTED') continue
    if (!isEventPayloadWithData(event.payload)) continue
    const data = event.payload.data as NpcReflectionCommittedEventData
    if (typeof data.npcId !== 'string') continue
    const state = states.get(data.npcId) ?? createEmptyState(data.npcId)
    state.reflectionCount += 1
    state.lastReflectionTick = data.committedAtTick
    state.lastReflectionSummaryZh = data.summaryZh
    state.lastReflectionSummaryEn = data.summaryEn
    state.evidenceMemoryFragments = [...data.evidenceMemoryFragments]
    for (const [key, value] of Object.entries(data.personalityDeltas) as Array<[NpcPersonalityDeltaKey, number]>) {
      state.personalityDeltas[key] = round2((state.personalityDeltas[key] ?? 0) + value)
    }
    state.currentLifeGoalOverride = data.lifeGoal
    for (const delta of data.relationshipDeltas) {
      state.relationshipReflectionTrace.push({
        targetNpcId: delta.targetNpcId,
        dimension: delta.dimension,
        delta: round2(delta.delta),
        reason: delta.reason,
        tick: data.committedAtTick,
      })
    }
    states.set(data.npcId, state)
  }

  return new Map(
    [...states.entries()].map(([npcId, state]) => [npcId, freezeState(state)])
  )
}

type MutableNpcCognitiveProjectionState = {
  npcId: string
  reflectionCount: number
  personalityDeltas: Partial<Record<NpcPersonalityDeltaKey, number>>
  currentLifeGoalOverride: NpcCognitiveProjectionState['currentLifeGoalOverride']
  relationshipReflectionTrace: Array<NpcCognitiveProjectionState['relationshipReflectionTrace'][number]>
  lastReflectionTick: number | null
  lastReflectionSummaryZh: string | null
  lastReflectionSummaryEn: string | null
  evidenceMemoryFragments: string[]
}

function isEventPayloadWithData(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && 'data' in value
}

function readNpcReflectionNpcId(event: Event): string | null {
  if (!isEventPayloadWithData(event.payload)) return null
  const data = event.payload.data
  return typeof data === 'object' && data !== null && 'npcId' in data && typeof data.npcId === 'string'
    ? data.npcId
    : null
}

function mergeProjectedState(
  previous: NpcCognitiveProjectionState | undefined,
  projected: NpcCognitiveProjectionState
): NpcCognitiveProjectionState {
  if (!previous) return projected
  const personalityDeltas: Partial<Record<NpcPersonalityDeltaKey, number>> = { ...previous.personalityDeltas }
  for (const [key, value] of Object.entries(projected.personalityDeltas) as Array<[NpcPersonalityDeltaKey, number]>) {
    personalityDeltas[key] = round2((personalityDeltas[key] ?? 0) + value)
  }
  return {
    npcId: projected.npcId,
    reflectionCount: previous.reflectionCount + projected.reflectionCount,
    personalityDeltas,
    currentLifeGoalOverride: projected.currentLifeGoalOverride ?? previous.currentLifeGoalOverride,
    relationshipReflectionTrace: [...previous.relationshipReflectionTrace, ...projected.relationshipReflectionTrace],
    lastReflectionTick: projected.lastReflectionTick ?? previous.lastReflectionTick,
    lastReflectionSummaryZh: projected.lastReflectionSummaryZh ?? previous.lastReflectionSummaryZh,
    lastReflectionSummaryEn: projected.lastReflectionSummaryEn ?? previous.lastReflectionSummaryEn,
    evidenceMemoryFragments: projected.evidenceMemoryFragments.length > 0
      ? projected.evidenceMemoryFragments
      : previous.evidenceMemoryFragments,
  }
}

function createEmptyState(npcId: string): MutableNpcCognitiveProjectionState {
  return {
    npcId,
    reflectionCount: 0,
    personalityDeltas: {},
    currentLifeGoalOverride: null,
    relationshipReflectionTrace: [],
    lastReflectionTick: null,
    lastReflectionSummaryZh: null,
    lastReflectionSummaryEn: null,
    evidenceMemoryFragments: [],
  }
}

function freezeState(state: MutableNpcCognitiveProjectionState): NpcCognitiveProjectionState {
  return {
    npcId: state.npcId,
    reflectionCount: state.reflectionCount,
    personalityDeltas: { ...state.personalityDeltas },
    currentLifeGoalOverride: state.currentLifeGoalOverride,
    relationshipReflectionTrace: [...state.relationshipReflectionTrace],
    lastReflectionTick: state.lastReflectionTick,
    lastReflectionSummaryZh: state.lastReflectionSummaryZh,
    lastReflectionSummaryEn: state.lastReflectionSummaryEn,
    evidenceMemoryFragments: [...state.evidenceMemoryFragments],
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
