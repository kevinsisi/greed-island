import { describe, expect, it } from 'vitest'
import { LivestockRegistryProjection } from './livestockRegistry.js'
import type { Event } from '../kernel/types.js'

function makeEvent(eventType: string, data: Record<string, unknown>, sequence = 1): Event {
  return {
    id: `evt-${sequence}`,
    eventType,
    sequence,
    tick: data.tick as number ?? 1,
    createdAt: '2024-01-01T00:00:00Z',
    payload: { actorType: 'system', data, narration: null },
  } as unknown as Event
}

describe('LivestockRegistryProjection', () => {
  it('starts empty', () => {
    const proj = new LivestockRegistryProjection()
    expect(proj.getBySettlement('s1')).toHaveLength(0)
  })

  it('adds row on ANIMAL_DOMESTICATED', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('ANIMAL_DOMESTICATED', { animalId: 'a1', speciesId: 'marsh_yak', settlementId: 's1', tick: 10 }))
    const rows = proj.getBySettlement('s1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ animalId: 'a1', speciesId: 'marsh_yak', role: 'livestock', mountedBy: null, settlementId: 's1', acquiredAtTick: 10 })
  })

  it('adds row on LIVESTOCK_BRED', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('LIVESTOCK_BRED', { newAnimalId: 'a2', speciesId: 'marsh_yak', settlementId: 's1', tick: 20 }))
    expect(proj.getLivestockCount('s1', 'marsh_yak')).toBe(1)
  })

  it('removes row on LIVESTOCK_SLAUGHTERED', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('ANIMAL_DOMESTICATED', { animalId: 'a1', speciesId: 'marsh_yak', settlementId: 's1', tick: 10 }, 1))
    proj.project(makeEvent('LIVESTOCK_SLAUGHTERED', { animalId: 'a1', settlementId: 's1', speciesId: 'marsh_yak', goods: [], tick: 15 }, 2))
    expect(proj.getBySettlement('s1')).toHaveLength(0)
  })

  it('updates role and mountedBy on MOUNT_ASSIGNED', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('ANIMAL_DOMESTICATED', { animalId: 'a1', speciesId: 'marsh_yak', settlementId: 's1', tick: 10 }, 1))
    proj.project(makeEvent('MOUNT_ASSIGNED', { animalId: 'a1', npcId: 'npc1', settlementId: 's1', tick: 20 }, 2))
    const row = proj.getBySettlement('s1')[0]!
    expect(row.role).toBe('mount')
    expect(row.mountedBy).toBe('npc1')
  })

  it('getLivestockCount counts correctly across species', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('ANIMAL_DOMESTICATED', { animalId: 'a1', speciesId: 'marsh_yak', settlementId: 's1', tick: 1 }, 1))
    proj.project(makeEvent('LIVESTOCK_BRED', { newAnimalId: 'a2', speciesId: 'marsh_yak', settlementId: 's1', tick: 2 }, 2))
    expect(proj.getLivestockCount('s1', 'marsh_yak')).toBe(2)
    expect(proj.getLivestockCount('s1', 'other_species')).toBe(0)
    expect(proj.getLivestockCount('s2', 'marsh_yak')).toBe(0)
  })

  it('getMountedAnimalIdForNpc returns correct animal', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('ANIMAL_DOMESTICATED', { animalId: 'a1', speciesId: 'marsh_yak', settlementId: 's1', tick: 1 }, 1))
    proj.project(makeEvent('MOUNT_ASSIGNED', { animalId: 'a1', npcId: 'npc1', settlementId: 's1', tick: 2 }, 2))
    expect(proj.getMountedAnimalIdForNpc('npc1')).toBe('a1')
    expect(proj.getMountedAnimalIdForNpc('npc2')).toBeNull()
  })

  it('rebuilds identically from EventLog', () => {
    const events: Event[] = [
      makeEvent('ANIMAL_DOMESTICATED', { animalId: 'a1', speciesId: 'marsh_yak', settlementId: 's1', tick: 1 }, 1),
      makeEvent('LIVESTOCK_BRED', { newAnimalId: 'a2', speciesId: 'marsh_yak', settlementId: 's1', tick: 2 }, 2),
      makeEvent('MOUNT_ASSIGNED', { animalId: 'a1', npcId: 'npc1', settlementId: 's1', tick: 3 }, 3),
    ]

    const incremental = new LivestockRegistryProjection()
    for (const ev of events) incremental.project(ev)

    const fromScratch = new LivestockRegistryProjection()
    fromScratch.rebuildFromEvents(events)

    expect(incremental.canonicalHash()).toBe(fromScratch.canonicalHash())
  })

  it('ignores MOUNT_ASSIGNED for unknown animal', () => {
    const proj = new LivestockRegistryProjection()
    proj.project(makeEvent('MOUNT_ASSIGNED', { animalId: 'unknown', npcId: 'npc1', settlementId: 's1', tick: 1 }))
    expect(proj.list()).toHaveLength(0)
  })
})
