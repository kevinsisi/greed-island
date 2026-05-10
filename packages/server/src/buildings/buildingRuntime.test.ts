import { describe, expect, it } from 'vitest'
import { BuildingRuntime } from './buildingRuntime.js'
import type { NpcRuntimeState } from '../sim/npcEngine.js'

describe('BuildingRuntime', () => {
  it('derives occupants from current NPC presence without prior reconcile state', () => {
    const runtime = new BuildingRuntime()
    const states = new Map<string, NpcRuntimeState>([
      [
        'central.exchange.shen_ruo_yun',
        npcState({ tile: 't_central', activity: 'work' })
      ]
    ])

    const exchange = runtime.snapshotAll(states).find((view) => view.def.id === 'b_central_exchange')
    const outdoor = runtime.npcsOutsideOnTile(states)

    expect(exchange?.occupants.map((occupant) => occupant.npcId)).toContain(
      'central.exchange.shen_ruo_yun'
    )
    expect(outdoor.get('t_central') ?? []).not.toContain('central.exchange.shen_ruo_yun')
  })

  it('does not treat travelling NPCs as outdoor area occupants', () => {
    const runtime = new BuildingRuntime()
    const states = new Map<string, NpcRuntimeState>([
      [
        'traveller',
        {
          ...npcState({ tile: 't_central', activity: 'move' }),
          targetTile: 't_dock',
          travelRoute: {
            fromTile: 't_central',
            toTile: 't_dock',
            targetTile: 't_dock',
            startedAtTick: 42
          }
        }
      ],
      ['local', npcState({ tile: 't_central', activity: 'idle' })]
    ])

    const outdoor = runtime.npcsOutsideOnTile(states)

    expect(outdoor.get('t_central') ?? []).toContain('local')
    expect(outdoor.get('t_central') ?? []).not.toContain('traveller')
  })
})

function npcState(input: Pick<NpcRuntimeState, 'tile' | 'activity'>): NpcRuntimeState {
  return {
    tile: input.tile,
    activity: input.activity,
    mood: 60,
    health: 80,
    faction: 'guild',
    targetTile: input.tile,
    lastActedTick: 0,
    subCol: 7,
    subRow: 5,
    subZ: 0,
    personalityOverride: null,
    travelRoute: null
  }
}
