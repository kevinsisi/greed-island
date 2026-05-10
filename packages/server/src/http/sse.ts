// Server-Sent Events stream — pushes narrative events to subscribed
// clients as the simulation runtime emits them.

import { Router, type Request, type Response } from 'express'
import type { NarrativeEvent, SimulationRuntime } from '../sim/runtime.js'

const KEEPALIVE_INTERVAL_MS = 25_000

export function createSseRouter(runtime: SimulationRuntime): Router {
  const router = Router()

  router.get('/events/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    res.write(`retry: 5000\n\n`)
    sendEvent(res, 'snapshot', runtime.getSnapshot())
    for (const event of runtime.getRecentEvents(20).slice().reverse()) {
      sendEvent(res, 'event', event)
    }

    const unsubscribeEvents = runtime.subscribe((event: NarrativeEvent) => {
      sendEvent(res, 'event', event)
    })
    const unsubscribeTicks = runtime.subscribeTick(() => {
      sendEvent(res, 'snapshot', runtime.getSnapshot())
    })

    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n')
    }, KEEPALIVE_INTERVAL_MS)

    const cleanup = () => {
      clearInterval(keepalive)
      unsubscribeEvents()
      unsubscribeTicks()
      try {
        res.end()
      } catch {
        // socket may already be closed
      }
    }

    req.on('close', cleanup)
    req.on('error', cleanup)
  })

  return router
}

function sendEvent(res: Response, name: string, payload: unknown): void {
  res.write(`event: ${name}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}
