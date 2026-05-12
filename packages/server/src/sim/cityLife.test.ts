import { describe, expect, it } from 'vitest'
import type { NpcProfile } from '../npcs/types.js'
import type { AreaState } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'
import {
  SALT_MARSH_BUILDING_ID,
  SALT_MARSH_PROJECT_ID,
  SALT_MARSH_TILE_ID,
  createInitialLifeExpansionState,
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
})
