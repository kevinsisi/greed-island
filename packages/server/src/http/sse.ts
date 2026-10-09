// Public narrative transport uses exactly the same privacy projections as REST.
import { Router, type Response } from 'express'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import { publicNarrativeEvent, publicWorldSnapshot, readPublicNarratives } from './publicReadModels.js'
export type ManagedPublicSseRouter = Router & { closeStreams(): void }
const MAX_STREAMS = 200, MAX_FRAME_BYTES = 128 * 1024
export function createSseRouter(runtime: SimulationRuntime, eventStore: SqliteEventStore, heartbeatMs = 25000): ManagedPublicSseRouter {
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 10 || heartbeatMs > 60000) throw new Error('Invalid public heartbeat')
  const router = Router() as ManagedPublicSseRouter, streams = new Set<() => void>()
  let closed = false
  router.closeStreams = () => { if (closed) return; closed = true; for (const cleanup of [...streams]) cleanup() }
  router.get(['/events/stream','/stream'], (req, res: Response) => {
    if (closed) { res.status(503).json({ error: 'SERVER_CLOSING' }); return }
    if (streams.size >= MAX_STREAMS) { res.status(429).json({ error: 'STREAM_LIMIT' }); return }
    let ended = false, unsubscribeEvents = () => {}, unsubscribeTicks = () => {}
    let heartbeat: ReturnType<typeof setInterval> | undefined
    const cleanup = () => {
      if (ended) return; ended = true
      if (heartbeat) clearInterval(heartbeat)
      unsubscribeEvents(); unsubscribeTicks(); streams.delete(cleanup)
      req.off('close', cleanup); req.off('error', cleanup); res.off('error', cleanup)
      res.end()
    }
    const send = (name: string, payload: unknown) => {
      if (ended) return
      const frame = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`
      if (Buffer.byteLength(frame, 'utf8') > MAX_FRAME_BYTES || !res.write(frame)) cleanup()
    }
    res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache, no-transform')
    res.setHeader('Connection','keep-alive'); res.setHeader('X-Accel-Buffering','no'); res.flushHeaders?.()
    streams.add(cleanup); req.on('close', cleanup); req.on('error', cleanup); res.on('error', cleanup)
    unsubscribeEvents = runtime.subscribe(event => { const dto = publicNarrativeEvent(event, runtime); if (dto) send('event', dto) })
    unsubscribeTicks = runtime.subscribeTick(() => send('snapshot', publicWorldSnapshot(runtime)))
    heartbeat = setInterval(() => { if (!ended && !res.write(': keepalive\n\n')) cleanup() }, heartbeatMs)
    if (!res.write('retry: 5000\n\n')) { cleanup(); return }
    send('snapshot', publicWorldSnapshot(runtime))
    for (const event of readPublicNarratives(eventStore, runtime, 100).slice().reverse()) send('event', event)
  })
  return router
}
