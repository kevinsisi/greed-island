import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createCanonicalAccountView } from './canonicalAccountView.js'

describe('canonical account projection facade', () => {
  it('uses the existing repository, preserves username/null email and exposes no credentials or role writes', async () => {
    const db = new Database(':memory:')
    try {
      migrateIdentitySchema(db)
      const auth = new AuthService(db, { allowedOrigins: ['http://127.0.0.1:4178'], secureCookies: false })
      const user = await auth.register({ kind: 'username', value: 'preserved-display-name' }, 'synthetic-test-password', 'http://127.0.0.1:4178')
      const view = createCanonicalAccountView(db, auth.accounts)
      expect(view.findById(user.principal.accountId)).toMatchObject({ id: user.principal.accountId, email: null, username: 'preserved-display-name', displayName: 'preserved-display-name', role: 'player' })
      expect(JSON.stringify(view.listAccounts())).not.toMatch(/password|scrypt|token/)
      expect(Object.keys(view)).not.toContain('setRole')
      expect(Object.keys(view)).not.toContain('createAccount')
      view.setLastSeenTick(user.principal.accountId, 19)
      view.setLastSeenTick(user.principal.accountId, 12)
      expect(view.getLastSeenTick(user.principal.accountId)).toBe(19)
    } finally { db.close() }
  })
})
