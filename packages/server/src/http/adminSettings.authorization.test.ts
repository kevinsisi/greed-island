import express from 'express'
import { once } from 'node:events'
import { request as httpRequest, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createHttpAuthorization } from './authorization.js'
import { createSettingsRouter } from './settingsRouter.js'
import { createAdminSimRouter } from './adminSimRouter.js'
import { createAdminCardsRouter } from './adminCardsRouter.js'
import { createCardArtRouter } from './cardArtFiles.js'
import { MAX_CARD_ART_HISTORY_FILES } from './cardArtManagement.js'
import type { SettingsStore, ApiKeyRecord } from './settings.js'
import type { SimulationRuntime } from '../sim/runtime.js'

const origin = 'http://127.0.0.1:4178'
const listeners: Server[] = [], databases: Database.Database[] = [], directories: string[] = []
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4])
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const server of listeners.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  for (const db of databases.splice(0)) if (db.open) db.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
async function setup(options: { credentialOrigin?: string; server?: string; noDbServer?: boolean } = {}) {
  const db = new Database(':memory:'); databases.push(db); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
  const one = await auth.register({ kind: 'username', value: 'admin-fixture-one' }, 'synthetic-fixture-password', origin)
  const two = await auth.register({ kind: 'username', value: 'player-fixture-two' }, 'synthetic-fixture-password', origin)
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(one.principal.accountId)
  const authorization = createHttpAuthorization(auth)
  const dataDir = mkdtempSync(join(tmpdir(), 'greed-admin-settings-')); directories.push(dataDir)
  const values = new Map<string, string>(options.noDbServer ? [] : [['opencode_servers', options.server ?? 'http://provider.example.test']])
  const keys: ApiKeyRecord[] = [{ id: 1, key: 'inert-redaction-fixture', source: 'admin', status: 'active', lastError: 'inert-redaction-fixture', lastUsedAt: null, failureCount: 1, createdAt: 0 }]
  // No real SettingsStore/database/provider configuration is written by this fixture.
  const store = {
    listKeys: vi.fn(() => keys), countActive: vi.fn(() => 1),
    addKeys: vi.fn(() => 1), deleteKey: vi.fn(() => true), reactivateAll: vi.fn(() => 1),
    getSetting: vi.fn((key: string) => values.get(key) ?? null),
    setSetting: vi.fn((key: string, value: string | null) => { if (value === null) values.delete(key); else values.set(key, value) }),
  }
  let tick = 0
  const runtime = { getSnapshot: () => ({ tick }), advanceTicks: vi.fn((ticks: number) => { tick += ticks }) }
  const app = express()
  app.use('/api', createAdminCardsRouter({ dataDir, authConfig: authorization }))
  app.use('/api', createSettingsRouter({ store: store as unknown as SettingsStore, authConfig: authorization, ...(options.credentialOrigin !== undefined ? { openCodeCredentialOrigin: options.credentialOrigin } : {}) }))
  app.use('/api', createAdminSimRouter({ runtime: runtime as unknown as SimulationRuntime, authConfig: authorization }))
  app.use(createCardArtRouter(dataDir))
  const server = app.listen(0, '127.0.0.1'); listeners.push(server); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing listener')
  const base = 'http://127.0.0.1:' + address.port
  const headers = { Cookie: 'greed_session=' + one.token, Origin: origin, 'X-Greed-Account-Id': String(one.principal.accountId), 'Content-Type': 'application/json' }
  return { db, auth, authorization, one, two, dataDir, store, runtime, base, headers, values }
}
const privatePaths = ['/settings/health', '/settings/keys', '/settings/providers', '/settings/opencode', '/settings/opencode/models', '/admin/cards/images']
const mutations = [
  ['POST', '/settings/keys', { keys: 'inert-fixture-only' }],
  ['DELETE', '/settings/keys/1', {}],
  ['POST', '/settings/keys/reactivate-all', {}],
  ['PUT', '/settings/providers', { openCodeModel: 'opencode/free-fixture' }],
  ['POST', '/settings/opencode', { text_model: 'opencode/free-fixture' }],
  ['DELETE', '/settings/opencode', {}],
  ['POST', '/admin/sim/advance', { ticks: 2 }],
  ['PUT', '/admin/cards/1/image', { imageBase64: png.toString('base64'), mimeType: 'image/png' }],
  ['DELETE', '/admin/cards/1/image', {}],
] as const

