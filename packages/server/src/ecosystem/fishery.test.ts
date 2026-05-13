import { describe, expect, it } from 'vitest'
import { FISHERY_COLLAPSE_THRESHOLD } from '../config/world.js'
import type { FisheryDensityRow } from '../projections/fisheryDensity.js'
import { isFisherRole, isFisheryTile, planFisheryHarvest } from './fishery.js'

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

function row(density: number): FisheryDensityRow {
  return { tileId: 't_temple', density, harvestedTotal: 0, collapsed: false, lastUpdatedTick: 0, lastSequence: 0 }
}
