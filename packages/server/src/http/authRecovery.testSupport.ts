import Database from 'better-sqlite3'
import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { afterEach } from 'vitest'
import { AuthService, type SessionGrant } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createUnifiedAuthRouter } from '../identity/authRouter.js'
import { createUnifiedAdminRouter } from '../identity/adminRouter.js'
export const RECOVERY_TEST_ORIGIN = 'http://127.0.0.1:4178'
const resources: Array<{ db: Database.Database; server: Server }> = []
afterEach(async () => { for (const { db, server } of resources.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close() } })
type RecoveryFixture = Readonly<{
  db: Database.Database
  auth: AuthService
  admin: SessionGrant
  player: SessionGrant
  request: (path: string, grant: SessionGrant | null, body?: unknown, expectedId?: number | null, origin?: string) => Promise<Response>
}>
export async function recoveryFixture(): Promise<RecoveryFixture> {
  const db = new Database(':memory:'); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [RECOVERY_TEST_ORIGIN], secureCookies: false })
  const admin = await auth.register({ kind: 'username', value: 'synthetic-owner-admin' }, 'synthetic-owner-password', RECOVERY_TEST_ORIGIN)
  // Explicit isolated fixture ownership, never signup/normal startup promotion.
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(admin.principal.accountId)
  const player = await auth.register({ kind: 'email', value: 'registered@example.test' }, 'synthetic-player-password', RECOVERY_TEST_ORIGIN)
  const app = express(); app.use('/api', createUnifiedAuthRouter({ auth })); app.use('/api', createUnifiedAdminRouter({ auth }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); resources.push({ db, server })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing synthetic socket')
  const request = (path: string, grant: typeof player | null, body?: unknown, expectedId: number | null = grant?.principal.accountId ?? null, origin = RECOVERY_TEST_ORIGIN) => fetch(`http://127.0.0.1:${address.port}/api` + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(grant ? { Cookie: 'greed_session=' + grant.token } : {}),
      ...(expectedId !== null ? { 'X-Greed-Account-Id': String(expectedId) } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { db, auth, admin, player, request }
}
