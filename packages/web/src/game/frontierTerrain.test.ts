import { describe, expect, it } from 'vitest'
import { DISTRICTS, DISTRICT_IDS } from './districts'
import { effectiveTerrainAt, terrainMaskForDistrict } from './terrainMask'
import { AREA_DECORATIONS } from './decorations'
import { buildTerrainGrid } from '../components/map/AreaMapSvg'

describe('generated frontier 2D area registration', () => {
  it.each(['t_frontier_badlands', 't_frontier_highland', 't_frontier_cove'] as const)('renders %s as its own district rather than the default area', tileId => {
    expect(DISTRICT_IDS).toContain(tileId)
    expect(DISTRICTS[tileId].nameZh).toBeTruthy()
    expect(AREA_DECORATIONS[tileId]).toBeDefined()
    expect(buildTerrainGrid(tileId, [])).toHaveLength(10)
    expect(effectiveTerrainAt(tileId, 7, 5, [])).not.toBe('blocked')
  })
  it('draws cove rock separately from shallow and deep water', () => {
    const mask = terrainMaskForDistrict('t_frontier_cove')!
    expect(mask[2]![2]).toBe('blocked')
    expect(mask[0]![10]).toBe('shallow_water')
    expect(mask[0]![14]).toBe('open_water')
  })
})
