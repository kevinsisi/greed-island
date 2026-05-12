import type { NpcProfile } from '../npcs/types.js'
import type { AreaState } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'

export const LIFE_EXPANSION_FACT_KEY = 'world.lifeExpansion'
export const SALT_MARSH_PROJECT_ID = 'project.salt_marsh_settlement'
export const SALT_MARSH_TILE_ID = 't_salt_marsh'
export const SALT_MARSH_BUILDING_ID = 'b_salt_marsh_field_station'
export const SALT_MARSH_PROJECT_TARGET = 12

export type NpcLifeNeedKey = 'food' | 'rest' | 'money' | 'housing' | 'safety'
export type NpcLifeGoalKind =
  | 'eat'
  | 'rest'
  | 'earn_money'
  | 'secure_home'
  | 'seek_safety'
  | 'form_family'
  | 'build_city'
  | 'learn_skill'

export type NpcLifeView = Readonly<{
  needs: Readonly<Record<NpcLifeNeedKey, number>>
  goal: Readonly<{
    kind: NpcLifeGoalKind
    pressure: number
    narration: string
  }>
  householdId: string | null
}>

export type HouseholdRecord = Readonly<{
  householdId: string
  partnerNpcIds: readonly [string, string]
  homeTileId: string
  formedAtTick: number
  childIds: readonly string[]
}>

export type ChildRecord = Readonly<{
  childId: string
  householdId: string
  nameZh: string
  nameEn: string
  bornAtTick: number
}>

export type ConstructionProjectRecord = Readonly<{
  projectId: string
  kind: 'settlement'
  targetTileId: string
  buildingId: string
  progress: number
  targetProgress: number
  startedAtTick: number
  completedAtTick: number | null
}>

export type LifeExpansionState = Readonly<{
  households: Record<string, HouseholdRecord>
  children: Record<string, ChildRecord>
  constructionProjects: Record<string, ConstructionProjectRecord>
  unlockedTileIds: readonly string[]
  unlockedBuildingIds: readonly string[]
}>

export function createInitialLifeExpansionState(): LifeExpansionState {
  return {
    households: {},
    children: {},
    constructionProjects: {},
    unlockedTileIds: [],
    unlockedBuildingIds: []
  }
}

