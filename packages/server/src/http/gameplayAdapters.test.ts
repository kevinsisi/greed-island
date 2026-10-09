// Source-only HTTP fixtures. Real cookie/SQLite checks remain native CI gates.
import express from 'express'
import type { Request, RequestHandler } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpAuthorization } from './authorization.js'
import { PlayerWorldError, type PlayerWorldPosition } from '../playerWorld/types.js'
import { accountId } from '../identity/principal.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { NpcProfile } from '../npcs/types.js'
import { CanonicalGameplayAuthority } from './gameplayAuthority.js'
import { PlayerSurvivalProjection } from '../projections/playerSurvival.js'
const mocks = vi.hoisted(() => ({ ai: vi.fn() }))
vi.mock('./auth.js', () => ({ requireAuth: (auth: HttpAuthorization) => auth.forRequest, toPublicAccount: (account: { displayName: string }) => account }))
vi.mock('../identity/authRouter.js', () => ({ assertExpectedAccountContext: (expected: string | undefined, principal: { accountId: number }) => {
  if (!expected || !/^[1-9][0-9]*$/.test(expected)) throw Object.assign(new Error(), { code: 'ACCOUNT_CONTEXT_REQUIRED' })
  if (Number(expected) !== principal.accountId) throw Object.assign(new Error(), { code: 'ACCOUNT_CHANGED' })
} }))
vi.mock('../npcs/aiDialog.js', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), generateAiReply: mocks.ai }))
import { createUnifiedNpcRouter } from './npc.js'
import { createUnifiedPlayerSurvivalRouter } from './playerSurvivalRouter.js'
import { createUnifiedPlayerCivilizationRouter } from './playerCivilizationRouter.js'
import { createUnifiedCombatRouter } from './combatRouter.js'
import { EventFixture } from '../playerWorld/service.testSupport.js'
import { commitAuthorizedPlayerCommand } from './playerCommandCommit.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'

const servers: Server[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))) })
beforeEach(() => { mocks.ai.mockReset() })
async function endpoint(router: express.Router) {
  const app = express(); app.use(router)
  const server = await new Promise<Server>(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) }); servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
