import {
  SETTLEMENT_ECONOMY_HOUSEHOLD_MAX_PRESSURE,
  SETTLEMENT_ECONOMY_HOUSEHOLD_TARGET_GOLD_PER_NPC,
  SETTLEMENT_FISHERY_COLLAPSE_PRESSURE,
  SETTLEMENT_FISHERY_LOW_DENSITY_MAX_PRESSURE,
  SETTLEMENT_FOOD_GOODS,
  SETTLEMENT_FOOD_SHORTAGE_MAX_PRESSURE,
  SETTLEMENT_FOOD_UNITS_PER_NPC,
  SETTLEMENT_LOGISTICS_CLOSED_ROUTE_PRESSURE,
  SETTLEMENT_LOGISTICS_LOST_TRANSPORT_PRESSURE,
  SETTLEMENT_LOGISTICS_MISSING_FOOD_ROUTE_PRESSURE,
  SETTLEMENT_LOGISTICS_RECENT_LOSS_WINDOW_TICKS,
  SETTLEMENT_MARKET_SCARCITY_MAX_PRESSURE,
  SETTLEMENT_SAFETY_AGGRESSION_WEIGHT,
  SETTLEMENT_SAFETY_PREDATOR_PRESSURE_PER_ANIMAL,
  SETTLEMENT_STABILITY_DECLINING_BELOW,
  SETTLEMENT_STABILITY_STRAINED_BELOW,
} from '../config/world.js'
import { getSpecies } from '../ecosystem/species.js'
import {
  makeLivingWorldCommand,
  type LivingWorldCommand,
  type LivingWorldCommandType,
  type SettlementPressure,
  type SettlementStatus,
  type SettlementStorageItem,
} from '../kernel/livingWorldCommands.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import type { FisheryDensityRow } from '../projections/fisheryDensity.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'
import type { HouseholdEconomyRow } from '../projections/householdEconomy.js'
import type { LogisticsSnapshot } from '../projections/logistics.js'
import type { MarketPriceRow } from '../projections/marketPrices.js'
import type { SettlementRow } from '../projections/settlements.js'

export type SettlementNpcPresence = Readonly<{
  npcId: string
  tileId: string
  activity?: string
  isTraveling?: boolean
}>

export type SettlementEngineInput = Readonly<{
  settlements: readonly SettlementRow[]
  npcPresence: readonly SettlementNpcPresence[]
  goodsInventory: readonly GoodsInventoryRow[]
  logistics: LogisticsSnapshot
  marketPrices: readonly MarketPriceRow[]
  fisheryDensity: readonly FisheryDensityRow[]
  animalPopulation: readonly AnimalPopulationRow[]
  householdEconomy: readonly HouseholdEconomyRow[]
  currentTick: number
  submittedAt?: number
}>

