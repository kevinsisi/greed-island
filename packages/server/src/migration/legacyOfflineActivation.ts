import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { LivingWorldRuleEngine } from '../kernel/livingWorldCommands.js'
import { HarborBeaconProjection, reviewedHarborRestorationCommand } from '../playerWorld/harborBeacon.js'
import { PlayerWorldProjection } from '../projections/playerWorld.js'
import { PLAYER_WORLD_POSITION_EVENT_TYPES, PLAYER_WORLD_RULESET } from '../playerWorld/types.js'
import { HARBOR_BEACON_EVENT_TYPES, validatePreservedHarborState, type PreservedHarborState } from '../playerWorld/harborBeaconData.js'
import { accountId, normalizeLoginAlias } from '../identity/principal.js'
import { assertUnifiedIdentitySchema } from '../identity/schema.js'
import { assertAccountAllocatorReady } from '../identity/accountIdAuthority.js'
import { readCanonicalStageState, verifyRecordedArchive } from './legacyWorldImport.js'
import { assertLegacyWorldStageSchema } from './legacyWorldStageSchema.js'
import { digest, inspectLegacyWorldSource, rowEvent, type LegacyEventRow, type LegacyWorldSource } from './legacyWorldSource.js'
import type { StageIdentity } from './legacyWorldPlan.js'

export type ActivationDisposition = 'enable-imported-player' | 'keep-disabled' | 'preserve-existing'
export type OfflineActivationPolicy = Readonly<{
  version: 1
  purpose: 'reviewed-offline-activation'
  namespace: string
  sourceDigest: string
  stagePlanDigest: string
  archiveDigest: string
  progressDigest: string
  expectedTargetFingerprint: string
  expectedPreservationSnapshot: string
  existingActiveAdminId: number
  reviewReference: string
  identities: readonly Readonly<{ legacyId: string; accountId: number; disposition: ActivationDisposition }>[]
}>
export type OfflineActivationPreview = Readonly<{
  namespace: string; sourceDigest: string; stagePlanDigest: string; archiveDigest: string; progressDigest: string
  targetFingerprint: string; preservationSnapshot: string
  identities: readonly Readonly<{ legacyId: string; accountId: number; action: StageIdentity['action']; role: string; status: string }>[]
}>
export type OfflineActivationReceipt = Readonly<{
  version: 1; namespace: string; sourceDigest: string; stagePlanDigest: string; archiveDigest: string; progressDigest: string
  policyDigest: string; existingActiveAdminId: number; reviewReference: string; recordedAt: number
  enabledAccountIds: readonly number[]; appliedTargetFingerprint: string
  preservationSnapshotBefore: string; preservationSnapshotAfter: string
  productionBootEnabled: false
}>
export const OFFLINE_ACTIVATION_RECEIPT_DDL = `CREATE TABLE legacy_import_activation_receipts(namespace TEXT PRIMARY KEY REFERENCES legacy_import_stage(namespace),version INTEGER NOT NULL CHECK(version=1),policy_json TEXT NOT NULL,receipt_json TEXT NOT NULL,receipt_digest TEXT NOT NULL)`
const receiptTriggers = [
  `CREATE TRIGGER legacy_activation_no_update BEFORE UPDATE ON legacy_import_activation_receipts BEGIN SELECT RAISE(ABORT,'activation receipt is immutable'); END`,
  `CREATE TRIGGER legacy_activation_no_delete BEFORE DELETE ON legacy_import_activation_receipts BEGIN SELECT RAISE(ABORT,'activation receipt is immutable'); END`,
] as const
const sha256 = /^[a-f0-9]{64}$/
const validId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
function fail(code: string): never { throw new Error(code) }
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
export function validateOfflineActivationPolicy(value: OfflineActivationPolicy): OfflineActivationPolicy {
  // Freeze caller-controlled getters/references before any database mutation.
  const p: unknown = JSON.parse(toCanonicalJson(value))
  const keys = ['version','purpose','namespace','sourceDigest','stagePlanDigest','archiveDigest','progressDigest','expectedTargetFingerprint','expectedPreservationSnapshot','existingActiveAdminId','reviewReference','identities']
  if (!plain(p) || !exactKeys(p, keys) || p.version !== 1 || p.purpose !== 'reviewed-offline-activation'
    || typeof p.namespace !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.namespace)
    || !['sourceDigest','stagePlanDigest','archiveDigest','progressDigest','expectedTargetFingerprint','expectedPreservationSnapshot'].every(key => typeof p[key] === 'string' && sha256.test(p[key] as string))
    || !validId(p.existingActiveAdminId) || typeof p.reviewReference !== 'string' || !p.reviewReference.trim() || p.reviewReference.length > 200
    || !Array.isArray(p.identities) || !p.identities.length || p.identities.length > 1000) fail('ACTIVATION_POLICY_INVALID')
  const ids = new Set<number>(), legacy = new Set<string>()
  for (const identity of p.identities) {
    if (!plain(identity) || !exactKeys(identity, ['legacyId','accountId','disposition']) || typeof identity.legacyId !== 'string' || !identity.legacyId
      || identity.legacyId.length > 100 || !validId(identity.accountId) || ids.has(identity.accountId) || legacy.has(identity.legacyId)
      || !['enable-imported-player','keep-disabled','preserve-existing'].includes(identity.disposition as string)) fail('ACTIVATION_POLICY_INVALID')
    ids.add(identity.accountId); legacy.add(identity.legacyId)
  }
  return p as unknown as OfflineActivationPolicy
}
function receiptSchemaExists(db: Database.Database): boolean {
  const table = db.prepare("SELECT type,sql FROM sqlite_master WHERE name='legacy_import_activation_receipts'").get() as { type: string; sql: string } | undefined
  const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE tbl_name='legacy_import_activation_receipts' AND type='trigger' ORDER BY name").all() as { name: string; sql: string }[]
  if (!table) { if (triggers.length) fail('ACTIVATION_SCHEMA_UNKNOWN'); return false }
  if (table.type !== 'table' || table.sql !== OFFLINE_ACTIVATION_RECEIPT_DDL || triggers.length !== receiptTriggers.length
    || receiptTriggers.some(sql => !triggers.some(t => t.sql === sql))) fail('ACTIVATION_SCHEMA_UNKNOWN')
  return true
}
function assertAdmin(db: Database.Database, id: number): void {
  const row = db.prepare('SELECT role,status FROM accounts WHERE id=?').get(id) as { role: string; status: string } | undefined
  if (row?.role !== 'admin' || row.status !== 'active') fail('ACTIVATION_EXISTING_ACTIVE_ADMIN_REQUIRED')
}

