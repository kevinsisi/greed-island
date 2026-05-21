// Autonomous carrier NPC goods transport planner (v0.48.0).
//
// Carrier NPCs (personality.traderRole === 'carrier') dispatch themselves
// when idle at a settlement with surplus goods, routing to the settlement
// with the greatest deficiency of that good. Travel takes
// CARRIER_TRAVEL_TICKS_PER_HOP × BFS-hop-count ticks; arrival is resolved
// by planCarrierArrivals() each tick.
//
// Command pipeline:
//   dispatch: TRADE_ROUTE_OPENED? → GOODS_CONSUMED → GOODS_TRANSPORT_STARTED
//   arrival:  GOODS_TRANSPORT_ARRIVED + GOODS_STORED  (or GOODS_TRANSPORT_LOST on storm)

import type { NpcProfile } from '../npcs/types.js'
import type { SettlementRow } from '../projections/settlements.js'
import type { GoodsInventoryProjection } from '../projections/goodsInventory.js'
import type { LogisticsProjection, GoodsTransportRow } from '../projections/logistics.js'
import type { SettlementsProjection } from '../projections/settlements.js'
import type { SimNpcState } from './runtime.js'
import {
  makeLivingWorldCommand,
} from '../kernel/livingWorldCommands.js'

const SIM_ACTOR_WORLD = 'system'
import type { LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { getMapAdjacency, TILE_NAME_BY_ID } from './mapGraph.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { TICKS_PER_HOUR } from '../config/world.js'

export const CARRIER_HAUL_MIN = 5
export const CARRIER_HAUL_MAX = 20
export const CARRIER_TRAVEL_TICKS_PER_HOP = TICKS_PER_HOUR

export function isCarrierProfile(profile: NpcProfile): boolean {
  return profile.personality['traderRole'] === 'carrier'
}

function hopCount(fromTileId: string, toTileId: string, unlockedTileIds: readonly string[]): number {
  if (fromTileId === toTileId) return 0
  const adjacency = getMapAdjacency(unlockedTileIds)
  const visited = new Set<string>([fromTileId])
  let frontier = [fromTileId]
  let hops = 0
  while (frontier.length > 0) {
    hops++
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of adjacency[id] ?? []) {
        if (neighbor === toTileId) return hops
        if (!visited.has(neighbor)) { visited.add(neighbor); next.push(neighbor) }
      }
    }
    frontier = next
  }
  return Infinity
}

function settlementHolderIds(settlement: SettlementRow): readonly string[] {
  return [settlement.id, `settlement.${settlement.tileId}`]
}

function goodsAtSettlement(
  goodsId: string,
  settlement: SettlementRow,
  inv: GoodsInventoryProjection,
): number {
  const ids = settlementHolderIds(settlement)
  return inv.list()
    .filter((r) => r.holderType === 'settlement' && ids.includes(r.holderId) && r.goodsId === goodsId)
    .reduce((sum, r) => sum + r.quantity, 0)
}

function buildRouteId(fromTileId: string, toTileId: string, goodsId: string): string {
  return `route.${fromTileId}.${toTileId}.${goodsId}`
}

function buildTransportId(routeId: string, tick: number, holderId: string, goodsId: string): string {
  return `transport.${hashCanonicalJson({ routeId, tick, holderId, goodsId }).slice(0, 16)}`
}

