import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { TICKS_PER_DAY } from '../config/world.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import type { NpcProfile } from '../npcs/types.js'
import { SALT_MARSH_BUILDING_ID, SALT_MARSH_TILE_ID } from './cityLife.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime life goals and expansion', () => {
  it('turns NPC life pressure and productive work into committed expansion facts', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const profiles = [profile('npc.a'), profile('npc.b'), profile('npc.c'), profile('npc.d')]
    const runtime = new SimulationRuntime(
      eventStore,
      profiles,
      loadCardCatalog()
    )

    try {
      for (let i = 0; i < 120; i += 1) {
        ;(runtime as unknown as { runTick: () => void }).runTick()
      }

      const events = eventStore.readEvents()
      const eventTypes = new Set(events.map((event) => event.eventType))
      const householdEvents = events.filter((event) => event.eventType === 'NPC_HOUSEHOLD_FORMED')
      const householdGoldEvents = events.filter((event) => event.eventType === 'HOUSEHOLD_GOLD_CONTRIBUTED')
      const constructionEvent = events
        .filter((event) => event.eventType === 'CONSTRUCTION_PROJECT_PROGRESS')
        .find((event) => ((event.payload as { data?: { progressAfter?: number } }).data?.progressAfter ?? 0) >= 12)
      const constructionData = (constructionEvent?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const mapUnlockData = (events.find((event) => event.eventType === 'MAP_TILE_UNLOCKED')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const buildingData = (events.find((event) => event.eventType === 'BUILDING_CONSTRUCTED')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const productiveData = (events.find((event) => event.eventType === 'NPC_PRODUCTIVE_ACTION')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const lifeGoalData = (events.find((event) => event.eventType === 'NPC_LIFE_GOAL_SET')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const householdData = (householdEvents[0]?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const areaPressureData = (events.find((event) => event.eventType === 'AREA_PRESSURE')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const weatherData = (events.find((event) => event.eventType === 'WEATHER_CHANGE')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const worldEventData = (events.find((event) => event.eventType === 'WORLD_EVENT_SPAWN')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const world = runtime.getSnapshot()
      const map = runtime.getMap()
      const saltMarshBuildings = runtime.getBuildingsOnTile(SALT_MARSH_TILE_ID)
      const npcs = runtime.getNpcs()

      expect(eventTypes.has('NPC_LIFE_GOAL_SET')).toBe(true)
      expect(eventTypes.has('NPC_HOUSEHOLD_FORMED')).toBe(true)
      expect(eventTypes.has('NPC_CHILD_BORN')).toBe(true)
      expect(eventTypes.has('HOUSEHOLD_GOLD_CONTRIBUTED')).toBe(true)
      expect(eventTypes.has('CONSTRUCTION_PROJECT_PROGRESS')).toBe(true)
      expect(eventTypes.has('MAP_TILE_UNLOCKED')).toBe(true)
      expect(eventTypes.has('BUILDING_CONSTRUCTED')).toBe(true)
      expect(map.tiles.map((tile) => tile.id)).toContain(SALT_MARSH_TILE_ID)
      expect(saltMarshBuildings.map((view) => view.def.id)).toContain(SALT_MARSH_BUILDING_ID)
      expect(householdEvents.length).toBeGreaterThanOrEqual(2)
      expect(productiveData?.motivation?.explanation).toContain('上位指令')
      expect(lifeGoalData?.motivation?.explanation).toContain('上位指令')
      expect(lifeGoalData?.motivation?.explanation).toContain('需求')
      expect(householdData?.motivation?.explanation).toContain('成家條件')
      expect(areaPressureData?.motivation?.explanation).toContain('門檻')
      expect(weatherData?.motivation?.explanation).toContain('天氣意志')
      expect(worldEventData?.motivation?.explanation).toContain('世界事件引擎')
      expect(constructionData?.motivation?.projectPurpose).toContain('住房')
      expect(constructionData?.motivation?.explanation).toContain('上位指令')
      expect(constructionData?.motivation?.explanation).toContain('目標')
      expect(constructionData?.motivation?.explanation).toContain('夜潮區')
      expect(constructionData?.motivation?.explanation).toContain('鹽沼外環')
      expect(constructionData?.motivation?.explanation).not.toContain('{')
      expect(constructionData?.motivation?.explanation).not.toContain('}')
      expect(mapUnlockData?.motivation?.explanation).toBe(constructionData?.motivation?.explanation)
      expect(buildingData?.motivation?.projectPurpose).toBe(constructionData?.motivation?.projectPurpose)
      expect(npcs.every((npc) => npc.life?.goal.kind)).toBe(true)
      expect(npcs.some((npc) => npc.civic && npc.civic.gold > 0)).toBe(true)
      expect(npcs.some((npc) => npc.civic && Object.values(npc.civic.skillXp).some((xp) => xp > 0))).toBe(true)
      expect((world.facts.lifeExpansion as { unlockedTileIds?: string[] }).unlockedTileIds).toContain(SALT_MARSH_TILE_ID)
      expect(Object.keys((world.facts.lifeExpansion as { npcCivicRecords?: Record<string, unknown> }).npcCivicRecords ?? {})).not.toHaveLength(0)
      expect(householdGoldEvents.length).toBeGreaterThan(0)
      expect((world.facts.householdEconomy as { balance?: number }[]).some((row) => (row.balance ?? 0) > 0)).toBe(true)

      runtime.stop()
      const restored = new SimulationRuntime(eventStore, profiles, loadCardCatalog())
      try {
        expect(restored.getMap().tiles.map((tile) => tile.id)).toContain(SALT_MARSH_TILE_ID)
        expect(restored.getBuildingsOnTile(SALT_MARSH_TILE_ID).map((view) => view.def.id)).toContain(SALT_MARSH_BUILDING_ID)
        expect(restored.getNpcs().some((npc) => npc.civic && npc.civic.gold > 0)).toBe(true)
        expect(restored.getHouseholdEconomy().some((row) => row.balance > 0)).toBe(true)
      } finally {
        restored.stop()
      }
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

function profile(id: string): NpcProfile {
  return {
    id,
    name: { zh: id === 'npc.a' ? '阿潮' : '小沼', en: id === 'npc.a' ? 'A-Chao' : 'Xiao-Zhao' },
    role: { zh: '街區居民', en: 'Resident' },
    defaultLocation: 't_central',
    routine: [
      { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'work shift' }
    ],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'civilian', archetype: 'resident' }
  }
}
