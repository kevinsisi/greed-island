import { accountActorId, accountId } from '../identity/principal.js'
import type { AccountId } from '../identity/principal.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine } from '../kernel/livingWorldCommands.js'
import type { Event, EventDraft } from '../kernel/types.js'
import { PlayerWorldProjection } from '../projections/playerWorld.js'
import { evaluatePlayerWorldIntent, intentDigest, parsePlayerWorldIntent, playerWorldCommandId } from './ruleEngine.js'
import { PlayerWorldChatProjection, WORLD_CHAT_EVENT_TYPE, WORLD_CHAT_HISTORY_LIMIT } from './chat.js'
import { createPlayerWorldSnapshot, type PlayerWorldSnapshot } from './snapshot.js'
import { PLAYER_WORLD_EVENT_TYPES, PLAYER_WORLD_POSITION_EVENT_TYPES, PLAYER_WORLD_MAX_BATCH, PLAYER_WORLD_MAX_PENDING, PLAYER_WORLD_RULESET,
  PlayerWorldError, type CanonicalPlayerWorldSource, type PlayerWorldAck, type PlayerWorldEventData, type PlayerWorldIntent, type PlayerWorldAuthorize, type PlayerWorldDisplayNameResolver } from './types.js'

const MAX_WORLD_ONLINE_ACCOUNTS = 50
const MAX_PENDING_PER_ACCOUNT = 4
export type PlayerWorldSubmission = Readonly<{ accountId: AccountId; body: unknown }>
type PreparedSubmission = Readonly<{ accountId: AccountId; intent: PlayerWorldIntent; authorize?: PlayerWorldAuthorize; requiresAdmission?: true }>
type Pending = PreparedSubmission & { resolve: (ack: PlayerWorldAck) => void; reject: (error: unknown) => void }
type Evaluation = { eventIndex?: number; ack: PlayerWorldAck } | { error: unknown }

/** One canonical store, one event-only position projection, and one bounded movement cadence. */
export class PlayerWorldService {
  private readonly projection = new PlayerWorldProjection()
  private readonly chat = new PlayerWorldChatProjection()
  private readonly engine = new LivingWorldRuleEngine()
  private readonly connections = new Map<AccountId, Set<symbol>>()
  private readonly listeners = new Set<() => void>()
  private readonly broadcastSnapshots = new Map<AccountId, PlayerWorldSnapshot>()
  private pending: Pending[] = []
  private displayNameResolver: PlayerWorldDisplayNameResolver | undefined
  private readonly displayNames = new Map<AccountId, string | null>()
  private movementStep: number
  private dirty = false
  private presenceRevision = 0
  private committing = false

  constructor(private readonly store: SqliteEventStore, private readonly source: CanonicalPlayerWorldSource,
    private readonly options: { onCommitted?: (events: readonly Event[]) => void; now?: () => number } = {}) {
    // Mandatory on EVERY boot, independently of SimulationRuntime's small/large-log branches.
    this.projection.rebuildFromEvents(store.readLatestEventsPerActor(PLAYER_WORLD_POSITION_EVENT_TYPES))
    this.chat.rebuildFromEvents(store.readRecentEventsByTypes(WORLD_CHAT_HISTORY_LIMIT, [WORLD_CHAT_EVENT_TYPE]), store.readLatestEventsPerActor([WORLD_CHAT_EVENT_TYPE]))
    this.movementStep = this.projection.list().reduce((step, player) => Math.max(step, player.movementStep), this.chat.getMaximumPostedStep()) + 1
  }

  snapshot(id: AccountId): PlayerWorldSnapshot {
    const principal = accountId(id), online = new Set(this.connections.keys())
    if (this.displayNameResolver) for (const account of new Set([...online, principal])) {
      if (!this.displayNames.has(account)) {
        const name = this.displayNameResolver(account)
        this.displayNames.set(account, typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null)
      }
    }
    return createPlayerWorldSnapshot(principal, this.projection, this.source, online, this.movementStep, this.displayNames, this.presenceRevision, this.chat.list())
  }
  setDisplayNameResolver(resolver: PlayerWorldDisplayNameResolver): void { this.displayNameResolver = resolver; this.displayNames.clear(); this.markDirty() }
  private publicDisplayName(id: AccountId): string | null {
    if (!this.displayNames.has(id)) {
      const name = this.displayNameResolver?.(id)
      this.displayNames.set(id, typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null)
    }
    return this.displayNames.get(id) ?? null
  }
  getPosition(id: AccountId) { return this.projection.get(accountId(id)) }
  getMovementStep(): number { return this.movementStep }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  /** One account may own several tabs; each live subscription owns exactly one connection token. */
  subscribeAccount(id: AccountId, listener: (snapshot: PlayerWorldSnapshot) => void): () => void {
    const principal = accountId(id), disconnect = this.connect(principal)
    const unsubscribe = this.subscribe(() => {
      const snapshot = this.broadcastSnapshots.get(principal) ?? this.snapshot(principal)
      this.broadcastSnapshots.set(principal, snapshot)
      listener(snapshot)
    })
    let active = true
    return () => { if (!active) return; active = false; unsubscribe(); disconnect() }
  }
  markDirty(): void { this.dirty = true }

