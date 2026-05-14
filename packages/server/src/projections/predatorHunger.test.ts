import { describe, expect, it } from 'vitest'
import { PredatorHungerProjection } from './predatorHunger.js'
import type { Event } from '../kernel/types.js'

describe('PredatorHungerProjection', () => {
  it('sets lastKillAtTick on ANIMAL_KILLED with ecosystem predator actor', () => {
    const proj = new PredatorHungerProjection()
    proj.project(animalKilled('fog_wolf', 'deer-a', 'forest_deer', 't_forest', 42))

    const rows = proj.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      predatorSpeciesId: 'fog_wolf',
      tileId: 't_forest',
      lastKillAtTick: 42,
    })
  })

  it('updates lastKillAtTick on subsequent kill by same species on same tile', () => {
    const proj = new PredatorHungerProjection()
    proj.project(animalKilled('fog_wolf', 'deer-a', 'forest_deer', 't_forest', 42))
    proj.project(animalKilled('fog_wolf', 'deer-b', 'forest_deer', 't_forest', 54))

    const rows = proj.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.lastKillAtTick).toBe(54)
  })

  it('tracks different predator species separately', () => {
    const proj = new PredatorHungerProjection()
    proj.project(animalKilled('fog_wolf', 'deer-a', 'forest_deer', 't_forest', 42))
    proj.project(animalKilled('mountain_bear', 'goat-a', 'cliff_goat', 't_mountain', 50))

    const rows = proj.list()
    expect(rows).toHaveLength(2)
  })

  it('does not update on non-ANIMAL_KILLED events', () => {
    const proj = new PredatorHungerProjection()
    proj.project(otherEvent('ANIMAL_SPAWNED', 100))
    proj.project(otherEvent('ANIMAL_STARVED', 100))
    proj.project(otherEvent('ANIMAL_MIGRATED', 100))

    expect(proj.list()).toHaveLength(0)
  })

  it('getLastKillAtTick returns null for unknown key', () => {
    const proj = new PredatorHungerProjection()
    expect(proj.getLastKillAtTick('fog_wolf', 't_forest')).toBeNull()
  })

  it('getLastKillAtTick returns tick after kill', () => {
    const proj = new PredatorHungerProjection()
    proj.project(animalKilled('fog_wolf', 'deer-a', 'forest_deer', 't_forest', 72))
    expect(proj.getLastKillAtTick('fog_wolf', 't_forest')).toBe(72)
  })

  it('ignores ANIMAL_KILLED with non-ecosystem actor (NPC hunter)', () => {
    const proj = new PredatorHungerProjection()
    proj.project(npcKilled('npc-hunter-1', 'deer-a', 'forest_deer', 't_forest', 42))

    expect(proj.list()).toHaveLength(0)
  })

  it('rebuild from events yields same result as incremental projection', () => {
    const events: Event[] = [
      animalKilled('fog_wolf', 'deer-a', 'forest_deer', 't_forest', 42),
      animalKilled('fog_wolf', 'deer-b', 'forest_deer', 't_forest', 54),
    ]

    const incremental = new PredatorHungerProjection()
    for (const ev of events) incremental.project(ev)

    const rebuilt = new PredatorHungerProjection()
    rebuilt.rebuildFromEvents(events)

    expect(incremental.canonicalHash()).toBe(rebuilt.canonicalHash())
    expect(incremental.list()).toEqual(rebuilt.list())
  })

  it('canonicalHash is stable for empty projection', () => {
    const a = new PredatorHungerProjection()
    const b = new PredatorHungerProjection()
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

// ---- helpers ----

let seq = 0
function nextSeq() { return ++seq }

function animalKilled(
  predatorSpeciesId: string,
  preyAnimalId: string,
  preySpeciesId: string,
  tileId: string,
  killedAtTick: number,
): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-killed-${s}`,
    eventType: 'ANIMAL_KILLED',
    actorId: `ecosystem.predator.${predatorSpeciesId}`,
    occurredAt: 0,
    tick: killedAtTick,
    payload: {
      actorType: 'system',
      data: {
        huntId: `hunt-${s}`,
        animalId: preyAnimalId,
        speciesId: preySpeciesId,
        tileId,
        killedByNpcId: `ecosystem.predator.${predatorSpeciesId}`,
        killedAtTick,
        narration: null,
      },
      narration: null,
    },
    deterministicKey: `key-killed-${s}`,
    version: 1,
  }
}

function npcKilled(
  npcId: string,
  preyAnimalId: string,
  preySpeciesId: string,
  tileId: string,
  killedAtTick: number,
): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-npc-killed-${s}`,
    eventType: 'ANIMAL_KILLED',
    actorId: npcId,
    occurredAt: 0,
    tick: killedAtTick,
    payload: {
      actorType: 'npc',
      data: {
        huntId: `hunt-${s}`,
        animalId: preyAnimalId,
        speciesId: preySpeciesId,
        tileId,
        killedByNpcId: npcId,
        killedAtTick,
        narration: null,
      },
      narration: null,
    },
    deterministicKey: `key-npc-killed-${s}`,
    version: 1,
  }
}

function otherEvent(eventType: string, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-other-${s}`,
    eventType,
    actorId: 'system',
    occurredAt: 0,
    tick,
    payload: { actorType: 'system', data: {}, narration: null },
    deterministicKey: `key-other-${s}`,
    version: 1,
  }
}
