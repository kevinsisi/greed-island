import { describe, expect, it, vi } from 'vitest'
import { installMobileRefreshTriggers } from './mobileRefreshTriggers'

describe('installMobileRefreshTriggers', () => {
  it('refreshes on online and pageshow events', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const refresh = vi.fn()

    installMobileRefreshTriggers({
      windowTarget,
      documentTarget,
      getVisibilityState: () => 'visible',
      refresh
    })

    windowTarget.dispatchEvent(new Event('online'))
    windowTarget.dispatchEvent(new Event('pageshow'))

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('refreshes only when returning to visible state', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const refresh = vi.fn()
    let visibilityState = 'hidden'

    installMobileRefreshTriggers({
      windowTarget,
      documentTarget,
      getVisibilityState: () => visibilityState,
      refresh
    })

    documentTarget.dispatchEvent(new Event('visibilitychange'))
    visibilityState = 'visible'
    documentTarget.dispatchEvent(new Event('visibilitychange'))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('removes listeners on cleanup', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const refresh = vi.fn()
    const cleanup = installMobileRefreshTriggers({
      windowTarget,
      documentTarget,
      getVisibilityState: () => 'visible',
      refresh
    })

    cleanup()
    windowTarget.dispatchEvent(new Event('online'))
    windowTarget.dispatchEvent(new Event('pageshow'))
    documentTarget.dispatchEvent(new Event('visibilitychange'))

    expect(refresh).not.toHaveBeenCalled()
  })
})