/** Read-only, secret-free preview. This first slice supports one staged source namespace only. */
export function inspectOfflineActivation(db: Database.Database, suppliedSource: LegacyWorldSource): OfflineActivationPreview {
  assertUnifiedIdentitySchema(db); assertAccountAllocatorReady(db); assertLegacyWorldStageSchema(db)
  if ((db.pragma('foreign_key_check') as unknown[]).length) fail('ACTIVATION_FOREIGN_KEYS_INVALID')
  const stages = db.prepare('SELECT namespace,source_digest,plan_digest,status FROM legacy_import_stage').all() as { namespace: string; source_digest: string; plan_digest: string; status: string }[]
  if (stages.length !== 1 || stages[0]!.namespace !== suppliedSource.manifest.namespace) fail('ACTIVATION_SINGLE_SOURCE_REQUIRED')
  const stage = stages[0]!
  const source = inspectLegacyWorldSource(suppliedSource.rawAccountsJson, suppliedSource.manifest.namespace, suppliedSource.rows)
  if (toCanonicalJson(source.manifest) !== toCanonicalJson(suppliedSource.manifest) || source.manifest.sourceDigest !== stage.source_digest
    || toCanonicalJson(source.roomState) !== toCanonicalJson(suppliedSource.roomState)) fail('ACTIVATION_SOURCE_CHANGED')
  if (source.manifest.unmappedRosterIds.length) fail('ACTIVATION_UNMAPPED_ACTORS')
  const archive = db.prepare('SELECT accounts_json,manifest_json,identities_json,archive_event_ids_json FROM legacy_import_private_sources WHERE namespace=?').get(stage.namespace) as { accounts_json: string; manifest_json: string; identities_json: string; archive_event_ids_json: string } | undefined
  if (!archive || archive.accounts_json !== source.rawAccountsJson || archive.manifest_json !== toCanonicalJson(source.manifest)) fail('ACTIVATION_ARCHIVE_CHANGED')
  const identities = JSON.parse(archive.identities_json) as StageIdentity[]
  const eventIds = JSON.parse(archive.archive_event_ids_json) as string[]
  if (!Array.isArray(identities) || identities.length !== source.accounts.length || new Set(identities.map(i => i.legacyId)).size !== identities.length
    || new Set(identities.map(i => i.accountId)).size !== identities.length) fail('ACTIVATION_MAPPING_CHANGED')
  const mapping = new Map<string, number>()
  const previewIdentities = identities.map(identity => {
    const original = source.accounts.find(a => a.id === identity.legacyId)
    if (!original || identity.namespace !== stage.namespace || !validId(identity.accountId)
      || !['create-disabled-player','preserve-existing'].includes(identity.action)) fail('ACTIVATION_MAPPING_CHANGED')
    const provenance = db.prepare('SELECT account_id FROM account_source_identities WHERE namespace=? AND legacy_id=?').get(stage.namespace, identity.legacyId) as { account_id: number } | undefined
    const alias = normalizeLoginAlias({ kind: 'username', value: original.username })
    const aliasOwner = db.prepare("SELECT account_id FROM account_login_aliases WHERE kind='username' AND normalized=?").get(alias.value) as { account_id: number } | undefined
    const account = db.prepare('SELECT role,status,password_hash,password_scheme FROM accounts WHERE id=?').get(identity.accountId) as { role: string; status: string; password_hash: string; password_scheme: string } | undefined
    if (provenance?.account_id !== identity.accountId || aliasOwner?.account_id !== identity.accountId || !account) fail('ACTIVATION_MAPPING_CHANGED')
    // New imports must retain their exact original verifier. Existing canonical credentials are never overwritten.
    if (identity.action === 'create-disabled-player' && (account.role !== 'player' || account.password_hash !== original.passwordHash || account.password_scheme !== 'legacy-mp-scrypt-v1')) fail('ACTIVATION_IMPORTED_ACCOUNT_CHANGED')
    if (identity.action === 'create-disabled-player' && (db.prepare('SELECT 1 FROM auth_sessions WHERE account_id=? LIMIT 1').get(identity.accountId)
      || db.prepare('SELECT 1 FROM auth_password_resets WHERE account_id=? LIMIT 1').get(identity.accountId))) fail('ACTIVATION_IMPORTED_AUTH_STATE_PRESENT')
    mapping.set(identity.legacyId, identity.accountId)
    return { legacyId: identity.legacyId, accountId: identity.accountId, action: identity.action, role: account.role, status: account.status }
  })
  verifyRecordedArchive(db, source, identities, stage.plan_digest, eventIds)
  const mapped = (id: string) => accountId(mapping.get(id) ?? fail('ACTIVATION_UNMAPPED_ACTORS'))
  const expectedState: PreservedHarborState = { tick: source.roomState.tick, config: { ...source.roomState.config }, players: source.roomState.players.map(p => ({ accountId: mapped(p.id), supplies: p.supplies, rewards: p.rewards })), contributors: source.roomState.contributors.map(mapped), completed: source.roomState.completed, closesAtTick: source.roomState.closesAtTick, awardedAccountIds: source.roomState.awardedPlayerIds.map(mapped) }
  if (!validatePreservedHarborState(expectedState)) fail('ACTIVATION_PROGRESS_INVALID')
  const otherHarborTypes = HARBOR_BEACON_EVENT_TYPES.filter(type => type !== 'HARBOR_BEACON_LEGACY_PROGRESS_RESTORED')
  if (db.prepare(`SELECT 1 FROM event_log WHERE event_type IN (${otherHarborTypes.map(() => '?').join(',')}) LIMIT 1`).get(...otherHarborTypes)) fail('ACTIVATION_PROGRESS_CHANGED')
  const restored = db.prepare("SELECT * FROM event_log WHERE event_type='HARBOR_BEACON_LEGACY_PROGRESS_RESTORED'").all() as LegacyEventRow[]
  if (restored.length !== 1) fail('ACTIVATION_REVIEWED_HARBOR_RESTORATION_REQUIRED')
  validateOfflineHarborRestoration(restored[0]!, { namespace: stage.namespace, sourceDigest: source.manifest.sourceDigest, state: expectedState })
  // SqliteEventStore constructor mutates schema; use direct read-only event rows instead.
  const positions = new PlayerWorldProjection()
  const placeholders = PLAYER_WORLD_POSITION_EVENT_TYPES.map(() => '?').join(',')
  for (const row of db.prepare(`SELECT * FROM event_log WHERE event_type IN (${placeholders}) ORDER BY sequence`).iterate(...PLAYER_WORLD_POSITION_EVENT_TYPES)) positions.project(rowEvent(row as LegacyEventRow))
  for (const player of source.roomState.players) {
    const position = positions.get(mapped(player.id))
    if (!position || position.tileId !== 't_dock' || position.x !== player.x || position.z !== player.z) fail('ACTIVATION_POSITION_CHANGED')
  }
  return { namespace: stage.namespace, sourceDigest: stage.source_digest, stagePlanDigest: stage.plan_digest,
    archiveDigest: digest(toCanonicalJson(archive)), progressDigest: digest(toCanonicalJson({ restored: restored[0], expectedState })),
    targetFingerprint: readCanonicalStageState(db).fingerprint, preservationSnapshot: preservationSnapshotDigest(db), identities: previewIdentities }
}

