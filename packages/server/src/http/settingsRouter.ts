// Settings HTTP router. Provides admin-only access to the API key
// pool used by the AI NPC dialog.
//
// Endpoints (all require auth + admin email allow-list):
//   GET    /api/settings/keys           list keys (fingerprints only)
//   POST   /api/settings/keys           batch insert keys (text body)
//   DELETE /api/settings/keys/:id       remove a key
//   POST   /api/settings/keys/reactivate-all   re-enable disabled keys
//   GET    /api/settings/health         summary for the Settings page
//
// Whether a user counts as admin is controlled by the
// GREED_ISLAND_ADMIN_EMAILS env var (comma-separated). If unset, the
// first registered account is treated as the admin (so a fresh deploy
// is usable without extra config).

import { Router, type Request, type Response } from 'express'
import {
  parseKeyList,
  summarize,
  type SettingsStore,
} from './settings.js'
import { requireAuth, type AuthConfig } from './auth.js'
import type { AccountStore } from './accounts.js'

export type SettingsRouterInput = Readonly<{
  store: SettingsStore
  accounts: AccountStore
  authConfig: AuthConfig
  adminEmails: readonly string[]
}>

export function createSettingsRouter(input: SettingsRouterInput): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)
  const adminSet = new Set(input.adminEmails.map((e) => e.toLowerCase()))

  const ensureAdmin = (req: Request, res: Response): boolean => {
    const claims = req.auth
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return false
    }
    const email = (claims.email ?? '').toLowerCase()
    if (adminSet.size > 0) {
      if (!adminSet.has(email)) {
        res.status(403).json({ error: 'FORBIDDEN', message: '需要管理員權限。' })
        return false
      }
      return true
    }
    // No explicit allow-list: treat the first-registered account as admin.
    if (input.accounts.countAccounts() === 0) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return false
    }
    const first = input.accounts.findById(claims.sub)
    if (first === null) {
      res.status(403).json({ error: 'FORBIDDEN' })
      return false
    }
    if (first.id !== input.accounts.firstAccountId()) {
      res.status(403).json({ error: 'FORBIDDEN', message: '只有第一位註冊的帳號可管理金鑰。' })
      return false
    }
    return true
  }

  router.get('/settings/health', auth, (req, res) => {
    if (!ensureAdmin(req, res)) return
    res.json({
      activeKeys: input.store.countActive(),
      totalKeys: input.store.listKeys().length,
      adminAllowList: input.adminEmails.length > 0,
    })
  })

  router.get('/settings/keys', auth, (req, res) => {
    if (!ensureAdmin(req, res)) return
    const records = input.store.listKeys()
    res.json({ keys: records.map(summarize) })
  })

  router.post('/settings/keys', auth, (req, res) => {
    if (!ensureAdmin(req, res)) return
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

  router.delete('/settings/keys/:id', auth, (req, res) => {
    if (!ensureAdmin(req, res)) return
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

  router.post('/settings/keys/reactivate-all', auth, (req, res) => {
    if (!ensureAdmin(req, res)) return
    const reactivated = input.store.reactivateAll()
    res.json({ reactivated, keys: input.store.listKeys().map(summarize) })
  })

  return router
}
