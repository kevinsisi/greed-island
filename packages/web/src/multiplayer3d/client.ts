import type { AccountProfile, ConnectionStatus, PlayerWorldSnapshot, WorldCommand } from './types'
import { recoveryGrant, recoveryTargets } from './recovery'
import { createLatestMoveIntentQueue } from './moveIntentQueue'
import { harborContributionStatus } from './harborBeacon'
import { isAccountProfile, isCommandAcknowledgement, isPlayerWorldSnapshot, record, snapshotIsNewer } from './protocol'
export { isCommandAcknowledgement, isPlayerWorldSnapshot, registrationError } from './protocol'

const AUTH_ROOT = '/api/auth'
const WORLD_ROOT = '/api/world'
const RETRY_MS = 1500
const REQUEST_TIMEOUT_MS = 6000
const MOVEMENT_INTERVAL_MS = 100
const ERROR_TEXT: Record<string, string> = {
  INVALID_RESET: '復原證明無效、已使用或已到期，請向管理員重新取得。',
  RECOVERY_RATE_LIMIT: '復原嘗試過於頻繁，請稍候再試。',
  LAST_ADMIN: '不能移除最後一位有效管理員。',
  INVALID_PROFILE: '個人資料格式不符，請檢查暱稱或頭像。',
  INVALID_CURRENT_PASSWORD: '目前密碼不正確。',
  FORBIDDEN: '目前帳號沒有這項管理權限。',
  INVALID_CREDENTIALS: '帳號或密碼不正確。',
  ALIAS_TAKEN: '這個帳號已被使用。',
  LOGIN_RATE_LIMIT: '登入嘗試過於頻繁，請稍候再試。',
  REGISTER_RATE_LIMIT: '申請嘗試過於頻繁，請稍候再試。',
  ORIGIN_NOT_ALLOWED: '連線來源未獲允許，請從本站重新開啟。',
  UNAUTHORIZED: '登入已失效，請重新登入。',
  WORLD_CONNECTION_REQUIRED: '尚未取得共同世界連線席位，操作已暫停並重新連線。',
  WORLD_FULL: '世界連線席位已滿，正在等待空位。',
  GEOMETRY_UNAVAILABLE: '這個區域的場景尚未支援，玩家位置未被重設。',
  REGION_UNAVAILABLE: '這個區域尚未開放，或不是目前的相鄰區域。',
  EDGE_UNAVAILABLE: '這條通路尚未開放。',
  PORTAL_OUT_OF_RANGE: '請先走近區域通路，再申請跨區。',
  ARRIVAL_BLOCKED: '目的地通路暫時無法通行。',
  MOVE_RATE_LIMIT: '移動指令過於頻繁，請稍候再試。',
  COMMAND_QUEUE_FULL: '伺服器指令佇列已滿，請稍候再試。',
  ACCOUNT_CONTEXT_REQUIRED: '登入身份確認資料缺少或不符，操作已暫停。',
  ACCOUNT_CHANGED: '登入身份已變更，正在重新確認帳號。',
  STREAM_LIMIT: '此帳號的連線分頁已達上限，請關閉其他分頁後重連。',
  COMMAND_CANCELLED: '指令已在提交前取消，請重新連線後再試。',
  LEGACY_HARBOR_PROGRESS_REVIEW_REQUIRED: '舊港口進度的帳號關聯待核實，物資與徽記保持未確認，暫停交付。',
  OUT_OF_RANGE: '請先返回碼頭區，走近港口燈塔再交付物資。',
  NO_SUPPLIES: '沒有可交付的物資。',
  ALREADY_CONTRIBUTED: '本次物資已交付，請等待伺服器共同點燈進度。',
  PARTICIPATION_CLOSED: '本次燈塔收集已截止，等待伺服器結算。',
  HARBOR_PROGRESS_CAPACITY_FULL: '本次共同點燈的參與人數已達上限。',
}


