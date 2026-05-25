import type { NpcProfile } from '../npcs/types.js'
import type { NpcMortalityProjection } from '../projections/npcMortality.js'
import type { SettlementsProjection } from '../projections/settlements.js'
import {
  HOUSEHOLD_MIGRATION_CADENCE_TICKS,
  MIGRATION_PUSH_SAFETY_THRESHOLD,
  MIGRATION_PULL_SAFETY_MIN,
  MIGRATION_MAX_PER_CADENCE,
} from '../config/world.js'

export type HouseholdMigrationIntent = Readonly<{
  npcId: string
  fromTileId: string
  toTileId: string
  reason: string
}>

export function planHouseholdMigration(input: {
  currentTick: number
  profiles: readonly NpcProfile[]
  npcHomeTiles: ReadonlyMap<string, string>
  areaSafety: ReadonlyMap<string, number>
  settlementsProjection: SettlementsProjection
  mortalityProjection: NpcMortalityProjection
}): readonly HouseholdMigrationIntent[] {
  const { currentTick, profiles, npcHomeTiles, areaSafety, settlementsProjection, mortalityProjection } = input

  if (currentTick % HOUSEHOLD_MIGRATION_CADENCE_TICKS !== 0) return []

  const tilesWithSettlement = settlementsProjection.getTilesWithSettlement()
  const intents: HouseholdMigrationIntent[] = []

  for (const profile of profiles) {
    if (intents.length >= MIGRATION_MAX_PER_CADENCE) break
    if (mortalityProjection.isDeceased(profile.id)) continue

    const fromTileId = npcHomeTiles.get(profile.id) ?? profile.defaultLocation
    const homeSafety = areaSafety.get(fromTileId) ?? 100

    if (homeSafety >= MIGRATION_PUSH_SAFETY_THRESHOLD) continue

    // Find a better tile: must have a settlement and higher safety
    let bestTileId: string | null = null
    let bestSafety = MIGRATION_PULL_SAFETY_MIN - 1

    for (const tileId of tilesWithSettlement) {
      if (tileId === fromTileId) continue
      const safety = areaSafety.get(tileId) ?? 0
      if (safety > bestSafety) {
        bestSafety = safety
        bestTileId = tileId
      }
    }

    if (!bestTileId) continue

    intents.push({
      npcId: profile.id,
      fromTileId,
      toTileId: bestTileId,
      reason: `safety_crisis:${Math.round(homeSafety)}`,
    })
  }

  return intents
}
