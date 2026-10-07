import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomClient, isRoomSnapshot } from './client'
import type { RoomSnapshot } from './types'

const fixture = (revision = 1, presenceRevision = 1): RoomSnapshot => ({
  roomId: 'harbor', revision, presenceRevision, tick: 10, selfId: 'player-a', npcIntegrated: false,
  players: [{ id: 'player-a', name: '旅人甲', x: -2, z: -6, supplies: 1, rewards: 0, online: true }, { id: 'player-b', name: '旅人乙', x: 2, z: -6, supplies: 1, rewards: 0, online: false }],
  messages: [], beacon: { id: 'beacon', x: 0, z: 6, radius: 2.5, required: 2, contributors: [], completed: false },
  world: { minX: -12, maxX: 12, minZ: -10, maxZ: 18, obstacles: [] }
})
class FakeStream {
  listeners = new Map<string, Array<(event: MessageEvent) => void>>()
  closed = false
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], listener])
  }
  close() { this.closed = true }
  emit(type: string, data?: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent
    this.listeners.get(type)?.forEach(listener => listener(event))
  }
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const clients: ReturnType<typeof createRoomClient>[] = []
function setup(fetcher = vi.fn<typeof fetch>(async () => response(fixture()))) {
  const onSnapshot = vi.fn(), onStatus = vi.fn(), onError = vi.fn()
  const streams: FakeStream[] = []
  const createStream = vi.fn(() => { const stream = new FakeStream(); streams.push(stream); return stream })
  const client = createRoomClient({ fetch: fetcher, createStream, commandId: () => 'test-command-id', onSnapshot, onStatus, onError })
  clients.push(client)
  return { client, fetcher, streams, createStream, onSnapshot, onStatus, onError }
}
afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers() })

describe('multiplayer room client', () => {
  it('validates the complete snapshot contract before rendering', () => {
    expect(isRoomSnapshot(fixture())).toBe(true)
    expect(isRoomSnapshot({ ...fixture(), presenceRevision: undefined })).toBe(false)
    expect(isRoomSnapshot({ ...fixture(), selfId: 'unknown' })).toBe(false)
    expect(isRoomSnapshot({ ...fixture(), players: [{ ...fixture().players[0], x: Infinity }] })).toBe(false)
    expect(isRoomSnapshot({ ...fixture(), npcIntegrated: true })).toBe(false)
  })

  it('waits for a valid stream snapshot before enabling commands', async () => {
    const s = setup()
    await s.client.start()
    expect(s.onStatus).toHaveBeenLastCalledWith('connecting')
    await expect(s.client.send({ type: 'contribute', payload: {} })).rejects.toThrow('重新連線')
    s.streams[0]!.emit('snapshot', fixture())
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.fetcher.mock.calls[0]?.[0]).toBe('/mp-api/snapshot')
    expect(s.fetcher.mock.calls[0]?.[1]?.credentials).toBe('same-origin')
    expect(s.createStream).toHaveBeenCalledWith('/mp-api/stream')
  })

  it('ignores out-of-order gameplay snapshots while accepting newer presence', async () => {
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', fixture(4, 3))
    s.streams[0]!.emit('snapshot', fixture(2, 9))
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(4, 3))
    s.streams[0]!.emit('snapshot', fixture(4, 4))
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(4, 4))
    const count = s.onSnapshot.mock.calls.length
    s.streams[0]!.emit('snapshot', fixture(4, 3))
    expect(s.onSnapshot).toHaveBeenCalledTimes(count)
  })

  it('rejects a different authenticated identity on the existing connection', async () => {
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', { ...fixture(3), selfId: 'player-b' })
    expect(s.onSnapshot).toHaveBeenLastCalledWith(null)
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
    expect(s.streams[0]!.closed).toBe(true)
  })

  it('halts commands immediately on disconnect and restores full state on reconnect', async () => {
    vi.useFakeTimers()
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', fixture(5, 9))
    s.streams[0]!.emit('error')
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    await expect(s.client.send({ type: 'chat', payload: { text: 'hello' } })).rejects.toThrow('重新連線')
    s.fetcher.mockResolvedValueOnce(response(fixture(5, 0)))
    await vi.advanceTimersByTimeAsync(1500)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(5, 0))
    s.streams[1]!.emit('snapshot', fixture(5, 1))
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(5, 1))
    s.streams[0]!.emit('snapshot', fixture(100, 10))
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(5, 1))
  })

  it('uses the login envelope and cookie without requesting a token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ snapshot: fixture() }))
    const s = setup(fetcher)
    await s.client.login('local-player', 'temporary-password')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ username: 'local-player', password: 'temporary-password' })
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture())
  })

  it('requires the specified login response instead of accepting a fallback shape', async () => {
    const s = setup()
    await expect(s.client.login('local-player', 'temporary-password')).rejects.toThrow('登入回應格式')
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
    expect(s.createStream).not.toHaveBeenCalled()
  })

  it('keeps only one movement request in flight and sends directions without actor or resources', async () => {
    let resolveCommand!: (response: Response) => void
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', fixture())
    s.fetcher.mockImplementationOnce(() => new Promise(resolve => { resolveCommand = resolve }))
    const first = s.client.move(1, 0)
    await s.client.move(0, 1)
    expect(s.fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(s.fetcher.mock.calls[1]?.[1]?.body))).toEqual({ commandId: 'test-command-id', type: 'move', payload: { dx: 1, dz: 0 } })
    resolveCommand(response({ snapshot: fixture(2) }))
    await first
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(2))
  })

  it('returns to the login form on expired authentication without retrying credentials', async () => {
    const s = setup(vi.fn<typeof fetch>(async () => response({ error: 'UNAUTHORIZED' }, 401)))
    await s.client.start()
    expect(s.onStatus).toHaveBeenLastCalledWith('unauthenticated')
    expect(s.createStream).not.toHaveBeenCalled()
    expect(s.fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed stream state and never fabricates a playable fallback', async () => {
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', { bad: true })
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture())
    expect(s.onError).toHaveBeenLastCalledWith('多人房間資料格式不符，已暫停操作。')
  })
})
