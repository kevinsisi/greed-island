import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateIdentitySchema } from '../identity/schema.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { syntheticLegacySourceFixture } from './legacyWorld.testSupport.js'
import { readCanonicalStageState } from './legacyWorldImport.js'
import { inspectLegacyWorldSource } from './legacyWorldSource.js'
import { planLegacyWorldStage } from './legacyWorldPlan.js'
import { buildLegacyMappingDigestDocument, buildLegacyProgressDigestDocument, hashLegacyMappingDocument,
  hashLegacyProgressDocument, inspectL390LegacySource, planL390LegacyImport } from './l390LegacyReview.js'

const directories: string[] = []
const canonicalHash = `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(64)}`
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function files() {
  const directory = mkdtempSync(join(tmpdir(), 'greed-l390-review-')); directories.push(directory)
  const sourceDirectory = join(directory, 'source'); mkdirSync(sourceDirectory)
  const fixture = syntheticLegacySourceFixture()
  const lastRow = fixture.rows.at(-1)!
  fixture.rows.push({ ...lastRow, sequence: lastRow.sequence + 1, event_id: 'synthetic-review-chat', event_type: 'MP_CHAT', occurred_at: 301,
    actor_id: 'legacy-owner', command_id: 'synthetic-review-chat-command', tick: lastRow.tick ?? 300,
    payload_json: toCanonicalJson({ id: 'synthetic-review-message', playerId: 'legacy-owner', name: 'Fixture Owner', text: 'synthetic private chat', tick: lastRow.tick ?? 300 }),
    deterministic_key: 'synthetic-review-chat-key' })
  const accountsPath = join(sourceDirectory, 'accounts.json'), roomPath = join(sourceDirectory, 'room.sqlite')
  writeFileSync(accountsPath, fixture.rawAccountsJson)
  const sourceDb = new Database(roomPath); new SqliteEventStore(sourceDb)
  const insert = sourceDb.prepare('INSERT INTO event_log(sequence,event_id,event_type,occurred_at,actor_id,command_id,tick,ruleset_version,payload_json,version,deterministic_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  sourceDb.transaction(() => { for (const row of fixture.rows) insert.run(row.sequence, row.event_id, row.event_type, row.occurred_at, row.actor_id,
    row.command_id, row.tick, row.ruleset_version, row.payload_json, row.version, row.deterministic_key) })()
  sourceDb.close()

  const canonicalPath = join(directory, 'canonical.sqlite'), canonicalDb = new Database(canonicalPath)
  new SqliteEventStore(canonicalDb); migrateIdentitySchema(canonicalDb)
  canonicalDb.prepare("INSERT INTO accounts(id,email,password_hash,password_scheme,created_at,role,status,display_name) VALUES(7,'fixture-owner@example.test',?,'scrypt-v1',1,'admin','active','Fixture Owner')").run(canonicalHash)
  canonicalDb.prepare("INSERT INTO account_login_aliases VALUES('email','fixture-owner@example.test','fixture-owner@example.test',7)").run()
  canonicalDb.close()
  return { directory, sourceDirectory, accountsPath, roomPath, canonicalPath, fixture,
    input: { sourceDirectory, namespace: 'synthetic-l390', canonicalDatabasePath: canonicalPath } }
}

function clone<T>(value: T): T { return structuredClone(value) }
function sha256(value: Buffer): string { return createHash('sha256').update(value).digest('hex') }
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[] ? Mutable<Item>[] : T[Key] extends object ? Mutable<T[Key]> : T[Key] }

