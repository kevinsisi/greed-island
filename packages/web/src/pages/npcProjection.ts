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
  't_dock',
  't_salt_marsh'
])

const CLEAR_AREA_VISIBLE_NPC_LIMIT = 24
const STORM_AREA_VISIBLE_NPC_LIMIT = 12

type AreaVisibilityWeather = 'clear' | 'overcast' | 'mist' | 'storm' | 'breeze'

export function areaOutdoorNpcs(npcs: readonly NpcSummary[], tileId: string): NpcSummary[] {
  return npcs.filter(
    (npc) => npc.location === tileId && isAreaSociallyAvailableNpc(npc)
  )
}

export function isAreaSociallyAvailableNpc(npc: NpcSummary): boolean {
  if (npc.deceased || npc.buildingId) return false
  if (npc.activity === 'move' || npc.activity === 'sleep') return false
  return true
}

export function areaVisibleNpcs(
  npcs: readonly NpcSummary[],
  tileId: string,
  weather: AreaVisibilityWeather = 'clear'
): NpcSummary[] {
  const outdoor = areaOutdoorNpcs(npcs, tileId)
  const limit = weather === 'storm' ? STORM_AREA_VISIBLE_NPC_LIMIT : CLEAR_AREA_VISIBLE_NPC_LIMIT
  if (outdoor.length <= limit) return outdoor
  return outdoor
    .slice()
    .sort((a, b) => areaVisibilityScore(b) - areaVisibilityScore(a) || areaNpcStableKey(a).localeCompare(areaNpcStableKey(b)))
    .slice(0, limit)
}

function areaVisibilityScore(npc: NpcSummary): number {
  let score = 0
  if (npc.recentUtterance?.text?.trim()) score += 100
  if (npc.cognitiveLine?.zh?.trim() || npc.cognitiveLine?.en?.trim()) score += 20
  if (npc.activity && npc.activity !== 'idle') score += 10
  return score
}

function areaNpcStableKey(npc: NpcSummary): string {
  const row = typeof npc.subRow === 'number' ? npc.subRow.toString().padStart(2, '0') : '99'
  const col = typeof npc.subCol === 'number' ? npc.subCol.toString().padStart(2, '0') : '99'
  return `${row}:${col}:${npc.id}`
}

export function hubMapNpcs(npcs: readonly NpcSummary[], locale: 'zh' | 'en' = 'zh'): MapNpc[] {
  return npcs
    .filter((npc) => isKnownDistrictId(npc.location))
    .map((npc) => {
      const route = normalizeTravelRoute(npc.travelRoute)
      if (npc.buildingId || npc.activity !== 'move' || !route) return null
      const base: MapNpc = {
        id: npc.id,
        name: npc.name,
        shortName: npc.name.charAt(0),
        districtId: npc.location as DistrictId
      }
      base.travelRoute = route
      if (typeof npc.color === 'number') base.color = npc.color
      if (npc.activity) base.activity = npc.activity
      if (typeof npc.subCol === 'number') base.subCol = npc.subCol
      if (typeof npc.subRow === 'number') base.subRow = npc.subRow
      if (typeof npc.mood === 'number') base.mood = npc.mood
      if (typeof npc.health === 'number') base.health = npc.health
      if (npc.intentLine) base.intentLine = locale === 'zh' ? npc.intentLine.zh : npc.intentLine.en
      return base
    })
    .filter((npc): npc is MapNpc => npc !== null)
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