export function hydrateLifeExpansionState(raw: unknown): LifeExpansionState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createInitialLifeExpansionState()
  const r = raw as Partial<LifeExpansionState>
  const households: Record<string, HouseholdRecord> = {}
  if (r.households && typeof r.households === 'object') {
    for (const [id, value] of Object.entries(r.households)) {
      if (!value || typeof value !== 'object') continue
      const h = value as Partial<HouseholdRecord>
      if (
        typeof h.householdId === 'string' &&
        Array.isArray(h.partnerNpcIds) &&
        h.partnerNpcIds.length === 2 &&
        typeof h.partnerNpcIds[0] === 'string' &&
        typeof h.partnerNpcIds[1] === 'string' &&
        typeof h.homeTileId === 'string' &&
        typeof h.formedAtTick === 'number'
      ) {
        households[id] = {
          householdId: h.householdId,
          partnerNpcIds: [h.partnerNpcIds[0], h.partnerNpcIds[1]],
          homeTileId: h.homeTileId,
          formedAtTick: h.formedAtTick,
          childIds: Array.isArray(h.childIds) ? h.childIds.filter((v): v is string => typeof v === 'string') : []
        }
      }
    }
  }

  const children: Record<string, ChildRecord> = {}
  if (r.children && typeof r.children === 'object') {
    for (const [id, value] of Object.entries(r.children)) {
      if (!value || typeof value !== 'object') continue
      const c = value as Partial<ChildRecord>
      if (
        typeof c.childId === 'string' &&
        typeof c.householdId === 'string' &&
        typeof c.nameZh === 'string' &&
        typeof c.nameEn === 'string' &&
        typeof c.bornAtTick === 'number'
      ) {
        children[id] = {
          childId: c.childId,
          householdId: c.householdId,
          nameZh: c.nameZh,
          nameEn: c.nameEn,
          bornAtTick: c.bornAtTick
        }
      }
    }
  }

  const constructionProjects: Record<string, ConstructionProjectRecord> = {}
  if (r.constructionProjects && typeof r.constructionProjects === 'object') {
    for (const [id, value] of Object.entries(r.constructionProjects)) {
      if (!value || typeof value !== 'object') continue
      const p = value as Partial<ConstructionProjectRecord>
      if (
        typeof p.projectId === 'string' &&
        p.kind === 'settlement' &&
        typeof p.targetTileId === 'string' &&
        typeof p.buildingId === 'string' &&
        typeof p.progress === 'number' &&
        typeof p.targetProgress === 'number' &&
        typeof p.startedAtTick === 'number'
      ) {
        constructionProjects[id] = {
          projectId: p.projectId,
          kind: 'settlement',
          targetTileId: p.targetTileId,
          buildingId: p.buildingId,
          progress: p.progress,
          targetProgress: p.targetProgress,
          startedAtTick: p.startedAtTick,
          completedAtTick: typeof p.completedAtTick === 'number' ? p.completedAtTick : null
        }
      }
    }
  }

  return {
    households,
    children,
    constructionProjects,
    unlockedTileIds: Array.isArray(r.unlockedTileIds)
      ? [...new Set(r.unlockedTileIds.filter((v): v is string => typeof v === 'string'))]
      : [],
    unlockedBuildingIds: Array.isArray(r.unlockedBuildingIds)
      ? [...new Set(r.unlockedBuildingIds.filter((v): v is string => typeof v === 'string'))]
      : []
  }
}

export function deriveNpcLifeView(input: {
  profile: NpcProfile
  state: NpcRuntimeState
  areaState: AreaState | null
  lifeExpansion: LifeExpansionState
  tick: number
}): NpcLifeView {
  const householdId = householdIdForNpc(input.lifeExpansion, input.profile.id)
  const h = hashStr(input.profile.id)
  const areaSafety = input.areaState?.resources.safety ?? 65
  const areaEconomy = input.areaState?.resources.economy ?? 60
  const food = clampNeed(input.state.activity === 'eat' ? 12 : 28 + ((input.tick + h) % 44))
  const rest = clampNeed(input.state.activity === 'sleep' ? 10 : 24 + ((input.tick * 3 + h) % 52))
  const money = clampNeed(input.state.activity === 'trade' || input.state.activity === 'work' ? 24 : 46 + (70 - areaEconomy) * 0.45)
  const housing = clampNeed(householdId ? 18 : 35 + ((h >>> 4) % 35))
  const safety = clampNeed(Math.max(10, 82 - areaSafety))
  const needs = { food, rest, money, housing, safety }
  const goal = pickGoal(input.profile, needs, householdId)
  return { needs, goal, householdId }
}

export function householdIdForNpc(state: LifeExpansionState, npcId: string): string | null {
  for (const household of Object.values(state.households)) {
    if (household.partnerNpcIds.includes(npcId)) return household.householdId
  }
  return null
}

export function withConstructionProgress(
  state: LifeExpansionState,
  input: { tick: number; delta: number }
): LifeExpansionState {
  const before = state.constructionProjects[SALT_MARSH_PROJECT_ID] ?? {
    projectId: SALT_MARSH_PROJECT_ID,
    kind: 'settlement' as const,
    targetTileId: SALT_MARSH_TILE_ID,
    buildingId: SALT_MARSH_BUILDING_ID,
    progress: 0,
    targetProgress: SALT_MARSH_PROJECT_TARGET,
    startedAtTick: input.tick,
    completedAtTick: null
  }
  const progress = Math.min(before.targetProgress, before.progress + Math.max(1, Math.floor(input.delta)))
  return {
    ...state,
    constructionProjects: {
      ...state.constructionProjects,
      [SALT_MARSH_PROJECT_ID]: {
        ...before,
        progress,
        completedAtTick: progress >= before.targetProgress ? input.tick : before.completedAtTick
      }
    }
  }
}

