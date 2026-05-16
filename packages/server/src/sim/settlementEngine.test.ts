import { describe, expect, it } from 'vitest'
import { LivingWorldRuleEngine, type SettlementPressure } from '../kernel/livingWorldCommands.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import type { FisheryDensityRow } from '../projections/fisheryDensity.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'
import type { HouseholdEconomyRow } from '../projections/householdEconomy.js'
import type { LogisticsSnapshot } from '../projections/logistics.js'
import type { MarketPriceRow } from '../projections/marketPrices.js'
import type { SettlementRow } from '../projections/settlements.js'
import { planSettlementCommands, type SettlementEngineInput } from './settlementEngine.js'

describe('planSettlementCommands', () => {
  it('does not create pressure when a settlement has no authoritative population', () => {
    const commands = planSettlementCommands(input({
      fisheryDensity: [fishery({ collapsed: true, density: 0 })],
      npcPresence: [],
    }))

    expect(commands.some((command) => command.commandType === 'SETTLEMENT_PRESSURE_UPDATED')).toBe(false)
    expect(commands.some((command) => command.commandType === 'SETTLEMENT_STABILITY_CHANGED')).toBe(false)
  })

  it('raises food pressure when settlement-held food is below population need', () => {
    const commands = planSettlementCommands(input({
      npcPresence: presence('npc-a', 'npc-b', 'npc-c'),
      goodsInventory: [goods('fish', 1)],
    }))

    const pressure = pressureFrom(commands)
    expect(pressure.food).toBeGreaterThan(0)
    expect(pressure.food).toBeLessThanOrEqual(100)
    expect(commands.every((command) => new LivingWorldRuleEngine().evaluate(command).accepted)).toBe(true)
  })

  it('raises logistics pressure for recent storm transport loss', () => {
    const commands = planSettlementCommands(input({
      npcPresence: presence('npc-a', 'npc-b'),
      goodsInventory: [goods('fish', 4)],
      logistics: {
        routes: [],
        transports: [{
          transportId: 'transport-1',
          routeId: 'route-1',
          goodsId: 'fish',
          quantity: 2,
          carrierNpcId: 'npc-a',
          fromHolderType: 'npc',
          fromHolderId: 'npc-a',
          fromTileId: 't_dock',
          toHolderType: 'settlement',
          toHolderId: 'settlement.t_test',
          toTileId: 't_test',
          status: 'lost',
          startedAtTick: 9,
          resolvedAtTick: 10,
          lossReason: 'storm',
          lastSequence: 1,
        }],
      },
    }))

    expect(pressureFrom(commands).logistics).toBeGreaterThan(0)
  })

  it('raises food pressure when the local fishery has collapsed', () => {
    const commands = planSettlementCommands(input({
      npcPresence: presence('npc-a', 'npc-b'),
      goodsInventory: [goods('fish', 4)],
      fisheryDensity: [fishery({ collapsed: true, density: 0 })],
    }))

    expect(pressureFrom(commands).food).toBeGreaterThan(0)
  })

  it('clamps every pressure value to 0..100 under extreme inputs', () => {
    const commands = planSettlementCommands(input({
      npcPresence: presence('npc-a', 'npc-b', 'npc-c', 'npc-d'),
      animalPopulation: [{
        speciesId: 'white_marsh_leviathan',
        tileId: 't_test',
        biomeRegion: 'salt_marsh',
        count: 20,
        animalIds: Array.from({ length: 20 }, (_, i) => `leviathan-${i}`),
        lastSpawnedAtTick: 1,
        lastKilledAtTick: null,
        lastSequence: 1,
      }],
      marketPrices: [market('fish', 0, 100)],
      householdEconomy: [household(['npc-a', 'npc-b'], 0)],
      logistics: {
        routes: [{
          routeId: 'route-closed',
          fromTileId: 't_dock',
          toTileId: 't_test',
          goodsId: 'fish',
          open: false,
          openedAtTick: 1,
          closedAtTick: 2,
          lastSequence: 1,
        }],
        transports: Array.from({ length: 10 }, (_, i) => ({
          transportId: `transport-${i}`,
          routeId: 'route-closed',
          goodsId: 'fish',
          quantity: 1,
          carrierNpcId: 'npc-a',
          fromHolderType: 'npc' as const,
          fromHolderId: 'npc-a',
          fromTileId: 't_dock',
          toHolderType: 'settlement' as const,
          toHolderId: 'settlement.t_test',
          toTileId: 't_test',
          status: 'lost' as const,
          startedAtTick: 5,
          resolvedAtTick: 6,
          lossReason: 'storm',
          lastSequence: i,
        })),
      },
    }))

    const pressure = pressureFrom(commands)
    expect(Object.values(pressure).every((value) => value >= 0 && value <= 100)).toBe(true)
  })

  it('does not emit duplicate settlement state commands for rows already updated this tick', () => {
    const commands = planSettlementCommands(input({
      settlements: [settlement({ updatedAtTick: 20 })],
      currentTick: 20,
      npcPresence: presence('npc-a', 'npc-b'),
    }))

    expect(commands).toEqual([])
  })
})

