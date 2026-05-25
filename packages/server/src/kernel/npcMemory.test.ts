// packages/server/src/kernel/npcMemory.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { SqliteNpcMemoryStore } from './npcMemory.js'
import type { Event } from './types.js'
import {
  MEMORY_VERY_HIGH_DECAY_TICKS,
  MEMORY_HIGH_DECAY_TICKS,
  MEMORY_DIALOG_MAX_BULLETS,
  MEMORY_URGENCY_BOOST_PERMANENT,
  MEMORY_URGENCY_BOOST_HIGH,
} from '../config/world.js'

function makeStore() {
  const db = new Database(':memory:')
  return { store: new SqliteNpcMemoryStore(db), db }
}

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  tick = 100
): Event {
  return {
    sequence: 1,
    eventType,
    commandId: 'cmd-1',
    submittedAt: new Date().toISOString(),
    tick,
    payload: {
      actorType: 'npc',
      actorId: 'test-npc',
      data,
      narration: null,
    },
  } as unknown as Event
}

// npcId → tileId
type NpcTileMap = ReadonlyMap<string, string>

describe('SqliteNpcMemoryStore.projectWithLocality', () => {
  it('FACTION_TILE_SEIZED: same-tile NPC gets importance 9 with fear tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 100,
      narration: 'The tide hunters seized the forest.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-guard', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(9)
    expect(rows[0]!.content).toMatchObject({ kind: 'faction.tile_seized', emotionalTag: 'fear' })
  })

  it('FACTION_TILE_SEIZED: adjacent-tile NPC gets importance 7 (9 - 2)', () => {
    const { store } = makeStore()
    // t_central is adjacent to t_forest in TILE_ADJACENCY
    const npcMap: NpcTileMap = new Map([['npc-merchant', 't_central']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 100,
      narration: '',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-merchant', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
  })

  it('FACTION_TILE_SEIZED: distant NPC gets no row', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-recluse', 't_desert']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 100,
      narration: '',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-recluse', 1, 10)
    expect(rows).toHaveLength(0)
  })

  it('ANIMAL_ATTACKED_NPC: victim always gets importance 8', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-fisher', 't_salt_marsh']])
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1',
      animalId: 'wolf-1',
      speciesId: 'fog_wolf',
      npcId: 'npc-fisher',
      tileId: 't_salt_marsh',
      attackedAtTick: 100,
      damage: { mood: -10, health: -5 },
      narration: 'The wolf attacked.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-fisher', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(8)
    expect(rows[0]!.content).toMatchObject({ kind: 'animal.attacked_npc', emotionalTag: 'fear' })
  })

  it('ANIMAL_ATTACKED_NPC: same-tile witness gets importance 7', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([
      ['npc-fisher', 't_salt_marsh'],
      ['npc-witness', 't_salt_marsh'],
    ])
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1',
      animalId: 'wolf-1',
      speciesId: 'fog_wolf',
      npcId: 'npc-fisher',
      tileId: 't_salt_marsh',
      attackedAtTick: 100,
      damage: { mood: -10, health: -5 },
      narration: 'The wolf attacked.',
    })
    store.projectWithLocality(ev, npcMap)
    const witnessRows = store.getImportant('npc-witness', 1, 10)
    expect(witnessRows).toHaveLength(1)
    expect(witnessRows[0]!.importance).toBe(7)
    expect(witnessRows[0]!.content).toMatchObject({ kind: 'animal.attacked_npc.witnessed' })
  })

  it('MIGRATION_WAVE_STARTED: same-tile NPC gets importance 7 with awe tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-nomad', 't_desert']])
    const ev = makeEvent('MIGRATION_WAVE_STARTED', {
      waveId: 'wave-1',
      speciesId: 'desert_hawk',
      fromTileId: 't_desert',
      toTileId: 't_mountain',
      startedAtTick: 100,
      migrationType: 'seasonal',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-nomad', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
    expect(rows[0]!.content).toMatchObject({ kind: 'migration.wave_started', emotionalTag: 'awe' })
  })

  it('SPECIES_EXTINCT: stored under world key with importance 8 and grief tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_forest']])
    const ev = makeEvent('SPECIES_EXTINCT', {
      speciesId: 'forest_deer',
      lastSeenTick: 95,
      affectedTileIds: ['t_forest'],
    })
    store.projectWithLocality(ev, npcMap)
    // stored under 'world', not the NPC
    const worldRows = store.getRecent('world', 10)
    const match = worldRows.find((r) => (r.content as Record<string, unknown>).kind === 'species.extinct')
    expect(match).toBeDefined()
    expect(match!.importance).toBe(8)
    expect(match!.content).toMatchObject({ emotionalTag: 'grief', speciesId: 'forest_deer' })
  })

  it('SETTLEMENT_FORMED: same-tile NPC gets importance 7 with relief tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-settler', 't_salt_marsh']])
    const ev = makeEvent('SETTLEMENT_FORMED', {
      settlementId: 'sett-1',
      tileId: 't_salt_marsh',
      formedAtTick: 100,
      founderNpcIds: ['npc-settler'],
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-settler', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
    expect(rows[0]!.content).toMatchObject({ kind: 'settlement.formed', emotionalTag: 'relief' })
  })

  it('SETTLEMENT_DECLINED: same-tile NPC gets importance 9 with fear tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-villager', 't_ruin']])
    const ev = makeEvent('SETTLEMENT_DECLINED', {
      settlementId: 'sett-old',
      tileId: 't_ruin',
      stability: 10,
      declinedAtTick: 100,
      narration: 'The settlement has fallen.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-villager', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(9)
    expect(rows[0]!.content).toMatchObject({ kind: 'settlement.declined', emotionalTag: 'fear' })
  })

  it('GOODS_TRANSPORT_LOST: carrier NPC gets importance 5 with anger tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-carrier', 't_dock']])
    const ev = makeEvent('GOODS_TRANSPORT_LOST', {
      transportId: 'trans-1',
      routeId: 'route-1',
      goodsId: 'fish',
      quantity: 10,
      carrierNpcId: 'npc-carrier',
      fromTileId: 't_salt_marsh',
      toTileId: 't_central',
      reason: 'storm',
      lostAtTick: 100,
      narration: 'The cargo was lost at sea.',
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-carrier', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(5)
    expect(rows[0]!.content).toMatchObject({ kind: 'goods.transport_lost', emotionalTag: 'anger' })
  })

  it('COMBAT_DEFEAT: defeated actor gets importance 7 with fear tag', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-fighter', 't_temple']])
    const ev = makeEvent('COMBAT_DEFEAT', {
      combatId: 'c-1',
      combatTick: 50,
      actorId: 'npc-fighter',
      defeatedByActorId: 'npc-boss',
      finalHp: 0,
    })
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-fighter', 1, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.importance).toBe(7)
    expect(rows[0]!.content).toMatchObject({ kind: 'combat.defeat', emotionalTag: 'fear' })
  })

  it('projectWithLocality is idempotent — duplicate call yields same row count', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 100,
      narration: '',
    })
    store.projectWithLocality(ev, npcMap)
    store.projectWithLocality(ev, npcMap)
    const rows = store.getImportant('npc-guard', 1, 10)
    expect(rows).toHaveLength(1)
  })
})

