import { describe, expect, it } from 'vitest'
import { BEACON, generateRoster, MOVE_PER_TICK, PLAYER_RADIUS, WORLD } from '../../../server/src/multiplayer/domain.js'
import { findNavigationPath, isNavigationPathClear, moveIntentToward, type NavigationWorld } from './navigation'

const harbor: NavigationWorld = { ...WORLD, playerRadius: PLAYER_RADIUS, movePerTick: MOVE_PER_TICK }

describe('server-geometry click navigation', () => {
  it('uses a direct route in an unobstructed lane', () => {
    const world: NavigationWorld = { minX: -4, maxX: 4, minZ: -4, maxZ: 4, playerRadius: PLAYER_RADIUS, movePerTick: MOVE_PER_TICK, obstacles: [] }
    const start = { x: -2, z: -2 }
    const destination = { x: 2, z: 2 }
    const route = findNavigationPath(start, destination, world)

    expect(route).toEqual([destination])
    expect(isNavigationPathClear(start, route!, world)).toBe(true)
  })

  it('routes around the server obstacle footprint without crossing its player-radius margin', () => {
    const world: NavigationWorld = { minX: -8, maxX: 8, minZ: -6, maxZ: 6, playerRadius: PLAYER_RADIUS, movePerTick: MOVE_PER_TICK,
      obstacles: [{ x: 0, z: 0, width: 4, depth: 4 }] }
    const start = { x: -6, z: 0 }
    const destination = { x: 6, z: 0 }
    const route = findNavigationPath(start, destination, world)

    expect(route).not.toBeNull()
    expect(route!.length).toBeGreaterThan(1)
    expect(isNavigationPathClear(start, route!, world)).toBe(true)
  })

  it('rejects blocked, out-of-bounds, and incomplete legacy-server destinations', () => {
    const blocked = { x: 7, z: 8 }
    expect(findNavigationPath({ x: 0, z: -6 }, blocked, harbor)).toBeNull()
    expect(findNavigationPath({ x: 0, z: -6 }, { x: 99, z: 99 }, harbor)).toBeNull()

    const legacyServer = { minX: -12, maxX: 12, minZ: -10, maxZ: 18, obstacles: WORLD.obstacles }
    expect(findNavigationPath({ x: 0, z: -6 }, { x: 0, z: 6 }, legacyServer)).toBeNull()
    expect(findNavigationPath({ x: 0, z: -6 }, { x: 0, z: 6 }, { ...legacyServer, playerRadius: PLAYER_RADIUS })).toBeNull()
  })

  it('can reach the lighthouse beacon from every deterministic default roster spawn', () => {
    const roster = generateRoster()
    expect(roster).toHaveLength(50)
    for (const player of roster) {
      const start = { x: player.x, z: player.z }
      const route = findNavigationPath(start, { x: BEACON.x, z: BEACON.z }, harbor)
      expect(route, `${player.name} at ${player.x}, ${player.z}`).not.toBeNull()
      expect(isNavigationPathClear(start, route!, harbor), `${player.name} route`).toBe(true)
    }
  })

  it('returns no waypoints when the destination is already reached', () => {
    expect(findNavigationPath({ x: -2, z: -6 }, { x: -2, z: -6 }, harbor)).toEqual([])
  })

  it('caps each move intent at one server step and shortens the final step to avoid overshoot', () => {
    const exact = moveIntentToward({ x: 0, z: 0 }, { x: 0.1, z: 0 }, MOVE_PER_TICK)!
    expect(Math.hypot(exact.x, exact.z)).toBeLessThanOrEqual(1)
    expect(Math.hypot(exact.x, exact.z) * MOVE_PER_TICK).toBeCloseTo(0.1)

    const fullStep = moveIntentToward({ x: 0, z: 0 }, { x: 0, z: 2 }, MOVE_PER_TICK)!
    expect(Math.hypot(fullStep.x, fullStep.z)).toBeCloseTo(1)
    expect(Math.hypot(fullStep.x, fullStep.z) * MOVE_PER_TICK).toBeLessThan(2)
  })
})
