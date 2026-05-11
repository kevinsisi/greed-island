export const FIXTURE_RECOVERY_RETRY_MS = 2_000

type TimerHandle = ReturnType<typeof globalThis.setTimeout>
type TimerTarget = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>

export function createFixtureRecoveryScheduler({
  hasServerWorld,
  refresh,
  windowTarget,
  retryMs = FIXTURE_RECOVERY_RETRY_MS
}: {
  hasServerWorld: () => boolean
  refresh: () => void
  windowTarget: TimerTarget
  retryMs?: number
}) {
  let retryTimer: TimerHandle | null = null

  const cancel = () => {
    if (retryTimer === null) return
    windowTarget.clearTimeout(retryTimer)
    retryTimer = null
  }

  return {
    schedule() {
      if (hasServerWorld() || retryTimer !== null) return
      retryTimer = windowTarget.setTimeout(() => {
        retryTimer = null
        if (!hasServerWorld()) refresh()
      }, retryMs)
    },
    cancel
  }
}
