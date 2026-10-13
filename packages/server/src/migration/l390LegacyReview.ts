import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { normalizeLoginAlias } from '../identity/principal.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { digest, readLegacyWorldSourceFiles, type LegacySourceManifest, type LegacyWorldSource } from './legacyWorldSource.js'
import { readCanonicalStageState } from './legacyWorldImport.js'
import { planLegacyWorldStage, type CanonicalStageState, type LegacyWorldStagePlan, type ReviewedIdentityLink, type StageOwnerSelection } from './legacyWorldPlan.js'

const PROGRESS_DISPOSITIONS = {
  supplies: 'exact-private-archive',
  rewards: 'exact-private-archive',
  contributed: 'exact-private-archive',
  rewardClaimed: 'exact-private-archive',
  messages: 'exact-private-archive',
  position: 'exact-private-archive',
} as const
const PROGRESS_FIELDS = Object.keys(PROGRESS_DISPOSITIONS) as Array<keyof typeof PROGRESS_DISPOSITIONS>
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

export type LegacyMappingDigestDocument = Readonly<{
  version: 1
  namespace: string
  mappings: readonly Readonly<{
    legacyId: string
    canonicalAccountId: number
    action: 'create-disabled-player' | 'preserve-existing'
    normalizedUsername: string
    sourceRoleClaim: 'admin' | 'player'
    reviewedLinkReference: string | null
    credentialDisposition: 'keep-canonical' | null
  }>[]
}>

export type LegacyProgressDigestDocument = Readonly<{
  version: 1
  sourceDigest: string
  mappingDigest: string
  tick: number
  players: readonly Readonly<{
    legacyId: string
    canonicalAccountId: number | null
    name: string
    position: Readonly<{ x: number; z: number }>
    supplies: number
    rewards: number
    contributed: boolean
    rewardClaimed: boolean
    dispositionByField: Readonly<typeof PROGRESS_DISPOSITIONS>
  }>[]
  room: Readonly<{
    config: LegacyWorldSource['roomState']['config']
    completed: boolean
    closesAtTick: number | null
    messages: LegacyWorldSource['roomState']['messages']
    dispositionByField: Readonly<typeof PROGRESS_DISPOSITIONS>
  }>
}>

export type L390LegacyReviewInput = Readonly<{
  sourceDirectory: string
  namespace: string
  canonicalDatabasePath: string
  reviewedLinks?: readonly ReviewedIdentityLink[]
  ownerSelection?: StageOwnerSelection
}>

type LoadedInputs = Readonly<{ source: LegacyWorldSource; target: CanonicalStageState }>

/** Canonical source and target inspection; both SQLite connections are read-only. */
function withL390LegacyInputs<T>(input: L390LegacyReviewInput, callback: (loaded: LoadedInputs) => T): T {
  if (!input.sourceDirectory.trim() || !input.canonicalDatabasePath.trim()) throw new Error('SOURCE_AND_CANONICAL_PATH_REQUIRED')
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.namespace)) throw new Error('INVALID_NAMESPACE')
  const source = readLegacyWorldSourceFiles({
    accountsPath: `${input.sourceDirectory}/accounts.json`,
    roomPath: `${input.sourceDirectory}/room.sqlite`,
    namespace: input.namespace,
  })
  let canonical: Database.Database | undefined
  try {
    canonical = new Database(input.canonicalDatabasePath, { readonly: true, fileMustExist: true })
    const target = readCanonicalStageState(canonical)
    return callback({ source, target })
  } finally {
    canonical?.close()
    source.close?.()
  }
}

export function buildLegacyMappingDigestDocument(source: LegacyWorldSource, plan: LegacyWorldStagePlan): LegacyMappingDigestDocument {
  const mappings = plan.identities.map(identity => ({
    legacyId: identity.legacyId,
    canonicalAccountId: identity.accountId,
    action: identity.action,
    normalizedUsername: normalizeLoginAlias({ kind: 'username', value: identity.username }).value,
    sourceRoleClaim: identity.sourceRoleClaim,
    reviewedLinkReference: identity.reviewReference ?? null,
    credentialDisposition: identity.credentialDisposition ?? null,
  })).sort((a, b) => compareIds(a.legacyId, b.legacyId))
  return { version: 1, namespace: source.manifest.namespace, mappings }
}

