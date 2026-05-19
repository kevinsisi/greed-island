import { describe, expect, it } from 'vitest'
import { planMountAssignment } from './mountPlanner.js'

const BASE = {
  tick: 100,
  settlementId: 's1',
}

function animal(id: string, mountedBy: string | null = null, mountEligible = true) {
  return { animalId: id, speciesId: 'marsh_yak', mountEligible, mountedBy, role: 'livestock' as const }
}

function npc(id: string, mountedAnimalId: string | null = null) {
  return { npcId: id, mountedAnimalId }
}

describe('planMountAssignment', () => {
  it('assigns mount to unmounted carrier', () => {
    const result = planMountAssignment({ ...BASE, livestock: [animal('a1')], npcs: [npc('n1')] })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'MOUNT_ASSIGNED', animalId: 'a1', npcId: 'n1', settlementId: 's1' })
  })

  it('returns empty when no eligible animals', () => {
    const result = planMountAssignment({ ...BASE, livestock: [], npcs: [npc('n1')] })
    expect(result).toHaveLength(0)
  })

  it('returns empty when all npcs already mounted', () => {
    const result = planMountAssignment({
      ...BASE,
      livestock: [animal('a1')],
      npcs: [npc('n1', 'a0')],
    })
    expect(result).toHaveLength(0)
  })

  it('does not assign already-mounted animal', () => {
    const result = planMountAssignment({
      ...BASE,
      livestock: [animal('a1', 'other_npc')],
      npcs: [npc('n1')],
    })
    expect(result).toHaveLength(0)
  })

  it('does not assign non-eligible species', () => {
    const result = planMountAssignment({
      ...BASE,
      livestock: [{ animalId: 'a1', speciesId: 'marsh_fish', mountEligible: false, mountedBy: null, role: 'livestock' as const }],
      npcs: [npc('n1')],
    })
    expect(result).toHaveLength(0)
  })

  it('assigns one mount per npc', () => {
    const result = planMountAssignment({
      ...BASE,
      livestock: [animal('a1'), animal('a2')],
      npcs: [npc('n1'), npc('n2')],
    })
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.npcId).sort()).toEqual(['n1', 'n2'])
  })
})
