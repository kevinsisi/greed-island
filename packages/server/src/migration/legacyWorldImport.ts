import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { accountId, normalizeLoginAlias } from '../identity/principal.js'
import { readCanonicalAccountIdAuthority, reserveCanonicalAccountIds, assertAccountAllocatorReady } from '../identity/accountIdAuthority.js'
import { assertUnifiedIdentitySchema } from '../identity/schema.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { canonicalStageFingerprint, planLegacyWorldStage, type CanonicalStageAccount, type CanonicalStageState, type LegacyWorldStagePlan } from './legacyWorldPlan.js'
import { digest, inspectLegacyWorldSource, type LegacyEventRow, type LegacyWorldSource } from './legacyWorldSource.js'
import { evaluateLegacyArchiveCommand, LEGACY_ARCHIVE_ACTOR, LEGACY_ARCHIVE_EVENT_TYPE, LEGACY_ARCHIVE_RULESET } from './legacyWorldRules.js'

import { assertLegacyWorldStageSchema, LEGACY_STAGE_MARKER_DDL, LEGACY_STAGE_PRIVATE_DDL } from './legacyWorldStageSchema.js'

const ARCHIVE_BATCH_ROWS = 256
/** Read-only inventory includes sequence, numeric actors, committed structured refs, and declared account FKs. */
export function readCanonicalStageState(db: Database.Database): CanonicalStageState {
  assertUnifiedIdentitySchema(db)
  const highWater = readCanonicalAccountIdAuthority(db)
  const rows = db.prepare('SELECT id,role,status,password_hash FROM accounts ORDER BY id').all() as Array<{ id: number; role: CanonicalStageAccount['role']; status: CanonicalStageAccount['status']; password_hash: string }>
  const accounts: CanonicalStageAccount[] = rows.map(row => {
    const aliases = db.prepare('SELECT kind,normalized,display_value FROM account_login_aliases WHERE account_id=? ORDER BY kind,normalized').all(row.id) as Array<{ kind: 'username' | 'email'; normalized: string; display_value: string }>
    const source = db.prepare('SELECT namespace,legacy_id FROM account_source_identities WHERE account_id=?').get(row.id) as { namespace: string; legacy_id: string } | undefined
    return { id: accountId(row.id), role: row.role, status: row.status, passwordHash: row.password_hash,
      aliases: aliases.map(alias => ({ kind: alias.kind, normalized: alias.normalized, displayValue: alias.display_value })),
      ...(source ? { source: { namespace: source.namespace, legacyId: source.legacy_id } } : {}) }
  })
  const eventLastSequence = (db.prepare('SELECT COALESCE(MAX(sequence),0) AS last_sequence FROM event_log').get() as { last_sequence: number }).last_sequence
  return { accounts, accountIdHighWaterMark: highWater, eventLastSequence,
    fingerprint: canonicalStageFingerprint(accounts, highWater, eventLastSequence) }
}
export type LegacyStageResult = Readonly<{ sourceDigest: string; planDigest: string; duplicate: boolean; createdDisabledAccounts: number; archivedSourceEvents: number; archiveEventIds: readonly string[]; activationReady: false }>
/** Explicit private staging only. Never called by constructors/startup, never activates accounts or a volume. */
export function applyLegacyWorldStage(input: { db: Database.Database; source: LegacyWorldSource; plan: LegacyWorldStagePlan;
  purpose: 'synthetic-private-stage'; recordedAt: number; failAfter?: (phase: string) => void }): LegacyStageResult {
  const { db, source, plan } = input
  if (input.purpose !== 'synthetic-private-stage' || !Number.isSafeInteger(input.recordedAt) || input.recordedAt < 0
    || !plan.canStage || plan.blockers.length || plan.productionActivation !== false || plan.importedAccountsCanLogin !== false
    || plan.source.sourceDigest !== source.manifest.sourceDigest) throw new Error('STAGED_IMPORT_BLOCKED')
  assertUnifiedIdentitySchema(db)
  if (Number(db.pragma('foreign_keys', { simple: true })) !== 1 || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('STAGED_IMPORT_FOREIGN_KEYS_BLOCKED')
  const rechecked = inspectLegacyWorldSource(source.rawAccountsJson, source.manifest.namespace, source.rows)
  if (toCanonicalJson(rechecked.manifest) !== toCanonicalJson(source.manifest)
    || digest(toCanonicalJson(source.roomState)) !== source.manifest.projectedStateSha256) throw new Error('SOURCE_CHANGED_BEFORE_IMPORT')
  return db.transaction(() => {
    // One supplied staged SQLite connection; schema/event writes are inside the SAME outer transaction.
    const store = new SqliteEventStore(db)
    const anyStageTable = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('legacy_import_stage','legacy_import_private_sources')").get()
    if (anyStageTable) assertLegacyWorldStageSchema(db)
    else { db.exec(`${LEGACY_STAGE_MARKER_DDL}; ${LEGACY_STAGE_PRIVATE_DDL};`); assertLegacyWorldStageSchema(db) }
    const prior = db.prepare('SELECT source_digest,plan_digest FROM legacy_import_stage WHERE namespace=?').get(source.manifest.namespace) as { source_digest: string; plan_digest: string } | undefined
    if (prior) {
      if (prior.source_digest !== source.manifest.sourceDigest) throw new Error('SOURCE_MANIFEST_CHANGED')
      const archive = db.prepare('SELECT accounts_json,manifest_json,identities_json,archive_event_ids_json FROM legacy_import_private_sources WHERE namespace=?').get(source.manifest.namespace) as { accounts_json: string; manifest_json: string; identities_json: string; archive_event_ids_json: string } | undefined
      if (!archive) throw new Error('STAGED_ARCHIVE_INCOMPLETE')
      if (archive.accounts_json !== source.rawAccountsJson || archive.manifest_json !== toCanonicalJson(source.manifest)) throw new Error('STAGED_ARCHIVE_CHANGED')
      const mappings = JSON.parse(archive.identities_json) as LegacyWorldStagePlan['identities']
      const sourceIds = new Set(rechecked.accounts.map(account => account.id))
      if (!Array.isArray(mappings) || mappings.length !== sourceIds.size || new Set(mappings.map(identity => identity.legacyId)).size !== sourceIds.size
        || mappings.some(identity => identity.namespace !== source.manifest.namespace || !sourceIds.has(identity.legacyId)
          || !Number.isSafeInteger(identity.accountId) || identity.accountId <= 0)) throw new Error('STAGED_MAPPING_CHANGED')
      for (const identity of mappings) {
        const current = db.prepare('SELECT account_id FROM account_source_identities WHERE namespace=? AND legacy_id=?').get(identity.namespace, identity.legacyId) as { account_id: number } | undefined
        if (current?.account_id !== identity.accountId) throw new Error('STAGED_MAPPING_CHANGED')
        const sourceAccount = rechecked.accounts.find(account => account.id === identity.legacyId)!
        const alias = normalizeLoginAlias({ kind: 'username', value: sourceAccount.username })
        const currentAlias = db.prepare("SELECT account_id FROM account_login_aliases WHERE kind='username' AND normalized=?").get(alias.value) as { account_id: number } | undefined
        if (currentAlias?.account_id !== identity.accountId) throw new Error('STAGED_ALIAS_CHANGED')
      }
      const archiveEventIds = JSON.parse(archive.archive_event_ids_json) as string[]
      verifyRecordedArchive(db, rechecked, mappings, prior.plan_digest, archiveEventIds)
      reserveCanonicalAccountIds(db)
      assertAccountAllocatorReady(db)
      return { sourceDigest: source.manifest.sourceDigest, planDigest: prior.plan_digest, duplicate: true, createdDisabledAccounts: 0,
        archivedSourceEvents: source.manifest.eventCount, archiveEventIds, activationReady: false as const }
    }
    const target = readCanonicalStageState(db)
    if (target.fingerprint !== plan.targetFingerprint) throw new Error('CANONICAL_TARGET_CHANGED')
    // Re-evaluate the frozen descriptor, including above-authority allocation and reviewed links.
    const verifiedPlan = planLegacyWorldStage({ source: rechecked, target,
      reviewedLinks: plan.identities.flatMap(identity => identity.reviewReference && identity.credentialDisposition === 'keep-canonical'
        ? [{ namespace: identity.namespace, legacyId: identity.legacyId, accountId: accountId(identity.accountId), reviewReference: identity.reviewReference, credentialDisposition: 'keep-canonical' as const }] : []),
      ...(plan.ownerSelection ? { ownerSelection: plan.ownerSelection } : {}) })
    if (verifiedPlan.planDigest !== plan.planDigest || !verifiedPlan.canStage) throw new Error('PLAN_CHANGED')
    const descriptor = { ...plan } as Record<string, unknown>; delete descriptor.planDigest
    if (digest(toCanonicalJson(descriptor)) !== plan.planDigest) throw new Error('PLAN_CHANGED')
    db.prepare('INSERT INTO legacy_import_stage VALUES(?,?,?,\'pending-owner-and-activation-review\',?,?)').run(source.manifest.namespace, source.manifest.sourceDigest, plan.planDigest,
      plan.ownerSelection ? toCanonicalJson(plan.ownerSelection) : null, input.recordedAt)
    let created = 0
    for (const identity of plan.identities) {
      const account = rechecked.accounts.find(account => account.id === identity.legacyId)
      if (!account) throw new Error('SOURCE_IDENTITY_CHANGED')
      const alias = normalizeLoginAlias({ kind: 'username', value: account.username })
      if (identity.action === 'create-disabled-player') {
        db.prepare("INSERT INTO accounts(id,email,password_hash,password_scheme,created_at,role,status,nickname,avatar,display_name,last_seen_tick) VALUES(?,NULL,?,'legacy-mp-scrypt-v1',?,'player','disabled',NULL,'tide',?,0)")
          .run(identity.accountId, account.passwordHash, input.recordedAt, account.name)
        created += 1
      } else if (!db.prepare('SELECT id FROM accounts WHERE id=?').get(identity.accountId)) throw new Error('MAPPING_TARGET_MISSING')
      const existingAlias = db.prepare("SELECT account_id FROM account_login_aliases WHERE kind='username' AND normalized=?").get(alias.value) as { account_id: number } | undefined
      if (existingAlias && existingAlias.account_id !== identity.accountId) throw new Error('ALIAS_CONFLICT')
      if (!existingAlias) db.prepare("INSERT INTO account_login_aliases VALUES('username',?,?,?)").run(alias.value, account.username, identity.accountId)
      const existingSource = db.prepare('SELECT account_id FROM account_source_identities WHERE namespace=? AND legacy_id=?').get(identity.namespace, identity.legacyId) as { account_id: number } | undefined
      if (existingSource && existingSource.account_id !== identity.accountId) throw new Error('PROVENANCE_CONFLICT')
      if (!existingSource) db.prepare('INSERT INTO account_source_identities VALUES(?,?,?)').run(identity.namespace, identity.legacyId, identity.accountId)
    }
    // ONE shared authority also protects normal AUTOINCREMENT, even with zero imported users.
    reserveCanonicalAccountIds(db)
    assertAccountAllocatorReady(db)
    input.failAfter?.('identities')
    const archiveEventIds: string[] = [], rowsHash = createHash('sha256'); let batch: LegacyEventRow[] = [], batches = 0, rowCount = 0
    const append = (kind: 'source-event-batch' | 'exact-progress', data: unknown, batchIndex: number) => {
      const event = evaluateLegacyArchiveCommand({ commandType: 'PRESERVE_LEGACY_WORLD_PRIVATE', actorId: LEGACY_ARCHIVE_ACTOR,
        commandId: `legacy-stage:${source.manifest.sourceDigest}:${kind}:${batchIndex}`, submittedAt: input.recordedAt,
        payload: { namespace: source.manifest.namespace, sourceDigest: source.manifest.sourceDigest, planDigest: plan.planDigest, kind, batchIndex, data } })
      const committed = store.appendEvents([event])[0]!
      if (committed.eventType !== LEGACY_ARCHIVE_EVENT_TYPE) throw new Error('ARCHIVE_EVENT_CONFLICT')
      archiveEventIds.push(committed.eventId)
    }
    for (const row of source.rows()) {
      rowsHash.update(toCanonicalJson(row) + '\n'); batch.push({ ...row }); rowCount += 1
      if (batch.length === ARCHIVE_BATCH_ROWS) { append('source-event-batch', batch, batches++); batch = [] }
    }
    if (batch.length) append('source-event-batch', batch, batches++)
    if (rowCount !== source.manifest.eventCount || rowsHash.digest('hex') !== source.manifest.eventRowsSha256 || digest(source.rawAccountsJson) !== source.manifest.accountsSha256) throw new Error('SOURCE_CHANGED_DURING_IMPORT')
    append('exact-progress', { stateJson: toCanonicalJson(rechecked.roomState), canonicalMappings: plan.identities.map(identity => ({ namespace: identity.namespace, legacyId: identity.legacyId, accountId: identity.accountId })),
      sourceRoleClaims: rechecked.accounts.map(account => ({ legacyId: account.id, roleClaim: account.role })),
      disposition: 'private-exact-unmapped', activationReady: false as const }, 0)
    input.failAfter?.('archive-events')
    db.prepare('INSERT INTO legacy_import_private_sources VALUES(?,?,?,?,?)').run(source.manifest.namespace, source.rawAccountsJson,
      toCanonicalJson(source.manifest), toCanonicalJson(plan.identities), toCanonicalJson(archiveEventIds))
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('STAGED_IMPORT_FOREIGN_KEYS_BLOCKED')
    input.failAfter?.('before-commit')
    return { sourceDigest: source.manifest.sourceDigest, planDigest: plan.planDigest, duplicate: false, createdDisabledAccounts: created,
      archivedSourceEvents: rowCount, archiveEventIds, activationReady: false as const }
  })()
}

/** A retry succeeds only after the exact private bytes and immutable EventLog archive are verified. */
export function verifyRecordedArchive(db: Database.Database, source: LegacyWorldSource, mappings: LegacyWorldStagePlan['identities'], planDigest: string, ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.length !== Math.ceil(source.manifest.eventCount / ARCHIVE_BATCH_ROWS) + 1 || new Set(ids).size !== ids.length) throw new Error('STAGED_ARCHIVE_INCOMPLETE')
  const hash = createHash('sha256'); let count = 0
  for (let index = 0; index < ids.length; index += 1) {
    const row = db.prepare('SELECT event_type,actor_id,ruleset_version,payload_json FROM event_log WHERE event_id=?').get(ids[index]) as { event_type: string; actor_id: string; ruleset_version: string; payload_json: string } | undefined
    if (!row || row.event_type !== LEGACY_ARCHIVE_EVENT_TYPE || row.actor_id !== LEGACY_ARCHIVE_ACTOR || row.ruleset_version !== LEGACY_ARCHIVE_RULESET) throw new Error('STAGED_ARCHIVE_INCOMPLETE')
    const payload = JSON.parse(row.payload_json) as { namespace: string; sourceDigest: string; planDigest: string; kind: string; batchIndex: number; data: unknown }
    const last = index === ids.length - 1
    if (payload.namespace !== source.manifest.namespace || payload.sourceDigest !== source.manifest.sourceDigest || payload.planDigest !== planDigest
      || payload.kind !== (last ? 'exact-progress' : 'source-event-batch') || payload.batchIndex !== (last ? 0 : index)) throw new Error('STAGED_ARCHIVE_CHANGED')
    const expectedEvent = evaluateLegacyArchiveCommand({ commandType: 'PRESERVE_LEGACY_WORLD_PRIVATE', actorId: LEGACY_ARCHIVE_ACTOR,
      commandId: 'retry-verification', submittedAt: 0, payload: { ...payload, kind: last ? 'exact-progress' : 'source-event-batch' } })
    if (expectedEvent.eventId !== ids[index]) throw new Error('STAGED_ARCHIVE_CHANGED')
    if (!last) {
      if (!Array.isArray(payload.data) || payload.data.length < 1 || payload.data.length > ARCHIVE_BATCH_ROWS) throw new Error('STAGED_ARCHIVE_CHANGED')
      for (const sourceRow of payload.data) { hash.update(toCanonicalJson(sourceRow) + '\n'); count += 1 }
    } else {
      const expected = { stateJson: toCanonicalJson(source.roomState), canonicalMappings: mappings.map(identity => ({ namespace: identity.namespace, legacyId: identity.legacyId, accountId: identity.accountId })),
        sourceRoleClaims: source.accounts.map(account => ({ legacyId: account.id, roleClaim: account.role })), disposition: 'private-exact-unmapped', activationReady: false }
      if (toCanonicalJson(payload.data) !== toCanonicalJson(expected)) throw new Error('STAGED_ARCHIVE_CHANGED')
    }
  }
  if (count !== source.manifest.eventCount || hash.digest('hex') !== source.manifest.eventRowsSha256) throw new Error('STAGED_ARCHIVE_CHANGED')
}
