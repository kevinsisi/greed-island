import type { Request, Response } from 'express'
import { AuthError } from '../identity/authService.js'
import type { HttpAuthorization, CanonicalRequestClaims } from './authorization.js'

export const GM_ROLES = ['gm', 'admin'] as const

/** Recheck private response authorization after provider/body awaits. */
export function reauthorizeGmRead(auth: HttpAuthorization, req: Request): CanonicalRequestClaims {
  const current = auth.resolve(req)
  if (!current) throw new AuthError('UNAUTHORIZED')
  if (!GM_ROLES.some(role => role === current.role)) throw new AuthError('FORBIDDEN')
  return current
}

/** Never serialize raw provider, filesystem, credential or parser errors. */
export function sendFeatureError(res: Response, error: unknown): void {
  const statuses: Record<string, number> = {
    UNAUTHORIZED: 401, FORBIDDEN: 403, ORIGIN_NOT_ALLOWED: 403,
    ACCOUNT_CHANGED: 409, ACCOUNT_CONTEXT_REQUIRED: 400,
  }
  const code = error instanceof AuthError ? error.code : 'INTERNAL_ERROR'
  res.status(statuses[code] ?? 500).json({ error: code })
}
