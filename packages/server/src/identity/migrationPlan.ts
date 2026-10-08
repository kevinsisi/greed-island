import { accountId, normalizeLoginAlias, type AccountId, type AccountRole, type LoginAlias } from './principal.js'

export const LEGACY_PROGRESS_FIELDS = ['supplies', 'rewards', 'contributed', 'rewardClaimed', 'messages', 'position'] as const
export type LegacyProgressField = typeof LEGACY_PROGRESS_FIELDS[number]
export type ProgressDisposition = Readonly<{
  field: LegacyProgressField
  /** A reference to a reviewed canonical import rule; this planner does not execute it. */
  canonicalRule?: string
}>
export type CanonicalIdentityDescriptor = Readonly<{
  id: number
  role: AccountRole
  aliases: readonly LoginAlias[]
  /** Existing imported identities must carry their recorded source provenance. */
  legacySource?: Readonly<{ namespace: string; legacyId: string }>
}>
export type LegacyIdentityDescriptor = Readonly<{
  namespace: string
  legacyId: string
  username: string
  role: 'player' | 'admin'
  progress: readonly ProgressDisposition[]
}>
export type IdentityMapping = Readonly<{
  namespace: string
  legacyId: string
  accountId: AccountId
}>
export type MigrationBlocker = Readonly<{
  code: 'ALIAS_CONFLICT' | 'UNPROVEN_LEGACY_ADMIN' | 'OWNER_BOOTSTRAP_REQUIRED' | 'UNMAPPED_PROGRESS' | 'MISSING_MAPPING_TARGET' | 'MAPPING_PROVENANCE_CONFLICT'
  sourceKey?: string
  field?: LegacyProgressField
}>
export type PlannedIdentity = Readonly<{
  mapping: IdentityMapping
  action: 'create' | 'existing'
  role: AccountRole
  alias: LoginAlias
}>
export type IdentityMigrationPlan = Readonly<{
  /** Mandatory for every future unified/import repository adapter. */
  adminBootstrap: 'none'
  identities: readonly PlannedIdentity[]
  blockers: readonly MigrationBlocker[]
  readyForReviewedImport: boolean
}>

/** Dry-run descriptors only: no credentials, I/O, import, account merge or role promotion. */
export function planIdentityMigration(input: Readonly<{
  canonical: readonly CanonicalIdentityDescriptor[]
  legacy: readonly LegacyIdentityDescriptor[]
  previousMappings?: readonly IdentityMapping[]
}>): IdentityMigrationPlan {
  const canonical = new Map<AccountId, CanonicalIdentityDescriptor>()
  const existingSources = new Map<string, IdentityMapping>()
  const aliases = new Map<string, string>()
  const blockers: MigrationBlocker[] = []
  const identities: PlannedIdentity[] = []
  let nextId = 0
  for (const descriptor of [...input.canonical].sort((a, b) => a.id - b.id)) {
    const id = accountId(descriptor.id)
    if (canonical.has(id)) throw new Error('Duplicate canonical account ID.')
    if (!['player', 'gm', 'admin', 'agent'].includes(descriptor.role)) throw new Error('Invalid canonical role.')
    canonical.set(id, descriptor)
    if (descriptor.legacySource) {
      const key = sourceKey(descriptor.legacySource)
      if (existingSources.has(key)) throw new Error('Duplicate canonical source provenance.')
      existingSources.set(key, { ...descriptor.legacySource, accountId: id })
    }
    nextId = Math.max(nextId, id)
    for (const raw of descriptor.aliases) {
      const alias = normalizeLoginAlias(raw)
      const key = aliasKey(alias)
      const owner = `canonical:${id}`
      const previousOwner = aliases.get(key)
      if (previousOwner && previousOwner !== owner) blockers.push({ code: 'ALIAS_CONFLICT', sourceKey: owner })
      else aliases.set(key, owner)
    }
  }
  if (![...canonical.values()].some(item => item.role === 'admin')) blockers.push({ code: 'OWNER_BOOTSTRAP_REQUIRED' })

  const previous = new Map<string, IdentityMapping>()
  const mappedTargets = new Set<AccountId>()
  for (const mapping of input.previousMappings ?? []) {
    const key = sourceKey(mapping)
    const id = accountId(mapping.accountId)
    if (previous.has(key) || mappedTargets.has(id)) throw new Error('Duplicate or merging prior identity mapping.')
    previous.set(key, mapping)
    mappedTargets.add(id)
    nextId = Math.max(nextId, id)
  }
  const seen = new Set<string>()
  const sorted = [...input.legacy].sort((a, b) => compare(sourceKey(a), sourceKey(b)))
  for (const descriptor of sorted) {
    const key = sourceKey(descriptor)
    if (seen.has(key)) throw new Error('Duplicate legacy identity.')
    if (descriptor.role !== 'player' && descriptor.role !== 'admin') throw new Error('Invalid legacy role.')
    seen.add(key)
    const prior = previous.get(key) ?? existingSources.get(key)
    const id = prior ? accountId(prior.accountId) : accountId(++nextId)
    const target = prior ? canonical.get(id) : undefined
    if (prior && !target) blockers.push({ code: 'MISSING_MAPPING_TARGET', sourceKey: key })
    if (target && (!target.legacySource || sourceKey(target.legacySource) !== key)) blockers.push({ code: 'MAPPING_PROVENANCE_CONFLICT', sourceKey: key })
    const alias = normalizeLoginAlias({ kind: 'username', value: descriptor.username })
    const aliasOwner = aliases.get(aliasKey(alias))
    if (aliasOwner && aliasOwner !== `canonical:${id}`) blockers.push({ code: 'ALIAS_CONFLICT', sourceKey: key })
    else aliases.set(aliasKey(alias), `canonical:${id}`)
    if (descriptor.role === 'admin') blockers.push({ code: 'UNPROVEN_LEGACY_ADMIN', sourceKey: key })
    const dispositions = new Map<LegacyProgressField, ProgressDisposition>()
    for (const disposition of descriptor.progress) {
      if (!LEGACY_PROGRESS_FIELDS.includes(disposition.field) || dispositions.has(disposition.field)) throw new Error('Invalid or duplicate progress disposition.')
      dispositions.set(disposition.field, disposition)
    }
    for (const field of LEGACY_PROGRESS_FIELDS) {
      const rule = dispositions.get(field)?.canonicalRule
      if (typeof rule !== 'string' || rule.trim() === '') blockers.push({ code: 'UNMAPPED_PROGRESS', sourceKey: key, field })
    }
    identities.push({ mapping: { namespace: descriptor.namespace, legacyId: descriptor.legacyId, accountId: id }, action: prior ? 'existing' : 'create', role: target?.role ?? 'player', alias })
  }
  blockers.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)))
  return { adminBootstrap: 'none', identities, blockers, readyForReviewedImport: blockers.length === 0 }
}

function sourceKey(source: Readonly<{ namespace: string; legacyId: string }>): string {
  if (typeof source.namespace !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(source.namespace)
    || typeof source.legacyId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(source.legacyId)) throw new Error('Invalid namespaced legacy identity.')
  return JSON.stringify([source.namespace, source.legacyId])
}
function aliasKey(alias: LoginAlias): string { return JSON.stringify([alias.kind, alias.value]) }
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
