import type Database from 'better-sqlite3'
import type { SimulationRuntime, NarrativeEvent, SimNpcState } from '../sim/runtime.js'
import type { ActiveWorldEvent } from '../events/types.js'
import { findEventTemplate } from '../events/templates.js'
import { WEATHER_AGENT_ACTOR_ID } from '../kernel/livingWorldCommands.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'

const WORLD_EVENT_PAYLOAD_KEYS = ['effect','surfaceMovementPenalty','visibilityPenalty','windowId','staminaDecay','npcId','percent','region','rarityHint','releaseSource','rank','shopType'] as const
const PUBLIC_NARRATIVE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  WEATHER_CHANGE: ['from','to','weather','previousWeather'], SEASON_CHANGE: ['from','to','season','previousSeason'],
  RARE_WINDOW_OPEN: ['windowId','closesAtTick'], RARE_WINDOW_CLOSE: ['windowId'],
  WORLD_EVENT_SPAWN: ['worldEventId','templateId','type','scope','endsAtTick'], WORLD_EVENT_END: ['worldEventId','templateId'],
  MAP_TILE_UNLOCKED: ['tileId'], BUILDING_CONSTRUCTED: ['buildingId','tileId'],
  BUILDING_UPGRADED: ['buildingId','tileId','fromLevel','toLevel'], BUILDING_DAMAGED: ['buildingId','tileId','health','cause'], BUILDING_ABANDONED: ['buildingId','tileId','lastActivityTick'],
  FACTION_TILE_SEIZED: ['tileId','factionId','previousFactionId','seizedAtTick'], FACTION_DOMINANCE_SHIFTED: ['losingFactionId','dominantFactionId','lostTileCount','tick'],
  WORLD_GOAL_DECLARED: ['goalId','domain','title','targetProgress','declaredAtTick'], WORLD_GOAL_PROGRESS_RECORDED: ['goalId','progressDelta','recordedAtTick'], WORLD_TECH_DISCOVERED: ['techId','domain','title','discoveredAtTick'],
}
export const PUBLIC_NARRATIVE_EVENT_TYPES = Object.freeze(Object.keys(PUBLIC_NARRATIVE_FIELDS))
function scalarFields(value: unknown, keys: readonly string[]) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(keys.flatMap(key => {
    const item = row[key]
    return item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)) || (typeof item === 'string' && item.length <= 1000) ? [[key, item]] : []
  }))
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length <= 1000) : [] }
function localized(value: { zh: string; en: string }) { return { zh: value.zh, en: value.en } }