export function withUnlockedExpansion(state: LifeExpansionState): LifeExpansionState {
  return {
    ...state,
    unlockedTileIds: addUnique(state.unlockedTileIds, SALT_MARSH_TILE_ID),
    unlockedBuildingIds: addUnique(state.unlockedBuildingIds, SALT_MARSH_BUILDING_ID)
  }
}

export function withHouseholdFormed(
  state: LifeExpansionState,
  input: { householdId: string; partnerNpcIds: readonly [string, string]; homeTileId: string; tick: number }
): LifeExpansionState {
  if (state.households[input.householdId]) return state
  return {
    ...state,
    households: {
      ...state.households,
      [input.householdId]: {
        householdId: input.householdId,
        partnerNpcIds: input.partnerNpcIds,
        homeTileId: input.homeTileId,
        formedAtTick: input.tick,
        childIds: []
      }
    }
  }
}

export function withChildBorn(
  state: LifeExpansionState,
  input: { householdId: string; childId: string; nameZh: string; nameEn: string; tick: number }
): LifeExpansionState {
  const household = state.households[input.householdId]
  if (!household || state.children[input.childId]) return state
  return {
    ...state,
    children: {
      ...state.children,
      [input.childId]: {
        childId: input.childId,
        householdId: input.householdId,
        nameZh: input.nameZh,
        nameEn: input.nameEn,
        bornAtTick: input.tick
      }
    },
    households: {
      ...state.households,
      [input.householdId]: {
        ...household,
        childIds: addUnique(household.childIds, input.childId)
      }
    }
  }
}

function pickGoal(
  profile: NpcProfile,
  needs: Readonly<Record<NpcLifeNeedKey, number>>,
  householdId: string | null
): NpcLifeView['goal'] {
  const role = `${profile.role.zh} ${profile.role.en}`.toLowerCase()
  let kind: NpcLifeGoalKind = 'build_city'
  let pressure = needs.housing
  if (needs.food > pressure) [kind, pressure] = ['eat', needs.food]
  if (needs.rest > pressure) [kind, pressure] = ['rest', needs.rest]
  if (needs.money > pressure) [kind, pressure] = ['earn_money', needs.money]
  if (needs.safety > pressure) [kind, pressure] = ['seek_safety', needs.safety]
  if (!householdId && needs.housing < 55 && needs.safety < 45 && needs.money < 65) {
    kind = 'form_family'
    pressure = 64
  }
  if (/(學|研究|書|scribe|reader|library|herbal)/i.test(role) && pressure < 70) {
    kind = 'learn_skill'
    pressure = 58
  }
  if (/(匠|工|修|smith|craft|foreman|mender)/i.test(role) && pressure < 72) {
    kind = 'build_city'
    pressure = 66
  }
  return { kind, pressure: Math.round(pressure), narration: goalNarration(kind) }
}

function goalNarration(kind: NpcLifeGoalKind): string {
  switch (kind) {
    case 'eat': return '先找食物，避免體力被日常耗空。'
    case 'rest': return '找地方休息，明天才能繼續工作。'
    case 'earn_money': return '增加收入，讓生活不被物價追著跑。'
    case 'secure_home': return '改善住所，讓自己有穩定落腳處。'
    case 'seek_safety': return '遠離危險，或讓所在街區更安全。'
    case 'form_family': return '建立穩定家庭，讓生活有牽掛與未來。'
    case 'learn_skill': return '累積知識與技能，替下一步生活開路。'
    case 'build_city':
    default:
      return '投入建設，讓城市真的多出可用空間。'
  }
}

function addUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value]
}

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function hashStr(value: string): number {
  let h = 2166136261 >>> 0
  for (const ch of value) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}