  /** HTTP uses this facade: all queued players in a sub-step share the actual transaction. */
  submit(id: AccountId, body: unknown, authorize?: PlayerWorldAuthorize): Promise<PlayerWorldAck> {
    const principal = accountId(id), intent = parsePlayerWorldIntent(body)
    if (intent.type !== 'enter' && !this.connections.has(principal)) {
      return Promise.reject(new PlayerWorldError(409, 'WORLD_CONNECTION_REQUIRED', 'An admitted live world connection is required.'))
    }
    if (this.pending.length >= PLAYER_WORLD_MAX_PENDING
      || this.pending.filter(item => item.accountId === principal).length >= MAX_PENDING_PER_ACCOUNT) {
      return Promise.reject(new PlayerWorldError(429, 'COMMAND_QUEUE_FULL', 'Player command queue is full.'))
    }
    return new Promise((resolve, reject) => this.pending.push({ accountId: principal, intent, resolve, reject, ...(authorize ? { authorize } : {}), ...(intent.type !== 'enter' ? { requiresAdmission: true as const } : {}) }))
  }
  /** Timer or deterministic test driver advances the sub-clock. No wall-clock gameplay decisions. */
  advanceMovementStep(): void {
    if (this.movementStep >= Number.MAX_SAFE_INTEGER) throw new Error('Player movement sub-clock exhausted.')
    this.movementStep += 1
    this.displayNames.clear()
    const batch = this.pending.splice(0, PLAYER_WORLD_MAX_BATCH)
    if (batch.length) {
      try {
        const results = this.commitPrepared(batch, false)
        batch.forEach((item, index) => {
          const result = results[index]!
          if ('error' in result) item.reject(result.error); else item.resolve(result.ack)
        })
      } catch (error) { for (const item of batch) item.reject(error) }
    }
    // One observable publication per server movement cadence, even for many committed moves.
    if (this.dirty) {
      this.dirty = false
      this.broadcastSnapshots.clear()
      for (const listener of this.listeners) {
        try { listener() } catch (error) { console.error('[player-world] snapshot listener failed', error) }
      }
      this.broadcastSnapshots.clear()
    }
  }
  /** Atomic synchronous API for tests and trusted server integration, never client-provided ticks. */
  execute(id: AccountId, body: unknown): PlayerWorldAck { return this.executeBatch([{ accountId: id, body }])[0]! }
  executeBatch(batch: readonly PlayerWorldSubmission[]): PlayerWorldAck[] {
    if (batch.length < 1 || batch.length > PLAYER_WORLD_MAX_BATCH) throw new PlayerWorldError(400, 'INVALID_BATCH', 'Invalid player-world batch size.')
    const prepared = batch.map(item => ({ accountId: accountId(item.accountId), intent: parsePlayerWorldIntent(item.body) }))
    return this.commitPrepared(prepared, true).map(result => {
      if ('error' in result) throw result.error
      return result.ack
    })
  }

  connect(id: AccountId): () => void {
    const principal = accountId(id)
    if (!this.projection.get(principal)) throw new PlayerWorldError(409, 'WORLD_ENTRY_REQUIRED', 'Enter the canonical world first.')
    if (!this.connections.has(principal) && this.connections.size >= MAX_WORLD_ONLINE_ACCOUNTS) {
      throw new PlayerWorldError(409, 'WORLD_FULL', 'Canonical online capacity is full.')
    }
    if (!this.connections.has(principal)) this.presenceRevision += 1
    const token = Symbol(), connections = this.connections.get(principal) ?? new Set<symbol>()
    connections.add(token); this.connections.set(principal, connections); this.markDirty()
    return () => {
      // A stale disconnect after revoke/reconnect must not evict a newer connection.
      const live = this.connections.get(principal)
      if (!live?.delete(token)) return
      if (!live.size) { this.connections.delete(principal); this.presenceRevision += 1 }
      this.markDirty()
    }
  }
  /** AuthService.onRevoked must call this before releasing that account's streams. */
  disconnectAccount(id: AccountId): void {
    const principal = accountId(id)
    if (this.connections.delete(principal)) { this.presenceRevision += 1; this.markDirty() }
    this.cancelPending(principal)
  }
  cancelPending(id?: AccountId): void {
    const rejected = this.pending.filter(item => id === undefined || item.accountId === id)
    this.pending = this.pending.filter(item => id !== undefined && item.accountId !== id)
    for (const item of rejected) item.reject(new PlayerWorldError(409, 'COMMAND_CANCELLED', 'Queued command was cancelled before commit.'))
  }

