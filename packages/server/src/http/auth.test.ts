import type { Request, RequestHandler, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthRouter } from './auth.js'
import type { AccountStore } from './accounts.js'
import type { PasswordResetStore } from './passwordResets.js'

const RECOVERY_MESSAGE =
  'If an account exists for this email, contact a game administrator directly to reset your password. This request does not send email or notify the administrator.'

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

describe('POST /api/auth/forgot-password', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the same generic response for registered and unknown emails without side effects', () => {
    const account = {
      id: 7,
      email: 'registered@example.com',
      createdAt: 1,
      role: 'player',
      nickname: null,
      avatar: 'wanderer',
    }
    const findByEmail = vi.fn((email: string) =>
      email === account.email ? account : null
    )
    const accounts = { findByEmail } as unknown as AccountStore
    const resetCreate = vi.fn(() => ({
      id: 1,
      accountId: account.id,
      token: 'synthetic-test-only-reset-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      usedAt: null,
      createdAt: Date.now(),
    }))
    const resets = { create: resetCreate } as unknown as PasswordResetStore
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handlers = getHandlers(
      createAuthRouter(accounts, resets, {
        jwtSecret: 'test-only-secret',
        jwtExpiresIn: '1h',
      }),
      '/forgot-password'
    )
    const handler = handlers[0]
    if (!handler) throw new Error('Forgot-password handler is missing.')

    const request = (email: string) => {
      const response = createResponse()
      handler(
        { body: { email } } as unknown as Request,
        response as unknown as Response,
        vi.fn()
      )
      return response
    }

    const registered = request('registered@example.com')
    const unknown = request('unknown@example.com')
    const registeredResponse = {
      statusCode: registered.statusCode,
      body: registered.body,
    }

    expect(registeredResponse).toEqual({
      statusCode: 200,
      body: { ok: true, message: RECOVERY_MESSAGE },
    })
    expect({ statusCode: unknown.statusCode, body: unknown.body }).toEqual(
      registeredResponse
    )
    expect(findByEmail).not.toHaveBeenCalled()
    expect(resetCreate).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })
})
