import { DISTRICTS, isDistrict, type DistrictId } from '../game/districts'
import type { WorldMap } from '../state/types'

export function activeDistrictIdsForHub(map: WorldMap, lifeExpansionFact: unknown): DistrictId[] {
  const ids = new Set<DistrictId>()
  for (const tile of map.tiles) {
    if (tile.id in DISTRICTS && isDistrict(tile.id as DistrictId)) ids.add(tile.id as DistrictId)
  }

  const unlockedTileIds = isRecord(lifeExpansionFact) && Array.isArray(lifeExpansionFact.unlockedTileIds)
    ? lifeExpansionFact.unlockedTileIds
    : []
  for (const id of unlockedTileIds) {
    if (typeof id === 'string' && id in DISTRICTS && isDistrict(id as DistrictId)) ids.add(id as DistrictId)
  }

  return [...ids]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