export class WorldApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code?: string) { super(message); this.name = 'WorldApiError' }
}
export type SessionContext = Readonly<{ epoch: number; accountId: number | null }>
type SessionChannel = { postMessage: (data: { type: 'session-changed' }) => void; addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void; close: () => void }
type Stream = { addEventListener: (type: string, listener: (event: MessageEvent) => void) => void; close: () => void }
interface ClientOptions {
  onSnapshot: (snapshot: PlayerWorldSnapshot | null) => void
  onProfile: (profile: AccountProfile | null) => void
  onStatus: (status: ConnectionStatus) => void
  onError: (message: string) => void
  fetch?: typeof fetch
  createStream?: (url: string) => Stream
  commandId?: () => string
  createSessionChannel?: () => SessionChannel | null
}

/** The sole browser session uses an HttpOnly cookie; only committed snapshots update the world. */
export function createWorldClient(options: ClientOptions) {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis)
  const createStream = options.createStream ?? (url => new EventSource(url, { withCredentials: true }))
  const commandId = options.commandId ?? (() => crypto.randomUUID())
  let profile: AccountProfile | null = null
  let snapshot: PlayerWorldSnapshot | null = null
  let status: ConnectionStatus = 'checking'
  let source: Stream | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let disposed = false
  let recoveryPending = false
  let issuancePending = false
  let transitionGeneration: number | null = null
  let contributionGeneration: number | null = null
  let clearQueuedMovement = () => {}
  let inFlightMove: Promise<void> | null = null
  const requests = new Set<AbortController>()
  let sessionChannel: SessionChannel | null = null
  try {
    sessionChannel = options.createSessionChannel ? options.createSessionChannel()
      : typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('greed-session') : null
  } catch { /* Expected-identity headers remain the safety boundary if channels are unavailable. */ }
  sessionChannel?.addEventListener('message', event => {
    if (disposed || !record(event.data) || event.data.type !== 'session-changed') return
    closeStream(); generation += 1; forgetSession(); setStatus('connecting')
    void connect()
  })
  function notifySessionChanged() { sessionChannel?.postMessage({ type: 'session-changed' }) }


  function setStatus(next: ConnectionStatus) {
    status = next
    if (next !== 'online') clearQueuedMovement()
    if (!disposed) options.onStatus(next)
  }
  function closeStream() { source?.close(); source = null; if (retry !== null) clearTimeout(retry); retry = null }
  function forgetSession() {
    snapshot = null; profile = null
    options.onSnapshot(null); options.onProfile(null)
  }
  function acceptProfile(value: unknown) {
    if (!record(value) || !isAccountProfile(value.profile)) throw new WorldApiError('登入資料格式不符，操作已暫停。')
    if (profile && profile.accountId !== value.profile.accountId) {
      forgetSession()
      throw new WorldApiError('登入身份已變更，請重新登入。', 401, 'IDENTITY_CHANGED')
    }
    profile = value.profile
    options.onProfile(profile)
  }
  function accept(next: unknown, firstAfterConnect = false, allowSubClockReset = false): boolean {
    if (!isPlayerWorldSnapshot(next)) throw new WorldApiError('世界資料格式不符，操作已暫停。')
    if (!profile || profile.accountId !== next.selfId || snapshot && snapshot.selfId !== next.selfId) {
      throw new WorldApiError('登入身份已變更，請重新登入。', 401, 'IDENTITY_CHANGED')
    }
    if (snapshot && (next.revision < snapshot.revision
      || next.revision === snapshot.revision && !allowSubClockReset
        && (next.presenceRevision < snapshot.presenceRevision || next.presenceRevision === snapshot.presenceRevision && next.movementStep < snapshot.movementStep)
      || !firstAfterConnect && !snapshotIsNewer(snapshot, next))) return false
    snapshot = next
    if (next.beacon.contributors.includes(next.selfId)) contributionGeneration = null
    options.onSnapshot(next)
    return true
  }
  async function json(path: string, body?: unknown, expectedAccountId?: number, method?: 'PUT' | 'PATCH'): Promise<unknown> {
    const controller = new AbortController()
    requests.add(controller)
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await request(path, {
        method: method ?? (body === undefined ? 'GET' : 'POST'), credentials: 'include', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(expectedAccountId === undefined ? {} : { 'X-Greed-Account-Id': String(expectedAccountId) }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const code = record(result) && typeof result.error === 'string' ? result.error : undefined
        throw new WorldApiError(code && ERROR_TEXT[code] ? ERROR_TEXT[code]
          : record(result) && typeof result.message === 'string' ? result.message
          : code ? `伺服器拒絕此操作（${code}）。` : '無法連接共同世界。', response.status, code)
      }
      return result
    } catch (error) {
      if (error instanceof WorldApiError) throw error
      throw new WorldApiError('世界伺服器未連線，操作已暫停。')
    } finally { clearTimeout(timeout); requests.delete(controller) }
  }
  function failed(error: unknown, ownGeneration: number) {
    if (disposed || generation !== ownGeneration) return
    closeStream(); generation += 1
    if (error instanceof WorldApiError && ['ACCOUNT_CHANGED', 'ACCOUNT_CONTEXT_REQUIRED'].includes(error.code ?? '')) {
      forgetSession(); setStatus('connecting'); options.onError(error.message)
      void connect()
      return
    }
    if (error instanceof WorldApiError && error.status === 401) {
      forgetSession(); setStatus('unauthenticated')
      options.onError(error.code === 'IDENTITY_CHANGED' ? error.message : '')
      return
    }
    setStatus('offline')
    options.onError(error instanceof Error ? error.message : '連線中斷，正在重新連接。')
    retry = setTimeout(() => { retry = null; void connect() }, RETRY_MS)
  }
  async function submit(command: WorldCommand, ownGeneration: number, id = commandId()): Promise<void> {
    if (!profile) throw new WorldApiError('登入已失效，請重新登入。', 401, 'UNAUTHORIZED')
    const result = await json(`${WORLD_ROOT}/command`, { commandId: id, ...command }, profile.accountId)
    if (disposed || ownGeneration !== generation) return
    if (!isCommandAcknowledgement(result, id)) throw new WorldApiError('世界指令確認不符，操作已暫停。')
  }
  async function readWorld(ownGeneration: number, afterConnect = false) {
    let result: unknown
    try { result = await json(`${WORLD_ROOT}/snapshot`) }
    catch (error) {
      // No generic failure, expired login, or unsupported geometry may reset a player.
      if (!(error instanceof WorldApiError) || error.code !== 'WORLD_ENTRY_REQUIRED' || error.status !== 409) throw error
      if (disposed || ownGeneration !== generation) return
      try { await submit({ type: 'enter', payload: {} }, ownGeneration) }
      catch (entryError) {
        if (!(entryError instanceof WorldApiError) || entryError.code !== 'ALREADY_IN_WORLD' || entryError.status !== 409) throw entryError
      }
      if (disposed || ownGeneration !== generation) return
      result = await json(`${WORLD_ROOT}/snapshot`)
    }
    if (!disposed && ownGeneration === generation) accept(result, afterConnect, afterConnect)
  }
  function stream(ownGeneration: number) {
    if (disposed || generation !== ownGeneration) return
    try {
      const nextSource = createStream(`${WORLD_ROOT}/stream`)
      let firstSnapshot = true
      source = nextSource
      nextSource.addEventListener('snapshot', event => {
        if (disposed || generation !== ownGeneration || source !== nextSource) return
        try {
          const next: unknown = JSON.parse(event.data)
          if (!accept(next, firstSnapshot)) return
          firstSnapshot = false
          if (!snapshot?.players.find(player => player.accountId === snapshot?.selfId)?.online) throw new WorldApiError('尚未取得世界連線席位，等待重新連線。')
          if (transitionGeneration !== ownGeneration) setStatus('online')
          options.onError('')
        } catch (error) { failed(error, ownGeneration) }
      })
      nextSource.addEventListener('error', () => {
        if (disposed || source !== nextSource || generation !== ownGeneration) return
        failed(new WorldApiError('連線中斷，正在確認登入與世界席位。'), ownGeneration)
      })
    } catch (error) { failed(error, ownGeneration) }
  }
  async function connect() {
    if (disposed) return
    closeStream()
    const ownGeneration = ++generation
    setStatus('connecting')
    try {
      const result = await json(`${AUTH_ROOT}/me`)
      if (disposed || generation !== ownGeneration) return
      acceptProfile(result)
      await readWorld(ownGeneration, true)
      if (disposed || generation !== ownGeneration) return
      stream(ownGeneration)
    } catch (error) { failed(error, ownGeneration) }
  }
  async function authenticate(kind: 'login' | 'register', identifier: string, password: string) {
    if (disposed) return
    closeStream()
    const ownGeneration = ++generation
    setStatus('connecting')
    try {
      const result = await json(`${AUTH_ROOT}/${kind}`, kind === 'login' ? { identifier, password } : { username: identifier, password })
      if (disposed || generation !== ownGeneration) return
      forgetSession(); acceptProfile(result); notifySessionChanged()
      await readWorld(ownGeneration, true)
      if (disposed || generation !== ownGeneration) return
      stream(ownGeneration)
    } catch (error) {
      if (!disposed && generation === ownGeneration) {
        if (!profile || error instanceof WorldApiError && error.status === 401) {
          forgetSession(); setStatus('unauthenticated')
          options.onError(error instanceof Error ? error.message : '登入失敗。')
        } else failed(error, ownGeneration)
      }
      throw error
    }
  }
  async function send(command: WorldCommand): Promise<void> {
    if (disposed || status !== 'online') throw new WorldApiError('請等待世界重新連線後再操作。')
    const ownGeneration = generation
    try { await submit(command, ownGeneration) }
    catch (error) {
      if (error instanceof WorldApiError && (error.status === 0 || error.status === 401 || ['ACCOUNT_CHANGED', 'ACCOUNT_CONTEXT_REQUIRED', 'WORLD_CONNECTION_REQUIRED'].includes(error.code ?? ''))) failed(error, ownGeneration)
      throw error
    }
  }
  const movementQueue = createLatestMoveIntentQueue(({ dx, dz }) => {
    const pending = send({ type: 'move', payload: { dx, dz } }).then(
      () => true,
      error => {
        if (!disposed && status === 'online' && !(error instanceof WorldApiError && error.status === 429)) {
          options.onError(error instanceof Error ? error.message : '無法移動。')
        }
        return false
      },
    )
    const tracked = pending.then(() => undefined)
    inFlightMove = tracked
    void tracked.finally(() => { if (inFlightMove === tracked) inFlightMove = null })
    return pending
  })
  clearQueuedMovement = movementQueue.clear
  return {
    resyncSession() { if (disposed) return; closeStream(); generation += 1; forgetSession(); void connect() },
    captureSessionContext(): SessionContext { return { epoch: generation, accountId: profile?.accountId ?? null } },
    applyProfile(next: AccountProfile, owner: SessionContext): boolean {
      // Old view promises must never repopulate a logged-out or replacement session.
      if (disposed || owner.epoch !== generation || owner.accountId === null
        || profile?.accountId !== owner.accountId || next.accountId !== owner.accountId) return false
      acceptProfile({ profile: next })
      return true
    },
    sessionRevoked(owner: SessionContext): boolean {
      if (disposed || owner.epoch !== generation || owner.accountId === null || profile?.accountId !== owner.accountId) return false
      closeStream(); generation += 1; forgetSession(); notifySessionChanged(); setStatus('unauthenticated')
      return true
    },
    start: connect,
    reconnect: connect,
    login: (identifier: string, password: string) => authenticate('login', identifier, password),
    register: (username: string, password: string) => authenticate('register', username, password),
    async chat(text: string) {
      const clean = text.trim()
      if (!clean || clean.length > 240) throw new WorldApiError('世界聊天須為 1–240 字元。')
      await send({ type: 'chat', payload: { text: clean } })
    },
    async contribute(): Promise<boolean> {
      if (disposed || status !== 'online' || !snapshot) throw new WorldApiError('請等待世界重新連線後再操作。')
      const ownGeneration = generation
      if (contributionGeneration === ownGeneration) throw new WorldApiError('交付處理中，請等待伺服器進度。')
      const eligibility = harborContributionStatus(snapshot, true)
      if (!eligibility.ready) throw new WorldApiError(eligibility.text)
      contributionGeneration = ownGeneration
      movementQueue.clear()
      try {
        await inFlightMove
        if (disposed || generation !== ownGeneration) return false
        if (!snapshot || !harborContributionStatus(snapshot, status === 'online').ready) throw new WorldApiError('位置或燈塔進度已變更，請確認後再交付。')
        await send({ type: 'contribute', payload: {} })
        // ACK does not spend supplies or award rewards locally. Await the canonical stream.
        return !disposed && generation === ownGeneration
      } catch (error) {
        if (contributionGeneration === ownGeneration) contributionGeneration = null
        throw error
      }
    },
    async redeemRecovery(token: string, password: string): Promise<AccountProfile | null> {
      if (disposed) return null
      if (recoveryPending) throw new WorldApiError('復原處理中，請等待回應。', 409, 'RECOVERY_PENDING')
      recoveryPending = true
      closeStream()
      const ownGeneration = ++generation
      setStatus('connecting')
      try {
        const result = await json(`${AUTH_ROOT}/reset-password`, { token, password })
        if (disposed || generation !== ownGeneration) return null
        forgetSession(); acceptProfile(result); notifySessionChanged()
        return profile
      } catch (error) {
        if (!disposed && generation === ownGeneration) {
          setStatus('unauthenticated')
          options.onError(error instanceof Error ? error.message : '帳號復原未完成。')
        }
        throw error
      } finally { recoveryPending = false }
    },
    async getRecoveryTargets() {
      if (disposed || profile?.role !== 'admin') throw new WorldApiError('目前帳號沒有這項管理權限。', 403, 'FORBIDDEN')
      const ownGeneration = generation
      try {
        const result = await json('/api/admin/users', undefined, profile.accountId)
        if (disposed || generation !== ownGeneration) return null
        const targets = recoveryTargets(result)
        if (!targets) throw new WorldApiError('管理帳號清單格式不符，操作已暫停。')
        return targets
      } catch (error) {
        if (error instanceof WorldApiError && (error.status === 0 || error.status === 401 || ['ACCOUNT_CHANGED', 'ACCOUNT_CONTEXT_REQUIRED', 'WORLD_CONNECTION_REQUIRED'].includes(error.code ?? ''))) failed(error, ownGeneration)
        throw error
      }
    },
    async updateAdministrativeAccount(targetAccountId: number, change: { role: AccountProfile['role'] } | { status: 'active' | 'disabled' }) {
      if (disposed || profile?.role !== 'admin') throw new WorldApiError('目前帳號沒有這項管理權限。', 403, 'FORBIDDEN')
      if (!Number.isSafeInteger(targetAccountId) || targetAccountId <= 0) throw new WorldApiError('請選擇有效的目標帳號。')
      const ownGeneration = generation, selfId = profile.accountId
      try {
        const path = 'role' in change ? 'role' : 'status'
        const result = await json(`/api/admin/users/${targetAccountId}/${path}`, change, selfId, 'PUT')
        if (disposed || generation !== ownGeneration) return null
        if (!record(result) || !isAccountProfile(result.profile) || result.profile.accountId !== targetAccountId) throw new WorldApiError('管理帳號回應格式不符，操作已暫停。')
        if (targetAccountId === selfId) { closeStream(); generation += 1; forgetSession(); notifySessionChanged(); setStatus('unauthenticated') }
        return result.profile
      } catch (error) {
        if (error instanceof WorldApiError && (error.status === 0 || error.status === 401 || ['ACCOUNT_CHANGED', 'ACCOUNT_CONTEXT_REQUIRED'].includes(error.code ?? ''))) failed(error, ownGeneration)
        throw error
      }
    },
    async issueRecovery(targetAccountId: number) {
      if (disposed || profile?.role !== 'admin') throw new WorldApiError('目前帳號沒有這項管理權限。', 403, 'FORBIDDEN')
      if (issuancePending) throw new WorldApiError('證明發放處理中，請等待回應。', 409, 'ISSUANCE_PENDING')
      if (!Number.isSafeInteger(targetAccountId) || targetAccountId <= 0) throw new WorldApiError('請選擇有效的目標帳號。')
      const ownGeneration = generation
      issuancePending = true
      try {
        const result = await json(`/api/admin/users/${targetAccountId}/reset-password`, {}, profile.accountId)
        if (disposed || generation !== ownGeneration) return null
        const grant = recoveryGrant(result, targetAccountId)
        if (!grant) throw new WorldApiError('復原證明回應格式不符，請勿重新自動申請。')
        return grant
      } catch (error) {
        if (error instanceof WorldApiError && (error.status === 0 || error.status === 401 || ['ACCOUNT_CHANGED', 'ACCOUNT_CONTEXT_REQUIRED', 'WORLD_CONNECTION_REQUIRED'].includes(error.code ?? ''))) failed(error, ownGeneration)
        throw error
      } finally { issuancePending = false }
    },
    async move(dx: number, dz: number) {
      if (status !== 'online' || disposed) return
      movementQueue.offer(dx, dz)
    },
    async transition(toTileId: string): Promise<void> {
      if (disposed || status !== 'online') throw new WorldApiError('請等待世界重新連線後再操作。')
      const ownGeneration = generation
      transitionGeneration = ownGeneration
      setStatus('connecting')
      try {
        await inFlightMove
        if (disposed || generation !== ownGeneration) return
        const id = commandId()
        const intent: WorldCommand = { type: 'transition', payload: { toTileId } }
        try { await submit(intent, ownGeneration, id) }
        catch (error) {
          if (!(error instanceof WorldApiError) || error.status !== 429 || error.code !== 'MOVE_RATE_LIMIT') throw error
          await new Promise(resolve => setTimeout(resolve, MOVEMENT_INTERVAL_MS))
          if (disposed || generation !== ownGeneration) return
          await submit(intent, ownGeneration, id)
        }
        // Restore only from a fresh authoritative snapshot, never from the ACK or intended tile.
        if (disposed || generation !== ownGeneration) return
        await readWorld(ownGeneration)
        if (disposed || generation !== ownGeneration) return
        if (source && snapshot?.players.find(p => p.accountId === snapshot?.selfId)?.online) setStatus('online')
      } catch (error) {
        if (!disposed && generation === ownGeneration) {
          if (error instanceof WorldApiError && error.status !== 0 && error.status !== 401 && !['ACCOUNT_CHANGED', 'ACCOUNT_CONTEXT_REQUIRED', 'WORLD_CONNECTION_REQUIRED'].includes(error.code ?? '') && source
            && snapshot?.players.find(p => p.accountId === snapshot?.selfId)?.online) {
            setStatus('online'); options.onError(error.message)
          } else failed(error, ownGeneration)
        }
        throw error
      } finally { if (transitionGeneration === ownGeneration) transitionGeneration = null }
    },
    async logout() {
      if (!profile) return
      const expectedAccountId = profile.accountId
      const ownGeneration = ++generation
      closeStream(); setStatus('connecting')
      try {
        const result = await json(`${AUTH_ROOT}/logout`, {}, expectedAccountId)
        if (disposed || generation !== ownGeneration) return
        if (!record(result) || result.ok !== true) throw new WorldApiError('登出回應格式不符。')
        forgetSession(); notifySessionChanged(); options.onError(''); setStatus('unauthenticated')
      } catch (error) { failed(error, ownGeneration); throw error }
    },
    dispose() { disposed = true; movementQueue.dispose(); generation += 1; closeStream(); sessionChannel?.close(); sessionChannel = null; requests.forEach(controller => controller.abort()); requests.clear() }
  }
}
