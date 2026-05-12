import { describe, expect, it } from 'vitest'
import type { NpcProfile } from '../npcs/types.js'
import type { AreaState } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'
import {
  SALT_MARSH_BUILDING_ID,
  SALT_MARSH_PROJECT_ID,
  SALT_MARSH_TILE_ID,
  createInitialLifeExpansionState,
  decideCivEvoConstructionInitiate,
  deriveConstructionInitiateProjectId,
  deriveNpcLifeView,
  hydrateLifeExpansionState,
  withChildBorn,
  withConstructionInitiated,
  withConstructionProgress,
  withHouseholdFormed,
  withUnlockedExpansion
} from './cityLife.js'

function profile(overrides: Partial<NpcProfile> = {}): NpcProfile {
  return {
    id: 'npc.builder',
    name: { zh: '工匠', en: 'Builder' },
    role: { zh: '修補工匠', en: 'Mender' },
    defaultLocation: 't_central',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'guild' },
    ...overrides
  }
}

function state(overrides: Partial<NpcRuntimeState> = {}): NpcRuntimeState {
  return {
    tile: 't_central',
    mood: 60,
    health: 80,
    activity: 'work',
    faction: 'guild',
    targetTile: 't_central',
    lastActedTick: 0,
    subCol: 7,
    subRow: 5,
    subZ: 0,
    ...overrides
  } as NpcRuntimeState
}

const area: AreaState = {
  tileId: 't_central',
  factionControl: { tide_hunters: 15, free_runners: 5, guild: 20, civilian: 30 },
  dominantFaction: null,
  resources: { food: 70, safety: 72, economy: 66 },
  lastUpdatedTick: 1,
  recentEvents: [],
  pressureCooldowns: {}
}