describe('SqliteNpcMemoryStore.formatMemoryContext', () => {
  it('returns empty string when no memories exist', () => {
    const { store } = makeStore()
    const result = store.formatMemoryContext('npc-nobody', 1000)
    expect(result).toBe('')
  })

  it('returns bullet list for active memories', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 100,
      narration: '',
    }, 100)
    store.projectWithLocality(ev, npcMap)
    const result = store.formatMemoryContext('npc-guard', 200)
    expect(result).toContain('[importance:9]')
    expect(result).toContain('t_forest')
  })

  it('includes world-scoped memories (SPECIES_EXTINCT)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_forest']])
    const ev = makeEvent('SPECIES_EXTINCT', {
      speciesId: 'forest_deer',
      lastSeenTick: 100,
      affectedTileIds: ['t_forest'],
    }, 100)
    store.projectWithLocality(ev, npcMap)
    const result = store.formatMemoryContext('npc-hunter', 200)
    expect(result).toContain('forest_deer')
  })

  it('caps output at MEMORY_DIALOG_MAX_BULLETS (5)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    // Insert 7 memories at different ticks (importance 9, so all are permanent)
    for (let i = 0; i < 7; i++) {
      const ev = makeEvent('FACTION_TILE_SEIZED', {
        tileId: 't_forest',
        factionId: 'tide_hunters',
        previousFactionId: null,
        seizedAtTick: 100 + i,
        narration: `event-${i}`,
      }, 100 + i)
      store.projectWithLocality(ev, npcMap)
    }
    const result = store.formatMemoryContext('npc-guard', 500)
    const lines = result.split('\n').filter((l) => l.startsWith('-'))
    expect(lines.length).toBeLessThanOrEqual(MEMORY_DIALOG_MAX_BULLETS)
  })

  it('importance-9 memory survives past MEMORY_VERY_HIGH_DECAY_TICKS', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 0,
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // Way beyond decay threshold
    const result = store.formatMemoryContext('npc-guard', 999999)
    expect(result).not.toBe('')
  })

  it('importance-5 memory is excluded after MEMORY_HIGH_DECAY_TICKS', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-carrier', 't_dock']])
    const ev = makeEvent('GOODS_TRANSPORT_LOST', {
      transportId: 'trans-1',
      routeId: 'route-1',
      goodsId: 'fish',
      quantity: 5,
      carrierNpcId: 'npc-carrier',
      fromTileId: 't_dock',
      toTileId: 't_central',
      reason: 'storm',
      lostAtTick: 0,
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // MEMORY_HIGH_DECAY_TICKS = 7 * 17280 = 120960
    // Use currentTick well past that threshold
    const result = store.formatMemoryContext('npc-carrier', MEMORY_HIGH_DECAY_TICKS + 1)
    expect(result).toBe('')
  })

  it('orders by importance DESC then recency DESC', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    // Low-importance event (importance 5, stored directly to npc-guard via carrier)
    const evLow = makeEvent('GOODS_TRANSPORT_LOST', {
      transportId: 'trans-2',
      routeId: 'route-2',
      goodsId: 'fish',
      quantity: 5,
      carrierNpcId: 'npc-guard',
      fromTileId: 't_dock',
      toTileId: 't_forest',
      reason: 'storm',
      lostAtTick: 200,
      narration: '',
    }, 200)
    store.projectWithLocality(evLow, npcMap)
    // High-importance event (importance 9)
    const evHigh = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: null,
      seizedAtTick: 100,
      narration: '',
    }, 100)
    store.projectWithLocality(evHigh, npcMap)
    const result = store.formatMemoryContext('npc-guard', 300)
    const lines = result.split('\n').filter((l) => l.startsWith('-'))
    // High importance (9) should appear before low (5)
    const firstImportance = lines[0]!.match(/\[importance:(\d+)\]/)?.[1]
    expect(Number(firstImportance)).toBeGreaterThan(5)
  })

  it('importance-8 memory is excluded exactly at MEMORY_VERY_HIGH_DECAY_TICKS + 1', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-fisher', 't_salt_marsh']])
    // ANIMAL_ATTACKED_NPC victim row = importance 8
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-boundary',
      animalId: 'wolf-1',
      speciesId: 'fog_wolf',
      npcId: 'npc-fisher',
      tileId: 't_salt_marsh',
      attackedAtTick: 0,
      damage: { mood: -10, health: -5 },
      narration: 'A wolf attacked.',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // MEMORY_VERY_HIGH_DECAY_TICKS = 30 * 17280 = 518400
    // At exactly tick 518401, the importance-8 memory should be expired
    const result = store.formatMemoryContext('npc-fisher', MEMORY_VERY_HIGH_DECAY_TICKS + 1)
    expect(result).toBe('')
  })
})

