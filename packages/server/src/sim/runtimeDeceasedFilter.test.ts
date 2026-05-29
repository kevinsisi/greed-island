// Verifies the v0.87.3 deceased-npc-leaves-active-world contract:
//   - runtime.getNpcs() filters out deceased NPCs by default
//   - runtime.getNpcsIncludingDeceased() retains them with deceased: true
//
// Spec: openspec/changes/deceased-npc-leaves-active-world/specs/deceased-npc-isolation/spec.md

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime deceased NPC filtering', () => {
  it('getNpcs() excludes deceased NPCs while getNpcsIncludingDeceased() retains them', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const beforeLiving = runtime.getNpcs()
      const beforeFull = runtime.getNpcsIncludingDeceased()
      expect(beforeLiving.length).toBe(beforeFull.length)
      expect(beforeLiving.every((n) => !n.deceased)).toBe(true)

      const victim = beforeLiving[0]
      expect(victim).toBeDefined()
      const tick = runtime.getCurrentTick()
      const command = makeLivingWorldCommand(
        'NPC_DECEASED',
        victim!.id,
        'system',
        tick,
        Date.now(),
        {
          npcId: victim!.id,
          tileId: victim!.location,
          householdId: victim!.id,
          deceasedAtTick: tick,
          narration: `${victim!.name.zh} 在測試中辭世。`,
        },
      )
      const event = runtime.submitLivingWorldCommand(command)
      expect(event).not.toBeNull()

      const afterLiving = runtime.getNpcs()
      const afterFull = runtime.getNpcsIncludingDeceased()

      expect(afterLiving.find((n) => n.id === victim!.id)).toBeUndefined()
      expect(afterLiving.length).toBe(beforeLiving.length - 1)

      const deceasedEntry = afterFull.find((n) => n.id === victim!.id)
      expect(deceasedEntry).toBeDefined()
      expect(deceasedEntry!.deceased).toBe(true)
      expect(afterFull.length).toBe(beforeFull.length)
    } finally {
      db.close()
    }
  })

  it('getNpcs() never returns entries with deceased: true', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const npcs = runtime.getNpcs()
      for (const npc of npcs) {
        expect(npc.deceased).toBe(false)
      }
    } finally {
      db.close()
    }
  })
})
