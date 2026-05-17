import { describe, expect, it } from 'vitest'
import type { BuildingSceneNpc } from './BuildingScene'
import {
  BUILDING_NPC_FALLBACK_COLOR,
  BUILDING_PLAYER_COLOR,
  characterVisualStateForBuildingLocalPlayer,
  characterVisualStateForBuildingNpc,
} from './buildingCharacterVisualState'

function buildingNpc(input: Partial<BuildingSceneNpc> & Pick<BuildingSceneNpc, 'id'>): BuildingSceneNpc {
  return {
    name: input.name ?? input.id,
    shortName: input.shortName ?? input.id.charAt(0).toUpperCase(),
    isOwner: input.isOwner ?? false,
    ...input,
    id: input.id,
  }
}

describe('Building character visual state mapping', () => {
  it('maps occupant NPC visuals from server-authoritative activity and color', () => {
    const state = characterVisualStateForBuildingNpc(
      buildingNpc({ id: 'npc-a', name: 'Akari', shortName: 'A', activity: 'work', color: 0x336699 }),
      { x: 80, y: 96 }
    )

    expect(state).toMatchObject({
      id: 'npc-a',
      kind: 'npc',
      x: 80,
      y: 96,
      color: 0x336699,
      action: 'work',
      source: 'server-npc',
      shortLabel: 'A',
    })
  })

  it('falls back to idle and default color when occupant activity or color is absent', () => {
    const state = characterVisualStateForBuildingNpc(buildingNpc({ id: 'npc-a', name: 'Akari' }), { x: 80, y: 96 })

    expect(state.action).toBe('idle')
    expect(state.color).toBe(BUILDING_NPC_FALLBACK_COLOR)
    expect(state.source).toBe('server-npc')
  })

  it('marks local building player movement as local input only', () => {
    const idle = characterVisualStateForBuildingLocalPlayer({ x: 12, y: 18 })
    const walking = characterVisualStateForBuildingLocalPlayer({ x: 12, y: 18, velocityX: -4, previousFacing: 'right' })

    expect(idle).toMatchObject({
      id: 'building-local-player',
      kind: 'local-player',
      action: 'idle',
      source: 'local-input',
      color: BUILDING_PLAYER_COLOR,
    })
    expect(walking.action).toBe('walk')
    expect(walking.facing).toBe('left')
  })
})
