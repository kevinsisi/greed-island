import { describe, expect, it } from 'vitest'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import { deriveConstructionInitiateProjectId, withConstructionInitiated, withConstructionProgress, type LifeExpansionState } from '../sim/cityLife.js'
import { ConstructionProjectsProjection, rebuildConstructionProjectsFromEvents, visibleAutonomousConstructionProjects, type ConstructionProjectRow } from './constructionProjects.js'

function ev(sequence: number, eventType: string, tick: number, payload: Record<string, unknown>): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType,
    occurredAt: tick,
    actorId: String(payload.npcId ?? payload.initiatedByNpcId ?? 'system'),
    commandId: `cmd-${sequence}`,
    tick,
    rulesetVersion: 'simulation-kernel@0.1.0',
    payload,
    deterministicKey: `test-${sequence}`,
    version: 1
  }
}

describe('construction_projects projection', () => {
  it('rebuilds deterministically from construction events', () => {
    const projectId = deriveConstructionInitiateProjectId({
      npcId: 'central.builder',
      tileId: 't_central',
      buildingId: 'b_civ_evo_t_central',
      startedAtTick: 10
    })
    const events = [
      ev(1, 'CONSTRUCTION_INITIATE', 10, {
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 24,
        narration: 'start'
      }),
      ev(2, 'CONSTRUCTION_PROJECT_PROGRESS', 11, {
        projectId,
        kind: 'settlement',
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        npcId: 'central.builder',
        delta: 2,
        progressAfter: 2,
        targetProgress: 24,
        narration: 'progress'
      })
    ]

    const a = rebuildConstructionProjectsFromEvents(events)
    const b = rebuildConstructionProjectsFromEvents(events)

    expect(hashCanonicalJson(a)).toBe(hashCanonicalJson(b))
    expect(a).toEqual([
      expect.objectContaining({
        projectId,
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        progress: 2,
        targetProgress: 24,
        initiatedByNpcId: 'central.builder',
        builderNpcIds: ['central.builder']
      })
    ])
  })

  it('exposes in-progress rows by tile and hides completed projects', () => {
    const projectId = deriveConstructionInitiateProjectId({
      npcId: 'central.builder',
      tileId: 't_central',
      buildingId: 'b_civ_evo_t_central',
      startedAtTick: 10
    })
    const projection = new ConstructionProjectsProjection()
    projection.rebuildFromEvents([
      ev(1, 'CONSTRUCTION_INITIATE', 10, {
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 3,
        narration: 'start'
      }),
      ev(2, 'CONSTRUCTION_PROJECT_PROGRESS', 11, {
        projectId,
        kind: 'settlement',
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        npcId: 'central.helper',
        delta: 3,
        progressAfter: 3,
        targetProgress: 3,
        narration: 'done'
      }),
      ev(3, 'BUILDING_CONSTRUCTED', 11, {
        projectId,
        buildingId: 'b_civ_evo_t_central',
        tileId: 't_central',
        narration: 'built'
      })
    ])

    expect(projection.getByProjectId(projectId)?.completedAtTick).toBe(11)
    expect(projection.getInProgressByTile('t_central')).toEqual([])
  })

  it('keeps construction rows monotonic after completion or stale progress', () => {
    const projectId = deriveConstructionInitiateProjectId({
      npcId: 'central.builder',
      tileId: 't_central',
      buildingId: 'b_civ_evo_t_central',
      startedAtTick: 10
    })
    const projection = new ConstructionProjectsProjection()
    projection.rebuildFromEvents([
      ev(1, 'CONSTRUCTION_INITIATE', 10, {
        npcId: 'central.builder',
        tileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        duration: 5
      }),
      ev(2, 'CONSTRUCTION_PROJECT_PROGRESS', 11, {
        projectId,
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        npcId: 'central.builder',
        progressAfter: 5,
        targetProgress: 5
      }),
      ev(3, 'BUILDING_CONSTRUCTED', 11, {
        projectId,
        buildingId: 'b_civ_evo_t_central',
        tileId: 't_central'
      }),
      ev(4, 'CONSTRUCTION_PROJECT_PROGRESS', 12, {
        projectId,
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        npcId: 'central.helper',
        progressAfter: 2,
        targetProgress: 3
      })
    ])

    expect(projection.getByProjectId(projectId)).toEqual(expect.objectContaining({
      progress: 5,
      targetProgress: 5,
      completedAtTick: 11
    }))
    expect(projection.getInProgressByTile('t_central')).toEqual([])
  })

  it('agrees with lifeExpansion construction project records', () => {
    let lifeExpansion: LifeExpansionState = {
      households: {},
      children: {},
      npcCivicRecords: {},
      constructionProjects: {},
      unlockedTileIds: [],
      unlockedBuildingIds: []
    }
    lifeExpansion = withConstructionInitiated(lifeExpansion, {
      npcId: 'central.builder',
      tileId: 't_central',
      buildingId: 'b_civ_evo_t_central',
      duration: 24,
      tick: 10
    })
    const [project] = Object.values(lifeExpansion.constructionProjects)
    lifeExpansion = withConstructionProgress(lifeExpansion, { tick: 11, delta: 2, projectId: project!.projectId })

    const projection = new ConstructionProjectsProjection()
    projection.hydrateFromLifeExpansion(lifeExpansion)
    const row = projection.getByProjectId(project!.projectId)

    expect(row).toEqual(expect.objectContaining({
      projectId: project!.projectId,
      progress: 2,
      targetProgress: 24,
      initiatedByNpcId: 'central.builder',
      startedAtTick: 10
    }))
  })

  it('normalizes hydrated completed records so completed buildings never look partially built', () => {
    const projection = new ConstructionProjectsProjection()
    projection.hydrateFromLifeExpansion({
      households: {},
      children: {},
      npcCivicRecords: {},
      unlockedTileIds: [],
      unlockedBuildingIds: [],
      constructionProjects: {
        'project.civ-evo.completed': {
          projectId: 'project.civ-evo.completed',
          kind: 'settlement',
          targetTileId: 't_central',
          buildingId: 'b_civ_evo_t_central',
          progress: 2,
          targetProgress: 5,
          startedAtTick: 10,
          completedAtTick: 11,
          initiatedByNpcId: 'central.builder'
        }
      }
    })

    expect(projection.getByProjectId('project.civ-evo.completed')).toEqual(expect.objectContaining({
      progress: 5,
      targetProgress: 5,
      completedAtTick: 11
    }))
    expect(projection.getInProgressByTile('t_central')).toEqual([])
  })

  it('selects a stable combined visible window for completed and open autonomous projects', () => {
    const projects = [
      row('project.civ-evo.004', 40, null),
      row('project.civ-evo.002', 20, 45),
      row('project.civ-evo.003', 30, null),
      row('project.civ-evo.001', 10, 25)
    ]

    expect(visibleAutonomousConstructionProjects(projects, 3).map((project) => project.projectId)).toEqual([
      'project.civ-evo.001',
      'project.civ-evo.002',
      'project.civ-evo.003'
    ])
  })
})

function row(projectId: string, startedAtTick: number, completedAtTick: number | null): ConstructionProjectRow {
  return {
    projectId,
    kind: 'settlement',
    targetTileId: 't_central',
    buildingId: 'b_civ_evo_t_central',
    progress: completedAtTick === null ? 2 : 5,
    targetProgress: 5,
    startedAtTick,
    completedAtTick,
    initiatedByNpcId: 'central.builder',
    builderNpcIds: ['central.builder']
  }
}
