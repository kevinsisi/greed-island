import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DISTRICT_GRID,
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE,
  districtAtPixel,
  isDistrict,
  type DistrictId
} from './districts'

export function isHubWalkableDistrict(id: DistrictId, activeDistrictIds: ReadonlySet<DistrictId>): boolean {
  return id === 't_road' || (isDistrict(id) && activeDistrictIds.has(id))
}

export function isHubWalkablePixel(x: number, y: number, activeDistrictIds: ReadonlySet<DistrictId>): boolean {
  const clampedX = Math.min(Math.max(x, 0), CANVAS_WIDTH - 1)
  const clampedY = Math.min(Math.max(y, 0), CANVAS_HEIGHT - 1)
  return isHubWalkableDistrict(districtAtPixel(clampedX, clampedY), activeDistrictIds)
}

export function resolveHubSpawnPosition(
  saved: { x: number; y: number } | null,
  preferred: { x: number; y: number },
  activeDistrictIds: ReadonlySet<DistrictId>
): { x: number; y: number } {
  if (saved && isHubWalkablePixel(saved.x, saved.y, activeDistrictIds)) return clampPosition(saved)
  if (isHubWalkablePixel(preferred.x, preferred.y, activeDistrictIds)) return clampPosition(preferred)

  let best: { x: number; y: number; dist: number } | null = null
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const id = DISTRICT_GRID[row]![col]!
      if (!isHubWalkableDistrict(id, activeDistrictIds)) continue
      const x = col * TILE_SIZE + TILE_SIZE / 2
      const y = row * TILE_SIZE + TILE_SIZE / 2
      const dist = Math.hypot(x - preferred.x, y - preferred.y)
      if (!best || dist < best.dist) best = { x, y, dist }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
}

function clampPosition(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.min(Math.max(pos.x, 0), CANVAS_WIDTH),
    y: Math.min(Math.max(pos.y, 0), CANVAS_HEIGHT)
  }
}
