// Admin HTTP router — role management. Only admins can list users and
// promote/demote others. Admins cannot demote themselves below admin
// while they are the *last* remaining admin (prevents accidental
// lock-out of the GM tooling).

import { Router, type Request, type Response } from 'express'
import { requireRole, type AuthConfig } from './auth.js'
import { isAccountRole, type AccountStore } from './accounts.js'

export type AdminRouterInput = Readonly<{
  accounts: AccountStore
  authConfig: AuthConfig
}>

export function createAdminRouter(input: AdminRouterInput): Router {
  const router = Router()
  const requireAdmin = requireRole(input.authConfig, input.accounts, 'admin')

  router.get('/admin/users', requireAdmin, (_req: Request, res: Response) => {
    const accounts = input.accounts.listAccounts(500)
    res.json({
      users: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        role: a.role,
        createdAt: new Date(a.createdAt).toISOString(),
      })),
    })
  })

  router.put('/admin/users/:userId/role', requireAdmin, (req: Request, res: Response) => {
    const me = req.auth!
    const userId = Number.parseInt(String(req.params.userId ?? ''), 10)
    if (!Number.isFinite(userId) || userId <= 0) {
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
    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        createdAt: new Date(updated.createdAt).toISOString(),
      },
    })
  })

  return router
}
