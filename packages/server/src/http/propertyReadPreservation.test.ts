import Database from 'better-sqlite3'
import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { listAllBuildings } from '../buildings/catalog.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import { createHttpAuthorization } from './authorization.js'
import { createCanonicalAccountView } from './canonicalAccountView.js'
import { createBuildingsReadRouter } from './buildingsRouter.js'
import { createAreaEcologyRouter } from './areaEcologyRouter.js'
import { createGoodsRouter } from './goodsRouter.js'
import { createPropertiesReadRouter } from './propertiesRouter.js'

const origin = 'http://127.0.0.1:4178'
const secret = 'private-state-canary'
const resources: Array<{ db: Database.Database; server: Server }> = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const { db, server } of resources.splice(0)) {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    db.close()
  }
})

async function setup() {
  const db = new Database(':memory:'); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
  const one = await auth.register({ kind: 'email', value: 'read-one@example.test' }, 'property-read-test-password', origin)
  const two = await auth.register({ kind: 'username', value: 'read-two' }, 'property-read-test-password', origin)
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(one.principal.accountId)
  const jobs = new PlayerJobsStore(db)
  const def = { ...listAllBuildings()[0]!, password: secret,
    placement: { ...listAllBuildings()[0]!.placement, privateMind: secret },
    interior: { ...listAllBuildings()[0]!.interior, secret,
      props: [{ col: 1, row: 2, glyph: 'x', plan: secret }] },
    hiring: [{ shift: 'morning', capacity: 2, wage: 3, taskZh: 'work', credentials: secret }],
  }
  const project = { projectId: 'p', kind: 'settlement', targetTileId: def.tileId,
    buildingId: 'construction', progress: 3, targetProgress: 9, startedAtTick: 3,
    completedAtTick: null, initiatedByNpcId: 'npc.builder', builderNpcIds: ['npc.builder'],
    privatePlan: secret }
  const state = { tileId: def.tileId, factionControl: { tide_hunters: 1, free_runners: 2, guild: 3, civilian: 4, secret },
    dominantFaction: null, resources: { food: 10, safety: 20, economy: 30, secret }, lastUpdatedTick: 99,
    recentEvents: [{ tick: 98, kind: 'pressure.food_shortage', narration: 'observable event',
      detail: { resource: 'food', value: 10, privateDialog: secret }, mind: secret }], pressureCooldowns: { secret: 98 }, secret }
  const peekAmbient = vi.fn(() => ({ tileId: def.tileId, text: 'cached ambient', source: 'ai', generatedAtTick: 99,
    generatedAt: 'date', aiError: secret, key: secret }))
  const scheduleAmbient = vi.fn(() => { throw new Error('GET must not schedule AI') })
  const rows = [
    { holderType: 'npc', holderId: 'npc.public', tileId: def.tileId, goodsId: 'meat', quantity: 3, secret },
    { holderType: 'player', holderId: 'npc.public', tileId: def.tileId, goodsId: 'fish', quantity: 9, secret },
    { holderType: 'player', holderId: String(one.principal.accountId), tileId: def.tileId, goodsId: 'meat', quantity: 4, secret },
    { holderType: 'player', holderId: String(two.principal.accountId), tileId: def.tileId, goodsId: 'fish', quantity: 7, secret },
    { holderType: 'npc', holderId: String(one.principal.accountId), tileId: def.tileId, goodsId: 'fish', quantity: 90, secret },
  ]
  const runtime = {
    getCurrentTick: () => 100,
    getAllBuildings: () => [{ def, occupants: [{ npcId: 'npc.public', shift: null, isOwner: true, mind: secret }], secret }],
    getBuildingsOnTile: () => [{ def, occupants: [{ npcId: 'npc.public', shift: null, isOwner: true, mind: secret }], secret }],
    getInProgressConstructionProjects: () => [project],
    getBuildingStatesByTile: () => [{ buildingId: def.id, state: 'operational', health: 87, privateDialog: secret }],
    getNpcActivityAndName: () => ({ nameZh: 'public display', activity: 'work', email: secret }),
    getLastProductiveAction: () => ({ domain: 'craft', narration: 'public productive action', mind: secret }),
    getAreaState: (tileId: string) => tileId === def.tileId ? state : null,
    getAreaStates: () => [state],
    getAmbientNarrator: () => ({ peek: peekAmbient, getOrSchedule: scheduleAmbient }),
    getAreaEcology: (tileId: string) => tileId === def.tileId ? { tileId, secret,
      animals: [{ speciesId: 'deer', tileId, biomeRegion: 'forest', count: 3, animalIds: ['a'], intent: 'foraging', thoughtZh: 'display text', privateDialog: secret }],
      fishery: { tileId, density: 4, harvestedTotal: 5, collapsed: false, lastUpdatedTick: 90, secret },
      migrationsArriving: [{ waveId: 'w', speciesId: 'deer', fromTileId: 'from', toTileId: tileId, migrationType: 'seasonal', startedAtTick: 80, count: 2, secret }],
      migrationsDeparting: [], predatorWarnings: [{ predatorSpeciesId: 'wolf', tileId, lastKillAtTick: 90, secret }],
      plants: [{ speciesId: 'grass', density: 3, capacity: 4, saturationPct: 75, state: 'spreading', thoughtZh: 'display text', secret }],
    } : null,
    getGoodsInventory: () => rows,
    getMarketPrices: () => [{ marketId: 'm', settlementId: 's', goodsId: 'fish', supplyQuantity: 3,
      demandQuantity: 4, priceGold: 5, lastDiscoveredTick: 1, secret }],
    getNpcs: () => [{ id: 'npc.public', name: { zh: 'public display', en: 'Public' }, privateDialog: secret }],
  } as unknown as SimulationRuntime
  const authConfig = createHttpAuthorization(auth)
  const app = express(); app.use(express.json())
  app.use('/api', createBuildingsReadRouter({ runtime, jobs, authConfig }))
  app.use('/api', createAreaEcologyRouter({ runtime }))
  app.use('/api', createGoodsRouter({ runtime, authConfig }))
  app.use('/api', createPropertiesReadRouter({ db, accounts: createCanonicalAccountView(db, auth.accounts), runtime, authConfig }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); resources.push({ db, server })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing socket')
  const headers = (grant: typeof one) => ({ Cookie: 'greed_session=' + grant.token, Origin: origin,
    'X-Greed-Account-Id': String(grant.principal.accountId), 'Content-Type': 'application/json' })
  return { db, auth, jobs, one, two, headers, def, rows, peekAmbient, scheduleAmbient,
    base: `http://127.0.0.1:${address.port}/api` }
}

function totalChanges(db: Database.Database): number {
  return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
}

describe('reviewed building/property/ecology/goods read surface', () => {
  it('keeps public geography/catalogs anonymous and allowlists every nested DTO', async () => {
    const { base, def, scheduleAmbient, peekAmbient } = await setup()
    for (const route of ['/buildings', '/buildings?tileId=' + def.tileId, '/buildings/' + def.id,
      '/buildings/construction', '/buildings-catalog', '/areas', '/areas/' + def.tileId,
      '/area/' + def.tileId + '/ecology', '/goods/inventory/npc.public', '/goods/market-prices']) {
      const response = await fetch(base + route)
      expect(response.status, route).toBe(200)
      const body = await response.text()
      expect(body, route).not.toContain(secret)
      expect(body, route).not.toContain('privateDialog')
      expect(body, route).not.toContain('password')
      expect(body, route).not.toContain('pressureCooldowns')
      expect(body, route).not.toContain('aiError')
    }
    expect(peekAmbient).toHaveBeenCalledWith(def.tileId)
    expect(scheduleAmbient).not.toHaveBeenCalled()
    const building = await (await fetch(base + '/buildings?tileId=' + def.tileId)).json() as { buildings: Array<{ def: { health?: number } }> }
    expect(building.buildings[0]!.def.health).toBe(87)
    expect((await fetch(base + '/buildings/unknown')).status).toBe(404)
    expect((await fetch(base + '/areas/unknown')).status).toBe(404)
    expect((await fetch(base + '/area/unknown/ecology')).status).toBe(404)
  })

  it('requires cookie and expected-account assertion on every private read', async () => {
    const { base, auth, one, two, headers } = await setup()
    const routes = ['/wallet', '/properties/bindings', '/goods/inventory/self', '/goods/inventory/' + one.principal.accountId]
    for (const route of routes) {
      expect((await fetch(base + route)).status, route).toBe(401)
      expect((await fetch(base + route, { headers: { Authorization: 'Bearer ' + one.token,
        'X-Greed-Account-Id': String(one.principal.accountId) } })).status, route).toBe(401)
      expect((await fetch(base + route + '?access_token=' + one.token)).status, route).toBe(401)
      expect((await fetch(base + route, { headers: { Cookie: headers(one).Cookie } })).status, route).toBe(400)
      expect((await fetch(base + route, { headers: { ...headers(two), 'X-Greed-Account-Id': String(one.principal.accountId) } })).status, route).toBe(409)
      expect((await fetch(base + route, { headers: { ...headers(one), Origin: 'https://evil.example' } })).status, route).toBe(403)
    }
    auth.logout(one.token, origin)
    for (const route of routes) expect((await fetch(base + route, { headers: headers(one) })).status, route).toBe(401)
  })

  it('reads existing wallet and own jobs without seeding or accepting account query IDs', async () => {
    const { base, db, jobs, one, two, headers, def } = await setup()
    const before = totalChanges(db)
    const absent = await (await fetch(base + '/wallet?accountId=' + two.principal.accountId, { headers: headers(one) })).json()
    expect(absent).toMatchObject({ wallet: null, walletInitialized: false, jobs: [], currentTick: 100 })
    expect(totalChanges(db)).toBe(before)
    jobs.addGold(one.principal.accountId, 17); jobs.addGold(two.principal.accountId, 99)
    jobs.apply({ accountId: one.principal.accountId, buildingId: def.id, shift: 'morning', tick: 90 })
    const stored = totalChanges(db)
    const own = await (await fetch(base + '/wallet?accountId=' + two.principal.accountId, { headers: headers(one) })).json()
    expect(own).toMatchObject({ wallet: { accountId: one.principal.accountId, gold: 17 }, walletInitialized: true,
      jobs: [{ accountId: one.principal.accountId, buildingId: def.id }] })
    expect(JSON.stringify(own)).not.toContain('read-one@example.test')
    expect(totalChanges(db)).toBe(stored)
  })

  it('preserves public-holder inventory while isolating cookie-owned player inventory', async () => {
    const { base, db, one, two, headers } = await setup()
    const before = totalChanges(db)
    expect(await (await fetch(base + '/goods/inventory/npc.public')).json()).toEqual([
      { goodsId: 'meat', quantity: 3, nameZh: '肉', unit: expect.any(String) },
    ])
    const own = [{ goodsId: 'meat', quantity: 4, nameZh: '肉', unit: expect.any(String) }]
    expect(await (await fetch(base + '/goods/inventory/self?accountId=' + two.principal.accountId, { headers: headers(one) })).json()).toEqual(own)
    expect(await (await fetch(base + '/goods/inventory/' + one.principal.accountId, { headers: headers(one) })).json()).toEqual(own)
    expect((await fetch(base + '/goods/inventory/' + two.principal.accountId, { headers: headers(one) })).status).toBe(403)
    expect((await fetch(base + '/goods/inventory/0', { headers: headers(one) })).status).toBe(403)
    expect((await fetch(base + '/goods/inventory/01', { headers: headers(one) })).status).toBe(403)
    expect(totalChanges(db)).toBe(before)
  })

  it('keeps property bindings role-limited, current and cookie-owned', async () => {
    const { base, db, one, two, headers } = await setup()
    db.prepare('INSERT INTO agent_npc_bindings(account_id,npc_id,bound_at) VALUES(?,?,?)').run(one.principal.accountId, 'npc.public', 100)
    db.prepare('INSERT INTO agent_npc_bindings(account_id,npc_id,bound_at) VALUES(?,?,?)').run(two.principal.accountId, 'npc.secret', 101)
    const before = totalChanges(db)
    expect(await (await fetch(base + '/properties/bindings?accountId=' + two.principal.accountId, { headers: headers(one) })).json()).toEqual({ bindings: [
      { accountId: one.principal.accountId, npcId: 'npc.public', npcName: 'public display', boundAt: 100 },
    ] })
    expect(totalChanges(db)).toBe(before)
    expect((await fetch(base + '/properties/bindings', { headers: headers(two) })).status).toBe(403)
    db.prepare("UPDATE accounts SET role='agent' WHERE id=?").run(two.principal.accountId)
    expect((await fetch(base + '/properties/bindings', { headers: headers(two) })).status).toBe(200)
    db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
    expect((await fetch(base + '/properties/bindings', { headers: headers(one) })).status).toBe(403)
    db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").run(two.principal.accountId)
    for (const route of ['/wallet', '/properties/bindings', '/goods/inventory/self']) {
      expect((await fetch(base + route, { headers: headers(two) })).status).toBe(401)
    }
  })

  it('does not mount building employment/rest or property binding mutators', async () => {
    const { base, db, one, headers, def } = await setup()
    const before = totalChanges(db)
    for (const action of ['apply', 'quit', 'work', 'rest']) {
      expect((await fetch(base + '/buildings/' + def.id + '/' + action, { method: 'POST', headers: headers(one), body: '{"shift":"morning"}' })).status).toBe(404)
    }
    expect((await fetch(base + '/properties/bindings', { method: 'POST', headers: headers(one), body: '{"npcId":"npc.public"}' })).status).toBe(404)
    expect((await fetch(base + '/properties/bindings/npc.public', { method: 'DELETE', headers: headers(one) })).status).toBe(404)
    expect(totalChanges(db)).toBe(before)
  })

  it('preserves public listings and known browser filters without forwarding auth/private selectors', async () => {
    const { base, one, headers } = await setup()
    const nativeFetch = globalThis.fetch
    let upstreamUrl: URL | undefined
    let upstreamOptions: RequestInit | undefined
    vi.stubGlobal('fetch', async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.hostname === '127.0.0.1') return nativeFetch(input, options)
      upstreamUrl = url; upstreamOptions = options
      return new Response(JSON.stringify({ total: 3, privateState: secret, listings: [null, {
        id: 'p1', title: 'listing', price: '18', address: 'public listing address', lat: 23, lng: 120,
        rooms: 2, hall: 1, bath: 1, sizePing: 30, buildingType: 'apartment', floor: '3F', age: 10,
        photoUrls: ['https://images.example/photo.jpg', 'javascript:private'], agentName: 'Business Agent',
        agentContact: 'Public business phone', email: secret, passwordHash: secret, privateNpcState: secret,
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const response = await fetch(base + '/properties?region=Taipei&type=apartment&rooms=2&priceMin=1&priceMax=20&sizeMin=2&sizeMax=50&ageMax=30&page=2&limit=20&accountId=2&access_token=secret&email=private', { headers: headers(one) })
    expect(response.status).toBe(200)
    const text = await response.text(); expect(text).not.toContain(secret); expect(text).not.toContain('email')
    expect(JSON.parse(text)).toMatchObject({ total: 3, page: 2, pageSize: 20, listings: [{ id: 'p1', price: 18,
      photoUrls: ['https://images.example/photo.jpg'], agentName: 'Business Agent', agentContact: 'Public business phone' }] })
    expect(upstreamUrl?.searchParams.get('region')).toBe('Taipei')
    expect([...upstreamUrl!.searchParams.keys()].sort()).toEqual(['ageMax','limit','page','priceMax','priceMin','region','rooms','sizeMax','sizeMin','type'].sort())
    expect(upstreamOptions?.headers).toBeUndefined()
    expect(upstreamOptions?.signal).toBeInstanceOf(AbortSignal)
    const publicResponse = await fetch(base + '/properties?page=-1&limit=100000')
    expect(publicResponse.status).toBe(200)
    expect(await publicResponse.json()).toMatchObject({ page: 1, pageSize: 100 })
  })

  it('reports real upstream absence/timeout instead of fabricated successful listings', async () => {
    const { base } = await setup()
    const nativeFetch = globalThis.fetch
    let mode = 'unavailable'
    vi.stubGlobal('fetch', async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.hostname === '127.0.0.1') return nativeFetch(input, options)
      if (mode === 'timeout') throw new DOMException('timed out', 'AbortError')
      if (mode === 'malformed') return new Response(JSON.stringify({ listings: {}, total: -2 }))
      return new Response('', { status: 503 })
    })
    const unavailable = await fetch(base + '/properties')
    expect(unavailable.status).toBe(503); expect(await unavailable.json()).toMatchObject({ error: 'UPSTREAM_UNAVAILABLE' })
    mode = 'timeout'; const timeout = await fetch(base + '/properties')
    expect(timeout.status).toBe(503); expect(await timeout.json()).toMatchObject({ error: 'UPSTREAM_TIMEOUT' })
    mode = 'malformed'; const malformed = await fetch(base + '/properties')
    expect(malformed.status).toBe(503)
    expect(await malformed.json()).toMatchObject({ error: 'UPSTREAM_UNAVAILABLE' })
  })
})
