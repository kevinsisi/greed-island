import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { applyEvents, BEACON, DomainError, emptyState, evaluateCommand, evaluateSystemCommand, parseCommand, projectEvents, ROOM_ID, TICK_MS, WORLD } from './domain.js'
import type { CommandAcknowledgement, RoomConfig, RoomSnapshot, RoomState, RosterPlayer } from './types.js'
import { RoomPresence } from './presence.js'
import { TickFanout } from './sync.js'

export type RuntimeOptions = { roster?: readonly RosterPlayer[]; config?: RoomConfig; now?: () => number; requireExisting?: boolean }

export class MultiplayerRuntime {
  private readonly store: SqliteEventStore
  private state: RoomState
  private readonly presence: RoomPresence
  private readonly fanout = new TickFanout()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly db: Database.Database, options: RuntimeOptions = {}) {
    this.store = new SqliteEventStore(db)
    db.exec('CREATE TABLE IF NOT EXISTS mp_command_receipts (player_id TEXT NOT NULL, command_id TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(player_id, command_id))')
    this.store.runInTransaction(() => {
      if (this.store.readEvents().length === 0) {
        if (options.requireExisting) throw new Error('Existing fixture room has no event history; refusing to initialize or refill resources.')
        this.store.appendEvents(evaluateSystemCommand(emptyState(), {
          type: 'initialize', ...(options.roster ? { roster: options.roster } : {}), ...(options.config ? { config: options.config } : {}),
        }))
      }
    })
    this.state = projectEvents(this.store.readEvents())
    this.presence = new RoomPresence(this.state.config.maxOnlinePlayers, options.now ? { now: options.now } : {})
  }

  snapshot(selfId: string): RoomSnapshot {
    if (!this.state.players.some(p => p.id === selfId)) throw new DomainError(401, 'UNAUTHORIZED', '找不到本機玩家。')
    return { roomId: ROOM_ID, revision: this.state.sequence, presenceRevision: this.presence.revision, tick: this.state.tick, selfId,
      capacity: { maxOnlinePlayers: this.state.config.maxOnlinePlayers, ...this.presence.counts(), selfHasSlot: this.presence.hasConnection(selfId) || this.presence.isReserved(selfId) },
      players: this.state.players.map(p => ({ ...p, online: this.presence.hasConnection(p.id) })),
      messages: structuredClone(this.state.messages),
      beacon: { ...BEACON, required: this.state.config.minParticipants, contributors: [...this.state.contributors], completed: this.state.completed,
        phase: this.state.completed ? 'completed' : this.state.closesAtTick === null ? 'gathering' : 'collecting', closesAtTick: this.state.closesAtTick },
      world: structuredClone(WORLD), npcIntegrated: false }
  }

  execute(selfId: string, body: unknown): CommandAcknowledgement {
    if (!this.state.players.some(p => p.id === selfId)) throw new DomainError(401, 'UNAUTHORIZED', '找不到本機玩家。')
    if (!this.presence.hasConnection(selfId)) throw new DomainError(409, 'ROOM_CONNECTION_REQUIRED', '請先連入房間再操作。')
    const command = parseCommand(body)
    let digest: string
    try { digest = createHash('sha256').update(toCanonicalJson(command)).digest('hex') }
    catch { throw new DomainError(400, 'INVALID_COMMAND', '命令必須包含有效的 JSON 值。') }
    const result = this.store.runInTransaction(() => {
      const prior = this.db.prepare('SELECT digest FROM mp_command_receipts WHERE player_id=? AND command_id=?').get(selfId, command.commandId) as { digest: string } | undefined
      if (prior) {
        if (prior.digest !== digest) throw new DomainError(409, 'COMMAND_ID_CONFLICT', '此 commandId 已用於其他內容。')
        return { duplicate: true, events: [] }
      }
      const drafts = evaluateCommand(this.state, selfId, command)
      const events = this.store.appendEvents(drafts)
      this.db.prepare('INSERT INTO mp_command_receipts(player_id,command_id,digest) VALUES(?,?,?)').run(selfId, command.commandId, digest)
      return { duplicate: false, events }
    })
    // Do not mutate in-memory projections until the enclosing transaction commits.
    if (!result.duplicate) { this.state = applyEvents(this.state, result.events); this.fanout.markDirty() }
    return { accepted: true, commandId: command.commandId, revision: this.state.sequence, ...(result.duplicate ? { duplicate: true } : {}) }
  }

  advanceTick(): void {
    const wasCollecting = !this.state.completed && this.state.closesAtTick !== null
    const events = this.store.runInTransaction(() => this.store.appendEvents(evaluateSystemCommand(this.state, { type: 'tick', tick: this.state.tick + 1 })))
    this.state = applyEvents(this.state, events)
    const previousPresence = this.presence.revision
    this.presence.sweep()
    if (wasCollecting || events.length > 1 || this.presence.revision !== previousPresence) this.fanout.markDirty()
    this.fanout.flush(this.state.tick)
  }
  start(): void { if (!this.timer) this.timer = setInterval(() => this.advanceTick(), TICK_MS) }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  connect(playerId: string): (reserve?: boolean) => void {
    if (!this.state.players.some(p => p.id === playerId)) throw new DomainError(401, 'UNAUTHORIZED', '找不到本機玩家。')
    const before = this.presence.revision
    let disconnect: (reserve?: boolean) => void
    try { disconnect = this.presence.open(playerId) }
    finally { if (this.presence.revision !== before) this.fanout.markDirty() }
    return (reserve = true) => {
      const previous = this.presence.revision
      disconnect(reserve)
      if (this.presence.revision !== previous) this.fanout.markDirty()
    }
  }
  hasConnection(playerId: string): boolean { return this.presence.hasConnection(playerId) }
  releaseReservation(playerId: string): void {
    const before = this.presence.revision
    this.presence.releaseReservation(playerId)
    if (this.presence.revision !== before) this.fanout.markDirty()
  }
  subscribe(listener: () => void): () => void { return this.fanout.subscribe(listener) }
}
