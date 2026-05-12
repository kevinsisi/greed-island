import { describe, expect, it } from 'vitest'
import { completedConstructionBuildingView } from './dynamicConstruction.js'

describe('completed construction building views', () => {
  it('turns completed NPC-initiated projects into permanent enterable buildings', () => {
    const view = completedConstructionBuildingView({
      projectId: 'project.civ-evo.abcdef1234567890abcdef12',
      kind: 'settlement',
      targetTileId: 't_central',
      buildingId: 'b_civ_evo_t_central',
      progress: 24,
      targetProgress: 24,
      startedAtTick: 100,
      completedAtTick: 124,
      initiatedByNpcId: 'central.builder',
      builderNpcIds: ['central.builder']
    })

    expect(view).toEqual(expect.objectContaining({
      def: expect.objectContaining({
        id: 'b_civ_evo_t_central.abcdef12',
        tileId: 't_central',
        type: 'landmark',
        ownerNpcId: 'central.builder',
        enterable: true
      }),
      occupants: []
    }))
  })

  it('does not expose incomplete or legacy system construction projects', () => {
    const base = {
      projectId: 'project.civ-evo.abcdef1234567890abcdef12',
      kind: 'settlement' as const,
      targetTileId: 't_central',
      buildingId: 'b_civ_evo_t_central',
      progress: 12,
      targetProgress: 24,
      startedAtTick: 100,
      completedAtTick: null,
      initiatedByNpcId: 'central.builder',
      builderNpcIds: ['central.builder']
    }

    expect(completedConstructionBuildingView(base)).toBeNull()
    expect(completedConstructionBuildingView({ ...base, completedAtTick: 124, initiatedByNpcId: '' })).toBeNull()
  })
})
