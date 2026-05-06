import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, type ServerAccount } from '../api/client'

const STORAGE_KEY = 'gi.auth.token'

type AuthState = Readonly<{
  token: string | null
  account: ServerAccount | null
}>

interface AuthValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
  applyAccount: (account: ServerAccount, token?: string) => void
  loading: boolean
  error: string | null
}

const AuthContext = createContext<AuthValue | null>(null)

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

function writeStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token === null) {
    window.localStorage.removeItem(STORAGE_KEY)
  } else {
    window.localStorage.setItem(STORAGE_KEY, token)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    token: readStoredToken(),
    account: null
  }))
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = state.token
    if (!token) return
    let cancelled = false
    api
      .me(token)
      .then((res) => {
        if (!cancelled) setState({ token, account: res.account })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          writeStoredToken(null)
          setState({ token: null, account: null })
        }
      })
    return () => {
      cancelled = true
    }
    // we only want to validate on mount or when the token identity changes
  }, [state.token])

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.login(email, password)
      writeStoredToken(res.token)
      setState({ token: res.token, account: res.account })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.register(email, password)
      writeStoredToken(res.token)
      setState({ token: res.token, account: res.account })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    writeStoredToken(null)
    setState({ token: null, account: null })
    setError(null)
  }, [])

  const refresh = useCallback(async () => {
    const token = state.token
    if (!token) return
    try {
      const res = await api.me(token)
      setState({ token, account: res.account })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        writeStoredToken(null)
        setState({ token: null, account: null })
      }
    }
  }, [state.token])

  const applyAccount = useCallback((account: ServerAccount, token?: string) => {
    if (token) {
      writeStoredToken(token)
      setState({ token, account })
      return
    }
    setState((prev) => ({ token: prev.token, account }))
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ ...state, login, register, logout, refresh, applyAccount, loading, error }),
    [state, login, register, logout, refresh, applyAccount, loading, error]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
