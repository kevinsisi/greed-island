import { socialStreamUrl } from '../api/client'
import { withTimeout } from './resilientLoad'

const RETRY_MS = 5_000
const REVALIDATE_TIMEOUT_MS = 6_000
const UPDATE_EVENTS = ['friend.request', 'friend.accepted', 'friend.rejected', 'friend.removed',
  'message.new', 'presence.enter', 'presence.leave', 'alliance.invited'] as const

type Stream = { addEventListener: (type: string, listener: () => void) => void; close: () => void }

/** The query is an owner assertion; only the HttpOnly cookie authenticates. */
export function subscribeSocialStream(input: {
  accountId: number
  refresh: () => void
  clearPrivateState: () => void
  sessionInvalidated: () => void
  revalidateSession: () => Promise<boolean>
  createStream?: (url: string, init: EventSourceInit) => Stream
  sessionEvents?: EventTarget
}) {
  const create = input.createStream ?? ((url, init) => new EventSource(url, init))
  const sessionEvents = input.sessionEvents ?? window
  let source: Stream | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  function close() { source?.close(); source = null; if (retry !== null) clearTimeout(retry); retry = null }
  function stop() { stopped = true; close(); sessionEvents.removeEventListener('greed-session-invalidated', invalidate) }
  function invalidate() { stop(); input.clearPrivateState() }
  function interrupted() {
    close(); input.clearPrivateState()
    if (stopped) return
    retry = setTimeout(async () => {
      retry = null
      let valid = false
      try { valid = await withTimeout(input.revalidateSession(), REVALIDATE_TIMEOUT_MS) } catch { /* Recheck through the sole provider below. */ }
      if (stopped) return
      if (!valid) { invalidate(); input.sessionInvalidated(); return }
      connect()
    }, RETRY_MS)
  }
  function connect() {
    if (stopped) return
    try {
      const current = create(socialStreamUrl(input.accountId), { withCredentials: true })
      source = current
      const active = () => !stopped && source === current
      for (const name of ['open', ...UPDATE_EVENTS]) {
        current.addEventListener(name, () => { if (active()) input.refresh() })
      }
      current.addEventListener('session.invalidated', () => {
        if (!active()) return
        invalidate(); input.sessionInvalidated()
      })
      current.addEventListener('error', () => {
        if (!active()) return
        interrupted()
      })
    } catch { interrupted() }
  }
  sessionEvents.addEventListener('greed-session-invalidated', invalidate)
  connect()
  return stop
}
