import { describe, expect, it } from 'vitest'
import type { NpcProfile } from '../npcs/types.js'
import type { AreaState } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'
import {
  SALT_MARSH_BUILDING_ID,
  SALT_MARSH_PROJECT_ID,
  SALT_MARSH_TILE_ID,
  createInitialLifeExpansionState,
  deriveNpcLifeView,
  hydrateLifeExpansionState,
  withChildBorn,
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
})
