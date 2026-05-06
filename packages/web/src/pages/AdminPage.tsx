import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type AccountRole, type ServerAdminUser } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useI18n, type TranslationKey } from '../i18n'
import { PageHeader } from '../components/common/PageHeader'

const ROLES: readonly AccountRole[] = ['player', 'gm', 'admin']

const ROLE_LABEL: Readonly<Record<AccountRole, TranslationKey>> = {
  player: 'admin.role.player',
  gm: 'admin.role.gm',
  admin: 'admin.role.admin',
}

export function AdminPage() {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const [users, setUsers] = useState<ServerAdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const r = await api.adminUsers(token)
      setUsers(r.users)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(t('admin.errorForbidden'))
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(t('admin.errorForbidden'))
      }
    }
  }, [token, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!token || !account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={t('admin.eyebrow')} title={t('admin.title')} description={t('admin.description')} />
        <section className="gi-panel p-5 text-sm text-ground-300">{t('admin.loginGate')}</section>
      </div>
    )
  }

  if (account.role !== 'admin') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={t('admin.eyebrow')} title={t('admin.title')} description={t('admin.description')} />
        <section className="gi-panel p-5 text-sm text-rust-300">{t('admin.errorForbidden')}</section>
      </div>
    )
  }

  const setRole = async (userId: number, role: AccountRole) => {
    if (!token) return
    setBusyId(userId)
    try {
      await api.adminSetRole(token, userId, role)
      await refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'LAST_ADMIN') {
          setError(t('admin.lastAdminWarn'))
        } else {
          setError(err.message)
        }
      } else if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t('admin.eyebrow')} title={t('admin.title')} description={t('admin.description')} />

      {error && (
        <div className="gi-panel p-3 text-[12px] font-display uppercase tracking-tightest text-rust-400 border-rust-700">
          {error}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('admin.usersHeading')}
        </h2>
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id} className="gi-panel p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base text-ground-100 truncate">
                  {u.email}
                  {u.id === account.id && (
                    <span className="ml-2 text-[10px] font-display uppercase tracking-tightest text-ember-400">
                      {t('admin.youBadge')}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                  ID #{u.id} · {new Date(u.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[11px] uppercase tracking-tightest text-ember-400 border border-ember-700 rounded-sharp px-2 py-1">
                  {t(ROLE_LABEL[u.role])}
                </span>
                <div className="flex gap-1">
                  {ROLES.filter((r) => r !== u.role).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => void setRole(u.id, r)}
                      disabled={busyId === u.id}
                      className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-ember-600/60 hover:text-ground-100 rounded-sharp disabled:opacity-60"
                    >
                      {t('admin.setRole')} {t(ROLE_LABEL[r])}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
