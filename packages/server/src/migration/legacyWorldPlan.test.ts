import { describe, expect, it } from 'vitest'
import { accountId } from '../identity/principal.js'
import { inspectLegacyWorldSource } from './legacyWorldSource.js'
import { canonicalStageFingerprint, legacyWorldStageReport, planLegacyWorldStage, type CanonicalStageState } from './legacyWorldPlan.js'
import { syntheticLegacySourceFixture } from './legacyWorld.testSupport.js'
import { evaluateLegacyArchiveCommand, LEGACY_ARCHIVE_ACTOR } from './legacyWorldRules.js'

function source() { const fixture = syntheticLegacySourceFixture(); return inspectLegacyWorldSource(fixture.rawAccountsJson, 'synthetic-l390', () => fixture.rows) }
function target(): CanonicalStageState { const accounts = [{ id: 7, role: 'admin' as const, status: 'active' as const,
  passwordHash: 'scrypt-v1:' + '0'.repeat(32) + ':' + '0'.repeat(64), aliases: [{ kind: 'email' as const, normalized: 'owner@example.test', displayValue: 'owner@example.test' }] }]
  return { accounts, accountIdHighWaterMark: 150, eventLastSequence: 20, fingerprint: canonicalStageFingerprint(accounts, 150, 20) } }
describe('source-only legacy world preservation dry run', () => {
  it('retains exact complete beacon/progress and raw source events without inventing mappings', () => {
    const value = source(); expect(value.roomState.completed).toBe(true); expect(value.roomState.players.map(player => [player.supplies, player.rewards])).toEqual([[0, 1], [0, 1]])
    expect(value.roomState.awardedPlayerIds).toEqual(['legacy-owner', 'legacy-player']); expect(value.manifest.eventCount).toBe(307)
    expect(value.manifest.unmappedRosterIds).toEqual([])
  })
  it('reserves IDs above the canonical history high-water and never grants admin by username/legacy claim', () => {
    const plan = planLegacyWorldStage({ source: source(), target: target() })
    expect(plan.canStage).toBe(true); expect(plan.identities.map(identity => identity.accountId)).toEqual([151, 152])
    expect(plan.identities[0]).toMatchObject({ username: 'kevin950805', sourceRoleClaim: 'admin', action: 'create-disabled-player' })
    expect(plan.importedAccountsCanLogin).toBe(false); expect(plan.productionActivation).toBe(false)
    expect(plan.activationBlockers).toContain('OWNER_SELECTION_REQUIRED'); expect(plan.progressDisposition).toBe('exact-private-archive-unmapped')
  })
  it('reports alias conflicts without silent merge or credential overwrite', () => {
    const destination = target(); const accounts = [{ ...destination.accounts[0]!, aliases: [{ kind: 'username' as const, normalized: 'kevin950805', displayValue: 'kevin950805' }] }]
    const plan = planLegacyWorldStage({ source: source(), target: { ...destination, accounts } })
    expect(plan.canStage).toBe(false); expect(plan.blockers).toContainEqual({ code: 'ALIAS_CONFLICT', legacyId: 'legacy-owner' })
  })
  it('allows an explicitly reviewed provenance link while preserving the existing canonical role/credential', () => {
    const plan = planLegacyWorldStage({ source: source(), target: target(), reviewedLinks: [{ namespace: 'synthetic-l390', legacyId: 'legacy-owner', accountId: accountId(7),
      reviewReference: 'synthetic-operator-choice', credentialDisposition: 'keep-canonical' }] })
    expect(plan.canStage).toBe(true); expect(plan.identities[0]).toMatchObject({ accountId: 7, action: 'preserve-existing' })
    expect(plan.importedAccountsCanLogin).toBe(false); expect(plan.productionActivation).toBe(false)
  })
  it('owner selection must identify reviewed numeric ID/provenance and still cannot activate privileges', () => {
    const selection = { accountId: accountId(151), namespace: 'synthetic-l390', legacyId: 'legacy-owner', verifiedByOperator: true as const, reviewReference: 'synthetic-only-proof' }
    const plan = planLegacyWorldStage({ source: source(), target: target(), ownerSelection: selection })
    expect(plan.canStage).toBe(true); expect(plan.activationBlockers).toContain('OWNER_PRIVILEGE_ACTIVATION_REQUIRES_SEPARATE_REVIEW'); expect(plan.productionActivation).toBe(false)
    expect(planLegacyWorldStage({ source: source(), target: target(), ownerSelection: { ...selection, accountId: accountId(999) } }).canStage).toBe(false)
  })
  it('safe reports never include credential hashes or raw chat/history payloads', () => {
    const value = source(), report = JSON.stringify(legacyWorldStageReport(planLegacyWorldStage({ source: value, target: target() })))
    expect(report).not.toContain(value.accounts[0]!.passwordHash); expect(report).not.toContain('passwordHash'); expect(report).not.toContain('payload_json')
    expect(report).toContain(value.manifest.sourceDigest)
  })
  it('rejects empty/refilled, unsupported or corrupt source history', () => {
    const fixture = syntheticLegacySourceFixture(false)
    expect(() => inspectLegacyWorldSource(fixture.rawAccountsJson, 'synthetic-l390', () => [])).toThrow('refill')
    expect(() => inspectLegacyWorldSource(fixture.rawAccountsJson, 'synthetic-l390', () => [{ ...fixture.rows[0]!, event_type: 'UNKNOWN' }])).toThrow('unsupported')
    expect(() => inspectLegacyWorldSource(fixture.rawAccountsJson, 'synthetic-l390', () => [fixture.rows[0]!, fixture.rows[0]!])).toThrow('unsupported')
  })
  it('keeps namespace-only roster actors archived and blocks activation until their identity disposition is reviewed', () => {
    const fixture = syntheticLegacySourceFixture(), records = JSON.parse(fixture.rawAccountsJson)
    const value = inspectLegacyWorldSource(JSON.stringify(records.slice(0, 1)), 'synthetic-l390', () => fixture.rows)
    expect(value.manifest.unmappedRosterIds).toEqual(['legacy-player'])
    const plan = planLegacyWorldStage({ source: value, target: target() })
    expect(plan.canStage).toBe(true); expect(plan.identities).toHaveLength(1)
    expect(plan.activationBlockers).toContain('UNMAPPED_ROSTER_ACTORS_REVIEW_REQUIRED')
  })
  it('private archive event identity is deterministic and excludes wall time, with no role/gameplay mutation', () => {
    const command = { commandId: 'archive', commandType: 'PRESERVE_LEGACY_WORLD_PRIVATE', actorId: LEGACY_ARCHIVE_ACTOR, submittedAt: 0,
      payload: { namespace: 'synthetic-l390', sourceDigest: 'a'.repeat(64), planDigest: 'b'.repeat(64), kind: 'exact-progress' as const, batchIndex: 0, data: { stateJson: '{}' } } }
    const one = evaluateLegacyArchiveCommand(command), two = evaluateLegacyArchiveCommand({ ...command, submittedAt: 100 })
    expect(one.eventId).toBe(two.eventId); expect(one).not.toHaveProperty('tick'); expect(one.payload).not.toHaveProperty('passwordHash')
  })
})
