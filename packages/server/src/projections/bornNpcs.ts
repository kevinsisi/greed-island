// BornNpcsProjection — promotes children recorded via `NPC_CHILD_BORN` into
// runtime NPC entities once `NPC_MATURED` fires.
//
// Children remain abstract dependents inside `LifeExpansionState.households[].childIds`
// until the maturation planner emits `NPC_MATURED`. Then this projection synthesizes
// a complete `NpcProfile` (personality + role + routine all derived deterministically
// from the child's id) and exposes it through `listMaturedProfiles()`. The runtime
// hands every matured profile to `NpcEngine.registerDynamicNpc` so that cognitive
// runtime (belief / intent / memory / relationship) operates on the matured NPC
// identically to config-loaded NPCs.
//
// Closes WORLD_CAPABILITIES.md §43.1 verification path: descendants now exist as
// runtime entities capable of holding memories that reference their deceased
// ancestors.
//
// Spec: openspec/changes/born-npc-becomes-runtime-entity/specs/born-npc-maturation/spec.md

import type { NpcProfile, NpcRoutineSlot } from '../npcs/types.js'
import type { Event } from '../kernel/types.js'
import type { LivingWorldEventPayload, NpcMaturedCmd } from '../kernel/livingWorldCommands.js'
import { hashSeed } from '../combat/commands.js'
import { displayChildName } from '../data/npcChildNamePool.js'

export const BORN_NPC_BOOT_EVENT_TYPES = ['NPC_CHILD_BORN', 'NPC_MATURED'] as const

type BornCandidate = Readonly<{
  childId: string
  householdId: string
  nameZh: string
  nameEn: string
  bornAtTick: number
}>

type MaturedRecord = Readonly<{
  profile: NpcProfile
  parentNpcIds: readonly string[]
  bornAtTick: number
  maturedAtTick: number
  householdId: string
}>

const ARCHETYPE_POOL = ['commoner', 'craftsman', 'dreamer', 'hunter_apprentice'] as const
type Archetype = typeof ARCHETYPE_POOL[number]

const ROLE_BY_ARCHETYPE: Record<Archetype, { zh: string; en: string }> = {
  commoner: { zh: '街坊年輕人', en: 'young townsfolk' },
  craftsman: { zh: '學徒工匠', en: 'apprentice craftsman' },
  dreamer: { zh: '潮岸夢想家', en: 'tideshore dreamer' },
  hunter_apprentice: { zh: '見習獵手', en: 'apprentice hunter' },
}

const FACTION_POOL = ['tide_hunters', 'free_runners', 'guild', 'civilian'] as const

/**
 * Build a deterministic routine: morning at home tile, midday at central, evening at home.
 * Same shape for every matured NPC — they start as generic actors and acquire
 * distinct rhythms through cognitive runtime (intent/belief/memory) once they live.
 */
function defaultRoutine(homeTileId: string): readonly NpcRoutineSlot[] {
  return [
    { fromTickOfDay: 0, toTickOfDay: 6 * 720, location: homeTileId, label: 'sleep' },
    { fromTickOfDay: 6 * 720, toTickOfDay: 12 * 720, location: homeTileId, label: 'morning' },
    { fromTickOfDay: 12 * 720, toTickOfDay: 18 * 720, location: 't_central', label: 'midday' },
    { fromTickOfDay: 18 * 720, toTickOfDay: 24 * 720, location: homeTileId, label: 'evening' },
  ]
}

export class BornNpcsProjection {
  private candidates = new Map<string, BornCandidate>()
  private matured = new Map<string, MaturedRecord>()

  constructor(private readonly configProfileIds: ReadonlySet<string>) {}

