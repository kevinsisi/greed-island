import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime buy-goods economy loop', () => {
  it('spends household gold when an accepted buy_goods action is committed', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const [npc, partner] = runtime.getNpcs()
      expect(npc).toBeDefined()
      expect(partner).toBeDefined()
      const tick = runtime.getCurrentTick()
      runtime.submitLivingWorldCommand(makeLivingWorldCommand('NPC_HOUSEHOLD_FORMED', 'household.test.buy', 'system', tick, tick, {
        householdId: 'household.test.buy',
        partnerNpcIds: [npc!.id, partner!.id],
        homeTileId: npc!.location,
        narration: 'test household',
      }))
      runtime.submitLivingWorldCommand(makeLivingWorldCommand('HOUSEHOLD_GOLD_CONTRIBUTED', npc!.id, 'npc', tick + 1, tick + 1, {
        householdId: 'household.test.buy',
        npcId: npc!.id,
        amount: 30,
        sourceEventType: 'test',
        sourceId: 'seed-gold',
        tileId: npc!.location,
        contributedAtTick: tick + 1,
        narration: 'seed gold',
      }))

      runtime.submitLivingWorldCommand(makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', npc!.id, 'npc', tick + 2, tick + 2, {
        npcId: npc!.id,
        tile: npc!.location,
        proposal: { action: 'buy_goods', target: { tileId: npc!.location, npcId: null, cardId: null }, reason: 'test', risk: 'low', expectedOutcome: 'supplies', utterance: null },
        resolved: { kind: 'buy_goods', targetTile: npc!.location, targetNpcId: null, cardId: null, summary: 'buy supplies' },
        accepted: true,
        rejectionReason: null,
        decidedAtTick: tick + 2,
        narration: 'buy supplies',
      }))

      const economy = runtime.getHouseholdEconomy().find((row) => row.householdId === 'household.test.buy')
      expect(economy?.spentTotal).toBeGreaterThan(0)
      expect(economy?.balance).toBeLessThan(30)
      expect(eventStore.readEvents().some((event) => event.eventType === 'HOUSEHOLD_GOLD_SPENT')).toBe(true)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})
