import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateIdentitySchema } from '../identity/schema.js'
import { emptyState } from '../multiplayer/domain.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { createUnifiedServer } from '../bootstrap/unifiedServer.js'
import { syntheticLegacySourceFixture, SYNTHETIC_LEGACY_HASH } from './legacyWorld.testSupport.js'
import { planL390LegacyImport } from './l390LegacyReview.js'
import { applyL390LegacyImport, verifyL390LegacyImport } from './l390LegacyApply.js'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })

function backupSizedSourceFixture() {
  const base = syntheticLegacySourceFixture(false)
  const accounts = JSON.parse(base.rawAccountsJson) as Array<{ id: string; name: string; username: string; passwordHash: string; role: string }>
  accounts.push({ id: 'legacy-player-2', name: 'Synthetic Player Two', username: 'fixture-player-two', passwordHash: SYNTHETIC_LEGACY_HASH, role: 'player' })
  accounts.push({ id: 'legacy-player-3', name: 'Synthetic Player Three', username: 'fixture-player-three', passwordHash: SYNTHETIC_LEGACY_HASH, role: 'player' })
  const players = Array.from({ length: 54 }, (_, index) => ({ id: accounts[index]?.id ?? `legacy-roster-${index}`,
    name: `Synthetic Room Player ${index}`, x: 0, z: 6, supplies: 1, rewards: 0 }))
  const rows: Array<{ sequence: number; event_id: string; event_type: string; occurred_at: number; actor_id: string;
    command_id: string | null; tick: number | null; ruleset_version: string | null; payload_json: string; version: number; deterministic_key: string }> = []
  const append = (eventType: string, actorId: string, payload: unknown, tick: number | null) => {
    const sequence = rows.length + 1
    rows.push({ sequence, event_id: `synthetic-l390-event-${sequence}`, event_type: eventType, occurred_at: sequence,
      actor_id: actorId, command_id: null, tick, ruleset_version: null, payload_json: toCanonicalJson(payload),
      version: 1, deterministic_key: `synthetic-l390-key-${sequence}` })
  }
  append('MP_INITIALIZED', 'system', { config: emptyState().config, players }, 0)
  for (const player of players.slice(0, 50)) {
    append('MP_CONTRIBUTED', player.id, { playerId: player.id, beaconId: 'synthetic-beacon' }, 1)
    append('MP_REWARDED', 'system', { playerId: player.id, beaconId: 'synthetic-beacon' }, 1)
  }
  return { rawAccountsJson: JSON.stringify(accounts, null, 2), rows }
}

function replaceValue(value: unknown, from: string, to: string): unknown {
  if (value === from) return to
  if (Array.isArray(value)) return value.map(item => replaceValue(item, from, to))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceValue(child, from, to)]))
  return value
}

function fixture(options: { secondAdmin?: boolean; l390Backup?: boolean; safeAdminId?: string } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'greed-l390-apply-')); directories.push(directory)
  const sourceDirectory = join(directory, 'source'); mkdirSync(sourceDirectory)
  const sourceFixture = options.l390Backup ? backupSizedSourceFixture() : syntheticLegacySourceFixture()
  const accounts = JSON.parse(sourceFixture.rawAccountsJson) as Array<{ id: string; name: string; username: string; passwordHash: string; role: string }>
  if (options.safeAdminId) {
    const owner = accounts.find(account => account.role === 'admin')!
    const previousId = owner.id; owner.id = options.safeAdminId
    sourceFixture.rows = sourceFixture.rows.map(row => ({ ...row,
      actor_id: row.actor_id === previousId ? options.safeAdminId! : row.actor_id,
      payload_json: toCanonicalJson(replaceValue(JSON.parse(row.payload_json), previousId, options.safeAdminId!)),
    }))
  }
  if (options.secondAdmin) accounts.push({ id: 'legacy-admin-secondary', name: 'Synthetic Secondary Admin', username: 'secondary-admin',
    passwordHash: SYNTHETIC_LEGACY_HASH, role: 'admin' })
  const accountsPath = join(sourceDirectory, 'accounts.json'), roomPath = join(sourceDirectory, 'room.sqlite')
  writeFileSync(accountsPath, JSON.stringify(accounts, null, 2))
  const sourceDb = new Database(roomPath); new SqliteEventStore(sourceDb)
  const insert = sourceDb.prepare('INSERT INTO event_log(sequence,event_id,event_type,occurred_at,actor_id,command_id,tick,ruleset_version,payload_json,version,deterministic_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  sourceDb.transaction(() => { for (const row of sourceFixture.rows) insert.run(row.sequence, row.event_id, row.event_type, row.occurred_at,
    row.actor_id, row.command_id, row.tick, row.ruleset_version, row.payload_json, row.version, row.deterministic_key) })()
  sourceDb.close()
  const canonicalPath = join(directory, 'greed-island.sqlite')
  const namespace = options.l390Backup ? 'l390' : 'synthetic-l390'
  const reviewPlan = planL390LegacyImport({ sourceDirectory, namespace, canonicalDatabasePath: canonicalPath })
  return { directory, sourceDirectory, accountsPath, roomPath, canonicalPath, accounts, namespace, reviewPlan }
}

