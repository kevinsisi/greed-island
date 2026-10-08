import Database from 'better-sqlite3'
import { scryptSync } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore, initializeAccountSchema, type AccountRole } from './accounts.js'

const databases: Database.Database[] = []
function database(): Database.Database { const db = new Database(':memory:'); databases.push(db); return db }
afterEach(() => { for (const db of databases.splice(0)) db.close() })

describe('explicit account admin bootstrap policy', () => {
  it('preserves legacy first-registration behavior by default', async () => {
    const store = new AccountStore(database(), 4)
    expect((await store.createAccount('first@example.test', 'synthetic-password')).role).toBe('admin')
    expect((await store.createAccount('second@example.test', 'synthetic-password')).role).toBe('player')
  })
  it('never grants first-registration admin in unified/import mode', async () => {
    const store = new AccountStore(database(), 4, { adminBootstrap: 'none' })
    expect((await store.createAccount('first@example.test', 'synthetic-password')).role).toBe('player')
    expect(store.countAdmins()).toBe(0)
  })
  it('does not promote the earliest existing account on repeated unified/import construction', async () => {
    const db = database()
    const store = new AccountStore(db, 4, { adminBootstrap: 'none' })
    const account = await store.createAccount('first@example.test', 'synthetic-password')
    initializeAccountSchema(db, { adminBootstrap: 'none' })
    const reopened = new AccountStore(db, 4, { adminBootstrap: 'none' })
    expect(reopened.findById(account.id)?.role).toBe('player')
    expect(reopened.countAdmins()).toBe(0)
  })
  it('preserves the legacy no-admin recovery behavior when the default is used', async () => {
    const db = database()
    const disabled = new AccountStore(db, 4, { adminBootstrap: 'none' })
    const account = await disabled.createAccount('first@example.test', 'synthetic-password')
    expect(new AccountStore(db, 4).findById(account.id)?.role).toBe('admin')
  })
  it('preserves all existing roles in unified/import mode', async () => {
    const db = database()
    const store = new AccountStore(db, 4, { adminBootstrap: 'none' })
    const roles: AccountRole[] = ['player', 'gm', 'admin', 'agent']
    for (const role of roles) {
      const account = await store.createAccount(`${role}@example.test`, 'synthetic-password')
      store.setRole(account.id, role)
    }
    expect(new AccountStore(db, 4, { adminBootstrap: 'none' }).listAccounts().map(a => a.role)).toEqual(roles)
  })
  it('rejects a malformed bootstrap policy before schema mutation', () => {
    const db = database()
    expect(() => initializeAccountSchema(db, { adminBootstrap: 'typo' as 'none' })).toThrow('bootstrap policy')
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='accounts'").get()).toBeUndefined()
  })
  it('verifies synthetic imported scrypt credentials through both canonical verification paths without rewriting them', async () => {
    const db = database()
    const store = new AccountStore(db, 4, { adminBootstrap: 'none' })
    const account = await store.createAccount('existing@example.test', 'synthetic-password')
    const password = '潮'.repeat(100)
    const salt = '0123456789abcdef0123456789abcdef'
    const hash = `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
    db.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(hash, account.id)
    expect((await store.verifyCredentials(account.email, password))?.id).toBe(account.id)
    expect(await store.verifyPasswordById(account.id, password)).toBe(true)
    expect(await store.verifyPasswordById(account.id, password.slice(0, -1))).toBe(false)
    expect(store.findById(account.id)?.passwordHash).toBe(hash)
    expect(store.findById(account.id)?.role).toBe('player')
  })
})