  private commitPrepared(batch: readonly PreparedSubmission[], atomic: boolean): Evaluation[] {
    if (this.committing) throw new Error('Reentrant player-world transaction is not allowed.')
    this.committing = true
    let committed: Event[] = [], results: Evaluation[]
    try {
      results = this.store.runInTransaction(() => {
        const staged = this.projection.clone(batch.map(item => item.accountId)), stagedChat = this.chat.clone(), drafts: EventDraft[] = [], evaluations: Evaluation[] = []
        const receipts = new Map<string, { digest: string; eventIndex: number }>()
        const map = this.source.getMap(), tick = this.source.getTick(), submittedAt = (this.options.now ?? Date.now)()
        let stagedSequence = Math.max(this.source.getRevision(), ...staged.list().map(player => player.sequence))
        for (const item of batch) {
          try {
            item.authorize?.()
            if (item.requiresAdmission && !this.connections.has(item.accountId)) {
              throw new PlayerWorldError(409, 'WORLD_CONNECTION_REQUIRED', 'The admitted world connection closed before commit.')
            }
            const actor = accountActorId(item.accountId), commandId = playerWorldCommandId(item.accountId, item.intent.commandId)
            const digest = intentDigest(item.intent), priorBatch = receipts.get(commandId)
            if (priorBatch) {
              if (priorBatch.digest !== digest) throw new PlayerWorldError(409, 'COMMAND_ID_CONFLICT', 'Command ID already has different content.')
              evaluations.push({ eventIndex: priorBatch.eventIndex, ack: { accepted: true, commandId: item.intent.commandId, revision: 0, duplicate: true } }); continue
            }
            const prior = this.store.readEventsByActorCommand(actor, commandId, PLAYER_WORLD_EVENT_TYPES)
            if (prior.length) {
              const data = (prior[0]!.payload as { data: Pick<PlayerWorldEventData, 'intentDigest'> }).data
              if (prior.length !== 1 || data.intentDigest !== digest) throw new PlayerWorldError(409, 'COMMAND_ID_CONFLICT', 'Command ID already has different content.')
              evaluations.push({ ack: { accepted: true, commandId: item.intent.commandId, revision: prior[0]!.sequence, duplicate: true } }); continue
            }
            const command = evaluatePlayerWorldIntent({ accountId: item.accountId, intent: item.intent,
              position: staged.get(item.accountId), map, ...(this.source.getGeometry ? { getGeometry: this.source.getGeometry.bind(this.source) } : {}), movementStep: this.movementStep, worldTick: tick, submittedAt,
              ...(stagedChat.getLastPostedStep(item.accountId) !== undefined ? { lastChatStep: stagedChat.getLastPostedStep(item.accountId)! } : {}),
              ...(this.displayNameResolver ? { displayName: this.publicDisplayName(item.accountId) } : {}) })
            const compiled = this.engine.evaluate(command, { rulesetVersion: PLAYER_WORLD_RULESET })
            if (!compiled.accepted) throw new PlayerWorldError(400, compiled.rejection.code, compiled.rejection.reason)
            if (compiled.events.length !== 1) throw new Error('Canonical player action must compile to one typed event.')
            const draft = compiled.events[0]!, eventIndex = drafts.length
            const stagedEvent = { ...draft, sequence: ++stagedSequence }
            if (draft.eventType === WORLD_CHAT_EVENT_TYPE) stagedChat.project(stagedEvent); else staged.project(stagedEvent)
            drafts.push(draft); receipts.set(commandId, { digest, eventIndex })
            evaluations.push({ eventIndex, ack: { accepted: true, commandId: item.intent.commandId, revision: 0 } })
          } catch (error) {
            if (atomic) throw error
            evaluations.push({ error })
          }
        }
        committed = this.store.appendEvents(drafts)
        for (const result of evaluations) if (!('error' in result) && result.eventIndex !== undefined) {
          result.ack = { ...result.ack, revision: committed[result.eventIndex]!.sequence }
        }
        return evaluations
      })
    } finally { this.committing = false }
    // Never change projections, acknowledge success, or notify before the outer transaction commits.
    for (const event of committed) { this.projection.project(event); this.chat.project(event) }
    if (committed.length) {
      this.markDirty()
      try { this.options.onCommitted?.(committed) }
      catch (error) { console.error('[player-world] committed-event observer failed', error) }
    }
    return results
  }
}
