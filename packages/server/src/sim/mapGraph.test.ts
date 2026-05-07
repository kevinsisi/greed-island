import { describe, expect, it } from 'vitest'
import { MAP_ADJACENCY, MAP_TILES, nextStepTowards } from './mapGraph.js'

describe('mapGraph', () => {
  it('every tile is in adjacency map', () => {
    for (const tile of MAP_TILES) {
      expect(Array.isArray(MAP_ADJACENCY[tile.id])).toBe(true)
    }
  })

  it('adjacency is symmetric (a -> b implies b -> a)', () => {
    for (const [a, neighbors] of Object.entries(MAP_ADJACENCY)) {
      for (const b of neighbors) {
        expect(MAP_ADJACENCY[b], `${b} should list ${a}`).toContain(a)
      }
    }
  })

  it('nextStepTowards returns null when origin === target', () => {
    expect(nextStepTowards('t_central', 't_central')).toBeNull()
  })

  it('nextStepTowards returns a direct neighbor when adjacent', () => {
    // t_central ↔ t_dimai is direct
    expect(nextStepTowards('t_central', 't_dimai')).toBe('t_dimai')
  })

  it('nextStepTowards returns first hop on multi-step path', () => {
    // t_dock → t_mountain: dock→central→dimai→mountain (or dock→central→forest→mountain)
    const step = nextStepTowards('t_dock', 't_mountain')
    expect(step).not.toBeNull()
    expect(MAP_ADJACENCY['t_dock']).toContain(step!)
  })

  it('nextStepTowards never jumps to non-adjacent tile', () => {
    const step = nextStepTowards('t_desert', 't_temple')
    expect(step).not.toBeNull()
    expect(MAP_ADJACENCY['t_desert']).toContain(step!)
  })

  it('nextStepTowards returns null when target is unknown', () => {
    expect(nextStepTowards('t_central', 't_nope')).toBeNull()
  })
})
