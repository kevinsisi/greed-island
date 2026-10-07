import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { DomainError } from './domain.js'
import type { MultiplayerRuntime } from './runtime.js'
import type { FixtureIdentity } from './types.js'

const COOKIE = 'greed_mp_session'
const SESSION_MS = 12 * 60 * 60 * 1000
const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict' as const, path: '/mp-api', maxAge: SESSION_MS }
export const LOCAL_ORIGINS = ['http://localhost:4178', 'http://127.0.0.1:4178'] as const

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
type Session = { playerId: string; expiresAt: number; streams: Set<Response> }

export function createMultiplayerApp(input: { runtime: MultiplayerRuntime; fixtures: readonly FixtureIdentity[]; allowedOrigins?: readonly string[] }): express.Express {
  const app = express()
  const sessions = new Map<string, Session>()
  const allowedOrigins = new Set(input.allowedOrigins ?? LOCAL_ORIGINS)
  const loginAttempts = new Map<string, { window: number; attempts: number }>()
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

  app.post('/mp-api/login', (req, res) => {
    const key = req.socket.remoteAddress ?? 'local'
    const now = Date.now()
    const attempts = loginAttempts.get(key) ?? { window: now, attempts: 0 }
    if (now - attempts.window >= 60_000) { attempts.window = now; attempts.attempts = 0 }
    attempts.attempts++
    loginAttempts.set(key, attempts)
    if (attempts.attempts > 20) { res.status(429).json({ error: 'LOGIN_RATE_LIMIT', message: '登入嘗試過於頻繁，請稍候。' }); return }
    const body = req.body as Record<string, unknown> | undefined
    if (!body || Array.isArray(body) || Object.keys(body).some(k => k !== 'username' && k !== 'password') || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 200) {
      res.status(400).json({ error: 'INVALID_LOGIN', message: '請輸入本機測試帳號與密碼。' }); return
    }
    const fixture = input.fixtures.find(f => f.username === body.username)
    const matches = passwordMatches(body.password, fixture?.passwordHash ?? dummyHash)
    if (!fixture || !matches) { res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '本機測試帳號或密碼不正確。' }); return }
    const prior = tokenFrom(req)
    if (prior) closeSession(tokenKey(prior))
    const token = randomBytes(32).toString('hex')
    sessions.set(tokenKey(token), { playerId: fixture.id, expiresAt: now + SESSION_MS, streams: new Set() })
    res.cookie(COOKIE, token, COOKIE_OPTIONS)
    res.json({ snapshot: input.runtime.snapshot(fixture.id) })
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
  app.get('/mp-api/snapshot', (_req, res) => { res.json(input.runtime.snapshot((res.locals.mpSession as Session).playerId)) })
  app.post('/mp-api/command', (req, res) => { res.json(input.runtime.execute((res.locals.mpSession as Session).playerId, req.body)) })
  app.get('/mp-api/stream', (req, res) => {
    const session = res.locals.mpSession as Session
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write('retry: 1000\n\n')
    const send = () => {
      if (res.destroyed || res.writableEnded) return
      // Slow clients reconnect to a full snapshot rather than accumulating an unbounded queue.
      if (res.writableLength > 256 * 1024) { res.destroy(); return }
      res.write(`event: snapshot\ndata: ${JSON.stringify(input.runtime.snapshot(session.playerId))}\n\n`)
    }
    session.streams.add(res)
    // Synchronous subscribe publishes the first snapshot after registration: no gap between snapshot and stream.
    const unsubscribe = input.runtime.subscribe(send, session.playerId)
    const keepalive = setInterval(() => {
      if (session.expiresAt <= Date.now()) { closeSession(res.locals.mpSessionKey as string); return }
      res.write(': keepalive\n\n')
    }, 15_000)
    let closed = false
    const cleanup = () => { if (closed) return; closed = true; clearInterval(keepalive); session.streams.delete(res); unsubscribe() }
    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)
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
    for (const stream of session.streams) stream.end()
  }
  return app
}
