import type { NpcProfile } from '../npcs/types.js'
import type { AreaState } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { DEFAULT_RULESET_VERSION } from '../kernel/types.js'

export const LIFE_EXPANSION_FACT_KEY = 'world.lifeExpansion'
export const SALT_MARSH_PROJECT_ID = 'project.salt_marsh_settlement'
export const SALT_MARSH_TILE_ID = 't_salt_marsh'
export const SALT_MARSH_BUILDING_ID = 'b_salt_marsh_field_station'
export const SALT_MARSH_PROJECT_TARGET = 12
export const CIV_EVO_CONSTRUCTION_DEMO_ECONOMY_THRESHOLD = 80
export const CIV_EVO_MAX_AUTONOMOUS_BUILDINGS_PER_TILE = 3
export const CIV_EVO_CONSTRUCTION_GOLD_COST = 24
export const CIV_EVO_CONSTRUCTION_DEMAND_THRESHOLD = 70
export const CIV_EVO_CONSTRUCTION_HIGH_ECONOMY_DEMAND_THRESHOLD = 85
export const NPC_PRODUCTIVE_XP_PER_DELTA = 5
export const NPC_PRODUCTIVE_SKILL_BONUS_XP_STEP = 25
export const NPC_PRODUCTIVE_SKILL_BONUS_MAX = 3
export const NPC_PRODUCTIVE_GOLD_BY_DOMAIN = {
  build: 1,
  learn: 0,
  trade: 3,
  service: 2
} as const

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

export type NpcProductiveDomain = 'build' | 'learn' | 'trade' | 'service'
export type NpcSkillKey = 'construction' | 'knowledge' | 'commerce' | 'civic'

export type NpcCivicRecord = Readonly<{
  npcId: string
  gold: number
  skillXp: Readonly<Record<NpcSkillKey, number>>
  lastProductiveTick: number | null
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
  // v0.15.42+ civ-evo-construction Slice 2: who autonomously initiated
  // this project. '' for system-driven legacy projects (e.g. the v0.15.x
  // salt-marsh settlement that predates §11.8).
  initiatedByNpcId: string
}>

export type LifeExpansionState = Readonly<{
  households: Record<string, HouseholdRecord>
  children: Record<string, ChildRecord>
  npcCivicRecords: Record<string, NpcCivicRecord>
  constructionProjects: Record<string, ConstructionProjectRecord>
  unlockedTileIds: readonly string[]
  unlockedBuildingIds: readonly string[]
}>

