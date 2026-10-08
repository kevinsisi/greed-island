import type { NextFunction, Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminRouter } from './adminRouter.js'
import type { AccountRecord, AccountStore } from './accounts.js'
import type { PasswordResetStore } from './passwordResets.js'

type CapturedResponse = {
  statusCode: number
  body: unknown
  status: (status: number) => CapturedResponse
  json: (body: unknown) => CapturedResponse
}

type RouterWithStack = {
  stack: Array<{
    route?: {
      path: string
      stack: Array<{ handle: RequestHandler }>
    }
  }>
}

function getHandlers(router: unknown, path: string): RequestHandler[] {
  const route = (router as RouterWithStack).stack.find(
    (layer) => layer.route?.path === path
  )?.route
  if (!route) throw new Error(`Route not found: ${path}`)
  return route.stack.map((layer) => layer.handle)
}

function createResponse(): CapturedResponse {
  const response: CapturedResponse = {
    statusCode: 200,
    body: undefined,
    status(status) {
      response.statusCode = status
      return response
    },
    json(body) {
      response.body = body
      return response
    },
  }
  return response
}

describe('POST /api/admin/users/:userId/reset-password', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps reset issuance admin-only and retains the existing admin flow', () => {
    const player: AccountRecord = {
      id: 7,
      email: 'player@example.com',
      passwordHash: 'test-only-hash',
      createdAt: 1,
      role: 'player',
      nickname: null,
      avatar: 'wanderer',
    }
    const admin: AccountRecord = {
      id: 1,
      email: 'admin@example.com',
      passwordHash: 'test-only-hash',
      createdAt: 1,
      role: 'admin',
      nickname: null,
      avatar: 'wanderer',
    }
    const accountsById = new Map([
      [player.id, player],
      [admin.id, admin],
    ])
    const accounts = {
      findById: vi.fn((id: number) => accountsById.get(id) ?? null),
    } as unknown as AccountStore
    const resetCreate = vi.fn((accountId: number) => ({
      id: 1,
      accountId,
      token: 'synthetic-test-only-admin-reset-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      usedAt: null,
      createdAt: Date.now(),
    }))
    const resets = { create: resetCreate } as unknown as PasswordResetStore
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const secret = 'test-only-secret'
    const handlers = getHandlers(
      createAdminRouter({
        accounts,
        resets,
        authConfig: { jwtSecret: secret, jwtExpiresIn: '1h' },
      }),
      '/admin/users/:userId/reset-password'
    )
    const requireAdmin = handlers[0]
    const issueReset = handlers[1]
    if (!requireAdmin || !issueReset) throw new Error('Admin reset route is incomplete.')

    const invoke = (token: string) => {
      const response = createResponse()
      const request = {
        params: { userId: String(player.id) },
        body: {},
        header: (name: string) =>
          name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
      } as unknown as Request
      const next: NextFunction = () => {
        issueReset(request, response as unknown as Response, vi.fn())
      }
      requireAdmin(request, response as unknown as Response, next)
      return response
    }
    const playerToken = jwt.sign(
      { sub: player.id, email: player.email, role: player.role },
      secret,
      { expiresIn: '1h' }
    )
    const adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      secret,
      { expiresIn: '1h' }
    )

    const denied = invoke(playerToken)
    expect(denied.statusCode).toBe(403)
    expect(resetCreate).not.toHaveBeenCalled()

    const allowed = invoke(adminToken)
    expect(allowed.statusCode).toBe(200)
    expect(allowed.body).toMatchObject({
      ok: true,
      target: { id: player.id, email: player.email },
      token: 'synthetic-test-only-admin-reset-token',
      resetPath: '/reset-password?token=synthetic-test-only-admin-reset-token',
    })
    expect(resetCreate).toHaveBeenCalledWith(player.id)
    expect(log).toHaveBeenCalledTimes(1)
  })
})
