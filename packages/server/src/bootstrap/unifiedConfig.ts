import { isAbsolute, resolve } from 'node:path'

export type UnifiedServerConfig = Readonly<{
  host: string
  port: number
  databasePath: string
  allowedOrigins: readonly string[]
  secureCookies: boolean
  sessionMs: number
  buildSha?: string
  openCodeCredentialOrigin?: string
}>

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const DEFAULT_SESSION_MS = 12 * 60 * 60 * 1000
const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000

/** One normal server configuration; no legacy/unified mode switch. */
export function resolveUnifiedConfig(env: NodeJS.ProcessEnv = process.env): UnifiedServerConfig {
  const host = env.HOST?.trim() || '127.0.0.1'
  const port = integer(env.PORT ?? '3000', 1, 65535, 'PORT')
  const path = env.GREED_ISLAND_DB_PATH?.trim()
  if (!path || !isAbsolute(path)) throw new Error('GREED_ISLAND_DB_PATH must select an existing absolute canonical database path.')
  const rawOrigins = env.GREED_ISLAND_ALLOWED_ORIGINS?.split(/[\n,]/).map(value => value.trim()).filter(Boolean) ?? []
  if (!rawOrigins.length) throw new Error('GREED_ISLAND_ALLOWED_ORIGINS is required.')
  const localHttp = env.GREED_ISLAND_LOCAL_HTTP === '1'
  if (env.GREED_ISLAND_LOCAL_HTTP && !['0', '1'].includes(env.GREED_ISLAND_LOCAL_HTTP)) throw new Error('GREED_ISLAND_LOCAL_HTTP must be 0 or 1.')
  if (localHttp && !LOOPBACK_HOSTS.has(host)) throw new Error('Local HTTP cookies require a loopback listen host.')
  const allowedOrigins = [...new Set(rawOrigins.map(value => {
    let url: URL
    try { url = new URL(value) } catch { throw new Error('Invalid GREED_ISLAND_ALLOWED_ORIGINS.') }
    if (url.origin !== value || url.username || url.password || !['https:', 'http:'].includes(url.protocol)) throw new Error('Origins must be exact HTTP(S) origins, without paths or credentials.')
    if (localHttp && !LOOPBACK_HOSTS.has(url.hostname)) throw new Error('Local HTTP cookies require loopback origins.')
    if (!localHttp && url.protocol !== 'https:') throw new Error('Normal server cookies require HTTPS origins.')
    return value
  }))]
  const sessionMs = integer(env.GREED_ISLAND_SESSION_MS ?? String(DEFAULT_SESSION_MS), 1, MAX_SESSION_MS, 'GREED_ISLAND_SESSION_MS')
  const buildSha = env.GREED_ISLAND_BUILD_SHA?.trim()
  if (buildSha && !/^[a-f0-9]{40}$/.test(buildSha)) throw new Error('GREED_ISLAND_BUILD_SHA must be the exact commit SHA.')
  // This immutable non-secret trust boundary is separate from editable settings.
  // Missing/malformed metadata forwards no global OpenCode credential.
  let openCodeCredentialOrigin: string | undefined
  try {
    const raw = env.OPENCODE_CREDENTIAL_ORIGIN?.trim(), url = raw ? new URL(raw) : undefined
    if (url && raw === url.origin && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) openCodeCredentialOrigin = url.origin
  } catch { /* no trusted origin */ }
  return { host, port, databasePath: resolve(path), allowedOrigins, secureCookies: !localHttp, sessionMs,
    ...(buildSha ? { buildSha } : {}), ...(openCodeCredentialOrigin ? { openCodeCredentialOrigin } : {}) }
}

function integer(raw: string, minimum: number, maximum: number, label: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${label}.`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${label}.`)
  return value
}