describe('canonical settings and GM administration', () => {
  it('rejects anonymous, bearer-only, stale A->B private context and missing context for every private route', async () => {
    const { base, headers, one, two } = await setup()
    for (const path of privatePaths) {
      expect((await fetch(base + '/api' + path)).status, path).toBe(401)
      expect((await fetch(base + '/api' + path, { headers: { Authorization: 'Bearer inert-fixture' } })).status, path).toBe(401)
      expect((await fetch(base + '/api' + path, { headers: { Cookie: headers.Cookie } })).status, path).toBe(400)
      expect((await fetch(base + '/api' + path, { headers: { Cookie: 'greed_session=' + two.token, 'X-Greed-Account-Id': String(one.principal.accountId) } })).status, path).toBe(409)
      expect((await fetch(base + '/api' + path, { headers: { ...headers, Origin: 'http://provider.example.test' } })).status, path).toBe(403)
    }
  })
  it('rereads current role and revocation on all private reads', async () => {
    const { db, auth, base, headers, one } = await setup()
    db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
    for (const path of privatePaths) expect((await fetch(base + '/api' + path, { headers })).status, path).toBe(403)
    db.prepare("UPDATE accounts SET role='gm' WHERE id=?").run(one.principal.accountId)
    expect((await fetch(base + '/api/settings/health', { headers })).status).toBe(200)
    auth.logout(one.token, origin)
    for (const path of privatePaths) expect((await fetch(base + '/api' + path, { headers })).status, path).toBe(401)
  })
  it('requires exact Origin/account context for all mutators before reading/writing feature state', async () => {
    const { base, headers, two, store, runtime, dataDir } = await setup()
    for (const [method, path, body] of mutations) {
      expect((await fetch(base + '/api' + path, { method, body: JSON.stringify(body) })).status, path).toBe(403)
      const { Origin: _origin, ...noOrigin } = headers
      expect((await fetch(base + '/api' + path, { method, headers: noOrigin, body: JSON.stringify(body) })).status, path).toBe(403)
      expect((await fetch(base + '/api' + path, { method, headers: { ...headers, 'X-Greed-Account-Id': String(two.principal.accountId) }, body: JSON.stringify(body) })).status, path).toBe(409)
    }
    expect(store.addKeys).not.toHaveBeenCalled(); expect(store.setSetting).not.toHaveBeenCalled(); expect(runtime.advanceTicks).not.toHaveBeenCalled()
    expect(readdirSync(dataDir)).toEqual([])
  })
  it('denies every mutation after a current-role change or session revocation', async () => {
    const { db, auth, one, base, headers, store, runtime, dataDir } = await setup()
    db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
    for (const [method, path, body] of mutations) expect((await fetch(base + '/api' + path, { method, headers, body: JSON.stringify(body) })).status, path).toBe(403)
    db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(one.principal.accountId)
    auth.logout(one.token, origin)
    for (const [method, path, body] of mutations) expect((await fetch(base + '/api' + path, { method, headers, body: JSON.stringify(body) })).status, path).toBe(401)
    expect(store.addKeys).not.toHaveBeenCalled(); expect(store.deleteKey).not.toHaveBeenCalled(); expect(store.reactivateAll).not.toHaveBeenCalled(); expect(store.setSetting).not.toHaveBeenCalled(); expect(runtime.advanceTicks).not.toHaveBeenCalled()
    expect(readdirSync(dataDir)).toEqual([])
  })
  it('does not parse large anonymous media input before authorization and keeps unrelated paths unparsed', async () => {
    const { base } = await setup()
    expect((await fetch(base + '/api/admin/cards/1/image', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{' + 'x'.repeat(30_000) })).status).toBe(401)
    expect((await fetch(base + '/api/auth/unknown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' + 'x'.repeat(30_000) })).status).toBe(404)
  })
  it('returns fully redacted key metadata and never provider raw errors or URL userinfo', async () => {
    const { base, headers, values } = await setup()
    const summaries = await (await fetch(base + '/api/settings/keys', { headers })).json()
    expect(summaries.keys[0]).toMatchObject({ fingerprint: '••••', lastError: 'PROVIDER_ERROR' })
    expect(JSON.stringify(summaries)).not.toContain('inert-redaction-fixture')
    values.set('opencode_base_url', 'http://inert-user:inert-value@provider.example.test')
    expect((await (await fetch(base + '/api/settings/providers', { headers })).json()).openCodeBaseUrl).toBeNull()
    vi.stubGlobal('fetch', vi.fn((...args) => String(args[0]).startsWith(base) ? nativeFetch(...args as Parameters<typeof fetch>) : Promise.reject(new Error('inert-provider-error-must-be-redacted'))))
    const result = await (await fetch(base + '/api/settings/opencode/models', { headers })).json()
    expect(JSON.stringify(result)).not.toContain('inert-provider-error')
    expect(result.error).toBe('OpenCode models fetch failed')
  })
  it('preserves one settings store, model routing contract and admin simulation cap', async () => {
    const { base, headers, store, runtime } = await setup()
    expect((await fetch(base + '/api/settings/providers', { method: 'PUT', headers, body: JSON.stringify({ openCodeBaseUrl: 'http://provider.example.test', providerPriority: 'Gemini,opencode', openCodeModel: 'opencode/free-fixture' }) })).status).toBe(200)
    expect(store.setSetting).toHaveBeenCalledWith('provider_priority', 'gemini,opencode')
    const advance = await (await fetch(base + '/api/admin/sim/advance', { method: 'POST', headers, body: JSON.stringify({ ticks: 50_001 }) })).json()
    expect(advance).toMatchObject({ beforeTick: 0, afterTick: 50_000, requestedTicks: 50_000, capped: true })
    expect(runtime.advanceTicks).toHaveBeenCalledWith(50_000)
  })
  it('rejects malformed IDs, wrong signature and credentialed provider URLs without changing state', async () => {
    const { base, headers, store, dataDir } = await setup()
    expect((await fetch(base + '/api/settings/keys/1junk', { method: 'DELETE', headers })).status).toBe(400)
    expect((await fetch(base + '/api/settings/opencode', { method: 'POST', headers, body: JSON.stringify({ servers: 'http://inert-user:inert-value@provider.example.test' }) })).status).toBe(400)
    expect(store.setSetting).not.toHaveBeenCalled()
    for (const id of ['0', '101', '01', '1junk']) expect((await fetch(base + `/api/admin/cards/${id}/image`, { method: 'PUT', headers, body: JSON.stringify({ imageBase64: png.toString('base64'), mimeType: 'image/png' }) })).status).toBe(400)
    expect((await fetch(base + '/api/admin/cards/1/image', { method: 'PUT', headers, body: JSON.stringify({ imageBase64: 'aW5lcnQtaW1hZ2UtZml4dHVyZQ==', mimeType: 'image/png' }) })).status).toBe(400)
    expect(readdirSync(dataDir)).toEqual([])
  })
  it('archives replacement and deletion bytes privately, never destroys existing art', async () => {
    const { base, headers, dataDir } = await setup()
    mkdirSync(join(dataDir, 'card-images')); writeFileSync(join(dataDir, 'card-images', '1.png'), png)
    const replacement = Buffer.from(png); replacement[15] = 5
    expect((await fetch(base + '/api/admin/cards/1/image', { method: 'PUT', headers, body: JSON.stringify({ imageBase64: replacement.toString('base64'), mimeType: 'image/png' }) })).status).toBe(200)
    const history = join(dataDir, 'assets', 'history', 'card-images')
    expect(readFileSync(join(history, readdirSync(history)[0]!))).toEqual(png)
    expect((await fetch(base + '/api/admin/cards/1/image', { method: 'DELETE', headers })).status).toBe(200)
    expect(readdirSync(history)).toHaveLength(2)
    expect((await fetch(base + '/card-images/1.png')).status).toBe(404)
    expect((await fetch(base + '/card-images/' + readdirSync(history)[0])).status).toBe(404)
    expect((await (await fetch(base + '/api/admin/cards/images', { headers })).json()).images).toEqual({})
  })
  it('rejects symlink directories/files and full archives without deleting current art', async () => {
    const { base, headers, dataDir } = await setup()
    const upload = () => fetch(base + '/api/admin/cards/1/image', { method: 'PUT', headers, body: JSON.stringify({ imageBase64: png.toString('base64'), mimeType: 'image/png' }) })
    mkdirSync(join(dataDir, 'other')); symlinkSync(join(dataDir, 'other'), join(dataDir, 'card-images'))
    expect((await upload()).status).toBe(409)
    rmSync(join(dataDir, 'card-images')); mkdirSync(join(dataDir, 'card-images'))
    writeFileSync(join(dataDir, 'other', '1.png'), png); symlinkSync(join(dataDir, 'other', '1.png'), join(dataDir, 'card-images', '1.png'))
    expect((await upload()).status).toBe(409)
    rmSync(join(dataDir, 'card-images', '1.png')); writeFileSync(join(dataDir, 'card-images', '1.png'), png)
    const history = join(dataDir, 'assets', 'history', 'card-images'); mkdirSync(history, { recursive: true })
    for (let i = 0; i < MAX_CARD_ART_HISTORY_FILES; i++) writeFileSync(join(history, '1-' + String(i).padStart(36, '0') + '.png'), png)
    const result = await upload(); expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: 'HISTORY_FULL' })
    expect(readFileSync(join(dataDir, 'card-images', '1.png'))).toEqual(png)
    expect(readdirSync(history)).toHaveLength(MAX_CARD_ART_HISTORY_FILES)
  })
  it.each(['role', 'revoke'] as const)('reauthorizes private provider-model results after an await (%s)', async mode => {
    const { db, auth, one, base, headers } = await setup()
    let resume!: () => void, entered!: () => void
    const waiting = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { resume = resolve })
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).startsWith(base)) return nativeFetch(...args)
      entered(); await gate
      return new Response(JSON.stringify(String(args[0]).endsWith('/auth') ? {} : { all: [{ id: 'opencode', models: { free: { id: 'fixture', cost: { input: 0, output: 0 } } } }] }), { headers: { 'Content-Type': 'application/json' } })
    }))
    const response = fetch(base + '/api/settings/opencode/models', { headers })
    await waiting
    if (mode === 'role') db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
    else auth.logout(one.token, origin)
    resume()
    const result = await response
    expect(result.status).toBe(mode === 'role' ? 403 : 401)
    expect(await result.json()).toEqual({ error: mode === 'role' ? 'FORBIDDEN' : 'UNAUTHORIZED' })
  })
  it.each(['role', 'revoke'] as const)('reauthorizes every parsed mutation after streamed body waits (%s)', async mode => {
    for (const [method, path, body] of mutations.filter(([method]) => method !== 'DELETE')) {
      const { db, auth, one, base, headers, store, runtime, dataDir } = await setup()
      const payload = JSON.stringify(body)
      const response = new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = httpRequest(base + '/api' + path, { method, headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) } }, result => {
          let text = ''; result.on('data', chunk => { text += chunk }); result.on('end', () => resolve({ status: result.statusCode!, body: text }))
        })
        request.on('error', reject)
        request.write(payload.slice(0, 1))
        setTimeout(() => {
          if (mode === 'role') db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
          else auth.logout(one.token, origin)
          request.end(payload.slice(1))
        }, 30)
      })
      expect((await response).status, path).toBe(mode === 'role' ? 403 : 401)
      expect(store.addKeys).not.toHaveBeenCalled(); expect(store.reactivateAll).not.toHaveBeenCalled(); expect(store.setSetting).not.toHaveBeenCalled(); expect(runtime.advanceTicks).not.toHaveBeenCalled()
      expect(readdirSync(dataDir)).toEqual([])
    }
  })
})
const nativeFetch = globalThis.fetch


