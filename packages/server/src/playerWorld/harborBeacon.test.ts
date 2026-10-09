import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import { LivingWorldRuleEngine } from '../kernel/livingWorldCommands.js'
import type { Event, EventDraft } from '../kernel/types.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { applyEvents, emptyState, evaluateCommand, evaluateSystemCommand } from '../multiplayer/domain.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { HarborBeaconProjection, reviewedHarborRestorationCommand } from './harborBeacon.js'
import { validateHarborBeaconEventData, validatePreservedHarborState, type PreservedHarborState } from './harborBeaconData.js'
import { PlayerWorldService } from './service.js'
import { EventFixture } from './service.testSupport.js'

const ids = [accountId(1),accountId(2),accountId(3)], policy = () => 'new-player' as const
const positions = ids.map(id => ({ accountId: id, tileId: 't_dock', x: 0, z: 6, movementStep: -1, sequence: id }))
const digest = 'a'.repeat(64), engine = new LivingWorldRuleEngine()
function projection() { const harbor = new HarborBeaconProjection(); let sequence = 0
  const append = (commands: readonly Parameters<LivingWorldRuleEngine['evaluate']>[0][]) => {
    const drafts = commands.flatMap(command => { const compiled = engine.evaluate(command); if (!compiled.accepted) throw new Error(compiled.rejection.reason); return compiled.events })
    const events = drafts.map(draft => ({ ...draft, sequence: ++sequence })); events.forEach(event => harbor.project(event)); return events
  }
  const contribute = (id = ids[0]!, movementStep = 0, supplied = positions) => append(harbor.contribution({ accountId: id, commandId: 'contribute', intentDigest: digest,
    positions: supplied, movementStep, worldTick: 7, submittedAt: 0, policy }))
  const advance = (movementStep: number) => append(harbor.advance({ positions, movementStep, worldTick: 7, submittedAt: 0, policy }))
  return { harbor, append, contribute, advance }
}
function preserved(): PreservedHarborState { return { tick: 10, config: { maxOnlinePlayers: 50, minParticipants: 2, participationWindowTicks: 300 },
  players: ids.slice(0,2).map(id => ({ accountId: id, supplies: 1, rewards: 0 })), contributors: [], awardedAccountIds: [], completed: false, closesAtTick: null } }
