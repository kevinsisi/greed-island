// Offline catch-up summary — given a tick window, group committed
// living-world events by area, NPC, and faction so a returning player
// can read "while you were gone..." in one shot. The function is a
// pure derivation over the EventLog window: same inputs, same output.

import { hashCanonicalJson } from './canonicalJson.js'
import type { Event } from './types.js'
import type {
  AreaPressureCmd,
  BuildingConstructedCmd,
  BuildingEnterCmd,
  ConstructionProjectProgressCmd,
  LivingWorldEventPayload,
  MapTileUnlockedCmd,
  NpcChildBornCmd,
  NpcHouseholdFormedCmd,
  NpcInteractCmd,
  NpcLifeGoalSetCmd,
  NpcMoveCmd,
  NpcProductiveActionCmd,
  SeasonChangeCmd,
  WeatherChangeCmd,
  WorldEventSpawnCmd
} from './livingWorldCommands.js'

export type CatchUpSummary = Readonly<{
  sinceTick: number
  untilTick: number
  totalEvents: number
  byNpc: Readonly<Record<string, number>>
  byArea: Readonly<Record<string, number>>
  worldEvents: ReadonlyArray<{
    tick: number
    templateId: string
    type: string
    scope: string
    narration: string
  }>
  weatherChanges: ReadonlyArray<{ tick: number; from: string; to: string }>
  seasonChanges: ReadonlyArray<{ tick: number; from: string; to: string }>
  pressureMoments: ReadonlyArray<{
    tick: number
    tileId: string
    kind: string
    narration: string
  }>
  productiveActions: ReadonlyArray<{
    tick: number
    tile: string
    npcId: string
    domain: string
    metric: string
    delta: number
    narration: string
  }>
  constructionProgress: ReadonlyArray<{
    tick: number
    projectId: string
    targetTileId: string
    progressAfter: number
    targetProgress: number
    motivation?: ConstructionProjectProgressCmd['motivation']
    narration: string
  }>
  expansions: ReadonlyArray<{
    tick: number
    kind: 'building' | 'map_tile'
    projectId: string
    id: string
    tileId: string
    motivation?: BuildingConstructedCmd['motivation'] | MapTileUnlockedCmd['motivation']
    narration: string
  }>
  households: ReadonlyArray<{
    tick: number
    kind: 'formed' | 'child_born'
    householdId: string
    narration: string
  }>
  lifeGoals: ReadonlyArray<{
    tick: number
    npcId: string
    tile: string
    goalKind: string
    pressure: number
    narration: string
  }>
  interactions: ReadonlyArray<{
    tick: number
    tile: string
    a: string
    b: string
    mode: 'chat' | 'argue'
  }>
  digest: string
}>

