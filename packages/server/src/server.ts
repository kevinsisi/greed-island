// Greed Island server entrypoint. Boots:
//   1. better-sqlite3 backed kernel event log + accounts table
//   2. Simulation runtime (5-second tick loop)
//   3. Express HTTP API (auth, world, SSE) listening on PORT
//
// Configuration is environment-driven so the same binary runs in
// docker-compose and in local `node dist/server.js` invocations.

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { createHttpApp } from './http/server.js'
import { SimulationRuntime } from './sim/runtime.js'
import { loadCardCatalog } from './cards/loader.js'
import { loadNpcProfiles } from './npcs/loader.js'

type ResolvedConfig = Readonly<{
  host: string
  port: number
  dataDir: string
  jwtSecret: string
  jwtExpiresIn: string
  bcryptCost: number
}>

function resolveConfig(): ResolvedConfig {
  const host = process.env.HOST ?? '0.0.0.0'
  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`)
  }
  const dataDir = resolve(process.env.GREED_ISLAND_DATA_DIR ?? './data')
  const jwtSecret = process.env.JWT_SECRET ?? ''
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error(
      'JWT_SECRET is required and must be at least 16 characters. Set it in deploy/.env or your shell environment.'
    )
  }
  const bcryptCostRaw = Number.parseInt(process.env.BCRYPT_COST ?? '12', 10)
  const bcryptCost = Number.isFinite(bcryptCostRaw) ? Math.min(15, Math.max(4, bcryptCostRaw)) : 12
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '30d'
  return { host, port, dataDir, jwtSecret, jwtExpiresIn, bcryptCost }
}

function openDatabase(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true })
  const dbPath = resolve(dataDir, 'greed-island.sqlite')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

async function main(): Promise<void> {
  const config = resolveConfig()
  const db = openDatabase(config.dataDir)

  const cards = loadCardCatalog()
  const profiles = loadNpcProfiles()
  console.log(
    `[boot] loaded ${cards.entries.length} cards and ${profiles.length} NPC profiles`
  )

  const { SqliteEventStore } = await import('./kernel/eventStore.js')
  const eventStore = new SqliteEventStore(db)

  const runtime = new SimulationRuntime(eventStore, profiles, cards)
  runtime.start()
  console.log(`[boot] simulation runtime started — tick=${runtime.getSnapshot().tick}`)

  const app = createHttpApp({
    db,
    runtime,
    auth: { jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn },
    bcryptCost: config.bcryptCost
  })

  const server = app.listen(config.port, config.host, () => {
    console.log(`[boot] HTTP listening on http://${config.host}:${config.port}`)
  })

  const shutdown = (signal: string) => {
    console.log(`[shutdown] received ${signal}, closing...`)
    runtime.stop()
    server.close(() => {
      try {
        db.close()
      } catch (err) {
        console.error('[shutdown] db close error', err)
      }
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[boot] fatal', err)
  process.exit(1)
})