describe('L390 legacy inspect/plan dry-run', () => {
  it('produces deterministic digests regardless of mapping/player input order', () => {
    const value = files(), actualSource = inspectLegacyWorldSource(value.fixture.rawAccountsJson, 'synthetic-l390', () => value.fixture.rows)
    const canonical = new Database(value.canonicalPath, { readonly: true, fileMustExist: true })
    try {
      const stagePlan = planLegacyWorldStage({ source: actualSource, target: readCanonicalStageState(canonical) })
      const realMapping = buildLegacyMappingDigestDocument(actualSource, stagePlan)
      expect(hashLegacyMappingDocument({ ...realMapping, mappings: [...realMapping.mappings].reverse() })).toBe(hashLegacyMappingDocument(realMapping))
      const progress = buildLegacyProgressDigestDocument(actualSource, hashLegacyMappingDocument(realMapping), stagePlan.identities)
      expect(hashLegacyProgressDocument({ ...progress, players: [...progress.players].reverse() })).toBe(hashLegacyProgressDocument(progress))
    } finally { canonical.close() }
  })

  it('changes mapping digest when any mapping field changes', () => {
    const value = files(), actualSource = inspectLegacyWorldSource(value.fixture.rawAccountsJson, 'synthetic-l390', () => value.fixture.rows)
    const canonical = new Database(value.canonicalPath, { readonly: true, fileMustExist: true })
    try {
      const plan = planLegacyWorldStage({ source: actualSource, target: readCanonicalStageState(canonical) })
      const document = buildLegacyMappingDigestDocument(actualSource, plan)
      const mutations: Array<(doc: Mutable<typeof document>) => void> = [
        doc => { doc.namespace = 'other' },
        doc => { doc.mappings[0]!.legacyId += '-changed' }, doc => { doc.mappings[0]!.canonicalAccountId += 1 },
        doc => { doc.mappings[0]!.action = 'preserve-existing' }, doc => { doc.mappings[0]!.normalizedUsername += '-changed' },
        doc => { doc.mappings[0]!.sourceRoleClaim = doc.mappings[0]!.sourceRoleClaim === 'admin' ? 'player' : 'admin' },
        doc => { doc.mappings[0]!.reviewedLinkReference = 'review-ref' },
        doc => { doc.mappings[0]!.credentialDisposition = 'keep-canonical' },
      ]
      for (const mutate of mutations) { const changed = clone(document) as Mutable<typeof document>; mutate(changed); expect(hashLegacyMappingDocument(changed)).not.toBe(hashLegacyMappingDocument(document)) }
      expect(() => hashLegacyMappingDocument({ ...document, version: 2 as 1 })).toThrow('MAPPING_DOCUMENT_INVALID')
    } finally { canonical.close(); actualSource.close?.() }
  })

  it('changes progress digest when each progress field changes', () => {
    const value = files(), actualSource = inspectLegacyWorldSource(value.fixture.rawAccountsJson, 'synthetic-l390', () => value.fixture.rows)
    const canonical = new Database(value.canonicalPath, { readonly: true, fileMustExist: true })
    try {
      const stagePlan = planLegacyWorldStage({ source: actualSource, target: readCanonicalStageState(canonical) })
      const mappingDigest = hashLegacyMappingDocument(buildLegacyMappingDigestDocument(actualSource, stagePlan))
      const document = buildLegacyProgressDigestDocument(actualSource, mappingDigest, stagePlan.identities)
      const mutations: Array<(doc: Mutable<typeof document>) => void> = [
        doc => { doc.sourceDigest = 'a'.repeat(64) }, doc => { doc.mappingDigest = 'b'.repeat(64) },
        doc => { doc.tick += 1 }, doc => { doc.players[0]!.legacyId += '-changed' },
        doc => { doc.players[0]!.canonicalAccountId = 999 }, doc => { doc.players[0]!.name += '-changed' },
        doc => { doc.players[0]!.position.x += 1 }, doc => { doc.players[0]!.position.z += 1 },
        doc => { doc.players[0]!.supplies += 1 }, doc => { doc.players[0]!.rewards += 1 },
        doc => { doc.players[0]!.contributed = !doc.players[0]!.contributed },
        doc => { doc.players[0]!.rewardClaimed = !doc.players[0]!.rewardClaimed },
        doc => { doc.room.config.maxOnlinePlayers += 1 }, doc => { doc.room.config.minParticipants += 1 },
        doc => { doc.room.config.participationWindowTicks += 1 }, doc => { doc.room.completed = !doc.room.completed },
        doc => { doc.room.closesAtTick = doc.room.closesAtTick === null ? 1 : doc.room.closesAtTick + 1 },
        doc => { doc.room.messages[0]!.id += '-changed' }, doc => { doc.room.messages[0]!.playerId += '-changed' },
        doc => { doc.room.messages[0]!.name += '-changed' }, doc => { doc.room.messages[0]!.text += '-changed' },
        doc => { doc.room.messages[0]!.tick += 1 },
      ]
      for (const mutate of mutations) {
        const changed = clone(document) as Mutable<typeof document>; mutate(changed)
        expect(hashLegacyProgressDocument(changed)).not.toBe(hashLegacyProgressDocument(document))
      }
      expect(() => hashLegacyProgressDocument({ ...document, version: 2 as 1 })).toThrow('PROGRESS_DOCUMENT_INVALID')
      for (const field of ['supplies', 'rewards', 'contributed', 'rewardClaimed', 'messages', 'position'] as const) {
        const changed = clone(document) as Mutable<typeof document>
        changed.players[0]!.dispositionByField[field] = 'changed' as 'exact-private-archive'
        expect(() => hashLegacyProgressDocument(changed)).toThrow('PROGRESS_DOCUMENT_INVALID')
      }
      const changedRoomDisposition = clone(document) as Mutable<typeof document>
      changedRoomDisposition.room.dispositionByField.messages = 'changed' as 'exact-private-archive'
      expect(() => hashLegacyProgressDocument(changedRoomDisposition)).toThrow('PROGRESS_DOCUMENT_INVALID')
    } finally { canonical.close(); actualSource.close?.() }
  })

  it('rejects missing digest fields and incomplete progress dispositions', () => {
    const value = files(), actualSource = inspectLegacyWorldSource(value.fixture.rawAccountsJson, 'synthetic-l390', () => value.fixture.rows)
    const canonical = new Database(value.canonicalPath, { readonly: true, fileMustExist: true })
    try {
      const stagePlan = planLegacyWorldStage({ source: actualSource, target: readCanonicalStageState(canonical) })
      const mapping = buildLegacyMappingDigestDocument(actualSource, stagePlan)
      const progress = buildLegacyProgressDigestDocument(actualSource, hashLegacyMappingDocument(mapping), stagePlan.identities)
      const missingMappingField = clone(mapping) as unknown as { mappings: Array<Record<string, unknown>> }
      delete missingMappingField.mappings[0]!.normalizedUsername
      expect(() => hashLegacyMappingDocument(missingMappingField as unknown as typeof mapping)).toThrow('MAPPING_DOCUMENT_INVALID')
      const missingPlayerField = clone(progress) as unknown as { players: Array<Record<string, unknown>> }
      delete missingPlayerField.players[0]!.supplies
      expect(() => hashLegacyProgressDocument(missingPlayerField as unknown as typeof progress)).toThrow('PROGRESS_DOCUMENT_INVALID')
      const missingDisposition = clone(progress) as unknown as { players: Array<{ dispositionByField: Record<string, unknown> }> }
      delete missingDisposition.players[0]!.dispositionByField.position
      expect(() => hashLegacyProgressDocument(missingDisposition as unknown as typeof progress)).toThrow('PROGRESS_DOCUMENT_INVALID')
    } finally { canonical.close(); actualSource.close?.() }
  })

  it('returns only aggregate JSON and performs inspect/plan without writing files or database pages', () => {
    const value = files()
    const paths = [value.accountsPath, value.roomPath, value.canonicalPath]
    const before = new Map(paths.map(path => [path, sha256(readFileSync(path))]))
    const entriesBefore = readdirSync(value.directory).sort()
    const report = planL390LegacyImport(value.input)
    const inspected = inspectL390LegacySource(value.input)
    const json = JSON.stringify({ report, inspected })
    for (const secret of [
      'Source Owner', 'Source Player', 'kevin950805', 'retained-user', canonicalHash,
      'fixture-owner@example.test', 'passwordHash', 'payload_json', 'synthetic private chat',
    ]) expect(json).not.toContain(secret)
    expect(report.progress).toMatchObject({ roomPlayers: { count: 2 }, supplies: { count: 2 }, rewards: { count: 2 } })
    expect(readdirSync(value.directory).sort()).toEqual(entriesBefore)
    for (const path of paths) expect(sha256(readFileSync(path))).toBe(before.get(path))
    const futureTarget = join(value.directory, 'future-canonical.sqlite')
    const futurePlan = planL390LegacyImport({ ...value.input, canonicalDatabasePath: futureTarget })
    const secondFuturePlan = planL390LegacyImport({ ...value.input, canonicalDatabasePath: join(value.directory, 'second-future.sqlite') })
    expect(futurePlan.canonicalTarget.fingerprint).toBe(secondFuturePlan.canonicalTarget.fingerprint)
    expect(existsSync(futureTarget)).toBe(false)
  })
})
