import type { AreaMapNpc, AreaMapPlayer } from './AreaScene'
import { PLAYER_COLOR } from './districts'
import {
  characterVisualStateForLocalPlayer,
  characterVisualStateForNpc,
  characterVisualStateForPeerPlayer,
  type CharacterFacing,
  type CharacterPoint,
  type CharacterVisualState,
} from './characterVisualState'

export function characterVisualStateForAreaNpc(
  npc: AreaMapNpc,
  position: CharacterPoint,
  previous?: CharacterPoint | null
): CharacterVisualState {
  return characterVisualStateForNpc({
    npc: {
      id: npc.id,
      name: npc.name,
      activity: npc.activity,
      color: npc.color,
      ...(typeof npc.mood === 'number' ? { mood: npc.mood } : {}),
      ...(typeof npc.health === 'number' ? { health: npc.health } : {}),
      ...(typeof npc.subZ === 'number' ? { subZ: npc.subZ } : {}),
    },
    x: position.x,
    y: position.y,
    fallbackColor: npc.color,
    ...(previous !== undefined ? { previous } : {}),
  })
}

export function characterVisualStateForAreaLocalPlayer(input: {
  playerName: string | null
  x: number
  y: number
  z?: number | null
  velocityX?: number
  velocityY?: number
  previousFacing?: CharacterFacing
}): CharacterVisualState {
  const label = input.playerName?.trim() || 'Player'
  return characterVisualStateForLocalPlayer({
    id: 'local-player',
    label,
    x: input.x,
    y: input.y,
    color: PLAYER_COLOR,
    ...(input.z !== undefined ? { z: input.z } : {}),
    ...(input.velocityX !== undefined ? { velocityX: input.velocityX } : {}),
    ...(input.velocityY !== undefined ? { velocityY: input.velocityY } : {}),
    ...(input.previousFacing !== undefined ? { previousFacing: input.previousFacing } : {}),
  })
}

export function characterVisualStateForAreaPeerPlayer(
  player: AreaMapPlayer,
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
    ...(player.z !== undefined ? { z: player.z } : {}),
    ...(previous !== undefined ? { previous } : {}),
    ...(previousFacing !== undefined ? { previousFacing } : {}),
  })
}
