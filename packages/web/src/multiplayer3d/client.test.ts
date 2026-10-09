import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorldClient } from './client'
import { profileFixture, snapshotFixture } from './testFixtures'

class FakeStream {
  listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  closed = false
  addEventListener(type: string, listener: (event: MessageEvent) => void) { this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]) }
  close() { this.closed = true }
  emit(type: string, data?: unknown) { this.listeners.get(type)?.forEach(listener => listener({ data: JSON.stringify(data) } as MessageEvent)) }
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const clients: ReturnType<typeof createWorldClient>[] = []
class FakeSessionChannel {
  listener: ((event: MessageEvent) => void) | null = null
  posts: unknown[] = []
  closed = false
  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) { this.listener = listener }
  postMessage(data: { type: 'session-changed' }) { this.posts.push(data) }
  close() { this.closed = true }
  emit(data: unknown) { this.listener?.({ data } as MessageEvent) }
}
function setup(custom?: typeof fetch, channel?: FakeSessionChannel) {
  let nextId = 0
  const fetcher = vi.fn<typeof fetch>(custom ?? (async (input, init) => {
    if (String(input).startsWith('/api/auth/')) return response(String(input).endsWith('/logout') ? { ok: true } : { profile: profileFixture() })
    if (String(input).endsWith('/snapshot')) return response(snapshotFixture())
    const body = JSON.parse(String(init?.body)) as { commandId: string }
    return response({ accepted: true, commandId: body.commandId, revision: 2 })
  }))
  const onSnapshot = vi.fn(), onProfile = vi.fn(), onStatus = vi.fn(), onError = vi.fn()
  const streams: FakeStream[] = []
  const createStream = vi.fn(() => { const stream = new FakeStream(); streams.push(stream); return stream })
  const client = createWorldClient({ fetch: fetcher, createStream, commandId: () => `test-${++nextId}`, onSnapshot, onProfile, onStatus, onError, ...(channel ? { createSessionChannel: () => channel } : {}) })
  clients.push(client)
  return { client, fetcher, streams, createStream, onSnapshot, onProfile, onStatus, onError }
}
async function online(s: ReturnType<typeof setup>) { await s.client.start(); s.streams[0]!.emit('snapshot', snapshotFixture()) }
const bodies = (s: ReturnType<typeof setup>) => s.fetcher.mock.calls.filter(([url]) => String(url) === '/api/world/command').map(([, init]) => JSON.parse(String(init?.body)))
afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers() })

