import type { MapConstructionActivity } from '../game/MapScene'
import { DISTRICTS, isDistrict, type DistrictId } from '../game/districts'
import type { EventSummary, NpcSummary } from '../state/types'

export interface ConstructionProjectSummary {
  projectId: string
  targetTileId: string
  buildingId: string
  progress: number
  targetProgress: number
  completedAtTick: number | null
  initiatedByNpcId: string
  builderNpcIds?: readonly string[]
}

export function constructionActivitiesFor(
  events: readonly EventSummary[],
  npcs: readonly NpcSummary[],
  constructionProjects: readonly ConstructionProjectSummary[] = []
): MapConstructionActivity[] {
  const npcNameById = new Map(npcs.map((npc) => [npc.id, npc.name]))
  const sortedEvents = [...events].sort((a, b) => (b.tick - a.tick) || (b.sequence - a.sequence))
  const authoritativeProjectDistricts = new Set(
    constructionProjects
      .filter((project) => project.initiatedByNpcId.length > 0)
      .filter((project) => project.targetTileId in DISTRICTS && isDistrict(project.targetTileId as DistrictId))
      .map((project) => project.targetTileId as DistrictId)
  )
  const completedDistricts = new Set<DistrictId>()
  const activities = new Map<DistrictId, {
    progressAfter: number
    targetProgress: number
    builderIds: Set<string>
  }>()

  for (const event of sortedEvents) {
    if (event.eventType !== 'CONSTRUCTION_PROJECT_PROGRESS') continue
    const payload = payloadData(event.payload)
    const districtId = typeof payload.targetTileId === 'string' ? payload.targetTileId : null
    if (!districtId || !(districtId in DISTRICTS) || !isDistrict(districtId as DistrictId)) continue
    const district = districtId as DistrictId
    if (authoritativeProjectDistricts.has(district)) continue
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

  const eventActivities = Array.from(activities, ([districtId, activity]) => ({
    districtId,
    progressAfter: activity.progressAfter,
    targetProgress: activity.targetProgress,
    builderNames: Array.from(activity.builderIds).map((id) => npcNameById.get(id) ?? id)
  }))
  const projectActivities = constructionProjects
    .filter((project) => project.completedAtTick === null && project.initiatedByNpcId.length > 0)
    .filter((project) => project.targetTileId in DISTRICTS && isDistrict(project.targetTileId as DistrictId))
    .map((project) => {
      const builderIds = new Set<string>([project.initiatedByNpcId, ...(project.builderNpcIds ?? [])])
      return {
        districtId: project.targetTileId as DistrictId,
        buildingId: project.buildingId,
        initiatedByNpcId: project.initiatedByNpcId,
        progressAfter: project.progress,
        targetProgress: project.targetProgress,
        builderNames: Array.from(builderIds).map((id) => npcNameById.get(id) ?? id)
      } satisfies MapConstructionActivity
    })
  return [...eventActivities, ...projectActivities]
}

export function constructionProjectsFromWorldFact(raw: unknown): ConstructionProjectSummary[] {
  if (!isRecord(raw) || !isRecord(raw.constructionProjects)) return []
  const projects: ConstructionProjectSummary[] = []
  for (const value of Object.values(raw.constructionProjects)) {
    if (!isRecord(value)) continue
    if (
      typeof value.projectId !== 'string' ||
      typeof value.targetTileId !== 'string' ||
      typeof value.buildingId !== 'string' ||
      typeof value.progress !== 'number' ||
      typeof value.targetProgress !== 'number' ||
      typeof value.initiatedByNpcId !== 'string'
    ) continue
    projects.push({
      projectId: value.projectId,
      targetTileId: value.targetTileId,
      buildingId: value.buildingId,
      progress: value.progress,
      targetProgress: value.targetProgress,
      completedAtTick: typeof value.completedAtTick === 'number' ? value.completedAtTick : null,
      initiatedByNpcId: value.initiatedByNpcId
    })
  }
  return projects
}

function builderIdsFor(payload: Record<string, unknown>): Set<string> {
  const builderIds = new Set<string>()
  if (typeof payload.npcId === 'string') builderIds.add(payload.npcId)
  const motivation = isRecord(payload.motivation) ? payload.motivation : null
  if (typeof motivation?.sourceNpcId === 'string') builderIds.add(motivation.sourceNpcId)
  return builderIds
}

function payloadData(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.data) ? payload.data : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