/** Pure validation against the canonical command/rule/projection contract, not a payload subset. */
export function validateOfflineHarborRestoration(row: LegacyEventRow, expected: { namespace: string; sourceDigest: string; state: PreservedHarborState }): void {
  if (!Number.isSafeInteger(row.sequence) || row.sequence <= 0 || !Number.isSafeInteger(row.tick) || row.tick === null || row.tick < 0
    || !Number.isSafeInteger(row.occurred_at) || row.occurred_at < 0 || row.ruleset_version !== PLAYER_WORLD_RULESET) fail('ACTIVATION_RESTORATION_METADATA_INVALID')
  const event = rowEvent(row)
  // Canonical projection validates actor, kind, beacon identity/clock, movementStep and exact restored-state structure.
  new HarborBeaconProjection().project(event)
  const payload = event.payload as { data?: { reviewReference?: string } }
  if (typeof payload.data?.reviewReference !== 'string' || !payload.data.reviewReference.trim()) fail('ACTIVATION_RESTORATION_METADATA_INVALID')
  const command = reviewedHarborRestorationCommand({ namespace: expected.namespace, sourceDigest: expected.sourceDigest, state: expected.state,
    reviewReference: payload.data.reviewReference, worldTick: row.tick, submittedAt: row.occurred_at })
  const result = new LivingWorldRuleEngine().evaluate(command, { rulesetVersion: PLAYER_WORLD_RULESET })
  if (!result.accepted) fail('ACTIVATION_RESTORATION_METADATA_INVALID')
  const draft = result.events[0]!
  if (row.event_type !== draft.eventType || row.actor_id !== draft.actorId || row.command_id !== draft.commandId
    || row.tick !== draft.tick || row.ruleset_version !== draft.rulesetVersion || row.version !== draft.version
    || row.event_id !== draft.eventId || row.deterministic_key !== draft.deterministicKey
    || row.payload_json !== toCanonicalJson(draft.payload)) fail('ACTIVATION_RESTORATION_METADATA_INVALID')
}

