import { accountId } from '../identity/principal.js'
import type { AccountId } from '../identity/principal.js'
import type { Event } from '../kernel/types.js'
import { PLAYER_WORLD_POSITION_EVENT_TYPES, type PlayerWorldEventData, type PlayerWorldPosition } from '../playerWorld/types.js'

export class PlayerWorldProjection {
  private positions = new Map<AccountId, PlayerWorldPosition>()
  get(id: AccountId): PlayerWorldPosition | null { const row = this.positions.get(id); return row ? { ...row } : null }
  list(): PlayerWorldPosition[] { return [...this.positions.values()].sort((a, b) => a.accountId - b.accountId).map(row => ({ ...row })) }
  clone(ids?: readonly AccountId[]): PlayerWorldProjection {
    const copy = new PlayerWorldProjection()
    const rows = ids ? [...new Set(ids)].flatMap(id => { const row = this.get(id); return row ? [row] : [] }) : this.list()
    copy.positions = new Map(rows.map(row => [row.accountId, row]))
    return copy
  }
  project(event: Event): void {
    if (!(PLAYER_WORLD_POSITION_EVENT_TYPES as readonly string[]).includes(event.eventType)) return
    const data = (event.payload as { data?: PlayerWorldEventData } | null)?.data
    if (!data || !Number.isSafeInteger(data.accountId) || data.accountId <= 0
      || event.actorId !== String(data.accountId) || typeof data.tileId !== 'string' || !data.tileId
      || !Number.isFinite(data.x) || !Number.isFinite(data.z)
      || !Number.isSafeInteger(data.movementStep) || data.movementStep < -1) {
      throw new Error(`Invalid canonical player position event ${event.eventId}`)
    }
    const id = accountId(data.accountId)
    if ((this.positions.get(id)?.sequence ?? 0) >= event.sequence) return
    this.positions.set(id, { accountId: id, tileId: data.tileId, x: data.x, z: data.z,
      movementStep: data.movementStep, sequence: event.sequence })
  }
  rebuildFromEvents(events: readonly Event[]): void {
    this.positions.clear()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }
}
