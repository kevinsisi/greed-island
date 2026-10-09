import { accountId, accountActorId, type AccountId } from '../identity/principal.js'
import type { Event } from '../kernel/types.js'
import { makeLivingWorldCommand, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { BEACON, DEFAULT_ROOM_CONFIG, MAX_FIXTURE_COUNT, DomainError, evaluateCommand, evaluateSystemCommand } from '../multiplayer/domain.js'
import type { RoomState } from '../multiplayer/types.js'
import type { PlayerWorldPosition } from './types.js'
import { PlayerWorldError } from './types.js'
import { HARBOR_BEACON_EVENT_TYPES, validateHarborBeaconEventData, type HarborBeaconEventData, type HarborBeaconEventType, type HarborPlayerProgress, type PreservedHarborState } from './harborBeaconData.js'

export type HarborProgressPolicy = (id: AccountId) => 'new-player' | 'legacy-review-required'
export type HarborProgressSnapshot = Readonly<{ status: 'ready'; supplies: number; rewards: number }> | Readonly<{ status: 'legacy-review-required'; supplies: null; rewards: null }>
const SYSTEM_ACTOR = 'system.canonical-harbor-beacon'
/** One EventLog projection of the original harbor counters; never a second room/position/presence store. */
export class HarborBeaconProjection {
  private tick = 0
  private sequence = 0
  private maximumMovementStep = -1
  private config = { ...DEFAULT_ROOM_CONFIG }
  private players = new Map<AccountId, HarborPlayerProgress>()
  private contributors: AccountId[] = []
  private awarded: AccountId[] = []
  private completed = false
  private closesAtTick: number | null = null
  clone(): HarborBeaconProjection {
    const copy = new HarborBeaconProjection(); copy.tick = this.tick; copy.sequence = this.sequence; copy.maximumMovementStep = this.maximumMovementStep
    copy.config = { ...this.config }; copy.players = new Map([...this.players].map(([id,p]) => [id,{ ...p }]))
    copy.contributors = [...this.contributors]; copy.awarded = [...this.awarded]; copy.completed = this.completed; copy.closesAtTick = this.closesAtTick; return copy
  }
  getParticipantAccountIds(): AccountId[] { return [...this.contributors] }
  getMaximumMovementStep(): number { return this.maximumMovementStep }
  isCollecting(): boolean { return !this.completed && this.closesAtTick !== null }
  getProgress(id: AccountId, policy?: HarborProgressPolicy): HarborProgressSnapshot {
    const progress = this.players.get(id)
    if (progress) return { status: 'ready', supplies: progress.supplies, rewards: progress.rewards }
    // The original new-player join grants1 supply and0 rewards. Unknown legacy provenance never receives that default.
    return policy?.(id) === 'new-player' ? { status: 'ready', supplies: 1, rewards: 0 } : { status: 'legacy-review-required', supplies: null, rewards: null }
  }
  snapshot() {
    return { ...BEACON, tileId: 't_dock' as const, required: this.config.minParticipants, participationWindowTicks: this.config.participationWindowTicks,
      tick: this.tick, tickMs: 100 as const, closesAtTick: this.closesAtTick, contributors: [...this.contributors], awardedAccountIds: [...this.awarded],
      completed: this.completed, phase: this.completed ? 'completed' as const : this.closesAtTick === null ? 'gathering' as const : 'collecting' as const }
  }
  private room(positions: readonly PlayerWorldPosition[], policy: HarborProgressPolicy | undefined, movementStep: number): RoomState {
    const players = positions.flatMap(position => {
      const p = this.getProgress(position.accountId, policy)
      return p.status === 'ready' ? [{ id: String(position.accountId), name: String(position.accountId), x: position.x, z: position.z, supplies: p.supplies, rewards: p.rewards }] : []
    })
    return { sequence: this.sequence, tick: this.isCollecting() || this.completed ? this.tick : Math.max(this.tick, movementStep), config: { ...this.config }, players,
      messages: [], contributors: this.contributors.map(String), completed: this.completed, closesAtTick: this.closesAtTick, awardedPlayerIds: this.awarded.map(String), movedAt: {} }
  }
  contribution(input: { accountId: AccountId; commandId: string; intentDigest: string; positions: readonly PlayerWorldPosition[]; movementStep: number; worldTick: number; submittedAt: number; policy?: HarborProgressPolicy }): LivingWorldCommand[] {
    const position = input.positions.find(position => position.accountId === input.accountId)
    if (!position) throw new PlayerWorldError(409, 'WORLD_ENTRY_REQUIRED', 'Enter the canonical world first.')
    if (position.tileId !== 't_dock') throw new PlayerWorldError(409, 'OUT_OF_RANGE', 'The harbor beacon is in t_dock.')
    const progress = this.getProgress(input.accountId, input.policy)
    if (progress.status !== 'ready') throw new PlayerWorldError(409, 'LEGACY_HARBOR_PROGRESS_REVIEW_REQUIRED', 'Legacy harbor progress requires reviewed association.')
    if (this.contributors.length >= MAX_FIXTURE_COUNT && !this.contributors.includes(input.accountId)) throw new PlayerWorldError(409, 'HARBOR_PROGRESS_CAPACITY_FULL', 'Original harbor participant bound is reached.')
    const state = this.room(input.positions, input.policy, input.movementStep)
    let oldEvents
    try { oldEvents = evaluateCommand(state, String(input.accountId), { commandId: input.commandId, type: 'contribute', payload: {} }) }
    catch (error) { if (error instanceof DomainError) throw new PlayerWorldError(error.status, error.code, error.message); throw error }
    return oldEvents.map(event => {
      if (event.eventType === 'MP_CONTRIBUTED') return makeLivingWorldCommand('PLAYER_HARBOR_CONTRIBUTED', accountActorId(input.accountId), 'player', input.worldTick, input.submittedAt,
        { beaconId: BEACON.id as 'harbor-beacon-1', tileId: 't_dock', kind: 'contributed', accountId: input.accountId, beaconTick: state.tick, movementStep: input.movementStep,
          suppliesBefore: progress.supplies, suppliesAfter: progress.supplies - 1, rewardsBefore: progress.rewards, clientCommandId: input.commandId, intentDigest: input.intentDigest }, `player-world:${input.accountId}:${input.commandId}`)
      return makeLivingWorldCommand('HARBOR_BEACON_COLLECTION_OPENED', SYSTEM_ACTOR, 'system', input.worldTick, input.submittedAt,
        { beaconId: BEACON.id as 'harbor-beacon-1', tileId: 't_dock', kind: 'collection-opened', beaconTick: state.tick, movementStep: input.movementStep,
          closesAtTick: (event.payload as { closesAtTick: number }).closesAtTick }, `harbor-open:${BEACON.id}`)
    })
  }
  /** The existing100ms world timer drives this; no additional RoomRuntime, clock or account store. */
  advance(input: { positions: readonly PlayerWorldPosition[]; movementStep: number; worldTick: number; submittedAt: number; policy?: HarborProgressPolicy }): LivingWorldCommand[] {
    if (!this.isCollecting()) return []
    const state = this.room(input.positions, input.policy, input.movementStep), events = evaluateSystemCommand(state, { type: 'tick', tick: this.tick + 1 })
    return events.map(event => {
      const common = { beaconId: BEACON.id as 'harbor-beacon-1', tileId: 't_dock' as const, beaconTick: event.tick!, movementStep: input.movementStep }
      if (event.eventType === 'MP_TICK') return makeLivingWorldCommand('HARBOR_BEACON_TICKED', SYSTEM_ACTOR, 'system', input.worldTick, input.submittedAt,
        { ...common, kind: 'ticked' }, `harbor-tick:${event.tick}`)
      if (event.eventType === 'MP_BEACON_COMPLETED') return makeLivingWorldCommand('HARBOR_BEACON_COMPLETED', SYSTEM_ACTOR, 'system', input.worldTick, input.submittedAt,
        { ...common, kind: 'completed' }, `harbor-completed:${BEACON.id}`)
      const id = accountId(Number((event.payload as { playerId: string }).playerId)), previous = this.players.get(id)
      if (!previous) throw new Error('Canonical harbor reward has no preserved contribution progress.')
      return makeLivingWorldCommand('HARBOR_BEACON_REWARDED', SYSTEM_ACTOR, 'system', input.worldTick, input.submittedAt,
        { ...common, kind: 'rewarded', accountId: id, rewardsBefore: previous.rewards, rewardsAfter: previous.rewards + 1 }, `harbor-reward:${BEACON.id}:${id}`)
    })
  }
  project(event: Event): void {
    if (!(HARBOR_BEACON_EVENT_TYPES as readonly string[]).includes(event.eventType) || event.sequence <= this.sequence) return
    const data = (event.payload as { data?: HarborBeaconEventData } | null)?.data
    if (!data || validateHarborBeaconEventData(event.eventType as HarborBeaconEventType, data)) throw new Error(`Invalid canonical harbor event ${event.eventId}`)
    if (event.actorId !== (data.kind === 'contributed' ? String(data.accountId) : SYSTEM_ACTOR)) throw new Error('Harbor event actor must be server derived.')
    if (data.beaconTick < this.tick) throw new Error('Harbor progress clock must not regress.')
    if (data.kind === 'legacy-restored') {
      if (this.sequence) throw new Error('Legacy harbor progress cannot overwrite canonical progress.')
      this.config = { ...data.state.config }; this.players = new Map(data.state.players.map(p => [accountId(p.accountId),{ ...p }]))
      this.contributors = data.state.contributors.map(accountId); this.awarded = data.state.awardedAccountIds.map(accountId)
      this.completed = data.state.completed; this.closesAtTick = data.state.closesAtTick
    } else if (data.kind === 'contributed') {
      const id = accountId(data.accountId), before = this.players.get(id)
      if (this.completed || this.contributors.length >= MAX_FIXTURE_COUNT || this.contributors.includes(id) || before && (before.supplies !== data.suppliesBefore || before.rewards !== data.rewardsBefore)) throw new Error('Invalid repeated/conflicting harbor contribution.')
      this.players.set(id, { accountId: id, supplies: data.suppliesAfter, rewards: data.rewardsBefore }); this.contributors.push(id)
    } else if (data.kind === 'collection-opened') {
      if (this.closesAtTick !== null || this.contributors.length < this.config.minParticipants || data.closesAtTick !== data.beaconTick + this.config.participationWindowTicks) throw new Error('Invalid harbor collection opening.')
      this.closesAtTick = data.closesAtTick
    } else if (data.kind === 'ticked') {
      if (!this.isCollecting() || data.beaconTick !== this.tick + 1) throw new Error('Harbor collection tick must be consecutive.')
    } else if (data.kind === 'completed') {
      if (!this.isCollecting() || data.beaconTick !== this.tick || this.tick < this.closesAtTick! || this.contributors.length < this.config.minParticipants) throw new Error('Invalid harbor completion.')
      this.completed = true
    } else {
      const id = accountId(data.accountId), before = this.players.get(id)
      if (!this.completed || !this.contributors.includes(id) || this.awarded.includes(id) || !before || before.rewards !== data.rewardsBefore) throw new Error('Invalid duplicate/unearned harbor reward.')
      this.players.set(id, { ...before, rewards: data.rewardsAfter }); this.awarded.push(id)
    }
    this.tick = data.beaconTick; this.maximumMovementStep = Math.max(this.maximumMovementStep, data.movementStep); this.sequence = event.sequence
  }
  rebuildFromEvents(events: readonly Event[]): void {
    this.tick = 0; this.sequence = 0; this.maximumMovementStep = -1; this.config = { ...DEFAULT_ROOM_CONFIG }
    this.players.clear(); this.contributors = []; this.awarded = []; this.completed = false; this.closesAtTick = null
    for (const event of [...events].sort((a,b) => a.sequence - b.sequence)) this.project(event) }
}
/** Explicit offline reviewed association only; this does not activate accounts or a staged volume. */
export function reviewedHarborRestorationCommand(input: { namespace: string; sourceDigest: string; reviewReference: string; state: PreservedHarborState; worldTick: number; submittedAt: number }): LivingWorldCommand {
  return makeLivingWorldCommand('HARBOR_BEACON_LEGACY_PROGRESS_RESTORED', SYSTEM_ACTOR, 'system', input.worldTick, input.submittedAt,
    { kind: 'legacy-restored', beaconId: BEACON.id as 'harbor-beacon-1', tileId: 't_dock', beaconTick: input.state.tick, movementStep: -1,
      namespace: input.namespace, sourceDigest: input.sourceDigest, reviewReference: input.reviewReference, state: input.state }, `harbor-restore:${input.namespace}:${input.sourceDigest}`)
}