export function planSettlementCommands(input: SettlementEngineInput): LivingWorldCommand[] {
  const commands: LivingWorldCommand[] = []
  const submittedAt = input.submittedAt ?? input.currentTick

  for (const settlement of [...input.settlements].sort((a, b) => a.id.localeCompare(b.id))) {
    if (settlement.updatedAtTick === input.currentTick) continue

    const populationNpcIds = populationForSettlement(settlement, input.npcPresence)
    const storage = storageForSettlement(settlement, input.goodsInventory)
    const pressure = pressureForSettlement(settlement, populationNpcIds, input)
    const stability = stabilityFromPressure(pressure)
    const status = statusFromStability(stability, settlement)

    if (!stringArraysEqual(populationNpcIds, settlement.populationNpcIds)) {
      commands.push(makeLivingWorldCommand(
        'SETTLEMENT_POPULATION_UPDATED',
        `settlement.${settlement.id}`,
        'system',
        input.currentTick,
        submittedAt,
        {
          settlementId: settlement.id,
          tileId: settlement.tileId,
          populationNpcIds,
          updatedAtTick: input.currentTick,
          narration: `Settlement ${settlement.id} population recalculated.`,
        }
      ))
    }

    if (!storageEqual(storage, settlement.storage)) {
      commands.push(makeLivingWorldCommand(
        'SETTLEMENT_STORAGE_UPDATED',
        `settlement.${settlement.id}`,
        'system',
        input.currentTick,
        submittedAt,
        {
          settlementId: settlement.id,
          tileId: settlement.tileId,
          storage,
          updatedAtTick: input.currentTick,
          narration: `Settlement ${settlement.id} storage recalculated.`,
        }
      ))
    }

    if (!pressureEqual(pressure, settlement.pressure)) {
      commands.push(makeLivingWorldCommand(
        'SETTLEMENT_PRESSURE_UPDATED',
        `settlement.${settlement.id}`,
        'system',
        input.currentTick,
        submittedAt,
        {
          settlementId: settlement.id,
          tileId: settlement.tileId,
          pressure,
          updatedAtTick: input.currentTick,
          narration: `Settlement ${settlement.id} pressure recalculated.`,
        }
      ))
    }

    if (stability !== settlement.stability || status !== settlement.status) {
      commands.push(makeLivingWorldCommand(
        'SETTLEMENT_STABILITY_CHANGED',
        `settlement.${settlement.id}`,
        'system',
        input.currentTick,
        submittedAt,
        {
          settlementId: settlement.id,
          tileId: settlement.tileId,
          stability,
          status,
          changedAtTick: input.currentTick,
          narration: `Settlement ${settlement.id} stability recalculated.`,
        }
      ))
      if (status === 'declining' && settlement.status !== 'declining') {
        commands.push(makeLivingWorldCommand(
          'SETTLEMENT_DECLINED',
          `settlement.${settlement.id}`,
          'system',
          input.currentTick,
          submittedAt,
          {
            settlementId: settlement.id,
            tileId: settlement.tileId,
            stability,
            declinedAtTick: input.currentTick,
            narration: `${settlement.id} 的穩定度跌破閾值，聚落陷入衰退。`,
          }
        ))
        // Famine evacuation — fire when food is completely exhausted (genuine famine, not just instability)
        if (populationNpcIds.length > 0) {
          const holderIds = settlementHolderIds(settlement)
          const heldFood = input.goodsInventory
            .filter((row) => row.holderType === 'settlement' && holderIds.has(row.holderId))
            .filter((row) => isFoodGoods(row.goodsId))
            .reduce((sum, row) => sum + row.quantity, 0)
          if (heldFood === 0) {
            commands.push(makeLivingWorldCommand(
              'SETTLEMENT_EVACUATION_STARTED',
              `settlement.${settlement.id}`,
              'system',
              input.currentTick,
              submittedAt,
              {
                settlementId: settlement.id,
                tileId: settlement.tileId,
                fleeingNpcIds: [...populationNpcIds],
                targetTileId: 't_central',
                evacuatedAtTick: input.currentTick,
                narration: `${settlement.id} 糧食耗盡，${populationNpcIds.length} 名居民開始逃往中央聚落。`,
              }
            ))
          }
        }
      }
    }
  }

  return commands
}

export function enforceAtomicSettlementStateCommands(input: {
  kept: readonly LivingWorldCommand[]
  rejected: readonly LivingWorldCommand[]
}): { kept: readonly LivingWorldCommand[]; rejected: readonly LivingWorldCommand[] } {
  const rejectedSettlementIds = new Set<string>()
  for (const command of input.rejected) {
    const settlementId = settlementStateCommandId(command)
    if (settlementId) rejectedSettlementIds.add(settlementId)
  }
  if (rejectedSettlementIds.size === 0) return input

  const kept: LivingWorldCommand[] = []
  const rejected = [...input.rejected]
  for (const command of input.kept) {
    const settlementId = settlementStateCommandId(command)
    if (settlementId && rejectedSettlementIds.has(settlementId)) {
      rejected.push(command)
    } else {
      kept.push(command)
    }
  }
  return { kept, rejected }
}

function populationForSettlement(
  settlement: SettlementRow,
  npcPresence: readonly SettlementNpcPresence[]
): readonly string[] {
  return [...new Set(npcPresence
    .filter((presence) => presence.tileId === settlement.tileId)
    .filter((presence) => presence.activity !== 'move' && presence.isTraveling !== true)
    .map((presence) => presence.npcId))]
    .sort()
}

