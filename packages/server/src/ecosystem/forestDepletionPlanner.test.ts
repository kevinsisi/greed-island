import { describe, expect, it } from 'vitest'
import { planForestDepletion } from './forestDepletionPlanner.js'
import { FOREST_DEPLETION_PRESSURE_THRESHOLD } from '../config/world.js'

describe('planForestDepletion', () => {
  it('returns null for non-forest biome even at high pressure', () => {
    expect(planForestDepletion({ biome: 'water', pressureLevel: 100, isCurrentlyDepleted: false })).toBeNull()
    expect(planForestDepletion({ biome: 'desert', pressureLevel: 100, isCurrentlyDepleted: false })).toBeNull()
    expect(planForestDepletion({ biome: 'grass', pressureLevel: 100, isCurrentlyDepleted: false })).toBeNull()
  })

  it('returns null when forest pressure is below threshold', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: FOREST_DEPLETION_PRESSURE_THRESHOLD - 1,
      isCurrentlyDepleted: false,
    })).toBeNull()
  })

  it('returns deplete when forest pressure reaches threshold', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: FOREST_DEPLETION_PRESSURE_THRESHOLD,
      isCurrentlyDepleted: false,
    })).toBe('deplete')
  })

  it('returns deplete when forest pressure exceeds threshold', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: 100,
      isCurrentlyDepleted: false,
    })).toBe('deplete')
  })

  it('returns null when already depleted (no duplicate FOREST_DEPLETED)', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: FOREST_DEPLETION_PRESSURE_THRESHOLD,
      isCurrentlyDepleted: true,
    })).toBeNull()
  })

  it('returns recover when depleted and pressure returns to 0', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: 0,
      isCurrentlyDepleted: true,
    })).toBe('recover')
  })

  it('returns null when not depleted and pressure is 0', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: 0,
      isCurrentlyDepleted: false,
    })).toBeNull()
  })

  it('returns null when depleted but pressure has not fully recovered', () => {
    expect(planForestDepletion({
      biome: 'forest',
      pressureLevel: 20,
      isCurrentlyDepleted: true,
    })).toBeNull()
  })
})
