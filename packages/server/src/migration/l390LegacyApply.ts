import Database from 'better-sqlite3'
import { existsSync, lstatSync, openSync, statSync, closeSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeLoginAlias } from '../identity/principal.js'
import { assertAccountAllocatorReady, reserveCanonicalAccountIds } from '../identity/accountIdAuthority.js'
import { assertUnifiedDatabaseReady } from '../bootstrap/unifiedServer.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { readLegacyWorldSourceFiles, type LegacyEventRow, type LegacyWorldSource } from './legacyWorldSource.js'
import { readCanonicalStageState } from './legacyWorldImport.js'
import { planLegacyWorldStage, type LegacyWorldStagePlan } from './legacyWorldPlan.js'
import { evaluateLegacyArchiveCommand, LEGACY_ARCHIVE_ACTOR, LEGACY_ARCHIVE_EVENT_TYPE, LEGACY_ARCHIVE_RULESET } from './legacyWorldRules.js'
import {
  buildLegacyMappingDigestDocument,
  buildLegacyProgressDigestDocument,
  createCanonicalSchemaFixture,
  hashLegacyMappingDocument,
  hashLegacyProgressDocument,
  summarizeLegacySourceManifest,
  type LegacyMappingDigestDocument,
  type LegacyProgressDigestDocument,
} from './l390LegacyReview.js'

const L390_EXPECTED_PROGRESS = { roomPlayers: 54, suppliesRows: 54, suppliesSum: 4, rewardsRows: 50, rewardsSum: 50 } as const
const SHA256 = /^[a-f0-9]{64}$/
const VOLUME_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/

export type L390ReviewPlan = ReturnType<typeof import('./l390LegacyReview.js')['planL390LegacyImport']>
export type L390ApplyInput = Readonly<{
  sourceDirectory: string
  namespace: string
  canonicalPath: string
  reviewPlan: unknown
  activateAccounts: boolean
  ownerLegacyId: string
}>
export type L390VerifyInput = Readonly<{
  sourceDirectory: string
  namespace: string
  canonicalPath: string
  reviewPlan: unknown
  canonicalVolume: string
  legacyVolumes: readonly string[]
}>

type ArchiveData = Readonly<{
  stateJson: string
  canonicalMappings: readonly Readonly<{ namespace: string; legacyId: string; accountId: number }>[]
  sourceRoleClaims: readonly Readonly<{ legacyId: string; roleClaim: 'admin' | 'player' }>[]
  disposition: 'private-exact-unmapped'
  activationReady: false
  mappingDocument: LegacyMappingDigestDocument
  progressDocument: LegacyProgressDigestDocument
  mappingDigest: string
  progressPreservationDigest: string
  stagePlanDigest: string
  baselineTargetFingerprint: string
  activation: Readonly<{ activateAccounts: true; ownerLegacyId: string }>
}>
type ArchiveRow = LegacyEventRow & Readonly<{ event_id: string; event_type: string; actor_id: string; command_id: string | null; ruleset_version: string | null; payload_json: string; version: number; deterministic_key: string }>

function fail(code: string): never { throw new Error(code) }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function countRoles(roles: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const role of roles) result[role] = (result[role] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}
function aggregateProgress(source: LegacyWorldSource) {
  const players = source.roomState.players
  return {
    roomPlayers: players.length,
    suppliesRows: players.length,
    suppliesSum: players.reduce((total, player) => total + player.supplies, 0),
    rewardsRows: source.roomState.awardedPlayerIds.length,
    rewardsSum: players.reduce((total, player) => total + player.rewards, 0),
  }
}

