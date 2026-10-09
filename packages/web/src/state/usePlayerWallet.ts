import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from './AuthContext'
import { createWalletReader, loadingWallet, type WalletReadState } from './walletRead'

export function usePlayerWallet(accountId: number | null) {
  const { client } = useAuth()
  const context = client?.captureSessionContext()
  const epoch = context?.epoch ?? null
  const [stored, setStored] = useState<{ epoch: number | null; accountId: number | null; read: WalletReadState }>({ epoch: null, accountId: null, read: loadingWallet() })
  const readerRef = useRef<ReturnType<typeof createWalletReader> | null>(null)
  useEffect(() => {
    setStored({ epoch, accountId, read: loadingWallet() })
    if (!client || accountId === null || epoch === null) return
    const reader = createWalletReader({ owner: { epoch, accountId },
      isCurrent: owner => { const current = client.captureSessionContext(); return current.epoch === owner.epoch && current.accountId === owner.accountId },
      load: api.wallet, onChange: read => setStored({ epoch, accountId, read }) })
    readerRef.current = reader
    void reader.refresh()
    const timer = window.setInterval(() => { void reader.refresh() }, 15000)
    return () => { window.clearInterval(timer); reader.dispose(); if (readerRef.current === reader) readerRef.current = null }
  }, [accountId, client, epoch])
  const refresh = useCallback(() => readerRef.current?.refresh() ?? Promise.resolve(), [])
  return { read: stored.epoch === epoch && stored.accountId === accountId ? stored.read : loadingWallet(), refresh }
}
