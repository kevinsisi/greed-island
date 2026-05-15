import type { EventSummary } from '../state/types'

const TILE_KEYS = [
  'tile',
  'tileId',
  'from',
  'to',
  'fromTileId',
  'toTileId',
  'sourceTileId',
  'targetTileId',
  'homeTileId',
] as const

export function eventBelongsToArea(event: EventSummary, tileId: string, occupantIds: ReadonlySet<string>): boolean {
  if (occupantIds.has(event.actorId)) return true
  const payload = event.payload ?? {}
  for (const key of TILE_KEYS) {
    if (payload[key] === tileId) return true
  }
  return false
}