function bindPolicy(preview: OfflineActivationPreview, policy: OfflineActivationPolicy): void {
  for (const key of ['namespace','sourceDigest','stagePlanDigest','archiveDigest','progressDigest'] as const) {
    if (preview[key] !== policy[key]) fail('ACTIVATION_REVIEW_DRIFT')
  }
  if (preview.identities.length !== policy.identities.length) fail('ACTIVATION_DISPOSITIONS_INCOMPLETE')
  for (const identity of preview.identities) {
    const selected = policy.identities.find(item => item.legacyId === identity.legacyId && item.accountId === identity.accountId)
    if (!selected) fail('ACTIVATION_DISPOSITIONS_INCOMPLETE')
    if (identity.action === 'preserve-existing') {
      if (selected.disposition !== 'preserve-existing') fail('ACTIVATION_EXISTING_ACCOUNT_MUTATION_FORBIDDEN')
    } else if (selected.disposition === 'preserve-existing') fail('ACTIVATION_DISPOSITION_INVALID')
  }
}

type StoredReceipt = { version: number; policy_json: string; receipt_json: string; receipt_digest: string }
function readReceipt(db: Database.Database, namespace: string): StoredReceipt | undefined {
  if (!receiptSchemaExists(db)) return undefined
  return db.prepare('SELECT version,policy_json,receipt_json,receipt_digest FROM legacy_import_activation_receipts WHERE namespace=?').get(namespace) as StoredReceipt | undefined
}

/** Offline pre-cutover verification ONLY. Deliberately not called by the production boot gate.
 * Any intervening account/progress change requires a fresh review; never rolls back or reapplies statuses. */
