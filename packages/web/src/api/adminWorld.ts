import type { ServerWorldSnapshot } from './client'

export const ADMIN_WORLD_FIELDS = ['fisheryDensity','goodsInventory','logistics','productionChains','marketPrices','settlements','migrationRoutes','predatorHunger','animalPopulation','extinctionWarnings','ecosystemRegions','livestockRegistry','activeWorldEvents','factionEcologyStances'] as const
export type AdminWorldField = typeof ADMIN_WORLD_FIELDS[number]
export type AdminWorldReady = Readonly<Record<AdminWorldField, boolean>>
export type ServerAdminWorldSnapshot = Omit<ServerWorldSnapshot, 'facts'> & { facts: Record<AdminWorldField, unknown>; operatorOverviewReady: AdminWorldReady }

type Schema = Readonly<Record<string, string | readonly string[]>>
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 1000
function row(value: unknown, schema: Schema): Record<string, unknown> | null {
  if (!object(value)) return null
  const result: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(schema)) {
    const field = value[key]
    const valid = Array.isArray(spec) ? spec.includes(field as string)
      : spec === 'number' ? finite(field)
      : spec === 'boolean' ? typeof field === 'boolean'
      : spec === 'strings' ? Array.isArray(field) && field.length <= 5000 && field.every(text)
      : spec === 'number?' ? field === null || finite(field)
      : spec === 'string?' ? field === null || text(field)
      : spec === 'string' && text(field)
    if (!valid) return null
    result[key] = Array.isArray(field) ? [...field] : field
  }
  return result
}
function rows(value: unknown, schema: Schema): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null
  const result: Record<string, unknown>[] = []
  for (const valueRow of value) { const parsed = row(valueRow, schema); if (!parsed) return null; result.push(parsed) }
  return result
}
const ADMIN_ROW_SCHEMAS = {
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

function projection(field: AdminWorldField, value: unknown): unknown | null {
  if (field === 'logistics') {
    if (!object(value)) return null
    const routes = rows(value.routes, ADMIN_ROW_SCHEMAS.routes), transports = rows(value.transports, ADMIN_ROW_SCHEMAS.transports)
    return routes && transports ? { routes, transports } : null
  }
  if (field === 'productionChains') {
    if (!object(value)) return null
    const recipes = rows(value.recipes, ADMIN_ROW_SCHEMAS.recipes), processed = rows(value.processed, ADMIN_ROW_SCHEMAS.processed)
    return recipes && processed ? { recipes, processed } : null
  }
  if (field === 'settlements') {
    if (!Array.isArray(value) || value.length > 5000) return null
    const result: Record<string, unknown>[] = []
    for (const valueRow of value) {
      if (!object(valueRow)) return null
      const scalar = row(valueRow, { id: 'string', tileId: 'string', formedAtTick: 'number', founderNpcIds: 'strings', populationNpcIds: 'strings', stability: 'number', status: ['stable','strained','declining','recovering'], updatedAtTick: 'number' })
      const storage = rows(valueRow.storage, { goodsId: 'string', quantity: 'number' }), pressure = row(valueRow.pressure, { food: 'number', safety: 'number', economy: 'number', logistics: 'number' })
      if (!scalar || !storage || !pressure) return null
      result.push({ ...scalar, storage, pressure })
    }
    return result
  }
  return rows(value, ADMIN_ROW_SCHEMAS[field])
}
/** Missing/malformed readiness never becomes an empty successful projection. */
export function parseAdminWorldSnapshot(value: unknown): ServerAdminWorldSnapshot {
  if (!object(value) || !object(value.facts) || !text(value.generatedAt)
    || ![value.tick,value.lastSequence,value.eventCount,value.npcCount].every(number => Number.isSafeInteger(number) && (number as number) >= 0)) throw new Error('Operator world response is unavailable.')
  const asserted = object(value.operatorOverviewReady) ? value.operatorOverviewReady : {}
  const facts = {} as Record<AdminWorldField, unknown>, ready = {} as Record<AdminWorldField, boolean>
  for (const field of ADMIN_WORLD_FIELDS) {
    const parsed = asserted[field] === true ? projection(field, value.facts[field]) : null
    ready[field] = parsed !== null; facts[field] = parsed
  }
  return { tick: value.tick as number, lastSequence: value.lastSequence as number, eventCount: value.eventCount as number, npcCount: value.npcCount as number, generatedAt: value.generatedAt, facts, operatorOverviewReady: ready }
}
