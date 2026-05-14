import { makeLivingWorldCommand, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { CulturalElementProjection } from '../projections/culturalElement.js'
import type { SkillXpProjection } from '../projections/skillXp.js'
import type { BuildingDef } from '../buildings/types.js'
import type { NpcProfile } from '../npcs/types.js'
import {
  CULTURAL_FESTIVAL_THRESHOLD,
  CULTURAL_NORM_NPC_THRESHOLD,
  RITUAL_FACTION_LEANS,
} from '../config/world.js'

// Only tide_festival window is wired to festival formation.
const FESTIVAL_WINDOW_TILE: Record<string, string> = {
  tide_festival: 't_temple',
}

export function planFestivalSeed(
  projection: CulturalElementProjection,
  event: { windowId: string },
  tick: number,
): LivingWorldCommand | null {
  const tileId = FESTIVAL_WINDOW_TILE[event.windowId]
  if (!tileId) return null
  if (projection.hasFestival(event.windowId)) return null
  const count = projection.getFestivalCounter(event.windowId)
  // Counter was incremented when RARE_WINDOW_OPEN was projected;
  // seeder runs after acceptance, so current count is already ≥1.
  if (count < CULTURAL_FESTIVAL_THRESHOLD) return null
  return makeLivingWorldCommand(
    'CULTURAL_FESTIVAL_FORMED',
    'system.culture',
    'system',
    tick,
    tick,
    {
      windowId: event.windowId,
      tileId,
      occurrenceCount: count,
      formedAtTick: tick,
      narration: `潮汐節已進行了${count}次，${tileId}的居民開始將這日視為固定慶典。`,
    },
  )
}

export function planRitualSeed(
  event: { npcId: string; buildingId: string; tileId: string },
  npcProfile: NpcProfile | null,
  building: BuildingDef | null,
  rareWindowOpen: boolean,
  tick: number,
): LivingWorldCommand | null {
  if (!rareWindowOpen) return null
  if (!building?.tags?.includes('ritual_site')) return null
  const factionLean = String(npcProfile?.personality.factionLean ?? '')
  if (!(RITUAL_FACTION_LEANS as readonly string[]).includes(factionLean)) return null
  return makeLivingWorldCommand(
    'CULTURAL_RITUAL_PERFORMED',
    event.npcId,
    'npc',
    tick,
    tick,
    {
      npcId: event.npcId,
      buildingId: event.buildingId,
      tileId: event.tileId,
      factionLean,
      performedAtTick: tick,
      narration: `${event.npcId}在稀有窗口期間於${event.buildingId}舉行了儀式。`,
    },
  )
}

export function planNormSeed(
  projection: CulturalElementProjection,
  skillXpProjection: SkillXpProjection,
  tileId: string,
  skillId: string,
  npcLocations: readonly { npcId: string; tileId: string }[],
  tick: number,
): LivingWorldCommand | null {
  if (projection.hasNorm(tileId, skillId)) return null
  const npcsOnTile = npcLocations.filter((n) => n.tileId === tileId).map((n) => n.npcId)
  const qualifiedCount = npcsOnTile.filter((npcId) => {
    const rows = skillXpProjection.getByNpc(npcId)
    return rows.some((r) => r.skillId === skillId && r.level >= 1)
  }).length
  if (qualifiedCount < CULTURAL_NORM_NPC_THRESHOLD) return null
  return makeLivingWorldCommand(
    'CULTURAL_NORM_ESTABLISHED',
    'system.culture',
    'system',
    tick,
    tick,
    {
      tileId,
      skillId,
      npcCount: qualifiedCount,
      formedAtTick: tick,
      narration: `${tileId}已有${qualifiedCount}位居民精通${skillId}，這項技藝成為當地的地方傳統。`,
    },
  )
}