export function publicActiveEvent(event: ActiveWorldEvent) {
  // Current authored registry only: arbitrary future/AI payloads are not public.
  if (!findEventTemplate(event.templateId)) return null
  return {
    id: event.id, templateId: event.templateId, type: event.type,
    scope: event.scope.kind === 'world' ? { kind: 'world' as const } : { kind: 'region' as const, tileIds: [...event.scope.tileIds] },
    startedAtTick: event.startedAtTick, endsAtTick: event.endsAtTick, text: localized(event.text),
    payload: scalarFields(event.payload, WORLD_EVENT_PAYLOAD_KEYS),
  }
}
export function publicWorldSnapshot(runtime: SimulationRuntime) {
  const world = runtime.getSnapshot(), facts = world.facts
  const expansion = facts.lifeExpansion && typeof facts.lifeExpansion === 'object' ? facts.lifeExpansion as Record<string, unknown> : {}
  const projects = expansion.constructionProjects && typeof expansion.constructionProjects === 'object' ? expansion.constructionProjects as Record<string, unknown> : {}
  const npcIds = new Set(runtime.getNpcs().map(npc => npc.id))
  const crews = new Map(runtime.getInProgressConstructionProjects().map(project => [project.projectId, project.builderNpcIds.filter(id => npcIds.has(id))]))
  const civilization = {
    goals: world.worldCivilization.goals.map(goal => ({ goalId: goal.goalId, domain: goal.domain, title: goal.title,
      targetProgress: goal.targetProgress, progress: goal.progress, declaredAtTick: goal.declaredAtTick,
      completed: goal.completed, completedAtTick: goal.completedAtTick })),
    technologies: world.worldCivilization.technologies.map(technology => ({ techId: technology.techId, domain: technology.domain,
      title: technology.title, discoveredAtTick: technology.discoveredAtTick, evidenceCount: technology.evidenceEventIds.length, unlocks: [...technology.unlocks] })),
  }
  return {
    tick: world.tick, lastSequence: world.lastSequence, eventCount: world.eventCount, npcCount: world.npcCount,
    facts: {
      ...scalarFields(facts, ['weather','season','rareWindowOpen','rareWindowClosesAtTick']),
      activeEvents: runtime.getActiveWorldEvents().flatMap(event => { const dto = publicActiveEvent(event); return dto ? [dto] : [] }),
      areaStates: runtime.getAreaStates().map(area => ({ tileId: area.tileId,
        factionControl: scalarFields(area.factionControl, ['tide_hunters','free_runners','guild','civilian']),
        dominantFaction: area.dominantFaction, resources: scalarFields(area.resources, ['food','safety','economy']), lastUpdatedTick: area.lastUpdatedTick })),
      lifeExpansion: { unlockedTileIds: strings(expansion.unlockedTileIds), unlockedBuildingIds: strings(expansion.unlockedBuildingIds),
        constructionProjects: Object.fromEntries(Object.entries(projects).map(([id, project]) => [id, { ...scalarFields(project,
          ['projectId','kind','targetTileId','buildingId','progress','targetProgress','startedAtTick','completedAtTick','initiatedByNpcId']), builderNpcIds: [...(crews.get(id) ?? [])] }])) },
      worldCivilization: civilization,
    },
    worldCivilization: civilization,
    worldConfig: { tickDurationMs: world.worldConfig.tickDurationMs, ticksPerDay: world.worldConfig.ticksPerDay,
      timezone: world.worldConfig.timezone, timezoneOffsetMinutes: world.worldConfig.timezoneOffsetMinutes },
    tickCommandStats: scalarFields(world.tickCommandStats, ['lastTick','peak','softCap','softCapHitCount','hardCap','hardCapRejectedSinceBoot']),
    npcPartition: scalarFields(world.npcPartition, ['activeCount','totalCount','period']), generatedAt: world.generatedAt,
  }
}
export function publicNpc(npc: SimNpcState) {
  return {
    id: npc.id, name: localized(npc.name), role: localized(npc.role), location: npc.location,
    relationshipScore: npc.relationshipScore, relationshipScoreSource: 'profile-seed' as const,
    lastActedTick: npc.lastActedTick, internalState: {}, // Explicit privacy redaction, never a mind/plan projection.
    activity: npc.activity, mood: npc.mood, health: npc.health, faction: npc.faction,
    subCol: npc.subCol, subRow: npc.subRow, subZ: npc.subZ, buildingId: npc.buildingId,
    travelRoute: npc.travelRoute ? { fromTile: npc.travelRoute.fromTile, toTile: npc.travelRoute.toTile,
      targetTile: npc.travelRoute.targetTile, startedAtTick: npc.travelRoute.startedAtTick } : null,
    color: npc.color, greetLine: localized(npc.greetLine), deceased: npc.deceased,
  }
}
export function publicMap(runtime: SimulationRuntime) {
  const map = runtime.getMap()
  return {
    width: map.width, height: map.height,
    tiles: map.tiles.map(tile => ({ id: tile.id, name: tile.name, x: tile.x, y: tile.y, biome: tile.biome, npcIds: [...tile.npcIds] })),
    regions: map.regions.map(region => ({ id: region.id, name: region.name, x: region.x, y: region.y, biome: region.biome, available: region.available, generated: region.generated })),
    adjacency: Object.fromEntries(Object.entries(map.adjacency).map(([id, neighbors]) => [id, [...neighbors]])),
    edges: map.edges.map(edge => ({ fromTileId: edge.fromTileId, toTileId: edge.toTileId, crossingType: edge.crossingType, available: edge.available })),
  }
}
export function publicCatalog(runtime: SimulationRuntime, imageForId?: (id: number) => string | null) {
  const catalog = runtime.getCardCatalog()
  return { version: catalog.version, entries: catalog.entries.map(entry => ({
    id: entry.id, rank: entry.rank, category: entry.category, nameZh: entry.nameZh, nameEn: entry.nameEn,
    description: entry.description, story: entry.story, maxCopies: entry.maxCopies, acquisitionMethod: entry.acquisitionMethod,
    acquisitionDetail: entry.acquisitionDetail, effectDescription: entry.effectDescription, discoveryRuleId: entry.discoveryRuleId,
    restrictionRuleId: entry.restrictionRuleId,
    ...(() => {
      const imageUrl = imageForId?.(entry.id)
      return imageUrl && new RegExp(`^/card-images/${entry.id}\\.(webp|png|jpg|jpeg)$`).test(imageUrl) ? { imageUrl } : {}
    })(),
    ...(entry.ruleOperator ? { ruleOperator: { scope: entry.ruleOperator.scope, scopeId: entry.ruleOperator.scopeId,
      effectKind: entry.ruleOperator.effectKind, effectValue: entry.ruleOperator.effectValue,
      durationTicks: entry.ruleOperator.durationTicks, permittedInvokers: [...entry.ruleOperator.permittedInvokers] } } : {}),
  })) }
}
export function publicNarrativeEvent(event: NarrativeEvent, runtime: SimulationRuntime) {
  const keys = PUBLIC_NARRATIVE_FIELDS[event.eventType]
  if (!keys || typeof event.narration !== 'string' || !event.narration || event.narration.length > 2000) return null
  if (!['system', 'world.civilization', WEATHER_AGENT_ACTOR_ID].includes(event.actorId) && !/^faction\.(guild|tide_hunters|free_runners|civilian|hidden_overseer)$/.test(event.actorId)) return null
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {}
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload
  if (event.eventType === 'WORLD_EVENT_SPAWN' && !findEventTemplate(String((data as Record<string, unknown>).templateId))) return null
  // The allowlist is for reviewed type-owned world generators only. Private
  // dialogue, actor ledgers, FACT_SET snapshots, unknown types and AI-enhanced
  // narration are not copied into the feed, even when narration is nonempty.
  return { sequence: event.sequence, tick: event.tick, eventType: event.eventType, actorId: event.actorId,
    occurredAt: event.occurredAt, payload: scalarFields(data, keys), narration: event.narration }
}
export function tableExists(db: Database.Database, table: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
}
export function readPublicNarratives(eventStore: Pick<SqliteEventStore, 'readRecentEventsByTypes'>, runtime: SimulationRuntime, limit = 50) {
  return eventStore.readRecentEventsByTypes(200, PUBLIC_NARRATIVE_EVENT_TYPES).reverse().flatMap(event => {
    const payload = event.payload as Record<string, unknown>
    const dto = publicNarrativeEvent({ sequence: event.sequence, tick: event.tick ?? 0, eventType: event.eventType,
      actorId: event.actorId, occurredAt: new Date(event.occurredAt).toISOString(), payload,
      narration: typeof payload.narration === 'string' ? payload.narration : null }, runtime)
    return dto ? [dto] : []
  }).slice(0, limit)
}