function fixture() {
  let active = true, actor = 1, tick = 20, role: 'player' | 'admin' = 'player'
  const revoked = new Set<(id: number) => void>()
  const profile: NpcProfile = { id: 'local', name: { zh: '米拉', en: 'Mira' }, role: { zh: '嚮導', en: 'Guide' }, defaultLocation: 't_central', routine: [], triggers: [], memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 }, personality: { trustBase: 50, patience: 0.8 } }
  let position: PlayerWorldPosition = { accountId: accountId(1), tileId: 't_central', x: 7, z: 5, movementStep: 0, sequence: 1 }, admitted = true
  const npc = { id: profile.id, name: profile.name, color: 1, location: 't_central', activity: 'idle', buildingId: null as string | null, travelRoute: null, deceased: false, subCol: 7, subRow: 5, subZ: 0 }
  let npcs = [npc, { ...npc, id: 'far', subCol: 14 }, { ...npc, id: 'remote', location: 't_forest' }, { ...npc, id: 'inside', buildingId: 'b_central_exchange' }]
  const commands: Array<{ commandType: string; actorId: string; payload: Record<string, unknown> }> = [], events: Array<Record<string, unknown>> = [], relations = new Map<string, Record<string, number>>()
  const projection = new PlayerSurvivalProjection()
  const runtime = {
    findProfile: (id: string) => npcs.some(n => n.id === id) ? { ...profile, id } : null,
    getCurrentTick: () => tick, getNpcs: () => npcs, getNpcsIncludingDeceased: () => npcs,
    getNpcMortalityProjection: () => ({ isDeceased: (id: string) => npcs.find(n => n.id === id)?.deceased ?? false }),
    getPlayerWorldPosition: () => position, getPlayerWorldGridPose: () => position.interior ? null : { subCol: position.x, subRow: position.z, subZ: 0 },
    getAdmittedPlayerWorldActors: () => admitted ? [position] : [], getNpcBuildingId: (id: string) => npcs.find(n => n.id === id)?.buildingId ?? null,
    getActiveNpcRumors: () => [], getFormattedPlayerRelationshipContext: () => '', getNpcMemory: () => null,
    getNpcIntentStack: () => [], getNpcLearningWeights: () => [], getNpcBeliefs: () => [],
    getPlayerSurvivalProjection: () => projection,
    getPlayerCivilizationSnapshot: (id: string) => ({ accountId: id, wallet: 0, hiredNpcIds: ['owned'], factionIds: ['member'], claimedTileIds: [] }),
    getSettlementById: (id: string) => id === 'local-settlement' ? { tileId: position.tileId } : null,
    getGoodsInventory: () => [{ holderType: 'player', holderId: '1', tileId: position.tileId, goodsId: 'meat', quantity: 3 }],
    submitAuthorizedPlayerCommand: (command: { commandType: string; actorId: string; payload: Record<string, unknown> }, hooks: { authorize: () => void; beforeCommit?: () => void }) => { hooks.authorize(); hooks.beforeCommit?.(); commands.push(command); projection.project({ sequence: commands.length, eventType: command.commandType, payload: { data: command.payload } } as never); return { eventId: `event-${commands.length}` } },
    holdNpcForPlayerDialog: vi.fn(() => ({ tick, expiresAtTick: tick + 1 })),
    submitLivingWorldCommand: (command: { commandType: string; actorId: string; payload: Record<string, unknown> }) => { commands.push(command); projection.project({ sequence: commands.length, eventType: command.commandType, payload: { data: command.payload } } as never); return { eventId: `event-${commands.length}` } },
  } as unknown as SimulationRuntime
  const token = (req: Request) => req.get('cookie') === 'greed_session=synthetic' ? 'synthetic' : null
  const resolve = (req: Request) => token(req) && active ? { sub: actor, email: null, role, displayName: `Player ${actor}` } : null
  const reauthorize = (req: Request) => {
    if (req.get('origin') !== 'http://127.0.0.1:4178') throw Object.assign(new Error(), { code: 'ORIGIN_NOT_ALLOWED' })
    const current = resolve(req); if (!current) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' })
    if (req.get('x-greed-account-id') !== String(current.sub)) throw Object.assign(new Error(), { code: req.get('x-greed-account-id') ? 'ACCOUNT_CHANGED' : 'ACCOUNT_CONTEXT_REQUIRED' })
    req.auth = current; return current
  }
  const middleware: RequestHandler = (req, res, next) => {
    try { const current = req.method === 'GET' ? resolve(req) : reauthorize(req); if (!current) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' }); if (req.get('x-greed-account-id') !== String(current.sub)) throw Object.assign(new Error(), { code: req.get('x-greed-account-id') ? 'ACCOUNT_CHANGED' : 'ACCOUNT_CONTEXT_REQUIRED' }); req.auth = current; next() }
    catch (error) { const code = (error as { code: string }).code; res.status(({ UNAUTHORIZED: 401, ORIGIN_NOT_ALLOWED: 403, ACCOUNT_CHANGED: 409, ACCOUNT_CONTEXT_REQUIRED: 400 } as Record<string, number>)[code] ?? 500).json({ error: code }) }
  }
  const auth: HttpAuthorization = { forRequest: middleware, session: middleware, mutation: middleware, optional: middleware, role: () => middleware, resolve, token, reauthorizeMutation: reauthorize,
    authService: { resolve: (value: string | null) => value === 'synthetic' && active ? { accountId: accountId(actor), role } : null, onRevoked: (listener: (id: number) => void) => { revoked.add(listener); return () => revoked.delete(listener) } } as never }
  const store = { getRelation: (_id: number, npcId: string) => relations.get(npcId) ?? null,
    upsertRelation: (value: { npcId: string; trust: number; interactionCount: number }) => { relations.set(value.npcId, value as never); return value },
    appendPersonalEvent: (value: Record<string, unknown>) => { events.push(value); return { ...value, id: events.length, occurredAt: 0 } }, listPersonalEvents: () => events }
  const accounts = { findById: (id: number) => ({ id, email: null, username: 'synthetic', createdAt: 0, role, nickname: null, avatar: 'tide', displayName: `Player ${id}` }) }
  let gold = 30
  const jobs = { peekWallet: () => ({ accountId: actor, gold, energy: 100, updatedAt: 0 }), getWallet: () => ({ accountId: actor, gold, energy: 100, updatedAt: 0 }), addGold: (_id: number, amount: number) => { gold += amount; return { gold } } }
  const settings = { countActive: () => 0, getSetting: () => null }
  const headers = { Cookie: 'greed_session=synthetic', Origin: 'http://127.0.0.1:4178', 'X-Greed-Account-Id': '1', 'Content-Type': 'application/json' }
  return { runtime, auth, store, settings, accounts, jobs, commands, events, projection, profile, npc, headers, relations,
    revoke: () => { active = false; for (const listener of revoked) listener(actor) }, switch: () => { actor = 2 }, unadmit: () => { admitted = false }, move: (next: Partial<PlayerWorldPosition>) => { position = { ...position, ...next } }, setNpcs: (next: typeof npcs) => { npcs = next }, getGold: () => gold, setTick: (next: number) => { tick = next } }
}
function npcRouter(f: ReturnType<typeof fixture>) { return createUnifiedNpcRouter({ runtime: f.runtime, authConfig: f.auth, accounts: f.accounts, store: f.store as never, settings: f.settings as never }) }
function interventionReceiptFixture() {
  const f = fixture(), facts = new EventFixture(), authorizations = vi.fn()
  f.setNpcs([f.npc, { ...f.npc, id: 'second' }])
  Object.assign(f.runtime, { submitAuthorizedPlayerCommand: (...[command, hooks]: Parameters<SimulationRuntime['submitAuthorizedPlayerCommand']>) =>
    commitAuthorizedPlayerCommand(facts as never, command, { ...hooks, authorize: () => { authorizations(); hooks.authorize() } })?.event ?? null })
  return { f, facts, authorizations }
}

