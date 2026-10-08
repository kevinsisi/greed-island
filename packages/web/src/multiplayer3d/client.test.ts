import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomClient, isCommandAcknowledgement, isRoomSnapshot, participationSeconds, registrationError, roomIsFull } from './client'
import type { RoomSnapshot } from './types'

const fixture = (revision = 1, presenceRevision = 1): RoomSnapshot => ({
  roomId: 'harbor', revision, presenceRevision, tick: 10, selfId: 'player-a', npcIntegrated: false,
  capacity: { maxOnlinePlayers: 50, onlinePlayers: 1, reservedPlayers: 0, selfHasSlot: true },
  players: [{ id: 'player-a', name: '旅人甲', x: -2, z: -6, supplies: 1, rewards: 0, online: true }, { id: 'player-b', name: '旅人乙', x: 2, z: -6, supplies: 1, rewards: 0, online: false }],
  messages: [], beacon: { id: 'beacon', x: 0, z: 6, radius: 2.5, required: 2, contributors: [], completed: false, phase: 'gathering', closesAtTick: null },
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
  it('validates account format, password bounds, and password confirmation', () => {
    expect(registrationError('abc_1', '123456789012', '123456789012')).toBeNull()
    expect(registrationError('ab', '123456789012', '123456789012')).toContain('帳號')
    expect(registrationError('valid-name', 'short', 'short')).toContain('密碼')
    expect(registrationError('valid-name', '123456789012', 'different-password')).toContain('不一致')
  })
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

  it('registers through the same cookie session and accepts the snapshot envelope', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ snapshot: fixture() }, 201))
    const s = setup(fetcher)
    await s.client.register('new-player', 'a-long-test-password')
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('/mp-api/register')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ username: 'new-player', password: 'a-long-test-password' })
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('same-origin')
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
    resolveCommand(response({ accepted: true, commandId: 'test-command-id', revision: 2 }))
    await first
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture())
    s.streams[0]!.emit('snapshot', fixture(2))
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(2))
  })

  it('validates acknowledgement identity without applying it as state', async () => {
    expect(isCommandAcknowledgement({ accepted: true, commandId: 'a', revision: 9 }, 'a')).toBe(true)
    expect(isCommandAcknowledgement({ accepted: true, commandId: 'b', revision: 9 }, 'a')).toBe(false)
    expect(isCommandAcknowledgement({ accepted: false, commandId: 'a', revision: 9 }, 'a')).toBe(false)
    expect(isCommandAcknowledgement({ accepted: true, commandId: 'a', revision: -1 }, 'a')).toBe(false)
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', fixture())
    s.fetcher.mockResolvedValueOnce(response({ accepted: true, commandId: 'other-player-command', revision: 100 }))
    await expect(s.client.send({ type: 'contribute', payload: {} })).rejects.toThrow('指令確認不符')
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture())
  })

  it('does not roll the streamed state back when a delayed acknowledgement arrives', async () => {
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', fixture(8))
    s.fetcher.mockResolvedValueOnce(response({ accepted: true, commandId: 'test-command-id', revision: 2, duplicate: true }))
    await s.client.send({ type: 'contribute', payload: {} })
    expect(s.onSnapshot).toHaveBeenLastCalledWith(fixture(8))
    expect(s.onStatus).toHaveBeenLastCalledWith('online')
  })

  it('accepts fifty distinct roster identities without inventing online membership', () => {
    const large: RoomSnapshot = { ...fixture(), selfId: 'player-0', capacity: { maxOnlinePlayers: 50, onlinePlayers: 48, reservedPlayers: 2, selfHasSlot: true }, players: Array.from({ length: 50 }, (_, index) => ({ id: `player-${index}`, name: `旅人${index}`, x: index % 10, z: Math.floor(index / 10), supplies: 1, rewards: 0, online: index < 48 })) }
    expect(isRoomSnapshot(large)).toBe(true)
    expect(large.players.filter(player => player.online)).toHaveLength(48)
    expect(roomIsFull(large)).toBe(false)
    expect(roomIsFull({ ...large, capacity: { ...large.capacity, selfHasSlot: false } })).toBe(true)
    expect(isRoomSnapshot({ ...large, capacity: { ...large.capacity, onlinePlayers: 50, reservedPlayers: 1 } })).toBe(false)
  })

  it('updates countdown from server ticks even without a new gameplay revision', async () => {
    const s = setup()
    const first: RoomSnapshot = { ...fixture(), beacon: { ...fixture().beacon, phase: 'collecting', closesAtTick: 310 } }
    await s.client.start()
    s.streams[0]!.emit('snapshot', first)
    expect(participationSeconds(first)).toBe(30)
    const later = { ...first, tick: 111 }
    s.streams[0]!.emit('snapshot', later)
    expect(s.onSnapshot).toHaveBeenLastCalledWith(later)
    expect(participationSeconds(later)).toBe(20)
    s.streams[0]!.emit('snapshot', { ...first, tick: 100 })
    expect(s.onSnapshot).toHaveBeenLastCalledWith(later)
    expect(participationSeconds({ ...first, tick: 999 })).toBe(0)
  })

  it('waits for room admission when capacity is full, while reserved reconnects can proceed', async () => {
    const full = { ...fixture(), capacity: { maxOnlinePlayers: 50, onlinePlayers: 48, reservedPlayers: 2, selfHasSlot: false } }
    const s = setup(vi.fn<typeof fetch>(async () => response(full)))
    await s.client.start()
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onError).toHaveBeenLastCalledWith('房間席位已滿，等待空位中；操作暫停。')
    expect(s.createStream).not.toHaveBeenCalled()
    s.fetcher.mockResolvedValueOnce(response({ ...full, capacity: { ...full.capacity, selfHasSlot: true } }))
    await s.client.reconnect()
    expect(s.onStatus).toHaveBeenLastCalledWith('connecting')
    expect(s.createStream).toHaveBeenCalledTimes(1)
  })

  it('never marks an unadmitted player online from a stream snapshot', async () => {
    const s = setup()
    await s.client.start()
    s.streams[0]!.emit('snapshot', { ...fixture(), players: fixture().players.map(player => ({ ...player, online: false })) })
    expect(s.onStatus).toHaveBeenLastCalledWith('offline')
    expect(s.onStatus).not.toHaveBeenCalledWith('online')
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
