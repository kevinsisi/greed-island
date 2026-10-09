import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthService, AuthError } from '../identity/authService.js'
import { accountId } from '../identity/principal.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { loadCardCatalog } from '../cards/loader.js'
import { TECHNIQUE_CARDS } from '../cards/techniques.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { createHttpAuthorization } from './authorization.js'
import { createCanonicalAccountView } from './canonicalAccountView.js'
import { CardActionPipeline } from './cardCommands.js'
import { CardWorldStore } from './cardWorldStore.js'
import { createOwnedCardRouter } from './cardWorldRouter.js'
import { createOwnedTechniqueRouter } from './techniqueShopRouter.js'
import { OwnedFeatureTransaction } from './ownedFeatureTransaction.js'

const origin = 'http://127.0.0.1:4178'
const databases: Database.Database[] = [], listeners: Server[] = []
afterEach(async () => {
  for (const server of listeners.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  for (const db of databases.splice(0)) if (db.open) db.close()
  vi.restoreAllMocks()
})
async function setup() {
  const db = new Database(':memory:'); databases.push(db); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
  const one = await auth.register({ kind: 'username', value: 'owned-one' }, 'synthetic-test-password', origin)
  const two = await auth.register({ kind: 'username', value: 'owned-two' }, 'synthetic-test-password', origin)
  const authorization = createHttpAuthorization(auth), accounts = createCanonicalAccountView(db, auth.accounts)
  const jobs = new PlayerJobsStore(db), catalog = loadCardCatalog(), store = new CardWorldStore(db, catalog), pipeline = new CardActionPipeline(db, store)
  let tick = 0
  const locations = new Map([[one.principal.accountId, { tileId: 't_dock', subCol: 7, subRow: 5 }], [two.principal.accountId, { tileId: 't_dock', subCol: 7, subRow: 5 }]])
  const runtime = {
    getCurrentTick: () => tick,
    getAdmittedPlayerWorldActors: () => [...locations].map(([id, p]) => ({ accountId: id, tileId: p.tileId, x: 999, z: 999, sequence: 1, movementStep: 1 })),
    getPlayerWorldGridPose: (id: ReturnType<typeof accountId>) => { const p = locations.get(id); return p ? { subCol: p.subCol, subRow: p.subRow, subZ: 0 as const } : null },
  }
  const app = express(); app.use(express.json())
  app.use((req, _res, next) => { req.auth = { sub: 999, email: 'forged@example.test', role: 'admin', displayName: 'Forged' }; next() })
  app.use('/api', createOwnedCardRouter({ db, store, pipeline, runtime, jobs, accounts, authConfig: authorization }))
  app.use('/api', createOwnedTechniqueRouter({ db, runtime, jobs, authConfig: authorization }))
  const server = app.listen(0, '127.0.0.1'); listeners.push(server); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test listener')
  const base = 'http://127.0.0.1:' + address.port + '/api'
  const headers = (actor = one) => ({ Cookie: 'greed_session=' + actor.token, Origin: origin, 'X-Greed-Account-Id': String(actor.principal.accountId), 'Content-Type': 'application/json' })
  const post = (path: string, body: unknown, actor = one, key?: string) => fetch(base + path, {
    method: 'POST', headers: { ...headers(actor), ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
  })
  const spawn = (cardId = 1, tileId = 't_dock', x = 300, y = 220) => pipeline.spawnDrop({
    type: 'CARD_DROP_SPAWN', actorId: 'system', tick, cardId, tileId, x, y, reason: 'seed',
  }).drop!
  const codex = (actor: number, cardId: number, index = cardId) => Number(db.prepare(`INSERT INTO player_codex
    (account_id,card_id,slot_type,slot_index,obtained_tick,obtained_at) VALUES (?,?,'sequencing',?,0,0)`).run(actor, cardId, index).lastInsertRowid)
  return { db, auth, authorization, jobs, catalog, store, pipeline, locations, one, two, base, headers, post, spawn, codex, setTick: (value: number) => { tick = value } }
}

describe('reviewed owned card cookie adapter', () => {
  it('preserves every card GET while requiring cookie+expected account, without GET seeds or visit writes', async () => {
    const f = await setup(), paths = ['/cards/active?tileId=t_dock', '/cards/held', '/cards/since-last-visit', '/codex', '/trade/list', '/shop/techniques', '/me/techniques']
    f.spawn(); const before = f.db.prepare('SELECT last_seen_tick FROM accounts WHERE id=?').get(f.one.principal.accountId)
    for (const path of paths) {
      expect((await fetch(f.base + path, { headers: { Authorization: 'Bearer invented-token' } })).status).toBe(401)
      expect((await fetch(f.base + path, { headers: { Cookie: f.headers().Cookie } })).status).toBe(400)
      expect((await fetch(f.base + path, { headers: { ...f.headers(f.two), 'X-Greed-Account-Id': String(f.one.principal.accountId) } })).status).toBe(409)
      expect((await fetch(f.base + path, { headers: f.headers() })).status).toBe(200)
    }
    expect((await fetch(f.base + '/cards/config')).status).toBe(200)
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM player_wallet').get()).toEqual({ n: 0 })
    expect(f.db.prepare('SELECT last_seen_tick FROM accounts WHERE id=?').get(f.one.principal.accountId)).toEqual(before)
    const held = await (await fetch(f.base + '/cards/held', { headers: f.headers() })).json()
    expect(held).toMatchObject({ energy: null, walletInitialized: false })
    f.setTick(10); expect((await f.post('/cards/visit', {})).status).toBe(200)
    expect(f.db.prepare('SELECT last_seen_tick FROM accounts WHERE id=?').get(f.one.principal.accountId)).toEqual({ last_seen_tick: 10 })
  })
  it('enforces exact Origin, account context and canonical admitted pickup proximity; ignores body actor and position', async () => {
    const f = await setup(), drop = f.spawn()
    expect((await fetch(f.base + '/cards/pickup', { method: 'POST', headers: { ...f.headers(), Origin: origin + '/evil' }, body: JSON.stringify({ dropId: drop.id }) })).status).toBe(403)
    expect((await fetch(f.base + '/cards/pickup', { method: 'POST', headers: { Cookie: f.headers().Cookie }, body: '{}' })).status).toBe(403)
    f.locations.delete(f.one.principal.accountId)
    expect((await f.post('/cards/pickup', { dropId: drop.id, accountId: f.two.principal.accountId, tileId: 't_dock', x: drop.x, y: drop.y })).status).toBe(409)
    f.locations.set(f.one.principal.accountId, { tileId: 't_central', subCol: 7, subRow: 5 })
    expect((await f.post('/cards/pickup', { dropId: drop.id, tileId: 't_dock' })).status).toBe(409)
    f.locations.set(f.one.principal.accountId, { tileId: 't_dock', subCol: 0, subRow: 0 })
    expect((await f.post('/cards/pickup', { dropId: drop.id, x: drop.x, y: drop.y })).status).toBe(409)
    f.locations.set(f.one.principal.accountId, { tileId: 't_dock', subCol: 7, subRow: 5 })
    expect((await f.post('/cards/pickup', { dropId: drop.id + '.junk' })).status).toBe(400)
    expect((await f.post('/cards/pickup', { dropId: drop.id, actorId: f.two.principal.accountId })).status).toBe(200)
    expect(f.store.getDrop(drop.id)?.holder_account_id).toBe(f.one.principal.accountId)
    const privateOther = await (await fetch(f.base + '/cards/active?tileId=t_dock', { headers: f.headers(f.two) })).json() as { drops: unknown[] }
    expect(privateOther.drops).toHaveLength(0)
  })
  it('preserves pickup/store/materialize and durable idempotent retries without allowing cross-account ownership', async () => {
    const f = await setup(), drop = f.spawn()
    const pickup = await f.post('/cards/pickup', { dropId: drop.id }, f.one, 'pickup-one'), pickupBody = await pickup.json()
    expect(pickup.status).toBe(200)
    expect(await (await f.post('/cards/pickup', { dropId: drop.id }, f.one, 'pickup-one')).json()).toEqual(pickupBody)
    expect((await f.post('/cards/release', { dropId: drop.id }, f.two)).status).toBe(409)
    expect((await f.post('/cards/store', { dropId: drop.id, slotType: 'carry' }, f.two)).status).toBe(409)
    const stored = await (await f.post('/cards/store', { dropId: drop.id, slotType: 'sequencing' }, f.one, 'store-one')).json() as { codex: { id: number } }
    expect(f.store.listCodexForAccount(f.one.principal.accountId)).toHaveLength(1)
    expect((await f.post('/codex/materialize', { codexId: stored.codex.id }, f.two)).status).toBe(403)
    const first = await (await f.post('/codex/materialize', { codexId: stored.codex.id }, f.one, 'materialize-one')).json()
    expect(await (await f.post('/codex/materialize', { codexId: stored.codex.id }, f.one, 'materialize-one')).json()).toEqual(first)
    expect((await f.post('/codex/materialize', { codexId: stored.codex.id + 1 }, f.one, 'materialize-one')).status).toBe(409)
    expect(f.pipeline.recentEvents().filter(row => row.eventType === 'CARD_MATERIALIZE')).toHaveLength(1)
    expect(f.store.listCodexForAccount(f.one.principal.accountId)).toHaveLength(0)
  })
  it('keeps sixty-second deadlines authoritative before a lazy tick hook and rolls failed card audit writes back', async () => {
    const f = await setup(), expired = f.spawn(); f.setTick(12)
    expect((await f.post('/cards/pickup', { dropId: expired.id })).status).toBe(409)
    expect(f.store.getDrop(expired.id)?.state).toBe('available')
    const fresh = f.spawn(2)
    f.db.exec(`CREATE TRIGGER fail_card_audit BEFORE INSERT ON card_action_log
      WHEN NEW.event_type='CARD_PICKUP' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END`)
    expect((await f.post('/cards/pickup', { dropId: fresh.id }, f.one, 'failed-pickup')).status).toBe(500)
    expect(f.store.getDrop(fresh.id)?.state).toBe('available')
    expect(f.db.prepare('SELECT * FROM owned_feature_receipts').all()).toHaveLength(0)
    f.db.exec('DROP TRIGGER fail_card_audit')
    expect((await f.post('/cards/pickup', { dropId: fresh.id }, f.one, 'failed-pickup')).status).toBe(200)
    f.setTick(24)
    expect((await f.post('/cards/store', { dropId: fresh.id, slotType: 'carry' })).status).toBe(409)
    expect((await f.post('/cards/release', { dropId: fresh.id })).status).toBe(409)
  })
  it('preserves trade propose/accept/reject/cancel with actor-scoped list and atomic exchange', async () => {
    const f = await setup(), offered = f.codex(f.one.principal.accountId, 1), requested = f.codex(f.two.principal.accountId, 2)
    const proposed = await f.post('/trade/propose', { targetUserId: f.two.principal.accountId, offeredCodexId: offered, requestedCardId: 2 }, f.one, 'propose')
    expect(proposed.status).toBe(201)
    const body = await proposed.json() as { trade: { id: number; proposerName: string } }
    expect(body.trade.proposerName).toBe('owned-one')
    expect((await f.post('/trade/accept/' + body.trade.id, {}, f.one)).status).toBe(403)
    expect((await f.post('/trade/accept/' + body.trade.id + '.junk', {}, f.two)).status).toBe(400)
    expect((await f.post('/trade/accept/' + body.trade.id, {}, f.two, 'accept')).status).toBe(200)
    expect(f.store.listCodexForAccount(f.one.principal.accountId).map(row => row.card_id)).toEqual([2])
    expect(f.store.listCodexForAccount(f.two.principal.accountId).map(row => row.card_id)).toEqual([1])
    expect(f.store.getCodexEntry(requested)).toBeNull()
    const nextOffered = f.store.listCodexForAccount(f.one.principal.accountId)[0]!.id
    const rejected = await (await f.post('/trade/propose', { targetUserId: f.two.principal.accountId, offeredCodexId: nextOffered, requestedCardId: 1 })).json() as { trade: { id: number } }
    expect((await f.post('/trade/reject/' + rejected.trade.id, {}, f.one)).status).toBe(403)
    expect((await f.post('/trade/reject/' + rejected.trade.id, {}, f.two)).status).toBe(200)
    const cancelled = await (await f.post('/trade/propose', { targetUserId: f.two.principal.accountId, offeredCodexId: nextOffered, requestedCardId: 1 })).json() as { trade: { id: number } }
    expect((await f.post('/trade/cancel/' + cancelled.trade.id, {}, f.two)).status).toBe(403)
    expect((await f.post('/trade/cancel/' + cancelled.trade.id, {}, f.one)).status).toBe(200)
  })
  it('rolls both trade inventories and status back when an exchange projection fails', async () => {
    const f = await setup(), offered = f.codex(f.one.principal.accountId, 1)
    f.codex(f.two.principal.accountId, 2)
    const proposed = await (await f.post('/trade/propose', { targetUserId: f.two.principal.accountId, offeredCodexId: offered, requestedCardId: 2 })).json() as { trade: { id: number } }
    const before = f.db.prepare('SELECT * FROM player_codex ORDER BY id').all()
    f.db.exec(`CREATE TRIGGER fail_exchange BEFORE INSERT ON player_codex
      WHEN NEW.account_id=${f.two.principal.accountId} BEGIN SELECT RAISE(ABORT,'synthetic exchange failure'); END`)
    expect((await f.post('/trade/accept/' + proposed.trade.id, {}, f.two, 'failed-exchange')).status).toBe(500)
    expect(f.db.prepare('SELECT * FROM player_codex ORDER BY id').all()).toEqual(before)
    expect(f.store.getTrade(proposed.trade.id)?.status).toBe('pending')
    expect(f.pipeline.recentEvents().filter(row => row.eventType === 'CARD_TRADE_ACCEPT')).toHaveLength(0)
    expect(f.db.prepare("SELECT * FROM owned_feature_receipts WHERE request_key='failed-exchange'").all()).toHaveLength(0)
    f.db.exec('DROP TRIGGER fail_exchange')
    expect((await f.post('/trade/accept/' + proposed.trade.id, {}, f.two, 'failed-exchange')).status).toBe(200)
  })
  it('rolls an owned mutation back when commit-time session validation fails', async () => {
    const f = await setup(), drop = f.spawn(), original = f.authorization.reauthorizeMutation
    let calls = 0
    const authorization = { ...f.authorization, reauthorizeMutation: (...args: Parameters<typeof original>) => {
      if (++calls === 2) throw new AuthError('UNAUTHORIZED')
      return original(...args)
    } }
    const transaction = new OwnedFeatureTransaction(f.db, authorization)
    const req = { headers: { cookie: f.headers().Cookie }, get: (name: string) => {
      const values = { origin, 'x-greed-account-id': String(f.one.principal.accountId), 'idempotency-key': 'revoked' }
      return values[name.toLowerCase() as keyof typeof values]
    } }
    expect(() => transaction.run(req as never, 'pickup', { dropId: drop.id }, me => {
      f.pipeline.pickup({ type: 'CARD_PICKUP', actorId: me, tick: 0, dropId: drop.id })
      return { status: 200, body: {} }
    })).toThrow(AuthError)
    expect(f.store.getDrop(drop.id)?.state).toBe('available')
    expect(f.pipeline.recentEvents().filter(row => row.eventType === 'CARD_PICKUP')).toHaveLength(0)
    expect(f.db.prepare('SELECT * FROM owned_feature_receipts').all()).toHaveLength(0)
    f.db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").run(f.one.principal.accountId)
    expect((await f.post('/cards/pickup', { dropId: drop.id })).status).toBe(401)
  })
})

describe('canonical technique purchase', () => {
  it('uses only admitted canonical location and existing wallet; purchase retries debit once and owned reads remain private', async () => {
    const f = await setup(), card = TECHNIQUE_CARDS[0]!, id = f.one.principal.accountId
    expect((await f.post('/shop/techniques/' + card.id + '/buy', { tileId: 't_temple' })).status).toBe(409)
    f.locations.set(id, { tileId: 't_temple', subCol: 7, subRow: 5 })
    expect((await f.post('/shop/techniques/' + card.id + '/buy', {})).status).toBe(409)
    expect(f.jobs.peekWallet(id)).toBeNull()
    f.jobs.addGold(id, card.priceGold * 2)
    const first = await f.post('/shop/techniques/' + card.id + '/buy', { actorId: f.two.principal.accountId }, f.one, 'buy-one'), body = await first.json()
    expect(first.status).toBe(200)
    expect(await (await f.post('/shop/techniques/' + card.id + '/buy', {}, f.one, 'buy-one')).json()).toEqual(body)
    expect(f.jobs.peekWallet(id)?.gold).toBe(card.priceGold)
    expect(f.db.prepare('SELECT account_id,count FROM player_techniques').all()).toEqual([{ account_id: id, count: 1 }])
    const other = await (await fetch(f.base + '/me/techniques', { headers: f.headers(f.two) })).json()
    expect(other).toEqual({ owned: [] })
  })
  it('rolls the wallet debit back on owned projection failure and rejects stale cookie context', async () => {
    const f = await setup(), card = TECHNIQUE_CARDS[0]!, id = f.one.principal.accountId
    f.locations.set(id, { tileId: 't_temple', subCol: 7, subRow: 5 }); f.jobs.addGold(id, card.priceGold)
    f.db.exec(`CREATE TRIGGER fail_owned BEFORE INSERT ON player_techniques BEGIN SELECT RAISE(ABORT,'synthetic owned failure'); END`)
    expect((await f.post('/shop/techniques/' + card.id + '/buy', {}, f.one, 'fail-buy')).status).toBe(500)
    expect(f.jobs.peekWallet(id)?.gold).toBe(card.priceGold)
    expect(f.db.prepare('SELECT * FROM player_techniques').all()).toHaveLength(0)
    expect(f.db.prepare('SELECT * FROM owned_feature_receipts').all()).toHaveLength(0)
    expect((await fetch(f.base + '/shop/techniques/' + card.id + '/buy', { method: 'POST', headers: { ...f.headers(f.two), 'X-Greed-Account-Id': String(id) }, body: '{}' })).status).toBe(409)
    expect(f.jobs.peekWallet(id)?.gold).toBe(card.priceGold)
  })
})
