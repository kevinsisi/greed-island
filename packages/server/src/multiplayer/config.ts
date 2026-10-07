export type MultiplayerConfig = Readonly<{
  host: string
  port: number
  dataDir: string | null
}>

export function readMultiplayerConfig(env: NodeJS.ProcessEnv = process.env): MultiplayerConfig {
  const host = env.MULTIPLAYER_HOST === undefined ? '127.0.0.1' : env.MULTIPLAYER_HOST.trim()
  if (!host) throw new Error('MULTIPLAYER_HOST must not be empty.')

  const rawPort = env.MULTIPLAYER_PORT ?? '4179'
  if (!/^\d+$/.test(rawPort)) throw new Error('MULTIPLAYER_PORT must be an integer from 1 to 65535.')
  const port = Number(rawPort)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('MULTIPLAYER_PORT must be an integer from 1 to 65535.')
  }

  const rawDataDir = env.MULTIPLAYER_DATA_DIR?.trim()
  return { host, port, dataDir: rawDataDir || null }
}
