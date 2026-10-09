import express, { Router, type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express'
import { AuthError, AuthService, AUTH_COOKIE, sessionTokenFromCookie } from './authService.js'
import { requireUnifiedMutation, requireUnifiedAccountContext } from './authRouter.js'
import { accountId, type AccountRole } from './principal.js'

export type UnifiedAdminRouterInput = Readonly<{ auth: AuthService; clientKey?: (req: Request) => string; now?: () => number; maxResetAttempts?: number; maxTrackedClients?: number }>

/** Same AuthService/private DB; mount once at /api. Never an old JWT router. */
export function createUnifiedAdminRouter(input: UnifiedAdminRouterInput): Router {
  const router = Router(), auth = input.auth
  const attempts = new Map<string, { at: number; count: number }>()
  const now = input.now ?? Date.now, maximum = input.maxResetAttempts ?? 20, maxClients = input.maxTrackedClients ?? 10_000
  if ([maximum, maxClients].some(value => !Number.isSafeInteger(value) || value <= 0)) throw new Error('Invalid recovery request budget.')
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try { auth.assertOrigin(req.get('origin')) } catch (error) { next(error); return }
    }
    next()
  })
  router.use(express.json({ limit: '4kb' }))
  const budget: RequestHandler = (req, res, next) => {
    const timestamp = now(), key = input.clientKey ? input.clientKey(req) : req.socket.remoteAddress ?? 'unknown'
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) { res.status(429).json({ error: 'RECOVERY_RATE_LIMIT' }); return }
    for (const [client, value] of attempts) if (timestamp - value.at >= 60_000) attempts.delete(client)
    let entry = attempts.get(key)
    if (!entry) {
      if (attempts.size >= maxClients) { res.status(429).json({ error: 'RECOVERY_RATE_LIMIT' }); return }
      entry = { at: timestamp, count: 0 }; attempts.set(key, entry)
    }
    entry.count++
    if (entry.count > maximum) { res.status(429).json({ error: 'RECOVERY_RATE_LIMIT' }); return }
    next()
  }
  router.get('/admin/users', requireUnifiedAccountContext(auth), (req, res) => {
    res.json({ users: auth.listAdministrativeProfiles(sessionTokenFromCookie(req.headers.cookie)) })
  })
  router.put('/admin/users/:id/role', requireUnifiedMutation(auth), (req, res) => {
    const body = fields(req.body, ['role'])
    if (typeof body.role !== 'string' || !['player', 'gm', 'admin', 'agent'].includes(body.role)) throw new InputError('INVALID_ROLE')
    const profile = auth.setAccountRole(sessionTokenFromCookie(req.headers.cookie), req.get('origin'), targetId(req.params.id), body.role as AccountRole)
    res.json({ profile })
  })
  router.put('/admin/users/:id/status', requireUnifiedMutation(auth), (req, res) => {
    const body = fields(req.body, ['status'])
    if (body.status !== 'active' && body.status !== 'disabled') throw new InputError('INVALID_STATUS')
    res.json({ profile: auth.setAccountStatus(sessionTokenFromCookie(req.headers.cookie), req.get('origin'), targetId(req.params.id), body.status) })
  })
  router.post('/admin/users/:id/reset-password', requireUnifiedMutation(auth), budget, (req, res) => {
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 0)) throw new InputError('INVALID_BODY')
    const reset = auth.issuePasswordReset(sessionTokenFromCookie(req.headers.cookie), req.get('origin'), targetId(req.params.id))
    // The proof is intentionally returned ONLY to an authenticated admin.
    // Keep it out of URLs/logs; the recipient uses the reset form's proof field.
    res.json({ ok: true, target: reset.target, token: reset.token, expiresAt: reset.expiresAt, resetPath: '/reset-password' })
  })
  router.post('/auth/reset-password', budget, asyncRoute(async (req, res) => {
    const body = fields(req.body, ['token', 'password'])
    if (typeof body.token !== 'string' || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 200) throw new InputError('INVALID_RESET')
    const grant = await auth.redeemPasswordReset(body.token, body.password, req.get('origin'))
    const prior = sessionTokenFromCookie(req.headers.cookie)
    if (prior && prior !== grant.token) auth.logout(prior, req.get('origin'))
    const profile = auth.accounts.getProfile(grant.principal.accountId)
    if (!profile) throw new AuthError('UNAUTHORIZED')
    res.cookie(AUTH_COOKIE, grant.token, grant.cookie)
    res.json({ profile })
  }))
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof InputError) { res.status(400).json({ error: error.code }); return }
    if (error instanceof AuthError) {
      const status = error.code === 'UNAUTHORIZED' ? 401 : error.code === 'FORBIDDEN' || error.code === 'ORIGIN_NOT_ALLOWED' ? 403 : error.code === 'USER_NOT_FOUND' ? 404 : error.code === 'LAST_ADMIN' || error.code === 'ACCOUNT_CHANGED' ? 409 : 400
      res.status(status).json({ error: error.code }); return
    }
    if (error instanceof SyntaxError || (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large')) { res.status(400).json({ error: 'INVALID_JSON' }); return }
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
  router.use(errors)
  return router
}

function targetId(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw new InputError('INVALID_USER')
  try { return accountId(Number(value)) } catch { throw new InputError('INVALID_USER') }
}
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new InputError('INVALID_BODY')
  return value as Record<string, unknown>
}
function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler { return (req, res, next) => { handler(req, res).catch(next) } }
class InputError extends Error { constructor(readonly code: string) { super(code) } }
