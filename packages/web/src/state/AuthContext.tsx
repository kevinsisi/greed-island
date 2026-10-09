import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createWorldClient } from '../multiplayer3d/client'
import type { AccountProfile, ConnectionStatus, PlayerWorldSnapshot } from '../multiplayer3d/types'
import type { ServerAccount } from '../api/client'

interface AuthValue {
  account: ServerAccount | null
  accountId: number | null
  profile: AccountProfile | null
  snapshot: PlayerWorldSnapshot | null
  status: ConnectionStatus
  client: ReturnType<typeof createWorldClient> | null
  networkError: string
  setNetworkError: (message: string) => void
  login: (identifier: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  applyAccount: (profile: AccountProfile) => boolean
  sessionRevoked: () => boolean
  loading: boolean
  error: string | null
}
const AuthContext = createContext<AuthValue | null>(null)

/** Sole cookie/profile/player-stream provider for every /game view. No JWT or auth storage. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [snapshot, setSnapshot] = useState<PlayerWorldSnapshot | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [networkError, setNetworkError] = useState('')
  const [client, setClient] = useState<ReturnType<typeof createWorldClient> | null>(null)
  useEffect(() => {
    const connection = createWorldClient({ onProfile: setProfile, onSnapshot: setSnapshot, onStatus: setStatus, onError: setNetworkError })
    setClient(connection)
    const invalidated = () => connection.resyncSession()
    const disconnected = () => { void connection.reconnect() }
    window.addEventListener('greed-session-invalidated', invalidated)
    window.addEventListener('greed-world-connection-invalidated', disconnected)
    void connection.start()
    return () => { window.removeEventListener('greed-session-invalidated', invalidated); window.removeEventListener('greed-world-connection-invalidated', disconnected); connection.dispose(); setClient(null) }
  }, [])
  const login = useCallback(async (identifier: string, password: string) => { await client?.login(identifier, password) }, [client])
  const register = useCallback(async (username: string, password: string) => { await client?.register(username, password) }, [client])
  const logout = useCallback(async () => { await client?.logout() }, [client])
  const refresh = useCallback(async () => { await client?.reconnect() }, [client])
  // Capture the epoch when a view receives its callbacks, before any request awaits.
  // Reading the current context inside a late promise handler would defeat this guard.
  const sessionContext = client?.captureSessionContext()
  const sessionEpoch = sessionContext?.epoch ?? null
  const sessionAccountId = sessionContext?.accountId ?? null
  const applyAccount = useCallback((next: AccountProfile) => {
    return client !== null && sessionEpoch !== null
      ? client.applyProfile(next, { epoch: sessionEpoch, accountId: sessionAccountId }) : false
  }, [client, sessionEpoch, sessionAccountId])
  const sessionRevoked = useCallback(() => {
    return client !== null && sessionEpoch !== null
      ? client.sessionRevoked({ epoch: sessionEpoch, accountId: sessionAccountId }) : false
  }, [client, sessionEpoch, sessionAccountId])
  const value = useMemo<AuthValue>(() => ({
    profile, account: profile ? { ...profile, id: profile.accountId } : null,
    accountId: profile?.accountId ?? null, snapshot, status, client, networkError, setNetworkError,
    login, register, logout, refresh, applyAccount, sessionRevoked,
    loading: status === 'checking' || status === 'connecting', error: networkError || null
  }), [profile, snapshot, status, client, networkError, login, register, logout, refresh, applyAccount, sessionRevoked])
  return <AuthContext.Provider value={value}><Fragment key={profile?.accountId ?? 'guest'}>{children}</Fragment></AuthContext.Provider>
}
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside the sole cookie AuthProvider')
  return value
}
