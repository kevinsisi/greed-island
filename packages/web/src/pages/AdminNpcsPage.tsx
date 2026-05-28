import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type ServerNpcStats, type ServerNpcStatsDeath } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useI18n, type TranslationKey } from '../i18n'
import { PageHeader } from '../components/common/PageHeader'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; stats: ServerNpcStats }
  | { kind: 'error'; message: string }

export function AdminNpcsPage() {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  const refresh = useCallback(async () => {
    if (!token) return
    setState({ kind: 'loading' })
    try {
      const stats = await api.adminNpcStats(token)
      setState({ kind: 'ready', stats })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setState({ kind: 'error', message: t('admin.errorForbidden') })
        return
      }
      const message = err instanceof Error ? err.message : t('admin.errorForbidden')
      setState({ kind: 'error', message })
    }
  }, [token, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!token || !account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('admin.npcs.eyebrow')}
          title={t('admin.npcs.title')}
          description={t('admin.npcs.description')}
        />
        <section className="gi-panel p-5 text-sm text-ground-300">{t('admin.loginGate')}</section>
      </div>
    )
  }

  if (account.role !== 'admin' && account.role !== 'gm') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={t('admin.npcs.eyebrow')}
          title={t('admin.npcs.title')}
          description={t('admin.npcs.description')}
        />
        <section className="gi-panel p-5 text-sm text-rust-300">{t('admin.errorForbidden')}</section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('admin.npcs.eyebrow')}
        title={t('admin.npcs.title')}
        description={t('admin.npcs.description')}
        actions={
          <Link
            to={account.role === 'admin' ? '/admin' : '/admin/world'}
            className="gi-panel px-3 py-1.5 text-xs font-display uppercase tracking-tightest text-ground-300 hover:text-ground-100"
          >
            {account.role === 'admin' ? t('admin.npcs.backToAdmin') : t('nav.gmWorld')}
          </Link>
        }
      />

      {state.kind === 'loading' && (
        <section className="gi-panel p-5 text-sm text-ground-300">…</section>
      )}

      {state.kind === 'error' && (
        <section className="gi-panel p-5 text-sm text-rust-300">{state.message}</section>
      )}

      {state.kind === 'ready' && <StatsView stats={state.stats} t={t} />}
    </div>
  )
}

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string

function StatsView({ stats, t }: { stats: ServerNpcStats; t: Translator }) {
  return (
    <>
      <section
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
        aria-label={t('admin.npcs.title')}
      >
        <StatCard label={t('admin.npcs.statTotal')} value={stats.totalNpcs} />
        <StatCard label={t('admin.npcs.statManual')} value={stats.byOrigin.manual} />
        <StatCard label={t('admin.npcs.statBorn')} value={stats.byOrigin.born} />
        <StatCard label={t('admin.npcs.statBirthsEvents')} value={stats.births.totalEventCount} />
        <StatCard
          label={t('admin.npcs.statHouseholdsEvents')}
          value={stats.households.totalEventCount}
        />
        <StatCard
          label={t('admin.npcs.statDeaths')}
          value={stats.deaths.totalEventCount}
        />
      </section>

      <p className="text-[12px] text-ground-500">
        {t('admin.npcs.generatedAtTick', { tick: stats.generatedAtTick })}
      </p>

      <p className="text-[12px] text-ground-400 leading-relaxed gi-panel p-4 border-amber-700/30">
        {t('admin.npcs.bornFollowUp')}
      </p>

      <section className="gi-panel p-4 flex flex-col gap-3">
        <h2 className="font-display text-sm uppercase tracking-tightest text-ground-200">
          {t('admin.npcs.birthsHeading')}
        </h2>
        {stats.births.recent.length === 0 ? (
          <p className="text-sm text-ground-400">{t('admin.npcs.birthsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colTick')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colChild')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colHousehold')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colMotivation')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.births.recent.map((row) => (
                  <tr key={`${row.tick}-${row.childId}`} className="border-t border-ground-800/40">
                    <td className="py-1.5 pr-3 text-ground-300 font-mono text-xs">{row.tick}</td>
                    <td className="py-1.5 pr-3 text-ground-100">
                      <div>{row.nameZh || row.childId}</div>
                      <div className="text-[11px] text-ground-500 font-mono">{row.childId}</div>
                    </td>
                    <td className="py-1.5 pr-3 text-ground-400 font-mono text-xs">{row.householdId}</td>
                    <td className="py-1.5 pr-3 text-ground-400">{row.motivation ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gi-panel p-4 flex flex-col gap-3">
        <h2 className="font-display text-sm uppercase tracking-tightest text-ground-200">
          {t('admin.npcs.householdsHeading')}
        </h2>
        {stats.households.recent.length === 0 ? (
          <p className="text-sm text-ground-400">{t('admin.npcs.householdsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colTick')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colHousehold')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colPartners')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colTile')}</th>
                  <th className="text-left py-2 pr-3">{t('admin.npcs.colMotivation')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.households.recent.map((row) => (
                  <tr key={`${row.tick}-${row.householdId}`} className="border-t border-ground-800/40">
                    <td className="py-1.5 pr-3 text-ground-300 font-mono text-xs">{row.tick}</td>
                    <td className="py-1.5 pr-3 text-ground-100 font-mono text-xs">{row.householdId}</td>
                    <td className="py-1.5 pr-3 text-ground-300 font-mono text-xs">
                      {row.partnerNpcIds.join(' + ')}
                    </td>
                    <td className="py-1.5 pr-3 text-ground-300 font-mono text-xs">{row.homeTileId}</td>
                    <td className="py-1.5 pr-3 text-ground-400">{row.motivation ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gi-panel p-4 flex flex-col gap-3">
        <h2 className="font-display text-sm uppercase tracking-tightest text-ground-200">
          {t('admin.npcs.deathsHeading')}
        </h2>
        {stats.deaths.recent.length === 0 ? (
          <p className="text-sm text-ground-400">{t('admin.npcs.deathsEmpty')}</p>
        ) : (
          <DeathsTable rows={stats.deaths.recent} t={t} />
        )}
      </section>
    </>
  )
}

function DeathsTable({ rows, t }: { rows: readonly ServerNpcStatsDeath[]; t: Translator }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-tightest text-ground-500">
            <th className="text-left py-2 pr-3">{t('admin.npcs.colTick')}</th>
            <th className="text-left py-2 pr-3">NPC</th>
            <th className="text-left py-2 pr-3">{t('admin.npcs.colHousehold')}</th>
            <th className="text-left py-2 pr-3">{t('admin.npcs.colMotivation')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.tick}-${row.npcId}`} className="border-t border-ground-800/40">
              <td className="py-1.5 pr-3 text-ground-300 font-mono text-xs">{row.tick}</td>
              <td className="py-1.5 pr-3 text-ground-100">
                <div className="text-[11px] text-ground-500 font-mono">{row.npcId}</div>
              </td>
              <td className="py-1.5 pr-3 text-ground-400 font-mono text-xs">{row.householdId}</td>
              <td className="py-1.5 pr-3 text-ground-400">{row.narration || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({
  label,
  value,
  mute,
}: {
  label: string
  value: number | string
  mute?: boolean
}) {
  return (
    <div className={`gi-panel p-3 flex flex-col gap-1 ${mute ? 'border-ground-800/60' : ''}`}>
      <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">{label}</div>
      <div className={`text-2xl font-display font-extrabold ${mute ? 'text-ground-500' : 'text-ground-100'}`}>
        {value}
      </div>
    </div>
  )
}
