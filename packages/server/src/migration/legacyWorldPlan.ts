import { accountId, normalizeLoginAlias, type AccountId, type AccountRole } from '../identity/principal.js'
import { passwordScheme } from '../identity/passwordEncoding.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { validateStoredAccounts } from '../multiplayer/accounts.js'
import { digest, type LegacySourceManifest, type LegacyWorldSource } from './legacyWorldSource.js'

export type CanonicalStageAccount = Readonly<{
  id: number; role: AccountRole; status: 'active' | 'disabled'; passwordHash: string
  aliases: readonly Readonly<{ kind: 'username' | 'email'; normalized: string; displayValue: string }>[]
  source?: Readonly<{ namespace: string; legacyId: string }>
}>
export type CanonicalStageState = Readonly<{ accounts: readonly CanonicalStageAccount[]; accountIdHighWaterMark: number; eventLastSequence: number; fingerprint: string }>
export type ReviewedIdentityLink = Readonly<{ namespace: string; legacyId: string; accountId: AccountId; reviewReference: string; credentialDisposition: 'keep-canonical' }>
export type StageIdentity = Readonly<{ namespace: string; legacyId: string; accountId: AccountId; action: 'create-disabled-player' | 'preserve-existing'; username: string; sourceRoleClaim: 'admin' | 'player'; reviewReference?: string; credentialDisposition?: 'keep-canonical' }>
export type StageBlocker = Readonly<{ code: string; legacyId?: string }>
export type StageOwnerSelection = Readonly<{ accountId: AccountId; namespace: string; legacyId: string; verifiedByOperator: true; reviewReference: string }>
export type LegacyWorldStagePlan = Readonly<{
  version: 1; mode: 'private-staged-archive'; source: LegacySourceManifest; targetFingerprint: string; accountIdHighWaterMark: number
  identities: readonly StageIdentity[]; blockers: readonly StageBlocker[]; planDigest: string; canStage: boolean
  ownerSelection: StageOwnerSelection | null; importedAccountsCanLogin: false; productionActivation: false
  progressDisposition: 'exact-private-archive-unmapped'; activationBlockers: readonly string[]
}>
export function canonicalStageFingerprint(accounts: readonly CanonicalStageAccount[], highWater: number, eventLastSequence: number): string {
  return digest(toCanonicalJson({ accounts, highWater, eventLastSequence }))
}
/** No credentials printed, no mutation, no guessed identity/admin/currency/item/NPC mapping. */
export function planLegacyWorldStage(input: { source: LegacyWorldSource; target: CanonicalStageState; reviewedLinks?: readonly ReviewedIdentityLink[]; ownerSelection?: StageOwnerSelection }): LegacyWorldStagePlan {
  const { source, target } = input, blockers: StageBlocker[] = [], identities: StageIdentity[] = [], canonical = new Map(target.accounts.map(account => [accountId(account.id), account]))
  let nextId = target.accountIdHighWaterMark
  if (!Number.isSafeInteger(nextId) || nextId < 0 || target.accounts.some(account => account.id > nextId)) throw new Error('Invalid canonical identity high-water mark.')
  const aliases = new Map<string, AccountId>(), sources = new Map<string, AccountId>(), targets = new Set<AccountId>()
  for (const account of target.accounts) {
    for (const alias of account.aliases) aliases.set(JSON.stringify([alias.kind, alias.normalized]), accountId(account.id))
    if (account.source) sources.set(JSON.stringify([account.source.namespace, account.source.legacyId]), accountId(account.id))
  }
  const reviewed = new Map<string, ReviewedIdentityLink>()
  for (const link of input.reviewedLinks ?? []) {
    const key = JSON.stringify([link.namespace, link.legacyId])
    if (!link.reviewReference.trim() || link.credentialDisposition !== 'keep-canonical' || reviewed.has(key)) throw new Error('Invalid reviewed identity link.')
    reviewed.set(key, link)
  }
  for (const account of validateStoredAccounts(JSON.parse(source.rawAccountsJson)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const key = JSON.stringify([source.manifest.namespace, account.id]), previous = sources.get(key), link = reviewed.get(key)
    const existingId = previous ?? link?.accountId, existing = existingId ? canonical.get(accountId(existingId)) : undefined
    if (existingId && !existing) blockers.push({ code: 'MISSING_MAPPING_TARGET', legacyId: account.id })
    if (previous && link && previous !== link.accountId) blockers.push({ code: 'PROVENANCE_CONFLICT', legacyId: account.id })
    if (existing?.source && JSON.stringify([existing.source.namespace, existing.source.legacyId]) !== key) blockers.push({ code: 'PROVENANCE_CONFLICT', legacyId: account.id })
    const id = existingId ? accountId(existingId) : accountId(++nextId), alias = normalizeLoginAlias({ kind: 'username', value: account.username })
    if (targets.has(id)) blockers.push({ code: 'IDENTITY_MERGE_UNREVIEWED', legacyId: account.id }); targets.add(id)
    const aliasOwner = aliases.get(JSON.stringify(['username', alias.value]))
    if (aliasOwner && aliasOwner !== id) blockers.push({ code: 'ALIAS_CONFLICT', legacyId: account.id })
    const existingUsername = existing?.aliases.find(item => item.kind === 'username')
    if (existingUsername && existingUsername.normalized !== alias.value) blockers.push({ code: 'USERNAME_ALIAS_SLOT_CONFLICT', legacyId: account.id })
    if (passwordScheme(account.passwordHash) !== 'legacy-mp-scrypt-v1') blockers.push({ code: 'PASSWORD_SCHEME_UNSUPPORTED', legacyId: account.id })
    aliases.set(JSON.stringify(['username', alias.value]), id)
    identities.push({ namespace: source.manifest.namespace, legacyId: account.id, accountId: id,
      action: existing ? 'preserve-existing' : 'create-disabled-player', username: account.username, sourceRoleClaim: account.role,
      ...(link && !previous ? { reviewReference: link.reviewReference, credentialDisposition: link.credentialDisposition } : {}) })
  }
  const owner = input.ownerSelection ?? null
  if (owner && (!owner.reviewReference.trim() || owner.verifiedByOperator !== true || !identities.some(item => item.accountId === owner.accountId
    && item.namespace === owner.namespace && item.legacyId === owner.legacyId))) blockers.push({ code: 'OWNER_SELECTION_CONFLICT' })
  const descriptor = { version: 1 as const, mode: 'private-staged-archive' as const, source: source.manifest, targetFingerprint: target.fingerprint,
    accountIdHighWaterMark: target.accountIdHighWaterMark, identities, blockers, canStage: blockers.length === 0,
    ownerSelection: owner, importedAccountsCanLogin: false as const, productionActivation: false as const,
    progressDisposition: 'exact-private-archive-unmapped' as const,
    activationBlockers: [owner ? 'OWNER_PRIVILEGE_ACTIVATION_REQUIRES_SEPARATE_REVIEW' : 'OWNER_SELECTION_REQUIRED', 'LEGACY_GAMEPLAY_SEMANTICS_UNMAPPED', ...(source.manifest.unmappedRosterIds.length ? ['UNMAPPED_ROSTER_ACTORS_REVIEW_REQUIRED'] : []), 'LIVE_CUTOVER_NOT_AUTHORIZED'] }
  return { ...descriptor, planDigest: digest(toCanonicalJson(descriptor)) }
}
/** Safe human-readable report excludes password hashes and raw private event payloads. */
export function legacyWorldStageReport(plan: LegacyWorldStagePlan) {
  return { version: plan.version, mode: plan.mode, sourceDigest: plan.source.sourceDigest, accountsSha256: plan.source.accountsSha256,
    eventRowsSha256: plan.source.eventRowsSha256, accountCount: plan.source.accountCount, eventCount: plan.source.eventCount,
    unmappedRosterIds: [...plan.source.unmappedRosterIds], accountIdHighWaterMark: plan.accountIdHighWaterMark,
    identities: plan.identities.map(identity => ({ ...identity })), blockers: plan.blockers.map(blocker => ({ ...blocker })),
    planDigest: plan.planDigest, canStage: plan.canStage, importedAccountsCanLogin: false, productionActivation: false,
    progressDisposition: plan.progressDisposition, activationBlockers: [...plan.activationBlockers], ownerSelection: plan.ownerSelection }
}