  project(event: Event): void {
    if (event.eventType === 'NPC_CHILD_BORN') {
      const payload = readData<{
        childId?: unknown
        householdId?: unknown
        nameZh?: unknown
        nameEn?: unknown
      }>(event.payload)
      if (!payload) return
      const childId = typeof payload.childId === 'string' ? payload.childId : null
      const householdId = typeof payload.householdId === 'string' ? payload.householdId : null
      if (!childId || !householdId) return
      const nameZh = typeof payload.nameZh === 'string' ? payload.nameZh : ''
      const nameEn = typeof payload.nameEn === 'string' ? payload.nameEn : ''
      const bornAtTick = typeof event.tick === 'number' ? event.tick : 0
      this.candidates.set(childId, { childId, householdId, nameZh, nameEn, bornAtTick })
      return
    }
    if (event.eventType === 'NPC_MATURED') {
      const payload = readData<{
        npcId?: unknown
        maturedAtTick?: unknown
        bornAtTick?: unknown
        householdId?: unknown
        parentNpcIds?: unknown
        homeTileId?: unknown
        nameZh?: unknown
        nameEn?: unknown
      }>(event.payload)
      if (!payload) return
      const npcId = typeof payload.npcId === 'string' ? payload.npcId : null
      if (!npcId) return
      if (this.matured.has(npcId)) return // idempotent
      if (this.configProfileIds.has(npcId)) {
        throw new Error(`[BornNpcsProjection] matured npc id collides with config profile id: ${npcId}`)
      }
      const householdId = typeof payload.householdId === 'string' ? payload.householdId : ''
      const homeTileId = typeof payload.homeTileId === 'string' ? payload.homeTileId : 't_central'
      const rawNameZh = typeof payload.nameZh === 'string' ? payload.nameZh : npcId
      const rawNameEn = typeof payload.nameEn === 'string' ? payload.nameEn : npcId
      const bornAtTick = typeof payload.bornAtTick === 'number' ? payload.bornAtTick : 0
      const maturedAtTick = typeof payload.maturedAtTick === 'number' ? payload.maturedAtTick : 0
      const parentNpcIds = Array.isArray(payload.parentNpcIds)
        ? payload.parentNpcIds.filter((p): p is string => typeof p === 'string' && p.length > 0)
        : []
      const { nameZh, nameEn } = displayChildName({ childId: npcId, householdId, nameZh: rawNameZh, nameEn: rawNameEn })
      const profile = deriveProfile({ npcId, householdId, homeTileId, nameZh, nameEn })
      this.matured.set(npcId, {
        profile,
        parentNpcIds,
        bornAtTick,
        maturedAtTick,
        householdId,
      })
    }
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.candidates.clear()
    this.matured.clear()
    for (const ev of events) this.project(ev)
  }

  /** All matured born-NPC profiles, suitable for handing to NpcEngine.registerDynamicNpc. */
  listMaturedProfiles(): readonly NpcProfile[] {
    return Array.from(this.matured.values()).map((r) => r.profile)
  }

  getProfile(npcId: string): NpcProfile | null {
    return this.matured.get(npcId)?.profile ?? null
  }

  isMatured(npcId: string): boolean {
    return this.matured.has(npcId)
  }

  /** Parent NPC ids for a matured child; empty array for unknown/unmatured ids. */
  getParentNpcIds(npcId: string): readonly string[] {
    return this.matured.get(npcId)?.parentNpcIds ?? []
  }

  /** Born candidates that have not yet matured. Used by MaturationPlanner. */
  listCandidates(): readonly BornCandidate[] {
    return Array.from(this.candidates.values()).filter((c) => !this.matured.has(c.childId))
  }

  /** Lookup for a born candidate by id. */
  getCandidate(childId: string): BornCandidate | null {
    return this.candidates.get(childId) ?? null
  }

  /** Number of matured born-NPC profiles. */
  maturedCount(): number {
    return this.matured.size
  }
}

/**
 * Pure derivation of a runtime NpcProfile from the NPC_MATURED payload.
 * Personality, role, routine all hash-seeded from `npcId` for replay safety.
 */
export function deriveProfile(input: {
  npcId: string
  householdId: string
  homeTileId: string
  nameZh: string
  nameEn: string
}): NpcProfile {
  const { npcId, householdId, homeTileId, nameZh, nameEn } = input
  const archetype = ARCHETYPE_POOL[hashSeed(npcId, 'archetype') % ARCHETYPE_POOL.length]!
  const role = ROLE_BY_ARCHETYPE[archetype]
  const factionLean = FACTION_POOL[hashSeed(npcId, 'faction') % FACTION_POOL.length]!
  return {
    id: npcId,
    name: { zh: nameZh, en: nameEn },
    role: { zh: role.zh, en: role.en },
    defaultLocation: homeTileId,
    routine: defaultRoutine(homeTileId),
    triggers: [],
    memory: {
      consultsEventTypes: ['NPC_INTERACT', 'NPC_DECEASED', 'NPC_RUMOR_HEARD'],
      decayFn: 'linear',
      decayParam: 0.001,
    },
    personality: {
      archetype,
      patience: hashSeed(npcId, 'patience') % 100,
      greed: hashSeed(npcId, 'greed') % 100,
      trustBase: 40 + (hashSeed(npcId, 'trustBase') % 30), // 40..69
      talkativeness: hashSeed(npcId, 'talkativeness') % 100,
      factionLean,
      householdId,
    },
  }
}

function readData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const outer = payload as { data?: unknown }
  if (outer.data && typeof outer.data === 'object') return outer.data as T
  return payload as T
}

// Type re-export for downstream tests
export type { NpcMaturedCmd, LivingWorldEventPayload }
