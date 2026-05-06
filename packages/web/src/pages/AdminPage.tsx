import { useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type AccountRole,
  type ServerAdminResetIssue,
  type ServerAdminUser,
} from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useI18n, type TranslationKey } from '../i18n'
import { PageHeader } from '../components/common/PageHeader'
import { Avatar } from '../components/common/Avatar'

const ROLES: readonly AccountRole[] = ['player', 'gm', 'admin']

const ROLE_LABEL: Readonly<Record<AccountRole, TranslationKey>> = {
  player: 'admin.role.player',
  gm: 'admin.role.gm',
  admin: 'admin.role.admin',
}

type ResetState =
  | { kind: 'idle' }
  | { kind: 'issued'; user: ServerAdminUser; issue: ServerAdminResetIssue; resetUrl: string }

export function AdminPage() {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const [users, setUsers] = useState<ServerAdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reset, setReset] = useState<ResetState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

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

  const issueReset = async (user: ServerAdminUser) => {
    if (!token) return
    setBusyId(user.id)
    setError(null)
    try {
      const issue = await api.adminResetUserPassword(token, user.id)
      const resetUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${issue.resetPath}`
          : issue.resetPath
      setReset({ kind: 'issued', user, issue, resetUrl })
      setCopied(false)
    } catch (err) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const onCopyReset = async () => {
    if (reset.kind !== 'issued') return
    try {
      await navigator.clipboard.writeText(reset.resetUrl)
      setCopied(true)
    } catch {
      setCopied(false)
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

      {reset.kind === 'issued' && (
        <section className="gi-panel p-5 flex flex-col gap-3 border border-ember-700/60">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-400">
            {t('admin.resetPasswordHeading')}
          </div>
          <div className="text-sm text-ground-200">
            {t('admin.resetPasswordIssued', { email: reset.user.email })}
          </div>
          <p className="text-[12px] text-ground-400">{t('admin.resetPasswordDescription')}</p>
          <input
            type="text"
            readOnly
            value={reset.resetUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-[12px] text-ground-100 font-mono"
          />
          <div className="text-[10px] font-display uppercase tracking-tightest text-ground-500">
            {t('admin.resetPasswordExpiresAt', { at: new Date(reset.issue.expiresAt).toLocaleString() })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopyReset}
              className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600 hover:bg-ember-500/10 transition-colors rounded-sharp"
            >
              {copied ? t('admin.resetPasswordCopied') : t('admin.resetPasswordCopy')}
            </button>
            <button
              type="button"
              onClick={() => setReset({ kind: 'idle' })}
              className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-300 border border-ground-700 hover:border-ember-600/60 transition-colors rounded-sharp"
            >
              {t('admin.resetPasswordClose')}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('admin.usersHeading')}
        </h2>
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="gi-panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <Avatar avatar={u.avatar} size="md" ringed />
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base text-ground-100 truncate">
                  {u.displayName}
                  {u.id === account.id && (
                    <span className="ml-2 text-[10px] font-display uppercase tracking-tightest text-ember-400">
                      {t('admin.youBadge')}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-ground-300 truncate">{u.email}</div>
                <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                  ID #{u.id} · {new Date(u.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-display text-[11px] uppercase tracking-tightest text-ember-400 border border-ember-700 rounded-sharp px-2 py-1">
                  {t(ROLE_LABEL[u.role])}
                </span>
                <div className="flex flex-wrap gap-1 justify-end">
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
                  <button
                    type="button"
                    onClick={() => void issueReset(u)}
                    disabled={busyId === u.id}
                    className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-rust-700 text-rust-300 hover:border-rust-500 hover:text-rust-100 rounded-sharp disabled:opacity-60"
                  >
                    {t('admin.resetPassword')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
