// Compatibility names for reviewed feature routers. Authentication is supplied
// by the ONE canonical cookie service; this module issues no credentials.
import type { RequestHandler } from 'express'
import type { AccountRole } from '../identity/principal.js'
import {
  requireCanonicalAuth, optionalCanonicalAuth, requireCanonicalRole,
  type HttpAuthorization, type CanonicalRequestClaims,
} from './authorization.js'

export type AuthConfig = HttpAuthorization
export type AuthClaims = CanonicalRequestClaims

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthClaims }
}

export type PublicAccount = Readonly<{
  id: number; email: string | null; createdAt: number; role: AccountRole
  nickname: string | null; avatar: string; displayName: string
}>
export function toPublicAccount(account: {
  id: number; email: string | null; createdAt: number; role: AccountRole
  nickname: string | null; avatar: string; displayName?: string; username?: string | null
}): PublicAccount {
  return {
    id: account.id, email: account.email, createdAt: account.createdAt,
    role: account.role, nickname: account.nickname, avatar: account.avatar,
    displayName: account.displayName ?? account.nickname ?? account.username ?? account.email?.split('@')[0] ?? String(account.id),
  }
}
export function requireAuth(config: AuthConfig): RequestHandler { return requireCanonicalAuth(config) }
export function optionalAuth(config: AuthConfig): RequestHandler { return optionalCanonicalAuth(config) }
/** Store retained as a structural read view for existing route signatures only. */
export function requireRole(config: AuthConfig, _store: { findById(id: number): unknown }, ...allowed: AccountRole[]): RequestHandler {
  return requireCanonicalRole(config, ...allowed)
}
