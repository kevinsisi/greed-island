import Database from 'better-sqlite3'
import { scryptSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { AuthService } from '../identity/authService.js'
import { applyLegacyWorldStage, readCanonicalStageState } from './legacyWorldImport.js'
import { inspectLegacyWorldSource } from './legacyWorldSource.js'
import { planLegacyWorldStage } from './legacyWorldPlan.js'
import { syntheticLegacySourceFixture } from './legacyWorld.testSupport.js'
import { stageReviewedLegacyHarborProgress } from './legacyHarborProgress.js'
import { assertLegacyWorldStageActivationReady } from './legacyWorldStageGate.js'
import { applyOfflineActivation, inspectOfflineActivation, verifyOfflineActivationReceipt, type OfflineActivationPolicy } from './legacyOfflineActivation.js'
const password = 'synthetic-original-password-42', salt = 'a'.repeat(32)
const originalVerifier = `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
function fixture(path = ':memory:', restore = true) {
  const db = new Database(path); db.pragma('foreign_keys=ON'); new SqliteEventStore(db); migrateIdentitySchema(db)
  db.prepare("INSERT INTO accounts(id,email,password_hash,password_scheme,created_at,role,status) VALUES(1,NULL,?,'scrypt-v1',0,'admin','active')").run(`scrypt-v1:${originalVerifier}`)
  // Reserve existing administrator's ID before computing the import plan.
  migrateIdentitySchema(db)
  const f = syntheticLegacySourceFixture(), accounts = JSON.parse(f.rawAccountsJson) as Array<{ passwordHash: string }>
  for (const account of accounts) account.passwordHash = originalVerifier
  const source = inspectLegacyWorldSource(JSON.stringify(accounts), 'synthetic-activation', () => f.rows)
  const plan = planLegacyWorldStage({ source, target: readCanonicalStageState(db) })
  applyLegacyWorldStage({ db, source, plan, purpose: 'synthetic-private-stage', recordedAt: 1 })
  if (restore) stageReviewedLegacyHarborProgress({ db, source, plan, purpose: 'synthetic-reviewed-harbor-association', reviewReference: 'synthetic-progress-reviewed', recordedAt: 2 })
  const policy = (): OfflineActivationPolicy => {
    const preview = inspectOfflineActivation(db, source)
    return { version: 1, purpose: 'reviewed-offline-activation', namespace: preview.namespace, sourceDigest: preview.sourceDigest,
      stagePlanDigest: preview.stagePlanDigest, archiveDigest: preview.archiveDigest, progressDigest: preview.progressDigest,
      expectedTargetFingerprint: preview.targetFingerprint, expectedPreservationSnapshot: preview.preservationSnapshot, existingActiveAdminId: 1, reviewReference: 'synthetic-owner-policy',
      identities: preview.identities.map((identity, index) => ({ legacyId: identity.legacyId, accountId: identity.accountId, disposition: index === 0 ? 'enable-imported-player' : 'keep-disabled' })) }
  }
  const apply = (selected = policy(), failAfter?: (phase: 'accounts' | 'receipt') => void) => applyOfflineActivation({ db, source, policy: selected, recordedAt: 3, ...(failAfter ? { failAfter } : {}) })
  return { db, source, plan, policy, apply }
}
function protectedBytes(db: Database.Database) {
  return toCanonicalJson({ accounts: db.prepare('SELECT * FROM accounts ORDER BY id').all(), archive: db.prepare('SELECT * FROM legacy_import_private_sources ORDER BY namespace').all(), stages: db.prepare('SELECT * FROM legacy_import_stage ORDER BY namespace').all(), events: db.prepare('SELECT * FROM event_log ORDER BY sequence').all() })
}
describe('explicit offline activation candidate with actual SQLite', () => {
  it('enables only selected imported players, preserves original credentials/admin/archive, and never opens the production gate', async () => {
    const { db, source, policy, apply } = fixture()
    try {
      const selected = policy(), beforeEvents = db.prepare('SELECT * FROM event_log ORDER BY sequence').all()
      const beforeArchive = db.prepare('SELECT * FROM legacy_import_private_sources').all()
      const admin = db.prepare('SELECT * FROM accounts WHERE id=1').get()
      const result = apply(selected)
      expect(result.duplicate).toBe(false); expect(result.receipt.productionBootEnabled).toBe(false)
      expect(result.receipt.enabledAccountIds).toEqual([selected.identities[0]!.accountId])
      expect(db.prepare('SELECT role,status,password_hash FROM accounts WHERE id=?').get(selected.identities[0]!.accountId)).toEqual({ role: 'player', status: 'active', password_hash: originalVerifier })
      expect(db.prepare('SELECT role,status FROM accounts WHERE id=?').get(selected.identities[1]!.accountId)).toEqual({ role: 'player', status: 'disabled' })
      expect(db.prepare('SELECT * FROM accounts WHERE id=1').get()).toEqual(admin)
      expect(db.prepare('SELECT * FROM event_log ORDER BY sequence').all()).toEqual(beforeEvents)
      expect(db.prepare('SELECT * FROM legacy_import_private_sources').all()).toEqual(beforeArchive)
      expect(verifyOfflineActivationReceipt(db, source, selected).receiptDigest).toBe(result.receiptDigest)
      expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('ACTIVATION_REVIEW_REQUIRED')
      const auth = new AuthService(db, { allowedOrigins: ['http://127.0.0.1:4178'], secureCookies: false })
      const sourceAccount = source.accounts.find(a => a.id === selected.identities[0]!.legacyId)!
      expect((await auth.login({ kind: 'username', value: sourceAccount.username }, password, 'http://127.0.0.1:4178'))?.principal.accountId).toBe(selected.identities[0]!.accountId)
      const disabled = source.accounts.find(a => a.id === selected.identities[1]!.legacyId)!
      expect(await auth.login({ kind: 'username', value: disabled.username }, password, 'http://127.0.0.1:4178')).toBeNull()
    } finally { db.close() }
  })
  it.each(['accounts','receipt'] as const)('rolls back every write after %s failure', phase => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(), before = protectedBytes(db)
      expect(() => apply(selected, current => { if (current === phase) throw new Error('synthetic interrupted activation') })).toThrow('synthetic interrupted activation')
      expect(protectedBytes(db)).toBe(before)
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='legacy_import_activation_receipts'").get()).toBeUndefined()
    } finally { db.close() }
  })
  it('reopens durably, verifies on a readonly handle, and makes identical retry a no-write result', () => {
    const dir = mkdtempSync(join(tmpdir(), 'greed-activation-')), path = join(dir, 'staged.sqlite')
    let db: Database.Database | undefined
    try {
      const initial = fixture(path); db = initial.db; const selected = initial.policy(), result = initial.apply(selected), source = initial.source
      db.close(); db = new Database(path, { readonly: true, fileMustExist: true })
      expect(verifyOfflineActivationReceipt(db, source, selected).receiptDigest).toBe(result.receiptDigest)
      db.close(); db = new Database(path, { fileMustExist: true }); db.pragma('foreign_keys=ON')
      const before = protectedBytes(db)
      expect(applyOfflineActivation({ db, source, policy: selected, recordedAt: 999 })).toMatchObject({ duplicate: true, receiptDigest: result.receiptDigest })
      expect(protectedBytes(db)).toBe(before)
      expect(db.prepare('SELECT COUNT(*) AS n FROM legacy_import_activation_receipts').get()).toEqual({ n: 1 })
    } finally { db?.close(); rmSync(dir, { recursive: true, force: true }) }
  })
  it('rejects a missing or changed reviewed harbor restoration', () => {
    const { db, source } = fixture(':memory:', false)
    try { expect(() => inspectOfflineActivation(db, source)).toThrow('ACTIVATION_REVIEWED_HARBOR_RESTORATION_REQUIRED') } finally { db.close() }
  })
  it('rejects target credential drift without overwriting the later credential', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(); db.prepare('UPDATE accounts SET password_hash=? WHERE id=1').run(`scrypt-v1:${'b'.repeat(32)}:${'c'.repeat(64)}`)
      const before = protectedBytes(db); expect(() => apply(selected)).toThrow('ACTIVATION_TARGET_DRIFT'); expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('never trusts a source admin claim or an explicitly selected inactive/non-admin account', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(), before = protectedBytes(db)
      expect(() => apply({ ...selected, existingActiveAdminId: selected.identities[0]!.accountId })).toThrow('ACTIVATION_EXISTING_ACTIVE_ADMIN_REQUIRED')
      expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('requires exact complete per-account decisions and rejects changed approval digests', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(), before = protectedBytes(db)
      expect(() => apply({ ...selected, identities: selected.identities.slice(0,1) })).toThrow('ACTIVATION_DISPOSITIONS_INCOMPLETE')
      expect(() => apply({ ...selected, progressDigest: '0'.repeat(64) })).toThrow('ACTIVATION_REVIEW_DRIFT')
      expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('rejects alias drift and never repairs a reassigned identity', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(); db.prepare("UPDATE account_login_aliases SET normalized='changed-name' WHERE account_id=?").run(selected.identities[0]!.accountId)
      const before = protectedBytes(db); expect(() => apply(selected)).toThrow('ACTIVATION_MAPPING_CHANGED'); expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('rejects imported auth artifacts rather than reviving an old session', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(); db.prepare('INSERT INTO auth_sessions VALUES(?,?,0,9999999999999,NULL)').run('synthetic-token-hash', selected.identities[0]!.accountId)
      const before = protectedBytes(db); expect(() => apply(selected)).toThrow('ACTIVATION_IMPORTED_AUTH_STATE_PRESENT'); expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('fails closed on unknown receipt schema and post-activation status drift without re-enabling anyone', () => {
    const first = fixture()
    try { const selected = first.policy(); first.db.exec('CREATE TABLE legacy_import_activation_receipts(namespace TEXT)'); expect(() => first.apply(selected)).toThrow('ACTIVATION_SCHEMA_UNKNOWN') } finally { first.db.close() }
    const { db, source, policy, apply } = fixture()
    try {
      const selected = policy(); apply(selected); db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").run(selected.identities[0]!.accountId)
      const before = protectedBytes(db); expect(() => verifyOfflineActivationReceipt(db, source, selected)).toThrow('ACTIVATION_ACCOUNT_DRIFT')
      expect(() => apply(selected)).toThrow('ACTIVATION_ACCOUNT_DRIFT'); expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('rejects immutable receipt edits and changed policy retries', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(); apply(selected)
      expect(() => db.prepare("UPDATE legacy_import_activation_receipts SET receipt_digest='changed'").run()).toThrow('immutable')
      expect(() => db.prepare('DELETE FROM legacy_import_activation_receipts').run()).toThrow('immutable')
      expect(() => apply({ ...selected, reviewReference: 'different-owner-review' })).toThrow('ACTIVATION_RECEIPT_INVALID')
    } finally { db.close() }
  })
})

function rewriteHistoricalAuditForTest(db: Database.Database): void {
  // Simulate a corrupt file while restoring the exact original append-only trigger.
  const trigger = db.prepare("SELECT sql FROM sqlite_master WHERE name='event_log_no_update'").get() as { sql: string }
  db.exec('DROP TRIGGER event_log_no_update')
  try { db.prepare("UPDATE event_log SET occurred_at=occurred_at+1 WHERE sequence=(SELECT MIN(sequence) FROM event_log WHERE event_type='LEGACY_WORLD_PRIVATE_ARCHIVE_V1')").run() }
  finally { db.exec(trigger.sql) }
}
const fullSnapshotDrifts: readonly [string, (db: Database.Database) => void][] = [
  ['password scheme', db => { db.prepare("UPDATE accounts SET password_scheme='bcrypt-v1' WHERE id=1").run() }],
  ['profile nickname', db => { db.prepare("UPDATE accounts SET nickname='changed after review' WHERE id=1").run() }],
  ['admin session', db => { db.prepare('INSERT INTO auth_sessions VALUES(?,1,0,9999999999999,NULL)').run('synthetic-admin-session') }],
  ['admin reset', db => { db.prepare('INSERT INTO auth_password_resets VALUES(?,1,?,0,9999999999999,NULL)').run('synthetic-admin-reset', 'synthetic-fingerprint') }],
  ['stage audit metadata', db => { db.prepare('UPDATE legacy_import_stage SET imported_at=imported_at+1').run() }],
  ['stage owner selection', db => { db.prepare("UPDATE legacy_import_stage SET owner_selection_json='{}'").run() }],
  ['historical event audit bytes', rewriteHistoricalAuditForTest],
]
describe('activation-specific full preservation snapshot binding', () => {
  it.each(fullSnapshotDrifts)('rejects pre-apply %s drift that the ordinary identity fingerprint omits', (_name, mutate) => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(), identityFingerprint = readCanonicalStageState(db).fingerprint
      mutate(db)
      expect(readCanonicalStageState(db).fingerprint).toBe(identityFingerprint)
      const before = protectedBytes(db)
      expect(() => apply(selected)).toThrow('ACTIVATION_PRESERVATION_DRIFT')
      expect(protectedBytes(db)).toBe(before)
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='legacy_import_activation_receipts'").get()).toBeUndefined()
    } finally { db.close() }
  })
  it.each(fullSnapshotDrifts)('rejects post-receipt %s drift without reapplying statuses', (_name, mutate) => {
    const { db, source, policy, apply } = fixture()
    try {
      const selected = policy(), result = apply(selected), identityFingerprint = readCanonicalStageState(db).fingerprint
      expect(result.receipt.preservationSnapshotBefore).toBe(selected.expectedPreservationSnapshot)
      expect(result.receipt.preservationSnapshotAfter).not.toBe(result.receipt.preservationSnapshotBefore)
      mutate(db)
      expect(readCanonicalStageState(db).fingerprint).toBe(identityFingerprint)
      const before = protectedBytes(db)
      expect(() => verifyOfflineActivationReceipt(db, source, selected)).toThrow('ACTIVATION_PRESERVATION_DRIFT')
      expect(() => apply(selected)).toThrow('ACTIVATION_PRESERVATION_DRIFT')
      expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
  it('binds complete restoration audit metadata rather than only event ID and payload', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(), trigger = db.prepare("SELECT sql FROM sqlite_master WHERE name='event_log_no_update'").get() as { sql: string }
      db.exec('DROP TRIGGER event_log_no_update')
      db.prepare("UPDATE event_log SET occurred_at=occurred_at+1 WHERE event_type='HARBOR_BEACON_LEGACY_PROGRESS_RESTORED'").run()
      db.exec(trigger.sql)
      expect(() => apply(selected)).toThrow('ACTIVATION_REVIEW_DRIFT')
    } finally { db.close() }
  })
  it('rolls back unintended profile mutation inside the status transaction even if a receipt was built', () => {
    const { db, policy, apply } = fixture()
    try {
      const selected = policy(), before = protectedBytes(db)
      expect(() => apply(selected, phase => { if (phase === 'accounts') db.prepare("UPDATE accounts SET nickname='unexpected trigger effect' WHERE id=1").run() })).toThrow('ACTIVATION_PROTECTED_STATE_CHANGED')
      expect(protectedBytes(db)).toBe(before)
    } finally { db.close() }
  })
})

describe('preservation snapshot covers complete staged database rows', () => {
  it('binds unrelated stored progress and exact 64-bit integers, not rounded JavaScript numbers', () => {
    const { db, policy, apply } = fixture()
    try {
      db.exec("CREATE TABLE synthetic_preserved_progress(id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL, proof BLOB NOT NULL); INSERT INTO synthetic_preserved_progress VALUES(1,9007199254740992,x'0001fe')")
      const selected = policy(), ordinary = readCanonicalStageState(db).fingerprint
      db.exec('UPDATE synthetic_preserved_progress SET quantity=9007199254740993 WHERE id=1')
      expect(readCanonicalStageState(db).fingerprint).toBe(ordinary)
      expect(() => apply(selected)).toThrow('ACTIVATION_PRESERVATION_DRIFT')
    } finally { db.close() }
  })
  it('binds binary preservation data after receipt creation', () => {
    const { db, source, policy, apply } = fixture()
    try {
      db.exec("CREATE TABLE synthetic_preserved_progress(id INTEGER PRIMARY KEY, proof BLOB NOT NULL); INSERT INTO synthetic_preserved_progress VALUES(1,x'0001fe')")
      const selected = policy(); apply(selected)
      db.exec("UPDATE synthetic_preserved_progress SET proof=x'0001ff' WHERE id=1")
      expect(() => verifyOfflineActivationReceipt(db, source, selected)).toThrow('ACTIVATION_PRESERVATION_DRIFT')
    } finally { db.close() }
  })
})
