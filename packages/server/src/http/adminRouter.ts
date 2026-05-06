// Admin HTTP router — role management + admin-issued password resets.
// Only admins can list users, promote/demote others, and issue reset
// links on a player's behalf. Admins cannot demote themselves below
// admin while they are the *last* remaining admin (prevents accidental
// lock-out of the GM tooling).

import { Router, type Request, type Response } from 'express'
import { requireRole, toPublicAccount, type AuthConfig } from './auth.js'
import { isAccountRole, type AccountRecord, type AccountStore } from './accounts.js'
import type { PasswordResetStore } from './passwordResets.js'

export type AdminRouterInput = Readonly<{
  accounts: AccountStore
  resets: PasswordResetStore
  authConfig: AuthConfig
}>

export function createAdminRouter(input: AdminRouterInput): Router {
  const router = Router()
  const requireAdmin = requireRole(input.authConfig, input.accounts, 'admin')

  router.get('/admin/users', requireAdmin, (_req: Request, res: Response) => {
    const accounts = input.accounts.listAccounts(500)
    res.json({
      users: accounts.map(toAdminUser),
    })
  })

  router.put('/admin/users/:userId/role', requireAdmin, (req: Request, res: Response) => {
    const me = req.auth!
    const userId = parseUserId(req.params.userId)
    if (userId === null) {
      res.status(400).json({ error: 'INVALID_USER' })
      return
    }
    const body = req.body as { role?: unknown }
    if (!isAccountRole(body?.role)) {
      res.status(400).json({ error: 'INVALID_ROLE', message: 'role must be player, gm, or admin.' })
      return
    }
    const target = input.accounts.findById(userId)
    if (!target) {
      res.status(404).json({ error: 'USER_NOT_FOUND' })
      return
    }
    if (target.id === me.sub && body.role !== 'admin' && input.accounts.countAdmins() <= 1) {
      res.status(409).json({
        error: 'LAST_ADMIN',
        message: 'You are the last admin and cannot demote yourself.',
      })
      return
    }
    if (target.role === 'admin' && body.role !== 'admin' && input.accounts.countAdmins() <= 1) {
      res.status(409).json({
        error: 'LAST_ADMIN',
        message: 'Cannot demote the last admin.',
      })
      return
    }
    const updated = input.accounts.setRole(userId, body.role)
    if (!updated) {
      res.status(404).json({ error: 'USER_NOT_FOUND' })
      return
    }
    res.json({ user: toAdminUser(updated) })
  })

  router.post(
    '/admin/users/:userId/reset-password',
    requireAdmin,
    (req: Request, res: Response) => {
      const userId = parseUserId(req.params.userId)
      if (userId === null) {
        res.status(400).json({ error: 'INVALID_USER' })
        return
      }
      const target = input.accounts.findById(userId)
      if (!target) {
        res.status(404).json({ error: 'USER_NOT_FOUND' })
        return
      }
      const reset = input.resets.create(target.id)
      console.log(
        `[admin] password reset issued for ${target.email} by admin id=${req.auth!.sub}`
      )
      res.json({
        ok: true,
        target: { id: target.id, email: target.email },
        token: reset.token,
        expiresAt: new Date(reset.expiresAt).toISOString(),
        resetPath: `/reset-password?token=${reset.token}`,
      })
    }
  )

  return router
}

function parseUserId(raw: unknown): number | null {
  const id = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

function toAdminUser(account: AccountRecord): {
  id: number
  email: string
  role: AccountRecord['role']
  nickname: string | null
  avatar: string
  displayName: string
  createdAt: string
} {
  const pub = toPublicAccount(account)
  return {
    id: pub.id,
    email: pub.email,
    role: pub.role,
    nickname: pub.nickname,
    avatar: pub.avatar,
    displayName: pub.displayName,
    createdAt: new Date(account.createdAt).toISOString(),
  }
}
