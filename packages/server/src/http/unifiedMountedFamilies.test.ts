import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { initializeKernelSchema } from '../kernel/eventStore.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { initializeUnifiedFeatureSchema } from '../bootstrap/featureSchema.js'
import { createUnifiedServer, type UnifiedServer } from '../bootstrap/unifiedServer.js'

const origin = 'http://127.0.0.1:4178'
const applications: UnifiedServer[] = [], listeners: Server[] = [], directories: string[] = []
afterEach(async () => {
  for (const server of listeners.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  for (const application of applications.splice(0)) await application.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'greed-mounted-families-')); directories.push(directory)
  const databasePath = join(directory, 'canonical.sqlite'), seed = new Database(databasePath)
  initializeKernelSchema(seed); migrateIdentitySchema(seed); initializeUnifiedFeatureSchema(seed)
  seed.prepare("INSERT INTO accounts(email,password_hash,password_scheme,created_at,role,status) VALUES(NULL,?,'scrypt-v1',0,'admin','active')").run(`scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(64)}`)
  seed.close()
  const application = createUnifiedServer({ host: '127.0.0.1', port: 0, databasePath, allowedOrigins: [origin], secureCookies: false, sessionMs: 60_000 })
  applications.push(application)
  // Real HTTP mounts without starting autonomous time/provider work in this assertion.
  const listener = application.app.listen(0, '127.0.0.1'); listeners.push(listener); await once(listener, 'listening')
  const address = listener.address(); if (!address || typeof address === 'string') throw new Error('No fixture address')
  const base = 'http://127.0.0.1:' + address.port
  const actor = async (username: string, role = 'player') => {
    const grant = await application.auth.register({ kind: 'username', value: username }, 'synthetic-fixture-password-42', origin)
    application.db.prepare('UPDATE accounts SET role=? WHERE id=?').run(role, grant.principal.accountId)
    const cookie = 'greed_session=' + grant.token, id = grant.principal.accountId
    return { id, token: grant.token, cookie, headers: { Cookie: cookie, Origin: origin, 'X-Greed-Account-Id': String(id), 'Content-Type': 'application/json' } }
  }
  return { application, base, actor }
}
const privateReads = ['/api/wallet', '/api/goods/inventory/self', '/api/codex', '/api/cards/held', '/api/trade/list', '/api/shop/techniques', '/api/me/techniques', '/api/npc/npc-missing/history', '/api/player/needs', '/api/world/player-state', '/api/combat/active']
const operatorReads = ['/api/settings/keys', '/api/settings/providers', '/api/settings/opencode', '/api/admin/cards/images', '/api/admin/world']

