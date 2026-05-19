import { describe, expect, it } from 'vitest'
import { planBreeding } from './breedingPlanner.js'
import { BREEDING_CADENCE_TICKS } from '../config/world.js'

const BASE = {
  tick: BREEDING_CADENCE_TICKS,
  settlementId: 's1',
  speciesId: 'marsh_yak',
  livestockCount: 2,
  ranchCapacity: 8,
}

describe('planBreeding', () => {
  it('emits intent at cadence with two livestock', () => {
    const result = planBreeding(BASE, 'seed')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('LIVESTOCK_BRED')
    expect(result!.settlementId).toBe('s1')
    expect(result!.speciesId).toBe('marsh_yak')
  })

  it('returns null when tick is not cadence tick', () => {
    expect(planBreeding({ ...BASE, tick: BREEDING_CADENCE_TICKS + 1 }, 'seed')).toBeNull()
  })

  it('returns null when only one animal', () => {
    expect(planBreeding({ ...BASE, livestockCount: 1 }, 'seed')).toBeNull()
  })

  it('returns null when ranch at capacity', () => {
    expect(planBreeding({ ...BASE, livestockCount: 8 }, 'seed')).toBeNull()
  })

  it('allows breeding when livestock count is exactly 2', () => {
    expect(planBreeding({ ...BASE, livestockCount: 2 }, 'seed')).not.toBeNull()
  })

  it('produces deterministic newAnimalId', () => {
    const r1 = planBreeding(BASE, 'abc')
    const r2 = planBreeding(BASE, 'abc')
    expect(r1!.newAnimalId).toBe(r2!.newAnimalId)
  })
})
