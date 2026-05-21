import { describe, expect, it } from 'vitest'
import {
  planCarrierDispatches,
  planCarrierArrivals,
  CARRIER_HAUL_MIN,
  CARRIER_HAUL_MAX,
  CARRIER_TRAVEL_TICKS_PER_HOP,
} from './carrierPlanner.js'
import type { NpcProfile } from '../npcs/types.js'
import type { SettlementRow } from '../projections/settlements.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'
import type { GoodsTransportRow } from '../projections/logistics.js'
import type { SimNpcState } from './runtime.js'

// ── minimal stubs ────────────────────────────────────────────────────────────

function makeSettlementsStub(rows: SettlementRow[]) {
  return {
    getAll: () => rows,
    getByTile: (tileId: string) => rows.filter((r) => r.tileId === tileId),
  } as unknown as import('../projections/settlements.js').SettlementsProjection
}

function makeInventoryStub(rows: GoodsInventoryRow[]) {
  return { list: () => rows } as unknown as import('../projections/goodsInventory.js').GoodsInventoryProjection
}

function makeLogisticsStub(started: GoodsTransportRow[] = [], openRouteIds: string[] = []) {
  return {
    getStartedTransports: () => started,
    isRouteOpen: (routeId: string) => openRouteIds.includes(routeId),
  } as unknown as import('../projections/logistics.js').LogisticsProjection
}

const BASE_SETTLEMENT = (id: string, tileId: string): SettlementRow => ({
  id,
  tileId,
  formedAtTick: 0,
  founderNpcIds: [],
  populationNpcIds: [],
  storage: [],
  pressure: { food: 0, safety: 0, economy: 0, logistics: 0 },
  stability: 80,
  status: 'stable',
  updatedAtTick: 0,
})

const CARRIER_PROFILE: NpcProfile = {
  id: 'npc.anton',
  name: { zh: '安東', en: 'Anton' },
  role: { zh: '商人', en: 'Merchant' },
  defaultLocation: 't_dock',
  routine: [],
  triggers: [],
  memory: { consultsEventTypes: [], decayFn: 'linear', decayParam: 0.001 },
  personality: { patience: 0.7, greed: 0.4, trustBase: 50, traderRole: 'carrier' },
}

// planCarrierDispatches only reads id, activity, location from SimNpcState
const npcState = (overrides: { activity?: string; location?: string } = {}) =>
  ({
    id: 'npc.anton',
    location: overrides.location ?? 't_dock',
    activity: overrides.activity ?? 'idle',
  } as unknown as SimNpcState)

const DOCK_INVENTORY_ROW: GoodsInventoryRow = {
  goodsId: 'fish',
  holderType: 'settlement',
  holderId: 'settlement.t_dock',
  tileId: 't_dock',
  quantity: 10,
  lastUpdatedTick: 0,
  lastSequence: 1,
}

const CENTRAL_INVENTORY_ROW: GoodsInventoryRow = {
  goodsId: 'fish',
  holderType: 'settlement',
  holderId: 'settlement.t_central',
  tileId: 't_central',
  quantity: 2,
  lastUpdatedTick: 0,
  lastSequence: 2,
}

const CORE_TILES = ['t_desert', 't_forest', 't_mountain', 't_temple', 't_central', 't_dimai', 't_dock', 't_ruin']

const BASE_DISPATCH_INPUT = () => ({
  tick: 1000,
  submittedAt: 999,
  profiles: [CARRIER_PROFILE],
  npcStates: [npcState()],
  settlementsProjection: makeSettlementsStub([
    BASE_SETTLEMENT('dock_sett', 't_dock'),
    BASE_SETTLEMENT('central_sett', 't_central'),
  ]),
  goodsInventoryProjection: makeInventoryStub([DOCK_INVENTORY_ROW, CENTRAL_INVENTORY_ROW]),
  logisticsProjection: makeLogisticsStub(),
  stormActive: false,
  unlockedTileIds: CORE_TILES,
  plannedRouteIds: new Set<string>(),
  plannedTransportIds: new Set<string>(),
})

// ── planCarrierDispatches ────────────────────────────────────────────────────

