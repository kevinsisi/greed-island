// Canonical GM settings adapter. It receives the same SettingsStore used by
// the runtime. It creates no accounts, credentials, database or JWT verifier.
import { Router, json, type ErrorRequestHandler } from 'express'
import {
  parseKeyList,
  type SettingsStore,
} from './settings.js'
import type { HttpAuthorization } from './authorization.js'
import { GM_ROLES, reauthorizeGmRead, sendFeatureError } from './featureAuthorization.js'
import type { ApiKeyRecord, ApiKeySummary } from './settings.js'
import {
  getOpenCodeModel,
  getOpenCodeServers,
} from '../npcs/openCodeClient.js'

export type SettingsRouterInput = Readonly<{
  store: SettingsStore
  authConfig: HttpAuthorization
  /** Immutable startup trust, never derived from editable provider settings. */
  openCodeCredentialOrigin?: string
}>

export function createSettingsRouter(input: SettingsRouterInput): Router {
  const router = Router()
  // Snapshot the separately authorized origin at composition time. Changes to
  // settings (or the original input object) cannot enlarge credential access.
  const credentialOrigin = trustedCredentialOrigin(input.openCodeCredentialOrigin)
  const requireGm = input.authConfig.role(...GM_ROLES)
  const parseBody = json({ limit: '16kb', strict: true })
  const commit = (req: Parameters<HttpAuthorization['reauthorizeMutation']>[0]) => input.authConfig.reauthorizeMutation(req, GM_ROLES)

  router.get('/settings/health', requireGm, (_req, res) => {
    res.json({
      activeKeys: input.store.countActive(),
      totalKeys: input.store.listKeys().length,
      adminAllowList: false,
    })
  })

  router.get('/settings/keys', requireGm, (_req, res) => {
    const records = input.store.listKeys()
    res.json({ keys: records.map(redactedSummary) })
  })

  router.post('/settings/keys', requireGm, parseBody, (req, res) => {
    const body = (req.body ?? {}) as { keys?: unknown }
    let raw: string[] = []
    if (Array.isArray(body?.keys)) {
      raw = body.keys.filter((v): v is string => typeof v === 'string')
    } else if (typeof body?.keys === 'string') {
      raw = parseKeyList(body.keys)
    } else {
      res.status(400).json({
        error: 'INVALID_BODY',
        message: 'keys 必須是字串（多行/逗號分隔）或字串陣列。',
      })
      return
    }
    const cleaned = raw.flatMap(parseKeyList)
    if (cleaned.length === 0) {
      res.status(400).json({ error: 'NO_KEYS', message: '沒有提供任何金鑰。' })
      return
    }
    commit(req)
    const inserted = input.store.addKeys(cleaned, 'admin')
    res.json({
      inserted,
      submitted: cleaned.length,
      duplicates: cleaned.length - inserted,
      keys: input.store.listKeys().map(redactedSummary),
    })
  })

  router.delete('/settings/keys/:id', requireGm, parseBody, (req, res) => {
    const rawId = String(req.params.id ?? '')
    const id = /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : NaN
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: 'INVALID_ID' })
      return
    }
    commit(req)
    const removed = input.store.deleteKey(id)
    if (!removed) {
      res.status(404).json({ error: 'KEY_NOT_FOUND' })
      return
    }
    res.json({ ok: true, keys: input.store.listKeys().map(redactedSummary) })
  })

  router.post('/settings/keys/reactivate-all', requireGm, parseBody, (req, res) => {
    commit(req)
    const reactivated = input.store.reactivateAll()
    res.json({ reactivated, keys: input.store.listKeys().map(redactedSummary) })
  })

  // v0.42.0 — OpenCode provider settings + priority ordering. KV table.
  router.get('/settings/providers', requireGm, (_req, res) => {
    res.json({
      openCodeBaseUrl: safeServer(input.store.getSetting('opencode_base_url')),
      openCodeModel: safeModel(input.store.getSetting('opencode_model')),
      providerPriority: safePriority(input.store.getSetting('provider_priority')),
    })
  })

  router.put('/settings/providers', requireGm, parseBody, (req, res) => {
    const body = (req.body ?? {}) as {
      openCodeBaseUrl?: unknown
      openCodeModel?: unknown
      providerPriority?: unknown
    }
    if (body.openCodeBaseUrl !== undefined && (typeof body.openCodeBaseUrl !== 'string' || (body.openCodeBaseUrl.trim() !== '' && !validServer(body.openCodeBaseUrl.trim())))) {
      res.status(400).json({ error: 'INVALID_SERVER_URL' }); return
    }
    if (body.openCodeModel !== undefined && (typeof body.openCodeModel !== 'string' || (body.openCodeModel.trim() && !safeModel(body.openCodeModel.trim())))) {
      res.status(400).json({ error: 'INVALID_MODEL' }); return
    }
    commit(req)
    if (body.openCodeBaseUrl !== undefined) {
      const v = typeof body.openCodeBaseUrl === 'string' ? body.openCodeBaseUrl : ''
      input.store.setSetting('opencode_base_url', v || null)
    }
    if (body.openCodeModel !== undefined) {
      const v = typeof body.openCodeModel === 'string' ? body.openCodeModel : ''
      input.store.setSetting('opencode_model', v || null)
    }
    if (body.providerPriority !== undefined) {
      const v = typeof body.providerPriority === 'string' ? body.providerPriority : ''
      const cleaned = v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s === 'opencode' || s === 'gemini')
        .join(',')
      input.store.setSetting('provider_priority', cleaned || null)
    }
    res.json({
      openCodeBaseUrl: safeServer(input.store.getSetting('opencode_base_url')),
      openCodeModel: safeModel(input.store.getSetting('opencode_model')),
      providerPriority: safePriority(input.store.getSetting('provider_priority')),
    })
  })

  // v0.65.0 — contract-aligned OpenCode settings (servers textarea, model select).
  // Requires GM/admin role (game server deviation from opencode-settings-ui-contract §1).
  function buildOpenCodeStatus(store: SettingsStore) {
    const configuredServers = getOpenCodeServers(store)
    const servers = configuredServers.every(validServer) ? configuredServers : []
    const fromDb =
      store.getSetting('opencode_servers') ?? store.getSetting('opencode_base_url')
    const fromEnv = process.env.OPENCODE_SERVERS ?? process.env.OPENCODE_BASE_URL
    const modelFromDb =
      store.getSetting('opencode_text_model') ?? store.getSetting('opencode_model')
    return {
      servers: servers.map((url, i) => ({
        id: `server-${i + 1}`,
        label: `Server ${i + 1}`,
        base_url: url,
      })),
      servers_source: fromDb ? 'setting' : fromEnv ? 'env' : 'none',
      text_model: safeModel(getOpenCodeModel(store)) ?? '',
      text_model_source: modelFromDb ? 'setting' : process.env.OPENCODE_MODEL ? 'env' : 'default',
    }
  }

  router.get('/settings/opencode', requireGm, (_req, res) => {
    res.json(buildOpenCodeStatus(input.store))
  })

  router.post('/settings/opencode', requireGm, parseBody, (req, res) => {
    const body = (req.body ?? {}) as { servers?: unknown; text_model?: unknown }
    if (body.servers !== undefined && (typeof body.servers !== 'string' || !validServers(body.servers))) {
      res.status(400).json({ error: 'INVALID_SERVER_URL' }); return
    }
    if (body.text_model !== undefined && (typeof body.text_model !== 'string' || (body.text_model.trim() && !safeModel(body.text_model.trim())))) {
      res.status(400).json({ error: 'INVALID_MODEL' }); return
    }
    commit(req)
    if (body.servers !== undefined) {
      const v = typeof body.servers === 'string' ? body.servers.trim() : ''
      input.store.setSetting('opencode_servers', v || null)
    }
    if (body.text_model !== undefined) {
      const v = typeof body.text_model === 'string' ? body.text_model.trim() : ''
      input.store.setSetting('opencode_text_model', v || null)
    }
    res.json(buildOpenCodeStatus(input.store))
  })

  router.delete('/settings/opencode', requireGm, (req, res) => {
    commit(req)
    for (const key of [
      'opencode_servers',
      'opencode_text_model',
      'opencode_base_url',
      'opencode_model',
    ]) {
      input.store.setSetting(key, null)
    }
    res.json(buildOpenCodeStatus(input.store))
  })

  router.get('/settings/opencode/models', requireGm, (req, res) => {
    const configuredServers = getOpenCodeServers(input.store)
    const servers = configuredServers.every(validServer) ? configuredServers : []
    if (servers.length === 0) {
      res.status(400).json({ groups: [], server: null, error: 'No OpenCode servers configured' })
      return
    }
    const serverUrl = servers[0]
    const server = { id: 'server-1', label: 'Server 1', base_url: serverUrl }
    const password = credentialOrigin !== null && new URL(serverUrl!).origin === credentialOrigin
      ? process.env.OPENCODE_SERVER_PASSWORD ?? '' : ''
    const headers: Record<string, string> = password
      ? { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }
      : {}

    // `opencode-go` (paid Zen subscription) and `openai` (No-OpenAI rule) are
    // never shown. Remaining models are cost-filtered to free-only below, since
    // the Zen workspace balance is 0 and any paid model returns 401.
    const SHOW_PROVIDERS = new Set(['opencode', 'github-copilot', 'google', 'anthropic'])

    type ProviderModel = { id?: string; name?: string; cost?: { input?: number; output?: number } }
    const isFreeModel = (m: ProviderModel) => m.cost?.input === 0 && m.cost?.output === 0
    type RawProvider = { id?: string; name?: string; models?: Record<string, ProviderModel> }

    void (async () => {
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), 10_000)
      try {
        const [provRes, authRes] = await Promise.all([
          fetch(`${serverUrl}/provider`, { headers, signal: abort.signal, redirect: 'error' }),
          fetch(`${serverUrl}/provider/auth`, { headers, signal: abort.signal, redirect: 'error' }).catch(() => null),
        ])
        reauthorizeGmRead(input.authConfig, req)
        if (!provRes.ok) {
          res.status(502).json({ groups: [], server, error: `OpenCode /provider 回傳 ${provRes.status}` })
          return
        }
        const providerData = (await readProviderJson(provRes)) as { all?: unknown[]; providers?: unknown[] }
        const authData: Record<string, unknown> = authRes?.ok ? (await readProviderJson(authRes) as Record<string, unknown>) : {}
        const authedProviders = new Set(Object.keys(authData))

        const providerList = providerData.all ?? providerData.providers ?? []
        const groups: Array<{ provider: string; name: string; authed: boolean; models: Array<{ id: string; name: string; free: boolean }> }> = []
        for (const provider of providerList as RawProvider[]) {
          if (!provider.id || !SHOW_PROVIDERS.has(provider.id)) continue
          const models = Object.values(provider.models ?? {}).filter(isFreeModel)
          if (models.length === 0) continue
          groups.push({
            provider: provider.id,
            name: provider.name ?? provider.id,
            authed: !authedProviders.has(provider.id),
            models: models.map((m) => ({
              id: `${provider.id}/${m.id ?? ''}`,
              name: m.name ?? m.id ?? '',
              free: true,
            })),
          })
        }
        reauthorizeGmRead(input.authConfig, req)
        res.json({ groups, server })
      } catch (err) {
        try { reauthorizeGmRead(input.authConfig, req) } catch (authorizationError) { sendFeatureError(res, authorizationError); return }
        res.status(502).json({ groups: [], server, error: 'OpenCode models fetch failed' })
      } finally {
        clearTimeout(timer)
      }
    })()
  })

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = (error as { status?: number }).status
    if (status === 413 || status === 400) { res.status(status).json({ error: status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_BODY' }); return }
    sendFeatureError(res, error)
  }
  router.use(errorHandler)
  return router
}


function redactedSummary(record: ApiKeyRecord): ApiKeySummary {
  return {
    id: record.id, fingerprint: '••••', source: record.source, status: record.status,
    lastError: record.lastError ? 'PROVIDER_ERROR' : null,
    lastUsedAt: record.lastUsedAt, failureCount: record.failureCount, createdAt: record.createdAt,
  }
}
function validServer(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}
function validServers(value: string): boolean {
  return value.split(/[\n,]+/).map(server => server.trim()).filter(Boolean).every(validServer)
}
function safeServer(value: string | null): string | null { return value && validServer(value) ? value : null }

function safePriority(value: string | null): string {
  return value?.split(',').filter(provider => provider === 'opencode' || provider === 'gemini').join(',') || 'opencode,gemini'
}
function safeModel(value: string | null): string | null {
  return value && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value) ? value : null
}

const MAX_PROVIDER_JSON_BYTES = 2 * 1024 * 1024
async function readProviderJson(response: globalThis.Response): Promise<unknown> {
  const declaredSize = Number(response.headers.get('content-length'))
  if (declaredSize > MAX_PROVIDER_JSON_BYTES || !response.body) throw new Error('PROVIDER_RESPONSE_INVALID')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > MAX_PROVIDER_JSON_BYTES) { await reader.cancel(); throw new Error('PROVIDER_RESPONSE_INVALID') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function trustedCredentialOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && !url.search && !url.hash && url.pathname === '/' ? url.origin : null
  } catch { return null }
}
