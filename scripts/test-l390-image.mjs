// Native-image smoke on a job-only DB; no production path or account.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { initializeKernelSchema } from './dist/kernel/eventStore.js'
import { migrateIdentitySchema } from './dist/identity/schema.js'
import { AuthService } from './dist/identity/authService.js'
import { createUnifiedServer } from './dist/bootstrap/unifiedServer.js'
import { initializeUnifiedFeatureSchema } from './dist/bootstrap/featureSchema.js'

const directory = mkdtempSync(join(tmpdir(), 'greed-l390-native-smoke-'))
const databasePath = join(directory, 'canonical.sqlite'), origin = 'http://127.0.0.1:4178'
let application
try {
  const db = new Database(databasePath)
  try {
    initializeKernelSchema(db); migrateIdentitySchema(db); initializeUnifiedFeatureSchema(db)
    const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
    const owner = await auth.register({ kind: 'username', value: 'synthetic-smoke-owner' }, 'synthetic-fixture-password-42', origin)
    assert.equal(owner.principal.role, 'player')
    db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(owner.principal.accountId)
    db.prepare('DELETE FROM auth_sessions').run()
  } finally { db.close() }
  application = createUnifiedServer({ host: '127.0.0.1', port: 0, databasePath, allowedOrigins: [origin], secureCookies: false, sessionMs: 60000 })
  const listener = await application.start(), address = listener.address()
  assert.ok(address && typeof address !== 'string')
  const base = 'http://127.0.0.1:' + address.port
  const initialHealth = await (await fetch(base + '/healthz')).json()
  assert.equal(initialHealth.mode, 'unified')
  assert.equal((await fetch(base + '/api/world/snapshot')).status, 401)
  const registered = await fetch(base + '/api/auth/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'synthetic-smoke-player', password: 'synthetic-fixture-password-42' }) })
  assert.equal(registered.status, 201)
  const { profile } = await registered.json(); assert.equal(profile.role, 'player')
  const cookie = registered.headers.get('set-cookie').split(';')[0]
  const entered = await fetch(base + '/api/world/command', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'X-Greed-Account-Id': String(profile.accountId), 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: 'native-image-entry', type: 'enter', payload: {} }) })
  assert.equal(entered.status, 200)
  const snapshot = await (await fetch(base + '/api/world/snapshot', { headers: { Cookie: cookie } })).json()
  assert.equal(snapshot.selfId, profile.accountId)
  assert.equal(snapshot.worldId, 'canonical-world')
  await new Promise(resolve => setTimeout(resolve, 5500))
  const laterHealth = await (await fetch(base + '/healthz')).json()
  assert.ok(laterHealth.tick > initialHealth.tick, 'Autonomous world clock must advance without a browser')
  console.log(JSON.stringify({ passed: true, nativeSQLite: true, scope: 'Temporary native-image DB, player signup/entry/shared runtime and autonomous world clock', productionData: false }))
} finally {
  await application?.close()
  rmSync(directory, { recursive: true, force: true })
}
