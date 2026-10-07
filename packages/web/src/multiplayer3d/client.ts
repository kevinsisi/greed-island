import type { CommandAcknowledgement, ConnectionStatus, RoomCommand, RoomSnapshot } from './types'

const API_ROOT = '/mp-api'
const RETRY_MS = 1500
const REQUEST_TIMEOUT_MS = 6000

export class RoomApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code?: string) { super(message); this.name = 'RoomApiError' }
}

type Stream = { addEventListener: (type: string, listener: (event: MessageEvent) => void) => void; close: () => void }
interface ClientOptions {
  onSnapshot: (snapshot: RoomSnapshot | null) => void
  onStatus: (status: ConnectionStatus) => void
  onError: (message: string) => void
  fetch?: typeof fetch
  createStream?: (url: string) => Stream
  commandId?: () => string
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function integer(value: unknown): value is number { return finite(value) && Number.isInteger(value) && value >= 0 }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }

export function isCommandAcknowledgement(value: unknown, commandId: string): value is CommandAcknowledgement {
  return record(value) && value.accepted === true && value.commandId === commandId && integer(value.revision)
    && (value.duplicate === undefined || typeof value.duplicate === 'boolean')
}

export function roomIsFull(snapshot: RoomSnapshot): boolean {
  const capacity = snapshot.capacity
  return !capacity.selfHasSlot && capacity.onlinePlayers + capacity.reservedPlayers >= capacity.maxOnlinePlayers
}

export function participationSeconds(snapshot: RoomSnapshot): number | null {
  return snapshot.beacon.phase === 'collecting' && snapshot.beacon.closesAtTick !== null
    ? Math.max(0, Math.ceil((snapshot.beacon.closesAtTick - snapshot.tick) / 10)) : null
}

/** Validate the server contract before any authoritative state reaches the scene. */
export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!record(value) || !text(value.roomId) || !text(value.selfId) || !integer(value.revision) || !integer(value.presenceRevision) || !integer(value.tick) || value.npcIntegrated !== false) return false
  if (!Array.isArray(value.players) || !Array.isArray(value.messages) || !record(value.beacon) || !record(value.world) || !record(value.capacity)) return false
  const capacity = value.capacity
  if (!integer(capacity.maxOnlinePlayers) || capacity.maxOnlinePlayers < 1 || !integer(capacity.onlinePlayers) || !integer(capacity.reservedPlayers) || typeof capacity.selfHasSlot !== 'boolean' || capacity.onlinePlayers + capacity.reservedPlayers > capacity.maxOnlinePlayers) return false
  const players = value.players
  if (!players.every(p => record(p) && text(p.id) && text(p.name) && finite(p.x) && finite(p.z) && integer(p.supplies) && integer(p.rewards) && typeof p.online === 'boolean')) return false
  const ids = players.map(p => (p as Record<string, unknown>).id)
  if (new Set(ids).size !== ids.length || !ids.includes(value.selfId)) return false
  if (!value.messages.every(m => record(m) && text(m.id) && text(m.playerId) && text(m.name) && text(m.text) && integer(m.tick))) return false
  const b = value.beacon
  if (!text(b.id) || !finite(b.x) || !finite(b.z) || !finite(b.radius) || b.radius <= 0 || !integer(b.required) || b.required < 1 || !Array.isArray(b.contributors) || !b.contributors.every(text) || typeof b.completed !== 'boolean') return false
  if (!['gathering', 'collecting', 'completed'].includes(String(b.phase)) || !(b.closesAtTick === null || integer(b.closesAtTick)) || (b.phase === 'collecting' && b.closesAtTick === null) || (b.phase === 'completed') !== b.completed) return false
  const w = value.world
  return finite(w.minX) && finite(w.maxX) && w.minX < w.maxX && finite(w.minZ) && finite(w.maxZ) && w.minZ < w.maxZ && Array.isArray(w.obstacles)
    && w.obstacles.every(o => record(o) && finite(o.x) && finite(o.z) && finite(o.width) && o.width > 0 && finite(o.depth) && o.depth > 0)
}

