import { describe, expect, it } from 'vitest'
import { NpcEngine, type NpcTickContext } from './npcEngine.js'
import { FRONTIER_ZONES, getKnownMapRegions, getMapAdjacency, nextStepTowards } from './mapGraph.js'
import { canStand, getRegionGeometry } from '../playerWorld/geometry.js'
import type { NpcProfile } from '../npcs/types.js'
import { TICKS_PER_DAY } from '../config/world.js'

function profile(id: string, origin: string, target: string): NpcProfile {
  return { id, name: { zh: id, en: id }, role: { zh: '探索者', en: 'Explorer' }, defaultLocation: origin,
    routine: [{ fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: target, label: 'work' }],
    triggers: [], memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 }, personality: { factionLean: 'neutral' } }
}
const context: NpcTickContext = { areaSafety: new Map(), areaEconomy: new Map(), weather: '晴', rareWindowOpen: false }
describe('NPC generated frontier authority and physical navigation', () => {
  it.each(FRONTIER_ZONES.map(t => t.id))('only enters generated %s and stays out of rocks/water after arrival and dispersal', tileId => {
    const zone = FRONTIER_ZONES.find(t => t.id === tileId)!, world = getRegionGeometry(tileId)!
    const engine = new NpcEngine([profile('explorer-1', zone.adjacentTo[0]!, tileId), profile('explorer-2', zone.adjacentTo[0]!, tileId)])
    for (let tick = 1; tick <= 20; tick++) engine.tick(tick, context)
    expect(engine.getState('explorer-1')!.tile).not.toBe(tileId)
    let arrived = false
    for (let tick = 21; tick <= 300; tick++) {
      engine.tick(tick, { ...context, generatedTileIds: [tileId] })
      for (const [, state] of engine.snapshotAll()) if (state.tile === tileId) {
        arrived = true
        expect(canStand({ x: state.subCol, z: state.subRow }, world)).toBe(true)
      }
    }
    expect(arrived).toBe(true)
  })
})

describe('generated frontiers cannot unlock authored expansion regions', () => {
  it('keeps salt marsh absent from the graph and NPC itinerary until explicitly unlocked', () => {
    const generatedTileIds = ['t_frontier_badlands'], locked = { ...context, unlockedTileIds: [], generatedTileIds }
    expect(getKnownMapRegions([], generatedTileIds).find(t => t.id === 't_salt_marsh')?.available).toBe(false)
    const graph = getMapAdjacency([], generatedTileIds)
    expect(graph.t_salt_marsh).toBeUndefined()
    expect(Object.values(graph).flat()).not.toContain('t_salt_marsh')
    expect(graph.t_frontier_badlands).toEqual(['t_ruin'])
    expect(nextStepTowards('t_ruin', 't_salt_marsh', [], generatedTileIds)).toBeNull()
    expect(nextStepTowards('t_frontier_badlands', 't_salt_marsh', [], generatedTileIds)).toBeNull()
    const engine = new NpcEngine([profile('expansion-explorer', 't_ruin', 't_salt_marsh')])
    for (let tick = 1; tick <= 100; tick++) {
      engine.tick(tick, locked)
      const state = engine.getState('expansion-explorer')!
      expect(state.tile).not.toBe('t_salt_marsh')
      expect(state.travelRoute?.toTile).not.toBe('t_salt_marsh')
    }
    const unlocked = { ...locked, unlockedTileIds: ['t_salt_marsh'] }
    const unlockedGraph = getMapAdjacency(unlocked.unlockedTileIds, generatedTileIds)
    expect(unlockedGraph.t_frontier_badlands).toContain('t_salt_marsh')
    expect(unlockedGraph.t_salt_marsh).toContain('t_frontier_badlands')
    let arrived = false
    for (let tick = 101; tick <= 200; tick++) {
      engine.tick(tick, unlocked)
      arrived ||= engine.getState('expansion-explorer')!.tile === 't_salt_marsh'
    }
    expect(arrived).toBe(true)
  })
  it('never adds any unavailable endpoint for any frontier generation prefix', () => {
    for (let count = 0; count <= FRONTIER_ZONES.length; count++) {
      const generated = FRONTIER_ZONES.slice(0, count).map(t => t.id)
      for (const unlocked of [[], ['t_salt_marsh']]) {
        const available = new Set(getKnownMapRegions(unlocked, generated).filter(t => t.available).map(t => t.id))
        const graph = getMapAdjacency(unlocked, generated)
        for (const [origin, neighbors] of Object.entries(graph)) {
          expect(available.has(origin)).toBe(true)
          for (const neighbor of neighbors) {
            expect(available.has(neighbor)).toBe(true)
            expect(graph[neighbor]).toContain(origin)
          }
        }
      }
    }
  })
})