export function summarizeWindow(
  events: readonly Event[],
  sinceTick: number,
  untilTick: number
): CatchUpSummary {
  const byNpc: Record<string, number> = {}
  const byArea: Record<string, number> = {}
  const worldEvents: Array<{
    tick: number
    templateId: string
    type: string
    scope: string
    narration: string
  }> = []
  const weatherChanges: Array<{ tick: number; from: string; to: string }> = []
  const seasonChanges: Array<{ tick: number; from: string; to: string }> = []
  const pressureMoments: Array<{
    tick: number
    tileId: string
    kind: string
    narration: string
  }> = []
  const productiveActions: Array<{
    tick: number
    tile: string
    npcId: string
    domain: string
    metric: string
    delta: number
    narration: string
  }> = []
  const constructionProgress: Array<{
    tick: number
    projectId: string
    targetTileId: string
    progressAfter: number
    targetProgress: number
    motivation?: ConstructionProjectProgressCmd['motivation']
    narration: string
  }> = []
  const expansions: Array<{
    tick: number
    kind: 'building' | 'map_tile'
    projectId: string
    id: string
    tileId: string
    motivation?: BuildingConstructedCmd['motivation'] | MapTileUnlockedCmd['motivation']
    narration: string
  }> = []
  const households: Array<{
    tick: number
    kind: 'formed' | 'child_born'
    householdId: string
    narration: string
  }> = []
  const lifeGoals: Array<{
    tick: number
    npcId: string
    tile: string
    goalKind: string
    pressure: number
    narration: string
  }> = []
  const interactions: Array<{
    tick: number
    tile: string
    a: string
    b: string
    mode: 'chat' | 'argue'
  }> = []

  let total = 0
  for (const event of events) {
    const tick = typeof event.tick === 'number' ? event.tick : 0
    if (tick <= sinceTick || tick > untilTick) continue
    if (!isLivingWorldEventPayload(event.payload)) continue
    total += 1
    const data = event.payload.data
    switch (event.eventType) {
      case 'NPC_INTERACT': {
        const d = data as NpcInteractCmd
        const [a, b] = sortedPair(d.participants[0], d.participants[1])
        byNpc[a] = (byNpc[a] ?? 0) + 1
        byNpc[b] = (byNpc[b] ?? 0) + 1
        byArea[d.tile] = (byArea[d.tile] ?? 0) + 1
        interactions.push({ tick, tile: d.tile, a, b, mode: d.mode })
        break
      }
      case 'NPC_MOVE': {
        const d = data as NpcMoveCmd
        if (d.reachedDest) {
          byNpc[d.npcId] = (byNpc[d.npcId] ?? 0) + 1
          byArea[d.to] = (byArea[d.to] ?? 0) + 1
        }
        break
      }
      case 'NPC_PRODUCTIVE_ACTION': {
        const d = data as NpcProductiveActionCmd
        byNpc[d.npcId] = (byNpc[d.npcId] ?? 0) + 1
        byArea[d.tile] = (byArea[d.tile] ?? 0) + 1
        productiveActions.push({
          tick,
          tile: d.tile,
          npcId: d.npcId,
          domain: d.domain,
          metric: d.metric,
          delta: d.delta,
          narration: d.narration
        })
        break
      }
      case 'NPC_LIFE_GOAL_SET': {
        const d = data as NpcLifeGoalSetCmd
        byNpc[d.npcId] = (byNpc[d.npcId] ?? 0) + 1
        byArea[d.tile] = (byArea[d.tile] ?? 0) + 1
        lifeGoals.push({
          tick,
          npcId: d.npcId,
          tile: d.tile,
          goalKind: d.goal.kind,
          pressure: d.goal.pressure,
          narration: d.narration
        })
        break
      }
      case 'CONSTRUCTION_PROJECT_PROGRESS': {
        const d = data as ConstructionProjectProgressCmd
        byNpc[d.npcId] = (byNpc[d.npcId] ?? 0) + 1
        byArea[d.targetTileId] = (byArea[d.targetTileId] ?? 0) + 1
        constructionProgress.push({
          tick,
          projectId: d.projectId,
          targetTileId: d.targetTileId,
          progressAfter: d.progressAfter,
          targetProgress: d.targetProgress,
          ...(d.motivation ? { motivation: d.motivation } : {}),
          narration: d.narration
        })
        break
      }
      case 'BUILDING_CONSTRUCTED': {
        const d = data as BuildingConstructedCmd
        byArea[d.tileId] = (byArea[d.tileId] ?? 0) + 1
        expansions.push({ tick, kind: 'building', projectId: d.projectId, id: d.buildingId, tileId: d.tileId, ...(d.motivation ? { motivation: d.motivation } : {}), narration: d.narration })
        break
      }
      case 'MAP_TILE_UNLOCKED': {
        const d = data as MapTileUnlockedCmd
        byArea[d.tileId] = (byArea[d.tileId] ?? 0) + 1
        expansions.push({ tick, kind: 'map_tile', projectId: d.projectId, id: d.tileId, tileId: d.tileId, ...(d.motivation ? { motivation: d.motivation } : {}), narration: d.narration })
        break
      }
      case 'NPC_HOUSEHOLD_FORMED': {
        const d = data as NpcHouseholdFormedCmd
        households.push({ tick, kind: 'formed', householdId: d.householdId, narration: d.narration })
        for (const npcId of d.partnerNpcIds) byNpc[npcId] = (byNpc[npcId] ?? 0) + 1
        byArea[d.homeTileId] = (byArea[d.homeTileId] ?? 0) + 1
        break
      }
      case 'NPC_CHILD_BORN': {
        const d = data as NpcChildBornCmd
        households.push({ tick, kind: 'child_born', householdId: d.householdId, narration: d.narration })
        break
      }
      case 'BUILDING_ENTER': {
        const d = data as BuildingEnterCmd
        byNpc[d.npcId] = (byNpc[d.npcId] ?? 0) + 1
        byArea[d.tileId] = (byArea[d.tileId] ?? 0) + 1
        break
      }
      case 'AREA_PRESSURE': {
        const d = data as AreaPressureCmd
        byArea[d.tileId] = (byArea[d.tileId] ?? 0) + 1
        pressureMoments.push({ tick, tileId: d.tileId, kind: d.kind, narration: d.narration })
        break
      }
      case 'WEATHER_CHANGE': {
        const d = data as WeatherChangeCmd
        weatherChanges.push({ tick, from: d.from, to: d.to })
        break
      }
      case 'SEASON_CHANGE': {
        const d = data as SeasonChangeCmd
        seasonChanges.push({ tick, from: d.from, to: d.to })
        break
      }
      case 'WORLD_EVENT_SPAWN': {
        const d = data as WorldEventSpawnCmd
        worldEvents.push({
          tick,
          templateId: d.templateId,
          type: d.type,
          scope: d.scope,
          narration: d.narration
        })
        break
      }
      default:
        break
    }
  }

  const summary = {
    sinceTick,
    untilTick,
    totalEvents: total,
    byNpc,
    byArea,
    worldEvents,
    weatherChanges,
    seasonChanges,
    pressureMoments,
    productiveActions,
    constructionProgress,
    expansions,
    households,
    lifeGoals,
    interactions
  }
  const digest = hashCanonicalJson(summary)
  return { ...summary, digest }
}

function sortedPair(a: string, b: string): readonly [string, string] {
  return a < b ? [a, b] : [b, a]
}

function isLivingWorldEventPayload(value: unknown): value is LivingWorldEventPayload {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  if (typeof r.actorType !== 'string') return false
  if (!('data' in r) || typeof r.data !== 'object' || r.data === null) return false
  return true
}
