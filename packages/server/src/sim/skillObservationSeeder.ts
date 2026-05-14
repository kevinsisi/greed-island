import { makeLivingWorldCommand, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'

const PRODUCTIVE_EVENT_SKILL_MAP: Record<string, string> = {
  ANIMAL_HUNT_RESOLVED: 'hunting',
  FISHERY_HARVESTED: 'fishing',
  BUILDING_CONSTRUCTED: 'construction',
}

const MAX_OBSERVERS = 3

export function planSkillObservations(
  event: { eventType: string; payload: unknown; tick?: number },
  actorNpcId: string | null,
  npcIdsOnTile: readonly string[],
  currentTick: number,
): LivingWorldCommand[] {
  const skillId = PRODUCTIVE_EVENT_SKILL_MAP[event.eventType]
  if (!skillId) return []

  const observers = npcIdsOnTile
    .filter((id) => id !== actorNpcId)
    .slice(0, MAX_OBSERVERS)

  if (observers.length === 0) return []

  return observers.map((npcId) =>
    makeLivingWorldCommand(
      'NPC_OBSERVED_SKILL',
      `system.skill.${skillId}`,
      'system',
      currentTick,
      currentTick,
      {
        npcId,
        skillId,
        sourceEventType: event.eventType,
        tick: currentTick,
      }
    )
  )
}
