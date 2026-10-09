import { Router, type Request, type Response } from 'express'
import { AuthError } from '../identity/authService.js'
import { assertExpectedAccountContext } from '../identity/authRouter.js'
import { accountId } from '../identity/principal.js'
import type { HttpAuthorization, CanonicalRequestClaims } from './authorization.js'
import type { SocialBus, SocialEvent } from './socialBus.js'

export type ManagedSocialSseRouter = Router & { closeStreams(): void }

/** Private per-account hints. The query asserts context; only the cookie authenticates. */
export function createSocialSseRouter(input: {
  bus: SocialBus
  authConfig: HttpAuthorization
  heartbeatMs?: number
}): ManagedSocialSseRouter {
  const router = Router() as ManagedSocialSseRouter
  const heartbeatMs = input.heartbeatMs ?? 25_000
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 10 || heartbeatMs > 60_000) throw new Error('Invalid social heartbeat.')
  const streams = new Set<() => void>()
  let closed = false
  router.closeStreams = () => { closed = true; for (const close of [...streams]) close() }
  router.get('/social/stream', (req: Request, res: Response) => {
    if (closed) { res.status(503).json({ error: 'SERVER_CLOSING' }); return }
    let current: CanonicalRequestClaims
    try {
      const resolved = input.authConfig.resolve(req)
      if (!resolved) throw new AuthError('UNAUTHORIZED')
      assertExpectedAccountContext(typeof req.query.expectedAccountId === 'string' ? req.query.expectedAccountId : undefined, { accountId: accountId(resolved.sub), role: resolved.role })
      current = resolved
    } catch (error) {
      const code = error instanceof AuthError ? error.code : 'INTERNAL_ERROR'
      res.status(code === 'ACCOUNT_CHANGED' ? 409 : code === 'ACCOUNT_CONTEXT_REQUIRED' ? 400 : code === 'ORIGIN_NOT_ALLOWED' ? 403 : code === 'UNAUTHORIZED' ? 401 : 500).json({ error: code })
      return
    }
    const capturedToken = input.authConfig.token(req)
    let ended = false
    let unsubscribe = () => {}
    let unwatch = () => {}
    let heartbeat: ReturnType<typeof setInterval> | undefined
    const cleanup = () => {
      if (ended) return
      ended = true
      if (heartbeat) clearInterval(heartbeat)
      unsubscribe(); unwatch(); streams.delete(cleanup)
      req.off('close', cleanup); req.off('error', cleanup); res.off('error', cleanup)
      res.end()
    }
    const invalidate = () => {
      if (ended) return
      try { res.write('event: session.invalidated\ndata: {"error":"UNAUTHORIZED"}\n\n') } finally { cleanup() }
    }
    const valid = () => {
      const principal = input.authConfig.authService.resolve(capturedToken)
      if (!principal || principal.accountId !== current.sub || principal.role !== current.role) { invalidate(); return false }
      return true
    }
    // A slow client is disconnected, never given an unbounded private-event queue.
    const write = (frame: string) => {
      if (ended || !valid()) return
      if (!res.write(frame)) cleanup()
    }
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()
    streams.add(cleanup)
    req.on('close', cleanup); req.on('error', cleanup); res.on('error', cleanup)
    unsubscribe = input.bus.subscribe(current.sub, (event: SocialEvent) => {
      // Bus targeting is an additional filter, never an authentication boundary.
      if (event.to === current.sub) write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    })
    unwatch = input.authConfig.authService.onRevoked(id => { if (id === current.sub) valid() })
    heartbeat = setInterval(() => write(': keepalive\n\n'), heartbeatMs)
    write(`retry: 5000\n\nevent: hello\ndata: ${JSON.stringify({ userId: current.sub })}\n\n`)
  })
  return router
}
