import { describe, expect, it } from 'vitest'
import { FactionControlProjection } from './factionControl.js'
import type { Event } from '../kernel/types.js'

function makeEvent(eventType: string, data: Record<string, unknown>, sequence = 1): Event {
  return {
    id: `evt-${sequence}`,
    eventType,
    sequence,
    tick: 100,
    createdAt: '2024-01-01T00:00:00Z',
    payload: { actorType: 'system', data, narration: null },
  } as unknown as Event
}

function makeSeizedEvent(tileId: string, factionId: string, previousFactionId: string | null, tick = 100, seq = 1): Event {
  return makeEvent('FACTION_TILE_SEIZED', { tileId, factionId, previousFactionId, seizedAtTick: tick }, seq)
}

describe('FactionControlProjection', () => {
  it('starts empty — unknown tile returns null', () => {
    const proj = new FactionControlProjection()
    expect(proj.dominantFactionOf('tile_forest')).toBeNull()
    expect(proj.list()).toHaveLength(0)
  })

  it('tracks dominant faction after FACTION_TILE_SEIZED', () => {
    const proj = new FactionControlProjection()
    proj.project(makeSeizedEvent('tile_forest', 'guild', null, 100))
    expect(proj.dominantFactionOf('tile_forest')).toBe('guild')
  })

  it('updates to latest faction when tile is seized again', () => {
    const proj = new FactionControlProjection()
    proj.project(makeSeizedEvent('tile_forest', 'guild', null, 100, 1))
    proj.project(makeSeizedEvent('tile_forest', 'tide_hunters', 'guild', 200, 2))
    expect(proj.dominantFactionOf('tile_forest')).toBe('tide_hunters')
  })

  it('ignores unrelated event types', () => {
    const proj = new FactionControlProjection()
    proj.project(makeEvent('NPC_MOVE', { tileId: 'tile_forest', factionId: 'guild', previousFactionId: null, seizedAtTick: 10 }))
    expect(proj.dominantFactionOf('tile_forest')).toBeNull()
  })

  it('dominantTilesOf returns tiles controlled by faction', () => {
    const proj = new FactionControlProjection()
    proj.project(makeSeizedEvent('tile_forest', 'guild', null, 100, 1))
    proj.project(makeSeizedEvent('tile_desert', 'guild', null, 110, 2))
    proj.project(makeSeizedEvent('tile_port', 'tide_hunters', null, 120, 3))
    const guildTiles = proj.dominantTilesOf('guild' as any)
    expect(guildTiles).toContain('tile_forest')
    expect(guildTiles).toContain('tile_desert')
    expect(guildTiles).not.toContain('tile_port')
    expect(proj.dominantTilesOf('tide_hunters' as any)).toContain('tile_port')
  })

  it('dominantTilesOf returns empty for faction with no territories', () => {
    const proj = new FactionControlProjection()
    expect(proj.dominantTilesOf('free_runners' as any)).toHaveLength(0)
  })

  it('rebuildFromEvents restores state', () => {
    const events = [
      makeSeizedEvent('tile_forest', 'guild', null, 100, 1),
      makeSeizedEvent('tile_desert', 'tide_hunters', null, 200, 2),
      makeSeizedEvent('tile_forest', 'tide_hunters', 'guild', 300, 3),
    ]
    const proj = new FactionControlProjection()
    proj.rebuildFromEvents(events)
    expect(proj.dominantFactionOf('tile_forest')).toBe('tide_hunters')
    expect(proj.dominantFactionOf('tile_desert')).toBe('tide_hunters')
    expect(proj.dominantFactionOf('tile_port')).toBeNull()
    expect(proj.list()).toHaveLength(2)
  })
})