describe('original beacon in the sole admitted world client', () => {
  async function near(s: ReturnType<typeof setup>) {
    await online(s)
    const state = snapshotFixture(2); state.players[0]!.z = state.beacon.z
    s.streams[0]!.emit('snapshot', state)
    return state
  }
  it('sends only an empty contribution intent with own context and waits for committed counters', async () => {
    const s = setup(), before = await near(s)
    expect(await s.client.contribute()).toBe(true)
    expect(bodies(s)).toEqual([{ commandId: 'test-1', type: 'contribute', payload: {} }])
    const init = s.fetcher.mock.calls.at(-1)![1]!
    expect(init.credentials).toBe('include'); expect(new Headers(init.headers).get('X-Greed-Account-Id')).toBe('1')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(before)
    await expect(s.client.contribute()).rejects.toThrow('等待伺服器進度')
    const after = snapshotFixture(3); after.players[0]!.z = after.beacon.z
    after.harborProgress = { status: 'ready', supplies: 0, rewards: 0 }; after.players[0]!.harborProgress = after.harborProgress; after.beacon.contributors = [1]
    s.streams[0]!.emit('snapshot', after)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(after)
    await expect(s.client.contribute()).rejects.toThrow('已交付')
    expect(bodies(s)).toHaveLength(1)
  })
  it('fails closed for unknown legacy progress without sending a command or fabricating resources', async () => {
    const s = setup(), state = await near(s)
    state.harborProgress = { status: 'legacy-review-required', supplies: null, rewards: null }; state.players[0]!.harborProgress = state.harborProgress; state.revision = 3
    s.streams[0]!.emit('snapshot', state)
    await expect(s.client.contribute()).rejects.toThrow('帳號關聯待核實')
    expect(bodies(s)).toHaveLength(0)
    expect(s.onSnapshot.mock.calls.at(-1)![0].harborProgress.supplies).toBeNull()
  })
  it('prevents concurrent submissions and ignores late ACK after logout', async () => {
    const s = setup(); await near(s)
    let resolve!: (value: Response) => void
    s.fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = s.client.contribute()
    await Promise.resolve(); await expect(s.client.contribute()).rejects.toThrow('交付處理中')
    await s.client.logout()
    resolve(response({ accepted: true, commandId: 'test-1', revision: 20 }))
    expect(await pending).toBe(false)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(null)
    expect(s.onProfile).toHaveBeenLastCalledWith(null)
    expect(bodies(s)).toHaveLength(1)
  })
  it('waits for the in-flight move and cancels contribution if canonical position leaves the radius', async () => {
    const s = setup(); await near(s)
    let resolveMove!: (value: Response) => void
    s.fetcher.mockImplementationOnce(() => new Promise(done => { resolveMove = done }))
    await s.client.move(1, 0)
    const pending = s.client.contribute()
    expect(bodies(s).map(body => body.type)).toEqual(['move'])
    const moved = snapshotFixture(3); moved.players[0]!.x = 8; moved.players[0]!.z = moved.beacon.z
    s.streams[0]!.emit('snapshot', moved)
    resolveMove(response({ accepted: true, commandId: 'test-1', revision: 3 }))
    await expect(pending).rejects.toThrow('位置或燈塔進度已變更')
    expect(bodies(s).map(body => body.type)).toEqual(['move'])
  })
  it('treats stale-account contribution as identity invalidation without retry', async () => {
    const s = setup(); await near(s)
    s.fetcher.mockResolvedValueOnce(response({ error: 'ACCOUNT_CHANGED' }, 409))
    await expect(s.client.contribute()).rejects.toThrow('登入身份已變更')
    expect(bodies(s)).toHaveLength(1)
    expect(s.streams[0]!.closed).toBe(true)
    expect(s.onProfile).toHaveBeenCalledWith(null)
  })
  it('retains profile on lost world admission and does not retry contribution', async () => {
    const s = setup(); await near(s)
    s.fetcher.mockResolvedValueOnce(response({ error: 'WORLD_CONNECTION_REQUIRED' }, 409))
    await expect(s.client.contribute()).rejects.toThrow('連線席位')
    expect(s.onProfile).toHaveBeenLastCalledWith(profileFixture())
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(bodies(s)).toHaveLength(1)
  })
})

