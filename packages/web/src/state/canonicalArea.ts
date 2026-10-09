import { AREA_GRID_COLS, AREA_GRID_ROWS, AREA_TILE_SIZE } from '../game/areaGrid'
import type { PlayerWorldSnapshot, WorldPoint } from '../multiplayer3d/types'
export function canonicalAreaPoint(snapshot: PlayerWorldSnapshot | null, tileId: string): { col: number; row: number } | null {
  if (!snapshot || snapshot.tileId !== tileId) return null
  const self = snapshot.players.find(p => p.accountId === snapshot.selfId)
  if (!self) return null
  const g = snapshot.geometry
  if (g.presentation === 'canonical-area-grid') return { col: self.x, row: self.z }
  return { col: (self.x - g.minX - g.playerRadius) / (g.maxX - g.minX - 2 * g.playerRadius) * (AREA_GRID_COLS - 1),
    row: (self.z - g.minZ - g.playerRadius) / (g.maxZ - g.minZ - 2 * g.playerRadius) * (AREA_GRID_ROWS - 1) }
}
export function canonicalAreaDestination(snapshot: PlayerWorldSnapshot, col: number, row: number): WorldPoint | null {
  if (!Number.isFinite(col) || !Number.isFinite(row) || col < 0 || col >= AREA_GRID_COLS || row < 0 || row >= AREA_GRID_ROWS) return null
  const g = snapshot.geometry
  return g.presentation === 'canonical-area-grid' ? { x: col, z: row } : {
    x: g.minX + g.playerRadius + col / (AREA_GRID_COLS - 1) * (g.maxX - g.minX - 2 * g.playerRadius),
    z: g.minZ + g.playerRadius + row / (AREA_GRID_ROWS - 1) * (g.maxZ - g.minZ - 2 * g.playerRadius),
  }
}
export function canonicalAreaPixel(snapshot: PlayerWorldSnapshot | null, tileId: string) {
  const point = canonicalAreaPoint(snapshot, tileId)
  return point ? { tileId, x: point.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2, y: point.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2, z: 0 } : null
}
