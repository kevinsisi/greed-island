import { DomainError } from './domain.js'

interface PresenceOptions {
  now?: () => number
  reconnectGraceMs?: number
  maxConnectionsPerPlayer?: number
}

interface PlayerSlot {
  connections: Set<symbol>
  reservedUntil: number | null
}

/** Transport admission only; its wall clock never advances the deterministic game clock. */
export class RoomPresence {
  private readonly slots = new Map<string, PlayerSlot>()
  private readonly now: () => number
  private readonly reconnectGraceMs: number
  private readonly maxConnectionsPerPlayer: number
  private currentRevision = 0

  constructor(private readonly maxPlayers = 50, options: PresenceOptions = {}) {
    if (!Number.isSafeInteger(maxPlayers) || maxPlayers < 1) throw new RangeError('maxPlayers must be a positive safe integer')
    this.reconnectGraceMs = options.reconnectGraceMs ?? 10_000
    this.maxConnectionsPerPlayer = options.maxConnectionsPerPlayer ?? 2
    if (!Number.isFinite(this.reconnectGraceMs) || this.reconnectGraceMs < 0) throw new RangeError('reconnectGraceMs must be finite and non-negative')
    if (!Number.isInteger(this.maxConnectionsPerPlayer) || this.maxConnectionsPerPlayer < 1 || this.maxConnectionsPerPlayer > 2) {
      throw new RangeError('maxConnectionsPerPlayer must be 1 or 2')
    }
    this.now = options.now ?? Date.now
  }

  get revision(): number { return this.currentRevision }

  open(playerId: string): (reserve?: boolean) => void {
    this.sweep()
    let slot = this.slots.get(playerId)
    if (slot && slot.connections.size >= this.maxConnectionsPerPlayer) {
      throw new DomainError(409, 'TOO_MANY_CONNECTIONS', `同一位玩家最多只能開啟 ${this.maxConnectionsPerPlayer} 個連線。`)
    }
    if (!slot) {
      if (this.slots.size >= this.maxPlayers) throw new DomainError(409, 'ROOM_FULL', '房間已滿，請稍後再試。')
      slot = { connections: new Set(), reservedUntil: null }
      this.slots.set(playerId, slot)
    }
    const admittedSlot = slot
    const becameOnline = admittedSlot.connections.size === 0
    const connection = Symbol(playerId)
    admittedSlot.connections.add(connection)
    admittedSlot.reservedUntil = null
    if (becameOnline) this.currentRevision++

    let active = true
    return (reserve = true) => {
      if (!active) return
      active = false
      if (!admittedSlot.connections.delete(connection) || admittedSlot.connections.size > 0) return
      if (reserve && this.reconnectGraceMs > 0) admittedSlot.reservedUntil = this.now() + this.reconnectGraceMs
      else this.slots.delete(playerId)
      this.currentRevision++
    }
  }

  hasConnection(playerId: string): boolean {
    return (this.slots.get(playerId)?.connections.size ?? 0) > 0
  }

  isReserved(playerId: string): boolean {
    return this.slots.get(playerId)?.reservedUntil != null
  }

  releaseReservation(playerId: string): boolean {
    if (!this.isReserved(playerId)) return false
    this.slots.delete(playerId)
    this.currentRevision++
    return true
  }

  /** Runtime calls this on its existing timer. Admission also sweeps before checking capacity. */
  sweep(): boolean {
    const now = this.now()
    let changed = false
    for (const [playerId, slot] of this.slots) {
      if (slot.reservedUntil !== null && slot.reservedUntil <= now) {
        this.slots.delete(playerId)
        changed = true
      }
    }
    if (changed) this.currentRevision++
    return changed
  }

  counts(): { onlinePlayers: number; reservedPlayers: number } {
    let onlinePlayers = 0
    let reservedPlayers = 0
    for (const slot of this.slots.values()) {
      if (slot.connections.size > 0) onlinePlayers++
      else if (slot.reservedUntil !== null) reservedPlayers++
    }
    return { onlinePlayers, reservedPlayers }
  }
}