function setup() { const fixture = new EventFixture(), source = { getTick: () => 7, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: () => [],
  getMap: () => ({ regions: getKnownMapRegions(), edges: getKnownMapEdges(), adjacency: getMapAdjacency() }) }
  const create = () => new PlayerWorldService(fixture as unknown as SqliteEventStore, source, { now: () => 0 })
  const service = create(); service.setHarborProgressPolicy(policy)
  for (const id of ids.slice(0,2)) { service.execute(id, { commandId: 'enter', type: 'enter', payload: {} }); service.connect(id) }
  for (let step = 0; step < 30; step += 1) { service.advanceMovementStep(); service.executeBatch(ids.slice(0,2).map(id => ({ accountId: id, body: { commandId: `walk${step}`, type: 'move', payload: { dx: 0, dz: 1 } } }))) }
  return { fixture, service, create }
}
describe('exact original harbor mechanics canonical adapter', () => {
  it('matches original contribution/open/cutoff/completion/rewards at every one of300 server steps', () => {
    const { harbor, contribute, advance } = projection(); let old = emptyState(), oldSequence = 0
    const oldAppend = (drafts: readonly EventDraft[]) => { const events = drafts.map(draft => ({ ...draft, sequence: ++oldSequence })); old = applyEvents(old, events) }
    oldAppend(evaluateSystemCommand(old, { type: 'initialize', roster: positions.map(p => ({ id: String(p.accountId), name: String(p.accountId), x: p.x, z: p.z })) }))
    for (const id of ids.slice(0,2)) { oldAppend(evaluateCommand(old, String(id), { commandId: 'contribute', type: 'contribute', payload: {} })); contribute(id) }
    for (let tick = 0; tick <= 300; tick += 1) {
      if (tick) { oldAppend(evaluateSystemCommand(old, { type: 'tick', tick })); advance(tick) }
      const snapshot = harbor.snapshot()
      expect([snapshot.tick,snapshot.completed,snapshot.closesAtTick,snapshot.contributors.map(String),snapshot.awardedAccountIds.map(String)])
        .toEqual([old.tick,old.completed,old.closesAtTick,old.contributors,old.awardedPlayerIds])
      expect(ids.map(id => harbor.getProgress(id, policy))).toEqual(old.players.map(p => ({ status: 'ready', supplies: p.supplies, rewards: p.rewards })))
    }
    expect(() => contribute(ids[2])).toThrow('不能重複領獎'); expect(advance(301)).toEqual([])
  })
  it('accepts an additional contributor before cutoff and awards them once even after leaving the dock/going offline', () => {
    const { harbor, contribute, advance } = projection(); contribute(ids[0]); contribute(ids[1]); for (let tick = 1; tick < 300; tick++) advance(tick)
    contribute(ids[2], 299); advance(300)
    expect(harbor.snapshot().awardedAccountIds).toEqual(ids); expect(harbor.getProgress(ids[2]!, policy)).toEqual({ status: 'ready', supplies: 0, rewards: 1 })
    expect(advance(301)).toEqual([]); expect(() => contribute(ids[2])).toThrow('不能重複領獎')
  })
  it('requires canonical dock/radius and explicit new-player or preserved progress, never caller coordinates/resources', () => {
    const { harbor, contribute } = projection()
    expect(() => contribute(ids[0], 0, [{ ...positions[0]!, tileId: 't_central' }])).toThrow('t_dock')
    expect(() => contribute(ids[0], 0, [{ ...positions[0]!, z: -6 }])).toThrow('靠近信標')
    expect(harbor.getProgress(ids[0]!)).toEqual({ status: 'legacy-review-required', supplies: null, rewards: null })
    expect(() => harbor.contribution({ accountId: ids[0]!, commandId: 'c', intentDigest: digest, positions, movementStep: 0, worldTick: 0, submittedAt: 0 })).toThrow('reviewed association')
  })
  it('retains exact source counters/config and no-supply rejection, and never overwrites completed canonical progress', () => {
    const { harbor, append, contribute } = projection(), state = preserved()
    append([reviewedHarborRestorationCommand({ namespace: 'synthetic-stage', sourceDigest: digest, reviewReference: 'verified-alias-proof', state: { ...state, players: [{ ...state.players[0]!, supplies: 0 },state.players[1]!] }, worldTick: 0, submittedAt: 0 })])
    expect(harbor.getProgress(ids[0]!)).toEqual({ status: 'ready', supplies: 0, rewards: 0 }); expect(() => contribute(ids[0])).toThrow('沒有可投入')
    expect(() => append([reviewedHarborRestorationCommand({ namespace: 'synthetic-stage', sourceDigest: digest, reviewReference: 'other', state, worldTick: 0, submittedAt: 0 })])).toThrow('overwrite')
  })
  it('validates receipt/progress/server-only identities and rejects malformed preservation', () => {
    expect(validateHarborBeaconEventData('PLAYER_HARBOR_CONTRIBUTED', { beaconId: 'evil' })).toBeTruthy()
    expect(validateHarborBeaconEventData('HARBOR_BEACON_LEGACY_PROGRESS_RESTORED', { kind: 'legacy-restored', beaconId: 'harbor-beacon-1', tileId: 't_dock', beaconTick: 0, movementStep: -1,
      namespace: 'synthetic', sourceDigest: digest, reviewReference: 'checked', state: { ...preserved(), tick: 0, players: [{ accountId: 1, supplies: -1, rewards: 0 }] } })).toBeTruthy()
  })
  it('accepts every whole original-domain phase including late participation and post-completion ticks', () => {
    let old = emptyState(), sequence = 0
    const append = (drafts: readonly EventDraft[]) => { old = applyEvents(old, drafts.map(draft => ({ ...draft, sequence: ++sequence }))) }
    const validate = () => expect(validatePreservedHarborState({ tick: old.tick, config: old.config,
      players: old.players.map(player => ({ accountId: Number(player.id), supplies: player.supplies, rewards: player.rewards })),
      contributors: old.contributors.map(Number), completed: old.completed, closesAtTick: old.closesAtTick,
      awardedAccountIds: old.awardedPlayerIds.map(Number) })).toBe(true)
    append(evaluateSystemCommand(old, { type: 'initialize', roster: positions.map(p => ({ id: String(p.accountId), name: String(p.accountId), x: p.x, z: p.z })) })); validate()
    for (let tick = 1; tick <= 5; tick++) { append(evaluateSystemCommand(old, { type: 'tick', tick })); validate() }
    for (const id of ids.slice(0,2)) { append(evaluateCommand(old, String(id), { commandId: 'contribute', type: 'contribute', payload: {} })); validate() }
    for (let tick = 6; tick <= 306; tick++) {
      append(evaluateSystemCommand(old, { type: 'tick', tick })); validate()
      if (tick === 304) { append(evaluateCommand(old, String(ids[2]), { commandId: 'late', type: 'contribute', payload: {} })); validate() }
    }
    expect(old.awardedPlayerIds).toEqual(ids.map(String))
  })
  it('requires manual review for impossible preserved phases instead of silently stranding terminal rewards', () => {
    const collecting: PreservedHarborState = { ...preserved(), contributors: ids.slice(0,2), closesAtTick: 310,
      players: ids.slice(0,2).map(id => ({ accountId: id, supplies: 0, rewards: 0 })) }
    expect(validatePreservedHarborState(collecting)).toBe(true)
    const completed: PreservedHarborState = { ...collecting, tick: 310, completed: true, awardedAccountIds: ids.slice(0,2),
      players: collecting.players.map(player => ({ ...player, rewards: 1 })) }
    expect(validatePreservedHarborState(completed)).toBe(true)
    for (const state of [
      { ...completed, tick: 309 },
      { ...completed, contributors: [ids[0]!], awardedAccountIds: [ids[0]!] },
      { ...completed, awardedAccountIds: [ids[0]!] },
      { ...completed, players: collecting.players },
      { ...collecting, tick: 310 },
      { ...collecting, contributors: [ids[0]!] },
      { ...collecting, awardedAccountIds: [ids[0]!] },
      { ...collecting, tick: 9 },
      { ...collecting, closesAtTick: null },
    ]) {
      expect(validatePreservedHarborState(state)).toBe(false)
      const command = reviewedHarborRestorationCommand({ namespace: 'synthetic-stage', sourceDigest: digest, reviewReference: 'verified-alias-proof', state, worldTick: 0, submittedAt: 0 })
      expect(engine.evaluate(command).accepted).toBe(false)
    }
  })
  it('requires safe integer quantities on both sides of contribution/reward facts', () => {
    const common = { beaconId: 'harbor-beacon-1', tileId: 't_dock', beaconTick: 1, movementStep: 1, accountId: 1 }
    const contribution = { ...common, kind: 'contributed', suppliesBefore: Number.MAX_SAFE_INTEGER, suppliesAfter: Number.MAX_SAFE_INTEGER - 1,
      rewardsBefore: Number.MAX_SAFE_INTEGER, clientCommandId: 'contribute', intentDigest: digest }
    const reward = { ...common, kind: 'rewarded', rewardsBefore: Number.MAX_SAFE_INTEGER - 1, rewardsAfter: Number.MAX_SAFE_INTEGER }
    expect(validateHarborBeaconEventData('PLAYER_HARBOR_CONTRIBUTED', contribution)).toBe(null)
    expect(validateHarborBeaconEventData('HARBOR_BEACON_REWARDED', reward)).toBe(null)
    for (const data of [ { ...contribution, suppliesBefore: Number.MAX_SAFE_INTEGER + 1 }, { ...contribution, suppliesAfter: Number.MAX_SAFE_INTEGER + 1 },
      { ...contribution, rewardsBefore: Number.MAX_SAFE_INTEGER + 1 } ]) expect(validateHarborBeaconEventData('PLAYER_HARBOR_CONTRIBUTED', data)).toBeTruthy()
    expect(validateHarborBeaconEventData('HARBOR_BEACON_REWARDED', { ...reward, rewardsBefore: Number.MAX_SAFE_INTEGER, rewardsAfter: Number.MAX_SAFE_INTEGER + 1 })).toBeTruthy()
    expect(validateHarborBeaconEventData('HARBOR_BEACON_REWARDED', { ...reward, rewardsBefore: -1, rewardsAfter: 0 })).toBeTruthy()
  })
})
describe('beacon one-world transaction/cadence integration', () => {
  it('queues two admitted contributors in one transaction and publishes one coherent open snapshot/receipt peraccount', async () => {
    const { fixture, service } = setup(), before = fixture.transactions, publish = vi.fn(); service.subscribe(publish)
    const commands = ids.slice(0,2).map(id => service.submit(id, { commandId: 'contribute', type: 'contribute', payload: {} }))
    service.advanceMovementStep(); const acks = await Promise.all(commands)
    expect(fixture.transactions - before).toBe(1); expect(publish).toHaveBeenCalledOnce()
    expect(service.snapshot(ids[0]!).beacon.phase).toBe('collecting'); expect(service.snapshot(ids[0]!).harborProgress).toEqual({ status: 'ready', supplies: 0, rewards: 0 })
    expect(acks.every(ack => ack.accepted)).toBe(true)
    const retry = service.submit(ids[1]!, { commandId: 'contribute', type: 'contribute', payload: {} }); service.advanceMovementStep()
    expect(await retry).toEqual({ ...acks[1], duplicate: true }); expect(fixture.events.filter(e => e.eventType === 'PLAYER_HARBOR_CONTRIBUTED')).toHaveLength(2)
  })
  it('durably reopens an active window with the exact remaining300-substep counter and awards disconnected contributors once', async () => {
    const { fixture, service, create } = setup(), pending = ids.slice(0,2).map(id => service.submit(id, { commandId: 'contribute', type: 'contribute', payload: {} }))
    service.advanceMovementStep(); await Promise.all(pending); for (let tick = 0; tick < 17; tick++) service.advanceMovementStep()
    const before = service.snapshot(ids[0]!), reopened = create(); reopened.setHarborProgressPolicy(policy)
    expect(reopened.snapshot(ids[0]!).beacon).toEqual(before.beacon)
    for (let tick = 17; tick < 300; tick++) reopened.advanceMovementStep()
    expect(reopened.snapshot(ids[0]!).beacon.completed).toBe(true); expect(reopened.snapshot(ids[1]!).harborProgress).toEqual({ status: 'ready', supplies: 0, rewards: 1 })
    expect(reopened.getAdmittedActors()).toEqual([]); expect(fixture.events.filter(e => e.eventType === 'HARBOR_BEACON_REWARDED')).toHaveLength(2)
    reopened.advanceMovementStep(); expect(fixture.events.filter(e => e.eventType === 'HARBOR_BEACON_REWARDED')).toHaveLength(2)
  })
  it('uses only the existing movement cadence for collection time, and bounds public policy reads once/account/cadence', async () => {
    const { service } = setup(), resolver = vi.fn(policy); service.setHarborProgressPolicy(resolver)
    service.snapshot(ids[0]!); service.snapshot(ids[1]!); service.snapshot(ids[0]!)
    expect(resolver).toHaveBeenCalledTimes(2)
    const pending = ids.slice(0,2).map(id => service.submit(id, { commandId: 'contribute', type: 'contribute', payload: {} }))
    service.advanceMovementStep(); await Promise.all(pending); const before = service.snapshot(ids[0]!).beacon.tick
    service.execute(ids[0]!, { commandId: 'chat-during-window', type: 'chat', payload: { text: 'same world' } })
    expect(service.snapshot(ids[0]!).beacon.tick).toBe(before)
    service.advanceMovementStep(); expect(service.snapshot(ids[0]!).beacon.tick).toBe(before + 1)
  })
  it('rolls back contribution/open together and rolls a failed collection tick back without false publication', async () => {
    const { fixture, service } = setup(), publish = vi.fn(); service.subscribe(publish); fixture.failCommit = true
    const pending = ids.slice(0,2).map(id => service.submit(id, { commandId: 'contribute', type: 'contribute', payload: {} }).catch(e => e))
    service.advanceMovementStep(); expect((await Promise.all(pending)).every(e => e.message === 'synthetic transaction failure')).toBe(true)
    expect(service.snapshot(ids[0]!).harborProgress).toEqual({ status: 'ready', supplies: 1, rewards: 0 }); expect(service.snapshot(ids[0]!).beacon.phase).toBe('gathering')
    fixture.failCommit = false; const accepted = ids.slice(0,2).map(id => service.submit(id, { commandId: 'contribute', type: 'contribute', payload: {} })); service.advanceMovementStep(); await Promise.all(accepted)
    const before = service.snapshot(ids[0]!).beacon; publish.mockClear(); fixture.failCommit = true
    service.advanceMovementStep(); expect(service.snapshot(ids[0]!).beacon).toEqual(before); expect(publish).not.toHaveBeenCalled()
  })
})
