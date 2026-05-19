import { describe, expect, it } from 'vitest'
import { LegendaryHuntTracker } from './legendaryHuntPlanner.js'
import { LEGENDARY_HUNT_MIN_HUNTERS, LEGENDARY_HUNT_THRESHOLD_TICKS } from '../config/world.js'
import type { WorldEventRow } from '../projections/worldEvent.js'

function makeEvent(linkedAnimalId: string, tileId = 't_marsh', huntStartedEmitted = false): WorldEventRow {
  return {
    worldEventId: `we-${linkedAnimalId}`,
    eventKind: 'legendary_creature',
    tileId,
    linkedAnimalId,
    speciesId: 'white_marsh_leviathan',
    severity: 30,
    spawnedAtTick: 0,
    huntStartedEmitted,
  }
}

function makeHunter(npcId: string, tileId = 't_marsh') {
  return { npcId, tileId, role: 'hunter' }
}

describe('LegendaryHuntTracker', () => {
  it('emits nothing when fewer than MIN_HUNTERS on tile', () => {
    const tracker = new LegendaryHuntTracker()
    const hunters = Array.from({ length: LEGENDARY_HUNT_MIN_HUNTERS - 1 }, (_, i) => makeHunter(`npc${i}`))
    const result = tracker.planHuntEvents(100, [makeEvent('animal-1')], hunters, [])
    expect(result).toHaveLength(0)
  })

  it('does not emit HUNT_STARTED until threshold ticks have elapsed', () => {
    const tracker = new LegendaryHuntTracker()
    const hunters = Array.from({ length: LEGENDARY_HUNT_MIN_HUNTERS }, (_, i) => makeHunter(`npc${i}`))

    // First tick — accumulator starts
    const r1 = tracker.planHuntEvents(100, [makeEvent('animal-1')], hunters, [])
    expect(r1.find((x) => x.type === 'LEGENDARY_HUNT_STARTED')).toBeUndefined()

    // One tick before threshold — still nothing
    const r2 = tracker.planHuntEvents(100 + LEGENDARY_HUNT_THRESHOLD_TICKS - 1, [makeEvent('animal-1')], hunters, [])
    expect(r2.find((x) => x.type === 'LEGENDARY_HUNT_STARTED')).toBeUndefined()
  })

  it('emits LEGENDARY_HUNT_STARTED after threshold ticks of sustained clustering', () => {
    const tracker = new LegendaryHuntTracker()
    const hunters = Array.from({ length: LEGENDARY_HUNT_MIN_HUNTERS }, (_, i) => makeHunter(`npc${i}`))

    tracker.planHuntEvents(100, [makeEvent('animal-1')], hunters, [])
    const result = tracker.planHuntEvents(100 + LEGENDARY_HUNT_THRESHOLD_TICKS, [makeEvent('animal-1')], hunters, [])
    const started = result.find((x) => x.type === 'LEGENDARY_HUNT_STARTED')
    expect(started).toBeDefined()
    expect(started?.linkedAnimalId).toBe('animal-1')
  })

  it('does not re-emit HUNT_STARTED when huntStartedEmitted=true', () => {
    const tracker = new LegendaryHuntTracker()
    const hunters = Array.from({ length: LEGENDARY_HUNT_MIN_HUNTERS }, (_, i) => makeHunter(`npc${i}`))
    const alreadyStarted = makeEvent('animal-1', 't_marsh', true)

    tracker.planHuntEvents(100, [alreadyStarted], hunters, [])
    const result = tracker.planHuntEvents(100 + LEGENDARY_HUNT_THRESHOLD_TICKS * 2, [alreadyStarted], hunters, [])
    expect(result.find((x) => x.type === 'LEGENDARY_HUNT_STARTED')).toBeUndefined()
  })

  it('emits LEGENDARY_HUNT_CONCLUDED for resolved events', () => {
    const tracker = new LegendaryHuntTracker()
    const result = tracker.planHuntEvents(
      500,
      [],
      [],
      [{ linkedAnimalId: 'animal-1', outcome: 'killed' }],
    )
    const concluded = result.find((x) => x.type === 'LEGENDARY_HUNT_CONCLUDED')
    expect(concluded).toBeDefined()
    expect(concluded?.outcome).toBe('killed')
    expect(concluded?.concludedAtTick).toBe(500)
  })

  it('resets accumulator when hunters drop below threshold', () => {
    const tracker = new LegendaryHuntTracker()
    const hunters = Array.from({ length: LEGENDARY_HUNT_MIN_HUNTERS }, (_, i) => makeHunter(`npc${i}`))

    tracker.planHuntEvents(100, [makeEvent('animal-1')], hunters, [])
    // Hunters leave
    tracker.planHuntEvents(110, [makeEvent('animal-1')], [], [])
    // Hunters return — counter reset, so threshold must elapse again
    tracker.planHuntEvents(120, [makeEvent('animal-1')], hunters, [])
    const result = tracker.planHuntEvents(120 + LEGENDARY_HUNT_THRESHOLD_TICKS - 1, [makeEvent('animal-1')], hunters, [])
    expect(result.find((x) => x.type === 'LEGENDARY_HUNT_STARTED')).toBeUndefined()
  })
})
