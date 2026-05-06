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

  return router
}
