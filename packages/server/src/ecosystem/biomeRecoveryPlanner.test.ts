import { describe, expect, it } from 'vitest'
import { planBiomeRecovery } from './biomeRecoveryPlanner.js'

describe('planBiomeRecovery', () => {
  it('returns true for forest tile on recover decision', () => {
    expect(planBiomeRecovery({ biome: 'forest', decision: 'recover' })).toBe(true)
  })

  it('returns false for forest tile on raise decision', () => {
    expect(planBiomeRecovery({ biome: 'forest', decision: 'raise' })).toBe(false)
  })

  it('returns false for forest tile with null decision', () => {
    expect(planBiomeRecovery({ biome: 'forest', decision: null })).toBe(false)
  })

  it('returns false for non-forest biome even on recover', () => {
    expect(planBiomeRecovery({ biome: 'water', decision: 'recover' })).toBe(false)
    expect(planBiomeRecovery({ biome: 'desert', decision: 'recover' })).toBe(false)
    expect(planBiomeRecovery({ biome: 'grass', decision: 'recover' })).toBe(false)
  })

  it('returns false for unknown biome on recover', () => {
    expect(planBiomeRecovery({ biome: '', decision: 'recover' })).toBe(false)
  })
})
