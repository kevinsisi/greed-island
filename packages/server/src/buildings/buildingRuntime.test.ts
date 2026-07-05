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

  it('can expose working non-owner NPCs in workplace building views without removing them from simulation outdoor inputs', () => {
    const runtime = new BuildingRuntime()
    const states = new Map<string, NpcRuntimeState>([
      ['dock.free.worker', npcState({ tile: 't_mountain', activity: 'work' })]
    ])

    const lodge = runtime.snapshotForTile('t_mountain', states, [], { includeWorkplaces: true }).find((item) => item.def.id === 'b_mountain_lodge')
    const outdoor = runtime.npcsOutsideOnTile(states)

    expect(lodge?.occupants).toContainEqual({
      npcId: 'dock.free.worker',
      shift: 'morning',
      isOwner: false,
    })
    expect(outdoor.get('t_mountain') ?? []).toContain('dock.free.worker')
  })

  it('derives occupants for runtime-projected completed NPC buildings', () => {
    const runtime = new BuildingRuntime()
    const states = new Map<string, NpcRuntimeState>([
      ['central.builder', npcState({ tile: 't_central', activity: 'work' })]
    ])
    const dynamic = [{
      id: 'b_civ_evo_t_central.abcdef12',
      tileId: 't_central',
      nameZh: '自主設施',
      nameEn: 'Autonomous Facility',
      descriptionZh: '已完工的 NPC 自主建築',
      type: 'landmark' as const,
      placement: { col: 4, row: 4, glyph: '🏠', size: 24 },
      interior: { cols: 9, rows: 7, props: [] },
      ownerNpcId: 'central.builder',
      hiring: [],
      enterable: true,
      restorative: false
    }]

    const view = runtime.snapshotForTile('t_central', states, dynamic).find((item) => item.def.id === dynamic[0]!.id)
    const outdoor = runtime.npcsOutsideOnTile(states, dynamic)

    expect(view?.occupants).toEqual([
      { npcId: 'central.builder', shift: null, isOwner: true }
    ])
    expect(outdoor.get('t_central') ?? []).not.toContain('central.builder')
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
    travelRoute: null,
    agent: {
      profileId: 'test',
      permissions: ['move.local_area', 'interact.social'],
      activeTask: {
        kind: 'bootstrap',
        reason: 'test-fixture',
        targetTile: input.tile,
        startedAtTick: 0,
        expiresAtTick: null
      },
      lastDecision: { tick: 0, source: 'bootstrap', reason: 'test-fixture' }
    }
  }
}
