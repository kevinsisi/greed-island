// Auth router + middleware. Issues JWTs signed with JWT_SECRET and
// verifies bearer tokens for routes that opt into authentication.

import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { AccountError, type AccountStore } from './accounts.js'

export type AuthConfig = Readonly<{
  jwtSecret: string
  jwtExpiresIn: string
}>

export type AuthClaims = Readonly<{
  sub: number
  email: string
}>

declare module 'express-serve-static-core' {
  // Augment Express Request with the optional auth payload so route
  // handlers can read req.auth without casting.
  interface Request {
    auth?: AuthClaims
  }
}

export function createAuthRouter(store: AccountStore, config: AuthConfig): Router {
  const router = Router()

  router.post('/register', asyncHandler(async (req, res) => {
    const { email, password } = parseAuthBody(req.body)
    try {
      const account = await store.createAccount(email, password)
      const token = signToken(account.id, account.email, config)
      res.status(201).json({
        token,
        account: { id: account.id, email: account.email, createdAt: account.createdAt }
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
      const token = signToken(account.id, account.email, config)
      res.status(200).json({
        token,
        account: { id: account.id, email: account.email, createdAt: account.createdAt }
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
    res.json({ account: { id: account.id, email: account.email, createdAt: account.createdAt } })
  })

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
    const decoded = jwt.verify(token, config.jwtSecret) as { sub?: unknown; email?: unknown }
    if (typeof decoded.sub !== 'number' || typeof decoded.email !== 'string') return null
    return { sub: decoded.sub, email: decoded.email }
  } catch {
    return null
  }
}

function signToken(id: number, email: string, config: AuthConfig): string {
  const options = { expiresIn: config.jwtExpiresIn } as SignOptions
  return jwt.sign({ sub: id, email }, config.jwtSecret, options)
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
