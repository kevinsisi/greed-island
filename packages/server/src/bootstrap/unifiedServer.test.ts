import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { once } from 'node:events'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateIdentitySchema } from '../identity/schema.js'
import { AuthService } from '../identity/authService.js'
import { initializeKernelSchema, SqliteEventStore } from '../kernel/eventStore.js'
import { assertUnifiedDatabaseReady, createUnifiedServer, openUnifiedDatabase } from './unifiedServer.js'
import { initializeUnifiedFeatureSchema } from './featureSchema.js'
import type { UnifiedServerConfig } from './unifiedConfig.js'
import { accountId } from '../identity/principal.js'
import { LEGACY_STAGE_MARKER_DDL, LEGACY_STAGE_PRIVATE_DDL } from '../migration/legacyWorldStageSchema.js'

const origin = 'http://127.0.0.1:4178'
const directories: string[] = []
const applications: ReturnType<typeof createUnifiedServer>[] = []
const listeners: Server[] = []
const streams: AbortController[] = []
function path(): string {
  const directory = mkdtempSync(join(tmpdir(), 'greed-startup-test-'))
  directories.push(directory)
  return join(directory, 'canonical.sqlite')
}
function seed(databasePath: string, admin = true): void {
  const db = new Database(databasePath)
  try {
    initializeKernelSchema(db)
    migrateIdentitySchema(db)
    initializeUnifiedFeatureSchema(db)
    if (admin) db.prepare("INSERT INTO accounts(email,password_hash,password_scheme,created_at,role,status) VALUES(NULL,?,'scrypt-v1',0,'admin','active')").run(`scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(64)}`)
  } finally { db.close() }
}
function config(databasePath: string): UnifiedServerConfig {
  return { host: '127.0.0.1', port: 4179, databasePath, allowedOrigins: [origin], secureCookies: false, sessionMs: 43_200_000 }
}
afterEach(async () => {
  for (const stream of streams.splice(0)) stream.abort()
  for (const listener of listeners.splice(0)) await new Promise<void>(resolve => { listener.close(() => resolve()); listener.closeAllConnections() })
  for (const app of applications.splice(0)) await app.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('canonical startup and one auth/world boundary', () => {
  it('blocks a valid pending staged artifact before WAL or runtime construction without changing bytes', () => {
    const existing = path(); seed(existing)
    const staged = new Database(existing)
    staged.exec(LEGACY_STAGE_MARKER_DDL); staged.exec(LEGACY_STAGE_PRIVATE_DDL)
    staged.prepare('INSERT INTO legacy_import_stage(namespace,source_digest,plan_digest,status,imported_at) VALUES(?,?,?,?,0)')
      .run('synthetic-legacy-room', 'synthetic-source', 'synthetic-reviewed-plan', 'pending-owner-and-activation-review')
    staged.close()
    const before = readFileSync(existing)
    expect(() => openUnifiedDatabase(existing)).toThrow('LEGACY_STAGE_ACTIVATION_REVIEW_REQUIRED')
    expect(() => createUnifiedServer(config(existing))).toThrow('LEGACY_STAGE_ACTIVATION_REVIEW_REQUIRED')
    expect(readFileSync(existing)).toEqual(before)
    expect(existsSync(existing + '-wal')).toBe(false)
    const check = new Database(existing, { readonly: true })
    expect(check.pragma('journal_mode', { simple: true })).toBe('delete')
    expect(check.prepare('SELECT status FROM legacy_import_stage').get()).toEqual({ status: 'pending-owner-and-activation-review' })
    check.close()
  })
  it.each([
    "CREATE TABLE legacy_import_stage(namespace TEXT,status TEXT); INSERT INTO legacy_import_stage VALUES('synthetic',NULL)",
    "CREATE VIEW legacy_import_stage AS SELECT 'synthetic' AS namespace,'ready' AS status",
    "CREATE TABLE legacy_import_private_sources(namespace TEXT,accounts_json TEXT)",
  ])('blocks malformed/collided staging markers before any writable pragma: %s', ddl => {
    const existing = path(); seed(existing)
    const malformed = new Database(existing); malformed.exec(ddl); malformed.close()
    const before = readFileSync(existing)
    expect(() => openUnifiedDatabase(existing)).toThrow('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED')
    expect(readFileSync(existing)).toEqual(before)
    expect(existsSync(existing + '-wal')).toBe(false)
  })
  it('refuses a missing database without creating a file or directory', () => {
    const missing = path()
    expect(() => openUnifiedDatabase(missing)).toThrow()
    expect(existsSync(missing)).toBe(false)
  })
  it('leaves existing unmigrated DB bytes/schema/journal mode untouched', () => {
    const existing = path(), db = new Database(existing)
    db.exec('CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES(\'legacy-progress\')')
    db.close()
    const before = readFileSync(existing)
    expect(() => openUnifiedDatabase(existing)).toThrow('explicit migration')
    expect(readFileSync(existing)).toEqual(before)
    const reopened = new Database(existing, { readonly: true })
    expect(reopened.pragma('journal_mode', { simple: true })).toBe('delete')
    expect(reopened.prepare('SELECT value FROM preserved').get()).toEqual({ value: 'legacy-progress' })
    expect(reopened.prepare("SELECT name FROM sqlite_master WHERE name='identity_schema'").get()).toBeUndefined()
    reopened.close()
  })
  it('requires existing canonical EventLog and active owner, without promotion', () => {
    const existing = path()
    const db = new Database(existing)
    migrateIdentitySchema(db)
    expect(() => assertUnifiedDatabaseReady(db)).toThrow('Canonical EventLog')
    initializeKernelSchema(db)
    expect(() => assertUnifiedDatabaseReady(db)).toThrow('OWNER_BOOTSTRAP_REQUIRED')
    expect(db.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toEqual({ n: 0 })
    db.close()
  })
  it('leaves an ownerless unified DB unchanged instead of bootstrapping an admin', () => {
    const existing = path(); seed(existing, false)
    const before = readFileSync(existing)
    expect(() => openUnifiedDatabase(existing)).toThrow('OWNER_BOOTSTRAP_REQUIRED')
    expect(readFileSync(existing)).toEqual(before)
    const db = new Database(existing, { readonly: true })
    expect(db.pragma('journal_mode', { simple: true })).toBe('delete')
    expect(db.prepare('SELECT COUNT(*) AS n FROM accounts').get()).toEqual({ n: 0 })
    db.close()
  })
  it('refuses unreserved historical actor IDs without reseeding on boot', () => {
    const existing = path(); seed(existing)
    const db = new Database(existing)
    db.prepare('INSERT INTO event_log(event_id,event_type,occurred_at,actor_id,payload_json,version,deterministic_key) VALUES(?,?,?,?,?,?,?)')
      .run('historical-actor-43', 'FACT_SET', 0, '43', JSON.stringify({ key: 'history-preserved', value: true }), 1, 'historical-actor-43')
    db.close()
    const before = readFileSync(existing)
    expect(() => openUnifiedDatabase(existing)).toThrow('allocator is unreserved')
    expect(readFileSync(existing)).toEqual(before)
    const reopened = new Database(existing, { readonly: true })
    expect(reopened.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()).toEqual({ seq: 1 })
    reopened.close()
  })
  it('shares identity, cookie and world authority, denies old APIs and preserves geography privacy', async () => {
    const existing = path(); seed(existing)
    const application = createUnifiedServer(config(existing)); applications.push(application)
    const listener = application.app.listen(0, '127.0.0.1'); listeners.push(listener)
    await once(listener, 'listening')
    const address = listener.address()
    if (!address || typeof address === 'string') throw new Error('No fixture listener')
    const base = `http://127.0.0.1:${address.port}`
    const registration = await fetch(base + '/api/auth/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'integrated-player', password: 'synthetic-only-password' }) })
    expect(registration.status).toBe(201)
    const registered = await registration.json() as { profile: { accountId: number; role: string } }
    expect(registered.profile.role).toBe('player')
    const cookie = registration.headers.get('set-cookie')!.split(';')[0]!
    const me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })
    expect(await me.json()).toMatchObject({ profile: { accountId: registered.profile.accountId } })
    const publicWorld = await (await fetch(base + '/api/world')).json() as { tick: number; facts: Record<string, unknown> }
    expect(publicWorld.tick).toBe(application.runtime.getCurrentTick())
    expect(publicWorld.facts).not.toHaveProperty('npcAgent')
    expect(publicWorld.facts).not.toHaveProperty('npcRumors')
    const publicNpcs = await (await fetch(base + '/api/npcs')).json() as Array<Record<string, unknown>>
    expect(publicNpcs.length).toBeGreaterThan(0)
    expect(publicNpcs[0]).toHaveProperty('name')
    for (const field of ['cognitiveLine','cognitiveEvolution','life','relationshipAction','recentUtterance']) expect(publicNpcs[0]).not.toHaveProperty(field)
    expect((await (await fetch(base + '/api/cards')).json() as { entries: unknown[] }).entries).toHaveLength(100)
    expect(await (await fetch(base + '/api/dashboard')).json()).toMatchObject({ cardsOwned: null, wallet: null, accountContext: null })
    expect((await fetch(base + '/api/world/snapshot')).status).toBe(401)
    const entry = fetch(base + '/api/world/command', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Greed-Account-Id': String(registered.profile.accountId), 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: 'integration-entry', type: 'enter', payload: {} }) })
    await new Promise(resolve => setTimeout(resolve, 20))
    application.runtime.advancePlayerMovementStep()
    expect((await entry).status).toBe(200)
    const snapshot = await fetch(base + '/api/world/snapshot', { headers: { Cookie: cookie } })
    expect(await snapshot.json()).toMatchObject({ selfId: registered.profile.accountId, worldId: 'canonical-world',
      harborProgress: { status: 'ready', supplies: 1, rewards: 0 } })
    const controller = new AbortController(); streams.push(controller)
    expect((await fetch(base + '/api/world/stream', { headers: { Cookie: cookie }, signal: controller.signal })).status).toBe(200)
    expect(application.eventStore.countEvents()).toBe(1)
    expect(await (await fetch(base + '/api/events')).json()).toEqual([])
    expect(application.db.prepare("SELECT actor_id FROM event_log WHERE event_type='PLAYER_WORLD_ENTERED'").get()).toEqual({ actor_id: String(registered.profile.accountId) })
    expect((await fetch(base + '/api/map')).status).toBe(401)
    const map = await (await fetch(base + '/api/map', { headers: { Cookie: cookie } })).json() as { regions: Array<Record<string, unknown>> }
    expect(Object.keys(map.regions[0]!).sort()).toEqual(['available', 'biome', 'generated', 'id', 'name', 'x', 'y'])
    for (const endpoint of ['/mp-api/snapshot', '/api/raw-event-log', '/api/private-npc-details']) expect((await fetch(base + endpoint, { headers: { Cookie: cookie } })).status).toBe(404)
    expect((await fetch(base + '/api/admin/users')).status).toBe(401)
    expect((await fetch(base + '/api/admin/users', { headers: { Cookie: cookie } })).status).toBe(400)
    const commandHeaders = { Cookie: cookie, Origin: origin, 'X-Greed-Account-Id': String(registered.profile.accountId), 'Content-Type': 'application/json' }
    expect((await fetch(base + '/api/world/command', { method: 'POST', headers: commandHeaders, body: JSON.stringify({ commandId: 'spoofed-actor', type: 'move', payload: { dx: 1, dz: 0 }, accountId: 1 }) })).status).toBe(400)
    expect((await fetch(base + '/api/world/command', { method: 'POST', headers: { ...commandHeaders, 'X-Greed-Account-Id': '1' }, body: JSON.stringify({ commandId: 'stale-account', type: 'move', payload: { dx: 1, dz: 0 } }) })).status).toBe(409)
    const queued = fetch(base + '/api/world/command', { method: 'POST', headers: commandHeaders, body: JSON.stringify({ commandId: 'revoked-before-commit', type: 'move', payload: { dx: 1, dz: 0 } }) })
    await new Promise(resolve => setTimeout(resolve, 20))
    // Normal registration/login intentionally switches the browser account and
    // revokes only that old cookie. It cannot rebind the already queued intent.
    const switched = await fetch(base + '/api/auth/register', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'second-integrated-player', password: 'synthetic-only-password' }) })
    expect(switched.status).toBe(201)
    application.runtime.advancePlayerMovementStep()
    expect([401, 409]).toContain((await queued).status)
    expect(application.eventStore.countEvents()).toBe(1)
    const second = await switched.json() as { profile: { accountId: number } }
    expect(application.runtime.getPlayerWorldPosition(accountId(second.profile.accountId))).toBeNull()
    expect((await fetch(base + '/api/world/command', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://wrong.example.test', 'X-Greed-Account-Id': String(registered.profile.accountId), 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
    expect((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Greed-Account-Id': String(registered.profile.accountId) } })).status).toBe(200)
    expect((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(401)
  })
  it('close is idempotent and permanently closes the one DB handle', async () => {
    const existing = path(); seed(existing)
    const application = createUnifiedServer(config(existing))
    await application.close(); await application.close()
    expect(application.db.open).toBe(false)
    await expect(application.start()).rejects.toThrow('start once')
  })
  it('uses pre-existing same-DB imported provenance without inventing harbor supplies or rewards', async () => {
    const existing = path(); seed(existing)
    const fixture = new Database(existing)
    const auth = new AuthService(fixture, { allowedOrigins: [origin], secureCookies: false })
    const grant = await auth.register({ kind: 'username', value: 'synthetic-preserved-user' }, 'synthetic-only-password', origin)
    fixture.prepare('INSERT INTO account_source_identities(namespace,legacy_id,account_id) VALUES(?,?,?)')
      .run('synthetic-legacy-provenance', 'old-player', grant.principal.accountId)
    fixture.close()
    const application = createUnifiedServer(config(existing)); applications.push(application)
    const listener = application.app.listen(0, '127.0.0.1'); listeners.push(listener); await once(listener, 'listening')
    const address = listener.address(); if (!address || typeof address === 'string') throw new Error('Missing socket')
    const base = `http://127.0.0.1:${address.port}`, headers = { Cookie: 'greed_session=' + grant.token, Origin: origin,
      'X-Greed-Account-Id': String(grant.principal.accountId), 'Content-Type': 'application/json' }
    const enter = fetch(base + '/api/world/command', { method: 'POST', headers, body: JSON.stringify({ commandId: 'preserved-policy-entry', type: 'enter', payload: {} }) })
    await new Promise(resolve => setTimeout(resolve, 20)); application.runtime.advancePlayerMovementStep(); expect((await enter).status).toBe(200)
    expect(await (await fetch(base + '/api/world/snapshot', { headers })).json()).toMatchObject({
      selfId: grant.principal.accountId, harborProgress: { status: 'legacy-review-required', supplies: null, rewards: null } })
  })
  it('mounts private Social DTOs and streams on the same cookie/runtime without location writes', async () => {
    const existing = path(); seed(existing)
    const application = createUnifiedServer(config(existing)); applications.push(application)
    const listener = application.app.listen(0, '127.0.0.1'); listeners.push(listener); await once(listener, 'listening')
    const address = listener.address(); if (!address || typeof address === 'string') throw new Error('Missing socket')
    const base = `http://127.0.0.1:${address.port}`
    const register = async (username: string) => {
      const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'synthetic-only-password' }) })
      expect(response.status).toBe(201)
      const { profile } = await response.json() as { profile: { accountId: number } }
      const cookie = response.headers.get('set-cookie')!.split(';')[0]!
      return { id: profile.accountId, cookie, headers: { Cookie: cookie, Origin: origin, 'X-Greed-Account-Id': String(profile.accountId), 'Content-Type': 'application/json' } }
    }
    const one = await register('mounted-social-one'), two = await register('mounted-social-two')
    for (const actor of [one, two]) {
      const enter = fetch(base + '/api/world/command', { method: 'POST', headers: actor.headers, body: JSON.stringify({ commandId: 'mounted-entry-' + actor.id, type: 'enter', payload: {} }) })
      await new Promise(resolve => setTimeout(resolve, 20)); application.runtime.advancePlayerMovementStep(); expect((await enter).status).toBe(200)
      const controller = new AbortController(); streams.push(controller)
      expect((await fetch(base + '/api/world/stream', { headers: { Cookie: actor.cookie }, signal: controller.signal })).status).toBe(200)
    }
    expect((await fetch(base + '/api/social/friends')).status).toBe(401)
    const stale = await fetch(base + '/api/social/conversations', { headers: { ...two.headers, 'X-Greed-Account-Id': String(one.id) } })
    expect(stale.status).toBe(409); expect(await stale.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    const nearby = await (await fetch(base + '/api/social/nearby', { headers: one.headers })).json() as { tileId: string; players: Array<Record<string, unknown>> }
    expect(nearby.tileId).toBe('t_dock'); expect(nearby.players).toHaveLength(1)
    expect(nearby.players[0]).toMatchObject({ id: two.id, displayName: 'mounted-social-two', z: 0 })
    expect(nearby.players[0]).not.toHaveProperty('email')
    const presence = await fetch(base + '/api/social/presence', { method: 'POST', headers: one.headers, body: JSON.stringify({ accountId: two.id, tileId: 't_forest', x: 999, y: 999, z: 16 }) })
    expect(await presence.json()).toMatchObject({ location: { userId: one.id, tileId: 't_dock', z: 0 } })
    expect(application.db.prepare('SELECT COUNT(*) AS n FROM player_locations').get()).toEqual({ n: 0 })
    expect((await fetch(base + '/api/social/message/' + one.id, { method: 'POST', headers: two.headers, body: JSON.stringify({ content: 'mounted private message' }) })).status).toBe(201)
    const read = await (await fetch(base + '/api/social/messages/' + two.id, { headers: one.headers })).json() as { messages: Array<{ readAt: string | null }> }
    expect(read.messages[0]!.readAt).toBeNull()
    expect(application.db.prepare('SELECT read_at FROM messages').get()).toEqual({ read_at: null })
    expect(await (await fetch(base + '/api/social/messages/' + two.id + '/read', { method: 'POST', headers: one.headers })).json()).toEqual({ marked: 1 })
    const controller = new AbortController(); streams.push(controller)
    const socialStream = await fetch(base + '/api/social/stream?expectedAccountId=' + one.id, { headers: { Cookie: one.cookie }, signal: controller.signal })
    expect(socialStream.status).toBe(200)
    const reader = socialStream.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: hello')
    expect((await fetch(base + '/api/auth/logout', { method: 'POST', headers: one.headers })).status).toBe(200)
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: session.invalidated')
    expect((await reader.read()).done).toBe(true)
    expect((await fetch(base + '/api/social/friends', { headers: one.headers })).status).toBe(401)
    expect((await fetch(base + '/api/social/friends', { headers: two.headers })).status).toBe(200)
  })
  it('closes a pending listen without reviving runtime after the DB closes', async () => {
    const existing = path(); seed(existing)
    const application = createUnifiedServer({ ...config(existing), port: 0 })
    const start = application.start()
    const rejected = expect(start).rejects.toThrow('cancelled')
    await application.close()
    await rejected
    expect(application.db.open).toBe(false)
    await application.close()
  })

  it('waits for cancelled running hydration before closing the real canonical DB, and close remains idempotent', async () => {
    const existing = path(); seed(existing)
    const snapshot = vi.spyOn(SqliteEventStore.prototype, 'readLatestFactSnapshot').mockReturnValue({
      eventCount: 25_000, lastSequence: 0, latestTick: 0, facts: {},
    })
    const application = createUnifiedServer(config(existing)); applications.push(application)
    snapshot.mockRestore()
    const internal = application.runtime as unknown as { yieldToEventLoop: () => Promise<void> }
    let resume!: () => void
    vi.spyOn(internal, 'yieldToEventLoop').mockImplementationOnce(() => new Promise<void>(resolve => { resume = resolve }))
    const reads = vi.spyOn(application.eventStore, 'readEventsByTypes')
    const hydration = application.runtime.startDeferredHydration()
    const close = application.close()
    expect(application.close()).toBe(close)
    expect(application.db.open).toBe(true)
    resume()
    await hydration; await close
    expect(reads).not.toHaveBeenCalled()
    expect(application.runtime.getDeferredHydrationState()).toBe('pending')
    expect(application.runtime.getDeferredHydrationError()).toBeNull()
    expect(application.db.open).toBe(false)
    await application.close()
  })

  it('cleans up a failure after runtime start without leaving timers or an open database', async () => {
    const existing = path(); seed(existing)
    const application = createUnifiedServer({ ...config(existing), port: 0 }); applications.push(application)
    const startRuntime = application.runtime.start.bind(application.runtime)
    vi.spyOn(application.runtime, 'start').mockImplementationOnce(() => {
      startRuntime()
      throw new Error('Synthetic partial runtime startup failure')
    })
    await expect(application.start()).rejects.toThrow('partial runtime startup failure')
    const internal = application.runtime as unknown as {
      playerMovementTimer: NodeJS.Timeout | null; timer: NodeJS.Timeout | null
      combatRuntime: { getActiveCombatIds: () => readonly string[] }
    }
    expect(internal.playerMovementTimer).toBeNull(); expect(internal.timer).toBeNull()
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual([])
    expect(application.db.open).toBe(false)
    await application.close(); await application.close()
    await expect(application.start()).rejects.toThrow('start once')
  })
})
