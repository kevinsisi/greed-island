import {
  FREE_RUNNERS_LIVESTOCK_THRESHOLD,
  GUILD_CLEARCUT_PRESSURE_THRESHOLD,
  TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD,
} from '../config/world.js'

export type FactionEcologyStance = 'clearcut' | 'quota' | 'sabotage' | 'ritual'

export type FactionEcologyIntent =
  | Readonly<{ type: 'FOREST_CLEARCUT_ORDERED'; factionId: string; tileId: string; pressureLevel: number; tick: number }>
  | Readonly<{ type: 'FISHING_QUOTA_ENFORCED'; factionId: string; tileId: string; fisheryDensity: number; tick: number }>
  | Readonly<{ type: 'INDUSTRIAL_SITE_SABOTAGED'; factionId: string; tileId: string; livestockCount: number; tick: number }>
  | Readonly<{ type: 'RITUAL_ECOSYSTEM_MANIPULATION'; factionId: string; tick: number }>

export type FactionDef = Readonly<{
  id: string
  ecologyStance: FactionEcologyStance
}>

export type FactionEcologyInput = Readonly<{
  tick: number
  factions: readonly FactionDef[]
  /** Returns ecosystem pressure level (0–100) for the tile. */
  getPressureLevel: (tileId: string) => number
  /** Returns fishery density for the tile. */
  getFisheryDensity: (tileId: string) => number
  /** Returns number of livestock at the settlement on the tile. */
  getLivestockCount: (tileId: string) => number
  /** All tile ids in the world. */
  tileIds: readonly string[]
}>

export function planFactionEcology(input: FactionEcologyInput): readonly FactionEcologyIntent[] {
  const intents: FactionEcologyIntent[] = []

  for (const faction of input.factions) {
    switch (faction.ecologyStance) {
      case 'clearcut': {
        for (const tileId of input.tileIds) {
          const pressure = input.getPressureLevel(tileId)
          if (pressure >= GUILD_CLEARCUT_PRESSURE_THRESHOLD) {
            intents.push({ type: 'FOREST_CLEARCUT_ORDERED', factionId: faction.id, tileId, pressureLevel: pressure, tick: input.tick })
            break
          }
        }
        break
      }
      case 'quota': {
        for (const tileId of input.tileIds) {
          const density = input.getFisheryDensity(tileId)
          if (density > 0 && density <= TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD) {
            intents.push({ type: 'FISHING_QUOTA_ENFORCED', factionId: faction.id, tileId, fisheryDensity: density, tick: input.tick })
            break
          }
        }
        break
      }
      case 'sabotage': {
        for (const tileId of input.tileIds) {
          const count = input.getLivestockCount(tileId)
          if (count >= FREE_RUNNERS_LIVESTOCK_THRESHOLD) {
            intents.push({ type: 'INDUSTRIAL_SITE_SABOTAGED', factionId: faction.id, tileId, livestockCount: count, tick: input.tick })
            break
          }
        }
        break
      }
      case 'ritual': {
        intents.push({ type: 'RITUAL_ECOSYSTEM_MANIPULATION', factionId: faction.id, tick: input.tick })
        break
      }
    }
  }

  return intents
}
