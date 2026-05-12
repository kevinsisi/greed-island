import type { Event } from '../kernel/types.js'
import {
  deriveConstructionInitiateProjectId,
  type ConstructionProjectRecord,
  type LifeExpansionState
} from '../sim/cityLife.js'

export type ConstructionProjectRow = ConstructionProjectRecord & Readonly<{
  builderNpcIds: readonly string[]
}>

export class ConstructionProjectsProjection {
  private rows = new Map<string, ConstructionProjectRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = buildRowsFromEvents(events)
  }

  hydrateFromLifeExpansion(state: LifeExpansionState): void {
    this.rows = new Map(
      Object.values(state.constructionProjects).map((project) => [project.projectId, rowFromRecord(project)])
    )
  }

  project(event: Event): void {
    const next = buildRowsFromEvents([event], this.rows)
    this.rows = next
  }

  getInProgressByTile(tileId: string): ConstructionProjectRow[] {
    return this.list()
      .filter((row) => row.targetTileId === tileId && row.completedAtTick === null)
      .sort((a, b) => a.startedAtTick - b.startedAtTick || a.projectId.localeCompare(b.projectId))
  }

  getByProjectId(id: string): ConstructionProjectRow | null {
    return this.rows.get(id) ?? null
  }

  list(): ConstructionProjectRow[] {
    return [...this.rows.values()].sort((a, b) => a.startedAtTick - b.startedAtTick || a.projectId.localeCompare(b.projectId))
  }
}

export function rebuildConstructionProjectsFromEvents(events: readonly Event[]): ConstructionProjectRow[] {
  return [...buildRowsFromEvents(events).values()].sort((a, b) => a.startedAtTick - b.startedAtTick || a.projectId.localeCompare(b.projectId))
}

function buildRowsFromEvents(
  events: readonly Event[],
  initialRows: ReadonlyMap<string, ConstructionProjectRow> = new Map()
): Map<string, ConstructionProjectRow> {
  const rows = new Map(initialRows)
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence)
  for (const event of sorted) {
    const payload = isRecord(event.payload) ? event.payload : null
    if (!payload) continue
    if (event.eventType === 'CONSTRUCTION_INITIATE' || event.eventType === 'CONSTRUCTION_INITIATED') {
      const npcId = readString(payload.npcId) ?? readString(payload.initiatedByNpcId)
      const tileId = readString(payload.tileId)
      const buildingId = readString(payload.buildingId)
      const duration = readNumber(payload.duration)
      const tick = event.tick ?? readNumber(payload.startedAtTick) ?? 0
      if (!npcId || !tileId || !buildingId || duration === null) continue
      const projectId = deriveConstructionInitiateProjectId({
        npcId,
        tileId,
        buildingId,
        startedAtTick: tick,
        ...(event.rulesetVersion ? { rulesetVersion: event.rulesetVersion } : {})
      })
      if (!rows.has(projectId)) {
        rows.set(projectId, {
          projectId,
          kind: 'settlement',
          targetTileId: tileId,
          buildingId,
          progress: 0,
          targetProgress: Math.max(1, Math.floor(duration)),
          startedAtTick: tick,
          completedAtTick: null,
          initiatedByNpcId: npcId,
          builderNpcIds: [npcId]
        })
      }
      continue
    }
    if (event.eventType === 'CONSTRUCTION_PROJECT_PROGRESS') {
      const projectId = readString(payload.projectId)
      const targetTileId = readString(payload.targetTileId)
      const buildingId = readString(payload.buildingId)
      const npcId = readString(payload.npcId)
      const progressAfter = readNumber(payload.progressAfter)
      const targetProgress = readNumber(payload.targetProgress)
      if (!projectId || !targetTileId || !buildingId || progressAfter === null || targetProgress === null) continue
      const existing = rows.get(projectId)
      rows.set(projectId, {
        projectId,
        kind: 'settlement',
        targetTileId,
        buildingId,
        progress: progressAfter,
        targetProgress,
        startedAtTick: existing?.startedAtTick ?? event.tick ?? 0,
        completedAtTick: progressAfter >= targetProgress ? event.tick ?? existing?.completedAtTick ?? null : existing?.completedAtTick ?? null,
        initiatedByNpcId: existing?.initiatedByNpcId ?? '',
        builderNpcIds: addUnique(existing?.builderNpcIds ?? [], npcId ? [npcId] : [])
      })
      continue
    }
    if (event.eventType === 'BUILDING_CONSTRUCTED') {
      const projectId = readString(payload.projectId)
      if (!projectId) continue
      const existing = rows.get(projectId)
      if (!existing) continue
      rows.set(projectId, {
        ...existing,
        progress: existing.targetProgress,
        completedAtTick: event.tick ?? existing.completedAtTick
      })
    }
  }
  return rows
}

function rowFromRecord(project: ConstructionProjectRecord): ConstructionProjectRow {
  return {
    ...project,
    builderNpcIds: project.initiatedByNpcId ? [project.initiatedByNpcId] : []
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function addUnique(existing: readonly string[], next: readonly string[]): readonly string[] {
  const set = new Set(existing)
  for (const value of next) set.add(value)
  return [...set]
}