export function hashLegacyMappingDocument(document: LegacyMappingDigestDocument): string {
  if (document.version !== 1 || !/^[A-Za-z0-9_-]{1,100}$/.test(document.namespace) || !Array.isArray(document.mappings)) {
    throw new Error('MAPPING_DOCUMENT_INVALID')
  }
  const seen = new Set<string>()
  for (const mapping of document.mappings) {
    if (!mapping || typeof mapping.legacyId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(mapping.legacyId)
      || seen.has(mapping.legacyId) || !Number.isSafeInteger(mapping.canonicalAccountId) || mapping.canonicalAccountId <= 0
      || !['create-disabled-player', 'preserve-existing'].includes(mapping.action)
      || typeof mapping.normalizedUsername !== 'string' || !mapping.normalizedUsername
      || !['admin', 'player'].includes(mapping.sourceRoleClaim)
      || mapping.reviewedLinkReference !== null && typeof mapping.reviewedLinkReference !== 'string'
      || mapping.credentialDisposition !== null && mapping.credentialDisposition !== 'keep-canonical') {
      throw new Error('MAPPING_DOCUMENT_INVALID')
    }
    seen.add(mapping.legacyId)
  }
  const normalized = { ...document, mappings: [...document.mappings].sort((a, b) => compareIds(a.legacyId, b.legacyId)) }
  return digest(toCanonicalJson(normalized))
}

export function buildLegacyProgressDigestDocument(
  source: LegacyWorldSource,
  mappingDigest: string,
  plan: LegacyWorldStagePlan,
): LegacyProgressDigestDocument {
  const canonicalIds = new Map(plan.identities.map(identity => [identity.legacyId, identity.accountId]))
  const players = source.roomState.players.map(player => ({
    legacyId: player.id,
    canonicalAccountId: canonicalIds.get(player.id) ?? null,
    name: player.name,
    position: { x: player.x, z: player.z },
    supplies: player.supplies,
    rewards: player.rewards,
    contributed: source.roomState.contributors.includes(player.id),
    rewardClaimed: source.roomState.awardedPlayerIds.includes(player.id),
    dispositionByField: { ...PROGRESS_DISPOSITIONS },
  })).sort((a, b) => compareIds(a.legacyId, b.legacyId))
  return {
    version: 1,
    sourceDigest: source.manifest.sourceDigest,
    mappingDigest,
    tick: source.roomState.tick,
    players,
    room: {
      config: structuredClone(source.roomState.config),
      completed: source.roomState.completed,
      closesAtTick: source.roomState.closesAtTick,
      messages: structuredClone(source.roomState.messages),
      dispositionByField: { ...PROGRESS_DISPOSITIONS },
    },
  }
}

export function hashLegacyProgressDocument(document: LegacyProgressDigestDocument): string {
  if (!document || document.version !== 1 || !isSha256(document.sourceDigest) || !isSha256(document.mappingDigest)
    || !Number.isSafeInteger(document.tick) || document.tick < 0 || !Array.isArray(document.players)
    || !document.room || typeof document.room.completed !== 'boolean'
    || document.room.closesAtTick !== null && (!Number.isSafeInteger(document.room.closesAtTick) || document.room.closesAtTick < 0)
    || !document.room.config || !Number.isSafeInteger(document.room.config.maxOnlinePlayers)
    || !Number.isSafeInteger(document.room.config.minParticipants)
    || !Number.isSafeInteger(document.room.config.participationWindowTicks)
    || !Array.isArray(document.room.messages)) throw new Error('PROGRESS_DOCUMENT_INVALID')

  const seen = new Set<string>()
  for (const player of document.players) {
    if (!player || typeof player.legacyId !== 'string' || !player.legacyId || seen.has(player.legacyId)
      || player.canonicalAccountId !== null && (!Number.isSafeInteger(player.canonicalAccountId) || player.canonicalAccountId <= 0)
      || typeof player.name !== 'string' || !player.name
      || !player.position || !Number.isFinite(player.position.x) || !Number.isFinite(player.position.z)
      || !Number.isSafeInteger(player.supplies) || player.supplies < 0 || !Number.isSafeInteger(player.rewards) || player.rewards < 0
      || typeof player.contributed !== 'boolean' || typeof player.rewardClaimed !== 'boolean'
      || !hasExactProgressDispositions(player.dispositionByField)) throw new Error('PROGRESS_DOCUMENT_INVALID')
    seen.add(player.legacyId)
  }
  if (!hasExactProgressDispositions(document.room.dispositionByField)) throw new Error('PROGRESS_DOCUMENT_INVALID')
  for (const message of document.room.messages) {
    if (!message || typeof message.id !== 'string' || typeof message.playerId !== 'string' || typeof message.name !== 'string'
      || typeof message.text !== 'string' || !Number.isSafeInteger(message.tick) || message.tick < 0) {
      throw new Error('PROGRESS_DOCUMENT_INVALID')
    }
  }
  const normalized = { ...document, players: [...document.players].sort((a, b) => compareIds(a.legacyId, b.legacyId)) }
  return createHash('sha256').update(toCanonicalJson(normalized), 'utf8').digest('hex')
}

