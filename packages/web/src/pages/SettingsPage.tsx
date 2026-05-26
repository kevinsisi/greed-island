import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  ApiError,
  type ServerApiKeySummary,
  type ServerOpenCodeModelGroup,
  type ServerOpenCodeStatus,
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

  // v0.65.0 — contract-aligned OpenCode settings state.
  const [ocStatus, setOcStatus] = useState<ServerOpenCodeStatus | null>(null)
  const [ocServersInput, setOcServersInput] = useState('')
  const [ocTextModel, setOcTextModel] = useState('')
  const [ocGroups, setOcGroups] = useState<ServerOpenCodeModelGroup[]>([])
  const [ocModelSearch, setOcModelSearch] = useState('')
  const [ocModelsLoading, setOcModelsLoading] = useState(false)
  const [ocSaving, setOcSaving] = useState(false)
  const [ocFlash, setOcFlash] = useState<string | null>(null)
  const [ocError, setOcError] = useState<string | null>(null)

  const loadOpenCode = useCallback(async () => {
    if (!token) return
    try {
      const status = await api.settingsGetOpenCode(token)
      setOcStatus(status)
      setOcServersInput(status.servers.map((s) => s.base_url).join('\n'))
      setOcTextModel(status.text_model_source === 'setting' ? status.text_model : '')
    } catch {
      // non-fatal
    }
  }, [token])

  const loadOpenCodeModels = useCallback(async () => {
    if (!token) return
    setOcModelsLoading(true)
    try {
      const result = await api.settingsGetOpenCodeModels(token)
      setOcGroups(result.groups)
      if (result.error) setOcError(result.error)
    } catch (err) {
      setOcError(err instanceof Error ? err.message : 'Models 載入失敗')
    } finally {
      setOcModelsLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadOpenCode()
  }, [loadOpenCode])

  const handleSaveOpenCode = useCallback(async () => {
    if (!token) return
    setOcSaving(true)
    setOcFlash(null)
    setOcError(null)
    try {
      const updated = await api.settingsUpdateOpenCode(token, {
        servers: ocServersInput,
        text_model: ocTextModel,
      })
      setOcStatus(updated)
      setOcFlash('OpenCode 設定已儲存')
      await loadOpenCodeModels()
    } catch (err) {
      setOcError(err instanceof Error ? err.message : 'OpenCode 儲存失敗')
    } finally {
      setOcSaving(false)
    }
  }, [token, ocServersInput, ocTextModel, loadOpenCodeModels])

  const handleClearOpenCode = useCallback(async () => {
    if (!token) return
    if (!confirm('確定要清除 DB 中的 OpenCode 設定？清除後將改讀環境變數。')) return
    setOcSaving(true)
    setOcFlash(null)
    setOcError(null)
    try {
      const updated = await api.settingsDeleteOpenCode(token)
      setOcStatus(updated)
      setOcServersInput(updated.servers.map((s) => s.base_url).join('\n'))
      setOcTextModel(updated.text_model_source === 'setting' ? updated.text_model : '')
      setOcFlash('OpenCode DB 設定已清除')
    } catch (err) {
      setOcError(err instanceof Error ? err.message : 'OpenCode 清除失敗')
    } finally {
      setOcSaving(false)
    }
  }, [token])

  const filteredGroups = ocGroups.map((g) => ({
    ...g,
    models: ocModelSearch
      ? g.models.filter(
          (m) =>
            m.id.toLowerCase().includes(ocModelSearch.toLowerCase()) ||
            m.name.toLowerCase().includes(ocModelSearch.toLowerCase()),
        )
      : g.models,
  })).filter((g) => g.models.length > 0)

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

      {/* v0.65.0 — OpenCode settings (contract-aligned: servers, model select, variant). */}
      <section className="gi-panel p-5 flex flex-col gap-3">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          OpenCode AI 設定
        </div>
        <p className="text-[12px] text-ground-400 leading-relaxed">
          文字生成走 OpenCode → Gemini 降級；未填寫時讀取主機環境設定。
        </p>

        {ocStatus && (
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
            <span className="font-display uppercase tracking-tightest text-ground-500">伺服器</span>
            <span className="font-mono text-ground-300">
              {ocStatus.servers.length === 0 ? '—' : ocStatus.servers.map((s) => s.base_url).join(', ')}
              {' '}<span className="text-ground-600">[{ocStatus.servers_source}]</span>
            </span>
            <span className="font-display uppercase tracking-tightest text-ground-500">文字模型</span>
            <span className="font-mono text-ground-300">
              {ocStatus.text_model}{' '}
              <span className="text-ground-600">[{ocStatus.text_model_source}]</span>
            </span>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ground-400 uppercase tracking-tightest">OpenCode 伺服器（一行一個 URL）</span>
          <textarea
            rows={3}
            value={ocServersInput}
            onChange={(e) => setOcServersInput(e.target.value)}
            placeholder="https://provider-amd.sisihome.org"
            className="w-full bg-ground-950 border border-ground-700 focus:border-ember-600 rounded-sharp px-3 py-2 text-[13px] text-ground-100 font-mono placeholder:text-ground-600 outline-none resize-y"
          />
        </label>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[11px] text-ground-400 uppercase tracking-tightest">搜尋模型</span>
            <input
              type="search"
              value={ocModelSearch}
              onChange={(e) => setOcModelSearch(e.target.value)}
              placeholder="gpt / gemini / …"
              className="bg-ground-950 border border-ground-700 focus:border-ember-600 rounded-sharp px-3 py-2 text-[13px] text-ground-100 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadOpenCodeModels()}
            disabled={ocModelsLoading}
            className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-ember-600 hover:text-ember-300 rounded-sharp disabled:opacity-40"
          >
            {ocModelsLoading ? '載入中…' : '重新整理模型'}
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ground-400 uppercase tracking-tightest">文字模型</span>
          <select
            value={ocTextModel}
            onChange={(e) => setOcTextModel(e.target.value)}
            className="bg-ground-950 border border-ground-700 focus:border-ember-600 rounded-sharp px-3 py-2 text-[13px] text-ground-100 outline-none"
          >
            <option value="">— 使用預設（{ocStatus?.text_model ?? 'opencode/deepseek-v4-flash-free'}）—</option>
            {filteredGroups.map((g) => (
              <optgroup key={g.provider} label={`${g.name}${!g.authed ? ' 🔑' : ''}`}>
                {g.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}{m.free ? ' (free)' : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {ocError && (
          <div className="border border-ember-700/60 rounded-sharp p-2 text-[11px] text-ember-300">
            {ocError}
          </div>
        )}
        {ocFlash && (
          <div className="border border-moss-700/60 rounded-sharp p-2 text-[11px] text-moss-300">
            {ocFlash}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSaveOpenCode()}
            disabled={ocSaving}
            className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest border border-ember-600 text-ember-300 hover:bg-ember-500/10 rounded-sharp disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ocSaving ? '儲存中…' : '儲存 OpenCode 設定'}
          </button>
          <button
            type="button"
            onClick={() => void handleClearOpenCode()}
            disabled={ocSaving}
            className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-ember-600 hover:text-ember-300 rounded-sharp disabled:opacity-40"
          >
            清除 DB 設定
          </button>
        </div>
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
