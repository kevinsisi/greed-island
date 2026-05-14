import { describe, expect, it } from 'vitest'
import { AnimalMigrationProjection } from './animalMigration.js'
import type { Event } from '../kernel/types.js'

describe('AnimalMigrationProjection', () => {
  it('creates wave row on MIGRATION_WAVE_STARTED with count = 0', () => {
    const proj = new AnimalMigrationProjection()
    proj.project(waveStarted('wave-1', 'forest_deer', 't_forest', 't_mountain', 'pressure', 100))

    const rows = proj.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      waveId: 'wave-1',
      speciesId: 'forest_deer',
      fromTileId: 't_forest',
      toTileId: 't_mountain',
      migrationType: 'pressure',
      startedAtTick: 100,
      count: 0,
    })
  })

  it('increments count on ANIMAL_MIGRATED with known waveId', () => {
    const proj = new AnimalMigrationProjection()
    proj.project(waveStarted('wave-1', 'forest_deer', 't_forest', 't_mountain', 'pressure', 100))
    proj.project(animalMigrated('wave-1', 'deer-a', 'forest_deer', 't_forest', 't_mountain', 100))
    proj.project(animalMigrated('wave-1', 'deer-b', 'forest_deer', 't_forest', 't_mountain', 100))

    expect(proj.list()[0]?.count).toBe(2)
  })

  it('ignores ANIMAL_MIGRATED with unknown waveId', () => {
    const proj = new AnimalMigrationProjection()
    proj.project(animalMigrated('nonexistent-wave', 'deer-a', 'forest_deer', 't_forest', 't_mountain', 100))
    expect(proj.list()).toHaveLength(0)
  })

  it('first-write-wins on duplicate MIGRATION_WAVE_STARTED', () => {
    const proj = new AnimalMigrationProjection()
    proj.project(waveStarted('wave-1', 'forest_deer', 't_forest', 't_mountain', 'pressure', 100))
    proj.project(animalMigrated('wave-1', 'deer-a', 'forest_deer', 't_forest', 't_mountain', 100))
    proj.project(waveStarted('wave-1', 'forest_deer', 't_forest', 't_mountain', 'seasonal', 200))

    const row = proj.list()[0]!
    expect(row.migrationType).toBe('pressure')
    expect(row.startedAtTick).toBe(100)
    expect(row.count).toBe(1)
  })

  it('rebuild from events yields same result as incremental projection', () => {
    const events: Event[] = [
      waveStarted('wave-1', 'marsh_heron', 't_salt_marsh', 't_dock', 'seasonal', 200),
      animalMigrated('wave-1', 'heron-a', 'marsh_heron', 't_salt_marsh', 't_dock', 200),
    ]

    const incremental = new AnimalMigrationProjection()
    for (const ev of events) incremental.project(ev)

    const rebuilt = new AnimalMigrationProjection()
    rebuilt.rebuildFromEvents(events)

    expect(incremental.canonicalHash()).toBe(rebuilt.canonicalHash())
    expect(incremental.list()).toEqual(rebuilt.list())
  })

  it('canonicalHash is stable for empty projection', () => {
    const proj = new AnimalMigrationProjection()
    expect(proj.canonicalHash()).toBe(new AnimalMigrationProjection().canonicalHash())
  })
})

// ---- helpers ----

let seq = 0
function nextSeq() { return ++seq }

function waveStarted(
  waveId: string,
  speciesId: string,
  fromTileId: string,
  toTileId: string,
  migrationType: 'pressure' | 'seasonal',
  startedAtTick: number,
): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-wave-${s}`,
    eventType: 'MIGRATION_WAVE_STARTED',
    actorId: 'system',
    occurredAt: 0,
    tick: startedAtTick,
    payload: { actorType: 'system', data: { waveId, speciesId, fromTileId, toTileId, migrationType, startedAtTick }, narration: null },
    deterministicKey: `key-wave-${s}`,
    version: 1,
  }
}

function animalMigrated(
  waveId: string,
  animalId: string,
  speciesId: string,
  fromTileId: string,
  toTileId: string,
  migratedAtTick: number,
  migrationType: 'pressure' | 'seasonal' = 'pressure',
): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-migrated-${s}`,
    eventType: 'ANIMAL_MIGRATED',
    actorId: 'system',
    occurredAt: 0,
    tick: migratedAtTick,
    payload: { actorType: 'system', data: { waveId, animalId, speciesId, fromTileId, toTileId, migratedAtTick, migrationType }, narration: null },
    deterministicKey: `key-migrated-${s}`,
    version: 1,
  }
}