export function verifyOfflineActivationReceipt(db: Database.Database, source: LegacyWorldSource, suppliedPolicy: OfflineActivationPolicy): Readonly<{ receipt: OfflineActivationReceipt; receiptDigest: string }> {
  const policy = validateOfflineActivationPolicy(suppliedPolicy), row = readReceipt(db, policy.namespace)
  if (!row || row.version !== 1 || row.policy_json !== toCanonicalJson(policy)
    || row.receipt_digest !== digest(row.receipt_json)) fail('ACTIVATION_RECEIPT_INVALID')
  const receipt = JSON.parse(row.receipt_json) as OfflineActivationReceipt
  if (!plain(receipt) || !exactKeys(receipt, ['version','namespace','sourceDigest','stagePlanDigest','archiveDigest','progressDigest','policyDigest','existingActiveAdminId','reviewReference','recordedAt','enabledAccountIds','appliedTargetFingerprint','preservationSnapshotBefore','preservationSnapshotAfter','productionBootEnabled'])
    || receipt.version !== 1 || receipt.productionBootEnabled !== false || !Number.isSafeInteger(receipt.recordedAt) || receipt.recordedAt < 0
    || receipt.policyDigest !== digest(row.policy_json) || receipt.existingActiveAdminId !== policy.existingActiveAdminId
    || receipt.reviewReference !== policy.reviewReference || !sha256.test(receipt.appliedTargetFingerprint)
    || receipt.preservationSnapshotBefore !== policy.expectedPreservationSnapshot || !sha256.test(receipt.preservationSnapshotAfter)
    || row.receipt_json !== toCanonicalJson(receipt)) fail('ACTIVATION_RECEIPT_INVALID')
  const preview = inspectOfflineActivation(db, source); bindPolicy(preview, policy); assertAdmin(db, policy.existingActiveAdminId)
  for (const key of ['namespace','sourceDigest','stagePlanDigest','archiveDigest','progressDigest'] as const) if (receipt[key] !== preview[key]) fail('ACTIVATION_RECEIPT_INVALID')
  const expectedEnabled = policy.identities.filter(i => i.disposition === 'enable-imported-player').map(i => i.accountId).sort((a,b) => a-b)
  if (toCanonicalJson(receipt.enabledAccountIds) !== toCanonicalJson(expectedEnabled)) fail('ACTIVATION_RECEIPT_INVALID')
  for (const selected of policy.identities) {
    const identity = preview.identities.find(i => i.accountId === selected.accountId)!
    if (selected.disposition === 'enable-imported-player' && (identity.role !== 'player' || identity.status !== 'active')
      || selected.disposition === 'keep-disabled' && (identity.role !== 'player' || identity.status !== 'disabled')) fail('ACTIVATION_ACCOUNT_DRIFT')
  }
  if (preview.targetFingerprint !== receipt.appliedTargetFingerprint) fail('ACTIVATION_TARGET_DRIFT')
  if (preview.preservationSnapshot !== receipt.preservationSnapshotAfter
    || preservationSnapshotDigest(db, expectedEnabled) !== receipt.preservationSnapshotBefore) fail('ACTIVATION_PRESERVATION_DRIFT')
  return { receipt, receiptDigest: row.receipt_digest }
}


/** Full offline preservation snapshot, excluding only this candidate's own receipt table.
 * Stream exact SQLite integers/blobs and stable primary-key ordering; never emit the snapshot bytes. */
function preservationSnapshotDigest(db: Database.Database, restoreDisabledIds: readonly number[] = []): string {
  const hash = createHash('sha256'), selected = new Set(restoreDisabledIds)
  const encode = (value: unknown): unknown => {
    if (typeof value === 'bigint') return { sqliteInteger: value.toString() }
    if (value instanceof Uint8Array) return { sqliteBlobHex: Buffer.from(value).toString('hex') }
    return value
  }
  const append = (value: unknown) => hash.update(toCanonicalJson(value) + '\n')
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'legacy_import_activation_receipts' ORDER BY name").all() as { name: string }[]
  if (tables.length > 512) fail('ACTIVATION_SNAPSHOT_SCHEMA_BOUNDS')
  for (const table of tables) {
    const columns = db.prepare("SELECT name,pk FROM pragma_table_xinfo(?, 'main') WHERE hidden=0 ORDER BY cid").all(table.name) as { name: string; pk: number }[]
    if (!columns.length || columns.length > 256) fail('ACTIVATION_SNAPSHOT_SCHEMA_BOUNDS')
    const primary = columns.filter(c => c.pk > 0).sort((a,b) => a.pk-b.pk)
    const order = (primary.length ? primary : columns).map(c => quote(c.name)).join(',')
    append({ table: table.name, columns: columns.map(c => c.name) })
    const rows = db.prepare(`SELECT * FROM ${quote(table.name)} ORDER BY ${order}`).safeIntegers().iterate()
    for (const raw of rows as Iterable<Record<string, unknown>>) {
      const row = { ...raw }
      if (table.name === 'accounts' && selected.has(Number(row.id))) row.status = 'disabled'
      append(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, encode(value)])))
    }
  }
  for (const row of db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name<>'legacy_import_activation_receipts' ORDER BY type,name").iterate()) append(row)
  return hash.digest('hex')
}

