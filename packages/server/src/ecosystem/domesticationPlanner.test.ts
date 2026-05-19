import { describe, expect, it } from 'vitest'
import { planDomestication } from './domesticationPlanner.js'
import { DOMESTICATION_MIN_WILD_POP } from '../config/world.js'

const BASE = {
  tick: 100,
  settlementId: 's1',
  settlementTileId: 't_salt_marsh',
  speciesId: 'marsh_yak',
  wildPopOnTile: DOMESTICATION_MIN_WILD_POP,
  currentLivestockCount: 0,
  ranchCapacity: 8,
  wildAnimalIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
}

describe('planDomestication', () => {
  it('emits intent when all conditions met', () => {
    const result = planDomestication(BASE)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('ANIMAL_DOMESTICATED')
    expect(result!.animalId).toBe('a1')
    expect(result!.speciesId).toBe('marsh_yak')
    expect(result!.settlementId).toBe('s1')
  })

  it('returns null when wild population too low', () => {
    expect(planDomestication({ ...BASE, wildPopOnTile: DOMESTICATION_MIN_WILD_POP - 1 })).toBeNull()
  })

  it('returns null when ranch at capacity', () => {
    expect(planDomestication({ ...BASE, currentLivestockCount: 8 })).toBeNull()
  })

  it('returns null when no ranch (capacity 0)', () => {
    expect(planDomestication({ ...BASE, ranchCapacity: 0 })).toBeNull()
  })

  it('returns null when no wild animal ids', () => {
    expect(planDomestication({ ...BASE, wildAnimalIds: [] })).toBeNull()
  })

  it('allows domestication when livestock below capacity', () => {
    expect(planDomestication({ ...BASE, currentLivestockCount: 7, ranchCapacity: 8 })).not.toBeNull()
  })
})
