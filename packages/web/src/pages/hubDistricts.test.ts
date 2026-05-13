import { describe, expect, it } from 'vitest'
import { activeDistrictIdsForHub } from './hubDistricts'
import type { WorldMap } from '../state/types'

const baseMap: WorldMap = {
  width: 8,
  height: 6,
  tiles: [
    { id: 't_central', name: '夜潮區', x: 4, y: 3, biome: 'grass', npcIds: [] },
    { id: 't_dock', name: '碼頭區', x: 3, y: 5, biome: 'water', npcIds: [] }
  ]
}

describe('hub district activity projection', () => {
  it('keeps unlocked expansion districts active even before the map request catches up', () => {
    expect(activeDistrictIdsForHub(baseMap, { unlockedTileIds: ['t_salt_marsh'] })).toContain('t_salt_marsh')
  })

  it('does not activate expansion districts from fixture map alone', () => {
    expect(activeDistrictIdsForHub(baseMap, null)).not.toContain('t_salt_marsh')
  })
})
