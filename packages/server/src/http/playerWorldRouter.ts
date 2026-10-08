import { Router, json, type Request, type Response } from 'express'
import type { AccountId, Principal } from '../identity/principal.js'
import type { AuthService } from '../identity/authService.js'
import type { PlayerWorldSnapshot } from '../playerWorld/snapshot.js'
import { PlayerWorldError, type PlayerWorldAck, type PlayerWorldAuthorize } from '../playerWorld/types.js'

const HEARTBEAT_MS = 5000
const MAX_COMMAND_BODY_BYTES = 4 * 1024
const MAX_STREAMS_PER_ACCOUNT = 4
const MAX_WORLD_STREAMS = 200
const MAX_SNAPSHOT_BYTES = 128 * 1024
const MAX_DRAIN_WAIT_MS = 5000
export interface PlayerWorldTransportRuntime {
  getPlayerWorldSnapshot(id: AccountId): PlayerWorldSnapshot
  submitPlayerWorldCommand(id: AccountId, body: unknown, authorize?: PlayerWorldAuthorize): Promise<PlayerWorldAck>
  subscribePlayerWorld(id: AccountId, listener: (snapshot: PlayerWorldSnapshot) => void): () => void
}
export type PlayerWorldAuth = Pick<AuthService, 'resolve' | 'requireMutation' | 'assertOrigin' | 'onRevoked'>
export type ManagedPlayerWorldRouter = Router & { closeStreams(): void }
type Stream = { token: string; principal: Principal; close: () => void }

