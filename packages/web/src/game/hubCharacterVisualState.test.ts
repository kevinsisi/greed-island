import { describe, expect, it } from 'vitest'
import type { MapNpc, MapPlayer } from './MapScene'
import { NPC_BADGE_COLOR, PLAYER_COLOR } from './districts'
import {
  characterVisualStateForHubLocalPlayer,
  characterVisualStateForHubNpc,
  characterVisualStateForHubPeerPlayer,
} from './hubCharacterVisualState'

function hubNpc(input: Partial<MapNpc> & Pick<MapNpc, 'id'>): MapNpc {
  return {
    name: input.name ?? input.id,
    shortName: input.shortName ?? input.id.charAt(0).toUpperCase(),
    districtId: input.districtId ?? 't_central',
    ...input,
    id: input.id,
  }
}

function hubPlayer(input: Partial<MapPlayer> & Pick<MapPlayer, 'id'>): MapPlayer {
  return {
    displayName: input.displayName ?? `Player ${input.id}`,
    shortName: input.shortName ?? 'P',
    ...input,
    id: input.id,
  }
}

describe('Hub character visual state mapping', () => {
  it('marks Hub local player movement as local input only', () => {
    const idle = characterVisualStateForHubLocalPlayer({ playerName: 'Kevin', x: 10, y: 20 })
    const walking = characterVisualStateForHubLocalPlayer({ playerName: 'Kevin', x: 10, y: 20, velocityX: 8 })

    expect(idle).toMatchObject({
      id: 'hub-local-player',
      kind: 'local-player',
      action: 'idle',
      source: 'local-input',
      color: PLAYER_COLOR,
    })
    expect(walking.action).toBe('walk')
  })

  it('uses social presence deltas for Hub peer player walk state', () => {
    const state = characterVisualStateForHubPeerPlayer(
      hubPlayer({ id: 7, displayName: 'Mito', shortName: 'M', x: 44, y: 50 }),
      { x: 40, y: 50 },
      { x: 40, y: 50 },
      'right'
    )

    expect(state).toMatchObject({
      id: '7',
      kind: 'peer-player',
      label: 'Mito',
      shortLabel: 'M',
      action: 'walk',
      source: 'server-player-presence',
    })
  })

  it('renders routed Hub NPCs as server-authoritative walk avatars', () => {
    const state = characterVisualStateForHubNpc(
      hubNpc({ id: 'traveller', name: 'Traveller', shortName: 'T', activity: 'move', color: 0x2255aa }),
      { x: 80, y: 90 }
    )

    expect(state).toMatchObject({
      id: 'traveller',
      kind: 'npc',
      x: 80,
      y: 90,
      color: 0x2255aa,
      action: 'walk',
      source: 'server-npc',
      shortLabel: 'T',
    })
  })

  it('falls back Hub NPC color without inventing movement', () => {
    const state = characterVisualStateForHubNpc(hubNpc({ id: 'idle-npc', activity: 'idle' }), { x: 1, y: 2 })

    expect(state.color).toBe(NPC_BADGE_COLOR)
    expect(state.action).toBe('idle')
  })
})
