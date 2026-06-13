import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime settlement famine', () => {
  it('emits GOODS_CONSUMED from settlement storage at cadence and raises food pressure', { timeout: 45000 }, () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      // Pre-load fish into the central settlement holder before any ticks run.
      // t_central has 10 daily NPCs; after ~12 ticks they form a settlement there.
      // The consumption cadence fires at tick 720 (= TICKS_PER_HOUR).
      // After consumption empties storage, the settlement engine at tick 721 raises food pressure.
      const stored = runtime.submitLivingWorldCommand(
        makeLivingWorldCommand(
          'GOODS_STORED',
          'system',
          'system',
          0,
          Date.now(),
          {
            goodsId: 'fish',
            quantity: 20,
            holderType: 'settlement' as const,
            holderId: 'settlement.t_central',
            tileId: 't_central',
            storedAtTick: 0,
            narration: 'famine-test: pre-load fish for central settlement.',
          }
        )
      )
      expect(stored).not.toBeNull()

      for (let i = 0; i < 750; i++) {
        ;(runtime as unknown as Internal).runTick()
      }

      const events = eventStore.readEvents()

      // Cadence block must have fired at least once for settlement-held food
      const consumed = events.filter((e) => {
        const data = (e.payload as { data?: { holderType?: string } } | undefined)?.data
        return e.eventType === 'GOODS_CONSUMED' && data?.holderType === 'settlement'
      })
      expect(consumed.length).toBeGreaterThan(0)

      // After storage empties, the settlement engine must raise food pressure
      const withFoodPressure = events.filter((e) => {
        const data = (e.payload as { data?: { pressure?: { food?: number } } } | undefined)?.data
        return e.eventType === 'SETTLEMENT_PRESSURE_UPDATED' && (data?.pressure?.food ?? 0) > 0
      })
      expect(withFoodPressure.length).toBeGreaterThan(0)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})