/** One AuthService and one canonical runtime are injected by the composition root. */
export function createPlayerWorldRouter(input: {
  runtime: PlayerWorldTransportRuntime
  authService: PlayerWorldAuth
  sessionTokenFromCookie: (header: string | undefined) => string | null
  heartbeatMs?: number
}): ManagedPlayerWorldRouter {
  const router = Router() as ManagedPlayerWorldRouter
  const streams = new Map<AccountId, Set<Stream>>()
  const heartbeatMs = input.heartbeatMs ?? HEARTBEAT_MS
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 1 || heartbeatMs > 30_000) throw new Error('Invalid world heartbeat cadence.')
  let closed = false
  const unsubscribeRevoked = input.authService.onRevoked(id => {
    for (const stream of [...(streams.get(id as AccountId) ?? [])]) {
      // Logout may revoke one token while another session for this account remains valid.
      try { if (input.authService.resolve(stream.token)?.accountId !== stream.principal.accountId) stream.close() }
      catch { stream.close() }
    }
  })
  router.closeStreams = () => {
    if (closed) return; closed = true; unsubscribeRevoked()
    for (const set of [...streams.values()]) for (const stream of [...set]) stream.close()
  }
  router.use('/world', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.vary('Cookie'); res.vary('Origin')
    if (closed) { res.status(503).json({ error: 'WORLD_TRANSPORT_STOPPED' }); return }
    if (req.get('sec-fetch-site') === 'cross-site') { res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' }); return }
    const declaredLength = req.get('content-length')
    if (declaredLength && Number(declaredLength) > MAX_COMMAND_BODY_BYTES) { res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return }
    try { const origin = req.get('origin'); if (origin) input.authService.assertOrigin(origin); next() }
    catch (error) { sendError(res, error) }
  })
  router.use('/world', json({ limit: MAX_COMMAND_BODY_BYTES, strict: true }))
  router.use('/world', (req, res, next) => {
    // A broader parent parser may already have consumed the stream. Enforce the domain bound too.
    if (req.body !== undefined && Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_COMMAND_BODY_BYTES) {
      res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return
    }
    next()
  })

  function resolve(req: Request): { principal: Principal; token: string } {
    const token = input.sessionTokenFromCookie(req.headers.cookie), principal = input.authService.resolve(token)
    if (!token || !principal) throw new PlayerWorldError(401, 'UNAUTHORIZED', 'A live canonical session is required.')
    return { principal, token }
  }
  router.get('/world/snapshot', (req, res) => {
    try { const { principal } = resolve(req); res.json(input.runtime.getPlayerWorldSnapshot(principal.accountId)) }
    catch (error) { sendError(res, error) }
  })
  router.post('/world/command', (req, res) => {
    try {
      const token = input.sessionTokenFromCookie(req.headers.cookie), origin = req.get('origin')
      const principal = input.authService.requireMutation(token, origin)
      const expected = req.get('X-Greed-Account-Id')
      if (!expected || !/^[1-9][0-9]*$/.test(expected) || !Number.isSafeInteger(Number(expected))) {
        throw new PlayerWorldError(400, 'ACCOUNT_CONTEXT_REQUIRED', 'A canonical expected-account assertion is required.')
      }
      const expectedAccountId = Number(expected)
      const assertSameAccount = (current: Principal) => {
        if (current.accountId !== expectedAccountId) throw new PlayerWorldError(409, 'ACCOUNT_CHANGED', 'The signed-in account changed in another tab.')
      }
      assertSameAccount(principal)
      const authorize = () => {
        const current = input.authService.requireMutation(token, origin)
        assertSameAccount(current)
        if (current.accountId !== principal.accountId) throw new PlayerWorldError(401, 'UNAUTHORIZED', 'Queued principal no longer matches the canonical session.')
      }
      // The authorizer is trusted server context, never part of the client payload/digest.
      input.runtime.submitPlayerWorldCommand(principal.accountId, req.body, authorize)
        .then(ack => { if (!res.destroyed && !res.writableEnded) res.json(ack) })
        .catch(error => { if (!res.destroyed && !res.writableEnded) sendError(res, error) })
    } catch (error) { sendError(res, error) }
  })
  router.get('/world/stream', (req, res) => {
    let cleanup: ((end?: boolean) => void) | undefined
    try {
      const { principal, token } = resolve(req)
      // Fail WORLD_ENTRY_REQUIRED before headers or presence allocation.
      input.runtime.getPlayerWorldSnapshot(principal.accountId)
      const accountStreams = streams.get(principal.accountId) ?? new Set<Stream>()
      const total = [...streams.values()].reduce((count, set) => count + set.size, 0)
      if (accountStreams.size >= MAX_STREAMS_PER_ACCOUNT || total >= MAX_WORLD_STREAMS) {
        throw new PlayerWorldError(429, 'STREAM_LIMIT', 'Canonical world stream limit reached.')
      }
      let unsubscribe: (() => void) | undefined, heartbeat: ReturnType<typeof setInterval> | undefined, active = true
      let blocked = false, latest: PlayerWorldSnapshot | undefined, drainTimeout: ReturnType<typeof setTimeout> | undefined
      const drain = () => {
        if (drainTimeout) clearTimeout(drainTimeout); drainTimeout = undefined; blocked = false
        const pending = latest; latest = undefined; if (pending) send(pending)
      }
      const stream: Stream = { token, principal, close: () => cleanup?.() }
      cleanup = (end = true) => {
        if (!active) return; active = false
        if (heartbeat) clearInterval(heartbeat)
        if (drainTimeout) clearTimeout(drainTimeout)
        latest = undefined; res.removeListener('drain', drain)
        unsubscribe?.(); accountStreams.delete(stream)
        if (!accountStreams.size) streams.delete(principal.accountId)
        req.removeListener('aborted', cleanup!); req.removeListener('error', cleanup!)
        res.removeListener('close', cleanup!); res.removeListener('error', cleanup!)
        if (end !== false) try { res.end() } catch { /* already closed */ }
      }
      const sessionIsLive = () => {
        if (!active || res.destroyed || res.writableEnded) { cleanup?.(); return false }
        try { if (input.authService.resolve(token)?.accountId === principal.accountId) return true }
        catch { /* unavailable identity source fails closed */ }
        cleanup?.(); return false
      }
      const send = (snapshot: PlayerWorldSnapshot) => {
        if (!sessionIsLive()) return
        if (blocked) { latest = snapshot; return }
        const encoded = JSON.stringify(snapshot)
        if (Buffer.byteLength(encoded, 'utf8') > MAX_SNAPSHOT_BYTES) { cleanup?.(); return }
        // Retain at most one newest snapshot while Node drains this bounded frame.
        if (!res.write(`id: ${snapshot.revision}\nevent: snapshot\ndata: ${encoded}\n\n`)) {
          blocked = true; res.once('drain', drain)
          drainTimeout = setTimeout(() => cleanup?.(), MAX_DRAIN_WAIT_MS)
        }
      }
      unsubscribe = input.runtime.subscribePlayerWorld(principal.accountId, send)
      accountStreams.add(stream); streams.set(principal.accountId, accountStreams)
      const initial = input.runtime.getPlayerWorldSnapshot(principal.accountId)
      req.on('aborted', cleanup); req.on('error', cleanup); res.on('close', cleanup); res.on('error', cleanup)
      res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders()
      send(initial)
      if (active) heartbeat = setInterval(() => { if (sessionIsLive() && !blocked && !res.write(': keepalive\n\n')) {
        blocked = true; res.once('drain', drain); drainTimeout = setTimeout(() => cleanup?.(), MAX_DRAIN_WAIT_MS)
      } }, heartbeatMs)
    } catch (error) { cleanup?.(false); if (!res.headersSent && !res.writableEnded) sendError(res, error) }
  })
  router.use((error: unknown, _req: Request, res: Response, _next: import('express').NextFunction) => sendError(res, error))
  return router
}
function sendError(res: Response, error: unknown): void {
  if (res.headersSent) { res.end(); return }
  if (error instanceof PlayerWorldError) { res.status(error.status).json({ error: error.code, message: error.message }); return }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'UNAUTHORIZED') { res.status(401).json({ error: code }); return }
  if (code === 'ORIGIN_NOT_ALLOWED' || code === 'FORBIDDEN') { res.status(403).json({ error: code }); return }
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0
  if (status === 413) { res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' }); return }
  if (error instanceof SyntaxError && status === 400) { res.status(400).json({ error: 'INVALID_JSON' }); return }
  console.error('[player-world] transport error', error)
  res.status(500).json({ error: 'WORLD_ERROR' })
}
