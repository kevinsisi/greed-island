import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH, DISTRICT_IDS, TILE_SIZE, districtAtPixel, type DistrictId } from './districts'
import { isHubWalkablePixel, resolveHubSpawnPosition } from './hubWalkability'

const unlocked = new Set<DistrictId>(DISTRICT_IDS)
const lockedSaltMarsh = new Set<DistrictId>(DISTRICT_IDS.filter((id) => id !== 't_salt_marsh'))

describe('hub walkability', () => {
  it('treats locked expansion pixels as non-walkable construction zones', () => {
    const saltMarshCenter = { x: 17 * TILE_SIZE, y: 14 * TILE_SIZE }

    expect(districtAtPixel(saltMarshCenter.x, saltMarshCenter.y)).toBe('t_salt_marsh')
    expect(isHubWalkablePixel(saltMarshCenter.x, saltMarshCenter.y, lockedSaltMarsh)).toBe(false)
    expect(isHubWalkablePixel(saltMarshCenter.x, saltMarshCenter.y, unlocked)).toBe(true)
  })

  it('does not respawn the player inside a locked expansion district', () => {
    const badPosition = { x: 17 * TILE_SIZE, y: 14 * TILE_SIZE }
    const spawn = resolveHubSpawnPosition(badPosition, badPosition, lockedSaltMarsh)

    expect(spawn.x).toBeGreaterThanOrEqual(0)
    expect(spawn.x).toBeLessThanOrEqual(CANVAS_WIDTH)
    expect(spawn.y).toBeGreaterThanOrEqual(0)
    expect(spawn.y).toBeLessThanOrEqual(CANVAS_HEIGHT)
    expect(districtAtPixel(spawn.x, spawn.y)).not.toBe('t_salt_marsh')
    expect(isHubWalkablePixel(spawn.x, spawn.y, lockedSaltMarsh)).toBe(true)
  })
})