describe('the normal ONE factory actually mounts reviewed feature families', () => {
  it('protects every mounted private family against absent/stale/revoked cookies and preserves pure owned reads', async () => {
    const { application, base, actor } = await fixture(), one = await actor('mounted-one'), two = await actor('mounted-two')
    for (const path of [...privateReads, ...operatorReads, '/api/properties/bindings']) {
      expect((await fetch(base + path)).status, path + ' anonymous').toBe(401)
      expect((await fetch(base + path, { headers: { Cookie: two.cookie, 'X-Greed-Account-Id': String(one.id) } })).status, path + ' stale A/B').toBe(409)
      expect((await fetch(base + path, { headers: { Cookie: one.cookie } })).status, path + ' absent context').toBe(400)
    }
    const before = { events: application.eventStore.countEvents(), actions: application.db.prepare('SELECT COUNT(*) AS n FROM card_action_log').get(), wallets: application.db.prepare('SELECT COUNT(*) AS n FROM player_wallet').get() }
    expect(await (await fetch(base + '/api/wallet', { headers: one.headers })).json()).toMatchObject({ wallet: null, walletInitialized: false, jobs: [] })
    expect((await fetch(base + '/api/codex', { headers: one.headers })).status).toBe(200)
    expect((await fetch(base + '/api/me/techniques', { headers: one.headers })).status).toBe(200)
    expect((await fetch(base + '/api/combat/active', { headers: one.headers })).status).toBe(200)
    expect((await fetch(base + '/api/npc/npc-missing/history', { headers: one.headers })).status).toBe(404)
    for (const path of operatorReads) expect((await fetch(base + path, { headers: one.headers })).status, path + ' player role').toBe(403)
    expect((await fetch(base + '/api/properties/bindings', { headers: one.headers })).status).toBe(403)
    expect({ events: application.eventStore.countEvents(), actions: application.db.prepare('SELECT COUNT(*) AS n FROM card_action_log').get(), wallets: application.db.prepare('SELECT COUNT(*) AS n FROM player_wallet').get() }).toEqual(before)
    expect((await fetch(base + '/api/auth/logout', { method: 'POST', headers: one.headers })).status).toBe(200)
    for (const path of privateReads) expect((await fetch(base + path, { headers: one.headers })).status, path + ' revoked').toBe(401)
    expect((await fetch(base + '/api/codex', { headers: two.headers })).status).toBe(200)
    expect((await fetch(base + '/api/goods/inventory/' + two.id, { headers: two.headers })).status).toBe(200)
    expect((await fetch(base + '/api/goods/inventory/' + one.id, { headers: two.headers })).status).toBe(403)
  })
  it('keeps GM media parsing after authorization and normal command limits before larger parsers', async () => {
    const { base, actor } = await fixture(), gm = await actor('mounted-gm', 'gm'), player = await actor('mounted-player')
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(6_000)]).toString('base64')
    const body = JSON.stringify({ imageBase64: png, mimeType: 'image/png' })
    expect(Buffer.byteLength(body)).toBeGreaterThan(4096)
    expect((await fetch(base + '/api/admin/cards/1/image', { method: 'PUT', headers: player.headers, body })).status).toBe(403)
    expect((await fetch(base + '/api/admin/cards/1/image', { method: 'PUT', headers: gm.headers, body })).status).toBe(200)
    expect((await fetch(base + '/card-images/1.png')).status).toBe(200)
    expect((await fetch(base + '/api/admin/cards/images', { headers: gm.headers })).status).toBe(200)
    expect((await fetch(base + '/api/world/command', { method: 'POST', headers: player.headers, body: JSON.stringify({ commandId: 'too-large', type: 'chat', payload: { text: 'x'.repeat(5_000) } }) })).status).toBe(413)
    expect((await fetch(base + '/api/cards/visit', { method: 'POST', headers: { ...player.headers, Origin: 'https://unapproved.example.test' }, body: '{}' })).status).toBe(403)
    expect((await fetch(base + '/api/cards/visit', { method: 'POST', headers: { ...player.headers, 'X-Greed-Account-Id': String(gm.id) }, body: '{}' })).status).toBe(409)
    expect((await fetch(base + '/api/cards/visit', { method: 'POST', headers: player.headers, body: '{}' })).status).toBe(200)
  })
  it('mounts actual public projections and keeps unsupported legacy families explicit', async () => {
    const { base, actor } = await fixture(), player = await actor('mounted-gates')
    for (const path of ['/api/buildings', '/api/buildings-catalog', '/api/areas', '/api/areas/t_dock', '/api/area/t_dock/ecology', '/api/goods/market-prices', '/api/cards/config']) expect((await fetch(base + path)).status, path).toBe(200)
    for (const path of ['/api/admin/npc-stats', '/api/admin/lineage', '/api/world/chronicle', '/api/world/history-arcs', '/api/world/bio-nodes', '/api/settlements', '/mp-api/snapshot']) expect((await fetch(base + path, { headers: player.headers })).status, path).toBe(404)
    for (const path of ['/api/buildings/unreviewed/apply', '/api/properties/bindings']) expect((await fetch(base + path, { method: 'POST', headers: player.headers, body: '{}' })).status, path).toBe(404)
    const generic = await fetch(base + '/api/world/player-action', { method: 'POST', headers: player.headers, body: JSON.stringify({ type: 'invent-unreviewed-action', payload: {} }) })
    expect(generic.status).toBe(400)
  })
})
