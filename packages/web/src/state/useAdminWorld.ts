import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from './AuthContext'
import { createAdminWorldReader, loadingAdminWorld, type AdminWorldRead } from './adminWorldRead'
export function useAdminWorld() {
  const { client, accountId, account } = useAuth()
  const context = client?.captureSessionContext(), epoch = context?.epoch ?? null, role = account?.role ?? null
  const roleRef = useRef(role); roleRef.current = role
  const enabled = client !== null && accountId !== null && epoch !== null && context?.accountId === accountId && (role === 'gm' || role === 'admin')
  const [stored, setStored] = useState<{ epoch: number | null; accountId: number | null; role: string | null; read: AdminWorldRead }>({ epoch: null, accountId: null, role: null, read: loadingAdminWorld() })
  const readerRef = useRef<ReturnType<typeof createAdminWorldReader> | null>(null)
  useEffect(() => {
    setStored({ epoch, accountId, role, read: loadingAdminWorld() })
    if (!enabled || !client || accountId === null || epoch === null || role !== 'gm' && role !== 'admin') return
    const reader = createAdminWorldReader({ owner: { epoch, accountId, role },
      isCurrent: owner => { const current = client.captureSessionContext(); return current.epoch === owner.epoch && current.accountId === owner.accountId && roleRef.current === owner.role },
      load: api.adminWorld, onChange: read => setStored({ epoch, accountId, role, read }), onForbidden: () => client.resyncSession() })
    readerRef.current = reader; void reader.refresh()
    const timer = window.setInterval(() => { void reader.refresh() }, 15000)
    return () => { window.clearInterval(timer); reader.dispose(); if (readerRef.current === reader) readerRef.current = null }
  }, [enabled, accountId, client, epoch, role])
  const refresh = useCallback(() => readerRef.current?.refresh() ?? Promise.resolve(), [])
  return { read: enabled && stored.epoch === epoch && stored.accountId === accountId && stored.role === role ? stored.read : loadingAdminWorld(), refresh }
}