// Exact AdminWorldPage consumer schemas. This is a separate role-scoped read
// model, not an option to serialize arbitrary world.facts.
const OPERATOR_SCHEMAS = {
  fisheryDensity: { tileId: 'string', density: 'number', harvestedTotal: 'number', collapsed: 'boolean', lastUpdatedTick: 'number', lastSequence: 'number' },
  goodsInventory: { goodsId: 'string', holderType: ['npc','building','settlement'], holderId: 'string', tileId: 'string', quantity: 'number', lastUpdatedTick: 'number', lastSequence: 'number' },
  routes: { routeId: 'string', fromTileId: 'string', toTileId: 'string', goodsId: 'string', open: 'boolean', openedAtTick: 'number', closedAtTick: 'number?', lastSequence: 'number' },
  transports: { transportId: 'string', routeId: 'string', goodsId: 'string', quantity: 'number', carrierNpcId: 'string', fromHolderType: ['npc','building','settlement'], fromHolderId: 'string', fromTileId: 'string', toHolderType: ['npc','building','settlement'], toHolderId: 'string', toTileId: 'string', status: ['started','arrived','lost'], startedAtTick: 'number', resolvedAtTick: 'number?', lossReason: 'string?', lastSequence: 'number' },
  recipes: { recipeId: 'string', inputGoodsId: 'string', inputQuantity: 'number', outputGoodsId: 'string', outputQuantity: 'number', holderType: ['npc','building','settlement'], holderId: 'string', tileId: 'string' },
  processed: { recipeId: 'string', inputGoodsId: 'string', inputQuantityTotal: 'number', outputGoodsId: 'string', outputQuantityTotal: 'number', holderType: ['npc','building','settlement'], holderId: 'string', tileId: 'string', lastProcessedTick: 'number', lastSequence: 'number' },
  marketPrices: { marketId: 'string', settlementId: 'string', goodsId: 'string', supplyQuantity: 'number', demandQuantity: 'number', priceGold: 'number', lastDiscoveredTick: 'number', lastSequence: 'number' },
  migrationRoutes: { waveId: 'string', speciesId: 'string', fromTileId: 'string', toTileId: 'string', migrationType: ['pressure','seasonal'], startedAtTick: 'number', count: 'number' },
  predatorHunger: { predatorSpeciesId: 'string', tileId: 'string', lastKillAtTick: 'number' },
  animalPopulation: { speciesId: 'string', tileId: 'string', biomeRegion: 'string', count: 'number', animalIds: 'strings', lastSpawnedAtTick: 'number', lastKilledAtTick: 'number?' },
  extinctionWarnings: { speciesId: 'string', status: ['warning','extinct'], warningTileIds: 'strings', extinctSince: 'number?', lastWarningTick: 'number?' },
  ecosystemRegions: { tileId: 'string', pressureLevel: 'number', pollutionLevel: 'number', lastPressureRaisedTick: 'number?', lastRecoveredTick: 'number?' },
  livestockRegistry: { animalId: 'string', speciesId: 'string', role: ['livestock','mount'], mountedBy: 'string?', settlementId: 'string', acquiredAtTick: 'number' },
  activeWorldEvents: { worldEventId: 'string', eventKind: 'string', tileId: 'string', linkedAnimalId: 'string', speciesId: 'string', severity: 'number', spawnedAtTick: 'number', huntStartedEmitted: 'boolean' },
  factionEcologyStances: { factionId: 'string', ecologyStance: 'string' },
} as const
export const OPERATOR_OVERVIEW_FIELDS = Object.freeze(Object.keys(OPERATOR_SCHEMAS).filter(key => !['routes','transports','recipes','processed'].includes(key)).concat(['logistics','productionChains','settlements']))
type FieldSpec = 'string' | 'number' | 'boolean' | 'strings' | 'string?' | 'number?' | readonly string[]
type Shape<Schema extends Readonly<Record<string, FieldSpec>>> = Readonly<{ [Key in keyof Schema]: Schema[Key] extends readonly string[] ? Schema[Key][number] : Schema[Key] extends 'number' ? number : Schema[Key] extends 'boolean' ? boolean : Schema[Key] extends 'strings' ? readonly string[] : Schema[Key] extends 'number?' ? number | null : Schema[Key] extends 'string?' ? string | null : string }>
function operatorRow<Schema extends Readonly<Record<string, FieldSpec>>>(value: unknown, schema: Schema): Shape<Schema> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>, result: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(schema)) {
    const field = source[key]
    const valid = Array.isArray(spec) ? typeof field === 'string' && spec.includes(field)
      : spec === 'number' ? typeof field === 'number' && Number.isFinite(field)
      : spec === 'number?' ? field === null || typeof field === 'number' && Number.isFinite(field)
      : spec === 'boolean' ? typeof field === 'boolean'
      : spec === 'strings' ? Array.isArray(field) && field.length <= 5000 && field.every(item => typeof item === 'string' && item.length <= 1000)
      : spec === 'string?' ? field === null || typeof field === 'string' && field.length <= 1000
      : typeof field === 'string' && field.length <= 1000
    if (!valid) return null
    result[key] = Array.isArray(field) ? [...field] : field
  }
  return result as Shape<Schema>
}
function operatorRows<Schema extends Readonly<Record<string, FieldSpec>>>(value: unknown, schema: Schema, exclude?: (row: Record<string, unknown>) => boolean): readonly Shape<Schema>[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null
  const result: Shape<Schema>[] = []
  for (const row of value) {
    if (row && typeof row === 'object' && exclude?.(row as Record<string, unknown>)) continue
    const dto = operatorRow(row, schema); if (!dto) return null
    result.push(dto)
  }
  return result
}
export function operatorWorldSnapshot(runtime: SimulationRuntime) {
  const publicWorld = publicWorldSnapshot(runtime), raw = runtime.getSnapshot().facts
  const nonPlayer = (row: Record<string, unknown>) => row.holderType === 'player' || row.fromHolderType === 'player' || row.toHolderType === 'player'
  const logistics = raw.logistics && typeof raw.logistics === 'object' ? raw.logistics as Record<string, unknown> : null
  const production = raw.productionChains && typeof raw.productionChains === 'object' ? raw.productionChains as Record<string, unknown> : null
  const routes = logistics ? operatorRows(logistics.routes, OPERATOR_SCHEMAS.routes) : null
  const transports = logistics ? operatorRows(logistics.transports, OPERATOR_SCHEMAS.transports, nonPlayer) : null
  const recipes = production ? operatorRows(production.recipes, OPERATOR_SCHEMAS.recipes, nonPlayer) : null
  const processed = production ? operatorRows(production.processed, OPERATOR_SCHEMAS.processed, nonPlayer) : null
  const settlementScalar = { id: 'string', tileId: 'string', formedAtTick: 'number', founderNpcIds: 'strings', populationNpcIds: 'strings', stability: 'number', status: ['stable','strained','declining','recovering'], updatedAtTick: 'number' } as const
  let settlements: Array<Shape<typeof settlementScalar> & { storage: readonly Shape<{ goodsId: 'string'; quantity: 'number' }>[]; pressure: Shape<{ food: 'number'; safety: 'number'; economy: 'number'; logistics: 'number' }> }> | null = Array.isArray(raw.settlements) ? [] : null
  if (settlements) for (const value of raw.settlements as unknown[]) {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const scalar = operatorRow(row, settlementScalar), storage = operatorRows(row.storage, { goodsId: 'string', quantity: 'number' } as const)
    const pressure = operatorRow(row.pressure, { food: 'number', safety: 'number', economy: 'number', logistics: 'number' } as const)
    if (!scalar || !storage || !pressure) { settlements = null; break }
    settlements.push({ ...scalar, storage, pressure })
  }
  const fields = {
    fisheryDensity: operatorRows(raw.fisheryDensity, OPERATOR_SCHEMAS.fisheryDensity),
    goodsInventory: operatorRows(raw.goodsInventory, OPERATOR_SCHEMAS.goodsInventory, nonPlayer),
    logistics: routes && transports ? { routes, transports } : null,
    productionChains: recipes && processed ? { recipes, processed } : null,
    marketPrices: operatorRows(raw.marketPrices, OPERATOR_SCHEMAS.marketPrices), settlements,
    migrationRoutes: operatorRows(raw.migrationRoutes, OPERATOR_SCHEMAS.migrationRoutes),
    predatorHunger: operatorRows(raw.predatorHunger, OPERATOR_SCHEMAS.predatorHunger),
    animalPopulation: operatorRows(raw.animalPopulation, OPERATOR_SCHEMAS.animalPopulation),
    extinctionWarnings: operatorRows(raw.extinctionWarnings, OPERATOR_SCHEMAS.extinctionWarnings),
    ecosystemRegions: operatorRows(raw.ecosystemRegions, OPERATOR_SCHEMAS.ecosystemRegions),
    livestockRegistry: operatorRows(raw.livestockRegistry, OPERATOR_SCHEMAS.livestockRegistry),
    activeWorldEvents: operatorRows(raw.activeWorldEvents, OPERATOR_SCHEMAS.activeWorldEvents),
    factionEcologyStances: operatorRows(raw.factionEcologyStances, OPERATOR_SCHEMAS.factionEcologyStances),
  }
  return { ...publicWorld, facts: { ...publicWorld.facts, ...fields },
    operatorOverviewReady: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, value !== null])) }
}