function storageForSettlement(
  settlement: SettlementRow,
  goodsInventory: readonly GoodsInventoryRow[]
): readonly SettlementStorageItem[] {
  const holderIds = settlementHolderIds(settlement)
  return goodsInventory
    .filter((row) => row.holderType === 'settlement' && holderIds.has(row.holderId) && row.quantity > 0)
    .map((row) => ({ goodsId: row.goodsId, quantity: row.quantity }))
    .sort((a, b) => a.goodsId.localeCompare(b.goodsId))
}

function pressureForSettlement(
  settlement: SettlementRow,
  populationNpcIds: readonly string[],
  input: SettlementEngineInput
): SettlementPressure {
  if (populationNpcIds.length === 0) return { food: 0, safety: 0, economy: 0, logistics: 0 }

  const food = foodPressure(settlement, populationNpcIds.length, input)
  return {
    food,
    safety: safetyPressure(settlement, input),
    economy: economyPressure(settlement, populationNpcIds, input),
    logistics: logisticsPressure(settlement, food, input),
  }
}

function foodPressure(settlement: SettlementRow, population: number, input: SettlementEngineInput): number {
  const required = population * SETTLEMENT_FOOD_UNITS_PER_NPC
  const holderIds = settlementHolderIds(settlement)
  const heldFood = input.goodsInventory
    .filter((row) => row.holderType === 'settlement' && holderIds.has(row.holderId))
    .filter((row) => isFoodGoods(row.goodsId))
    .reduce((sum, row) => sum + row.quantity, 0)
  const shortagePressure = required > 0
    ? Math.round((1 - Math.min(heldFood, required) / required) * SETTLEMENT_FOOD_SHORTAGE_MAX_PRESSURE)
    : 0

  const fishery = input.fisheryDensity.find((row) => row.tileId === settlement.tileId)
  const fisheryPressure = fishery?.collapsed
    ? SETTLEMENT_FISHERY_COLLAPSE_PRESSURE
    : fishery
      ? Math.round((1 - clamp01(fishery.density / 100)) * SETTLEMENT_FISHERY_LOW_DENSITY_MAX_PRESSURE)
      : 0

  return clampPressure(shortagePressure + fisheryPressure + marketScarcityPressure(settlement, input))
}

function safetyPressure(settlement: SettlementRow, input: SettlementEngineInput): number {
  let pressure = 0
  for (const row of input.animalPopulation.filter((entry) => entry.tileId === settlement.tileId)) {
    const species = getSpecies(row.speciesId)
    if (!species) continue
    if (species.category !== 'predator' && species.category !== 'mythical') continue
    pressure += row.count * SETTLEMENT_SAFETY_PREDATOR_PRESSURE_PER_ANIMAL
    pressure += Math.round(species.aggression * SETTLEMENT_SAFETY_AGGRESSION_WEIGHT)
  }
  return clampPressure(pressure)
}

function economyPressure(
  settlement: SettlementRow,
  populationNpcIds: readonly string[],
  input: SettlementEngineInput
): number {
  const populationSet = new Set(populationNpcIds)
  const householdRows = input.householdEconomy.filter((row) =>
    row.contributorNpcIds.some((npcId) => populationSet.has(npcId))
  )
  const householdBalance = householdRows.reduce((sum, row) => sum + row.balance, 0)
  const householdTarget = populationNpcIds.length * SETTLEMENT_ECONOMY_HOUSEHOLD_TARGET_GOLD_PER_NPC
  const householdPressure = householdRows.length > 0 && householdTarget > 0
    ? Math.round((1 - clamp01(householdBalance / householdTarget)) * SETTLEMENT_ECONOMY_HOUSEHOLD_MAX_PRESSURE)
    : 0

  return clampPressure(householdPressure + marketScarcityPressure(settlement, input))
}

