import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { applyEvents, BEACON, DomainError, emptyState, evaluateCommand, evaluateSystemCommand, parseCommand, projectEvents, ROOM_ID, TICK_MS, WORLD } from './domain.js'
import type { RoomSnapshot, RoomState } from './types.js'

export class MultiplayerRuntime {
  private readonly store: SqliteEventStore
  private state: RoomState
  private readonly listeners = new Set<() => void>()
  private readonly connected = new Map<string, number>()
  private presenceRevision = 0
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly db: Database.Database) {
    this.store = new SqliteEventStore(db)
    db.exec('CREATE TABLE IF NOT EXISTS mp_command_receipts (player_id TEXT NOT NULL, command_id TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(player_id, command_id))')
    this.store.runInTransaction(() => { if (this.store.readEvents().length === 0) this.store.appendEvents(evaluateSystemCommand(emptyState(), { type: 'initialize' })) })
    this.state = projectEvents(this.store.readEvents())
  }

  snapshot(selfId: string): RoomSnapshot {
    if (!this.state.players.some(p => p.id === selfId)) throw new DomainError(401, 'UNAUTHORIZED', '找不到本機玩家。')
    return { roomId: ROOM_ID, revision: this.state.sequence, presenceRevision: this.presenceRevision, tick: this.state.tick, selfId,
      players: this.state.players.map(p => ({ ...p, online: (this.connected.get(p.id) ?? 0) > 0 })),
      messages: structuredClone(this.state.messages), beacon: { ...BEACON, contributors: [...this.state.contributors], completed: this.state.completed }, world: structuredClone(WORLD), npcIntegrated: false }
  }

  execute(selfId: string, body: unknown): { snapshot: RoomSnapshot; duplicate?: boolean } {
    this.snapshot(selfId)
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
    if (!result.duplicate) { this.state = applyEvents(this.state, result.events); this.publish() }
    return { snapshot: this.snapshot(selfId), ...(result.duplicate ? { duplicate: true } : {}) }
  }

  advanceTick(): void {
    const events = this.store.runInTransaction(() => this.store.appendEvents(evaluateSystemCommand(this.state, { type: 'tick', tick: this.state.tick + 1 })))
    this.state = applyEvents(this.state, events)
    // Ticks alone need no network fanout. Next command / connection includes latest tick.
  }
  start(): void { if (!this.timer) this.timer = setInterval(() => this.advanceTick(), TICK_MS) }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined }
  subscribe(listener: () => void, playerId?: string): () => void {
    this.listeners.add(listener)
    if (playerId) { this.connected.set(playerId, (this.connected.get(playerId) ?? 0) + 1); this.presenceRevision++; this.publish() }
    let active = true
    return () => {
      if (!active) return
      active = false
      this.listeners.delete(listener)
      if (playerId) { this.connected.set(playerId, Math.max(0, (this.connected.get(playerId) ?? 1) - 1)); this.presenceRevision++; this.publish() }
    }
  }
  private publish(): void { for (const listener of this.listeners) { try { listener() } catch { /* closed transport is removed by HTTP cleanup */ } } }
}