export function inspectL390LegacySource(input: L390LegacyReviewInput) {
  return withL390LegacyInputs(input, ({ source, target }) => ({
    version: 1,
    mode: 'inspect' as const,
    source: safeManifestSummary(source.manifest),
    sourceRoles: countRoles(source.accounts.map(account => account.role)),
    roomPlayers: source.roomState.players.length,
    canonicalTarget: {
      accountCount: target.accounts.length,
      roles: countRoles(target.accounts.map(account => account.role)),
      accountIdHighWaterMark: target.accountIdHighWaterMark,
      eventLastSequence: target.eventLastSequence,
      fingerprint: target.fingerprint,
    },
  }))
}

export function planL390LegacyImport(input: L390LegacyReviewInput) {
  return withL390LegacyInputs(input, ({ source, target }) => {
    const plan = planLegacyWorldStage({
      source,
      target,
      ...(input.reviewedLinks ? { reviewedLinks: input.reviewedLinks } : {}),
      ...(input.ownerSelection ? { ownerSelection: input.ownerSelection } : {}),
    })
    const mappingDocument = buildLegacyMappingDigestDocument(source, plan)
    const mappingDigest = hashLegacyMappingDocument(mappingDocument)
    const progressDocument = buildLegacyProgressDigestDocument(source, mappingDigest, plan)
    const progressPreservationDigest = hashLegacyProgressDocument(progressDocument)
    const actionCounts = countValues(plan.identities.map(identity => identity.action))
    const blockerCounts = countValues(plan.blockers.map(blocker => blocker.code))
    const supplies = source.roomState.players.map(player => player.supplies)
    const rewards = source.roomState.players.map(player => player.rewards)
    return {
      version: 1,
      mode: 'dry-run' as const,
      source: safeManifestSummary(source.manifest),
      canonicalTarget: {
        accountCount: target.accounts.length,
        accountIdHighWaterMark: target.accountIdHighWaterMark,
        eventLastSequence: target.eventLastSequence,
        fingerprint: target.fingerprint,
      },
      identities: {
        sourceAccountCount: source.accounts.length,
        plannedMappingCount: mappingDocument.mappings.length,
        byAction: actionCounts,
        sourceRoleClaims: countRoles(source.accounts.map(account => account.role)),
      },
      progress: {
        roomPlayers: { count: source.roomState.players.length },
        supplies: { count: supplies.length, sum: sum(supplies) },
        rewards: { count: rewards.length, sum: sum(rewards) },
      },
      mappingDigest,
      progressPreservationDigest,
      plan: {
        canStage: plan.canStage,
        blockers: blockerCounts,
        activationBlockers: [...plan.activationBlockers],
        ownerSelectionProvided: input.ownerSelection !== undefined,
        importedAccountsCanLogin: false,
        productionActivation: false,
        progressDisposition: 'exact-private-archive-unmapped',
      },
    }
  })
}

function safeManifestSummary(manifest: LegacySourceManifest) {
  return {
    version: manifest.version,
    namespace: manifest.namespace,
    accountsSha256: manifest.accountsSha256,
    eventRowsSha256: manifest.eventRowsSha256,
    sourceDigest: manifest.sourceDigest,
    accountCount: manifest.accountCount,
    eventCount: manifest.eventCount,
    firstSequence: manifest.firstSequence,
    lastSequence: manifest.lastSequence,
    projectedStateSha256: manifest.projectedStateSha256,
    unmappedRosterCount: manifest.unmappedRosterIds.length,
    acceptedSourceEventTypes: [...manifest.acceptedSourceEventTypes],
  }
}

function hasExactProgressDispositions(value: unknown): value is typeof PROGRESS_DISPOSITIONS {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return PROGRESS_FIELDS.every(field => record[field] === 'exact-private-archive')
}
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) }
function countRoles(roles: readonly string[]): Record<string, number> { return countValues(roles) }
function countValues(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => compareIds(a, b)))
}
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) }