function applyInput(value: ReturnType<typeof fixture>, options: { ownerLegacyId?: string; ownerSelectionIndex?: number; omitOwner?: boolean; activateAccounts?: boolean; reviewPlan?: unknown } = {}) {
  const ownerSelection = options.omitOwner ? {} : options.ownerLegacyId !== undefined
    ? { ownerLegacyId: options.ownerLegacyId }
    : { ownerSelectionIndex: options.ownerSelectionIndex ?? 0 }
  return {
    sourceDirectory: value.sourceDirectory,
    namespace: value.namespace,
    canonicalPath: value.canonicalPath,
    reviewPlan: options.reviewPlan ?? value.reviewPlan,
    activateAccounts: options.activateAccounts ?? true,
    ...ownerSelection,
  }
}

function verifyInput(value: ReturnType<typeof fixture>) {
  return { sourceDirectory: value.sourceDirectory, namespace: value.namespace, canonicalPath: value.canonicalPath,
    reviewPlan: value.reviewPlan, canonicalVolume: 'greed-l390-canonical-test', legacyVolumes: ['greed-l390-legacy-test'] }
}

describe('L390 reviewed canonical apply and verify', () => {
  it('creates a startable canonical DB, activates the selected owner, and verifies a reviewed receipt', async () => {
    const value = fixture()
    const applied = await applyL390LegacyImport(applyInput(value))
    expect(applied).toMatchObject({ applied: true, duplicate: false, reviewed: false,
      report: { identities: { count: 2, canonicalRoles: { admin: 1, player: 1 }, activeAccounts: 2, activeAdmins: 1 },
        progress: { roomPlayers: 2 }, canonicalIntegrity: 'ok', sourceIntegrity: 'ok', foreignKeyViolations: 0 } })
    const verified = verifyL390LegacyImport(verifyInput(value))
    expect(verified.receipt).toMatchObject({ reviewed: true, canonicalVolume: 'greed-l390-canonical-test',
      legacyVolumes: ['greed-l390-legacy-test'], mappingDigest: value.reviewPlan.mappingDigest,
      progressPreservationDigest: value.reviewPlan.progressPreservationDigest })
    const db = new Database(value.canonicalPath, { readonly: true, fileMustExist: true })
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM event_log').get()).toEqual({ n: 1 })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_import_stage'").get()).toBeUndefined()
      expect(db.prepare('SELECT role,status FROM accounts ORDER BY role').all()).toEqual([
        { role: 'admin', status: 'active' }, { role: 'player', status: 'active' },
      ])
    } finally { db.close() }
    const application = createUnifiedServer({ host: '127.0.0.1', port: 0, databasePath: value.canonicalPath,
      allowedOrigins: ['http://127.0.0.1:4178'], secureCookies: false, sessionMs: 60_000 })
    try { await application.start() } finally { await application.close() }
  })

  it('is idempotent for the exact same plan and leaves the canonical bytes unchanged', async () => {
    const value = fixture()
    await applyL390LegacyWorld(value)
    const before = readFileSync(value.canonicalPath)
    const retry = await applyL390LegacyImport(applyInput(value))
    expect(retry).toMatchObject({ applied: false, duplicate: true, reviewed: false })
    expect(readFileSync(value.canonicalPath)).toEqual(before)
  })

  it('matches the approved L390 backup progress totals before and after apply', async () => {
    const value = fixture({ l390Backup: true })
    expect(value.reviewPlan.progress).toMatchObject({ roomPlayers: { count: 54 }, supplies: { count: 54, sum: 4 }, rewards: { count: 50, sum: 50 } })
    await applyL390LegacyImport(applyInput(value))
    const verified = verifyL390LegacyImport(verifyInput(value))
    expect(verified).toMatchObject({ identities: { count: 4, sourceRoleClaims: { admin: 1, player: 3 }, canonicalRoles: { admin: 1, player: 3 }, activeAccounts: 4, activeAdmins: 1 },
      progress: { roomPlayers: 54, supplies: { rows: 54, sum: 4 }, rewards: { rows: 50, sum: 50 } } })
  })

  it('rejects a digest mismatch before creating the target file', async () => {
    const value = fixture()
    const altered = { ...value.reviewPlan, progressPreservationDigest: 'a'.repeat(64) }
    await expect(applyL390LegacyImport(applyInput(value, { reviewPlan: altered }))).rejects.toThrow('REVIEW_PLAN_DIGEST_MISMATCH')
    expect(() => readFileSync(value.canonicalPath)).toThrow()
  })

  it('rejects an existing non-empty target and requires explicit account activation and owner selection', async () => {
    const value = fixture()
    writeFileSync(value.canonicalPath, 'not-a-database')
    await expect(applyL390LegacyImport(applyInput(value))).rejects.toThrow('CANONICAL_TARGET_EXISTS_NONEMPTY')
    const missingOwner = fixture()
    await expect(applyL390LegacyImport(applyInput(missingOwner, { omitOwner: true }))).rejects.toThrow('EXACTLY_ONE_OWNER_SELECTION_REQUIRED')
    const noActivation = fixture()
    await expect(applyL390LegacyImport(applyInput(noActivation, { activateAccounts: false }))).rejects.toThrow('ACTIVATE_ACCOUNTS_FLAG_REQUIRED')
    expect(() => readFileSync(missingOwner.canonicalPath)).toThrow()
    expect(() => readFileSync(noActivation.canonicalPath)).toThrow()
  })

  it('does not promote any source admin other than the explicit owner and emits no credentials', async () => {
    const value = fixture({ secondAdmin: true })
    const applied = await applyL390LegacyImport(applyInput(value, { ownerSelectionIndex: 1 }))
    expect(applied.report.identities).toMatchObject({ count: 3, sourceRoleClaims: { admin: 2, player: 1 }, canonicalRoles: { admin: 1, player: 2 }, activeAdmins: 1 })
    const db = new Database(value.canonicalPath, { readonly: true, fileMustExist: true })
    try {
      expect(db.prepare(`SELECT a.role FROM accounts a JOIN account_source_identities s ON s.account_id=a.id
        WHERE s.legacy_id='legacy-admin-secondary'`).get()).toEqual({ role: 'player' })
    } finally { db.close() }
    const output = JSON.stringify({ applied, verified: verifyL390LegacyImport(verifyInput(value)) })
    for (const secret of [SYNTHETIC_LEGACY_HASH, 'secondary-admin', 'Synthetic Secondary Admin', 'legacy-owner', 'legacy-admin-secondary', 'password_hash', 'passwordHash']) {
      expect(output).not.toContain(secret)
    }
  })

  it('accepts an explicitly selected safe numeric legacy ID while plan output keeps unsafe IDs opaque', async () => {
    const opaque = fixture()
    expect(opaque.reviewPlan.identities.ownerCandidates).toEqual({ opaque: true, count: 1 })
    const safe = fixture({ safeAdminId: '1042' })
    expect(safe.reviewPlan.identities.ownerCandidates).toEqual(['1042'])
    const applied = await applyL390LegacyImport(applyInput(safe, { ownerLegacyId: '1042' }))
    expect(applied.report.identities.activeAdmins).toBe(1)
  })
})

async function applyL390LegacyWorld(value: ReturnType<typeof fixture>) {
  return applyL390LegacyImport(applyInput(value))
}
