import { LEGENDARY_HUNT_MIN_HUNTERS, LEGENDARY_HUNT_THRESHOLD_TICKS } from '../config/world.js'
import type { WorldEventRow } from '../projections/worldEvent.js'

export type LegendaryHuntIntent =
  | Readonly<{ type: 'LEGENDARY_HUNT_STARTED'; worldEventId: string; linkedAnimalId: string; tileId: string; hunterNpcIds: readonly string[]; startedAtTick: number }>
  | Readonly<{ type: 'LEGENDARY_HUNT_CONCLUDED'; worldEventId: string; linkedAnimalId: string; tileId: string; concludedAtTick: number; outcome: 'killed' | 'migrated' | 'starved' }>

export type NpcHunterInfo = Readonly<{ npcId: string; tileId: string; role: string }>

// In-memory tracker: maps linkedAnimalId → tick when ≥MIN_HUNTERS first accumulated
type HuntAccumulator = Map<string, number>

export class LegendaryHuntTracker {
  private accumulator: HuntAccumulator = new Map()

  /** Reset accumulator for events no longer active */
  syncToActiveEvents(activeEventIds: ReadonlySet<string>): void {
    for (const key of this.accumulator.keys()) {
      if (!activeEventIds.has(key)) this.accumulator.delete(key)
    }
  }

  planHuntEvents(
    tick: number,
    activeEvents: readonly WorldEventRow[],
    npcs: readonly NpcHunterInfo[],
    resolvedEvents: readonly Readonly<{ linkedAnimalId: string; outcome: 'killed' | 'migrated' | 'starved' }>[],
  ): readonly LegendaryHuntIntent[] {
    const intents: LegendaryHuntIntent[] = []

    // Handle resolved events first — emit CONCLUDED for hunts that were started
    for (const resolved of resolvedEvents) {
      // WorldEventProjection already removed the row — we need to check the passed-in active events
      // (caller handles this by passing resolvedEvents separately)
      intents.push({
        type: 'LEGENDARY_HUNT_CONCLUDED',
        worldEventId: `world-event-${resolved.linkedAnimalId}`,
        linkedAnimalId: resolved.linkedAnimalId,
        tileId: '',
        concludedAtTick: tick,
        outcome: resolved.outcome,
      })
      this.accumulator.delete(resolved.linkedAnimalId)
    }

    // Check for hunt started
    for (const event of activeEvents) {
      if (event.huntStartedEmitted) continue

      const huntersOnTile = npcs.filter(
        (npc) => npc.tileId === event.tileId && npc.role.toLowerCase().includes('hunter')
      )

      if (huntersOnTile.length >= LEGENDARY_HUNT_MIN_HUNTERS) {
        const existing = this.accumulator.get(event.linkedAnimalId)
        if (existing === undefined) {
          this.accumulator.set(event.linkedAnimalId, tick)
        } else if (tick - existing >= LEGENDARY_HUNT_THRESHOLD_TICKS) {
          intents.push({
            type: 'LEGENDARY_HUNT_STARTED',
            worldEventId: event.worldEventId,
            linkedAnimalId: event.linkedAnimalId,
            tileId: event.tileId,
            hunterNpcIds: huntersOnTile.map((n) => n.npcId),
            startedAtTick: tick,
          })
        }
      } else {
        // Reset accumulator if hunters drop below threshold
        this.accumulator.delete(event.linkedAnimalId)
      }
    }

    return intents
  }
}