describe('one cookie account/world client', () => {
  it('reads the one profile then world; only an admitted stream enables commands', async () => {
    const s = setup(); await s.client.start()
    expect(s.fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', '/api/world/snapshot'])
    expect(s.onStatus).toHaveBeenLastCalledWith('connecting')
    await expect(s.client.transition('t_central')).rejects.toThrow('重新連線')
    s.streams[0]!.emit('snapshot', snapshotFixture())
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.createStream).toHaveBeenCalledWith('/api/world/stream')
    expect(s.fetcher.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true)
  })
  it('logs in with username or existing email and creates no client token', async () => {
    const s = setup(); await s.client.login('existing@example.com', 'legacy-password')
    expect(s.fetcher.mock.calls[0]?.[0]).toBe('/api/auth/login')
    expect(JSON.parse(String(s.fetcher.mock.calls[0]?.[1]?.body))).toEqual({ identifier: 'existing@example.com', password: 'legacy-password' })
    expect(s.fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(s.onProfile).toHaveBeenLastCalledWith(profileFixture())
  })
  it('registers a username through the same cookie account service, without email/role/claim code', async () => {
    const s = setup(); await s.client.register('new-player', 'a-long-test-password')
    expect(s.fetcher.mock.calls[0]?.[0]).toBe('/api/auth/register')
    expect(JSON.parse(String(s.fetcher.mock.calls[0]?.[1]?.body))).toEqual({ username: 'new-player', password: 'a-long-test-password' })
  })
  it('rejects an incompatible login wrapper instead of requesting another account', async () => {
    const s = setup(async () => response({ account: profileFixture() }))
    await expect(s.client.login('traveler', 'long-password')).rejects.toThrow('登入資料格式')
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
    expect(s.createStream).not.toHaveBeenCalled()
  })
  it('enters only after the typed WORLD_ENTRY_REQUIRED response', async () => {
    let reads = 0
    const s = setup(async (input, init) => {
      if (String(input) === '/api/auth/me') return response({ profile: profileFixture() })
      if (String(input).endsWith('/snapshot')) return ++reads === 1 ? response({ error: 'WORLD_ENTRY_REQUIRED' }, 409) : response(snapshotFixture())
      const body = JSON.parse(String(init?.body)); return response({ accepted: true, commandId: body.commandId, revision: 1 })
    })
    await s.client.start()
    expect(bodies(s)).toEqual([{ commandId: 'test-1', type: 'enter', payload: {} }])
    expect(s.fetcher.mock.calls.find(([url]) => String(url) === '/api/world/command')?.[1]?.headers).toHaveProperty('X-Greed-Account-Id', '1')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture())
  })
  it('resumes the other tab position on ALREADY_IN_WORLD rather than resetting it', async () => {
    let reads = 0
    const s = setup(async input => {
      if (String(input) === '/api/auth/me') return response({ profile: profileFixture() })
      if (String(input).endsWith('/snapshot')) return ++reads === 1 ? response({ error: 'WORLD_ENTRY_REQUIRED' }, 409) : response(snapshotFixture())
      return response({ error: 'ALREADY_IN_WORLD' }, 409)
    })
    await s.client.start(); expect(bodies(s)).toHaveLength(1)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture())
  })
  it.each([401, 503])('never creates an entry intent after generic auth/network status %s', async status => {
    const s = setup(async () => response({ error: 'UNAUTHORIZED' }, status))
    await s.client.start(); expect(bodies(s)).toHaveLength(0); expect(s.createStream).not.toHaveBeenCalled()
  })
  it('keeps an authenticated profile and explicit unsupported-geometry error without entering', async () => {
    const s = setup(async input => String(input) === '/api/auth/me' ? response({ profile: profileFixture() }) : response({ error: 'GEOMETRY_UNAVAILABLE', message: 'Region geometry is not supported yet.' }, 409))
    await s.client.start(); expect(bodies(s)).toHaveLength(0)
    expect(s.onProfile).toHaveBeenLastCalledWith(profileFixture())
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onError).toHaveBeenLastCalledWith('這個區域的場景尚未支援，玩家位置未被重設。')
  })
  it('ignores old revisions and accepts presence-only movement-step snapshots', async () => {
    const s = setup(); await online(s)
    s.streams[0]!.emit('snapshot', snapshotFixture(5, 10))
    s.streams[0]!.emit('snapshot', snapshotFixture(4, 100))
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture(5, 10))
    s.streams[0]!.emit('snapshot', snapshotFixture(5, 11))
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture(5, 11))
    const count = s.onSnapshot.mock.calls.length
    s.streams[0]!.emit('snapshot', snapshotFixture(5, 10)); expect(s.onSnapshot).toHaveBeenCalledTimes(count)
  })
  it('accepts same-step presence revisions and literal peer display names without account metadata', async () => {
    const s = setup(); await online(s)
    const next = { ...snapshotFixture(), presenceRevision: 2, players: snapshotFixture().players.map(p => ({ ...p, displayName: '<script>untrusted</script>' })) }
    s.streams[0]!.emit('snapshot', next)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(next)
  })
  it('halts and forgets both state and profile on cross-account stream identity', async () => {
    const s = setup(); await online(s)
    s.streams[0]!.emit('snapshot', { ...snapshotFixture(2), selfId: 2 })
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(null); expect(s.onProfile).toHaveBeenLastCalledWith(null)
    expect(s.streams[0]!.closed).toBe(true)
  })
  it('stops immediately on disconnect and ignores snapshots from the stale source', async () => {
    vi.useFakeTimers(); const s = setup(); await online(s)
    s.streams[0]!.emit('error'); expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    await s.client.move(1, 0); expect(bodies(s)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1500)
    s.streams[1]!.emit('snapshot', snapshotFixture(2, 10))
    s.streams[0]!.emit('snapshot', snapshotFixture(100, 100))
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture(2, 10))
  })
  it('rejects malformed stream data and does not fabricate a playable local fallback', async () => {
    const s = setup(); await online(s)
    s.streams[0]!.emit('snapshot', { roomId: 'harbor' })
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture())
  })
  it('rejects an unadmitted self even with otherwise valid world data', async () => {
    const s = setup(); await s.client.start()
    const one = snapshotFixture()
    s.streams[0]!.emit('snapshot', { ...one, players: one.players.map(p => ({ ...p, online: false })) })
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onStatus).not.toHaveBeenCalledWith('online')
  })
  it('sends direction-only impulses, coalesces newest intent, and locally cancels zero movement', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    let resolveFirst!: (value: Response) => void
    const s = setup(); await online(s)
    s.fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
    await s.client.move(1, 0); await s.client.move(0, 1); await s.client.move(-1, 0)
    expect(bodies(s)).toEqual([{ commandId: 'test-1', type: 'move', payload: { dx: 1, dz: 0 } }])
    resolveFirst(response({ accepted: true, commandId: 'test-1', revision: 2 }))
    await vi.advanceTimersByTimeAsync(100)
    expect(bodies(s)[1]).toEqual({ commandId: 'test-2', type: 'move', payload: { dx: -1, dz: 0 } })
    await s.client.move(0, 0); await vi.advanceTimersByTimeAsync(500); expect(bodies(s)).toHaveLength(2)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture())
  })
  it('stops held movement after a rate-limit response until a fresh scene sample', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const s = setup(); await online(s)
    s.fetcher.mockResolvedValueOnce(response({ error: 'MOVE_RATE_LIMIT' }, 429))
    await s.client.move(1, 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(bodies(s)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(bodies(s)).toHaveLength(1)

    await s.client.move(0, 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(bodies(s)).toHaveLength(2)
    await s.client.move(0, 0)
    await vi.advanceTimersByTimeAsync(500)
    expect(bodies(s)).toHaveLength(2)
  })
  it('clears queued movement before a crossing and waits for its in-flight ACK', async () => {
    let resolveMove!: (value: Response) => void
    const s = setup(); await online(s)
    s.fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveMove = resolve }))
    await s.client.move(1, 0); await s.client.move(0, 1)
    const crossing = s.client.transition('t_central')
    s.streams[0]!.emit('snapshot', snapshotFixture(1, 2))
    expect(s.onStatus).toHaveBeenLastCalledWith('connecting')
    await s.client.move(-1, 0); expect(bodies(s)).toHaveLength(1)
    resolveMove(response({ accepted: true, commandId: 'test-1', revision: 2 }))
    await crossing
    expect(bodies(s)).toEqual([{ commandId: 'test-1', type: 'move', payload: { dx: 1, dz: 0 } }, { commandId: 'test-2', type: 'transition', payload: { toTileId: 't_central' } }])
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture(1, 2))
  })
  it('enables the reconnected first snapshot while an obsolete transition ACK is still pending', async () => {
    let resolveTransition!: (value: Response) => void
    const s = setup(); await online(s)
    s.fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveTransition = resolve }))
    const pending = s.client.transition('t_central')
    await Promise.resolve()
    await s.client.reconnect()
    s.streams[1]!.emit('snapshot', { ...snapshotFixture(), presenceRevision: 2 })
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    resolveTransition(response({ accepted: true, commandId: 'test-1', revision: 2 }))
    await pending
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.onSnapshot).toHaveBeenLastCalledWith({ ...snapshotFixture(), presenceRevision: 2 })
  })
  it('surfaces coded credential failures in readable text without repeating passwords', async () => {
    const s = setup(async () => response({ error: 'INVALID_CREDENTIALS' }, 401))
    await expect(s.client.login('traveler', 'legacy-password')).rejects.toThrow('帳號或密碼不正確')
    expect(s.onError).toHaveBeenLastCalledWith('帳號或密碼不正確。')
    expect(s.fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed ACK without replacing streamed state', async () => {
    const s = setup(); await online(s)
    s.fetcher.mockResolvedValueOnce(response({ accepted: true, commandId: 'wrong', revision: 100 }))
    await expect(s.client.transition('t_central')).rejects.toThrow('指令確認不符')
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture())
  })
  it('never mutates cookie account B while displaying account A, even without channel delivery', async () => {
    let cookieAccount = 1, mutated = 0
    const s = setup(async (input, init) => {
      if (String(input) === '/api/auth/me') return response({ profile: { ...profileFixture(), accountId: cookieAccount } })
      if (String(input).endsWith('/snapshot')) return response({ ...snapshotFixture(), selfId: cookieAccount })
      if (new Headers(init?.headers).get('X-Greed-Account-Id') !== String(cookieAccount)) return response({ error: 'ACCOUNT_CHANGED' }, 409)
      mutated += 1
      const body = JSON.parse(String(init?.body)); return response({ accepted: true, commandId: body.commandId, revision: 2 })
    })
    await online(s); cookieAccount = 2
    await s.client.move(1, 0)
    await vi.waitFor(() => expect(s.onProfile).toHaveBeenLastCalledWith({ ...profileFixture(), accountId: 2 }))
    expect(mutated).toBe(0)
    expect(s.streams[0]!.closed).toBe(true)
    expect(s.onSnapshot).toHaveBeenCalledWith(null)
    expect(s.onStatus).toHaveBeenLastCalledWith('connecting')
    expect(bodies(s)[0]).not.toHaveProperty('accountId')
  })
  it('requires the displayed account context on logout and resyncs a mismatched cookie without logging it out', async () => {
    const s = setup(); await online(s)
    s.fetcher.mockResolvedValueOnce(response({ error: 'ACCOUNT_CHANGED' }, 409))
    await expect(s.client.logout()).rejects.toThrow('登入身份已變更')
    const request = s.fetcher.mock.calls.find(([url]) => String(url) === '/api/auth/logout')
    expect(request?.[1]?.headers).toHaveProperty('X-Greed-Account-Id', '1')
    expect(s.onSnapshot).toHaveBeenCalledWith(null)
    expect(s.streams[0]!.closed).toBe(true)
  })
  it('cancels a rate-limited transition retry after stream disconnection', async () => {
    vi.useFakeTimers()
    const s = setup(); await online(s)
    s.fetcher.mockResolvedValueOnce(response({ error: 'MOVE_RATE_LIMIT' }, 429))
    const pending = s.client.transition('t_central')
    await vi.advanceTimersByTimeAsync(0)
    expect(bodies(s)).toHaveLength(1)
    s.streams[0]!.emit('error')
    await vi.advanceTimersByTimeAsync(100)
    await pending
    expect(bodies(s)).toHaveLength(1)
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
  })
  it('uses token-free BroadcastChannel invalidation to reload the sole shared session', async () => {
    const channel = new FakeSessionChannel()
    const s = setup(undefined, channel); await online(s)
    channel.emit({ type: 'unrelated' }); expect(s.streams[0]!.closed).toBe(false)
    channel.emit({ type: 'session-changed' })
    await vi.waitFor(() => expect(s.createStream).toHaveBeenCalledTimes(2))
    expect(s.streams[0]!.closed).toBe(true)
    expect(s.onSnapshot).toHaveBeenCalledWith(null)
    s.streams[1]!.emit('snapshot', snapshotFixture())
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    await s.client.logout()
    expect(channel.posts).toEqual([{ type: 'session-changed' }])
    s.client.dispose(); expect(channel.closed).toBe(true)
  })
  it('logout clears the sole session state and closes its stream', async () => {
    const s = setup(); await online(s); await s.client.logout()
    expect(s.fetcher.mock.calls.at(-1)?.[0]).toBe('/api/auth/logout')
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(null); expect(s.onProfile).toHaveBeenLastCalledWith(null)
    expect(s.streams[0]!.closed).toBe(true)
  })
  it('redeems manually entered proof through the same cookie service with no world entry or URL token', async () => {
    const channel = new FakeSessionChannel(), s = setup(undefined, channel)
    const proof = 'a'.repeat(64)
    const profile = await s.client.redeemRecovery(proof, 'new-full-password-42')
    expect(profile).toEqual(profileFixture())
    expect(s.fetcher).toHaveBeenCalledTimes(1)
    expect(s.fetcher.mock.calls[0]?.[0]).toBe('/api/auth/reset-password')
    expect(JSON.parse(String(s.fetcher.mock.calls[0]?.[1]?.body))).toEqual({ token: proof, password: 'new-full-password-42' })
    expect(new Headers(s.fetcher.mock.calls[0]?.[1]?.headers).has('X-Greed-Account-Id')).toBe(false)
    expect(s.createStream).not.toHaveBeenCalled()
    expect(channel.posts).toEqual([{ type: 'session-changed' }])
  })
  it('keeps failed/expired proof attempts generic and never retries a secret submission', async () => {
    vi.useFakeTimers()
    const s = setup(async () => response({ error: 'INVALID_RESET' }, 400))
    await expect(s.client.redeemRecovery('a'.repeat(64), 'new-full-password-42')).rejects.toThrow('復原證明無效')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(s.fetcher).toHaveBeenCalledTimes(1)
    expect(s.onProfile).not.toHaveBeenCalled()
    expect(s.createStream).not.toHaveBeenCalled()
  })
  it('allows issuance only to the displayed admin and sends admin context, not target as authority', async () => {
    const admin = { ...profileFixture(), role: 'admin' as const }
    const target = { ...profileFixture(), accountId: 2, status: 'active' }
    const s = setup(async (input, init) => {
      if (String(input) === '/api/auth/me') return response({ profile: admin })
      if (String(input) === '/api/admin/users') return response({ users: [target] })
      if (String(input) === '/api/admin/users/2/reset-password') return response({ ok: true, target, token: 'b'.repeat(64), expiresAt: 100, resetPath: '/reset-password' })
      if (String(input).endsWith('/snapshot')) return response(snapshotFixture())
      const body = JSON.parse(String(init?.body)); return response({ accepted: true, commandId: body.commandId, revision: 2 })
    })
    await online(s)
    expect(await s.client.getRecoveryTargets()).toEqual([{ accountId: 2, displayName: '旅人甲', role: 'player', status: 'active' }])
    expect(new Headers(s.fetcher.mock.calls.find(([url]) => String(url) === '/api/admin/users')?.[1]?.headers).get('X-Greed-Account-Id')).toBe('1')
    const grant = await s.client.issueRecovery(2)
    expect(grant?.target.accountId).toBe(2)
    const request = s.fetcher.mock.calls.find(([url]) => String(url) === '/api/admin/users/2/reset-password')
    expect(request?.[1]?.headers).toHaveProperty('X-Greed-Account-Id', '1')
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({})
    expect(s.fetcher.mock.calls.some(([url]) => String(url).includes('token='))).toBe(false)
    const player = setup(); await online(player)
    await expect(player.client.issueRecovery(2)).rejects.toThrow('管理權限')
    expect(player.fetcher.mock.calls.some(([url]) => String(url).startsWith('/api/admin/'))).toBe(false)
  })
  it('fails closed on wrong-target/URL-proof issuance output and never retries it', async () => {
    const s = setup(async input => String(input) === '/api/auth/me' ? response({ profile: { ...profileFixture(), role: 'admin' } }) : response(snapshotFixture()))
    await online(s)
    s.fetcher.mockResolvedValueOnce(response({ ok: true, target: { ...profileFixture(), accountId: 3, status: 'active' }, token: 'c'.repeat(64), expiresAt: 100, resetPath: '/reset-password' }))
    await expect(s.client.issueRecovery(2)).rejects.toThrow('回應格式不符')
    expect(s.fetcher.mock.calls.filter(([url]) => String(url).includes('/2/reset-password'))).toHaveLength(1)
  })
  it('does not send a repeated recovery submission while the first proof request is pending', async () => {
    let resolve!: (value: Response) => void
    const s = setup(() => new Promise(done => { resolve = done }))
    const pending = s.client.redeemRecovery('a'.repeat(64), 'new-full-password-42')
    await expect(s.client.redeemRecovery('a'.repeat(64), 'new-full-password-42')).rejects.toThrow('處理中')
    expect(s.fetcher).toHaveBeenCalledTimes(1)
    resolve(response({ profile: profileFixture() })); await pending
  })
  it('does not publish a disposed recovery response or notify another tab', async () => {
    let resolve!: (value: Response) => void
    const channel = new FakeSessionChannel(), s = setup(() => new Promise(done => { resolve = done }), channel)
    const pending = s.client.redeemRecovery('a'.repeat(64), 'new-full-password-42')
    s.client.dispose(); resolve(response({ profile: profileFixture() }))
    expect(await pending).toBeNull()
    expect(s.onProfile).not.toHaveBeenCalled()
    expect(channel.posts).toEqual([])
  })
  it('sends globally scoped chat text without actor/region coordinates and uses a committed ACK', async () => {
    const s = setup(); await online(s)
    await s.client.chat('  Hello world  ')
    expect(bodies(s)).toEqual([{ commandId: 'test-1', type: 'chat', payload: { text: 'Hello world' } }])
    expect(s.onSnapshot).toHaveBeenLastCalledWith(snapshotFixture())
    await expect(s.client.chat('x'.repeat(241))).rejects.toThrow('240')
  })
  it('pauses disconnected chat/movement and reconnects while preserving the authenticated profile', async () => {
    const s = setup(); await online(s)
    s.fetcher.mockResolvedValueOnce(response({ error: 'WORLD_CONNECTION_REQUIRED' }, 409))
    await expect(s.client.chat('hello')).rejects.toThrow('連線席位')
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onProfile).toHaveBeenLastCalledWith(profileFixture())
    await s.client.move(1, 0); expect(bodies(s)).toHaveLength(1)
    expect(s.streams[0]!.closed).toBe(true)
  })
  it('does not publish a disposed request or open a stream', async () => {
    let resolve!: (value: Response) => void
    const s = setup(() => new Promise(done => { resolve = done }))
    const pending = s.client.start(); s.client.dispose(); resolve(response({ profile: profileFixture() })); await pending
    expect(s.onProfile).not.toHaveBeenCalled(); expect(s.createStream).not.toHaveBeenCalled()
  })
})