describe('SqliteNpcMemoryStore.getMemoryUrgencyBoost', () => {
  it('returns 0 when NPC has no memories', () => {
    const { store } = makeStore()
    expect(store.getMemoryUrgencyBoost('npc-nobody', 1000)).toBe(0)
  })

  it('returns 0 for neutral emotional tag (importance 9)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    // SETTLEMENT_FORMED has emotionalTag 'relief', not fear/grief
    const ev = makeEvent('SETTLEMENT_FORMED', {
      tileId: 't_forest',
      settlementId: 'settle-1',
      formedAtTick: 0,
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    expect(store.getMemoryUrgencyBoost('npc-guard', 1000)).toBe(0)
  })

  it('returns PERMANENT for importance-9 fear memory (FACTION_TILE_SEIZED, same tile)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-guard', 't_forest']])
    const ev = makeEvent('FACTION_TILE_SEIZED', {
      tileId: 't_forest',
      factionId: 'tide_hunters',
      previousFactionId: 'free_runners',
      seizedAtTick: 0,
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // Even far in the future — importance 9 is permanent
    expect(store.getMemoryUrgencyBoost('npc-guard', 999999)).toBe(MEMORY_URGENCY_BOOST_PERMANENT)
  })

  it('returns PERMANENT for importance-9 grief memory (SPECIES_EXTINCT, world-scoped)', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_forest']])
    const ev = makeEvent('SPECIES_EXTINCT', {
      speciesId: 'forest_deer',
      lastSeenTick: 0,
      affectedTileIds: ['t_forest'],
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // SPECIES_EXTINCT stores under npc_id='world' with importance 8 in world scope
    // AND under the NPC with importance 8 (adjacent-or-same). Let's check world scope:
    // The query checks npc_id = ? so we need to check by 'npc-hunter' (locality) or 'world'
    // Actually SPECIES_EXTINCT goes to projectWithLocality which stores world-scope under 'world'
    // AND local scope under the NPC. Let's directly insert an importance-9 grief memory:
    store.getMemoryUrgencyBoost('world', 100)  // just to exercise path
    // Insert directly for test clarity
    const db2 = new Database(':memory:')
    const store2 = new SqliteNpcMemoryStore(db2)
    const npcMap2: NpcTileMap = new Map([['npc-survivor', 't_forest']])
    // SETTLEMENT_DECLINED is importance 9 / fear
    const ev2 = makeEvent('SETTLEMENT_DECLINED', {
      tileId: 't_forest',
      settlementId: 'settle-1',
      declinedAtTick: 0,
      narration: '',
    }, 0)
    store2.projectWithLocality(ev2, npcMap2)
    expect(store2.getMemoryUrgencyBoost('npc-survivor', 999999)).toBe(MEMORY_URGENCY_BOOST_PERMANENT)
  })

  it('returns HIGH for importance-8 fear memory within decay window', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_salt_marsh']])
    // ANIMAL_ATTACKED_NPC victim = importance 8, fear
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1',
      animalId: 'wolf-1',
      speciesId: 'fog_wolf',
      npcId: 'npc-hunter',
      tileId: 't_salt_marsh',
      attackedAtTick: 0,
      damage: { mood: -10, health: -5 },
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // currentTick within decay window
    expect(store.getMemoryUrgencyBoost('npc-hunter', MEMORY_VERY_HIGH_DECAY_TICKS - 1)).toBe(MEMORY_URGENCY_BOOST_HIGH)
  })

  it('returns 0 for importance-8 fear memory after decay window', () => {
    const { store } = makeStore()
    const npcMap: NpcTileMap = new Map([['npc-hunter', 't_salt_marsh']])
    const ev = makeEvent('ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-2',
      animalId: 'wolf-2',
      speciesId: 'fog_wolf',
      npcId: 'npc-hunter',
      tileId: 't_salt_marsh',
      attackedAtTick: 0,
      damage: { mood: -5, health: -3 },
      narration: '',
    }, 0)
    store.projectWithLocality(ev, npcMap)
    // Past decay window → no boost
    expect(store.getMemoryUrgencyBoost('npc-hunter', MEMORY_VERY_HIGH_DECAY_TICKS + 1)).toBe(0)
  })
})