describe('source-only canonical NPC gameplay adapters', () => {
  it('returns the same committed intervention effects for a same-tick duplicate without applying them twice', async () => {
    const { f, facts, authorizations } = interventionReceiptFixture(), url = await endpoint(npcRouter(f))
    const send = () => fetch(`${url}/npc/intervene`, { method: 'POST', headers: f.headers,
      body: JSON.stringify({ npcA: 'local', npcB: 'second', mode: 'mediate', effects: { npcA: { trust: 100 } } }) })
    const first = await send(), original = await first.json() as { duplicate: boolean; effects: unknown; eventId: string }
    const retry = await send(), repeated = await retry.json() as { duplicate: boolean; effects: unknown; eventId: string; effectsStatus: string; currentRelations: { npcA: { trust: number } } }
    expect(first.status).toBe(200); expect(retry.status).toBe(200)
    expect(original.duplicate).toBe(false); expect(repeated.duplicate).toBe(true)
    expect(repeated.eventId).toBe(original.eventId); expect(repeated.effects).toEqual(original.effects)
    expect(repeated.effects).toMatchObject({ npcA: { trust: 52, trustDelta: 2 } })
    expect(repeated.effectsStatus).toBe('committed-receipt'); expect(repeated.currentRelations.npcA.trust).toBe(52)
    expect(f.relations.get('local')?.trust).toBe(52); expect(facts.events).toHaveLength(1); expect(f.events).toHaveLength(2)
    expect(authorizations).toHaveBeenCalledTimes(2)
  })
  it('keeps original intervention receipt effects distinct from a subsequently changed current relation', async () => {
    const { f, facts } = interventionReceiptFixture(), url = await endpoint(npcRouter(f))
    const send = (mode: string) => fetch(`${url}/npc/intervene`, { method: 'POST', headers: f.headers,
      body: JSON.stringify({ npcA: 'local', npcB: 'second', mode }) })
    const first = await (await send('mediate')).json() as { effects: unknown }
    expect((await send('threaten')).status).toBe(200); expect(f.relations.get('local')?.trust).toBe(48)
    const retry = await send('mediate'), result = await retry.json() as { duplicate: boolean; effects: unknown; currentRelations: { npcA: { trust: number; interactionCount: number } } }
    expect(retry.status).toBe(200); expect(result.duplicate).toBe(true); expect(result.effects).toEqual(first.effects)
    expect(result.effects).toMatchObject({ npcA: { trust: 52 } })
    expect(result.currentRelations.npcA).toMatchObject({ trust: 48, interactionCount: 2 })
    expect(f.relations.get('local')?.trust).toBe(48); expect(facts.events).toHaveLength(2); expect(f.events).toHaveLength(4)
  })
  it('reports an unavailable original result for a historical intervention receipt without guessing from current trust', async () => {
    const { f, facts } = interventionReceiptFixture(), url = await endpoint(npcRouter(f))
    const send = () => fetch(`${url}/npc/intervene`, { method: 'POST', headers: f.headers,
      body: JSON.stringify({ npcA: 'local', npcB: 'second', mode: 'mediate' }) })
    expect((await send()).status).toBe(200)
    // Rebuild a historical pre-result receipt with its original intent-based ID.
    const old = facts.events[0]!, { effects: _effects, ...intent } = (old.payload as { data: Record<string, unknown> }).data
    const historical = new EventFixture()
    const oldCommand = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0, intent as never)
    commitAuthorizedPlayerCommand(historical as never, oldCommand, { authorize: () => {} })
    facts.events = historical.events; f.relations.set('local', { trust: 75, interactionCount: 7, lastInteractionTick: 20 })
    const retry = await send(), result = await retry.json() as { duplicate: boolean; effects: unknown; effectsStatus: string; currentRelations: { npcA: { trust: number } } }
    expect(retry.status).toBe(200); expect(result.duplicate).toBe(true); expect(result.effects).toBeNull()
    expect(result.effectsStatus).toBe('legacy-result-unavailable'); expect(result.currentRelations.npcA.trust).toBe(75)
    expect(facts.events).toHaveLength(1); expect(f.events).toHaveLength(2)
  })
  it('still requires live authorization for an intervention receipt retry', async () => {
    const { f, facts } = interventionReceiptFixture(), url = await endpoint(npcRouter(f))
    const send = () => fetch(`${url}/npc/intervene`, { method: 'POST', headers: f.headers,
      body: JSON.stringify({ npcA: 'local', npcB: 'second', mode: 'mediate' }) })
    expect((await send()).status).toBe(200); f.revoke()
    expect((await send()).status).toBe(401); expect(facts.events).toHaveLength(1); expect(f.events).toHaveLength(2)
    expect(f.relations.get('local')?.trust).toBe(52)
  })
  it('does not disclose an existing intervention receipt when transaction-time reauthorization fails', async () => {
    const { f, facts } = interventionReceiptFixture(), url = await endpoint(npcRouter(f))
    const send = () => fetch(`${url}/npc/intervene`, { method: 'POST', headers: f.headers,
      body: JSON.stringify({ npcA: 'local', npcB: 'second', mode: 'mediate' }) })
    expect((await send()).status).toBe(200)
    const authorize = f.auth.reauthorizeMutation
    vi.spyOn(f.auth, 'reauthorizeMutation').mockImplementationOnce(authorize).mockImplementationOnce(() => { throw Object.assign(new Error(), { code: 'UNAUTHORIZED' }) })
    const retry = await send(); expect(retry.status).toBe(401); expect(await retry.json()).toEqual({ error: 'UNAUTHORIZED' })
    expect(facts.events).toHaveLength(1); expect(f.events).toHaveLength(2); expect(f.relations.get('local')?.trust).toBe(52)
  })
  it('uses two-cell exterior authority and explicit building admission, without caller poses', () => {
    const f = fixture(), authority = new CanonicalGameplayAuthority(f.runtime)
    expect(authority.requireNearbyNpc(1, 'local').id).toBe('local')
    expect(() => authority.requireNearbyNpc(1, 'far')).toThrow('two authored')
    expect(() => authority.requireNearbyNpc(1, 'remote')).toThrow('canonical player region')
    expect(() => authority.requireNearbyNpc(1, 'inside')).toThrow('Explicit canonical')
    f.move({ interior: { buildingId: 'b_central_exchange', returnPose: { x: 7, z: 5 } } }); expect(authority.requireNearbyNpc(1, 'inside').id).toBe('inside')
    expect(() => authority.requireNearbyNpc(1, 'local')).toThrow('admitted catalog building')
    f.unadmit(); expect(() => authority.requireNearbyNpc(1, 'inside')).toThrow('admitted live')
  })
  it('ignores forged shout tile/actor/candidate lists and preserves deterministic identity reply and trust/history', async () => {
    const f = fixture(), url = await endpoint(npcRouter(f))
    const response = await fetch(`${url}/npc/local-shout`, { method: 'POST', headers: f.headers, body: JSON.stringify({ tileId: 't_forest', candidateNpcIds: ['remote'], actorId: 2, message: '我是誰？' }) })
    expect(response.status).toBe(200); const reply = await response.json() as { npcId: string; line: { zh: string } }; expect(reply.npcId).toBe('local'); expect(reply.line.zh).toContain('Player 1')
    expect(f.events).toHaveLength(1); expect(f.commands[0]).toMatchObject({ actorId: '1', payload: { tile: 't_central', playerAccountId: '1' } })
  })
  it('rejects remote/far/deceased NPC mutations and keeps private history remote-readable without mutating it', async () => {
    const f = fixture(), url = await endpoint(npcRouter(f))
    for (const id of ['remote', 'far', 'inside']) { const response = await fetch(`${url}/npc/${id}/interact`, { method: 'POST', headers: f.headers, body: JSON.stringify({ intent: 'greet' }) }); expect(response.status).toBe(409) }
    f.npc.deceased = true; expect((await fetch(`${url}/npc/local/dialog-hold`, { method: 'POST', headers: f.headers })).status).toBe(410)
    expect((await fetch(`${url}/npc/remote/history`, { headers: f.headers })).status).toBe(200); expect(f.events).toHaveLength(0); expect(f.commands).toHaveLength(0)
  })
  it('reauthorizes after the mocked AI await and never writes revoked-account relation/dialog/history', async () => {
    const f = fixture(); f.settings.countActive = () => 1
    let finish!: (value: { zh: string; en: string; intent: 'ask'; trustDelta: number }) => void
    mocks.ai.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const url = await endpoint(npcRouter(f)), pending = fetch(`${url}/npc/local-shout`, { method: 'POST', headers: f.headers, body: JSON.stringify({ message: 'Where should I go?' }) })
    await vi.waitFor(() => expect(mocks.ai).toHaveBeenCalledOnce()); f.revoke(); finish({ zh: '你好', en: 'Hello', intent: 'ask', trustDelta: 90 })
    expect((await pending).status).toBe(401); expect(f.relations.size).toBe(0); expect(f.events).toHaveLength(0); expect(f.commands).toHaveLength(0)
  })
  it('bounds one pending NPC mutation/account and blocks movement during an awaited turn', async () => {
    const f = fixture(); f.settings.countActive = () => 1
    let finish!: (value: unknown) => void; mocks.ai.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const url = await endpoint(npcRouter(f)), pending = fetch(`${url}/npc/local-shout`, { method: 'POST', headers: f.headers, body: JSON.stringify({ message: 'Where should I go?' }) })
    await vi.waitFor(() => expect(mocks.ai).toHaveBeenCalledOnce())
    expect((await fetch(`${url}/npc/local/interact`, { method: 'POST', headers: f.headers, body: JSON.stringify({ intent: 'greet' }) })).status).toBe(429)
    f.move({ tileId: 't_forest' }); finish({ zh: '你好', en: 'Hello', intent: 'ask', trustDelta: 90 }); expect((await pending).status).toBe(409); expect(f.events).toHaveLength(0)
  })
})

