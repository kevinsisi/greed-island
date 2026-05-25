// packages/server/src/kernel/npcMemory.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { SqliteNpcMemoryStore } from './npcMemory.js'
import type { Event } from './types.js'

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
