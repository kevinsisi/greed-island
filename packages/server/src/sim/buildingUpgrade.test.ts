import { describe, expect, it } from 'vitest'
import { planBuildingUpgrades } from './buildingUpgradePlanner.js'

const MIN_AGE = 1000
const MAX_LEVEL = 3

describe('planBuildingUpgrades', () => {
  it('returns empty list when no buildings', () => {
    expect(planBuildingUpgrades({ buildings: [], currentTick: 5000, minAgeTicks: MIN_AGE, maxLevel: MAX_LEVEL })).toHaveLength(0)
  })

  it('upgrades an operational building past age threshold', () => {
    const intents = planBuildingUpgrades({
      buildings: [{ buildingId: 'b_forge', tileId: 't_mountain', state: 'operational', upgradeLevel: 1, lastActivityTick: 0 }],
      currentTick: 2000,
      minAgeTicks: MIN_AGE,
      maxLevel: MAX_LEVEL,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ buildingId: 'b_forge', fromLevel: 1, toLevel: 2 })
  })

  it('does not upgrade a building younger than minAgeTicks', () => {
    const intents = planBuildingUpgrades({
      buildings: [{ buildingId: 'b_forge', tileId: 't_mountain', state: 'operational', upgradeLevel: 1, lastActivityTick: 1500 }],
      currentTick: 2000,
      minAgeTicks: MIN_AGE,
      maxLevel: MAX_LEVEL,
    })
    expect(intents).toHaveLength(0)
  })

  it('does not upgrade a building already at max level', () => {
    const intents = planBuildingUpgrades({
      buildings: [{ buildingId: 'b_forge', tileId: 't_mountain', state: 'operational', upgradeLevel: 3, lastActivityTick: 0 }],
      currentTick: 5000,
      minAgeTicks: MIN_AGE,
      maxLevel: MAX_LEVEL,
    })
    expect(intents).toHaveLength(0)
  })

  it('does not upgrade a damaged building', () => {
    const intents = planBuildingUpgrades({
      buildings: [{ buildingId: 'b_forge', tileId: 't_mountain', state: 'damaged', upgradeLevel: 1, lastActivityTick: 0 }],
      currentTick: 5000,
      minAgeTicks: MIN_AGE,
      maxLevel: MAX_LEVEL,
    })
    expect(intents).toHaveLength(0)
  })

  it('upgrades multiple qualifying buildings in one sweep', () => {
    const intents = planBuildingUpgrades({
      buildings: [
        { buildingId: 'b_a', tileId: 't_dock', state: 'operational', upgradeLevel: 1, lastActivityTick: 0 },
        { buildingId: 'b_b', tileId: 't_forest', state: 'operational', upgradeLevel: 2, lastActivityTick: 0 },
      ],
      currentTick: 5000,
      minAgeTicks: MIN_AGE,
      maxLevel: MAX_LEVEL,
    })
    expect(intents).toHaveLength(2)
    expect(intents.find(i => i.buildingId === 'b_b')?.toLevel).toBe(3)
  })
})
