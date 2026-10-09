import type { AccountId } from '../identity/principal.js'
import type { PlayerWorldProjection } from '../projections/playerWorld.js'
import { getRegionGeometry, projectNpcPoint } from './geometry.js'
import { HarborBeaconProjection, type HarborProgressPolicy } from './harborBeacon.js'
import type { WorldChatMessage } from './chat.js'
import { PlayerWorldError, type CanonicalPlayerWorldSource } from './types.js'

export function createPlayerWorldSnapshot(id: AccountId, positions: PlayerWorldProjection,
  source: CanonicalPlayerWorldSource, online: ReadonlySet<AccountId>, movementStep: number, displayNames: ReadonlyMap<AccountId, string | null> = new Map(), presenceRevision = 0, messages: readonly WorldChatMessage[] = [], harbor: HarborBeaconProjection = new HarborBeaconProjection(), harborPolicy?: HarborProgressPolicy) {
  const self = positions.get(id)
  if (!self) throw new PlayerWorldError(409, 'WORLD_ENTRY_REQUIRED', 'Enter the canonical world first.')
  const geometryFor = source.getGeometry?.bind(source) ?? getRegionGeometry
  const geometry = geometryFor(self.tileId)
  if (!geometry) throw new PlayerWorldError(409, 'GEOMETRY_UNAVAILABLE', 'Region geometry is not supported yet.')
  const map = source.getMap()
  const onlinePositions = [...online].flatMap(accountId => { const row = positions.get(accountId); return row ? [row] : [] })
  const regionOnlineCounts: Record<string, number> = {}
  for (const player of onlinePositions) {
    regionOnlineCounts[player.tileId] = (regionOnlineCounts[player.tileId] ?? 0) + 1
  }
  return {
    version: 1 as const, worldId: 'canonical-world' as const, selfId: id, tileId: self.tileId,
    revision: source.getRevision(), presenceRevision, movementStep, worldTick: source.getTick(),
    players: [...onlinePositions, ...(online.has(id) ? [] : [self])]
      .filter(player => player.tileId === self.tileId && (player.interior?.buildingId ?? null) === (self.interior?.buildingId ?? null)).sort((a, b) => a.accountId - b.accountId)
      .map(player => ({ ...player, harborProgress: harbor.getProgress(player.accountId, harborPolicy), online: online.has(player.accountId),
        ...(displayNames.get(player.accountId) ? { displayName: displayNames.get(player.accountId)! } : {}) })),
    interior: self.interior ? { buildingId: self.interior.buildingId, layout: structuredClone(source.getBuilding?.(self.interior.buildingId, self.tileId)?.interior ?? null),
      occupants: source.getNpcs().filter(npc => npc.location === self.tileId && npc.buildingId === self.interior!.buildingId && !npc.deceased && npc.activity !== 'move' && npc.travelRoute === null)
        .map(npc => ({ id: npc.id, name: { ...npc.name }, color: npc.color, activity: npc.activity })) } : null,
    npcs: source.getNpcs().filter(npc => !self.interior && npc.location === self.tileId && !npc.deceased
      && npc.buildingId === null && npc.activity !== 'move' && npc.travelRoute === null)
      .map(npc => ({ id: npc.id, name: { ...npc.name }, color: npc.color, location: npc.location,
        activity: npc.activity, subCol: npc.subCol, subRow: npc.subRow, subZ: npc.subZ,
        presentationPosition: projectNpcPoint(npc.subCol, npc.subRow, geometry) })),
    beacon: harbor.snapshot(), harborProgress: harbor.getProgress(id, harborPolicy),
    messages: messages.map(message => ({ ...message })),
    geometry: structuredClone(geometry),
    map: { ...structuredClone(map), regionOnlineCounts,
      regions: map.regions.map(region => ({ ...region, geometrySupported: geometryFor(region.id) !== null })) },
  }
}
export type PlayerWorldSnapshot = ReturnType<typeof createPlayerWorldSnapshot>