describe('immutable OpenCode global-credential origin binding', () => {
  beforeEach(() => {
    vi.stubEnv('OPENCODE_SERVER_PASSWORD', 'synthetic-origin-fixture-only')
    vi.stubEnv('OPENCODE_BASE_URL', 'http://provider.example.test')
    vi.stubEnv('OPENCODE_SERVERS', undefined)
  })
  // All provider transport is mocked and env inputs are replaced by inert
  // fixtures before access. No production credential or live request is used.
  function captureProvider(base: string, replies: 'authorize' | 'redirect' = 'authorize') {
    const captures: Array<{ url: string; authorization: string | undefined; redirect: RequestRedirect | undefined }> = []
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).startsWith(base)) return nativeFetch(...args)
      const authorization = (args[1]?.headers as Record<string, string> | undefined)?.Authorization
      captures.push({ url: String(args[0]), authorization, redirect: args[1]?.redirect })
      if (replies === 'redirect') throw new TypeError('inert redirect fixture')
      const approved = authorization === 'Basic ' + Buffer.from('opencode:synthetic-origin-fixture-only').toString('base64')
      if (!approved) return new Response('{}', { status: 401 })
      return new Response(JSON.stringify(String(args[0]).endsWith('/auth') ? {} : { all: [{ id: 'opencode', models: { fixture: { id: 'fixture', name: 'Fixture', cost: { input: 0, output: 0 } } } }] }), { headers: { 'Content-Type': 'application/json' } })
    }))
    return captures
  }
  it('preserves explicitly trusted default env-origin auth without changing provider configuration', async () => {
    const f = await setup({ credentialOrigin: 'http://provider.example.test', noDbServer: true })
    // The test supplies OPENCODE_BASE_URL as an inert fixture, not a live value.
    const captures = captureProvider(f.base)
    const response = await fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })
    expect(response.status).toBe(200)
    expect((await response.json()).groups[0].models[0].id).toBe('opencode/fixture')
    expect(captures).toHaveLength(2)
    expect(captures.every(row => row.authorization !== undefined && row.redirect === 'error')).toBe(true)
    expect(f.store.setSetting).not.toHaveBeenCalled()
  })
  it('does not forward the existing global credential after editing to a new public origin', async () => {
    const f = await setup({ credentialOrigin: 'http://provider.example.test' })
    const captures = captureProvider(f.base)
    expect((await fetch(f.base + '/api/settings/opencode', { method: 'POST', headers: f.headers, body: JSON.stringify({ servers: 'https://new-public.example.test', openCodeCredentialOrigin: 'https://new-public.example.test' }) })).status).toBe(200)
    const response = await fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })
    expect(response.status).toBe(502)
    expect((await response.json()).groups).toEqual([])
    expect(captures).toHaveLength(2)
    expect(captures.every(row => row.url.startsWith('https://new-public.example.test/') && row.authorization === undefined && row.redirect === 'error')).toBe(true)
  })
  it.each([undefined, 'not-an-origin', 'https://provider.example.test/private', 'https://inert-user:inert-value@provider.example.test', 'https://provider.example.test/?token=inert', 'https://provider.example.test/#inert'])('never forwards credentials when trust is absent or malformed: %s', async credentialOrigin => {
    const f = await setup(credentialOrigin === undefined ? {} : { credentialOrigin })
    const captures = captureProvider(f.base)
    expect((await fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })).status).toBe(502)
    expect(captures.every(row => row.authorization === undefined)).toBe(true)
  })
  it('allows configured path variants only on the same canonical scheme/host/port', async () => {
    const f = await setup({ credentialOrigin: 'http://PROVIDER.example.test:80/', server: 'http://provider.example.test/api' })
    const captures = captureProvider(f.base)
    expect((await fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })).status).toBe(200)
    expect(captures.every(row => row.url.startsWith('http://provider.example.test/api/') && row.authorization !== undefined)).toBe(true)
    for (const server of ['https://provider.example.test/api', 'http://provider.example.test:8080/api', 'http://provider.example.test.evil.test/api']) {
      captures.splice(0); f.values.set('opencode_servers', server)
      expect((await fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })).status).toBe(502)
      expect(captures.every(row => row.authorization === undefined)).toBe(true)
    }
  })
  it('rejects redirects for trusted credential-bearing requests and exposes no raw errors', async () => {
    const f = await setup({ credentialOrigin: 'http://provider.example.test' })
    const captures = captureProvider(f.base, 'redirect')
    const response = await fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })
    expect(response.status).toBe(502)
    expect((await response.json()).error).toBe('OpenCode models fetch failed')
    expect(captures).toHaveLength(2)
    expect(captures.every(row => row.redirect === 'error' && row.authorization !== undefined)).toBe(true)
  })
  it('keeps post-await role reauthorization on an explicitly trusted credential request', async () => {
    const f = await setup({ credentialOrigin: 'http://provider.example.test' })
    let resume!: () => void, entered!: () => void
    const waiting = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { resume = resolve })
    vi.stubGlobal('fetch', vi.fn(async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).startsWith(f.base)) return nativeFetch(...args)
      expect((args[1]?.headers as Record<string, string>).Authorization).toBeDefined()
      expect(args[1]?.redirect).toBe('error')
      entered(); await gate
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    }))
    const response = fetch(f.base + '/api/settings/opencode/models', { headers: f.headers })
    await waiting
    f.db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(f.one.principal.accountId)
    resume()
    expect((await response).status).toBe(403)
  })
})
