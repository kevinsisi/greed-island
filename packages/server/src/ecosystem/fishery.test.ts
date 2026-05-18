import { describe, expect, it } from 'vitest'
import { FISHERY_COLLAPSE_THRESHOLD, FISHERY_DEFAULT_DENSITY, FISHERY_RECOVERY_RATE } from '../config/world.js'
import type { FisheryDensityRow } from '../projections/fisheryDensity.js'
import { isFisherRole, isFisheryTile, planFisheryHarvest, planFisheryPassiveRegen } from './fishery.js'

describe('fishery policy', () => {
  it('recognizes coastal fishery tiles and fisher roles', () => {
    expect(isFisheryTile({ id: 't_dock', biome: 'water' })).toBe(true)
    expect(isFisheryTile({ id: 't_central', biome: 'grass' })).toBe(false)
    expect(isFisherRole('湖心漁夫', 'Lake-Heart Fisher')).toBe(true)
    expect(isFisherRole('商人', 'Merchant')).toBe(false)
  })

  it('plans deterministic harvest and collapse crossing', () => {
    const plan = planFisheryHarvest({
      tick: 10,
      npcId: 'temple.fisher.yu_yan_bin',
      roleZh: '湖心漁夫',
      roleEn: 'Lake-Heart Fisher',
      tile: { id: 't_temple', name: '霓港區', biome: 'water', x: 0, y: 0 },
      fishery: row(FISHERY_COLLAPSE_THRESHOLD + 1),
    })
    expect(plan?.densityAfter).toBe(9)
    expect(plan?.collapsed).toBe(true)
  })

  it('does not harvest when already collapsed', () => {
    expect(planFisheryHarvest({
      tick: 10,
      npcId: 'temple.fisher.yu_yan_bin',
      roleZh: '湖心漁夫',
      roleEn: 'Lake-Heart Fisher',
      tile: { id: 't_temple', name: '霓港區', biome: 'water', x: 0, y: 0 },
      fishery: { ...row(0), collapsed: true },
    })).toBeNull()
  })
})

describe('planFisheryPassiveRegen', () => {
  it('returns regen plan for tile with density below default', () => {
    const plans = planFisheryPassiveRegen({
      tick: 100,
      fisheryRows: [row(50)],
    })
    expect(plans).toHaveLength(1)
    expect(plans[0]!.tileId).toBe('t_temple')
    expect(plans[0]!.density).toBe(50 + FISHERY_RECOVERY_RATE)
    expect(plans[0]!.tick).toBe(100)
  })

  it('skips tile already at default density', () => {
    const plans = planFisheryPassiveRegen({
      tick: 100,
      fisheryRows: [row(FISHERY_DEFAULT_DENSITY)],
    })
    expect(plans).toHaveLength(0)
  })

  it('skips tile with zero density', () => {
    const plans = planFisheryPassiveRegen({
      tick: 100,
      fisheryRows: [{ ...row(0), collapsed: true }],
    })
    expect(plans).toHaveLength(0)
  })

  it('caps regen at default density', () => {
    const plans = planFisheryPassiveRegen({
      tick: 100,
      fisheryRows: [row(FISHERY_DEFAULT_DENSITY - 1)],
    })
    expect(plans[0]!.density).toBe(FISHERY_DEFAULT_DENSITY)
  })

  it('returns regen for collapsed tile when density > 0', () => {
    const plans = planFisheryPassiveRegen({
      tick: 100,
      fisheryRows: [{ ...row(15), collapsed: true }],
    })
    expect(plans).toHaveLength(1)
    expect(plans[0]!.density).toBe(15 + FISHERY_RECOVERY_RATE)
  })
})

function row(density: number): FisheryDensityRow {
  return { tileId: 't_temple', density, harvestedTotal: 0, collapsed: false, lastUpdatedTick: 0, lastSequence: 0 }
}
