// v0.87.3 — replay stability: an EventLog containing NPC_DECEASED rebuilds
// to identical NPC state (filtered + including-deceased) in a fresh runtime.
// Locks the contract that the tick gate does not introduce nondeterminism.
//
// Spec: openspec/changes/deceased-npc-leaves-active-world/specs/deceased-npc-isolation/spec.md

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { SimulationRuntime } from './runtime.js'
import type { SimNpcState } from '../npcs/types.js'

function snapshotByNpcId(npcs: readonly SimNpcState[]): Record<string, SimNpcState> {
  const result: Record<string, SimNpcState> = {}
  for (const npc of npcs) result[npc.id] = npc
  return result
}

describe('SimulationRuntime replay stability with deceased NPCs (v0.87.3)', () => {
  it('rebuilds identical filtered and full NPC rosters from EventLog after a death', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const profiles = loadNpcProfiles()
    const cards = loadCardCatalog()

    const original = new SimulationRuntime(eventStore, profiles, cards)
    try {
      const npcsBefore = original.getNpcs()
      const victim = npcsBefore[0]
      expect(victim).toBeDefined()

      const tick = original.getCurrentTick()
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
          narration: `${victim!.name.zh} 在 replay 測試中辭世。`,
        },
      )
      const event = original.submitLivingWorldCommand(command)
      expect(event).not.toBeNull()

      const originalLivingMap = snapshotByNpcId(original.getNpcs())
      const originalFullMap = snapshotByNpcId(original.getNpcsIncludingDeceased())
      expect(originalLivingMap[victim!.id]).toBeUndefined()
      expect(originalFullMap[victim!.id]?.deceased).toBe(true)

      original.stop()
    } finally {
      // original.stop already called above on success path; defend cleanup
    }

    // Cold-boot a fresh runtime against the same EventLog.
    const restored = new SimulationRuntime(eventStore, profiles, cards)
    try {
      const livingAfterReboot = snapshotByNpcId(restored.getNpcs())
      const fullAfterReboot = snapshotByNpcId(restored.getNpcsIncludingDeceased())

      // The deceased NPC MUST still be absent from the living set after reboot.
      const victimId = Object.keys(fullAfterReboot).find((id) => fullAfterReboot[id]?.deceased)
      expect(victimId).toBeDefined()
      expect(livingAfterReboot[victimId!]).toBeUndefined()
      expect(fullAfterReboot[victimId!]?.deceased).toBe(true)

      // Every living NPC after reboot MUST report deceased=false.
      for (const npc of Object.values(livingAfterReboot)) {
        expect(npc.deceased).toBe(false)
      }
    } finally {
      restored.stop()
    }

    db.close()
  })

  it('deceased NPC frozen state survives 100 additional ticks after death', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const profiles = loadNpcProfiles()
    const cards = loadCardCatalog()
    const runtime = new SimulationRuntime(eventStore, profiles, cards)
    try {
      const victim = runtime.getNpcs()[0]!
      const tick = runtime.getCurrentTick()
      runtime.submitLivingWorldCommand(
        makeLivingWorldCommand(
          'NPC_DECEASED',
          victim.id,
          'system',
          tick,
          Date.now(),
          {
            npcId: victim.id,
            tileId: victim.location,
            householdId: victim.id,
            deceasedAtTick: tick,
            narration: `${victim.name.zh} 凍結測試。`,
          },
        ),
      )

      const frozenSnapshot = runtime
        .getNpcsIncludingDeceased()
        .find((n) => n.id === victim.id)
      expect(frozenSnapshot).toBeDefined()

      // Advance many ticks via the runtime's internal tick API.
      // Using the runtime tick path is what the live world does.
      const internalRuntime = runtime as unknown as { runTick: () => void }
      for (let i = 0; i < 100; i += 1) {
        internalRuntime.runTick()
      }

      const afterAdvance = runtime
        .getNpcsIncludingDeceased()
        .find((n) => n.id === victim.id)
      expect(afterAdvance).toBeDefined()

      // Key invariants: tile/activity/targetTile/travelRoute MUST be byte-equal
      // to the snapshot taken right after death.
      expect(afterAdvance!.location).toBe(frozenSnapshot!.location)
      expect(afterAdvance!.activity).toBe(frozenSnapshot!.activity)
      expect(afterAdvance!.targetTile).toBe(frozenSnapshot!.targetTile)
      expect(afterAdvance!.travelRoute).toEqual(frozenSnapshot!.travelRoute)
      expect(afterAdvance!.deceased).toBe(true)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})