describe('source-only survival and bounded player action adapters', () => {
  it('makes GET needs pure, seeds only explicit POST, and keeps actor/wallet authoritative', async () => {
    const f = fixture(), url = await endpoint(createUnifiedPlayerSurvivalRouter({ runtime: f.runtime, authConfig: f.auth, jobs: f.jobs as never }))
    expect((await fetch(`${url}/player/needs`, { headers: f.headers })).status).toBe(200); expect(f.commands).toHaveLength(0); expect(f.projection.getState(1)).toBeNull()
    expect((await fetch(`${url}/player/needs/reconcile`, { method: 'POST', headers: f.headers })).status).toBe(200); expect(f.commands[0]).toMatchObject({ actorId: '1', commandType: 'PLAYER_NEEDS_SEEDED' })
    const before = f.getGold(); expect((await fetch(`${url}/player/eat`, { method: 'POST', headers: f.headers, body: '{}' })).status).toBe(200); expect(f.getGold()).toBeLessThan(before)
    expect((await fetch(`${url}/player/eat`, { method: 'POST', headers: f.headers, body: '{"accountId":2}' })).status).toBe(400)
    f.switch(); expect((await fetch(`${url}/player/eat`, { method: 'POST', headers: f.headers })).status).toBe(409)
  })
  it('conserves owned local deposits and permits only verified own membership/dismissal requests', async () => {
    const f = fixture(), url = await endpoint(createUnifiedPlayerCivilizationRouter({ runtime: f.runtime, authConfig: f.auth }))
    const action = (type: string, payload: object) => fetch(`${url}/world/player-action`, { method: 'POST', headers: f.headers, body: JSON.stringify({ type, payload }) })
    expect((await action('PLAYER_PICKED_UP_GOODS', { goodsId: 'meat', quantity: 99, tileId: 't_central' })).status).toBe(409)
    expect((await action('PLAYER_PLAYED_CARD', { cardId: '1', targetTileId: 't_forest' })).status).toBe(409)
    expect((await action('PLAYER_DEPOSIT_GOODS', { goodsId: 'meat', quantity: 4, settlementId: 'local-settlement' })).status).toBe(409)
    expect((await action('PLAYER_DEPOSIT_GOODS', { goodsId: 'meat', quantity: 2, settlementId: 'local-settlement' })).status).toBe(200)
    expect(f.commands[0]).toMatchObject({ actorId: '1', payload: { tileId: 't_central', playerAccountId: '1', quantity: 2 } })
    expect((await action('PLAYER_DISMISSED_NPC', { npcId: 'other' })).status).toBe(403); expect((await action('PLAYER_DISMISSED_NPC', { npcId: 'owned' })).status).toBe(200)
    expect((await action('PLAYER_LEFT_FACTION', { factionId: 'member' })).status).toBe(200)
    expect((await action('PLAYER_DISMISSED_NPC', { npcId: 'owned', playerAccountId: '2' })).status).toBe(400)
  })
})