function validatePlanFile(value: unknown, source: LegacyWorldSource): L390ReviewPlan {
  if (!isRecord(value) || value.version !== 1 || value.mode !== 'dry-run' || !isRecord(value.source)
    || !isRecord(value.canonicalTarget) || !isRecord(value.identities) || !isRecord(value.progress)
    || !isRecord(value.progress.roomPlayers) || !isRecord(value.progress.supplies) || !isRecord(value.progress.rewards)
    || !isRecord(value.plan) || typeof value.mappingDigest !== 'string' || !SHA256.test(value.mappingDigest)
    || typeof value.progressPreservationDigest !== 'string' || !SHA256.test(value.progressPreservationDigest)) fail('REVIEW_PLAN_INVALID')
  if (toCanonicalJson(value.source) !== toCanonicalJson(summarizeLegacySourceManifest(source.manifest))) fail('REVIEW_PLAN_SOURCE_CHANGED')
  const metrics = aggregateProgress(source)
  if (value.identities.sourceAccountCount !== source.accounts.length
    || value.identities.plannedMappingCount !== source.accounts.length
    || value.progress.roomPlayers.count !== metrics.roomPlayers
    || value.progress.supplies.count !== metrics.suppliesRows || value.progress.supplies.sum !== metrics.suppliesSum
    || value.progress.rewards.count !== metrics.rewardsRows || value.progress.rewards.sum !== metrics.rewardsSum) fail('REVIEW_PLAN_COUNTS_CHANGED')
  if (source.manifest.namespace === 'l390' && (metrics.roomPlayers !== L390_EXPECTED_PROGRESS.roomPlayers
    || metrics.suppliesRows !== L390_EXPECTED_PROGRESS.suppliesRows || metrics.suppliesSum !== L390_EXPECTED_PROGRESS.suppliesSum
    || metrics.rewardsRows !== L390_EXPECTED_PROGRESS.rewardsRows || metrics.rewardsSum !== L390_EXPECTED_PROGRESS.rewardsSum)) {
    fail('L390_BACKUP_PROGRESS_COUNTS_CHANGED')
  }
  if (value.plan.canStage !== true || !isRecord(value.canonicalTarget) || typeof value.canonicalTarget.fingerprint !== 'string'
    || !SHA256.test(value.canonicalTarget.fingerprint)) fail('REVIEW_PLAN_BLOCKED')
  return value as unknown as L390ReviewPlan
}

function readSource(sourceDirectory: string, namespace: string): LegacyWorldSource {
  return readLegacyWorldSourceFiles({
    accountsPath: resolve(sourceDirectory, 'accounts.json'),
    roomPath: resolve(sourceDirectory, 'room.sqlite'),
    namespace,
  })
}

function assertIntegrityAndForeignKeys(db: Database.Database, prefix: string): void {
  const integrity = db.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') fail(`${prefix}_INTEGRITY_CHECK_FAILED`)
  const foreignKeys = db.pragma('foreign_key_check') as unknown[]
  if (foreignKeys.length !== 0) fail(`${prefix}_FOREIGN_KEY_CHECK_FAILED`)
}

function assertSourceIntegrity(sourceDirectory: string): void {
  const database = new Database(resolve(sourceDirectory, 'room.sqlite'), { readonly: true, fileMustExist: true })
  try { assertIntegrityAndForeignKeys(database, 'SOURCE') } finally { database.close() }
}

function assertDigestsMatch(reviewPlan: L390ReviewPlan, source: LegacyWorldSource, target: ReturnType<typeof readCanonicalStageState>, plan: LegacyWorldStagePlan): {
  mappingDocument: LegacyMappingDigestDocument; progressDocument: LegacyProgressDigestDocument
} {
  const mappingDocument = buildLegacyMappingDigestDocument(source, plan)
  const mappingDigest = hashLegacyMappingDocument(mappingDocument)
  const progressDocument = buildLegacyProgressDigestDocument(source, mappingDigest, plan.identities)
  const progressPreservationDigest = hashLegacyProgressDocument(progressDocument)
  if (reviewPlan.mappingDigest !== mappingDigest || reviewPlan.progressPreservationDigest !== progressPreservationDigest) fail('REVIEW_PLAN_DIGEST_MISMATCH')
  if (reviewPlan.canonicalTarget.fingerprint !== target.fingerprint) fail('REVIEW_PLAN_CANONICAL_BASE_CHANGED')
  return { mappingDocument, progressDocument }
}