/** Cookie-only connection to the dedicated local room. There is no production fallback. */
export function createRoomClient(options: ClientOptions) {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis)
  const createStream = options.createStream ?? (url => new EventSource(url, { withCredentials: true }))
  const commandId = options.commandId ?? (() => crypto.randomUUID())
  let snapshot: RoomSnapshot | null = null
  let status: ConnectionStatus = 'checking'
  let source: Stream | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let disposed = false
  let movePending = false
  const requests = new Set<AbortController>()

  function setStatus(next: ConnectionStatus) { status = next; if (!disposed) options.onStatus(next) }
  function closeStream() { source?.close(); source = null; if (retry !== null) clearTimeout(retry); retry = null }
  function accept(next: unknown, firstAfterConnect = false): boolean {
    if (!isRoomSnapshot(next)) throw new RoomApiError('多人房間資料格式不符，已暫停操作。')
    if (snapshot && (snapshot.selfId !== next.selfId || snapshot.roomId !== next.roomId)) throw new RoomApiError('房間或登入身份已變更，請重新登入。', 401)
    if (snapshot && (next.revision < snapshot.revision || (next.revision === snapshot.revision && !firstAfterConnect && (next.presenceRevision < snapshot.presenceRevision || (next.presenceRevision === snapshot.presenceRevision && next.tick <= snapshot.tick))))) return false
    snapshot = next
    options.onSnapshot(next)
    return true
  }
  async function json(path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController()
    requests.add(controller)
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await request(`${API_ROOT}${path}`, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const code = record(result) && typeof result.error === 'string' ? result.error : undefined
        throw new RoomApiError(code === 'ROOM_FULL' ? '房間席位已滿，請等待空位後重新連線。' : record(result) && typeof result.message === 'string' ? result.message : '無法連接本機多人房間。', response.status, code)
      }
      return result
    } catch (error) {
      if (error instanceof RoomApiError) throw error
      throw new RoomApiError('本機多人伺服器未連線，操作已暫停。')
    } finally { clearTimeout(timeout); requests.delete(controller) }
  }
  function failed(error: unknown, ownGeneration: number) {
    if (disposed || generation !== ownGeneration) return
    closeStream()
    if (error instanceof RoomApiError && error.status === 401) {
      snapshot = null; options.onSnapshot(null); setStatus('unauthenticated')
      return
    }
    setStatus('offline')
    options.onError(error instanceof Error ? error.message : '連線中斷，正在重新連接。')
    retry = setTimeout(() => { retry = null; void connect() }, RETRY_MS)
  }
  function stream(ownGeneration: number) {
    if (disposed || generation !== ownGeneration) return
    try {
      const nextSource = createStream(`${API_ROOT}/stream`)
      let firstSnapshot = true
      source = nextSource
      nextSource.addEventListener('snapshot', event => {
        if (disposed || generation !== ownGeneration || source !== nextSource) return
        try {
          const next: unknown = JSON.parse((event as MessageEvent).data)
          if (!accept(next, firstSnapshot)) return
          firstSnapshot = false
          if (!snapshot?.players.find(player => player.id === snapshot?.selfId)?.online) throw new RoomApiError('尚未取得房間連線席位，請等待重連；若開了多個分頁，請關閉其他分頁。')
          setStatus('online')
          options.onError('')
        } catch (error) { failed(error, ownGeneration) }
      })
      nextSource.addEventListener('error', () => {
        if (disposed || source !== nextSource || generation !== ownGeneration) return
        closeStream()
        setStatus('offline')
        options.onError('連線中斷，正在確認房間席位；若開了多個分頁，請關閉其他分頁。')
        // EventSource hides a rejected stream's HTTP body. A fresh ordinary GET
        // distinguishes a full room from a reserved reconnect without opening
        // another stream or changing admission rules.
        void json('/snapshot').then(result => {
          if (disposed || generation !== ownGeneration) return
          accept(result, true)
          failed(new RoomApiError(snapshot && roomIsFull(snapshot) ? '房間席位已滿，等待空位中；操作暫停。' : '正在重新連線；若開了多個分頁，請關閉其他分頁。'), ownGeneration)
        }).catch(error => failed(error, ownGeneration))
      })
    } catch (error) { failed(error, ownGeneration) }
  }
  async function connect() {
    if (disposed) return
    closeStream()
    const ownGeneration = ++generation
    setStatus('connecting')
    try {
      const result = await json('/snapshot')
      if (disposed || generation !== ownGeneration) return
      accept(result, true)
      if (snapshot && roomIsFull(snapshot)) {
        failed(new RoomApiError('房間席位已滿，等待空位中；操作暫停。', 409, 'ROOM_FULL'), ownGeneration)
        return
      }
      stream(ownGeneration)
    } catch (error) { failed(error, ownGeneration) }
  }
  async function login(username: string, password: string) {
    closeStream()
    const ownGeneration = ++generation
    setStatus('connecting')
    try {
      const result = await json('/login', { username, password })
      if (disposed || generation !== ownGeneration) return
      if (!record(result) || !isRoomSnapshot(result.snapshot)) throw new RoomApiError('登入回應格式不符，請確認本機多人服務。')
      snapshot = null
      accept(result.snapshot)
      stream(ownGeneration)
    } catch (error) {
      if (!disposed && generation === ownGeneration) {
        snapshot = null; options.onSnapshot(null); setStatus('unauthenticated')
        options.onError(error instanceof Error ? error.message : '登入失敗。')
      }
      throw error
    }
  }
  async function send(command: RoomCommand): Promise<void> {
    if (disposed || status !== 'online') throw new RoomApiError('請等待房間重新連線後再操作。')
    const ownGeneration = generation
    const id = commandId()
    try {
      const result = await json('/command', { commandId: id, ...command })
      if (disposed || ownGeneration !== generation) return
      if (!isCommandAcknowledgement(result, id)) throw new RoomApiError('多人指令確認不符，已暫停操作。')
      // An acknowledgement is not a snapshot. Shared state changes only when
      // the ordered server stream publishes the committed projection.
    } catch (error) {
      if (error instanceof RoomApiError && (error.status === 0 || error.status === 401)) failed(error, ownGeneration)
      throw error
    }
  }
  return {
    start: connect,
    reconnect: connect,
    login,
    send,
    async move(dx: number, dz: number) {
      if (movePending || status !== 'online' || disposed) return
      movePending = true
      try { await send({ type: 'move', payload: { dx, dz } }) }
      catch (error) {
        // A 100ms browser interval can straddle the same server tick. Dropping that
        // intent is expected; no local movement is applied or queued for catch-up.
        if (!disposed && status === 'online' && !(error instanceof RoomApiError && error.status === 429)) options.onError(error instanceof Error ? error.message : '無法移動。')
      }
      finally { movePending = false }
    },
    async logout() {
      const ownGeneration = ++generation
      closeStream(); setStatus('connecting')
      try {
        await json('/logout', {})
        if (disposed || generation !== ownGeneration) return
        snapshot = null; options.onSnapshot(null); options.onError(''); setStatus('unauthenticated')
      } catch (error) { failed(error, ownGeneration); throw error }
    },
    dispose() { disposed = true; generation += 1; closeStream(); requests.forEach(controller => controller.abort()); requests.clear() }
  }
}
