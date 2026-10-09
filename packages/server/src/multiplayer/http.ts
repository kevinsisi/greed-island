import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { AccountStore, type AccountRole, type StoredAccount } from './accounts.js'
import { DomainError } from './domain.js'
import type { MultiplayerRuntime } from './runtime.js'
import type { FixtureIdentity } from './types.js'

const COOKIE = 'greed_mp_session'
const SESSION_MS = 12 * 60 * 60 * 1000
const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict' as const, path: '/mp-api', maxAge: SESSION_MS }
export const LOCAL_ORIGINS = ['http://localhost:4178', 'http://127.0.0.1:4178'] as const

export function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === '') return LOCAL_ORIGINS
  return raw.split(',').map(origin => origin.trim()).filter(Boolean)
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}
function passwordMatches(password: string, encoded: string): boolean {
  const [salt, hash] = encoded.split(':')
  if (!salt || !hash) return false
  const actual = scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
function tokenFrom(req: Request): string | null {
  const raw = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null
}
function tokenKey(token: string): string { return createHash('sha256').update(token).digest('hex') }
function claimMatches(provided: unknown, path: string | undefined): boolean {
  if (typeof provided !== 'string' || !path) return false
  try {
    const expected = readFileSync(path, 'utf8').trim()
    const actualBytes = Buffer.from(provided)
    const expectedBytes = Buffer.from(expected)
    return expectedBytes.length > 0 && actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
  } catch { return false }
}
type Session = { playerId: string; role: AccountRole; expiresAt: number; closed: boolean; streams: Map<Response, () => void> }
const RESERVED_ADMIN = 'kevin950805'
const ACCOUNT_NAME = /^[A-Za-z0-9_-]{3,32}$/
const LOGIN_ERROR = '登入或申請失敗，請檢查資料後再試。'

export function createMultiplayerApp(input: { runtime: MultiplayerRuntime; fixtures: readonly FixtureIdentity[]; accountsPath?: string; adminClaimFilePath?: string; allowedOrigins?: readonly string[] }): express.Express {
  const app = express()
  const sessions = new Map<string, Session>()
  const allowedOrigins = new Set(input.allowedOrigins ?? LOCAL_ORIGINS)
  const loginAttempts = new Map<string, { window: number; attempts: number }>()
  const accounts = new AccountStore(input.accountsPath ?? join(process.env.MULTIPLAYER_DATA_DIR ?? '/app/mp-data', 'accounts.json'))
  const adminClaimFilePath = input.adminClaimFilePath ?? process.env.MP_ADMIN_CLAIM_FILE
  let registrationQueue: Promise<void> = Promise.resolve()
  const dummyHash = hashPassword(randomBytes(32).toString('hex'))
  app.disable('x-powered-by')
  app.use('/mp-api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const origin = req.get('origin')
    if ((origin && !allowedOrigins.has(origin)) || (req.method !== 'GET' && !origin)) {
      res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: '只允許指定的本機預覽來源。' }); return
    }
    next()
  })
  app.use(express.json({ limit: '4kb' }))

  function consumeLoginAttempt(req: Request): boolean {
    const key = req.socket.remoteAddress ?? 'local'
    const now = Date.now()
    const attempts = loginAttempts.get(key) ?? { window: now, attempts: 0 }
    if (now - attempts.window >= 60_000) { attempts.window = now; attempts.attempts = 0 }
    attempts.attempts++
    loginAttempts.set(key, attempts)
    return attempts.attempts <= 20
  }
  function setSession(req: Request, res: Response, playerId: string, role: AccountRole, now = Date.now()): Session {
    const prior = tokenFrom(req)
    if (prior) closeSession(tokenKey(prior))
    const token = randomBytes(32).toString('hex')
    const session: Session = { playerId, role, expiresAt: now + SESSION_MS, closed: false, streams: new Map() }
    sessions.set(tokenKey(token), session)
    res.cookie(COOKIE, token, COOKIE_OPTIONS)
    return session
  }
  function snapshotWithRole(session: Session) {
    return { ...input.runtime.snapshot(session.playerId), selfRole: session.role }
  }
  app.post('/mp-api/login', (req, res) => {
    const now = Date.now()
    if (!consumeLoginAttempt(req)) { res.status(429).json({ error: 'LOGIN_RATE_LIMIT', message: '登入嘗試過於頻繁，請稍候。' }); return }
    const body = req.body as Record<string, unknown> | undefined
    if (!body || Array.isArray(body) || Object.keys(body).some(k => k !== 'username' && k !== 'password') || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 200) {
      res.status(400).json({ error: 'INVALID_LOGIN', message: '請輸入本機測試帳號與密碼。' }); return
    }
    const username = body.username as string
    const password = body.password as string
    const fixture = input.fixtures.find(f => f.username.toLowerCase() === username.toLowerCase())
    const account = fixture ? undefined : accounts.find(username)
    const encoded = fixture?.passwordHash ?? account?.passwordHash ?? dummyHash
    const matches = passwordMatches(password, encoded)
    if ((!fixture && !account) || !matches) { res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '本機測試帳號或密碼不正確。' }); return }
    const playerId = fixture?.id ?? account!.id
    const role = account?.role ?? 'player'
    res.json({ snapshot: snapshotWithRole(setSession(req, res, playerId, role, now)) })
  })

  app.post('/mp-api/register', (req, res, next) => {
    if (!consumeLoginAttempt(req)) { res.status(429).json({ error: 'LOGIN_RATE_LIMIT', message: '登入嘗試過於頻繁，請稍候。' }); return }
    const body = req.body as Record<string, unknown> | undefined
    if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'username' && key !== 'password' && !(key === 'claimCode' && typeof body.username === 'string' && body.username.toLowerCase() === RESERVED_ADMIN)) || typeof body.username !== 'string' || typeof body.password !== 'string' || !ACCOUNT_NAME.test(body.username) || body.password.length < 12 || body.password.length > 200) {
      res.status(400).json({ error: 'INVALID_REGISTRATION', message: '帳號或密碼格式不正確。' }); return
    }
    const username = body.username as string
    const password = body.password as string
    const claimCode = body.claimCode
    const isAdmin = username.toLowerCase() === RESERVED_ADMIN
    const queued = registrationQueue.then(() => {
      if (isAdmin && !claimMatches(claimCode, adminClaimFilePath)) { res.status(403).json({ error: 'REGISTRATION_FAILED', message: LOGIN_ERROR }); return }
      if (isAdmin && adminClaimFilePath && existsSync(`${adminClaimFilePath}.used`)) { res.status(403).json({ error: 'REGISTRATION_FAILED', message: LOGIN_ERROR }); return }
      const existingFixture = input.fixtures.some(fixture => fixture.username.toLowerCase() === username.toLowerCase())
      if (existingFixture || accounts.find(username)) { res.status(409).json({ error: 'ACCOUNT_EXISTS', message: '此帳號無法申請。' }); return }
      const account: StoredAccount = { id: `player-${randomBytes(16).toString('hex')}`, name: username, username, passwordHash: hashPassword(password), role: isAdmin ? 'admin' : 'player' }
      const current = accounts.list()
      accounts.write([...current, account])
      try { input.runtime.addPlayer({ id: account.id, name: account.name, x: 0, z: -6 }) }
      catch (error) { accounts.write(current); throw error }
      if (isAdmin && adminClaimFilePath) renameSync(adminClaimFilePath, `${adminClaimFilePath}.used`)
      res.status(201).json({ snapshot: snapshotWithRole(setSession(req, res, account.id, account.role)) })
    })
    registrationQueue = queued.then(() => undefined, () => undefined)
    void queued.catch(next)
  })

  app.use('/mp-api', (req, res, next) => {
    const token = tokenFrom(req)
    const key = token ? tokenKey(token) : null
    const session = key ? sessions.get(key) : undefined
    if (!session || session.expiresAt <= Date.now()) {
      if (key) closeSession(key)
      res.status(401).json({ error: 'UNAUTHORIZED', message: '請先登入本機測試身份。' }); return
    }
    res.locals.mpSession = session
    res.locals.mpSessionKey = key
    next()
  })
  app.post('/mp-api/logout', (_req, res) => {
    closeSession(res.locals.mpSessionKey as string)
    res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', path: '/mp-api' })
    res.json({ ok: true })
  })
  app.get('/mp-api/snapshot', (_req, res) => { res.json(snapshotWithRole(res.locals.mpSession as Session)) })
  app.get('/mp-api/me', (_req, res) => { const session = res.locals.mpSession as Session; res.json({ id: session.playerId, role: session.role }) })
  app.get('/mp-api/admin/ping', (_req, res) => { const session = res.locals.mpSession as Session; if (session.role !== 'admin') { res.status(403).json({ error: 'FORBIDDEN', message: '需要管理員權限。' }); return }; res.json({ ok: true }) })
  app.post('/mp-api/command', (req, res) => {
    const session = res.locals.mpSession as Session
    if (!input.runtime.hasConnection(session.playerId)) throw new DomainError(409, 'ROOM_CONNECTION_REQUIRED', '請先連入房間再操作。')
    res.json(input.runtime.execute(session.playerId, req.body))
  })
  app.get('/mp-api/stream', (req, res) => {
    const session = res.locals.mpSession as Session
    // Admission must happen before SSE headers so capacity errors remain ordinary JSON responses.
    const disconnect = input.runtime.connect(session.playerId)
    let closed = false
    let keepalive: ReturnType<typeof setInterval> | undefined
    let unsubscribe: () => void = () => undefined
    const cleanup = () => {
      if (closed) return
      closed = true
      if (keepalive) clearInterval(keepalive)
      session.streams.delete(res)
      unsubscribe()
      disconnect(!session.closed)
    }
    session.streams.set(res, cleanup)
    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write('retry: 1000\n\n')
    const send = () => {
      if (closed || session.closed || res.destroyed || res.writableEnded) return
      // Slow clients reconnect to a full snapshot rather than accumulating an unbounded queue.
      if (res.writableLength > 256 * 1024) { res.destroy(); return }
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshotWithRole(session))}\n\n`)
    }
    // Register first, then send only this stream's initial state. Ordinary room fanout waits for a tick.
    unsubscribe = input.runtime.subscribe(send)
    keepalive = setInterval(() => {
      if (session.expiresAt <= Date.now()) { closeSession(res.locals.mpSessionKey as string); return }
      if (closed || res.destroyed || res.writableEnded) { cleanup(); return }
      res.write(': keepalive\n\n')
    }, 15_000)
    send()
  })
  app.use('/mp-api', (_req, res) => { res.status(404).json({ error: 'NOT_FOUND', message: '找不到此本機操作。' }) })
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof DomainError) { res.status(error.status).json({ error: error.code, message: error.message }); return }
    if (error instanceof SyntaxError || (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large')) { res.status(400).json({ error: 'INVALID_JSON', message: '請求格式或長度不正確。' }); return }
    console.error('[local-multiplayer] request failed', error instanceof Error ? error.message : 'unknown error')
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '本機房間處理失敗。' })
  }
  app.use(errors)
  function closeSession(key: string): void {
    const session = sessions.get(key)
    if (!session) return
    sessions.delete(key)
    session.closed = true
    for (const [stream, cleanup] of session.streams) { cleanup(); stream.end() }
    input.runtime.releaseReservation(session.playerId)
  }
  return app
}