function createArchiveDraft(source: LegacyWorldSource, data: ArchiveData, planDigest: string) {
  return evaluateLegacyArchiveCommand({
    commandType: 'PRESERVE_LEGACY_WORLD_PRIVATE', actorId: LEGACY_ARCHIVE_ACTOR,
    commandId: `legacy-l390:${source.manifest.sourceDigest}:exact-progress`, submittedAt: 0,
    payload: { namespace: source.manifest.namespace, sourceDigest: source.manifest.sourceDigest, planDigest,
      kind: 'exact-progress', batchIndex: 0, data },
  })
}

function findArchive(db: Database.Database, namespace: string, sourceDigest: string): { row: ArchiveRow; data: ArchiveData } {
  const rows = db.prepare(`SELECT sequence,event_id,event_type,occurred_at,actor_id,command_id,tick,ruleset_version,payload_json,version,deterministic_key
    FROM event_log WHERE event_type=? AND actor_id=? AND json_extract(payload_json,'$.namespace')=?
      AND json_extract(payload_json,'$.sourceDigest')=? AND json_extract(payload_json,'$.kind')='exact-progress' ORDER BY sequence`)
    .all(LEGACY_ARCHIVE_EVENT_TYPE, LEGACY_ARCHIVE_ACTOR, namespace, sourceDigest) as ArchiveRow[]
  if (rows.length !== 1) fail('PRIVATE_PROGRESS_ARCHIVE_MISSING_OR_DUPLICATE')
  const row = rows[0]!
  const payload = JSON.parse(row.payload_json) as { data?: unknown }
  if (!isRecord(payload.data)) fail('PRIVATE_PROGRESS_ARCHIVE_INVALID')
  return { row, data: payload.data as unknown as ArchiveData }
}

function assertArchivedEvent(source: LegacyWorldSource, row: ArchiveRow): string {
  const payload = JSON.parse(row.payload_json) as Parameters<typeof evaluateLegacyArchiveCommand>[0]['payload']
  const expected = evaluateLegacyArchiveCommand({ commandType: 'PRESERVE_LEGACY_WORLD_PRIVATE', actorId: LEGACY_ARCHIVE_ACTOR,
    commandId: row.command_id ?? '', submittedAt: row.occurred_at, payload })
  if (row.event_type !== expected.eventType || row.event_id !== expected.eventId || row.actor_id !== expected.actorId
    || row.ruleset_version !== expected.rulesetVersion || row.version !== expected.version
    || row.deterministic_key !== expected.deterministicKey || row.tick !== null || payload.namespace !== source.manifest.namespace
    || row.payload_json !== toCanonicalJson(payload) || payload.sourceDigest !== source.manifest.sourceDigest
    || payload.kind !== 'exact-progress') fail('PRIVATE_PROGRESS_ARCHIVE_INVALID')
  return payload.planDigest
}

function assertMappingMatchesSource(source: LegacyWorldSource, mappingDocument: LegacyMappingDigestDocument, ownerLegacyId: string): void {
  if (mappingDocument.namespace !== source.manifest.namespace || mappingDocument.mappings.length !== source.accounts.length) fail('CANONICAL_MAPPING_INVALID')
  const sourceAccounts = new Map(source.accounts.map(account => [account.id, account]))
  const canonicalIds = new Set<number>()
  for (const mapping of mappingDocument.mappings) {
    const account = sourceAccounts.get(mapping.legacyId)
    if (!account || canonicalIds.has(mapping.canonicalAccountId) || mapping.action !== 'create-disabled-player'
      || mapping.normalizedUsername !== normalizeLoginAlias({ kind: 'username', value: account.username }).value
      || mapping.sourceRoleClaim !== account.role || mapping.reviewedLinkReference !== null || mapping.credentialDisposition !== null) fail('CANONICAL_MAPPING_INVALID')
    canonicalIds.add(mapping.canonicalAccountId)
  }
  if (!sourceAccounts.has(ownerLegacyId) || sourceAccounts.get(ownerLegacyId)?.role !== 'admin') fail('OWNER_SELECTION_MUST_MATCH_LEGACY_ADMIN')
}

