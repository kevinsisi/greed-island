import { describe, expect, it } from 'vitest'
import { accountId } from './principal.js'
import { LEGACY_PROGRESS_FIELDS, planIdentityMigration, type CanonicalIdentityDescriptor, type LegacyIdentityDescriptor } from './migrationPlan.js'

const owner: CanonicalIdentityDescriptor = { id: 10, role: 'admin', aliases: [{ kind: 'email', value: 'owner@example.test' }] }
function legacy(legacyId = 'player-a', patch: Partial<LegacyIdentityDescriptor> = {}): LegacyIdentityDescriptor {
  return { namespace: 'mp-l390', legacyId, username: legacyId, role: 'player', progress: [], ...patch }
}
const mappedProgress = LEGACY_PROGRESS_FIELDS.map(field => ({ field, canonicalRule: `reviewed-rule:${field}` }))

describe('pure identity migration dry-run', () => {
  it('preserves canonical IDs and makes import bootstrap suppression mandatory', () => {
    const input = { canonical: [owner], legacy: [legacy()] }
    const before = JSON.stringify(input)
    const plan = planIdentityMigration(input)
    expect(plan.adminBootstrap).toBe('none')
    expect(plan.identities[0]?.mapping.accountId).toBe(11)
    expect(plan.identities[0]?.role).toBe('player')
    expect(JSON.stringify(input)).toBe(before)
    expect(planIdentityMigration(input)).toEqual(plan)
  })
  it('allocates stable IDs regardless of descriptor ordering', () => {
    const a = legacy('player-b'), b = legacy('player-a')
    expect(planIdentityMigration({ canonical: [owner], legacy: [a, b] })).toEqual(planIdentityMigration({ canonical: [owner], legacy: [b, a] }))
  })
  it('never reuses deleted/historically referenced account IDs above active rows', () => {
    const plan = planIdentityMigration({ canonical: [owner], legacy: [legacy()], canonicalIdHighWaterMark: 100, canonicalReferencedAccountIds: [120] })
    expect(plan.identities[0]?.mapping.accountId).toBe(121)
    expect(() => planIdentityMigration({ canonical: [owner], legacy: [legacy()], canonicalIdHighWaterMark: -1 })).toThrow('high-water')
    expect(() => planIdentityMigration({ canonical: [owner], legacy: [legacy()], canonicalReferencedAccountIds: [Number.MAX_SAFE_INTEGER] })).toThrow('safe integer')
  })
  it('never merges by an email local part or similarly named username', () => {
    const plan = planIdentityMigration({ canonical: [owner], legacy: [legacy('player-a', { username: 'owner' })] })
    expect(plan.identities[0]?.mapping.accountId).toBe(11)
    expect(plan.identities[0]?.action).toBe('create')
  })
  it('blocks aliases that collide after normalization instead of renaming or merging', () => {
    const canonical = { ...owner, aliases: [{ kind: 'username' as const, value: 'Traveler' }] }
    const plan = planIdentityMigration({ canonical: [canonical], legacy: [legacy('player-a', { username: 'traveler' })] })
    expect(plan.blockers).toContainEqual({ code: 'ALIAS_CONFLICT', sourceKey: JSON.stringify(['mp-l390', 'player-a']) })
    expect(plan.readyForReviewedImport).toBe(false)
    expect(plan.identities[0]?.mapping.accountId).toBe(11)
  })
  it('does not trust a reserved username or legacy admin role', () => {
    const plan = planIdentityMigration({ canonical: [], legacy: [legacy('player-a', { username: 'kevin950805', role: 'admin', progress: mappedProgress })] })
    expect(plan.identities[0]?.role).toBe('player')
    expect(plan.blockers.map(b => b.code)).toEqual(expect.arrayContaining(['OWNER_BOOTSTRAP_REQUIRED', 'UNPROVEN_LEGACY_ADMIN']))
    expect(plan.readyForReviewedImport).toBe(false)
  })
  it('requires disposition for every progress field, including reward claims and positions', () => {
    const plan = planIdentityMigration({ canonical: [owner], legacy: [legacy()] })
    expect(plan.blockers.filter(b => b.code === 'UNMAPPED_PROGRESS').map(b => b.field).sort()).toEqual([...LEGACY_PROGRESS_FIELDS].sort())
    const ready = planIdentityMigration({ canonical: [owner], legacy: [legacy('player-a', { progress: mappedProgress })] })
    expect(ready.blockers).toEqual([])
    expect(ready.readyForReviewedImport).toBe(true)
  })
  it('reuses only an existing source-provenanced mapping without changing the canonical role', () => {
    const imported: CanonicalIdentityDescriptor = { id: 11, role: 'gm', aliases: [{ kind: 'username', value: 'player-a' }], legacySource: { namespace: 'mp-l390', legacyId: 'player-a' } }
    const mapping = { ...imported.legacySource!, accountId: accountId(11) }
    const plan = planIdentityMigration({ canonical: [owner, imported], legacy: [legacy('player-a', { progress: mappedProgress })], previousMappings: [mapping] })
    expect(plan.identities[0]).toMatchObject({ action: 'existing', role: 'gm', mapping })
    expect(plan.blockers).toEqual([])
  })
  it('blocks a prior mapping to an unrelated canonical account', () => {
    const plan = planIdentityMigration({ canonical: [owner], legacy: [legacy()], previousMappings: [{ namespace: 'mp-l390', legacyId: 'player-a', accountId: accountId(10) }] })
    expect(plan.blockers.map(b => b.code)).toContain('MAPPING_PROVENANCE_CONFLICT')
    expect(plan.readyForReviewedImport).toBe(false)
  })
  it('reuses existing recorded source provenance even when no separate previous map is supplied', () => {
    const imported: CanonicalIdentityDescriptor = { id: 11, role: 'player', aliases: [{ kind: 'username', value: 'player-a' }], legacySource: { namespace: 'mp-l390', legacyId: 'player-a' } }
    const plan = planIdentityMigration({ canonical: [owner, imported], legacy: [legacy('player-a', { progress: mappedProgress })] })
    expect(plan.identities[0]?.action).toBe('existing')
    expect(plan.identities[0]?.mapping.accountId).toBe(11)
    expect(plan.blockers).toEqual([])
  })
  it('blocks a prior mapping whose target no longer exists', () => {
    const plan = planIdentityMigration({ canonical: [owner], legacy: [legacy()], previousMappings: [{ namespace: 'mp-l390', legacyId: 'player-a', accountId: accountId(20) }] })
    expect(plan.blockers.map(b => b.code)).toContain('MISSING_MAPPING_TARGET')
  })
  it('rejects duplicate source identities and many-to-one prior mappings', () => {
    expect(() => planIdentityMigration({ canonical: [owner], legacy: [legacy(), legacy()] })).toThrow('Duplicate legacy')
    expect(() => planIdentityMigration({ canonical: [owner], legacy: [], previousMappings: [
      { namespace: 'mp-l390', legacyId: 'player-a', accountId: accountId(10) },
      { namespace: 'mp-l390', legacyId: 'player-b', accountId: accountId(10) },
    ] })).toThrow('merging prior')
  })
  it('uses namespaces and maps safely for arbitrary valid legacy IDs', () => {
    const plan = planIdentityMigration({ canonical: [owner], legacy: [legacy('__proto__'), legacy('__proto__', { namespace: 'mp-other', username: 'different' })] })
    expect(new Set(plan.identities.map(p => p.mapping.accountId)).size).toBe(2)
  })
})
