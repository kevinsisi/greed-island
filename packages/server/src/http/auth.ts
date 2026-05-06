// Auth router + middleware. Issues JWTs signed with JWT_SECRET and
// verifies bearer tokens for routes that opt into authentication.
//
// Public auth endpoints:
//   POST /api/auth/register
//   POST /api/auth/login
//   GET  /api/auth/me
//   POST /api/auth/forgot-password   issues single-use reset token
//   POST /api/auth/reset-password    consumes token + rotates password

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express'
import jwt, { type SignOptions } from 'jsonwebtoken'
import {
  AccountError,
  assertValidPassword,
  isAccountRole,
  normalizeEmail,
  type AccountRecord,
  type AccountRole,
  type AccountStore,
} from './accounts.js'
import type { PasswordResetStore } from './passwordResets.js'

export type AuthConfig = Readonly<{
  jwtSecret: string
  jwtExpiresIn: string
}>

export type AuthClaims = Readonly<{
  sub: number
  email: string
  role: AccountRole
}>

declare module 'express-serve-static-core' {
  // Augment Express Request with the optional auth payload so route
  // handlers can read req.auth without casting.
  interface Request {
    auth?: AuthClaims
  }
}

export type PublicAccount = Readonly<{
  id: number
  email: string
  createdAt: number
  role: AccountRole
  nickname: string | null
  avatar: string
  displayName: string
}>

export function toPublicAccount(account: AccountRecord): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    createdAt: account.createdAt,
    role: account.role,
    nickname: account.nickname,
    avatar: account.avatar,
    displayName: account.nickname ?? account.email.split('@')[0] ?? account.email,
  }
}

export function createAuthRouter(
  store: AccountStore,
  resets: PasswordResetStore,
  config: AuthConfig
): Router {
  const router = Router()

  router.post('/register', asyncHandler(async (req, res) => {
    const { email, password } = parseAuthBody(req.body)
    try {
      const account = await store.createAccount(email, password)
      const token = signToken(account, config)
      res.status(201).json({
        token,
        account: toPublicAccount(account)
      })
    } catch (err) {
      if (err instanceof AccountError) {
        const status = err.code === 'EMAIL_TAKEN' ? 409 : 400
        res.status(status).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }
  }))

  router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = parseAuthBody(req.body)
    try {
      const account = await store.verifyCredentials(email, password)
      if (account === null) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
        return
      }
      const token = signToken(account, config)
      res.status(200).json({
        token,
        account: toPublicAccount(account)
      })
    } catch (err) {
      if (err instanceof AccountError) {
        res.status(400).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }
  }))

  router.get('/me', requireAuth(config), (req, res) => {
    if (!req.auth) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    const account = store.findById(req.auth.sub)
    if (!account) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    res.json({ account: toPublicAccount(account) })
  })

  router.post('/forgot-password', (req, res) => {
    const body = req.body as { email?: unknown }
    if (typeof body?.email !== 'string') {
      res.status(400).json({ error: 'INVALID_BODY', message: 'email is required.' })
      return
    }
    let normalized: string
    try {
      normalized = normalizeEmail(body.email)
    } catch (err) {
      if (err instanceof AccountError) {
        res.status(400).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }
    const account = store.findByEmail(normalized)
    if (!account) {
      // Do not leak whether the email exists, but we still need to
      // tell the GM something. Return a stable message and no token.
      res.status(200).json({
        ok: true,
        issued: false,
        message: 'If the email is registered, a reset link has been generated.',
      })
      return
    }
    const reset = resets.create(account.id)
    console.log(
      `[auth] password reset issued for ${account.email} — expires ${new Date(reset.expiresAt).toISOString()}`
    )
    res.status(200).json({
      ok: true,
      issued: true,
      token: reset.token,
      expiresAt: new Date(reset.expiresAt).toISOString(),
      message:
        'Password reset link generated. Visit /reset-password?token=<token> to set a new password.',
    })
  })

  router.post('/reset-password', asyncHandler(async (req, res) => {
    const body = req.body as { token?: unknown; password?: unknown }
    if (typeof body?.token !== 'string' || typeof body?.password !== 'string') {
      res.status(400).json({ error: 'INVALID_BODY', message: 'token and password are required.' })
      return
    }
    try {
      assertValidPassword(body.password)
    } catch (err) {
      if (err instanceof AccountError) {
        res.status(400).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }
    const consumed = resets.consume(body.token)
    if (!consumed) {
      res
        .status(400)
        .json({ error: 'INVALID_TOKEN', message: 'Reset token is invalid, expired, or already used.' })
      return
    }
    const updated = await store.updatePassword(consumed.accountId, body.password)
    if (!updated) {
      res.status(404).json({ error: 'USER_NOT_FOUND' })
      return
    }
    const token = signToken(updated, config)
    res.status(200).json({ ok: true, token, account: toPublicAccount(updated) })
  }))

  return router
}

export function requireAuth(config: AuthConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = readAuthClaims(req, config)
    if (claims === null) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization token.' })
      return
    }
    req.auth = claims
    next()
  }
}

export function optionalAuth(config: AuthConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const claims = readAuthClaims(req, config)
    if (claims !== null) req.auth = claims
    next()
  }
}

function readAuthClaims(req: Request, config: AuthConfig): AuthClaims | null {
  const header = req.header('authorization') ?? req.header('Authorization')
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null
  const token = header.slice(7).trim()
  if (token.length === 0) return null
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub?: unknown
      email?: unknown
      role?: unknown
    }
    if (typeof decoded.sub !== 'number' || typeof decoded.email !== 'string') return null
    const role = isAccountRole(decoded.role) ? decoded.role : 'player'
    return { sub: decoded.sub, email: decoded.email, role }
  } catch {
    return null
  }
}

function signToken(account: AccountRecord, config: AuthConfig): string {
  const options = { expiresIn: config.jwtExpiresIn } as SignOptions
  return jwt.sign(
    { sub: account.id, email: account.email, role: account.role },
    config.jwtSecret,
    options
  )
}

export function requireRole(
  config: AuthConfig,
  store: AccountStore,
  ...allowed: AccountRole[]
): RequestHandler {
  const roleSet = new Set<AccountRole>(allowed.length === 0 ? ['admin'] : allowed)
  return (req, res, next) => {
    const claims = readAuthClaims(req, config)
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    // Always re-read role from DB so demotions take effect immediately
    // even if the JWT still carries an older role claim.
    const account = store.findById(claims.sub)
    if (!account) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    if (!roleSet.has(account.role)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role.' })
      return
    }
    req.auth = { sub: account.id, email: account.email, role: account.role }
    next()
  }
}

function parseAuthBody(body: unknown): { email: string; password: string } {
  if (!body || typeof body !== 'object') {
    throw new AccountError('INVALID_BODY', 'Request body must be JSON with email and password.')
  }
  const b = body as { email?: unknown; password?: unknown }
  if (typeof b.email !== 'string' || typeof b.password !== 'string') {
    throw new AccountError('INVALID_BODY', 'email and password are required strings.')
  }
  return { email: b.email, password: b.password }
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next)
  }
}
