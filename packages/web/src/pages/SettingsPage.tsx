import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  ApiError,
  type ServerApiKeySummary,
  type ServerSettingsHealth
} from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useI18n } from '../i18n'

export function SettingsPage() {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const [health, setHealth] = useState<ServerSettingsHealth | null>(null)
  const [keys, setKeys] = useState<ServerApiKeySummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [textarea, setTextarea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [h, list] = await Promise.all([
        api.settingsHealth(token),
        api.settingsListKeys(token)
      ])
      setHealth(h)
      setKeys(list.keys)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError(t('settings.errorForbidden'))
        } else {
          setError(`${err.code ?? 'ERROR'} · ${err.message}`)
        }
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(t('settings.errorGeneric'))
      }
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!token || textarea.trim().length === 0) return
      setSubmitting(true)
      setFlash(null)
      setError(null)
      try {
        const result = await api.settingsAddKeys(token, textarea)
        setKeys(result.keys)
        setTextarea('')
        setFlash(
          t('settings.flashAdded', {
            inserted: result.inserted,
            duplicates: result.duplicates
          })
        )
        void refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('settings.errorGeneric')
        setError(msg)
      } finally {
        setSubmitting(false)
      }
    },
    [token, textarea, refresh, t]
  )

  const handleDelete = useCallback(
    async (id: number) => {
      if (!token) return
      try {
        const result = await api.settingsDeleteKey(token, id)
        setKeys(result.keys)
        void refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('settings.errorGeneric')
        setError(msg)
      }
    },
    [token, refresh, t]
  )

  const handleReactivate = useCallback(async () => {
    if (!token) return
    try {
      const result = await api.settingsReactivateKeys(token)
      setKeys(result.keys)
      setFlash(t('settings.flashReactivated', { count: result.reactivated }))
      void refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('settings.errorGeneric')
      setError(msg)
    }
  }, [token, refresh, t])

  if (!account) {
    return (
      <div className="flex flex-col gap-6">
        <Header title={t('settings.title')} eyebrow={t('settings.eyebrow')} />
        <div className="gi-panel p-5 text-sm text-ground-300">
          {t('settings.loginGate')}{' '}
          <Link to="/account" className="text-ember-400 hover:underline">
            {t('account.signin')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Header title={t('settings.title')} eyebrow={t('settings.eyebrow')} />

      <p className="text-[14px] text-ground-300 leading-relaxed">
        {t('settings.description')}
      </p>

      {error && (
        <div className="border border-ember-700/60 rounded-sharp p-3 text-[12px] text-ember-300">
          {error}
        </div>
      )}

      {flash && (
        <div className="border border-moss-700/60 rounded-sharp p-3 text-[12px] text-moss-300">
          {flash}
        </div>
      )}

      <section className="gi-panel p-5 flex flex-col gap-3">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('settings.healthHeading')}
        </div>
        {loading || !health ? (
          <div className="text-[12px] text-ground-500">{t('settings.loading')}</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              label={t('settings.statActive')}
              value={String(health.activeKeys)}
              accent={health.activeKeys === 0 ? 'ember' : 'moss'}
            />
            <Stat label={t('settings.statTotal')} value={String(health.totalKeys)} />
            <Stat
              label={t('settings.statAllowList')}
              value={
                health.adminAllowList
                  ? t('settings.allowListEnabled')
                  : t('settings.allowListFirstRegistered')
              }
            />
          </ul>
        )}
      </section>

      <section className="gi-panel p-5 flex flex-col gap-3">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('settings.addHeading')}
        </div>
        <p className="text-[12px] text-ground-400 leading-relaxed">
          {t('settings.addHint')}
        </p>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <textarea
            value={textarea}
            onChange={(event) => setTextarea(event.target.value)}
            rows={6}
            placeholder={t('settings.addPlaceholder')}
            className="w-full bg-ground-950 border border-ground-700 focus:border-ember-600 rounded-sharp px-3 py-2 text-[13px] text-ground-100 font-mono placeholder:text-ground-600 outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || textarea.trim().length === 0}
              className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest border border-ember-600 text-ember-300 hover:bg-ember-500/10 rounded-sharp disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? t('settings.adding') : t('settings.addButton')}
            </button>
            <button
              type="button"
              onClick={handleReactivate}
              className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-moss-600 hover:text-moss-300 rounded-sharp"
            >
              {t('settings.reactivateAll')}
            </button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('settings.listHeading')}
        </h2>
        {loading ? (
          <div className="gi-panel p-5 text-[12px] text-ground-500">{t('settings.loading')}</div>
        ) : !keys || keys.length === 0 ? (
          <div className="gi-panel p-5 text-[12px] text-ground-500 italic">
            {t('settings.listEmpty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.map((key) => (
              <KeyRow key={key.id} entry={key} onDelete={() => handleDelete(key.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Header({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <header className="flex flex-col gap-1">
      <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
        {eyebrow}
      </div>
      <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
        {title}
      </h1>
    </header>
  )
}

function Stat({
  label,
  value,
  accent
}: {
  label: string
  value: string
  accent?: 'moss' | 'ember'
}) {
  const colour =
    accent === 'moss'
      ? 'text-moss-400'
      : accent === 'ember'
        ? 'text-ember-400'
        : 'text-ground-100'
  return (
    <li className="border border-ground-800 rounded-sharp p-3">
      <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
        {label}
      </div>
      <div className={`mt-1 font-display font-extrabold text-2xl tracking-tightest ${colour}`}>
        {value}
      </div>
    </li>
  )
}

function KeyRow({
  entry,
  onDelete
}: {
  entry: ServerApiKeySummary
  onDelete: () => void
}) {
  const { t } = useI18n()
  const status = entry.status === 'active'
  return (
    <li className="gi-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-ground-100">{entry.fingerprint}</span>
          <span
            className={[
              'font-display text-[10px] uppercase tracking-tightest px-2 py-0.5 rounded-sharp border',
              status
                ? 'border-moss-700 text-moss-400'
                : 'border-ember-700 text-ember-400'
            ].join(' ')}
          >
            {status ? t('settings.statusActive') : t('settings.statusDisabled')}
          </span>
          <span className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
            {entry.source === 'env' ? 'env' : 'admin'}
          </span>
        </div>
        {entry.lastError && (
          <div className="text-[11px] text-ember-300 break-all">{entry.lastError}</div>
        )}
        <div className="text-[10px] font-display uppercase tracking-tightest text-ground-600">
          {t('settings.failures', { n: entry.failureCount })} ·{' '}
          {entry.lastUsedAt
            ? new Date(entry.lastUsedAt).toLocaleString()
            : t('settings.neverUsed')}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="gi-touch px-3 self-start sm:self-auto text-[11px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-ember-600 hover:text-ember-300 rounded-sharp"
      >
        {t('settings.deleteKey')}
      </button>
    </li>
  )
}
