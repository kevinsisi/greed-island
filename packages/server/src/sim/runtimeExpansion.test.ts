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
    const runtime = new SimulationRuntime(
      eventStore,
      [profile('npc.a'), profile('npc.b'), profile('npc.c'), profile('npc.d')],
      loadCardCatalog()
    )

    try {
      for (let i = 0; i < 120; i += 1) {
        ;(runtime as unknown as { runTick: () => void }).runTick()
      }

      const events = eventStore.readEvents()
      const eventTypes = new Set(events.map((event) => event.eventType))
      const householdEvents = events.filter((event) => event.eventType === 'NPC_HOUSEHOLD_FORMED')
      const constructionEvent = events
        .filter((event) => event.eventType === 'CONSTRUCTION_PROJECT_PROGRESS')
        .find((event) => ((event.payload as { data?: { progressAfter?: number } }).data?.progressAfter ?? 0) >= 12)
      const constructionData = (constructionEvent?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const mapUnlockData = (events.find((event) => event.eventType === 'MAP_TILE_UNLOCKED')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const buildingData = (events.find((event) => event.eventType === 'BUILDING_CONSTRUCTED')?.payload as { data?: { motivation?: { explanation?: string; projectPurpose?: string } } } | undefined)?.data
      const world = runtime.getSnapshot()
      const map = runtime.getMap()
      const saltMarshBuildings = runtime.getBuildingsOnTile(SALT_MARSH_TILE_ID)
      const npcs = runtime.getNpcs()

      expect(eventTypes.has('NPC_LIFE_GOAL_SET')).toBe(true)
      expect(eventTypes.has('NPC_HOUSEHOLD_FORMED')).toBe(true)
      expect(eventTypes.has('NPC_CHILD_BORN')).toBe(true)
      expect(eventTypes.has('CONSTRUCTION_PROJECT_PROGRESS')).toBe(true)
      expect(eventTypes.has('MAP_TILE_UNLOCKED')).toBe(true)
      expect(eventTypes.has('BUILDING_CONSTRUCTED')).toBe(true)
      expect(map.tiles.map((tile) => tile.id)).toContain(SALT_MARSH_TILE_ID)
      expect(saltMarshBuildings.map((view) => view.def.id)).toContain(SALT_MARSH_BUILDING_ID)
      expect(householdEvents.length).toBeGreaterThanOrEqual(2)
      expect(constructionData?.motivation?.projectPurpose).toContain('住房')
      expect(constructionData?.motivation?.explanation).toContain('目標')
      expect(constructionData?.motivation?.explanation).toContain('夜潮區')
      expect(constructionData?.motivation?.explanation).toContain('鹽沼外環')
      expect(constructionData?.motivation?.explanation).not.toContain('{')
      expect(constructionData?.motivation?.explanation).not.toContain('}')
      expect(mapUnlockData?.motivation?.explanation).toBe(constructionData?.motivation?.explanation)
      expect(buildingData?.motivation?.projectPurpose).toBe(constructionData?.motivation?.projectPurpose)
      expect(npcs.every((npc) => npc.life?.goal.kind)).toBe(true)
      expect((world.facts.lifeExpansion as { unlockedTileIds?: string[] }).unlockedTileIds).toContain(SALT_MARSH_TILE_ID)
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
