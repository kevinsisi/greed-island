#!/usr/bin/env node
// Explicit synthetic localhost-only job fixture. Never opens a supplied DB.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { initializeKernelSchema } from '../packages/server/dist/kernel/eventStore.js'
import { migrateIdentitySchema } from '../packages/server/dist/identity/schema.js'
import { AuthService } from '../packages/server/dist/identity/authService.js'
import { resolveUnifiedConfig } from '../packages/server/dist/bootstrap/unifiedConfig.js'
import { createUnifiedServer } from '../packages/server/dist/bootstrap/unifiedServer.js'
import { initializeUnifiedFeatureSchema } from '../packages/server/dist/bootstrap/featureSchema.js'

const directory = mkdtempSync(join(tmpdir(), 'greed-unified-fixture-'))
const databasePath = join(directory, 'greed-island.sqlite')
let application
let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  try { await application?.close() } finally { rmSync(directory, { recursive: true, force: true }) }
}
try {
  const config = resolveUnifiedConfig({
    HOST: '127.0.0.1',
    PORT: process.env.UNIFIED_FIXTURE_PORT ?? '4179',
    GREED_ISLAND_DB_PATH: databasePath,
    GREED_ISLAND_ALLOWED_ORIGINS: process.env.UNIFIED_FIXTURE_ALLOWED_ORIGINS ?? 'http://127.0.0.1:4178',
    GREED_ISLAND_LOCAL_HTTP: '1',
  })
  const db = new Database(databasePath)
  try {
    initializeKernelSchema(db)
    migrateIdentitySchema(db) // Explicit init of this newly allocated empty DB ONLY.
    initializeUnifiedFeatureSchema(db)
    const auth = new AuthService(db, { allowedOrigins: config.allowedOrigins, secureCookies: false })
    const password = 'fixture-only-password-42'
    for (const username of ['fixture-one', 'fixture-two', 'fixture-admin']) {
      const grant = await auth.register({ kind: 'username', value: username }, password, config.allowedOrigins[0])
      if (username === 'fixture-admin') {
        // Synthetic job ownership is explicit. Public signup never promotes.
        db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(grant.principal.accountId)
      }
    }
    // Seed sessions are never published or used by browser clients.
    db.prepare('DELETE FROM auth_sessions').run()
  } finally { db.close() }
  application = createUnifiedServer(config)
  await application.start()
  console.log(JSON.stringify({ fixture: 'unified-localhost', ready: true, host: config.host, port: config.port, health: '/healthz' }))
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 10_000)
    deadline.unref()
    void stop().then(() => { clearTimeout(deadline); process.exit(0) }, error => { console.error(error); process.exit(1) })
  })
} catch (error) {
  await stop()
  console.error(error instanceof Error ? error.message : 'Fixture failed')
  process.exitCode = 1
}
