import { describe, expect, it } from 'vitest'
import { computeActiveTiles, tileShouldRunEcology } from './tileActivation.js'
import type { ActiveWorldEvent } from '../events/types.js'

function npc(id: string, tile: string, lastActedTick: number) {
  return { npcId: id, tile, lastActedTick }
}

function evt(scope: ActiveWorldEvent['scope']): ActiveWorldEvent {
  return {
    id: 'evt-1',
    templateId: 'tpl',
    type: 'weather',
    scope,
    startedAtTick: 0,
    endsAtTick: 100,
    text: { zh: '', en: '' },
  } as ActiveWorldEvent
}

describe('tileActivation.computeActiveTiles', () => {
  it('returns empty set when nothing is happening', () => {
    expect(
      computeActiveTiles({
        tick: 100,
        npcStates: [],
        activeEvents: [],
        recencyTicks: 60,
      }),
    ).toEqual(new Set())
  })

  it('marks tiles with recent NPC activity as active', () => {
    const active = computeActiveTiles({
      tick: 100,
      npcStates: [
        npc('npc_yuna', 't_forest', 99), // 1 tick old → active
        npc('npc_anton', 't_central', 35), // 65 ticks old → inactive
      ],
      activeEvents: [],
      recencyTicks: 60,
    })
    expect(active.has('t_forest')).toBe(true)
    expect(active.has('t_central')).toBe(false)
  })

  it('marks tiles within active world event scope as active', () => {
    const active = computeActiveTiles({
      tick: 100,
      npcStates: [],
      activeEvents: [evt({ kind: 'region', tileIds: ['t_dock', 't_temple'] })],
      recencyTicks: 60,
    })
    expect(active.has('t_dock')).toBe(true)
    expect(active.has('t_temple')).toBe(true)
  })

  it('ignores world-scope events (they do not gate per-tile work)', () => {
    const active = computeActiveTiles({
      tick: 100,
      npcStates: [],
      activeEvents: [evt({ kind: 'world' })],
      recencyTicks: 60,
    })
    expect(active.size).toBe(0)
  })

  it('treats lastActedTick equal to the recency boundary as still active', () => {
    const active = computeActiveTiles({
      tick: 100,
      npcStates: [npc('npc_yuna', 't_forest', 40)], // exactly 60 ticks old
      activeEvents: [],
      recencyTicks: 60,
    })
    expect(active.has('t_forest')).toBe(true)
  })
})

describe('tileActivation.tileShouldRunEcology', () => {
  const period = 10

  it('runs every tick when the tile is active', () => {
    for (let tick = 0; tick < 20; tick++) {
      expect(
        tileShouldRunEcology({
          tileId: 't_forest',
          tick,
          activeTiles: new Set(['t_forest']),
          inactiveDriftPeriod: period,
        }),
      ).toBe(true)
    }
  })

  it('skips inactive tiles between drift ticks', () => {
    const activeTiles = new Set<string>()
    expect(
      tileShouldRunEcology({ tileId: 't_central', tick: 1, activeTiles, inactiveDriftPeriod: period }),
    ).toBe(false)
    expect(
      tileShouldRunEcology({ tileId: 't_central', tick: 9, activeTiles, inactiveDriftPeriod: period }),
    ).toBe(false)
  })

  it('runs inactive tiles on the periodic drift tick', () => {
    const activeTiles = new Set<string>()
    expect(
      tileShouldRunEcology({ tileId: 't_central', tick: 10, activeTiles, inactiveDriftPeriod: period }),
    ).toBe(true)
    expect(
      tileShouldRunEcology({ tileId: 't_central', tick: 20, activeTiles, inactiveDriftPeriod: period }),
    ).toBe(true)
  })

  it('does not drift on tick 0 (boot tick) to avoid mass cold start', () => {
    expect(
      tileShouldRunEcology({ tileId: 't_central', tick: 0, activeTiles: new Set(), inactiveDriftPeriod: period }),
    ).toBe(false)
  })
})
