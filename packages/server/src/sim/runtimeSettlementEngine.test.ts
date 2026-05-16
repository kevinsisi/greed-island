import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime settlement engine wiring', () => {
  it('commits settlement planner commands through the Rule Engine and replays deterministically', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const formed = runtime.submitLivingWorldCommand(makeLivingWorldCommand(
        'SETTLEMENT_FORMED',
        'system',
        'system',
        0,
        0,
        {
          settlementId: 'settlement.t_central',
          tileId: 't_central',
          formedAtTick: 0,
          founderNpcIds: ['central.grocer.lin_fei_yan', 'central.guildclerk.su_fang', 'central.paperboy.a_jun'],
          narration: '中央區形成聚落。',
        }
      ))
      expect(formed?.eventType).toBe('SETTLEMENT_FORMED')

      ;(runtime as unknown as Internal).runTick()

      const settlementEvents = eventStore.readEvents().filter((event) => event.eventType.startsWith('SETTLEMENT_'))
      expect(settlementEvents.some((event) => event.eventType === 'SETTLEMENT_POPULATION_UPDATED')).toBe(true)
      expect(settlementEvents.some((event) => event.eventType === 'SETTLEMENT_PRESSURE_UPDATED')).toBe(true)
      expect(settlementEvents.some((event) => event.eventType === 'SETTLEMENT_STABILITY_CHANGED')).toBe(true)

      const row = runtime.getSettlementById('settlement.t_central')
      expect(row?.updatedAtTick).toBe(1)
      expect(row?.populationNpcIds.length).toBeGreaterThan(0)
      expect(row?.pressure.food).toBeGreaterThan(0)

      runtime.stop()
      const restored = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
      try {
        expect(restored.getSettlements()).toEqual(runtime.getSettlements())
      } finally {
        restored.stop()
      }
    } finally {
      runtime.stop()
      db.close()
    }
  })
})
