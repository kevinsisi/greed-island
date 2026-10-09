import Database from 'better-sqlite3'
import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { createHttpAuthorization } from './authorization.js'
import { createWorldRouter } from './world.js'
import { createSseRouter } from './sse.js'
import { createCardArtRouter, findCardArt } from './cardArtFiles.js'
import { publicReadTestRuntime } from './publicReadModels.testSupport.js'
const origin = 'http://127.0.0.1:4178', secret = 'PRIVATE-CREDENTIAL-DIALOGUE-PLAN'
const resources: Array<{ db: Database.Database; server: Server; directory: string; closeStreams: () => void }> = []
afterEach(async () => {
  for (const { db, server, directory, closeStreams } of resources.splice(0)) {
    closeStreams(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }); db.close(); rmSync(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const db = new Database(':memory:'); migrateIdentitySchema(db); const eventStore = new SqliteEventStore(db)
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
  const one = await auth.register({ kind: 'username', value: 'read-owner-one' }, 'synthetic-read-password', origin)
  const two = await auth.register({ kind: 'username', value: 'read-owner-two' }, 'synthetic-read-password', origin)
  const { runtime, eventListeners, tickListeners } = publicReadTestRuntime()
  const directory = mkdtempSync(join(tmpdir(), 'greed-public-read-'))
  eventStore.appendEvents([{ eventId: 'public-weather', eventType: 'WEATHER_CHANGE', actorId: 'system', tick: 1, occurredAt: 0, version: 1,
    deterministicKey: 'public-weather', payload: { actorType: 'system', data: { from: '晴', to: '驟雨', apiKey: secret }, narration: '天空從晴轉為驟雨。' } }])
  // High-frequency/private facts must not crowd out the typed public history query.
  eventStore.appendEvents(Array.from({ length: 220 }, (_, index) => ({ eventId: 'private-' + index, eventType: 'PLAYER_WORLD_CHAT_POSTED', actorId: String(two.principal.accountId), tick: 2, occurredAt: 1, version: 1, deterministicKey: 'private-' + index, payload: { data: { playerMessage: secret }, narration: secret } })))
  const app = express(), authConfig = createHttpAuthorization(auth)
  app.use('/api', createWorldRouter({ db, runtime, eventStore, authConfig, dataDir: directory }))
  const stream = createSseRouter(runtime, eventStore, 20); app.use('/api', stream); app.use(createCardArtRouter(directory))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); resources.push({ db, server, directory, closeStreams: () => stream.closeStreams() })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing socket')
  const headers = (grant: typeof one) => ({ Cookie: 'greed_session=' + grant.token, 'X-Greed-Account-Id': String(grant.principal.accountId) })
  return { db, auth, one, two, headers, directory, runtime, eventListeners, tickListeners, base: `http://127.0.0.1:${address.port}` }
}
describe('mounted reviewed world/catalog/read family', () => {
  it('keeps the typed operator overview role/context fenced and never returns raw private facts', async () => {
    const { base, db, auth, one, two, headers, runtime } = await setup()
    const original = runtime.getSnapshot.bind(runtime)
    runtime.getSnapshot = () => ({ ...original(), facts: { ...original().facts,
      fisheryDensity: [{ tileId: 't_dock', density: 0.75, harvestedTotal: 4, collapsed: false, lastUpdatedTick: 9, lastSequence: 7, secret }],
      marketPrices: [{ marketId: 'public-market', settlementId: 'public-town', goodsId: 'fish', supplyQuantity: 10, demandQuantity: 3, priceGold: 4, lastDiscoveredTick: 9, lastSequence: 7, privatePlan: secret }],
      logistics: { routes: [], transports: [], providerKey: secret },
      productionChains: { recipes: [], processed: [], privateNpcDialogue: secret },
      npcAgent: { credential: secret }, privateNpcPlans: secret,
    } })
    expect((await fetch(base + '/api/admin/world')).status).toBe(401)
    expect((await fetch(base + '/api/admin/world', { headers: headers(one) })).status).toBe(403)
    db.prepare("UPDATE accounts SET role='gm' WHERE id=?").run(one.principal.accountId)
    expect((await fetch(base + '/api/admin/world', { headers: { Cookie: headers(one).Cookie } })).status).toBe(400)
    expect((await fetch(base + '/api/admin/world', { headers: { ...headers(two), 'X-Greed-Account-Id': String(one.principal.accountId) } })).status).toBe(409)
    const response = await fetch(base + '/api/admin/world', { headers: headers(one) }); expect(response.status).toBe(200)
    const dto = await response.json()
    expect(dto.facts.fisheryDensity).toEqual([{ tileId: 't_dock', density: 0.75, harvestedTotal: 4, collapsed: false, lastUpdatedTick: 9, lastSequence: 7 }])
    expect(dto.facts.marketPrices[0]).toMatchObject({ priceGold: 4 })
    expect(dto.facts.goodsInventory).toEqual([]) // Player holders are excluded from the operator's non-player inventory scope.
    expect(dto.facts.animalPopulation).toBeNull(); expect(dto.operatorOverviewReady.animalPopulation).toBe(false)
    expect(dto.operatorOverviewReady.fisheryDensity).toBe(true)
    expect(JSON.stringify(dto)).not.toContain(secret)
    expect(await (await fetch(base + '/api/world')).text()).not.toContain('fisheryDensity')
    db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
    expect((await fetch(base + '/api/admin/world', { headers: headers(one) })).status).toBe(403)
    auth.logout(one.token, origin)
    expect((await fetch(base + '/api/admin/world', { headers: headers(one) })).status).toBe(401)
  })
  it('serves real whitelisted public values and history without private/unknown fields or traffic crowding', async () => {
    const { base } = await setup()
    for (const path of ['/api/world','/api/npcs','/api/cards','/api/events','/api/world-events']) {
      const response = await fetch(base + path); expect(response.status).toBe(200)
      const body = await response.text(); expect(body).not.toContain(secret)
    }
    expect(await (await fetch(base + '/api/events')).json()).toEqual([{ sequence: 1, tick: 1, eventType: 'WEATHER_CHANGE', actorId: 'system', occurredAt: '1970-01-01T00:00:00.000Z', payload: { from: '晴', to: '驟雨' }, narration: '天空從晴轉為驟雨。' }])
  })
  it('requires exact actor context for private overlays and uses only persisted own progress with no read writes', async () => {
    const { base, db, one, two, headers } = await setup()
    db.exec('CREATE TABLE player_npc_relations(account_id INTEGER,npc_id TEXT,trust INTEGER,interaction_count INTEGER,last_interaction_tick INTEGER); CREATE TABLE player_codex(account_id INTEGER,card_id INTEGER)')
    db.prepare('INSERT INTO player_npc_relations VALUES(?,?,?,?,?)').run(one.principal.accountId,'npc-one',75,3,4)
    db.prepare('INSERT INTO player_npc_relations VALUES(?,?,?,?,?)').run(two.principal.accountId,'npc-one',12,1,2)
    db.prepare('INSERT INTO player_codex VALUES(?,1)').run(one.principal.accountId)
    db.prepare('UPDATE accounts SET last_seen_tick=4 WHERE id=?').run(one.principal.accountId)
    const before = db.prepare('SELECT total_changes() AS count').get()
    const owner = await (await fetch(base + '/api/npcs', { headers: headers(one) })).json() as Array<Record<string, unknown>>
    expect(owner[0]).toMatchObject({ relationshipScore: 75, relationshipScoreSource: 'owned-relation', interactionCount: 3, lastInteractionTick: 4, relationshipProgressReady: true })
    const publicCookie = await (await fetch(base + '/api/npcs', { headers: { Cookie: headers(two).Cookie } })).json() as Array<Record<string, unknown>>
    expect(publicCookie[0]).toMatchObject({ relationshipScore: 45, relationshipScoreSource: 'profile-seed' }); expect(publicCookie[0]).not.toHaveProperty('interactionCount')
    for (const path of ['/api/npcs','/api/dashboard']) {
      const stale = await fetch(base + path, { headers: { ...headers(two), 'X-Greed-Account-Id': String(one.principal.accountId) } })
      expect(stale.status).toBe(409); expect(await stale.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
      expect((await fetch(base + path, { headers: { 'X-Greed-Account-Id': String(one.principal.accountId) } })).status).toBe(401)
    }
    const dashboard = await (await fetch(base + '/api/dashboard', { headers: headers(one) })).json()
    expect(dashboard).toMatchObject({ cardsOwned: 1, cardsOwnedReady: true, ticksSinceLastVisit: 6, wallet: null, walletInitialized: false, accountContext: one.principal.accountId })
    expect(await (await fetch(base + '/api/dashboard')).json()).toMatchObject({ cardsOwned: null, cardsOwnedReady: false, ticksSinceLastVisit: null, wallet: null, accountContext: null })
    expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(before)
  })
  it('invalidates revoked private overlays and exposes explicit unavailable state before progress schema exists', async () => {
    const { base, auth, one, headers } = await setup()
    const npcs = await (await fetch(base + '/api/npcs', { headers: headers(one) })).json() as Array<Record<string, unknown>>
    expect(npcs[0]).toMatchObject({ relationshipProgressReady: false }); expect(npcs[0]).not.toHaveProperty('interactionCount')
    expect(await (await fetch(base + '/api/dashboard', { headers: headers(one) })).json()).toMatchObject({ cardsOwned: null, cardsOwnedReady: false, wallet: null, walletInitialized: false })
    auth.logout(one.token, origin)
    expect((await fetch(base + '/api/npcs', { headers: headers(one) })).status).toBe(401)
    expect((await fetch(base + '/api/dashboard', { headers: headers(one) })).status).toBe(401)
  })
  it('uses the same safe REST projections in public SSE and releases runtime subscriptions', async () => {
    const { base, eventListeners, tickListeners } = await setup(), controller = new AbortController()
    const response = await fetch(base + '/api/events/stream', { signal: controller.signal })
    expect(response.status).toBe(200); const reader = response.body!.getReader()
    let initial = ''; while (!initial.includes('event: event')) initial += new TextDecoder().decode((await reader.read()).value)
    expect(initial).toContain('天空從晴轉為驟雨。'); expect(initial).not.toContain(secret)
    for (const listener of eventListeners) listener({ sequence: 300, tick: 10, eventType: 'NPC_PLAYER_DIALOGUE', actorId: '42', occurredAt: '2026-01-01', payload: {}, narration: secret })
    for (const listener of tickListeners) listener()
    const next = new TextDecoder().decode((await reader.read()).value); expect(next).not.toContain(secret)
    controller.abort(); await new Promise(resolve => setTimeout(resolve, 30))
    expect(eventListeners.size).toBe(0); expect(tickListeners.size).toBe(0)
  })
  it('preserves only valid known-ID file-backed art and never serves secrets, symlinks or arbitrary names', async () => {
    const { base, directory } = await setup(); mkdirSync(join(directory,'card-images'))
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+AkkkAAAAASUVORK5CYII=', 'base64')
    writeFileSync(join(directory,'card-images','1.png'), png)
    writeFileSync(join(directory,'card-images','2.png'), secret)
    writeFileSync(join(directory,'private.png'), png); symlinkSync(join(directory,'private.png'), join(directory,'card-images','3.png'))
    expect(findCardArt(directory,1)?.imageUrl).toBe('/card-images/1.png'); expect(findCardArt(directory,2)).toBeNull(); expect(findCardArt(directory,3)).toBeNull()
    const cards = await (await fetch(base + '/api/cards')).json() as { entries: Array<{ imageUrl: string }> }
    expect(cards.entries[0]!.imageUrl).toBe('/card-images/1.png')
    const image = await fetch(base + '/card-images/1.png'); expect(image.status).toBe(200); expect(image.headers.get('content-type')).toContain('image/png'); expect(Buffer.from(await image.arrayBuffer())).toEqual(png)
    for (const path of ['/card-images/2.png','/card-images/3.png','/card-images/101.png','/card-images/1.svg','/card-images/private.png','/card-images/%2e%2e%2fprivate.png']) expect((await fetch(base+path)).status).toBe(404)
    symlinkSync(directory, join(directory, 'alias'))
    expect(findCardArt(join(directory, 'alias'), 1)).toBeNull()
    renameSync(join(directory, 'card-images'), join(directory, 'approved-art'))
    symlinkSync(join(directory, 'approved-art'), join(directory, 'card-images'))
    expect(findCardArt(directory, 1)).toBeNull()
  })
})