function input(overrides: Partial<SettlementEngineInput>): SettlementEngineInput {
  return {
    settlements: [settlement()],
    npcPresence: [],
    goodsInventory: [],
    logistics: { routes: [], transports: [] },
    marketPrices: [],
    fisheryDensity: [],
    animalPopulation: [],
    householdEconomy: [],
    currentTick: 20,
    ...overrides,
  }
}

function settlement(overrides: Partial<SettlementRow> = {}): SettlementRow {
  return {
    id: 'settlement.t_test',
    tileId: 't_test',
    formedAtTick: 1,
    founderNpcIds: ['npc-a', 'npc-b', 'npc-c'],
    populationNpcIds: [],
    storage: [],
    pressure: { food: 0, safety: 0, economy: 0, logistics: 0 },
    stability: 100,
    status: 'stable',
    updatedAtTick: 1,
    ...overrides,
  }
}

function presence(...npcIds: string[]) {
  return npcIds.map((npcId) => ({ npcId, tileId: 't_test', activity: 'idle' }))
}

function goods(goodsId: string, quantity: number): GoodsInventoryRow {
  return {
    goodsId,
    holderType: 'settlement',
    holderId: 'settlement.t_test',
    tileId: 't_test',
    quantity,
    lastUpdatedTick: 1,
    lastSequence: 1,
  }
}

function fishery(overrides: Partial<FisheryDensityRow>): FisheryDensityRow {
  return {
    tileId: 't_test',
    density: 100,
    harvestedTotal: 0,
    collapsed: false,
    lastUpdatedTick: 1,
    lastSequence: 1,
    ...overrides,
  }
}

function market(goodsId: string, supplyQuantity: number, demandQuantity: number): MarketPriceRow {
  return {
    marketId: `market.${goodsId}`,
    settlementId: 'settlement.t_test',
    goodsId,
    supplyQuantity,
    demandQuantity,
    priceGold: 1,
    lastDiscoveredTick: 1,
    lastSequence: 1,
  }
}

function household(contributorNpcIds: readonly string[], balance: number): HouseholdEconomyRow {
  return {
    householdId: 'household-1',
    contributedTotal: balance,
    spentTotal: 0,
    inheritedTotal: 0,
    balance,
    contributorNpcIds,
    inheritances: [],
    lastUpdatedAtTick: 1,
    lastSequence: 1,
  }
}

function pressureFrom(commands: ReturnType<typeof planSettlementCommands>): SettlementPressure {
  const command = commands.find((entry) => entry.commandType === 'SETTLEMENT_PRESSURE_UPDATED')
  expect(command).toBeDefined()
  return (command?.payload as { pressure: SettlementPressure }).pressure
}