describe('city life projection', () => {
  it('derives deterministic life goals from pressure and role', () => {
    const life = deriveNpcLifeView({
      profile: profile(),
      state: state(),
      areaState: area,
      lifeExpansion: createInitialLifeExpansionState(),
      tick: 10
    })

    expect(life.goal.kind).toBe('build_city')
    expect(life.goal.narration).toContain('建設')
    expect(life.needs.money).toBeGreaterThanOrEqual(0)
  })

  it('projects construction, unlocked structure, household, and child facts replayably', () => {
    let expansion = createInitialLifeExpansionState()
    expansion = withConstructionProgress(expansion, { tick: 1, delta: 5 })
    expansion = withConstructionProgress(expansion, { tick: 2, delta: 7 })
    expansion = withUnlockedExpansion(expansion)
    expansion = withHouseholdFormed(expansion, {
      householdId: 'household.a.b',
      partnerNpcIds: ['npc.a', 'npc.b'],
      homeTileId: 't_central',
      tick: 3
    })
    expansion = withChildBorn(expansion, {
      householdId: 'household.a.b',
      childId: 'child.1',
      nameZh: '潮生',
      nameEn: 'Tideborn',
      tick: 93
    })

    const replayed = hydrateLifeExpansionState(JSON.parse(JSON.stringify(expansion)))

    expect(replayed.constructionProjects[SALT_MARSH_PROJECT_ID]!.progress).toBe(12)
    expect(replayed.unlockedTileIds).toContain(SALT_MARSH_TILE_ID)
    expect(replayed.unlockedBuildingIds).toContain(SALT_MARSH_BUILDING_ID)
    expect(replayed.households['household.a.b']!.childIds).toEqual(['child.1'])
    expect(replayed.children['child.1']!.nameEn).toBe('Tideborn')
  })

  describe('civ-evo-construction: withConstructionInitiated', () => {
    const npcInput = {
      npcId: 'central.broker.gui',
      tileId: 't_central',
      buildingId: 'b_central_well',
      duration: 24,
      tick: 100
    } as const

    it('derives a deterministic projectId from the command payload', () => {
      const a = deriveConstructionInitiateProjectId({
        npcId: npcInput.npcId,
        tileId: npcInput.tileId,
        buildingId: npcInput.buildingId,
        startedAtTick: npcInput.tick
      })
      const b = deriveConstructionInitiateProjectId({
        npcId: npcInput.npcId,
        tileId: npcInput.tileId,
        buildingId: npcInput.buildingId,
        startedAtTick: npcInput.tick
      })
      expect(a).toBe(b)
      expect(a.startsWith('project.civ-evo.')).toBe(true)
      // changing any input changes the id
      const c = deriveConstructionInitiateProjectId({
        npcId: npcInput.npcId,
        tileId: npcInput.tileId,
        buildingId: npcInput.buildingId,
        startedAtTick: npcInput.tick + 1
      })
      expect(c).not.toBe(a)
    })

    it('adds a new project carrying initiatedByNpcId, progress=0, targetProgress=duration', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, npcInput)
      const projectId = deriveConstructionInitiateProjectId({
        npcId: npcInput.npcId,
        tileId: npcInput.tileId,
        buildingId: npcInput.buildingId,
        startedAtTick: npcInput.tick
      })
      const record = expansion.constructionProjects[projectId]
      expect(record).toBeDefined()
      expect(record!.initiatedByNpcId).toBe(npcInput.npcId)
      expect(record!.targetTileId).toBe(npcInput.tileId)
      expect(record!.buildingId).toBe(npcInput.buildingId)
      expect(record!.progress).toBe(0)
      expect(record!.targetProgress).toBe(npcInput.duration)
      expect(record!.startedAtTick).toBe(npcInput.tick)
      expect(record!.completedAtTick).toBeNull()
    })

    it('is idempotent: replaying the same CONSTRUCTION_INITIATE does not double-insert', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, npcInput)
      const afterFirst = expansion
      expansion = withConstructionInitiated(expansion, npcInput)
      // Same reducer call with same payload returns the same state ref —
      // critical for EventLog replay determinism.
      expect(expansion).toBe(afterFirst)
      expect(Object.keys(expansion.constructionProjects)).toHaveLength(1)
    })

    it('two different initiates on the same tile produce distinct projects', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, npcInput)
      expansion = withConstructionInitiated(expansion, {
        ...npcInput,
        npcId: 'dock.surfer.jiang_bo_ran',
        tick: npcInput.tick + 1
      })
      expect(Object.keys(expansion.constructionProjects)).toHaveLength(2)
    })

    it('round-trips through hydrateLifeExpansionState preserving initiatedByNpcId', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, npcInput)
      const replayed = hydrateLifeExpansionState(JSON.parse(JSON.stringify(expansion)))
      const projectId = deriveConstructionInitiateProjectId({
        npcId: npcInput.npcId,
        tileId: npcInput.tileId,
        buildingId: npcInput.buildingId,
        startedAtTick: npcInput.tick
      })
      expect(replayed.constructionProjects[projectId]!.initiatedByNpcId).toBe(npcInput.npcId)
      expect(replayed.constructionProjects[projectId]!.targetProgress).toBe(npcInput.duration)
    })
  })

  describe('civ-evo-construction: decideCivEvoConstructionInitiate', () => {
    const lowEconomyArea = { resources: { food: 70, safety: 72, economy: 30 } }
    const richArea = { resources: { food: 80, safety: 80, economy: 85 } }
    const empty = createInitialLifeExpansionState()

    it('emits a fresh decision when economy is below the proxy threshold and tile is empty', () => {
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: 't_central',
        areaState: lowEconomyArea,
        lifeExpansion: empty
      })
      expect(decision).toEqual({
        npcId: 'central.broker.gui',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 24
      })
    })

    it('returns null when economy is at or above the proxy threshold', () => {
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: 't_central',
        areaState: richArea,
        lifeExpansion: empty
      })
      expect(decision).toBeNull()
    })

    it('returns null on the legacy salt-marsh tile (its own progress engine still runs)', () => {
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: SALT_MARSH_TILE_ID,
        areaState: lowEconomyArea,
        lifeExpansion: empty
      })
      expect(decision).toBeNull()
    })

    it('skips when another open civ-evo project already exists on the same tile', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, {
        npcId: 'central.tailor.zhuang_wan_rong',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 24,
        tick: 50
      })
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: 't_central',
        areaState: lowEconomyArea,
        lifeExpansion: expansion
      })
      expect(decision).toBeNull()
    })

    it('skips when this NPC already has an open civ-evo project on any tile', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, {
        npcId: 'central.broker.gui',
        tileId: 't_dock',
        buildingId: 'b_civ_evo_t_dock',
        duration: 24,
        tick: 40
      })
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: 't_central',
        areaState: lowEconomyArea,
        lifeExpansion: expansion
      })
      expect(decision).toBeNull()
    })

    it('emits when the only open project on this tile is the legacy salt-marsh settlement', () => {
      // Salt-marsh's fixed project id sits at SALT_MARSH_PROJECT_ID and
      // targets SALT_MARSH_TILE_ID. It must not block civ-evo from
      // initiating on a different tile.
      const expansion = withConstructionProgress(createInitialLifeExpansionState(), { tick: 1, delta: 5 })
      expect(expansion.constructionProjects[SALT_MARSH_PROJECT_ID]).toBeDefined()
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: 't_central',
        areaState: lowEconomyArea,
        lifeExpansion: expansion
      })
      expect(decision).not.toBeNull()
    })

    it('allows the NPC to start a new project once the previous one completes', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, {
        npcId: 'central.broker.gui',
        tileId: 't_dock',
        buildingId: 'b_civ_evo_t_dock',
        duration: 24,
        tick: 40
      })
      const projectId = deriveConstructionInitiateProjectId({
        npcId: 'central.broker.gui',
        tileId: 't_dock',
        buildingId: 'b_civ_evo_t_dock',
        startedAtTick: 40
      })
      // mark the first project completed
      expansion = {
        ...expansion,
        constructionProjects: {
          ...expansion.constructionProjects,
          [projectId]: {
            ...expansion.constructionProjects[projectId]!,
            progress: 24,
            completedAtTick: 64
          }
        }
      }
      const decision = decideCivEvoConstructionInitiate({
        npcId: 'central.broker.gui',
        tile: 't_central',
        areaState: lowEconomyArea,
        lifeExpansion: expansion
      })
      expect(decision).not.toBeNull()
    })
  })

  describe('Slice 7: E2E lifecycle — initiate → progress → complete', () => {
    it('advances an NPC-initiated project through withConstructionProgress with the correct projectId', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, {
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 6,
        tick: 100
      })
      const projectId = deriveConstructionInitiateProjectId({
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        startedAtTick: 100
      })
      let record = expansion.constructionProjects[projectId]!
      expect(record.progress).toBe(0)
      expect(record.completedAtTick).toBeNull()

      // advance by 2
      expansion = withConstructionProgress(expansion, { tick: 101, delta: 2, projectId })
      record = expansion.constructionProjects[projectId]!
      expect(record.progress).toBe(2)
      expect(record.completedAtTick).toBeNull()

      // advance by 4 → completes (2+4=6 >= 6)
      expansion = withConstructionProgress(expansion, { tick: 102, delta: 4, projectId })
      record = expansion.constructionProjects[projectId]!
      expect(record.progress).toBe(6)
      expect(record.completedAtTick).toBe(102)
    })

    it('clamps progress to targetProgress and does not over-complete', () => {
      let expansion = createInitialLifeExpansionState()
      expansion = withConstructionInitiated(expansion, {
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 5,
        tick: 100
      })
      const projectId = deriveConstructionInitiateProjectId({
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        startedAtTick: 100
      })
      // advance by 10, but target is 5 → clamped to 5
      expansion = withConstructionProgress(expansion, { tick: 101, delta: 10, projectId })
      const record = expansion.constructionProjects[projectId]!
      expect(record.progress).toBe(5)
      expect(record.completedAtTick).toBe(101)
    })
  })
})