function logisticsPressure(settlement: SettlementRow, foodPressureValue: number, input: SettlementEngineInput): number {
  const holderIds = settlementHolderIds(settlement)
  const lostTransportCount = input.logistics.transports.filter((row) =>
    row.toHolderType === 'settlement' &&
    holderIds.has(row.toHolderId) &&
    row.status === 'lost' &&
    row.resolvedAtTick !== null &&
    input.currentTick - row.resolvedAtTick <= SETTLEMENT_LOGISTICS_RECENT_LOSS_WINDOW_TICKS
  ).length
  const closedInboundRouteCount = input.logistics.routes.filter((row) =>
    row.toTileId === settlement.tileId && !row.open
  ).length
  const hasOpenFoodRoute = input.logistics.routes.some((row) =>
    row.toTileId === settlement.tileId && row.open && isFoodGoods(row.goodsId)
  )
  const missingFoodRoutePressure = foodPressureValue > 0 && !hasOpenFoodRoute
    ? SETTLEMENT_LOGISTICS_MISSING_FOOD_ROUTE_PRESSURE
    : 0

  return clampPressure(
    lostTransportCount * SETTLEMENT_LOGISTICS_LOST_TRANSPORT_PRESSURE +
    closedInboundRouteCount * SETTLEMENT_LOGISTICS_CLOSED_ROUTE_PRESSURE +
    missingFoodRoutePressure
  )
}

function marketScarcityPressure(settlement: SettlementRow, input: SettlementEngineInput): number {
  let maxScarcity = 0
  const holderIds = settlementHolderIds(settlement)
  for (const row of input.marketPrices.filter((entry) => holderIds.has(entry.settlementId))) {
    if (!isFoodGoods(row.goodsId)) continue
    if (row.demandQuantity <= 0) continue
    maxScarcity = Math.max(maxScarcity, 1 - Math.min(row.supplyQuantity, row.demandQuantity) / row.demandQuantity)
  }
  return Math.round(clamp01(maxScarcity) * SETTLEMENT_MARKET_SCARCITY_MAX_PRESSURE)
}

function stabilityFromPressure(pressure: SettlementPressure): number {
  const weightedPressure =
    pressure.food * 0.35 +
    pressure.safety * 0.25 +
    pressure.economy * 0.2 +
    pressure.logistics * 0.2
  return clampPressure(100 - Math.round(weightedPressure))
}

function statusFromStability(stability: number, settlement: SettlementRow): SettlementStatus {
  if (stability < SETTLEMENT_STABILITY_DECLINING_BELOW) return 'declining'
  if (stability < SETTLEMENT_STABILITY_STRAINED_BELOW) {
    return settlement.status === 'declining' && stability > settlement.stability ? 'recovering' : 'strained'
  }
  return 'stable'
}

function isFoodGoods(goodsId: string): boolean {
  return (SETTLEMENT_FOOD_GOODS as readonly string[]).includes(goodsId)
}

function settlementHolderIds(settlement: SettlementRow): ReadonlySet<string> {
  return new Set([settlement.id, `settlement.${settlement.tileId}`])
}

const SETTLEMENT_STATE_COMMAND_TYPES = new Set<LivingWorldCommandType>([
  'SETTLEMENT_POPULATION_UPDATED',
  'SETTLEMENT_STORAGE_UPDATED',
  'SETTLEMENT_PRESSURE_UPDATED',
  'SETTLEMENT_STABILITY_CHANGED',
  'SETTLEMENT_DECLINED',
  'SETTLEMENT_RECOVERED',
])

function settlementStateCommandId(command: LivingWorldCommand): string | null {
  if (!SETTLEMENT_STATE_COMMAND_TYPES.has(command.commandType)) return null
  const payload = command.payload as { settlementId?: unknown }
  return typeof payload.settlementId === 'string' ? payload.settlementId : null
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function clampPressure(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function storageEqual(a: readonly SettlementStorageItem[], b: readonly SettlementStorageItem[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value.goodsId === b[index]?.goodsId && value.quantity === b[index]?.quantity)
}

function pressureEqual(a: SettlementPressure, b: SettlementPressure): boolean {
  return a.food === b.food &&
    a.safety === b.safety &&
    a.economy === b.economy &&
    a.logistics === b.logistics
}
