// Player profile router. Lets the logged-in user inspect and update
// their own profile (nickname, avatar) and rotate their password.
//
// Routes (all require auth):
//   GET    /api/profile               return current profile
//   PATCH  /api/profile               update nickname / avatar
//   POST   /api/profile/password      rotate password (current + new)

import { Router, type Request, type Response, type RequestHandler } from 'express'
import {
  AccountError,
  AVATAR_PRESETS,
  isAvatarPreset,
  type AccountStore,
} from './accounts.js'
import { requireAuth, toPublicAccount, type AuthConfig } from './auth.js'

export type ProfileRouterInput = Readonly<{
  accounts: AccountStore
  authConfig: AuthConfig
}>

export function createProfileRouter(input: ProfileRouterInput): Router {
  const router = Router()
  const authGate = requireAuth(input.authConfig)

  router.get('/profile', authGate, (req: Request, res: Response) => {
    const claims = req.auth!
    const account = input.accounts.findById(claims.sub)
    if (!account) {
      res.status(404).json({ error: 'USER_NOT_FOUND' })
      return
    }
    res.json({
      account: toPublicAccount(account),
      avatarPresets: AVATAR_PRESETS,
    })
  })

  router.patch('/profile', authGate, (req: Request, res: Response) => {
    const claims = req.auth!
    const body = req.body as { nickname?: unknown; avatar?: unknown }
    const patch: { nickname?: string | null; avatar?: string } = {}
    if ('nickname' in (body ?? {})) {
      if (body.nickname === null) {
        patch.nickname = null
      } else if (typeof body.nickname === 'string') {
        patch.nickname = body.nickname
      } else {
        res.status(400).json({ error: 'INVALID_NICKNAME' })
        return
      }
    }
    if ('avatar' in (body ?? {})) {
      if (typeof body.avatar !== 'string' || !isAvatarPreset(body.avatar)) {
        res.status(400).json({
          error: 'INVALID_AVATAR',
          message: `Avatar must be one of: ${AVATAR_PRESETS.join(', ')}.`,
        })
        return
      }
      patch.avatar = body.avatar
    }
    try {
      const updated = input.accounts.updateProfile(claims.sub, patch)
      if (!updated) {
        res.status(404).json({ error: 'USER_NOT_FOUND' })
        return
      }
      res.json({ account: toPublicAccount(updated) })
    } catch (err) {
      if (err instanceof AccountError) {
        res.status(400).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }
  })

  router.post(
    '/profile/password',
    authGate,
    asyncHandler(async (req, res) => {
      const claims = req.auth!
      const body = req.body as { currentPassword?: unknown; newPassword?: unknown }
      if (typeof body?.currentPassword !== 'string' || typeof body?.newPassword !== 'string') {
        res.status(400).json({
          error: 'INVALID_BODY',
          message: 'currentPassword and newPassword are required.',
        })
        return
      }
      const ok = await input.accounts.verifyPasswordById(claims.sub, body.currentPassword)
      if (!ok) {
        res.status(401).json({
          error: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect.',
        })
        return
      }
      try {
        const updated = await input.accounts.updatePassword(claims.sub, body.newPassword)
        if (!updated) {
          res.status(404).json({ error: 'USER_NOT_FOUND' })
          return
        }
        res.json({ ok: true, account: toPublicAccount(updated) })
      } catch (err) {
        if (err instanceof AccountError) {
          res.status(400).json({ error: err.code, message: err.message })
          return
        }
        throw err
      }
    })
  )

  return router
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next)
  }
}
