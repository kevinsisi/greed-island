import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { api } from '../api/client'
import { ADMIN_WORLD_FIELDS, parseAdminWorldSnapshot } from '../api/adminWorld'
import { AdminWorldContent } from '../pages/AdminWorldPage'
import { createAdminWorldReader, type AdminWorldRead, type AdminWorldOwner } from './adminWorldRead'

function response() {
  const ready = Object.fromEntries(ADMIN_WORLD_FIELDS.map(field => [field, true]))
  return { tick: 91, lastSequence: 102, eventCount: 102, npcCount: 7, generatedAt: '2026-10-08T00:00:00Z', operatorOverviewReady: ready,
    facts: { fisheryDensity: [{ tileId: 't_dock', density: 73, harvestedTotal: 19, collapsed: false, lastUpdatedTick: 90, lastSequence: 101 }],
      goodsInventory: [{ goodsId: 'goods.actual', holderType: 'npc', holderId: 'npc.actual', tileId: 't_dock', quantity: 41, lastUpdatedTick: 90, lastSequence: 101 }],
      logistics: { routes: [], transports: [] }, productionChains: { recipes: [], processed: [] }, marketPrices: [],
      settlements: [{ id: 'settlement.actual', tileId: 't_dock', formedAtTick: 1, founderNpcIds: ['npc.actual'], populationNpcIds: ['npc.actual'], stability: 86, status: 'stable', updatedAtTick: 90, storage: [{ goodsId: 'goods.actual', quantity: 11 }], pressure: { food: 1, safety: 2, economy: 3, logistics: 4 } }],
      migrationRoutes: [], predatorHunger: [], animalPopulation: [], extinctionWarnings: [], ecosystemRegions: [], livestockRegistry: [], activeWorldEvents: [], factionEcologyStances: [] } }
}
const parsed = () => parseAdminWorldSnapshot(response())
const owner: AdminWorldOwner = { accountId: 7, epoch: 3, role: 'gm' }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('private operator read contract and rendering', () => {
  it('requests only the private endpoint with captured expected ID, cookie and no-store', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(response()), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const abort = new AbortController(), data = await api.adminWorld(7, abort.signal)
    expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0]).toEqual(['/api/admin/world', expect.objectContaining({ credentials: 'include', cache: 'no-store', signal: abort.signal, headers: expect.objectContaining({ 'X-Greed-Account-Id': '7' }) })])
    expect(data.tick).toBe(91); expect(data.facts.goodsInventory).toEqual(response().facts.goodsInventory)
    expect(() => api.adminWorld(0)).toThrow('context'); expect(() => api.adminWorld(NaN)).toThrow('context')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('keeps the exact fourteen projection availability fields and actual data', () => {
    const data = parsed(); expect(Object.keys(data.operatorOverviewReady).sort()).toEqual([...ADMIN_WORLD_FIELDS].sort())
    expect(Object.values(data.operatorOverviewReady).every(Boolean)).toBe(true)
    expect(data.facts.fisheryDensity).toEqual(response().facts.fisheryDensity)
    expect(data.facts.settlements).toEqual(response().facts.settlements)
  })
  it('does not promote missing, false or malformed readiness into empty rows', () => {
    for (const readiness of [undefined, {}, { fisheryDensity: 'true' }, { fisheryDensity: false }]) {
      const data = parseAdminWorldSnapshot({ ...response(), operatorOverviewReady: readiness })
      expect(data.operatorOverviewReady.fisheryDensity).toBe(false); expect(data.facts.fisheryDensity).toBeNull()
    }
    const facts = { ...response().facts, fisheryDensity: null }
    expect(parseAdminWorldSnapshot({ ...response(), facts }).operatorOverviewReady.fisheryDensity).toBe(false)
  })
  it.each(ADMIN_WORLD_FIELDS)('fails closed for malformed %s even with true readiness', field => {
    const data = parseAdminWorldSnapshot({ ...response(), facts: { ...response().facts, [field]: ['malformed'] } })
    expect(data.operatorOverviewReady[field]).toBe(false); expect(data.facts[field]).toBeNull()
  })
  it('validates nested settlement/logistics shape and rejects private player holders', () => {
    for (const facts of [{ ...response().facts, settlements: [{ ...response().facts.settlements[0], pressure: {} }] },
      { ...response().facts, logistics: { routes: [], transports: [{ fromHolderType: 'player' }] } },
      { ...response().facts, goodsInventory: [{ ...response().facts.goodsInventory[0], holderType: 'player' }] }]) {
      const data = parseAdminWorldSnapshot({ ...response(), facts })
      expect(Object.values(data.operatorOverviewReady).filter(value => !value)).toHaveLength(1)
    }
  })
  it('removes unknown facts and unknown nested row fields instead of rendering them', () => {
    const facts = { ...response().facts, token: 'DO-NOT-RENDER', fisheryDensity: [{ ...response().facts.fisheryDensity[0], privateDialogue: 'DO-NOT-RENDER' }] }
    expect(JSON.stringify(parseAdminWorldSnapshot({ ...response(), facts }))).not.toContain('DO-NOT-RENDER')
  })
  it('rejects missing/malformed base snapshots rather than making a tick or world', () => {
    for (const value of [null, {}, { ...response(), tick: -1 }, { ...response(), npcCount: NaN }, { ...response(), facts: null }]) expect(() => parseAdminWorldSnapshot(value)).toThrow('unavailable')
  })
  it('keeps each ready family visible when its neighboring projection is unavailable', () => {
    const source = response(), data = parseAdminWorldSnapshot({ ...source,
      operatorOverviewReady: { ...source.operatorOverviewReady, extinctionWarnings: false, activeWorldEvents: false },
      facts: { ...source.facts, ecosystemRegions: [{ tileId: 'pressure.actual', pressureLevel: 87, pollutionLevel: 43, lastPressureRaisedTick: null, lastRecoveredTick: null }], factionEcologyStances: [{ factionId: 'faction.actual', ecologyStance: 'preserve' }] } })
    const html = renderToStaticMarkup(<MemoryRouter><AdminWorldContent world={data} ready={data.operatorOverviewReady} refreshWorld={async () => {}} t={key => key} locale="en" /></MemoryRouter>)
    expect(html).toContain('pressure.actual'); expect(html).toContain('faction.actual'); expect(html).toContain('extinctionWarnings: projection unavailable.'); expect(html).toContain('activeWorldEvents: projection unavailable.')
    expect(html).not.toContain('All species stable'); expect(html).not.toContain('No active mythic events')
  })
  it('renders real private consumer projections and unavailable gates with no public fallback', () => {
    const data = parsed(), render = (world: typeof data) => renderToStaticMarkup(<MemoryRouter><AdminWorldContent world={world} ready={world.operatorOverviewReady} refreshWorld={async () => {}} t={key => key} locale="en" /></MemoryRouter>)
    const html = render(data); expect(html).toContain('settlement.actual'); expect(html).toContain('npc.actual'); expect(html).toContain('goods.actual'); expect(html).toContain('73')
    const unavailable = parseAdminWorldSnapshot({ ...response(), operatorOverviewReady: { ...response().operatorOverviewReady, fisheryDensity: false } })
    const hidden = render(unavailable); expect(hidden).toContain('fisheryDensity: projection unavailable.'); expect(hidden).not.toContain('admin.world.fisheryEmpty'); expect(hidden).toContain('Unavailable'); expect(hidden).not.toContain('>73<')
    const missing = render(parseAdminWorldSnapshot({ ...response(), operatorOverviewReady: {} }))
    for (const field of ADMIN_WORLD_FIELDS) expect(missing).toContain(field)
    expect(missing).not.toContain('settlement.actual'); expect(missing).not.toContain('npc.actual')
    const page = readFileSync(new URL('../pages/AdminWorldPage.tsx', import.meta.url), 'utf8')
    expect(page).not.toContain('useWorldState'); expect(page).not.toContain('sourceFixture'); expect(page).toContain('useAdminWorld')
  })
})
describe('captured actor/role/session/request ownership', () => {
  it('single-flights bounded reads and clears prior data on failure', async () => {
    let resolve!: (value: ReturnType<typeof parsed>) => void
    const changes: AdminWorldRead[] = [], load = vi.fn(() => new Promise<ReturnType<typeof parsed>>(done => { resolve = done }))
    const reader = createAdminWorldReader({ owner, isCurrent: () => true, load, onChange: value => changes.push(value) })
    const first = reader.refresh(); expect(reader.refresh()).toBe(first); expect(load).toHaveBeenCalledOnce(); resolve(parsed()); await first
    expect(changes.at(-1)?.status).toBe('ready')
    load.mockImplementationOnce(async () => { throw new Error('offline') }); await reader.refresh()
    expect(changes.at(-1)).toEqual({ status: 'unavailable', response: null }); reader.dispose()
  })
  it.each(['account replacement','same-account new epoch','role demotion','role change','logout','unmount'])('ignores an obsolete response after %s', async reason => {
    let current: { epoch: number; accountId: number | null; role: string } = { ...owner }, resolve!: (value: ReturnType<typeof parsed>) => void
    const changes: AdminWorldRead[] = []
    const reader = createAdminWorldReader({ owner, isCurrent: own => own.epoch === current.epoch && own.accountId === current.accountId && own.role === current.role,
      load: () => new Promise(done => { resolve = done }), onChange: value => changes.push(value) })
    const pending = reader.refresh()
    if (reason === 'unmount') reader.dispose()
    else if (reason === 'role demotion') current.role = 'player'
    else if (reason === 'role change') current.role = 'admin'
    else if (reason === 'logout') current.accountId = null
    else if (reason === 'account replacement') current.accountId = 8
    else current.epoch += 1
    resolve(parsed()); await pending
    expect(changes).toEqual([{ status: 'loading', response: null }]); reader.dispose()
  })
  it('aborts an inconclusive read at six seconds and never applies its late payload', async () => {
    vi.useFakeTimers(); let resolve!: (value: ReturnType<typeof parsed>) => void, signal!: AbortSignal
    const changes: AdminWorldRead[] = []
    const reader = createAdminWorldReader({ owner, isCurrent: () => true, load: (_id, value) => { signal = value; return new Promise(done => { resolve = done }) }, onChange: value => changes.push(value) })
    const pending = reader.refresh(); await vi.advanceTimersByTimeAsync(6000); await pending
    expect(signal.aborted).toBe(true); expect(changes.at(-1)).toEqual({ status: 'unavailable', response: null })
    resolve(parsed()); await Promise.resolve(); expect(changes).toHaveLength(2); reader.dispose()
  })
  it('revalidates a current denied role only after clearing operator data', async () => {
    const changes: AdminWorldRead[] = [], forbidden = vi.fn(() => expect(changes.at(-1)?.status).toBe('unavailable'))
    const reader = createAdminWorldReader({ owner, isCurrent: () => true, load: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }) }, onChange: value => changes.push(value), onForbidden: forbidden })
    await reader.refresh(); expect(forbidden).toHaveBeenCalledOnce(); reader.dispose()
  })
})
