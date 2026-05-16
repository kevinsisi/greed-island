import { describe, expect, it } from 'vitest'
import {
  characterVisualStateForAreaLocalPlayer,
  characterVisualStateForAreaNpc,
  characterVisualStateForAreaPeerPlayer,
} from './areaCharacterVisualState'
import type { AreaMapNpc, AreaMapPlayer } from './AreaScene'

function areaNpc(input: Partial<AreaMapNpc> & Pick<AreaMapNpc, 'id'>): AreaMapNpc {
  return {
    name: input.name ?? input.id,
    shortName: input.shortName ?? input.id.charAt(0).toUpperCase(),
    subCol: input.subCol ?? 1,
    subRow: input.subRow ?? 1,
    color: input.color ?? 0xffcc66,
    activity: input.activity ?? 'idle',
    ...input,
    id: input.id,
  }
}

function peer(input: Partial<AreaMapPlayer> & Pick<AreaMapPlayer, 'id'>): AreaMapPlayer {
  const result: AreaMapPlayer = {
    id: input.id,
    displayName: input.displayName ?? `Peer ${input.id}`,
    shortName: input.shortName ?? 'P',
  }
  if (input.x !== undefined) result.x = input.x
  if (input.y !== undefined) result.y = input.y
  if (input.z !== undefined) result.z = input.z
  return result
}

describe('Area character visual state mapping', () => {
  it('maps Area NPC visuals from server-authoritative activity and vitals', () => {
    const state = characterVisualStateForAreaNpc(
      areaNpc({ id: 'npc-a', name: 'Akari', activity: 'trade', mood: 22, health: 18, subZ: 2 }),
      { x: 120, y: 80 },
      { x: 80, y: 80 }
    )

    expect(state).toMatchObject({
      id: 'npc-a',
      kind: 'npc',
      source: 'server-npc',
      action: 'trade',
      facing: 'right',
      mood: 22,
      health: 18,
      z: 2,
    })
  })

  it('marks Area local player walk or idle as local input only', () => {
    expect(characterVisualStateForAreaLocalPlayer({ playerName: 'Hunter', x: 0, y: 0 }).source).toBe('local-input')
    expect(characterVisualStateForAreaLocalPlayer({ playerName: 'Hunter', x: 0, y: 0 }).action).toBe('idle')
    expect(characterVisualStateForAreaLocalPlayer({ playerName: 'Hunter', x: 0, y: 0, velocityX: -3 }).action).toBe('walk')
  })

  it('marks Area peer player walk or idle as server presence only', () => {
    const state = characterVisualStateForAreaPeerPlayer(
      peer({ id: 7, displayName: 'Visitor', shortName: 'V', x: 30, y: 40 }),
      { x: 10, y: 10 },
      { x: 10, y: 40 },
      'right'
    )

    expect(state).toMatchObject({
      id: '7',
      kind: 'peer-player',
      source: 'server-player-presence',
      action: 'walk',
      facing: 'right',
      label: 'Visitor',
      shortLabel: 'V',
    })
  })

  it('uses peer fallback placement without inventing movement when coordinates are absent', () => {
    const state = characterVisualStateForAreaPeerPlayer(peer({ id: 8, x: null }), { x: 90, y: 110 }, null, 'left')

    expect(state).toMatchObject({
      x: 90,
      y: 110,
      action: 'idle',
      facing: 'left',
      source: 'server-player-presence',
    })
  })
})
