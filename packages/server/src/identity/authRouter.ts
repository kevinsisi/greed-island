import express, { Router, type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express'
import { AuthError, AuthService, AUTH_COOKIE, sessionTokenFromCookie, type SessionGrant } from './authService.js'
import { IdentityError, type AccountProfile } from './sqliteAccountRepository.js'
import { accountId, normalizeLoginAlias, type LoginAlias, type Principal } from './principal.js'

export type UnifiedAccountDTO = AccountProfile
export const EXPECTED_ACCOUNT_HEADER = 'X-Greed-Account-Id'

/** Assertion only: the cookie principal remains the sole authentication authority. */
export function assertExpectedAccountContext(header: string | undefined, principal: Principal): void {
  if (!header || !/^[1-9][0-9]*$/.test(header) || !Number.isSafeInteger(Number(header))) throw new AuthError('ACCOUNT_CONTEXT_REQUIRED')
  if (accountId(Number(header)) !== principal.accountId) throw new AuthError('ACCOUNT_CHANGED')
}
export type UnifiedAuthRouterInput = Readonly<{
  auth: AuthService
  /** Only trusted composition code may replace the direct socket-address key. */
  clientKey?: (req: Request) => string
  now?: () => number
  attemptsPerWindow?: number
  windowMs?: number
  maxTrackedClients?: number
}>

export function requireUnifiedSession(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const principal = auth.resolve(sessionTokenFromCookie(req.headers.cookie))
    if (!principal) { sendError(res, 401, 'UNAUTHORIZED'); return }
    res.locals.unifiedPrincipal = principal
    next()
  }
}
/** Private account-context reads; /auth/me deliberately uses session-only sync. */
export function requireUnifiedAccountContext(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    try {
      const principal = auth.resolve(sessionTokenFromCookie(req.headers.cookie))
      if (!principal) { sendError(res, 401, 'UNAUTHORIZED'); return }
      assertExpectedAccountContext(req.get(EXPECTED_ACCOUNT_HEADER), principal)
      res.locals.unifiedPrincipal = principal
      next()
    } catch (error) { next(error) }
  }
}
export function requireUnifiedMutation(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    try {
      const principal = auth.requireMutation(sessionTokenFromCookie(req.headers.cookie), req.get('origin'))
      assertExpectedAccountContext(req.get(EXPECTED_ACCOUNT_HEADER), principal)
      res.locals.unifiedPrincipal = principal
      next()
    } catch (error) { next(error) }
  }
}

/** Mount once at /api. No JWT issuance, legacy file store or startup migration. */
export function createUnifiedAuthRouter(input: UnifiedAuthRouterInput): Router {
  const router = Router()
  const limit = new AttemptBudget(input)
  const auth = input.auth
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try { auth.assertOrigin(req.get('origin')) } catch (error) { next(error); return }
    }
    next()
  })
  router.use(express.json({ limit: '4kb' }))
  const budget: RequestHandler = (req, res, next) => {
    const key = input.clientKey ? input.clientKey(req) : req.socket.remoteAddress ?? 'unknown'
    if (!limit.consume(key)) { sendError(res, 429, 'LOGIN_RATE_LIMIT'); return }
    next()
  }
  router.post('/auth/register', budget, asyncRoute(async (req, res) => {
    const body = bodyFields(req.body, ['username', 'password'])
    const username = stringField(body, 'username'), password = stringField(body, 'password')
    const alias = checkedAlias({ kind: 'username', value: username })
    if (password.length < 12 || password.length > 200) throw new InputError('INVALID_REGISTRATION')
    const grant = await auth.register(alias, password, req.get('origin'))
    revokePriorBrowserSession(auth, req, grant)
    writeGrant(auth, grant, res, 201)
  }))
  router.post('/auth/login', budget, asyncRoute(async (req, res) => {
    const body = bodyFields(req.body, ['identifier', 'password'])
    const identifier = stringField(body, 'identifier'), password = stringField(body, 'password')
    if (identifier.length > 1000 || password.length > 200) throw new InputError('INVALID_LOGIN')
    const alias = checkedAlias({ kind: identifier.includes('@') ? 'email' : 'username', value: identifier })
    const grant = await auth.login(alias, password, req.get('origin'))
    if (!grant) { sendError(res, 401, 'INVALID_CREDENTIALS'); return }
    revokePriorBrowserSession(auth, req, grant)
    writeGrant(auth, grant, res, 200)
  }))
  router.get('/auth/me', requireUnifiedSession(auth), (_req, res) => {
    res.json({ profile: profileFor(auth, res.locals.unifiedPrincipal as Principal) })
  })
  router.post('/auth/logout', (_req, res) => {
    const token = sessionTokenFromCookie(_req.headers.cookie)
    const principal = auth.resolve(token)
    if (principal) assertExpectedAccountContext(_req.get(EXPECTED_ACCOUNT_HEADER), principal)
    auth.logout(token, _req.get('origin'))
    const { maxAge: _maxAge, ...clearOptions } = auth.cookie
    res.clearCookie(AUTH_COOKIE, clearOptions)
    res.json({ ok: true })
  })
  router.get('/profile', requireUnifiedAccountContext(auth), (_req, res) => {
    res.json({ profile: profileFor(auth, res.locals.unifiedPrincipal as Principal) })
  })
  router.patch('/profile', requireUnifiedMutation(auth), (req, res) => {
    const body = req.body as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'nickname' && key !== 'avatar')) throw new InputError('INVALID_BODY')
    const source = body as Record<string, unknown>, patch: { nickname?: string | null; avatar?: string } = {}
    if ('nickname' in source) {
      if (source.nickname !== null && typeof source.nickname !== 'string') throw new InputError('INVALID_NICKNAME')
      patch.nickname = source.nickname
    }
    if ('avatar' in source) {
      if (typeof source.avatar !== 'string') throw new InputError('INVALID_AVATAR')
      patch.avatar = source.avatar
    }
    res.json({ profile: auth.updateProfile(sessionTokenFromCookie(req.headers.cookie), req.get('origin'), patch) })
  })
  router.post('/profile/password', requireUnifiedMutation(auth), budget, asyncRoute(async (req, res) => {
    const body = bodyFields(req.body, ['currentPassword', 'newPassword'])
    const currentPassword = stringField(body, 'currentPassword'), newPassword = stringField(body, 'newPassword')
    if (currentPassword.length > 200 || newPassword.length < 12 || newPassword.length > 200) throw new InputError('INVALID_PASSWORD')
    await auth.changePassword(sessionTokenFromCookie(req.headers.cookie), req.get('origin'), currentPassword, newPassword)
    const { maxAge: _maxAge, ...clearOptions } = auth.cookie
    res.clearCookie(AUTH_COOKIE, clearOptions)
    res.json({ ok: true })
  }))
  // Keep anonymous recovery closed; admin-issued recovery remains a separate guarded route.
  router.post('/auth/forgot-password', (_req, res) => { sendError(res, 403, 'ADMIN_RECOVERY_REQUIRED') })
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof InputError) { sendError(res, 400, error.code); return }
    if (error instanceof AuthError) {
      const status = error.code === 'ORIGIN_NOT_ALLOWED' || error.code === 'FORBIDDEN' ? 403 : error.code === 'UNAUTHORIZED' || error.code === 'INVALID_CURRENT_PASSWORD' ? 401 : error.code === 'CREDENTIALS_CHANGED' || error.code === 'ACCOUNT_CHANGED' ? 409 : 400
      sendError(res, status, error.code); return
    }
    if (error instanceof IdentityError && error.code === 'ALIAS_TAKEN') { sendError(res, 409, error.code); return }
    if (error instanceof SyntaxError || (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large')) { sendError(res, 400, 'INVALID_JSON'); return }
    sendError(res, 500, 'INTERNAL_ERROR')
  }
  router.use(errors)
  return router
}

