import { describe, expect, it } from 'vitest'
import { AnimalPopulationProjection } from './animalPopulation.js'
import type { Animal } from '../ecosystem/species.js'
import type { Event } from '../kernel/types.js'

describe('AnimalPopulationProjection', () => {
  it('projects ANIMAL_SPAWNED into species/tile population rows', () => {
    const projection = new AnimalPopulationProjection()
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('animal-a', 'forest_deer', 't_forest', 'forest'), 12),
      spawnedEvent(2, animal('animal-b', 'forest_deer', 't_forest', 'forest'), 24),
    ])

    const row = projection.getBySpeciesAndTile('forest_deer', 't_forest')
    expect(row?.count).toBe(2)
    expect(row?.animalIds).toEqual(['animal-a', 'animal-b'])
    expect(row?.lastSpawnedAtTick).toBe(24)
    expect(projection.countSpeciesOnTile('forest_deer', 't_forest')).toBe(2)
  })

  it('deduplicates duplicate animal ids', () => {
    const projection = new AnimalPopulationProjection()
    const same = animal('animal-a', 'forest_deer', 't_forest', 'forest')
    projection.rebuildFromEvents([
      spawnedEvent(1, same, 12),
      spawnedEvent(2, same, 12),
    ])
    expect(projection.getBySpeciesAndTile('forest_deer', 't_forest')?.count).toBe(1)
  })

  it('removes killed animal ids without double-counting duplicate kills', () => {
    const projection = new AnimalPopulationProjection()
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('animal-a', 'forest_deer', 't_forest', 'forest'), 12),
      killedEvent(2, 'animal-a', 'forest_deer', 't_forest', 20),
      killedEvent(3, 'animal-a', 'forest_deer', 't_forest', 20),
    ])

    const row = projection.getBySpeciesAndTile('forest_deer', 't_forest')
    expect(row?.count).toBe(0)
    expect(row?.animalIds).toEqual([])
    expect(row?.lastKilledAtTick).toBe(20)
  })

  it('adds reproduced animal ids without double-counting duplicate reproduction', () => {
    const projection = new AnimalPopulationProjection()
    const newborn = animal('animal-c', 'forest_deer', 't_forest', 'forest')
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('animal-a', 'forest_deer', 't_forest', 'forest'), 12),
      spawnedEvent(2, animal('animal-b', 'forest_deer', 't_forest', 'forest'), 12),
      reproducedEvent(3, newborn, ['animal-a', 'animal-b'], 24),
      reproducedEvent(4, newborn, ['animal-a', 'animal-b'], 24),
    ])

    const row = projection.getBySpeciesAndTile('forest_deer', 't_forest')
    expect(row?.count).toBe(3)
    expect(row?.animalIds).toEqual(['animal-a', 'animal-b', 'animal-c'])
  })

  it('rebuilds to an identical canonical hash', () => {
    const events = [
      spawnedEvent(1, animal('animal-a', 'forest_deer', 't_forest', 'forest'), 12),
      spawnedEvent(2, animal('animal-b', 'cliff_goat', 't_mountain', 'mountain'), 24),
    ]
    const a = new AnimalPopulationProjection()
    const b = new AnimalPopulationProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })

  it('moves animal id from source to destination on ANIMAL_MIGRATED', () => {
    const projection = new AnimalPopulationProjection()
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('deer-a', 'forest_deer', 't_forest', 'forest'), 10),
      spawnedEvent(2, animal('deer-b', 'forest_deer', 't_forest', 'forest'), 10),
      migratedEvent(3, 'deer-a', 'forest_deer', 't_forest', 't_mountain', 'wave-x', 20),
    ])

    const source = projection.getBySpeciesAndTile('forest_deer', 't_forest')
    const dest = projection.getBySpeciesAndTile('forest_deer', 't_mountain')

    expect(source?.animalIds).toEqual(['deer-b'])
    expect(source?.count).toBe(1)
    expect(dest?.animalIds).toContain('deer-a')
    expect(dest?.count).toBe(1)
    expect(dest?.biomeRegion).toBe('mountain')
  })

  it('ignores ANIMAL_MIGRATED for animal not on source tile', () => {
    const projection = new AnimalPopulationProjection()
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('deer-b', 'forest_deer', 't_forest', 'forest'), 10),
      migratedEvent(2, 'deer-a', 'forest_deer', 't_forest', 't_mountain', 'wave-x', 20),
    ])

    expect(projection.getBySpeciesAndTile('forest_deer', 't_forest')?.count).toBe(1)
    expect(projection.getBySpeciesAndTile('forest_deer', 't_mountain')).toBeNull()
  })

  it('canonical hash after ANIMAL_MIGRATED is replay-consistent', () => {
    const events = [
      spawnedEvent(1, animal('deer-a', 'forest_deer', 't_forest', 'forest'), 10),
      migratedEvent(2, 'deer-a', 'forest_deer', 't_forest', 't_mountain', 'wave-x', 20),
    ]
    const a = new AnimalPopulationProjection()
    const b = new AnimalPopulationProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })

  it('removes predator animal id on ANIMAL_STARVED', () => {
    const projection = new AnimalPopulationProjection()
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('wolf-a', 'fog_wolf', 't_forest', 'forest'), 10),
      spawnedEvent(2, animal('wolf-b', 'fog_wolf', 't_forest', 'forest'), 10),
      starvedEvent(3, 'wolf-a', 'fog_wolf', 't_forest', 50),
    ])

    const row = projection.getBySpeciesAndTile('fog_wolf', 't_forest')
    expect(row?.count).toBe(1)
    expect(row?.animalIds).toEqual(['wolf-b'])
    expect(row?.lastKilledAtTick).toBe(50)
  })

  it('ignores ANIMAL_STARVED for predator not on tile (no-op)', () => {
    const projection = new AnimalPopulationProjection()
    projection.rebuildFromEvents([
      spawnedEvent(1, animal('wolf-b', 'fog_wolf', 't_forest', 'forest'), 10),
      starvedEvent(2, 'wolf-a', 'fog_wolf', 't_forest', 50),
    ])

    const row = projection.getBySpeciesAndTile('fog_wolf', 't_forest')
    expect(row?.count).toBe(1)
    expect(row?.animalIds).toEqual(['wolf-b'])
  })

  it('canonical hash after ANIMAL_STARVED is replay-consistent', () => {
    const events = [
      spawnedEvent(1, animal('wolf-a', 'fog_wolf', 't_forest', 'forest'), 10),
      starvedEvent(2, 'wolf-a', 'fog_wolf', 't_forest', 50),
    ]
    const a = new AnimalPopulationProjection()
    const b = new AnimalPopulationProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

function spawnedEvent(sequence: number, animalValue: Animal, spawnedAtTick: number): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType: 'ANIMAL_SPAWNED',
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: { animal: animalValue, spawnedAtTick, narration: null },
      narration: null,
    },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick: spawnedAtTick,
  }
}