export function createInitialLifeExpansionState(): LifeExpansionState {
  return {
    households: {},
    children: {},
    npcCivicRecords: {},
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

  const npcCivicRecords: Record<string, NpcCivicRecord> = {}
  if (r.npcCivicRecords && typeof r.npcCivicRecords === 'object') {
    for (const [id, value] of Object.entries(r.npcCivicRecords)) {
      if (!value || typeof value !== 'object') continue
      const record = value as Partial<NpcCivicRecord>
      if (typeof record.npcId !== 'string') continue
      const skillXp = readSkillXp(record.skillXp)
      npcCivicRecords[id] = {
        npcId: record.npcId,
        gold: finiteNonNegative(record.gold) ?? 0,
        skillXp,
        lastProductiveTick: typeof record.lastProductiveTick === 'number' && Number.isFinite(record.lastProductiveTick)
          ? record.lastProductiveTick
          : null
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
          completedAtTick: typeof p.completedAtTick === 'number' ? p.completedAtTick : null,
          initiatedByNpcId: typeof p.initiatedByNpcId === 'string' ? p.initiatedByNpcId : ''
        }
      }
    }
  }

  return {
    households,
    children,
    npcCivicRecords,
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
  input: { tick: number; delta: number; projectId?: string }
): LifeExpansionState {
  const projectId = input.projectId ?? SALT_MARSH_PROJECT_ID
  const before = state.constructionProjects[projectId] ?? (projectId === SALT_MARSH_PROJECT_ID ? {
    projectId: SALT_MARSH_PROJECT_ID,
    kind: 'settlement' as const,
    targetTileId: SALT_MARSH_TILE_ID,
    buildingId: SALT_MARSH_BUILDING_ID,
    progress: 0,
    targetProgress: SALT_MARSH_PROJECT_TARGET,
    startedAtTick: input.tick,
    completedAtTick: null,
    initiatedByNpcId: ''
  } : null)
  if (!before) return state
  if (before.completedAtTick !== null) return state
  const progress = Math.min(before.targetProgress, before.progress + Math.max(1, Math.floor(input.delta)))
  return {
    ...state,
    constructionProjects: {
      ...state.constructionProjects,
      [projectId]: {
        ...before,
        progress,
        completedAtTick: progress >= before.targetProgress ? input.tick : null
      }
    }
  }
}

/**
 * civ-evo-construction Slice 2: deterministic project id for autonomously
 * NPC-initiated construction projects. Pure function of the command payload
 * + `startedAtTick` + ruleset version, so replay of the same EventLog yields
 * the same id byte-for-byte.
 *
 * Salt-marsh's legacy fixed id (`SALT_MARSH_PROJECT_ID`) is unchanged; this
 * helper is only used for the §11.8 autonomous construction pipeline.
 */
export function deriveConstructionInitiateProjectId(input: {
  npcId: string
  tileId: string
  buildingId: string
  startedAtTick: number
  rulesetVersion?: string
}): string {
  const seed = {
    scheme: 'civ-evo-construction.initiate',
    npcId: input.npcId,
    tileId: input.tileId,
    buildingId: input.buildingId,
    startedAtTick: input.startedAtTick,
    rulesetVersion: input.rulesetVersion ?? DEFAULT_RULESET_VERSION
  }
  // Short, URL-safe, deterministic; keeps the project key the same on
  // replay even if the SQLite row order changes.
  return `project.civ-evo.${hashCanonicalJson(seed).slice(0, 24)}`
}

/**
 * civ-evo-construction Slice 2: reducer for `CONSTRUCTION_INITIATE`. Adds
 * a fresh `ConstructionProjectRecord` carrying `initiatedByNpcId`.
 *
 * Idempotent: if the derived `projectId` already exists in state, returns
 * state unchanged so replaying the same EventLog never double-counts.
 */
export function withConstructionInitiated(
  state: LifeExpansionState,
  input: {
    npcId: string
    tileId: string
    buildingId: string
    duration: number
    tick: number
    goldCost?: number
    rulesetVersion?: string
  }
): LifeExpansionState {
  const projectId = deriveConstructionInitiateProjectId({
    npcId: input.npcId,
    tileId: input.tileId,
    buildingId: input.buildingId,
    startedAtTick: input.tick,
    // `exactOptionalPropertyTypes` mode: only forward rulesetVersion when
    // the caller actually set it.
    ...(input.rulesetVersion !== undefined ? { rulesetVersion: input.rulesetVersion } : {})
  })
  if (state.constructionProjects[projectId]) return state
  const goldCost = Math.max(0, Math.floor(input.goldCost ?? 0))
  const civicBefore = state.npcCivicRecords[input.npcId] ?? createNpcCivicRecord(input.npcId)
  if (civicBefore.gold < goldCost) return state
  return {
    ...state,
    npcCivicRecords: goldCost > 0
      ? {
        ...state.npcCivicRecords,
        [input.npcId]: {
          ...civicBefore,
          gold: civicBefore.gold - goldCost
        }
      }
      : state.npcCivicRecords,
    constructionProjects: {
      ...state.constructionProjects,
      [projectId]: {
        projectId,
        // Reusing the existing 'settlement' kind discriminator for the
        // §11.8 first slice; a per-kind progress path lands in a later
        // slice when production chains / settlement formation arrive.
        kind: 'settlement',
        targetTileId: input.tileId,
        buildingId: input.buildingId,
        progress: 0,
        targetProgress: Math.max(1, Math.floor(input.duration)),
        startedAtTick: input.tick,
        completedAtTick: null,
        initiatedByNpcId: input.npcId
      }
    }
  }
}

/**
 * civ-evo-construction Slice 3: deterministic decision whether an NPC
 * should submit a `CONSTRUCTION_INITIATE` command this tick.
 *
 * Pure function of `(npcId, tile, areaState, lifeExpansion, tick)` —
 * does not touch any actor state. Returns the command payload to emit,
 * or `null` if the policy says "skip this tick".
 *
 * Gating rules:
 *   1. Tile must NOT be the legacy salt-marsh expansion tile (its own
 *      progress engine still runs the salt-marsh fixed project).
 *   2. Tile economy changes the required demand threshold: low-economy
 *      tiles can start at the normal demand threshold, while healthy-economy
 *      tiles require severe demand instead of being permanently excluded.
 *   3. Same-tile-race: skip if any open civ-evo project already
 *      exists on this tile (first NPC wins; collaboration is future
 *      work). Salt-marsh's own settlement does NOT count.
 *   4. Anti-speculation cap: each tile may expose only a small number
 *      of autonomous completed/open facilities; history remains in the
 *      event log, but NPCs must stop opening endless same-tile projects.
 *   5. No double-bookkeeping: skip if this NPC already has an open
 *      civ-evo project anywhere.
 *   6. The builder must have real demand pressure and enough personal gold
 *      to pay the construction start cost.
 *
 * Building id is `b_civ_evo_${tile}` so the slice does not depend on
 * the building catalog — Slice 6 wires the projection to the frontend.
 * Duration is a fixed 24 ticks (~2 minutes) for v1; a per-building
 * or skill-derived model is one of the design.md Open Questions.
 */
export function decideCivEvoConstructionInitiate(input: {
  npcId: string
  tile: string
  areaState: { resources: { food: number; safety: number; economy: number } } | null
  lifeExpansion: LifeExpansionState
  constructionDemand: number
  availableGold: number
}): {
  npcId: string
  tileId: string
  buildingId: string
  duration: number
  goldCost: number
} | null {
  if (input.tile === SALT_MARSH_TILE_ID) return null
  const economy = input.areaState?.resources.economy ?? 100
  const requiredDemand = economy >= CIV_EVO_CONSTRUCTION_DEMO_ECONOMY_THRESHOLD
    ? CIV_EVO_CONSTRUCTION_HIGH_ECONOMY_DEMAND_THRESHOLD
    : CIV_EVO_CONSTRUCTION_DEMAND_THRESHOLD
  if (input.constructionDemand < requiredDemand) return null
  if (input.availableGold < CIV_EVO_CONSTRUCTION_GOLD_COST) return null
  let sameTileAutonomousProjects = 0
  for (const project of Object.values(input.lifeExpansion.constructionProjects)) {
    if (project.projectId === SALT_MARSH_PROJECT_ID) continue
    if (project.targetTileId === input.tile) {
      sameTileAutonomousProjects += 1
      if (project.completedAtTick === null) return null
    }
    if (project.completedAtTick === null && project.initiatedByNpcId === input.npcId) return null
  }
  if (sameTileAutonomousProjects >= CIV_EVO_MAX_AUTONOMOUS_BUILDINGS_PER_TILE) return null
  return {
    npcId: input.npcId,
    tileId: input.tile,
    buildingId: `b_civ_evo_${input.tile}`,
    duration: 24,
    goldCost: CIV_EVO_CONSTRUCTION_GOLD_COST
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

export function withNpcProductiveActionRecorded(
  state: LifeExpansionState,
  input: { npcId: string; domain: NpcProductiveDomain; delta: number; tick: number }
): LifeExpansionState {
  const delta = Math.max(1, Math.floor(input.delta))
  const before = state.npcCivicRecords[input.npcId] ?? createNpcCivicRecord(input.npcId)
  const skillKey = productiveSkillKeyForDomain(input.domain)
  const goldGain = NPC_PRODUCTIVE_GOLD_BY_DOMAIN[input.domain] * delta
  const xpGain = NPC_PRODUCTIVE_XP_PER_DELTA * delta
  return {
    ...state,
    npcCivicRecords: {
      ...state.npcCivicRecords,
      [input.npcId]: {
        npcId: input.npcId,
        gold: before.gold + goldGain,
        skillXp: {
          ...before.skillXp,
          [skillKey]: before.skillXp[skillKey] + xpGain
        },
        lastProductiveTick: input.tick
      }
    }
  }
}

export function productiveDeltaWithNpcSkill(
  state: LifeExpansionState,
  input: { npcId: string; domain: NpcProductiveDomain; baseDelta: number }
): number {
  const baseDelta = Math.max(1, Math.floor(input.baseDelta))
  const skillKey = productiveSkillKeyForDomain(input.domain)
  const skillXp = state.npcCivicRecords[input.npcId]?.skillXp[skillKey] ?? 0
  const bonus = Math.min(
    NPC_PRODUCTIVE_SKILL_BONUS_MAX,
    Math.floor(skillXp / NPC_PRODUCTIVE_SKILL_BONUS_XP_STEP)
  )
  return baseDelta + bonus
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

function createNpcCivicRecord(npcId: string): NpcCivicRecord {
  return {
    npcId,
    gold: 0,
    skillXp: {
      construction: 0,
      knowledge: 0,
      commerce: 0,
      civic: 0
    },
    lastProductiveTick: null
  }
}

export function productiveSkillKeyForDomain(domain: NpcProductiveDomain): NpcSkillKey {
  switch (domain) {
    case 'build': return 'construction'
    case 'learn': return 'knowledge'
    case 'trade': return 'commerce'
    case 'service': return 'civic'
  }
}

function readSkillXp(value: unknown): NpcCivicRecord['skillXp'] {
  const base = createNpcCivicRecord('').skillXp
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base
  const r = value as Partial<Record<NpcSkillKey, unknown>>
  return {
    construction: finiteNonNegative(r.construction) ?? 0,
    knowledge: finiteNonNegative(r.knowledge) ?? 0,
    commerce: finiteNonNegative(r.commerce) ?? 0,
    civic: finiteNonNegative(r.civic) ?? 0
  }
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
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
