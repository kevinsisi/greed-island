import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { makeLivingWorldCommand, type LivingWorldCommand, type RumorTopic } from '../kernel/livingWorldCommands.js'

export function seedRumorsFromEvent(
  event: { eventType: string; payload: unknown; tick?: number },
  npcIdsOnTile: readonly string[],
  currentTick: number,
): LivingWorldCommand[] {
  if (npcIdsOnTile.length === 0) return []

  const seed = extractRumorSeed(event)
  if (!seed) return []

  const rumorId = hashCanonicalJson({ topic: seed.topic, subjectId: seed.subjectId, originTick: seed.originTick }).slice(0, 32)

  return npcIdsOnTile.map((npcId) =>
    makeLivingWorldCommand(
      'NPC_RUMOR_HEARD',
      `system.rumor.${seed.topic}`,
      'system',
      currentTick,
      currentTick,
      {
        npcId,
        rumorId,
        topic: seed.topic,
        subjectId: seed.subjectId,
        tileId: seed.tileId,
        originTick: seed.originTick,
        accuracy: 100,
      }
    )
  )
}

function extractRumorSeed(event: {
  eventType: string
  payload: unknown
  tick?: number
}): { topic: RumorTopic; subjectId: string; tileId: string; originTick: number } | null {
  const data = (event.payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return null
  const p = data as Record<string, unknown>

  if (event.eventType === 'ANIMAL_STARVED') {
    if (typeof p.predatorSpeciesId !== 'string' || p.predatorSpeciesId.length === 0) return null
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return null
    return {
      topic: 'predator_death',
      subjectId: p.predatorSpeciesId as string,
      tileId: p.tileId as string,
      originTick: typeof p.starvedAtTick === 'number' ? p.starvedAtTick : (event.tick ?? 0),
    }
  }

  if (event.eventType === 'BUILDING_CONSTRUCTED') {
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return null
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return null
    return {
      topic: 'construction_complete',
      subjectId: p.buildingId as string,
      tileId: p.tileId as string,
      originTick: event.tick ?? 0,
    }
  }

  return null
}
