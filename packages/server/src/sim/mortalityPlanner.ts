import type { NpcProfile } from '../npcs/types.js'
import type { NpcMortalityProjection } from '../projections/npcMortality.js'
import type { NpcLineageProjection } from '../projections/npcLineage.js'
import { npcLifespanTicks, MORTALITY_CADENCE_TICKS } from '../config/world.js'

export type MortalityIntent = Readonly<{
  npcId: string
  tileId: string
  householdId: string
  heirNpcId: string | null
}>

function bornAtTick(profile: NpcProfile): number {
  const v = profile.personality['bornAtTick']
  return typeof v === 'number' ? v : 0
}

export function planMortality(input: {
  currentTick: number
  profiles: readonly NpcProfile[]
  mortalityProjection: NpcMortalityProjection
  lineageProjection: NpcLineageProjection
}): readonly MortalityIntent[] {
  const { currentTick, profiles, mortalityProjection, lineageProjection } = input
  if (currentTick % MORTALITY_CADENCE_TICKS !== 0) return []

  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  const intents: MortalityIntent[] = []

  for (const profile of profiles) {
    if (mortalityProjection.isDeceased(profile.id)) continue
    const age = currentTick - bornAtTick(profile)
    if (age < npcLifespanTicks(profile.id)) continue

    const hId = lineageProjection.householdId(profile.id)
    const living = lineageProjection
      .livingMembersOf(hId, mortalityProjection)
      .filter((id) => id !== profile.id)

    const heirNpcId =
      living.length === 0
        ? null
        : living.slice().sort((a, b) => {
            const pa = profileMap.get(a)
            const pb = profileMap.get(b)
            return (pa ? bornAtTick(pa) : 0) - (pb ? bornAtTick(pb) : 0)
          })[0] ?? null

    intents.push({ npcId: profile.id, tileId: profile.defaultLocation, householdId: hId, heirNpcId })
  }

  return intents
}