function findBestDestination(
  goodsId: string,
  fromTileId: string,
  settlementsProjection: SettlementsProjection,
  inv: GoodsInventoryProjection,
  unlockedTileIds: readonly string[],
): SettlementRow | null {
  const candidates = settlementsProjection.getAll()
    .filter((s) => s.tileId !== fromTileId && s.status !== 'declining')
    .map((s) => {
      const hops = hopCount(fromTileId, s.tileId, unlockedTileIds)
      if (hops === Infinity) return null
      const qty = goodsAtSettlement(goodsId, s, inv)
      return { settlement: s, qty, hops }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  if (candidates.length === 0) return null
  // Pick settlement with fewest units of this good; break ties by distance
  candidates.sort((a, b) => a.qty - b.qty || a.hops - b.hops)
  return candidates[0]!.settlement
}

export function planCarrierDispatches(input: {
  tick: number
  submittedAt: number
  profiles: readonly NpcProfile[]
  npcStates: readonly SimNpcState[]
  settlementsProjection: SettlementsProjection
  goodsInventoryProjection: GoodsInventoryProjection
  logisticsProjection: LogisticsProjection
  stormActive: boolean
  unlockedTileIds: readonly string[]
  plannedRouteIds: Set<string>
  plannedTransportIds: Set<string>
}): LivingWorldCommand[] {
  const { tick, submittedAt, unlockedTileIds } = input
  const commands: LivingWorldCommand[] = []

  const carrierProfiles = input.profiles.filter(isCarrierProfile)
  if (carrierProfiles.length === 0) return commands

  const startedTransports = input.logisticsProjection.getStartedTransports()
  const activeCarrierIds = new Set(startedTransports.map((t) => t.carrierNpcId))

  for (const profile of carrierProfiles) {
    const npcState = input.npcStates.find((n) => n.id === profile.id)
    if (!npcState) continue
    if (activeCarrierIds.has(profile.id)) continue  // already carrying
    if (npcState.activity === 'move') continue       // en route

    const currentTile = npcState.location
    const settlements = input.settlementsProjection.getByTile(currentTile)
      .filter((s) => s.status !== 'declining')
    if (settlements.length === 0) continue
    const sourceSett = settlements[0]!

    const holderIds = settlementHolderIds(sourceSett)
    const surplusRows = input.goodsInventoryProjection.list()
      .filter((r) =>
        r.holderType === 'settlement' &&
        holderIds.includes(r.holderId) &&
        r.quantity >= CARRIER_HAUL_MIN,
      )
      .sort((a, b) => b.quantity - a.quantity)

    if (surplusRows.length === 0) continue
    const sourceRow = surplusRows[0]!

    const dest = findBestDestination(
      sourceRow.goodsId,
      currentTile,
      input.settlementsProjection,
      input.goodsInventoryProjection,
      unlockedTileIds,
    )
    if (!dest) continue

    const quantity = Math.min(sourceRow.quantity, CARRIER_HAUL_MAX)
    const routeId = buildRouteId(currentTile, dest.tileId, sourceRow.goodsId)
    const transportId = buildTransportId(routeId, tick, sourceSett.id, sourceRow.goodsId)

    if (input.plannedTransportIds.has(transportId)) continue
    input.plannedTransportIds.add(transportId)

    const sourceName = TILE_NAME_BY_ID[currentTile] ?? currentTile
    const destName = TILE_NAME_BY_ID[dest.tileId] ?? dest.tileId

    if (!input.logisticsProjection.isRouteOpen(routeId) && !input.plannedRouteIds.has(routeId)) {
      input.plannedRouteIds.add(routeId)
      commands.push(
        makeLivingWorldCommand('TRADE_ROUTE_OPENED', SIM_ACTOR_WORLD, 'system', tick, submittedAt, {
          routeId,
          fromTileId: currentTile,
          toTileId: dest.tileId,
          goodsId: sourceRow.goodsId,
          openedAtTick: tick,
          narration: `${profile.name.zh} 開闢 ${sourceName}→${destName} 的 ${sourceRow.goodsId} 運輸路線。`,
        }),
      )
    }

    commands.push(
      makeLivingWorldCommand('GOODS_CONSUMED', profile.id, 'npc', tick, submittedAt, {
        goodsId: sourceRow.goodsId,
        quantity,
        holderType: 'settlement' as const,
        holderId: sourceRow.holderId,
        tileId: currentTile,
        consumerNpcId: profile.id,
        consumedAtTick: tick,
        narration: `${profile.name.zh} 裝載 ${quantity} 份 ${sourceRow.goodsId}，準備前往${destName}。`,
      }),
      makeLivingWorldCommand('GOODS_TRANSPORT_STARTED', profile.id, 'npc', tick, submittedAt, {
        transportId,
        routeId,
        goodsId: sourceRow.goodsId,
        quantity,
        carrierNpcId: profile.id,
        fromHolderType: 'settlement' as const,
        fromHolderId: sourceRow.holderId,
        fromTileId: currentTile,
        toHolderType: 'settlement' as const,
        toHolderId: `settlement.${dest.tileId}`,
        toTileId: dest.tileId,
        startedAtTick: tick,
        narration: `${profile.name.zh} 從${sourceName}出發，攜帶 ${quantity} 份 ${sourceRow.goodsId} 前往${destName}。`,
      }),
    )
  }

  return commands
}

export function planCarrierArrivals(input: {
  tick: number
  submittedAt: number
  startedTransports: readonly GoodsTransportRow[]
  stormActive: boolean
  unlockedTileIds: readonly string[]
  plannedTransportResolutions: Set<string>
}): LivingWorldCommand[] {
  const { tick, submittedAt, stormActive, unlockedTileIds } = input
  const commands: LivingWorldCommand[] = []

  for (const transport of input.startedTransports) {
    if (input.plannedTransportResolutions.has(transport.transportId)) continue

    const hops = hopCount(transport.fromTileId, transport.toTileId, unlockedTileIds)
    if (hops === Infinity) continue
    const arrivalTick = transport.startedAtTick + hops * CARRIER_TRAVEL_TICKS_PER_HOP
    if (tick < arrivalTick) continue

    input.plannedTransportResolutions.add(transport.transportId)

    const destName = TILE_NAME_BY_ID[transport.toTileId] ?? transport.toTileId

    if (stormActive) {
      commands.push(
        makeLivingWorldCommand('GOODS_TRANSPORT_LOST', SIM_ACTOR_WORLD, 'system', tick, submittedAt, {
          transportId: transport.transportId,
          routeId: transport.routeId,
          goodsId: transport.goodsId,
          quantity: transport.quantity,
          carrierNpcId: transport.carrierNpcId,
          fromTileId: transport.fromTileId,
          toTileId: transport.toTileId,
          reason: 'storm',
          lostAtTick: tick,
          narration: `暴風雨打斷運輸，${transport.quantity} 份 ${transport.goodsId} 在途中遺失。`,
        }),
      )
      continue
    }

    commands.push(
      makeLivingWorldCommand('GOODS_TRANSPORT_ARRIVED', transport.carrierNpcId, 'npc', tick, submittedAt, {
        transportId: transport.transportId,
        routeId: transport.routeId,
        goodsId: transport.goodsId,
        quantity: transport.quantity,
        carrierNpcId: transport.carrierNpcId,
        toHolderType: transport.toHolderType,
        toHolderId: transport.toHolderId,
        toTileId: transport.toTileId,
        arrivedAtTick: tick,
        narration: `${transport.carrierNpcId} 把 ${transport.quantity} 份 ${transport.goodsId} 送抵${destName}。`,
      }),
      makeLivingWorldCommand('GOODS_STORED', SIM_ACTOR_WORLD, 'system', tick, submittedAt, {
        goodsId: transport.goodsId,
        quantity: transport.quantity,
        holderType: transport.toHolderType,
        holderId: transport.toHolderId,
        tileId: transport.toTileId,
        storedAtTick: tick,
        narration: `${destName} 收到 ${transport.quantity} 份 ${transport.goodsId}。`,
      }),
    )
  }

  return commands
}