describe('preserved profile callbacks are bound to their owner session epoch', () => {
  it('accepts a current-session profile update and rejects a different target account', async () => {
    const s = setup(); await online(s)
    const owner = s.client.captureSessionContext()
    const updated = { ...profileFixture(), nickname: 'new', displayName: 'new' }
    expect(s.client.applyProfile(updated, owner)).toBe(true)
    expect(s.onProfile).toHaveBeenLastCalledWith(updated)
    expect(s.client.applyProfile({ ...updated, accountId: 2 }, owner)).toBe(false)
    expect(s.onProfile).toHaveBeenLastCalledWith(updated)
  })

  it('cannot restore an account from a delayed profile response after logout', async () => {
    const s = setup(); await online(s)
    const owner = s.client.captureSessionContext()
    const applyFromOldView = () => s.client.applyProfile(profileFixture(), owner)
    await s.client.logout()
    expect(applyFromOldView()).toBe(false)
    expect(s.client.sessionRevoked(owner)).toBe(false)
    expect(s.onProfile).toHaveBeenLastCalledWith(null)
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
  })

  it('cannot update or revoke replacement account B from an old account A view', async () => {
    const s = setup(); await online(s)
    const accountA = s.client.captureSessionContext()
    const accountBProfile = { ...profileFixture(), accountId: 2, username: 'second', displayName: '旅人乙' }
    s.fetcher.mockResolvedValueOnce(response({ profile: accountBProfile }))
    s.fetcher.mockResolvedValueOnce(response({ ...snapshotFixture(), selfId: 2 }))
    await s.client.login('second', 'synthetic-password')
    s.streams.at(-1)!.emit('snapshot', { ...snapshotFixture(), selfId: 2 })
    expect(s.client.applyProfile(profileFixture(), accountA)).toBe(false)
    expect(s.client.sessionRevoked(accountA)).toBe(false)
    const accountB = s.client.captureSessionContext()
    expect(s.client.applyProfile(profileFixture(), accountB)).toBe(false)
    expect(s.onProfile).toHaveBeenLastCalledWith(accountBProfile)
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.streams.at(-1)!.closed).toBe(false)
  })

  it('rejects old callbacks after same-account re-login even though the numeric ID matches', async () => {
    const s = setup(); await online(s)
    const firstLogin = s.client.captureSessionContext()
    await s.client.login('traveler', 'synthetic-password')
    s.streams.at(-1)!.emit('snapshot', snapshotFixture())
    const secondLogin = s.client.captureSessionContext()
    expect(firstLogin.accountId).toBe(secondLogin.accountId)
    expect(firstLogin.epoch).not.toBe(secondLogin.epoch)
    expect(s.client.applyProfile({ ...profileFixture(), nickname: 'stale' }, firstLogin)).toBe(false)
    expect(s.client.sessionRevoked(firstLogin)).toBe(false)
    expect(s.onProfile).toHaveBeenLastCalledWith(profileFixture())
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.client.sessionRevoked(secondLogin)).toBe(true)
    expect(s.onProfile).toHaveBeenLastCalledWith(null)
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
  })

  it('does not let an unauthenticated callback create a session or restore revoked state', async () => {
    const s = setup()
    const guest = s.client.captureSessionContext()
    expect(s.client.applyProfile(profileFixture(), guest)).toBe(false)
    await online(s)
    const owner = s.client.captureSessionContext()
    expect(s.client.sessionRevoked(owner)).toBe(true)
    expect(s.client.applyProfile(profileFixture(), owner)).toBe(false)
    expect(s.onProfile).toHaveBeenLastCalledWith(null)
  })

  it('invalidates callbacks on reconnect and dispose without revoking the current account', async () => {
    const s = setup(); await online(s)
    const beforeReconnect = s.client.captureSessionContext()
    await s.client.reconnect()
    s.streams.at(-1)!.emit('snapshot', snapshotFixture())
    expect(s.client.applyProfile({ ...profileFixture(), nickname: 'stale' }, beforeReconnect)).toBe(false)
    expect(s.client.sessionRevoked(beforeReconnect)).toBe(false)
    const current = s.client.captureSessionContext()
    expect(s.client.applyProfile(profileFixture(), current)).toBe(true)
    s.client.dispose()
    expect(s.client.applyProfile(profileFixture(), current)).toBe(false)
    expect(s.client.sessionRevoked(current)).toBe(false)
  })
})