function combatRouter(f: ReturnType<typeof fixture>) {
  const session = { combat_id: 'owned', player_account_id: 1, npc_id: 'local', tile_id: 't_central', started_tick: 1, player_hp: 100, npc_hp: 100, combat_round: 0, state: 'active', outcome: null, resolved_tick: null, enemy_type: 'npc', species_id: null }
  const store = { getActiveSessionForPlayer: () => null, getSession: (id: string) => id === 'owned' || id.startsWith('combat_') ? session : id === 'other' ? { ...session, player_account_id: 2 } : null, listLog: () => [], isNpcIncapacitated: () => false }
  const plays: Array<{ accountId: number; targetActorId: string; authorize: () => void }> = [], rounds: unknown[] = []
  Object.assign(f.runtime, { getCombatSnapshot: () => ({ combatId: 'owned', actors: [{ actorId: '1', hp: 100, maxHp: 100 }, { actorId: 'local', hp: 100, maxHp: 100 }], resolved: false, lastCombatTick: 0 }),
    submitCombatCardPlay: (input: typeof plays[number]) => { plays.push(input); return { commandId: 'queued' } }, submitCombatCardCancel: () => false,
    submitCombatRoundAction: (input: unknown) => { rounds.push(input); return { result: { events: [], resolved: false }, session } }, subscribeCombatEvents: () => () => {} })
  const router = createUnifiedCombatRouter({ runtime: f.runtime, jobs: f.jobs as never, authConfig: f.auth, store: store as never, db: {} as never, techniques: { listOwned: () => [] } })
  return { router, plays, rounds }
}
describe('source-only canonical combat adapters', () => {
  it('requires canonical nearby initiation, private ownership and in-combat target identity', async () => {
    const f = fixture(), c = combatRouter(f), url = await endpoint(c.router)
    expect((await fetch(`${url}/combat/other`, { headers: f.headers })).status).toBe(403)
    expect((await fetch(`${url}/combat/initiate`, { method: 'POST', headers: f.headers, body: '{"targetNpcId":"remote","accountId":2,"tileId":"t_forest"}' })).status).toBe(409)
    expect((await fetch(`${url}/combat/initiate`, { method: 'POST', headers: f.headers, body: '{"targetNpcId":"local"}' })).status).toBe(200)
    expect(f.commands[0]).toMatchObject({ actorId: '1', payload: { tile: 't_central', playerAccountId: '1' } })
    expect((await fetch(`${url}/combat/owned/play`, { method: 'POST', headers: f.headers, body: '{"cardClass":"TIDE_STRIKE","targetActorId":"remote"}' })).status).toBe(400)
    expect((await fetch(`${url}/combat/owned/play`, { method: 'POST', headers: f.headers, body: '{"cardClass":"TIDE_STRIKE","targetActorId":"local","accountId":2}' })).status).toBe(200)
    expect(c.plays[0]?.accountId).toBe(1); f.revoke(); expect(() => c.plays[0]!.authorize()).toThrow(); c.router.closeStreams()
  })
  it('requires stream expected-account query and immediately invalidates the exact revoked session', async () => {
    const f = fixture(), c = combatRouter(f), url = await endpoint(c.router)
    expect((await fetch(`${url}/combat/owned/stream`, { headers: f.headers })).status).toBe(400)
    const response = await fetch(`${url}/combat/owned/stream?expectedAccountId=1`, { headers: f.headers }), reader = response.body!.getReader()
    const first = await reader.read(); expect(new TextDecoder().decode(first.value)).toContain('event: snapshot')
    f.revoke(); const invalidated = await reader.read(); expect(new TextDecoder().decode(invalidated.value)).toContain('session.invalidated')
    expect((await reader.read()).done).toBe(true); c.router.closeStreams()
  })
})
