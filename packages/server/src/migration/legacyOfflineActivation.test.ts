import { describe, expect, it } from 'vitest'
import { validateOfflineActivationPolicy, type OfflineActivationPolicy } from './legacyOfflineActivation.js'
const policy = (): OfflineActivationPolicy => ({ version: 1, purpose: 'reviewed-offline-activation', namespace: 'synthetic-room', sourceDigest: 'a'.repeat(64), stagePlanDigest: 'b'.repeat(64), archiveDigest: 'c'.repeat(64), progressDigest: 'd'.repeat(64), expectedTargetFingerprint: 'e'.repeat(64), expectedPreservationSnapshot: 'f'.repeat(64), existingActiveAdminId: 1, reviewReference: 'synthetic-owner-reviewed-policy', identities: [{ legacyId: 'original-player', accountId: 2, disposition: 'enable-imported-player' }] })
describe('explicit offline activation policy', () => {
  it('takes a defensive snapshot without adding a role or selecting an owner', () => {
    const value = policy(), snapshot = validateOfflineActivationPolicy(value)
    expect(snapshot).toEqual(value); expect(snapshot).not.toBe(value)
    ;(value.identities[0] as { accountId: number }).accountId = 44
    expect(snapshot.identities[0]!.accountId).toBe(2)
    expect(Object.keys(snapshot)).not.toContain('role')
  })
  it.each([
    ['missing decisions', { identities: [] }],
    ['unknown version', { version: 2 }],
    ['automatic owner', { existingActiveAdminId: 0 }],
    ['missing review', { reviewReference: ' ' }],
    ['unbound source', { sourceDigest: '' }],
    ['unbound target', { expectedTargetFingerprint: 'f' }],
    ['implicit promotion', { identities: [{ legacyId: 'original-player', accountId: 2, disposition: 'make-admin' }] }],
    ['extra role authority', { role: 'admin' }],
    ['duplicate target', { identities: [{ legacyId: 'a', accountId: 2, disposition: 'keep-disabled' }, { legacyId: 'b', accountId: 2, disposition: 'keep-disabled' }] }],
    ['duplicate source', { identities: [{ legacyId: 'a', accountId: 2, disposition: 'keep-disabled' }, { legacyId: 'a', accountId: 3, disposition: 'keep-disabled' }] }],
  ])('rejects %s', (_name, change) => {
    expect(() => validateOfflineActivationPolicy({ ...policy(), ...change } as OfflineActivationPolicy)).toThrow('ACTIVATION_POLICY_INVALID')
  })
})

import { LivingWorldRuleEngine } from '../kernel/livingWorldCommands.js'
import { reviewedHarborRestorationCommand } from '../playerWorld/harborBeacon.js'
import { PLAYER_WORLD_RULESET } from '../playerWorld/types.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { validateOfflineHarborRestoration } from './legacyOfflineActivation.js'
import type { PreservedHarborState } from '../playerWorld/harborBeaconData.js'
import type { LegacyEventRow } from './legacyWorldSource.js'
function restorationFixture() {
  const state: PreservedHarborState = { tick: 0, config: { maxOnlinePlayers: 50, minParticipants: 2, participationWindowTicks: 300 }, players: [{ accountId: 2, supplies: 1, rewards: 0 }, { accountId: 3, supplies: 1, rewards: 0 }], contributors: [], completed: false, closesAtTick: null, awardedAccountIds: [] }
  const expected = { namespace: 'synthetic-room', sourceDigest: 'a'.repeat(64), state }
  const result = new LivingWorldRuleEngine().evaluate(reviewedHarborRestorationCommand({ ...expected, reviewReference: 'synthetic-progress-review', worldTick: 12, submittedAt: 13 }), { rulesetVersion: PLAYER_WORLD_RULESET })
  if (!result.accepted) throw new Error('Invalid synthetic restoration fixture')
  const event = result.events[0]!
  const row: LegacyEventRow = { sequence: 50, event_id: event.eventId, event_type: event.eventType, actor_id: event.actorId, command_id: event.commandId ?? null, tick: event.tick ?? null, ruleset_version: event.rulesetVersion ?? null, payload_json: toCanonicalJson(event.payload), version: event.version, deterministic_key: event.deterministicKey, occurred_at: event.occurredAt }
  return { row, expected }
}
describe('canonical offline restoration validation', () => {
  it('accepts the complete canonical command/rule/projection event', () => {
    const { row, expected } = restorationFixture(); expect(() => validateOfflineHarborRestoration(row, expected)).not.toThrow()
  })
  it.each([
    ['actor', { actor_id: 'unreviewed-actor' }], ['ruleset', { ruleset_version: 'wrong@1' }],
    ['event identity', { event_id: 'wrong' }], ['deterministic key', { deterministic_key: '0'.repeat(64) }],
    ['command receipt', { command_id: 'wrong' }], ['event version', { version: 2 }],
    ['world tick', { tick: 99 }], ['invalid sequence', { sequence: 0 }], ['invalid audit time', { occurred_at: -1 }],
  ])('rejects malformed %s metadata', (_name, change) => {
    const { row, expected } = restorationFixture(); expect(() => validateOfflineHarborRestoration({ ...row, ...change }, expected)).toThrow()
  })
  it.each([
    ['kind', 'contributed'], ['beaconId', 'other-beacon'], ['tileId', 't_central'],
    ['beaconTick', 1], ['movementStep', -2], ['movementStep', 0],
  ])('rejects malformed canonical %s data', (field, value) => {
    const { row, expected } = restorationFixture(), payload = JSON.parse(row.payload_json) as { data: Record<string, unknown> }
    payload.data[field] = value
    expect(() => validateOfflineHarborRestoration({ ...row, payload_json: toCanonicalJson(payload) }, expected)).toThrow()
  })
  it('rejects a payload actorType mismatch even when the projection accepts the data', () => {
    const { row, expected } = restorationFixture(), payload = JSON.parse(row.payload_json) as { actorType: string }
    payload.actorType = 'player'
    expect(() => validateOfflineHarborRestoration({ ...row, payload_json: toCanonicalJson(payload) }, expected)).toThrow('METADATA_INVALID')
  })
})
