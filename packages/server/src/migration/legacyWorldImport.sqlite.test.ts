import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountId } from '../identity/principal.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { readCanonicalAccountIdAuthority, assertAccountAllocatorReady } from '../identity/accountIdAuthority.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { applyLegacyWorldStage, readCanonicalStageState } from './legacyWorldImport.js'
import { inspectLegacyWorldSource, readLegacyWorldSourceFiles, digest } from './legacyWorldSource.js'
import { planLegacyWorldStage } from './legacyWorldPlan.js'
import { assertLegacyWorldStageActivationReady } from './legacyWorldStageGate.js'
import { LEGACY_STAGE_MARKER_DDL, LEGACY_STAGE_PRIVATE_DDL } from './legacyWorldStageSchema.js'
import { LEGACY_ARCHIVE_EVENT_TYPE } from './legacyWorldRules.js'
import { SYNTHETIC_LEGACY_HASH, syntheticLegacySourceFixture } from './legacyWorld.testSupport.js'

const canonicalHash = 'scrypt-v1:' + '0'.repeat(32) + ':' + '0'.repeat(64)
function destination(path = ':memory:') {
  const db = new Database(path); db.pragma('foreign_keys=ON'); const store = new SqliteEventStore(db)
  migrateIdentitySchema(db)
  db.prepare("INSERT INTO accounts(id,email,password_hash,password_scheme,created_at,role,status,display_name) VALUES(7,'canonical-owner@example.test',?,'scrypt-v1',1,'admin','active','Canonical Owner')").run(canonicalHash)
  db.prepare("INSERT INTO account_login_aliases VALUES('email','canonical-owner@example.test','canonical-owner@example.test',7)").run()
  db.exec('CREATE TABLE synthetic_existing_wallet(account_id INTEGER PRIMARY KEY REFERENCES accounts(id),balance INTEGER NOT NULL); INSERT INTO synthetic_existing_wallet VALUES(7,321)')
  store.appendEvents([{ eventId: 'prior-account-history', eventType: 'FACT_SET', actorId: '19', occurredAt: 0, version: 1,
    deterministicKey: 'prior-account-history', payload: { key: 'synthetic.reviewed-account', value: { accountId: 150 } } }])
  return { db, store }
}
function source() { const fixture = syntheticLegacySourceFixture(); return inspectLegacyWorldSource(fixture.rawAccountsJson, 'synthetic-l390', () => fixture.rows) }
function plan(db: Database.Database, value = source()) { return planLegacyWorldStage({ source: value, target: readCanonicalStageState(db) }) }
function apply(db: Database.Database, value = source(), reviewed = plan(db, value), failAfter?: (phase: string) => void) {
  return applyLegacyWorldStage({ db, source: value, plan: reviewed, purpose: 'synthetic-private-stage', recordedAt: 100, ...(failAfter ? { failAfter } : {}) })
}
function inventory(db: Database.Database) {
  return toCanonicalJson({ tables: db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),
    accounts: db.prepare('SELECT * FROM accounts ORDER BY id').all(), aliases: db.prepare('SELECT * FROM account_login_aliases ORDER BY kind,normalized').all(),
    provenance: db.prepare('SELECT * FROM account_source_identities ORDER BY namespace,legacy_id').all(), events: db.prepare('SELECT * FROM event_log ORDER BY sequence').all(),
    sequences: db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all(), wallet: db.prepare('SELECT * FROM synthetic_existing_wallet').all() })
}
describe('source-only private staged import actual SQLite', () => {
  it('dry-runs actual synthetic files without writes and preserves their exact hashes/progress/event bytes in the same canonical EventLog', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-stage-synthetic-')), accountsPath = join(directory, 'accounts.json'), roomPath = join(directory, 'room.sqlite')
    const fixture = syntheticLegacySourceFixture(); writeFileSync(accountsPath, fixture.rawAccountsJson)
    const legacy = new Database(roomPath); new SqliteEventStore(legacy)
    const insert = legacy.prepare('INSERT INTO event_log(sequence,event_id,event_type,occurred_at,actor_id,command_id,tick,ruleset_version,payload_json,version,deterministic_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    // Formatting in payload_json is source evidence, not normalized away by import.
    const rows = fixture.rows.map((row, index) => index === 0 ? { ...row, payload_json: JSON.stringify(JSON.parse(row.payload_json), null, 2) } : row)
    legacy.transaction(() => { for (const row of rows) insert.run(row.sequence,row.event_id,row.event_type,row.occurred_at,row.actor_id,row.command_id,row.tick,row.ruleset_version,row.payload_json,row.version,row.deterministic_key) })(); legacy.close()
    const beforeAccounts = digest(readFileSync(accountsPath, 'utf8')), beforeRoom = digest(readFileSync(roomPath).toString('base64'))
    const { db, store } = destination(); let value: ReturnType<typeof readLegacyWorldSourceFiles> | undefined
    try {
      value = readLegacyWorldSourceFiles({ accountsPath, roomPath, namespace: 'synthetic-l390' })
      const before = inventory(db), reviewed = plan(db, value); expect(inventory(db)).toBe(before); expect(reviewed.identities.map(identity => identity.accountId)).toEqual([151,152])
      const result = apply(db, value, reviewed); expect(result).toMatchObject({ duplicate: false, createdDisabledAccounts: 2, archivedSourceEvents: 307, activationReady: false })
      const imported = db.prepare('SELECT id,password_hash,password_scheme,role,status FROM accounts WHERE id>7 ORDER BY id').all()
      expect(imported).toEqual([151,152].map(id => ({ id, password_hash: SYNTHETIC_LEGACY_HASH, password_scheme: 'legacy-mp-scrypt-v1', role: 'player', status: 'disabled' })))
      expect(db.prepare('SELECT balance FROM synthetic_existing_wallet WHERE account_id=7').get()).toEqual({ balance: 321 })
      const archive = store.readEventsByTypes([LEGACY_ARCHIVE_EVENT_TYPE]); expect(archive).toHaveLength(3)
      const payloads = archive.map(event => event.payload as { kind: string; data: unknown })
      expect(payloads.filter(payload => payload.kind === 'source-event-batch').flatMap(payload => payload.data)).toEqual(rows)
      expect(payloads.at(-1)!.data).toMatchObject({ stateJson: toCanonicalJson(value.roomState), disposition: 'private-exact-unmapped', activationReady: false })
      expect(archive.every(event => event.tick === undefined)).toBe(true)
      expect(JSON.stringify(archive)).not.toContain(SYNTHETIC_LEGACY_HASH)
      expect(db.prepare('SELECT accounts_json FROM legacy_import_private_sources').get()).toEqual({ accounts_json: fixture.rawAccountsJson })
      expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('LEGACY_STAGE_ACTIVATION_REVIEW_REQUIRED')
      assertAccountAllocatorReady(db); expect(readCanonicalAccountIdAuthority(db)).toBe(152)
    } finally { value?.close?.(); db.close(); expect(digest(readFileSync(accountsPath, 'utf8'))).toBe(beforeAccounts); expect(digest(readFileSync(roomPath).toString('base64'))).toBe(beforeRoom); rmSync(directory, { recursive: true, force: true }) }
  })
  for (const phase of ['identities','archive-events','before-commit']) it(`rolls all identities, archive facts, private tables and allocator writes back after ${phase}`, () => {
    const { db } = destination()
    try { const before = inventory(db); expect(() => apply(db, source(), undefined, reached => { if (reached === phase) throw new Error('synthetic rollback') })).toThrow('synthetic rollback')
      expect(inventory(db)).toBe(before); expect(db.prepare("SELECT name FROM sqlite_master WHERE name='legacy_import_stage'").get()).toBeUndefined()
    } finally { db.close() }
  })
  it('retries after durable reopen without duplicating events or overwriting later canonical credentials/profile/role', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-stage-reopen-')), path = join(directory, 'stage.sqlite'); let db = destination(path).db
    try {
      const value = source(), reviewed = plan(db, value), first = apply(db, value, reviewed)
      db.prepare("UPDATE accounts SET password_hash=?,password_scheme='scrypt-v1',role='gm',display_name='Reviewed Rename' WHERE id=151").run(canonicalHash)
      db.close(); db = new Database(path); db.pragma('foreign_keys=ON')
      const before = inventory(db), retry = apply(db, value, reviewed)
      expect(retry).toMatchObject({ duplicate: true, createdDisabledAccounts: 0, archiveEventIds: first.archiveEventIds }); expect(inventory(db)).toBe(before)
      expect(db.prepare('SELECT password_hash,role,display_name FROM accounts WHERE id=151').get()).toEqual({ password_hash: canonicalHash, role: 'gm', display_name: 'Reviewed Rename' })
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('blocks target/source changes and corrupt private archive retries without mutation', () => {
    const { db } = destination()
    try {
      const value = source(), reviewed = plan(db, value); db.prepare("UPDATE accounts SET role='gm' WHERE id=7").run()
      const before = inventory(db); expect(() => apply(db, value, reviewed)).toThrow('CANONICAL_TARGET_CHANGED'); expect(inventory(db)).toBe(before)
      const current = plan(db, value); apply(db, value, current)
      const changedFixture = syntheticLegacySourceFixture(); const changed = inspectLegacyWorldSource(changedFixture.rawAccountsJson + '\n', 'synthetic-l390', () => changedFixture.rows)
      expect(() => apply(db, changed)).toThrow('SOURCE_MANIFEST_CHANGED')
      db.prepare("UPDATE legacy_import_private_sources SET archive_event_ids_json='[]'").run(); const after = inventory(db)
      expect(() => apply(db, value)).toThrow('STAGED_ARCHIVE_INCOMPLETE'); expect(inventory(db)).toBe(after)
    } finally { db.close() }
  })
  it('rejects NULL-status or malformed collided staging markers before readiness or writes', () => {
    const { db } = destination()
    try {
      const value = source(), reviewed = plan(db, value)
      db.exec("CREATE TABLE legacy_import_stage(namespace TEXT PRIMARY KEY,status TEXT); INSERT INTO legacy_import_stage VALUES('synthetic-collision',NULL)")
      expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED')
      const before = inventory(db); expect(() => apply(db, value, reviewed)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED'); expect(inventory(db)).toBe(before)
    } finally { db.close() }
  })
  it('rejects empty marker tables whose CHECK quoted literal only appears equivalent after lowercasing or removing spaces', () => {
    for (const literal of ['PENDING-OWNER-AND-ACTIVATION-REVIEW', 'pending -owner-and-activation-review']) {
      const { db } = destination()
      try {
        db.exec(`${LEGACY_STAGE_MARKER_DDL.replace('pending-owner-and-activation-review', literal)}; ${LEGACY_STAGE_PRIVATE_DDL};`)
        expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED')
        const value = source(), reviewed = plan(db, value), before = inventory(db)
        expect(() => apply(db, value, reviewed)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED'); expect(inventory(db)).toBe(before)
      } finally { db.close() }
    }
  })
  it('rejects an empty TEXTNOT NULL type-token schema that would have normalized into a NOT NULL constraint', () => {
    const { db } = destination()
    try {
      db.exec(`${LEGACY_STAGE_MARKER_DDL.replaceAll('TEXT NOT NULL','TEXTNOT NULL')}; ${LEGACY_STAGE_PRIVATE_DDL};`)
      expect((db.prepare('PRAGMA table_info(legacy_import_stage)').all() as Array<{ name: string; notnull: number }>).find(column => column.name === 'status')?.notnull).toBe(0)
      expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED')
      const value = source(), reviewed = plan(db, value), before = inventory(db)
      expect(() => apply(db, value, reviewed)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED'); expect(inventory(db)).toBe(before)
    } finally { db.close() }
  })
  it('accepts the exact valid empty schema and its required pending-status insert, then keeps activation blocked', () => {
    const { db } = destination()
    try {
      db.exec(`${LEGACY_STAGE_MARKER_DDL}; ${LEGACY_STAGE_PRIVATE_DDL};`)
      expect(() => assertLegacyWorldStageActivationReady(db)).not.toThrow()
      expect(apply(db).createdDisabledAccounts).toBe(2)
      expect(db.prepare('SELECT status FROM legacy_import_stage').get()).toEqual({ status: 'pending-owner-and-activation-review' })
      expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('LEGACY_STAGE_ACTIVATION_REVIEW_REQUIRED')
    } finally { db.close() }
  })
  for (const drift of ['missing','reassigned']) it(`rejects verified retries after ${drift} source alias drift without restoring or overwriting the alias`, () => {
    const { db } = destination()
    try {
      const value = source(), reviewed = plan(db, value); apply(db, value, reviewed)
      if (drift === 'missing') db.prepare("DELETE FROM account_login_aliases WHERE kind='username' AND normalized='kevin950805'").run()
      else db.prepare("UPDATE account_login_aliases SET account_id=7 WHERE kind='username' AND normalized='kevin950805'").run()
      const before = inventory(db); expect(() => apply(db, value, reviewed)).toThrow('STAGED_ALIAS_CHANGED'); expect(inventory(db)).toBe(before)
    } finally { db.close() }
  })
  it('rejects a forged allocation below historical authority even with a self-consistent descriptor digest', () => {
    const { db } = destination()
    try {
      const value = source(), reviewed = plan(db, value), { planDigest: _, ...descriptor } = reviewed
      const forged = { ...descriptor, identities: descriptor.identities.map((identity, index) => ({ ...identity, accountId: accountId(30 + index) })) }
      const before = inventory(db)
      expect(() => apply(db, value, { ...forged, planDigest: digest(toCanonicalJson(forged)) })).toThrow('PLAN_CHANGED')
      expect(inventory(db)).toBe(before)
    } finally { db.close() }
  })
  it('preserves existing canonical owner role/hash and reserves historical IDs even with zero new imported accounts', () => {
    const { db } = destination()
    try {
      db.prepare("INSERT INTO accounts(id,password_hash,password_scheme,created_at,role,status,display_name) VALUES(8,?,'scrypt-v1',1,'gm','active','Canonical Player')").run(canonicalHash)
      const value = source(), reviewed = planLegacyWorldStage({ source: value, target: readCanonicalStageState(db), reviewedLinks: [
        { namespace: 'synthetic-l390', legacyId: 'legacy-owner', accountId: accountId(7), reviewReference: 'synthetic-owner-proof', credentialDisposition: 'keep-canonical' },
        { namespace: 'synthetic-l390', legacyId: 'legacy-player', accountId: accountId(8), reviewReference: 'synthetic-player-proof', credentialDisposition: 'keep-canonical' },
      ], ownerSelection: { namespace: 'synthetic-l390', legacyId: 'legacy-owner', accountId: accountId(7), verifiedByOperator: true, reviewReference: 'synthetic-owner-proof' } })
      expect(apply(db, value, reviewed).createdDisabledAccounts).toBe(0)
      expect(db.prepare('SELECT id,role,password_hash,status FROM accounts ORDER BY id').all()).toEqual([
        { id: 7, role: 'admin', password_hash: canonicalHash, status: 'active' }, { id: 8, role: 'gm', password_hash: canonicalHash, status: 'active' }])
      expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()).toEqual({ seq: 150 }); assertAccountAllocatorReady(db)
      expect(() => assertLegacyWorldStageActivationReady(db)).toThrow('REVIEW_REQUIRED')
    } finally { db.close() }
  })
})