function revokePriorBrowserSession(auth: AuthService, req: Request, grant: SessionGrant): void {
  const prior = sessionTokenFromCookie(req.headers.cookie)
  if (prior && prior !== grant.token) auth.logout(prior, req.get('origin'))
}

function profileFor(auth: AuthService, principal: Principal): UnifiedAccountDTO {
  const profile = auth.accounts.getProfile(principal.accountId)
  if (!profile) throw new AuthError('UNAUTHORIZED')
  return profile
}
function writeGrant(auth: AuthService, grant: SessionGrant, res: Response, status: number): void {
  const profile = profileFor(auth, grant.principal)
  res.cookie(AUTH_COOKIE, grant.token, grant.cookie)
  res.status(status).json({ profile })
}
function bodyFields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== allowed.length
    || Object.keys(value).some(key => !allowed.includes(key))) throw new InputError('INVALID_BODY')
  return value as Record<string, unknown>
}
function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name]
  if (typeof value !== 'string') throw new InputError('INVALID_BODY')
  return value
}
function checkedAlias(alias: LoginAlias): LoginAlias {
  try { normalizeLoginAlias(alias); return alias } catch { throw new InputError('INVALID_IDENTIFIER') }
}
function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => { handler(req, res).catch(next) }
}
function sendError(res: Response, status: number, code: string): void { res.status(status).json({ error: code }) }
class InputError extends Error { constructor(readonly code: string) { super(code) } }

class AttemptBudget {
  private readonly clients = new Map<string, { since: number; attempts: number }>()
  private readonly maximum: number
  private readonly window: number
  private readonly maxClients: number
  private readonly now: () => number
  constructor(input: UnifiedAuthRouterInput) {
    this.maximum = input.attemptsPerWindow ?? 20
    this.window = input.windowMs ?? 60_000
    this.maxClients = input.maxTrackedClients ?? 10_000
    this.now = input.now ?? Date.now
    if ([this.maximum, this.window, this.maxClients].some(value => !Number.isSafeInteger(value) || value <= 0)) throw new Error('Invalid authentication attempt budget.')
  }
  consume(key: string): boolean {
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) return false
    const now = this.now()
    for (const [client, entry] of this.clients) if (now - entry.since >= this.window) this.clients.delete(client)
    let entry = this.clients.get(key)
    if (!entry) {
      if (this.clients.size >= this.maxClients) return false
      entry = { since: now, attempts: 0 }; this.clients.set(key, entry)
    }
    entry.attempts += 1
    return entry.attempts <= this.maximum
  }
}
