import { describe, expect, it } from 'vitest'
import type { NpcActivity, NpcSummary } from '../state/types'
import {
  characterActionForNpcActivity,
  characterVisualStateForLocalPlayer,
  characterVisualStateForNpc,
  characterVisualStateForPeerPlayer,
  type CharacterVisualAction,
} from './characterVisualState'

function npc(input: Partial<NpcSummary> & Pick<NpcSummary, 'id'>): NpcSummary {
  return {
    name: input.name ?? input.id,
    role: input.role ?? 'NPC',
    location: input.location ?? 't_central',
    relationshipScore: input.relationshipScore ?? 50,
    lastActedTick: input.lastActedTick ?? 0,
    internalState: input.internalState ?? {},
    deceased: input.deceased ?? false,
    ...input,
    id: input.id,
  }
}

describe('characterVisualState NPC mapping', () => {
  it('maps every authoritative NPC activity to a visual action', () => {
    const cases: Array<[NpcActivity, CharacterVisualAction]> = [
      ['idle', 'idle'],
      ['move', 'walk'],
      ['work', 'work'],
      ['eat', 'eat'],
      ['sleep', 'sleep'],
      ['trade', 'trade'],
      ['patrol', 'patrol'],
    ]

    for (const [activity, action] of cases) {
      expect(characterActionForNpcActivity(activity)).toBe(action)
    }
  })

  it('falls back to idle for missing or unsupported NPC activity', () => {
    expect(characterActionForNpcActivity(undefined)).toBe('idle')
    expect(characterActionForNpcActivity('celebrate' as NpcActivity)).toBe('idle')
  })

  it('preserves NPC authority source, vitals, color, z, and facing', () => {
    const state = characterVisualStateForNpc({
      npc: npc({
        id: 'npc-a',
        name: 'Akari',
        activity: 'work',
        color: 0x336699,
        mood: 72,
        health: 42,
        subZ: 2,
      }),
      x: 12,
      y: 8,
      previous: { x: 20, y: 8 },
    })

    expect(state).toMatchObject({
      id: 'npc-a',
      kind: 'npc',
      x: 12,
      y: 8,
      z: 2,
      label: 'Akari',
      shortLabel: 'A',
      color: 0x336699,
      action: 'work',
      facing: 'left',
      source: 'server-npc',
      mood: 72,
      health: 42,
    })
  })
})

describe('characterVisualState local player mapping', () => {
  it('derives only idle or walk from local input velocity', () => {
    expect(characterVisualStateForLocalPlayer({ id: 1, label: 'Hunter', x: 0, y: 0 }).action).toBe('idle')
    expect(characterVisualStateForLocalPlayer({ id: 1, label: 'Hunter', x: 0, y: 0, velocityY: 1 }).action).toBe('walk')
  })

  it('marks local player visuals as local-input and derives facing from x velocity', () => {
    const left = characterVisualStateForLocalPlayer({
      id: 1,
      label: 'Hunter',
      shortLabel: 'H',
      x: 4,
      y: 5,
      z: 1,
      velocityX: -2,
      previousFacing: 'right',
      color: 0x112233,
    })

    expect(left).toMatchObject({
      id: '1',
      kind: 'local-player',
      source: 'local-input',
      action: 'walk',
      facing: 'left',
      shortLabel: 'H',
      color: 0x112233,
      z: 1,
    })

    expect(characterVisualStateForLocalPlayer({ id: 1, label: 'Hunter', x: 0, y: 0, previousFacing: 'left' }).facing).toBe('left')
  })
})

describe('characterVisualState peer player mapping', () => {
  it('derives only idle or walk from server presence delta', () => {
    expect(characterVisualStateForPeerPlayer({
      id: 'peer-a',
      label: 'Peer',
      x: 10,
      y: 10,
      previous: { x: 10, y: 10 },
      fallback: { x: 0, y: 0 },
    }).action).toBe('idle')

    expect(characterVisualStateForPeerPlayer({
      id: 'peer-a',
      label: 'Peer',
      x: 14,
      y: 10,
      previous: { x: 10, y: 10 },
      fallback: { x: 0, y: 0 },
    }).action).toBe('walk')
  })

  it('marks peer player visuals as server-player-presence and derives facing from x delta', () => {
    const state = characterVisualStateForPeerPlayer({
      id: 'peer-a',
      label: 'Peer',
      x: 6,
      y: 4,
      z: 3,
      previous: { x: 10, y: 4 },
      fallback: { x: 0, y: 0 },
      previousFacing: 'right',
      color: 0x445566,
    })

    expect(state).toMatchObject({
      id: 'peer-a',
      kind: 'peer-player',
      source: 'server-player-presence',
      action: 'walk',
      facing: 'left',
      color: 0x445566,
      z: 3,
    })
  })

  it('uses fallback coordinates without inventing movement when presence coordinates are missing', () => {
    const state = characterVisualStateForPeerPlayer({
      id: 'peer-a',
      label: 'Peer',
      x: null,
      y: undefined,
      previous: null,
      fallback: { x: 3, y: 7, z: 2 },
      previousFacing: 'left',
    })

    expect(state).toMatchObject({
      x: 3,
      y: 7,
      z: 2,
      action: 'idle',
      facing: 'left',
      source: 'server-player-presence',
    })
  })
})
