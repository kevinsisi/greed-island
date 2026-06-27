import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime HTTP hot snapshots', () => {
  it('does not scan NPC relationship rows while building the public NPC list', () => {
    const db = new Database(':memory:')
    const runtime = new SimulationRuntime(new SqliteEventStore(db), loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as { npcRelationships: unknown }).npcRelationships = {
        listFor: () => {
          throw new Error('public /api/npcs must not synchronously scan npc_relationships per NPC')
        },
        readDirectional: () => null,
      }

      expect(runtime.getNpcs().length).toBeGreaterThan(0)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('reuses same-tick world and NPC snapshots for repeated polling reads', () => {
    const db = new Database(':memory:')
    const runtime = new SimulationRuntime(new SqliteEventStore(db), loadNpcProfiles(), loadCardCatalog())
    try {
      const worldA = runtime.getSnapshot()
      const worldB = runtime.getSnapshot()
      const npcsA = runtime.getNpcs()
      const npcsB = runtime.getNpcs()

      expect(worldB).toBe(worldA)
      expect(npcsB).toBe(npcsA)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})
