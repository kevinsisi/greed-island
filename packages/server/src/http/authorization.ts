import type { Request, RequestHandler } from 'express'
import { AuthError, AuthService, sessionTokenFromCookie } from '../identity/authService.js'
import { assertExpectedAccountContext } from '../identity/authRouter.js'
import { accountId, type AccountRole, type Principal } from '../identity/principal.js'

export type CanonicalRequestClaims = Readonly<{ sub: number; email: string | null; role: AccountRole; displayName: string }>
export type HttpAuthorization = Readonly<{
  authService: AuthService
  session: RequestHandler
  mutation: RequestHandler
  optional: RequestHandler
  forRequest: RequestHandler
  role: (...allowed: AccountRole[]) => RequestHandler
  resolve: (req: Request) => CanonicalRequestClaims | null
  reauthorizeMutation: (req: Request, allowed?: readonly AccountRole[]) => CanonicalRequestClaims
  token: (req: Request) => string | null
}>

declare module 'express-serve-static-core' {
  interface Request { canonicalPrincipal?: Principal }
}
const MUTATORS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const STATUS: Readonly<Record<string, number>> = {
  UNAUTHORIZED: 401, FORBIDDEN: 403, ORIGIN_NOT_ALLOWED: 403,
  ACCOUNT_CHANGED: 409, ACCOUNT_CONTEXT_REQUIRED: 400,
}

/** Trusted composition only: one service, no bearer verifier/exchange/fallback. */
export function createHttpAuthorization(auth: AuthService): HttpAuthorization {
  const token = (req: Request) => sessionTokenFromCookie(req.headers.cookie)
  const assertReadOrigin = (req: Request) => {
    if (req.get('sec-fetch-site') === 'cross-site') throw new AuthError('ORIGIN_NOT_ALLOWED')
    const origin = req.get('origin')
    if (origin) auth.assertOrigin(origin)
  }
  const claims = (principal: Principal): CanonicalRequestClaims => {
    const profile = auth.accounts.getProfile(principal.accountId)
    if (!profile) throw new AuthError('UNAUTHORIZED')
    return { sub: principal.accountId, email: profile.email, role: profile.role, displayName: profile.displayName }
  }
  const resolve = (req: Request): CanonicalRequestClaims | null => {
    assertReadOrigin(req)
    const principal = auth.resolve(token(req))
    if (principal && req.get('X-Greed-Account-Id') !== undefined) assertExpectedAccountContext(req.get('X-Greed-Account-Id'), principal)
    return principal ? claims(principal) : null
  }
  const reauthorizeMutation = (req: Request, allowed?: readonly AccountRole[]): CanonicalRequestClaims => {
    const principal = auth.requireMutation(token(req), req.get('origin'))
    assertExpectedAccountContext(req.get('X-Greed-Account-Id'), principal)
    const current = claims(principal)
    if (allowed && !allowed.includes(current.role)) throw new AuthError('FORBIDDEN')
    req.canonicalPrincipal = { accountId: accountId(current.sub), role: current.role }
    req.auth = current
    return current
  }
  const middleware = (mode: 'session' | 'mutation' | 'request', allowed?: readonly AccountRole[]): RequestHandler => {
    return (req, res, next) => {
      // Never accept a prefilled request/local principal from another adapter.
      delete req.canonicalPrincipal
      delete req.auth
      delete res.locals.unifiedPrincipal
      delete res.locals.canonicalClaims
      try {
        const current = mode === 'mutation' || (mode === 'request' && MUTATORS.has(req.method))
          ? reauthorizeMutation(req, allowed) : resolve(req)
        if (!current) throw new AuthError('UNAUTHORIZED')
        // These handlers are private/account-context reads. Initial /auth/me
        // synchronization remains owned by the identity router, not this seam.
        if (mode !== 'mutation' && !MUTATORS.has(req.method)) {
          assertExpectedAccountContext(req.get('X-Greed-Account-Id'), { accountId: accountId(current.sub), role: current.role })
        }
        if (allowed && !allowed.includes(current.role)) throw new AuthError('FORBIDDEN')
        const principal = { accountId: accountId(current.sub), role: current.role }
        req.canonicalPrincipal = principal
        Object.assign(req, { auth: current })
        res.locals.unifiedPrincipal = principal
        res.locals.canonicalClaims = current
        next()
      } catch (error) {
        const code = error instanceof AuthError ? error.code : 'INTERNAL_ERROR'
        res.status(STATUS[code] ?? 500).json({ error: code })
      }
    }
  }
  const optional: RequestHandler = (req, res, next) => {
    delete req.canonicalPrincipal
    delete req.auth
    delete res.locals.unifiedPrincipal
    delete res.locals.canonicalClaims
    try {
      const current = resolve(req)
      if (current) {
        const principal = { accountId: accountId(current.sub), role: current.role }
        req.canonicalPrincipal = principal
        Object.assign(req, { auth: current })
        res.locals.unifiedPrincipal = principal
        res.locals.canonicalClaims = current
      }
      next()
    } catch (error) {
      const code = error instanceof AuthError ? error.code : 'INTERNAL_ERROR'
      res.status(STATUS[code] ?? 500).json({ error: code })
    }
  }
  return Object.freeze({
    authService: auth, token, resolve, reauthorizeMutation, optional,
    session: middleware('session'), mutation: middleware('mutation'),
    forRequest: middleware('request'),
    role: (...allowed: AccountRole[]) => middleware('request', allowed.length ? allowed : ['admin']),
  })
}

export function requireCanonicalAuth(auth: HttpAuthorization): RequestHandler { return auth.forRequest }
export function optionalCanonicalAuth(auth: HttpAuthorization): RequestHandler { return auth.optional }
export function requireCanonicalRole(auth: HttpAuthorization, ...allowed: AccountRole[]): RequestHandler { return auth.role(...allowed) }
