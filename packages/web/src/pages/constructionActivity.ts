import type { MapConstructionActivity } from '../game/MapScene'
import { DISTRICTS, isDistrict, type DistrictId } from '../game/districts'
import type { EventSummary, NpcSummary } from '../state/types'

export function constructionActivitiesFor(
  events: readonly EventSummary[],
  npcs: readonly NpcSummary[]
): MapConstructionActivity[] {
  const npcNameById = new Map(npcs.map((npc) => [npc.id, npc.name]))
  const sortedEvents = [...events].sort((a, b) => (b.tick - a.tick) || (b.sequence - a.sequence))
  const completedDistricts = new Set<DistrictId>()
  const activities = new Map<DistrictId, {
    progressAfter: number
    targetProgress: number
    builderIds: Set<string>
  }>()

  for (const event of sortedEvents) {
    if (event.eventType !== 'CONSTRUCTION_PROJECT_PROGRESS') continue
    const payload = event.payload
    const districtId = typeof payload.targetTileId === 'string' ? payload.targetTileId : null
    if (!districtId || !(districtId in DISTRICTS) || !isDistrict(districtId as DistrictId)) continue
    const district = districtId as DistrictId
    if (completedDistricts.has(district)) continue

    const progressAfter = typeof payload.progressAfter === 'number' ? payload.progressAfter : 0
    const targetProgress = typeof payload.targetProgress === 'number' ? payload.targetProgress : 1
    const activity = activities.get(district)
    if (!activity) {
      if (progressAfter >= targetProgress) {
        completedDistricts.add(district)
        continue
      }
      activities.set(district, { progressAfter, targetProgress, builderIds: builderIdsFor(payload) })
      continue
    }

    for (const builderId of builderIdsFor(payload)) activity.builderIds.add(builderId)
  }

  return Array.from(activities, ([districtId, activity]) => ({
    districtId,
    progressAfter: activity.progressAfter,
    targetProgress: activity.targetProgress,
    builderNames: Array.from(activity.builderIds).map((id) => npcNameById.get(id) ?? id)
  }))
}

function builderIdsFor(payload: Record<string, unknown>): Set<string> {
  const builderIds = new Set<string>()
  if (typeof payload.npcId === 'string') builderIds.add(payload.npcId)
  const motivation = isRecord(payload.motivation) ? payload.motivation : null
  if (typeof motivation?.sourceNpcId === 'string') builderIds.add(motivation.sourceNpcId)
  return builderIds
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
