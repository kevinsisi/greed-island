import type { BuildingSceneNpc } from './BuildingScene'
import {
  characterVisualStateForLocalPlayer,
  characterVisualStateForNpc,
  type CharacterFacing,
  type CharacterPoint,
  type CharacterVisualState,
} from './characterVisualState'

export const BUILDING_PLAYER_COLOR = 0xfff5b8
export const BUILDING_NPC_FALLBACK_COLOR = 0xb6e3ff

export function characterVisualStateForBuildingLocalPlayer(input: {
  x: number
  y: number
  velocityX?: number
  velocityY?: number
  previousFacing?: CharacterFacing
}): CharacterVisualState {
  return characterVisualStateForLocalPlayer({
    id: 'building-local-player',
    label: 'Player',
    x: input.x,
    y: input.y,
    color: BUILDING_PLAYER_COLOR,
    ...(input.velocityX !== undefined ? { velocityX: input.velocityX } : {}),
    ...(input.velocityY !== undefined ? { velocityY: input.velocityY } : {}),
    ...(input.previousFacing !== undefined ? { previousFacing: input.previousFacing } : {}),
  })
}

export function characterVisualStateForBuildingNpc(
  npc: BuildingSceneNpc,
  position: CharacterPoint,
  previous?: CharacterPoint | null
): CharacterVisualState {
  const state = characterVisualStateForNpc({
    npc: {
      id: npc.id,
      name: npc.name,
      ...(npc.activity !== undefined ? { activity: npc.activity } : {}),
      ...(npc.color !== undefined ? { color: npc.color } : {}),
    },
    x: position.x,
    y: position.y,
    fallbackColor: BUILDING_NPC_FALLBACK_COLOR,
    ...(previous !== undefined ? { previous } : {}),
  })
  return { ...state, shortLabel: npc.shortName }
}
