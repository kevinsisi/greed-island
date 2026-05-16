import { DISTRICTS, isDistrict, type DistrictId } from '../game/districts'
import { isChronicleSurfaceEvent } from '../state/eventVisibility'
import type { EventSummary } from '../state/types'

export type HubActivityKind = 'work' | 'construction' | 'danger' | 'movement' | 'pressure'

export type HubActivitySummary = Readonly<{
  districtId: DistrictId
  count: number
  latestTick: number
  latestNarration: string | null
  kinds: readonly HubActivityKind[]
}>

const MAX_ACTIVITY_EVENTS = 80
const MAX_ACTIVITY_AGE_TICKS = 36

const ACTIVITY_KIND_BY_EVENT_TYPE: Readonly<Record<string, HubActivityKind>> = {
  NPC_PRODUCTIVE_ACTION: 'work',
  CONSTRUCTION_INITIATE: 'construction',
  CONSTRUCTION_PROJECT_PROGRESS: 'construction',
  BUILDING_CONSTRUCTED: 'construction',
  MAP_TILE_UNLOCKED: 'construction',
  ANIMAL_TARGETED_NPC: 'danger',
  ANIMAL_ATTACKED_NPC: 'danger',
  ANIMAL_RETALIATED: 'danger',
  ANIMAL_KILLED: 'danger',
  BUILDING_ENTER: 'movement',
  BUILDING_LEAVE: 'movement',
  NPC_MOVE: 'movement',
  AREA_PRESSURE: 'pressure',
  WORLD_EVENT_SPAWN: 'pressure',
}

const KIND_PRIORITY: Readonly<Record<HubActivityKind, number>> = {
  danger: 0,
  construction: 1,
  pressure: 2,
  work: 3,
  movement: 4,
}

export function buildHubActivitySummaries(events: readonly EventSummary[]): readonly HubActivitySummary[] {
  const newestTick = events.reduce((max, event) => Math.max(max, event.tick), 0)
  const sorted = [...events]
    .sort((a, b) => (b.tick - a.tick) || (b.sequence - a.sequence))
    .slice(0, MAX_ACTIVITY_EVENTS)
  const byDistrict = new Map<DistrictId, {
    count: number
    latestTick: number
    latestNarration: string | null
    kinds: Set<HubActivityKind>
  }>()

  for (const event of sorted) {
    if (newestTick > 0 && newestTick - event.tick > MAX_ACTIVITY_AGE_TICKS) continue
    const kind = ACTIVITY_KIND_BY_EVENT_TYPE[event.eventType]
    if (!kind) continue
    if (!isMapVisibleActivityEvent(event)) continue
    const districts = districtIdsForEvent(event)
    for (const districtId of districts) {
      const current = byDistrict.get(districtId)
      if (!current) {
        byDistrict.set(districtId, {
          count: 1,
          latestTick: event.tick,
          latestNarration: event.narration?.trim() || null,
          kinds: new Set([kind]),
        })
        continue
      }
      current.count += 1
      current.kinds.add(kind)
      if (event.tick > current.latestTick) {
        current.latestTick = event.tick
        current.latestNarration = event.narration?.trim() || current.latestNarration
      }
    }
  }

  return Array.from(byDistrict, ([districtId, summary]) => ({
    districtId,
    count: summary.count,
    latestTick: summary.latestTick,
    latestNarration: summary.latestNarration,
    kinds: Array.from(summary.kinds).sort((a, b) => KIND_PRIORITY[a] - KIND_PRIORITY[b]),
  })).sort((a, b) => a.districtId.localeCompare(b.districtId))
}

function isMapVisibleActivityEvent(event: EventSummary): boolean {
  // Narrated events use the same guard as public chronicle surfaces, so raw
  // internal ids do not leak onto the Hub map. Non-narrated movement facts are
  // still useful as spatial life pings and carry no public text.
  if (event.narration?.trim()) return isChronicleSurfaceEvent(event)
  return event.eventType === 'BUILDING_ENTER' || event.eventType === 'BUILDING_LEAVE' || event.eventType === 'NPC_MOVE'
}

function districtIdsForEvent(event: EventSummary): readonly DistrictId[] {
  const payload = event.payload
  const data = payloadData(event.payload)
  const ids = new Set<DistrictId>()
  for (const source of [payload, data]) {
    for (const key of ['tile', 'tileId', 'targetTileId', 'homeTileId', 'fromTileId', 'toTileId']) {
      addDistrict(ids, source[key])
    }
    addDistrict(ids, source.from)
    addDistrict(ids, source.to)
    addDistrictsFromScope(ids, source.scope)
  }
  return Array.from(ids)
}

function addDistrict(ids: Set<DistrictId>, value: unknown): void {
  if (typeof value !== 'string') return
  if (!(value in DISTRICTS)) return
  const districtId = value as DistrictId
  if (!isDistrict(districtId)) return
  ids.add(districtId)
}

function addDistrictsFromScope(ids: Set<DistrictId>, value: unknown): void {
  if (typeof value !== 'string' || !value.startsWith('region:')) return
  for (const tileId of value.slice('region:'.length).split(',')) addDistrict(ids, tileId)
}

function payloadData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) return data as Record<string, unknown>
  return payload
}
