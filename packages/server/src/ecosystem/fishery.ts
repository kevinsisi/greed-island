import {
  FISHERY_COLLAPSE_THRESHOLD,
  FISHERY_HARVEST_DELTA,
} from '../config/world.js'
import type { MapTileDef } from '../sim/mapGraph.js'
import type { FisheryDensityRow } from '../projections/fisheryDensity.js'

export type FisheryHarvestPlan = Readonly<{
  tileId: string
  npcId: string
  delta: number
  densityBefore: number
  densityAfter: number
  collapsed: boolean
  tick: number
}>

export function planFisheryHarvest(input: {
  tick: number
  npcId: string
  roleZh: string
  roleEn: string
  tile: MapTileDef | null
  fishery: FisheryDensityRow | null
}): FisheryHarvestPlan | null {
  if (!input.tile || !isFisheryTile(input.tile)) return null
  if (!isFisherRole(input.roleZh, input.roleEn)) return null
  const densityBefore = input.fishery?.density ?? 100
  if (input.fishery?.collapsed) return null
  const densityAfter = Math.max(0, densityBefore - FISHERY_HARVEST_DELTA)
  return {
    tileId: input.tile.id,
    npcId: input.npcId,
    delta: FISHERY_HARVEST_DELTA,
    densityBefore,
    densityAfter,
    collapsed: densityBefore > FISHERY_COLLAPSE_THRESHOLD && densityAfter <= FISHERY_COLLAPSE_THRESHOLD,
    tick: input.tick,
  }
}

export function isFisheryTile(tile: Pick<MapTileDef, 'id' | 'biome'>): boolean {
  return tile.biome === 'water' && (tile.id === 't_dock' || tile.id === 't_temple' || tile.id === 't_salt_marsh')
}

export function isFisherRole(roleZh: string, roleEn: string): boolean {
  return /漁|魚|fisher|fishmonger|net mender/i.test(`${roleZh} ${roleEn}`)
}
