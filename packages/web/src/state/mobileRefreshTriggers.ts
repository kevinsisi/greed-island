type RefreshTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

export function installMobileRefreshTriggers(input: {
  windowTarget: RefreshTarget
  documentTarget: RefreshTarget
  getVisibilityState: () => string
  refresh: () => void
}): () => void {
  const refreshListener: EventListener = () => {
    input.refresh()
  }
  const visibilityListener: EventListener = () => {
    if (input.getVisibilityState() === 'visible') input.refresh()
  }

  input.windowTarget.addEventListener('online', refreshListener)
  input.windowTarget.addEventListener('pageshow', refreshListener)
  input.documentTarget.addEventListener('visibilitychange', visibilityListener)

  return () => {
    input.windowTarget.removeEventListener('online', refreshListener)
    input.windowTarget.removeEventListener('pageshow', refreshListener)
    input.documentTarget.removeEventListener('visibilitychange', visibilityListener)
  }
}