describe('planCarrierDispatches', () => {
  it('emits TRADE_ROUTE_OPENED + GOODS_CONSUMED + GOODS_TRANSPORT_STARTED when idle carrier has surplus', () => {
    const cmds = planCarrierDispatches(BASE_DISPATCH_INPUT())
    const types = cmds.map((c) => c.commandType)
    expect(types).toContain('TRADE_ROUTE_OPENED')
    expect(types).toContain('GOODS_CONSUMED')
    expect(types).toContain('GOODS_TRANSPORT_STARTED')
  })

  it('skips TRADE_ROUTE_OPENED when route already open', () => {
    const openRoute = `route.t_dock.t_central.fish`
    const input = {
      ...BASE_DISPATCH_INPUT(),
      logisticsProjection: makeLogisticsStub([], [openRoute]),
    }
    const cmds = planCarrierDispatches(input)
    expect(cmds.map((c) => c.commandType)).not.toContain('TRADE_ROUTE_OPENED')
    expect(cmds.map((c) => c.commandType)).toContain('GOODS_CONSUMED')
  })

  it('skips carrier already in transit', () => {
    const inTransit: GoodsTransportRow = {
      transportId: 'transport.abc',
      routeId: 'route.t_dock.t_central.fish',
      goodsId: 'fish',
      quantity: 8,
      carrierNpcId: 'npc.anton',
      fromHolderType: 'settlement',
      fromHolderId: 'settlement.t_dock',
      fromTileId: 't_dock',
      toHolderType: 'settlement',
      toHolderId: 'settlement.t_central',
      toTileId: 't_central',
      status: 'started',
      startedAtTick: 900,
      resolvedAtTick: null,
      lossReason: null,
      lastSequence: 5,
    }
    const input = { ...BASE_DISPATCH_INPUT(), logisticsProjection: makeLogisticsStub([inTransit]) }
    expect(planCarrierDispatches(input)).toHaveLength(0)
  })

  it('skips NPC with move activity', () => {
    const input = { ...BASE_DISPATCH_INPUT(), npcStates: [npcState({ activity: 'move' })] }
    expect(planCarrierDispatches(input)).toHaveLength(0)
  })

  it('skips when surplus is below CARRIER_HAUL_MIN', () => {
    const lowInv: GoodsInventoryRow = { ...DOCK_INVENTORY_ROW, quantity: CARRIER_HAUL_MIN - 1 }
    const input = { ...BASE_DISPATCH_INPUT(), goodsInventoryProjection: makeInventoryStub([lowInv, CENTRAL_INVENTORY_ROW]) }
    expect(planCarrierDispatches(input)).toHaveLength(0)
  })

  it('does not dispatch non-carrier NPC', () => {
    const nonCarrier: NpcProfile = {
      ...CARRIER_PROFILE,
      id: 'npc.guard',
      personality: { patience: 0.5, greed: 0.2, trustBase: 30 },
    }
    const input = {
      ...BASE_DISPATCH_INPUT(),
      profiles: [nonCarrier],
      npcStates: [npcState()],
    }
    expect(planCarrierDispatches(input)).toHaveLength(0)
  })

  it('caps haul quantity at CARRIER_HAUL_MAX', () => {
    const bigInv: GoodsInventoryRow = { ...DOCK_INVENTORY_ROW, quantity: CARRIER_HAUL_MAX + 50 }
    const input = { ...BASE_DISPATCH_INPUT(), goodsInventoryProjection: makeInventoryStub([bigInv, CENTRAL_INVENTORY_ROW]) }
    const cmds = planCarrierDispatches(input)
    const started = cmds.find((c) => c.commandType === 'GOODS_TRANSPORT_STARTED')
    expect((started?.payload as { quantity: number }).quantity).toBe(CARRIER_HAUL_MAX)
  })
})

// ── planCarrierArrivals ──────────────────────────────────────────────────────

function makeTransport(overrides: Partial<GoodsTransportRow> = {}): GoodsTransportRow {
  return {
    transportId: 'transport.xyz',
    routeId: 'route.t_dock.t_central.fish',
    goodsId: 'fish',
    quantity: 8,
    carrierNpcId: 'npc.anton',
    fromHolderType: 'settlement',
    fromHolderId: 'settlement.t_dock',
    fromTileId: 't_dock',
    toHolderType: 'settlement',
    toHolderId: 'settlement.t_central',
    toTileId: 't_central',
    status: 'started',
    startedAtTick: 1000,
    resolvedAtTick: null,
    lossReason: null,
    lastSequence: 10,
    ...overrides,
  }
}

describe('planCarrierArrivals', () => {
  // t_dock → t_central: 1 hop, arrivalTick = 1000 + CARRIER_TRAVEL_TICKS_PER_HOP
  const arrivalTick = 1000 + CARRIER_TRAVEL_TICKS_PER_HOP

  it('emits GOODS_TRANSPORT_ARRIVED + GOODS_STORED at arrival tick', () => {
    const cmds = planCarrierArrivals({
      tick: arrivalTick,
      submittedAt: arrivalTick - 1,
      startedTransports: [makeTransport()],
      stormActive: false,
      unlockedTileIds: CORE_TILES,
      plannedTransportResolutions: new Set(),
    })
    const types = cmds.map((c) => c.commandType)
    expect(types).toContain('GOODS_TRANSPORT_ARRIVED')
    expect(types).toContain('GOODS_STORED')
  })

  it('emits nothing before arrival tick', () => {
    const cmds = planCarrierArrivals({
      tick: arrivalTick - 1,
      submittedAt: arrivalTick - 2,
      startedTransports: [makeTransport()],
      stormActive: false,
      unlockedTileIds: CORE_TILES,
      plannedTransportResolutions: new Set(),
    })
    expect(cmds).toHaveLength(0)
  })

  it('emits GOODS_TRANSPORT_LOST on storm at arrival tick', () => {
    const cmds = planCarrierArrivals({
      tick: arrivalTick,
      submittedAt: arrivalTick - 1,
      startedTransports: [makeTransport()],
      stormActive: true,
      unlockedTileIds: CORE_TILES,
      plannedTransportResolutions: new Set(),
    })
    const types = cmds.map((c) => c.commandType)
    expect(types).toContain('GOODS_TRANSPORT_LOST')
    expect(types).not.toContain('GOODS_TRANSPORT_ARRIVED')
  })

  it('skips already-resolved transport ids', () => {
    const resolved = new Set(['transport.xyz'])
    const cmds = planCarrierArrivals({
      tick: arrivalTick,
      submittedAt: arrivalTick - 1,
      startedTransports: [makeTransport()],
      stormActive: false,
      unlockedTileIds: CORE_TILES,
      plannedTransportResolutions: resolved,
    })
    expect(cmds).toHaveLength(0)
  })
})