function assertCanonicalAccounts(db: Database.Database, source: LegacyWorldSource, data: ArchiveData): Record<string, number> {
  const mappings = data.mappingDocument.mappings
  const expectedIds = new Set(mappings.map(mapping => mapping.canonicalAccountId))
  const accounts = db.prepare('SELECT id,password_hash,password_scheme,role,status,email FROM accounts ORDER BY id').all() as Array<{
    id: number; password_hash: string; password_scheme: string; role: string; status: string; email: string | null
  }>
  if (accounts.length !== source.accounts.length || accounts.some(row => !expectedIds.has(row.id))) fail('CANONICAL_IDENTITY_COUNT_MISMATCH')
  const sourceAccounts = new Map(source.accounts.map(account => [account.id, account]))
  const roles: string[] = []
  let activeImported = 0
  for (const mapping of mappings) {
    const sourceAccount = sourceAccounts.get(mapping.legacyId)
    const account = accounts.find(row => row.id === mapping.canonicalAccountId)
    const role = mapping.legacyId === data.activation.ownerLegacyId ? 'admin' : 'player'
    if (!sourceAccount || !account || !expectedIds.has(account.id) || account.email !== null
      || account.password_hash !== sourceAccount.passwordHash || account.password_scheme !== 'legacy-mp-scrypt-v1'
      || account.role !== role || account.status !== 'active') fail('CANONICAL_ACCOUNT_VERIFICATION_FAILED')
    const alias = normalizeLoginAlias({ kind: 'username', value: sourceAccount.username })
    const aliases = db.prepare('SELECT kind,normalized,display_value FROM account_login_aliases WHERE account_id=?').all(account.id) as Array<{kind:string;normalized:string;display_value:string}>
    if (aliases.length !== 1 || aliases[0]?.kind !== 'username' || aliases[0]?.normalized !== alias.value
      || aliases[0]?.display_value !== sourceAccount.username) fail('CANONICAL_ALIAS_VERIFICATION_FAILED')
    const provenance = db.prepare('SELECT namespace,legacy_id FROM account_source_identities WHERE account_id=?').get(account.id) as {namespace:string;legacy_id:string} | undefined
    if (provenance?.namespace !== source.manifest.namespace || provenance.legacy_id !== sourceAccount.id) fail('CANONICAL_PROVENANCE_VERIFICATION_FAILED')
    if (account.status === 'active') activeImported += 1
    roles.push(account.role)
  }
  const activeAdmins = (db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE status='active' AND role='admin'").get() as {count:number}).count
  if (activeImported !== source.accounts.length || activeAdmins !== 1) fail('CANONICAL_ACTIVE_ROLE_COUNTS_MISMATCH')
  const unexpectedProvenance = db.prepare('SELECT COUNT(*) AS count FROM account_source_identities WHERE namespace=?').get(source.manifest.namespace) as {count:number}
  if (unexpectedProvenance.count !== source.accounts.length) fail('CANONICAL_PROVENANCE_COUNT_MISMATCH')
  return countRoles(roles)
}

function verifyCanonicalDatabase(db: Database.Database, source: LegacyWorldSource, reviewPlan: L390ReviewPlan, ownerLegacyId?: string) {
  assertIntegrityAndForeignKeys(db, 'CANONICAL')
  assertUnifiedDatabaseReady(db)
  const { row, data } = findArchive(db, source.manifest.namespace, source.manifest.sourceDigest)
  const archivedPlanDigest = assertArchivedEvent(source, row)
  if (data.disposition !== 'private-exact-unmapped' || data.activationReady !== false
    || data.activation?.activateAccounts !== true || typeof data.activation.ownerLegacyId !== 'string'
    || ownerLegacyId !== undefined && data.activation.ownerLegacyId !== ownerLegacyId
    || data.mappingDigest !== reviewPlan.mappingDigest || data.progressPreservationDigest !== reviewPlan.progressPreservationDigest
    || data.stagePlanDigest !== archivedPlanDigest
    || reviewPlan.plan.stagePlanDigest !== undefined && data.stagePlanDigest !== reviewPlan.plan.stagePlanDigest
    || data.baselineTargetFingerprint !== reviewPlan.canonicalTarget.fingerprint) fail('CANONICAL_ARCHIVE_REVIEW_MISMATCH')
  assertMappingMatchesSource(source, data.mappingDocument, data.activation.ownerLegacyId)
  const expectedCanonicalMappings = data.mappingDocument.mappings.map(mapping => ({ namespace: source.manifest.namespace,
    legacyId: mapping.legacyId, accountId: mapping.canonicalAccountId }))
  const expectedRoleClaims = source.accounts.map(account => ({ legacyId: account.id, roleClaim: account.role }))
  if (toCanonicalJson(data.canonicalMappings) !== toCanonicalJson(expectedCanonicalMappings)
    || toCanonicalJson(data.sourceRoleClaims) !== toCanonicalJson(expectedRoleClaims)) fail('CANONICAL_ARCHIVE_MAPPING_CHANGED')
  const mappingDigest = hashLegacyMappingDocument(data.mappingDocument)
  if (mappingDigest !== reviewPlan.mappingDigest) fail('MAPPING_DIGEST_MISMATCH')
  const expectedProgress = buildLegacyProgressDigestDocument(source, mappingDigest,
    data.mappingDocument.mappings.map(mapping => ({ legacyId: mapping.legacyId, accountId: mapping.canonicalAccountId })))
  const progressPreservationDigest = hashLegacyProgressDocument(expectedProgress)
  if (toCanonicalJson(data.progressDocument) !== toCanonicalJson(expectedProgress)
    || data.stateJson !== toCanonicalJson(source.roomState)
    || progressPreservationDigest !== reviewPlan.progressPreservationDigest) fail('PROGRESS_DIGEST_MISMATCH')
  const roles = assertCanonicalAccounts(db, source, data)
  const metrics = aggregateProgress(source)
  if (reviewPlan.progress.roomPlayers.count !== metrics.roomPlayers
    || reviewPlan.progress.supplies.count !== metrics.suppliesRows || reviewPlan.progress.supplies.sum !== metrics.suppliesSum
    || reviewPlan.progress.rewards.count !== metrics.rewardsRows || reviewPlan.progress.rewards.sum !== metrics.rewardsSum) fail('PROGRESS_COUNTS_MISMATCH')
  if (source.manifest.namespace === 'l390' && (metrics.roomPlayers !== L390_EXPECTED_PROGRESS.roomPlayers
    || metrics.suppliesRows !== L390_EXPECTED_PROGRESS.suppliesRows || metrics.suppliesSum !== L390_EXPECTED_PROGRESS.suppliesSum
    || metrics.rewardsRows !== L390_EXPECTED_PROGRESS.rewardsRows || metrics.rewardsSum !== L390_EXPECTED_PROGRESS.rewardsSum)) fail('L390_BACKUP_PROGRESS_COUNTS_CHANGED')
  const archiveCount = (db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE event_type<>'LEGACY_WORLD_PRIVATE_ARCHIVE_V1'").get() as {count:number}).count
  const totalArchiveCount = (db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE event_type='LEGACY_WORLD_PRIVATE_ARCHIVE_V1'").get() as {count:number}).count
  if (archiveCount !== 0 || totalArchiveCount !== 1) fail('CANONICAL_UNEXPECTED_EVENT_LOG_ROWS')
  return {
    source: summarizeLegacySourceManifest(source.manifest),
    identities: { count: source.accounts.length, sourceRoleClaims: countRoles(source.accounts.map(account => account.role)), canonicalRoles: roles,
      activeAccounts: source.accounts.length, activeAdmins: 1, ownerLegacyId: data.activation.ownerLegacyId },
    progress: { roomPlayers: metrics.roomPlayers, supplies: { rows: metrics.suppliesRows, sum: metrics.suppliesSum },
      rewards: { rows: metrics.rewardsRows, sum: metrics.rewardsSum } },
    mappingDigest, progressPreservationDigest,
    canonicalIntegrity: 'ok' as const, sourceIntegrity: 'ok' as const, foreignKeyViolations: 0,
  }
}

function prepareSource(input: {sourceDirectory:string;namespace:string}) {
  const source = readSource(input.sourceDirectory,input.namespace)
  try { assertSourceIntegrity(input.sourceDirectory); return source }
  catch (error) { source.close?.(); throw error }
}

/** Apply only to a new target file. The existing fixture/offline schema initializers are reused in memory. */
export async function applyL390LegacyImport(input: L390ApplyInput) {
  if (!input.activateAccounts) fail('ACTIVATE_ACCOUNTS_FLAG_REQUIRED')
  if (!input.ownerLegacyId?.trim()) fail('OWNER_SELECTION_REQUIRED')
  const canonicalPath = resolve(input.canonicalPath)
  const source = prepareSource(input)
  try {
    const reviewPlan = validatePlanFile(input.reviewPlan, source)
    const db = createCanonicalSchemaFixture()
    try {
      const target = readCanonicalStageState(db)
      const plan = planLegacyWorldStage({ source, target })
      if (!plan.canStage || plan.blockers.length) fail('CANONICAL_PLAN_BLOCKED')
      const { mappingDocument, progressDocument } = assertDigestsMatch(reviewPlan, source, target, plan)
      assertMappingMatchesSource(source, mappingDocument, input.ownerLegacyId)
      if (plan.identities.some(identity => identity.action !== 'create-disabled-player')) fail('FRESH_CANONICAL_TARGET_REQUIRED')
      if (existsSync(canonicalPath)) {
        const targetInfo = lstatSync(canonicalPath)
        if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) fail('CANONICAL_TARGET_NOT_REGULAR_FILE')
      }
      if (existsSync(canonicalPath) && statSync(canonicalPath).size > 0) {
        let existing: Database.Database | undefined
        try {
          existing = new Database(canonicalPath, { readonly: true, fileMustExist: true })
          const verified = verifyCanonicalDatabase(existing, source, reviewPlan, input.ownerLegacyId)
          return { applied: false, duplicate: true, reviewed: false, report: verified }
        } catch { fail('CANONICAL_TARGET_EXISTS_NONEMPTY') } finally { existing?.close() }
      }
      const data: ArchiveData = {
        stateJson: toCanonicalJson(source.roomState),
        canonicalMappings: mappingDocument.mappings.map(mapping => ({ namespace: source.manifest.namespace, legacyId: mapping.legacyId, accountId: mapping.canonicalAccountId })),
        sourceRoleClaims: source.accounts.map(account => ({ legacyId: account.id, roleClaim: account.role })),
        disposition: 'private-exact-unmapped', activationReady: false,
        mappingDocument, progressDocument, mappingDigest: reviewPlan.mappingDigest,
        progressPreservationDigest: reviewPlan.progressPreservationDigest,
        stagePlanDigest: plan.planDigest,
        baselineTargetFingerprint: target.fingerprint,
        activation: { activateAccounts: true, ownerLegacyId: input.ownerLegacyId },
      }
      const byLegacyId = new Map(source.accounts.map(account => [account.id, account]))
      // Do not call applyLegacyWorldStage here: its pending stage marker blocks unified boot
      // and it creates disabled identities. This cutover path records only private exact progress.
      const transaction = db.transaction(() => {
        const insertAccount = db.prepare(`INSERT INTO accounts(id,email,password_hash,password_scheme,created_at,role,status,nickname,avatar,display_name,last_seen_tick)
          VALUES(?,NULL,?,'legacy-mp-scrypt-v1',0,?,'active',NULL,'tide',?,0)`)
        const insertAlias = db.prepare("INSERT INTO account_login_aliases(kind,normalized,display_value,account_id) VALUES('username',?,?,?)")
        const insertProvenance = db.prepare('INSERT INTO account_source_identities(namespace,legacy_id,account_id) VALUES(?,?,?)')
        for (const identity of plan.identities) {
          const account = byLegacyId.get(identity.legacyId)
          if (!account) fail('SOURCE_IDENTITY_CHANGED')
          const alias = normalizeLoginAlias({ kind: 'username', value: account.username })
          const role = identity.legacyId === input.ownerLegacyId ? 'admin' : 'player'
          insertAccount.run(identity.accountId, account.passwordHash, role, account.name)
          insertAlias.run(alias.value, account.username, identity.accountId)
          insertProvenance.run(source.manifest.namespace, identity.legacyId, identity.accountId)
        }
        reserveCanonicalAccountIds(db)
        assertAccountAllocatorReady(db)
        const archive = createArchiveDraft(source, data, plan.planDigest)
        const committed = new SqliteEventStore(db).appendEvents([archive])[0]
        if (committed?.eventType !== LEGACY_ARCHIVE_EVENT_TYPE) fail('PRIVATE_PROGRESS_ARCHIVE_WRITE_FAILED')
        if ((db.pragma('foreign_key_check') as unknown[]).length) fail('CANONICAL_FOREIGN_KEY_CHECK_FAILED')
        assertUnifiedDatabaseReady(db)
      })
      transaction.immediate()
      assertIntegrityAndForeignKeys(db, 'CANONICAL')
      const inMemoryReport = verifyCanonicalDatabase(db, source, reviewPlan, input.ownerLegacyId)
      if (inMemoryReport.canonicalIntegrity !== 'ok') fail('CANONICAL_VERIFY_FAILED')

      let createdTarget = false
      try {
        if (existsSync(canonicalPath)) {
          if (statSync(canonicalPath).size !== 0) fail('CANONICAL_TARGET_EXISTS_NONEMPTY')
        } else {
          const descriptor = openSync(canonicalPath, 'wx', 0o600)
          closeSync(descriptor)
          createdTarget = true
        }
        await db.backup(canonicalPath)
        const onDisk = new Database(canonicalPath, { readonly: true, fileMustExist: true })
        try {
          const verified = verifyCanonicalDatabase(onDisk, source, reviewPlan, input.ownerLegacyId)
          return { applied: true, duplicate: false, reviewed: false, report: verified }
        } finally { onDisk.close() }
      } catch (error) {
        if (createdTarget && existsSync(canonicalPath)) unlinkSync(canonicalPath)
        throw error
      }
    } finally { db.close() }
  } finally { source.close?.() }
}

/** Verify a completed offline apply and only then return a deployer review receipt. */
export function verifyL390LegacyImport(input: L390VerifyInput) {
  const source = prepareSource(input)
  try {
    const reviewPlan = validatePlanFile(input.reviewPlan, source)
    if (!VOLUME_NAME.test(input.canonicalVolume) || !input.legacyVolumes.length
      || input.legacyVolumes.some(name => !VOLUME_NAME.test(name))
      || new Set(input.legacyVolumes).size !== input.legacyVolumes.length
      || input.legacyVolumes.includes(input.canonicalVolume)) fail('REVIEW_VOLUME_BINDINGS_INVALID')
    const canonicalPath = resolve(input.canonicalPath)
    const pathInfo = lstatSync(canonicalPath)
    if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) fail('CANONICAL_TARGET_NOT_REGULAR_FILE')
    const db = new Database(canonicalPath, { readonly: true, fileMustExist: true })
    try {
      const report = verifyCanonicalDatabase(db, source, reviewPlan)
      return {
        ...report,
        receipt: {
          reviewed: true as const,
          canonicalVolume: input.canonicalVolume,
          legacyVolumes: [...input.legacyVolumes].sort(),
          mappingDigest: report.mappingDigest,
          progressPreservationDigest: report.progressPreservationDigest,
        },
      }
    } finally { db.close() }
  } finally { source.close?.() }
}
