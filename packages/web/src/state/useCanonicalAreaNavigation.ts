import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { canonicalAreaDestination } from './canonicalArea'
import { findNavigationPath, moveIntentToward, type NavigationPoint } from '../multiplayer3d/navigation'

/** Detailed area maps submit bounded intents using the same admitted client/authoritative snapshot. */
export function useCanonicalAreaNavigation(tileId: string, report: (message: string) => void) {
  const { snapshot, client, status } = useAuth()
  const latest = useRef({ snapshot, client, status, tileId, report })
  latest.current = { snapshot, client, status, tileId, report }
  const route = useRef<NavigationPoint[]>([])
  const routeTile = useRef<string | null>(null)
  const routeGeometry = useRef<string | null>(null)
  const cancel = useCallback(() => { route.current = []; routeTile.current = null; routeGeometry.current = null; void latest.current.client?.move(0, 0) }, [])
  useEffect(() => {
    if (status !== 'online' || snapshot?.tileId !== tileId) cancel()
  }, [status, snapshot?.tileId, tileId, cancel])
  useEffect(() => {
    const tick = setInterval(() => {
      const current = latest.current
      const state = current.snapshot
      if (current.status !== 'online' || !state || state.tileId !== current.tileId || state.tileId !== routeTile.current) { cancel(); return }
      if (routeGeometry.current !== JSON.stringify(state.geometry)) { if (routeTile.current !== null) current.report('區域地圖已更新，請重新設定目的地。'); cancel(); return }
      const self = state.players.find(p => p.accountId === state.selfId)
      if (!self) { cancel(); return }
      while (route.current[0] && Math.hypot(route.current[0].x - self.x, route.current[0].z - self.z) < .015) route.current.shift()
      const target = route.current[0]
      if (!target) { if (routeTile.current !== null) current.report('已依伺服器位置抵達目的地。'); cancel(); return }
      const intent = moveIntentToward(self, target, state.geometry.movePerStep)
      if (intent) void current.client?.move(intent.x, intent.z)
    }, 100)
    const focus = (event: FocusEvent) => { if (event.target instanceof Element && event.target.closest('input,textarea,select,button,[contenteditable="true"]')) cancel() }
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', cancel); document.addEventListener('focusin', focus)
    return () => { clearInterval(tick); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); document.removeEventListener('focusin', focus); cancel() }
  }, [cancel])
  return useCallback((col: number, row: number) => {
    cancel()
    const current = latest.current, state = current.snapshot
    if (current.status !== 'online' || !state || state.tileId !== current.tileId) { current.report('請先在共同世界前往這個區域。'); return }
    const self = state.players.find(p => p.accountId === state.selfId), destination = canonicalAreaDestination(state, col, row)
    if (!self || !destination) return
    const path = findNavigationPath(self, destination, { ...state.geometry, movePerTick: state.geometry.movePerStep })
    if (!path) { current.report('這個位置無法安全抵達。'); return }
    route.current = path; routeTile.current = state.tileId; routeGeometry.current = JSON.stringify(state.geometry)
    current.report(path.length ? '正在依伺服器位置前往目的地。' : '你已在這個位置。')
  }, [cancel])
}
