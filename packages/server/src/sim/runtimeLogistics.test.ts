import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { rebuildActiveEvent } from '../events/engine.js'
import type { ActiveWorldEvent } from '../events/types.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import type { GoodsHolderType, LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { LivingWorldRuleEngine } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type LogisticsPlanner = {
  planGoodsLogisticsCommands: (input: {
    goodsId: string
    quantity: number
    sourceHolderType: GoodsHolderType
    sourceHolderId: string
    sourceTileId: string
    carrierNpcId: string
    tick: number
    submittedAt: number
    activeEvents: readonly ActiveWorldEvent[]
    plannedRouteIds: Set<string>
  }) => LivingWorldCommand[]
}

describe('SimulationRuntime goods logistics planning', () => {
  it('plans route, loading, arrival, and central settlement storage', () => {
    const { db, runtime } = createRuntime()
    try {
      const commands = plan(runtime, [])

      expect(commands.map((command) => command.commandType)).toEqual([
        'TRADE_ROUTE_OPENED',
        'GOODS_CONSUMED',
        'GOODS_TRANSPORT_STARTED',
        'GOODS_TRANSPORT_ARRIVED',
        'GOODS_STORED',
      ])
      expect(commands.every((command) => new LivingWorldRuleEngine().evaluate(command).accepted)).toBe(true)

      const centralStore = commands.find((command) => command.commandType === 'GOODS_STORED')
      expect(centralStore?.payload).toMatchObject({
        goodsId: 'fish',
        quantity: 12,
        holderType: 'settlement',
        holderId: 'settlement.t_central',
        tileId: 't_central',
      })
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('plans storm loss instead of arrival and destination storage', () => {
    const { db, runtime } = createRuntime()
    try {
      const storm = rebuildActiveEvent('weather.storm', 1, { weather: '驟雨', season: '雨之月' })
      expect(storm).not.toBeNull()

      const commands = plan(runtime, storm ? [storm] : [])

      expect(commands.map((command) => command.commandType)).toEqual([
        'TRADE_ROUTE_OPENED',
        'GOODS_CONSUMED',
        'GOODS_TRANSPORT_STARTED',
        'GOODS_TRANSPORT_LOST',
      ])
      expect(commands.every((command) => new LivingWorldRuleEngine().evaluate(command).accepted)).toBe(true)
      expect(commands.some((command) => command.commandType === 'GOODS_TRANSPORT_ARRIVED')).toBe(false)
      expect(commands.some((command) => command.commandType === 'GOODS_STORED')).toBe(false)
      expect(commands.find((command) => command.commandType === 'GOODS_TRANSPORT_LOST')?.payload).toMatchObject({ reason: 'storm' })
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

function createRuntime(): { db: Database.Database; runtime: SimulationRuntime } {
  const db = new Database(':memory:')
  const eventStore = new SqliteEventStore(db)
  return { db, runtime: new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog()) }
}

function plan(runtime: SimulationRuntime, activeEvents: readonly ActiveWorldEvent[]): LivingWorldCommand[] {
  return (runtime as unknown as LogisticsPlanner).planGoodsLogisticsCommands({
    goodsId: 'fish',
    quantity: 12,
    sourceHolderType: 'npc',
    sourceHolderId: 'dock.fishmonger.adi',
    sourceTileId: 't_dock',
    carrierNpcId: 'dock.fishmonger.adi',
    tick: 10,
    submittedAt: 10,
    activeEvents,
    plannedRouteIds: new Set(),
  })
}
