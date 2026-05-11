import type { MapNpc } from '../game/MapScene'
import type { DistrictId } from '../game/districts'
import type { NpcSummary } from '../state/types'

const KNOWN_DISTRICTS = new Set<DistrictId>([
  't_forest',
  't_mountain',
  't_temple',
  't_dimai',
  't_desert',
  't_central',
  't_ruin',
  't_dock'
])

export function areaOutdoorNpcs(npcs: readonly NpcSummary[], tileId: string): NpcSummary[] {
  return npcs.filter(
    (npc) => npc.location === tileId && !npc.buildingId && npc.activity !== 'move'
  )
}

export function hubMapNpcs(npcs: readonly NpcSummary[], locale: 'zh' | 'en' = 'zh'): MapNpc[] {
  return npcs
    .filter((npc) => isKnownDistrictId(npc.location))
    .filter((npc) => !npc.buildingId)
    .map((npc) => {
      const route = normalizeTravelRoute(npc.travelRoute)
      const base: MapNpc = {
        id: npc.id,
        name: npc.name,
        shortName: npc.name.charAt(0),
        districtId: npc.location as DistrictId
      }
      if (route) base.travelRoute = route
      if (typeof npc.color === 'number') base.color = npc.color
      if (npc.activity) base.activity = npc.activity
      if (typeof npc.subCol === 'number') base.subCol = npc.subCol
      if (typeof npc.subRow === 'number') base.subRow = npc.subRow
      if (typeof npc.mood === 'number') base.mood = npc.mood
      if (typeof npc.health === 'number') base.health = npc.health
      if (npc.intentLine) base.intentLine = locale === 'zh' ? npc.intentLine.zh : npc.intentLine.en
      return base
    })
}

function normalizeTravelRoute(route: NpcSummary['travelRoute']): MapNpc['travelRoute'] | null {
  if (!route) return null
  if (
    !isKnownDistrictId(route.fromTile) ||
    !isKnownDistrictId(route.toTile) ||
    !isKnownDistrictId(route.targetTile)
  ) {
    return null
  }
  return {
    fromDistrictId: route.fromTile,
    toDistrictId: route.toTile,
    targetDistrictId: route.targetTile
  }
}

function isKnownDistrictId(id: string): id is DistrictId {
  return KNOWN_DISTRICTS.has(id as DistrictId)
}