/** Explicit offline candidate. No file opening, live-data selection, role promotion, password rewrite,
 * archive deletion, EventLog write, production activation or deploy receipt is performed here. */
export function applyOfflineActivation(input: {
  db: Database.Database; source: LegacyWorldSource; policy: OfflineActivationPolicy; recordedAt: number
  failAfter?: (phase: 'accounts' | 'receipt') => void
}): Readonly<{ duplicate: boolean; receipt: OfflineActivationReceipt; receiptDigest: string }> {
  const { db, source } = input, policy = validateOfflineActivationPolicy(input.policy)
  if (db.inTransaction || Number(db.pragma('foreign_keys', { simple: true })) !== 1
    || !Number.isSafeInteger(input.recordedAt) || input.recordedAt < 0) fail('ACTIVATION_EXCLUSIVE_OFFLINE_TRANSACTION_REQUIRED')
  return db.transaction(() => {
    const prior = readReceipt(db, policy.namespace)
    if (prior) return { duplicate: true, ...verifyOfflineActivationReceipt(db, source, policy) }
    const preview = inspectOfflineActivation(db, source); bindPolicy(preview, policy); assertAdmin(db, policy.existingActiveAdminId)
    if (preview.targetFingerprint !== policy.expectedTargetFingerprint) fail('ACTIVATION_TARGET_DRIFT')
    if (preview.preservationSnapshot !== policy.expectedPreservationSnapshot) fail('ACTIVATION_PRESERVATION_DRIFT')
    for (const identity of preview.identities) if (identity.action === 'create-disabled-player' && identity.status !== 'disabled') fail('ACTIVATION_IMPORTED_ACCOUNT_CHANGED')
    if (!receiptSchemaExists(db)) {
      db.exec(OFFLINE_ACTIVATION_RECEIPT_DDL)
      for (const sql of receiptTriggers) db.exec(sql)
      receiptSchemaExists(db)
    }
    const enabledAccountIds = policy.identities.filter(i => i.disposition === 'enable-imported-player').map(i => i.accountId).sort((a,b) => a-b)
    const preservationSnapshotBefore = preview.preservationSnapshot
    for (const id of enabledAccountIds) {
      const update = db.prepare("UPDATE accounts SET status='active' WHERE id=? AND role='player' AND status='disabled'").run(id)
      if (update.changes !== 1) fail('ACTIVATION_ACCOUNT_DRIFT')
    }
    input.failAfter?.('accounts')
    const receipt: OfflineActivationReceipt = { version: 1, namespace: preview.namespace, sourceDigest: preview.sourceDigest,
      stagePlanDigest: preview.stagePlanDigest, archiveDigest: preview.archiveDigest, progressDigest: preview.progressDigest,
      policyDigest: digest(toCanonicalJson(policy)), existingActiveAdminId: policy.existingActiveAdminId,
      reviewReference: policy.reviewReference, recordedAt: input.recordedAt, enabledAccountIds,
      appliedTargetFingerprint: readCanonicalStageState(db).fingerprint, preservationSnapshotBefore,
      preservationSnapshotAfter: preservationSnapshotDigest(db), productionBootEnabled: false }
    const receiptJson = toCanonicalJson(receipt), receiptDigest = digest(receiptJson)
    db.prepare('INSERT INTO legacy_import_activation_receipts VALUES(?,1,?,?,?)').run(policy.namespace, toCanonicalJson(policy), receiptJson, receiptDigest)
    input.failAfter?.('receipt')
    if (preservationSnapshotDigest(db, enabledAccountIds) !== preservationSnapshotBefore) fail('ACTIVATION_PROTECTED_STATE_CHANGED')
    const verified = verifyOfflineActivationReceipt(db, source, policy)
    return { duplicate: false, ...verified }
  }).immediate()
}