function migratedEvent(sequence: number, animalId: string, speciesId: string, fromTileId: string, toTileId: string, waveId: string, migratedAtTick: number): Event {
  return {
    sequence,
    eventId: `event-migrated-${sequence}`,
    eventType: 'ANIMAL_MIGRATED',
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: { animalId, speciesId, fromTileId, toTileId, waveId, migratedAtTick, migrationType: 'pressure' },
      narration: null,
    },
    deterministicKey: `key-migrated-${sequence}`,
    version: 1,
    tick: migratedAtTick,
  }
}

function killedEvent(sequence: number, animalId: string, speciesId: string, tileId: string, killedAtTick: number): Event {
  return {
    sequence,
    eventId: `event-kill-${sequence}`,
    eventType: 'ANIMAL_KILLED',
    occurredAt: 0,
    actorId: 'forest.hunter.lyra',
    payload: {
      actorType: 'npc',
      data: {
        huntId: 'hunt-a',
        animalId,
        speciesId,
        tileId,
        killedByNpcId: 'forest.hunter.lyra',
        killedAtTick,
        narration: 'animal killed',
      },
      narration: 'animal killed',
    },
    deterministicKey: `key-kill-${sequence}`,
    version: 1,
    tick: killedAtTick,
  }
}

function reproducedEvent(sequence: number, animalValue: Animal, parentAnimalIds: readonly [string, string], reproducedAtTick: number): Event {
  return {
    sequence,
    eventId: `event-reproduction-${sequence}`,
    eventType: 'ANIMAL_REPRODUCED',
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: { animal: animalValue, parentAnimalIds, reproducedAtTick, narration: null },
      narration: null,
    },
    deterministicKey: `key-reproduction-${sequence}`,
    version: 1,
    tick: reproducedAtTick,
  }
}

function starvedEvent(sequence: number, predatorAnimalId: string, predatorSpeciesId: string, tileId: string, starvedAtTick: number): Event {
  return {
    sequence,
    eventId: `event-starved-${sequence}`,
    eventType: 'ANIMAL_STARVED',
    occurredAt: 0,
    actorId: `ecosystem.predator.${predatorSpeciesId}`,
    payload: {
      actorType: 'system',
      data: {
        starvationId: `starvation-${sequence}`,
        predatorAnimalId,
        predatorSpeciesId,
        tileId,
        starvationStage: 'scarce_prey',
        starvedAtTick,
        narration: null,
      },
      narration: null,
    },
    deterministicKey: `key-starved-${sequence}`,
    version: 1,
    tick: starvedAtTick,
  }
}

function animal(id: string, speciesId: string, tileId: string, biomeRegion: Animal['biomeRegion']): Animal {
  return {
    id,
    speciesId,
    tileId,
    biomeRegion,
    position: { subCol: 1, subRow: 2, subZ: 0 },
    state: 'idle',
    hunger: 0,
    health: 100,
    fear: 50,
    aggression: 5,
    packId: null,
    migrationTarget: null,
    currentTarget: null,
    reproductionCooldown: 0,
    lifecycleStage: 'adult',
    ownerSettlementId: null,
    domesticatedBy: null,
  }
}
