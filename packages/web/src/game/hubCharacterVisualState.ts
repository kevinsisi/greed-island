import type { MapNpc, MapPlayer } from './MapScene'
import { NPC_BADGE_COLOR, PLAYER_COLOR } from './districts'
import {
  characterVisualStateForLocalPlayer,
  characterVisualStateForNpc,
  characterVisualStateForPeerPlayer,
  type CharacterFacing,
  type CharacterPoint,
  type CharacterVisualState,
} from './characterVisualState'

export function characterVisualStateForHubLocalPlayer(input: {
  playerName: string | null
  x: number
  y: number
  velocityX?: number
  velocityY?: number
  previousFacing?: CharacterFacing
}): CharacterVisualState {
  const label = input.playerName?.trim() || 'Player'
  return characterVisualStateForLocalPlayer({
    id: 'hub-local-player',
    label,
    x: input.x,
    y: input.y,
    color: PLAYER_COLOR,
    ...(input.velocityX !== undefined ? { velocityX: input.velocityX } : {}),
    ...(input.velocityY !== undefined ? { velocityY: input.velocityY } : {}),
    ...(input.previousFacing !== undefined ? { previousFacing: input.previousFacing } : {}),
  })
}

export function characterVisualStateForHubPeerPlayer(
  player: MapPlayer,
  fallback: CharacterPoint,
  previous?: CharacterPoint | null,
  previousFacing?: CharacterFacing
): CharacterVisualState {
  return characterVisualStateForPeerPlayer({
    id: player.id,
    label: player.displayName,
    shortLabel: player.shortName,
    x: player.x,
    y: player.y,
    fallback,
    ...(previous !== undefined ? { previous } : {}),
    ...(previousFacing !== undefined ? { previousFacing } : {}),
  })
}

export function characterVisualStateForHubNpc(
  npc: MapNpc,
  position: CharacterPoint,
  previous?: CharacterPoint | null
): CharacterVisualState {
  const state = characterVisualStateForNpc({
    npc: {
      id: npc.id,
      name: npc.name,
      ...(npc.activity !== undefined ? { activity: npc.activity } : {}),
      ...(npc.color !== undefined ? { color: npc.color } : {}),
      ...(typeof npc.mood === 'number' ? { mood: npc.mood } : {}),
      ...(typeof npc.health === 'number' ? { health: npc.health } : {}),
    },
    x: position.x,
    y: position.y,
    fallbackColor: NPC_BADGE_COLOR,
    ...(previous !== undefined ? { previous } : {}),
  })
  return { ...state, shortLabel: npc.shortName }
}
