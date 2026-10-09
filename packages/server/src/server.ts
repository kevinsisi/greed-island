// The only active server entrypoint: one database, auth boundary and runtime.
// Database initialization/import/owner bootstrap are explicit offline gates.
import { resolveUnifiedConfig } from './bootstrap/unifiedConfig.js'
import { createUnifiedServer } from './bootstrap/unifiedServer.js'

async function main(): Promise<void> {
  const config = resolveUnifiedConfig()
  const application = createUnifiedServer(config)
  await application.start()
  console.log(`[boot] unified HTTP listening on ${config.host}:${config.port}; tick=${application.runtime.getCurrentTick()}`)
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[shutdown] received ${signal}`)
    const deadline = setTimeout(() => process.exit(1), 10_000)
    deadline.unref()
    void application.close().then(() => { clearTimeout(deadline); process.exit(0) }, error => {
      console.error('[shutdown] failed', error)
      process.exit(1)
    })
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

void main().catch(error => {
  console.error('[boot] fatal', error instanceof Error ? error.message : 'Unknown boot failure')
  process.exitCode = 1
})
