import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'

const Prototype3DPage = lazy(() => import('./prototype3d/Prototype3DPage'))
const Multiplayer3DPage = lazy(() => import('./multiplayer3d/Multiplayer3DPage'))
const OriginalApp = lazy(() => import('./OriginalApp'))

export function App() {
  const { pathname } = useLocation()
  const prototype = pathname === '/prototype-3d' || pathname === '/prototype-3d/'
  const multiplayer = pathname === '/multiplayer-3d' || pathname === '/multiplayer-3d/'
  // The prototype does not load or mount production account/world providers.
  return <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#183733', color: '#eee5ca', display: 'grid', placeItems: 'center', letterSpacing: 3 }}>{prototype ? '正在準備潮汐遠征…' : '正在載入貪婪之島…'}</div>}>
    {prototype ? <Prototype3DPage /> : multiplayer ? <Multiplayer3DPage /> : <OriginalApp />}
  </Suspense>
}
