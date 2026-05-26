// Settings HTTP router. Provides GM/admin-only access to the API key
// pool used by the AI NPC dialog.
//
// Endpoints (all require role >= gm):
//   GET    /api/settings/keys           list keys (fingerprints only)
//   POST   /api/settings/keys           batch insert keys (text body)
//   DELETE /api/settings/keys/:id       remove a key
//   POST   /api/settings/keys/reactivate-all   re-enable disabled keys
//   GET    /api/settings/health         summary for the Settings page
//
// Whether a user counts as GM/admin is determined by the `role` column
// on the accounts table. The first registered account is auto-promoted
// to admin during account creation. The legacy GREED_ISLAND_ADMIN_EMAILS
// env still works as a one-shot promotion list at boot.

import { Router } from 'express'
import {
  parseKeyList,
  summarize,
  type SettingsStore,
} from './settings.js'
import { requireRole, type AuthConfig } from './auth.js'
import type { AccountStore } from './accounts.js'
import {
  getOpenCodeModel,
  getOpenCodeServers,
} from '../npcs/openCodeClient.js'

export type SettingsRouterInput = Readonly<{
  store: SettingsStore
  accounts: AccountStore
  authConfig: AuthConfig
  adminEmails: readonly string[]
}>

export function createSettingsRouter(input: SettingsRouterInput): Router {
  const router = Router()
  const requireGm = requireRole(input.authConfig, input.accounts, 'gm', 'admin')

  router.get('/settings/health', requireGm, (_req, res) => {
    res.json({
      activeKeys: input.store.countActive(),
      totalKeys: input.store.listKeys().length,
      adminAllowList: input.adminEmails.length > 0,
    })
  })

  router.get('/settings/keys', requireGm, (_req, res) => {
    const records = input.store.listKeys()
    res.json({ keys: records.map(summarize) })
  })

  router.post('/settings/keys', requireGm, (req, res) => {
    const body = req.body as { keys?: unknown }
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
    const inserted = input.store.addKeys(cleaned, 'admin')
    res.json({
      inserted,
      submitted: cleaned.length,
      duplicates: cleaned.length - inserted,
      keys: input.store.listKeys().map(summarize),
    })
  })

  router.delete('/settings/keys/:id', requireGm, (req, res) => {
    const id = Number.parseInt(String(req.params.id ?? ''), 10)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'INVALID_ID' })
      return
    }
    const removed = input.store.deleteKey(id)
    if (!removed) {
      res.status(404).json({ error: 'KEY_NOT_FOUND' })
      return
    }
    res.json({ ok: true, keys: input.store.listKeys().map(summarize) })
  })

  router.post('/settings/keys/reactivate-all', requireGm, (_req, res) => {
    const reactivated = input.store.reactivateAll()
    res.json({ reactivated, keys: input.store.listKeys().map(summarize) })
  })

  // v0.42.0 — OpenCode provider settings + priority ordering. KV table.
  router.get('/settings/providers', requireGm, (_req, res) => {
    res.json({
      openCodeBaseUrl: input.store.getSetting('opencode_base_url'),
      openCodeModel: input.store.getSetting('opencode_model'),
      providerPriority: input.store.getSetting('provider_priority') ?? 'opencode,gemini',
    })
  })

  router.put('/settings/providers', requireGm, (req, res) => {
    const body = req.body as {
      openCodeBaseUrl?: unknown
      openCodeModel?: unknown
      providerPriority?: unknown
    }
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
      openCodeBaseUrl: input.store.getSetting('opencode_base_url'),
      openCodeModel: input.store.getSetting('opencode_model'),
      providerPriority: input.store.getSetting('provider_priority') ?? 'opencode,gemini',
    })
  })

  // v0.65.0 — contract-aligned OpenCode settings (servers textarea, model select).
  // Requires GM/admin role (game server deviation from opencode-settings-ui-contract §1).
  function buildOpenCodeStatus(store: SettingsStore) {
    const servers = getOpenCodeServers(store)
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
      text_model: getOpenCodeModel(store),
      text_model_source: modelFromDb ? 'setting' : process.env.OPENCODE_MODEL ? 'env' : 'default',
    }
  }

  router.get('/settings/opencode', requireGm, (_req, res) => {
    res.json(buildOpenCodeStatus(input.store))
  })

  router.post('/settings/opencode', requireGm, (req, res) => {
    const body = req.body as { servers?: unknown; text_model?: unknown }
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

  router.delete('/settings/opencode', requireGm, (_req, res) => {
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

  router.get('/settings/opencode/models', requireGm, (_req, res) => {
    const servers = getOpenCodeServers(input.store)
    if (servers.length === 0) {
      res.status(400).json({ groups: [], server: null, error: 'No OpenCode servers configured' })
      return
    }
    const serverUrl = servers[0]
    const server = { id: 'server-1', label: 'Server 1', base_url: serverUrl }
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? ''
    const headers: Record<string, string> = password
      ? { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }
      : {}

    const SHOW_PROVIDERS = new Set(['opencode', 'openai', 'github-copilot', 'google', 'anthropic'])

    type ProviderModel = { id?: string; name?: string; cost?: { input?: number } }
    type RawProvider = { id?: string; name?: string; models?: Record<string, ProviderModel> }

    void (async () => {
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), 10_000)
      try {
        const [provRes, authRes] = await Promise.all([
          fetch(`${serverUrl}/provider`, { headers, signal: abort.signal }),
          fetch(`${serverUrl}/provider/auth`, { headers, signal: abort.signal }).catch(() => null),
        ])
        if (!provRes.ok) {
          res.status(502).json({ groups: [], server, error: `OpenCode /provider 回傳 ${provRes.status}` })
          return
        }
        const providerData = (await provRes.json()) as { all?: unknown[]; providers?: unknown[] }
        const authData: Record<string, unknown> = authRes?.ok ? (await authRes.json() as Record<string, unknown>) : {}
        const authedProviders = new Set(Object.keys(authData))

        const providerList = providerData.all ?? providerData.providers ?? []
        const groups: Array<{ provider: string; name: string; authed: boolean; models: Array<{ id: string; name: string; free: boolean }> }> = []
        for (const provider of providerList as RawProvider[]) {
          if (!provider.id || !SHOW_PROVIDERS.has(provider.id)) continue
          const models = Object.values(provider.models ?? {})
          if (models.length === 0) continue
          groups.push({
            provider: provider.id,
            name: provider.name ?? provider.id,
            authed: !authedProviders.has(provider.id),
            models: models.map((m) => ({
              id: `${provider.id}/${m.id ?? ''}`,
              name: m.name ?? m.id ?? '',
              free: m.cost?.input === 0,
            })),
          })
        }
        res.json({ groups, server })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        res.status(502).json({ groups: [], server, error: `OpenCode models fetch failed: ${msg}` })
      } finally {
        clearTimeout(timer)
      }
    })()
  })

  return router
}
