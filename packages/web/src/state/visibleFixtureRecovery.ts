export const VISIBLE_FIXTURE_RECOVERY_MS = 2_000

type TimerHandle = ReturnType<typeof globalThis.setInterval>
type TimerTarget = Pick<typeof globalThis, 'setInterval' | 'clearInterval'>
type WorldSource = 'fixture' | 'server'

export function startFixtureSourceRecovery({
  source,
  refreshWorld,
  windowTarget,
  retryMs = VISIBLE_FIXTURE_RECOVERY_MS
}: {
  source: WorldSource
  refreshWorld: () => Promise<void>
  windowTarget: TimerTarget
  retryMs?: number
}): (() => void) | undefined {
  if (source !== 'fixture') return undefined
  return startVisibleFixtureRecovery({ refreshWorld, windowTarget, retryMs })
}

export function startVisibleFixtureRecovery({
  refreshWorld,
  windowTarget,
  retryMs = VISIBLE_FIXTURE_RECOVERY_MS
}: {
  refreshWorld: () => Promise<void>
  windowTarget: TimerTarget
  retryMs?: number
}): () => void {
  const recover = () => {
    void refreshWorld().catch(() => {
      // The fixture badge already communicates degraded state; retry quietly.
    })
  }

  recover()
  const timer: TimerHandle = windowTarget.setInterval(recover, retryMs)
  return () => windowTarget.clearInterval(timer)
}
