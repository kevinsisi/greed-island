import { describe, expect, it } from 'vitest'
import { ForestDepletionProjection } from './forestDepletionProjection.js'
import type { Event } from '../kernel/types.js'

function makeEvent(eventType: string, tileId: string, tick = 100): Event {
  return {
    sequence: tick,
    eventType,
    commandId: 'cmd-1',
    submittedAt: new Date().toISOString(),
    tick,
    payload: {
      actorType: 'system',
      actorId: 'world',
      data: { tileId, pressureLevel: 60, depletedAtTick: tick, narration: '' },
      narration: null,
    },
  } as unknown as Event
}

describe('ForestDepletionProjection', () => {
  it('marks tile depleted on FOREST_DEPLETED event', () => {
    const proj = new ForestDepletionProjection()
    proj.project(makeEvent('FOREST_DEPLETED', 't_forest'))
    expect(proj.isForestDepleted('t_forest')).toBe(true)
  })

  it('clears tile on FOREST_RECOVERED event', () => {
    const proj = new ForestDepletionProjection()
    proj.project(makeEvent('FOREST_DEPLETED', 't_forest', 100))
    proj.project(makeEvent('FOREST_RECOVERED', 't_forest', 200))
    expect(proj.isForestDepleted('t_forest')).toBe(false)
  })

  it('ignores unrelated events', () => {
    const proj = new ForestDepletionProjection()
    proj.project(makeEvent('ECOSYSTEM_PRESSURE_RAISED', 't_forest'))
    expect(proj.isForestDepleted('t_forest')).toBe(false)
  })

  it('returns false for unknown tile', () => {
    const proj = new ForestDepletionProjection()
    expect(proj.isForestDepleted('t_desert')).toBe(false)
  })

  it('rebuildFromEvents produces same state as incremental projection', () => {
    const events = [
      makeEvent('FOREST_DEPLETED', 't_forest', 100),
      makeEvent('FOREST_RECOVERED', 't_forest', 200),
      makeEvent('FOREST_DEPLETED', 't_forest', 300),
    ]
    const incremental = new ForestDepletionProjection()
    for (const ev of events) incremental.project(ev)

    const rebuilt = new ForestDepletionProjection()
    rebuilt.rebuildFromEvents(events)

    expect(rebuilt.canonicalHash()).toBe(incremental.canonicalHash())
    expect(rebuilt.isForestDepleted('t_forest')).toBe(incremental.isForestDepleted('t_forest'))
  })
})
