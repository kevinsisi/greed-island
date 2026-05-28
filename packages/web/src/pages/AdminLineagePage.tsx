import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type ServerLineageResponse } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { PageHeader } from '../components/common/PageHeader'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: ServerLineageResponse }
  | { kind: 'error'; message: string }

export function AdminLineagePage() {
  const { token, account } = useAuth()
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [advancing, setAdvancing] = useState(false)
  const [advanceMessage, setAdvanceMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    setState({ kind: 'loading' })
    try {
      const data = await api.adminLineage(token)
      setState({ kind: 'ready', data })
    } catch (err) {
      const message =
        err instanceof ApiError && (err.status === 401 || err.status === 403)
          ? '無權限：需要 GM 以上角色'
          : err instanceof Error
            ? err.message
            : '載入失敗'
      setState({ kind: 'error', message })
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const advanceTicks = useCallback(
    async (ticks: number) => {
      if (!token) return
      setAdvancing(true)
      setAdvanceMessage(null)
      try {
        const result = await api.adminSimAdvance(token, ticks)
        setAdvanceMessage(
          `已推進 ${result.advancedTicks} ticks（${result.beforeTick} → ${result.afterTick}），耗時 ${result.elapsedMs} ms${result.capped ? '（已封頂）' : ''}`
        )
        await refresh()
      } catch (err) {
        setAdvanceMessage(err instanceof Error ? err.message : '推進失敗')
      } finally {
        setAdvancing(false)
      }
    },
    [token, refresh]
  )

  if (!token || !account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="GM 工具" title="家族樹" description="觀察家戶結構與世代關係" />
        <section className="gi-panel p-5 text-sm text-ground-300">請先登入 GM 帳號</section>
      </div>
    )
  }

  if (account.role !== 'admin' && account.role !== 'gm') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="GM 工具" title="家族樹" description="觀察家戶結構與世代關係" />
        <section className="gi-panel p-5 text-sm text-rust-300">無權限：需要 GM 以上角色</section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="GM 工具"
        title="家族樹"
        description="觀察家戶結構與世代關係。可使用時間加速器跳過實際等待時間。"
        actions={
          <Link
            to="/admin/npcs"
            className="gi-panel px-3 py-1.5 text-xs font-display uppercase tracking-tightest text-ground-300 hover:text-ground-100"
          >
            回到 NPC 儀表板
          </Link>
        }
      />

      <section className="gi-panel p-5 flex flex-col gap-3 border-amber-700/40">
        <h2 className="font-display text-sm uppercase tracking-tightest text-ground-200">時間加速器</h2>
        <p className="text-xs text-ground-400">
          推進世界 N tick — 用來觀察 §43 emergent 行為（成熟、死亡、繼承、生態崩潰）。每次最多 50,000 tick。
        </p>
        <div className="flex gap-2 flex-wrap">
          {[1000, 5000, 10000, 17280, 50000].map((n) => (
            <button
              key={n}
              type="button"
              disabled={advancing}
              onClick={() => void advanceTicks(n)}
              className="gi-panel px-3 py-1.5 text-xs text-ground-200 hover:text-ground-100 disabled:opacity-50"
            >
              {advancing ? '推進中…' : `+${n.toLocaleString()} ticks`}
            </button>
          ))}
        </div>
        {advanceMessage && <p className="text-xs text-moss-300">{advanceMessage}</p>}
      </section>

      {state.kind === 'loading' && (
        <section className="gi-panel p-5 text-sm text-ground-300">載入中…</section>
      )}
      {state.kind === 'error' && (
        <section className="gi-panel p-5 text-sm text-rust-300">{state.message}</section>
      )}
      {state.kind === 'ready' && (
        <>
          <p className="text-[12px] text-ground-500">
            取樣 tick：{state.data.generatedAtTick}・家戶總數：{state.data.households.length}
          </p>
          {state.data.households.length === 0 ? (
            <section className="gi-panel p-5 text-sm text-ground-400">
              尚無家戶。需要 NPC 成家後才有資料。
            </section>
          ) : (
            <div className="flex flex-col gap-3">
              {state.data.households.map((h) => (
                <section key={h.householdId} className="gi-panel p-4 flex flex-col gap-2">
                  <header className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h3 className="font-display text-sm tracking-tightest text-ground-100">
                      {h.partners.map((p) => p.nameZh).join('・')}
                    </h3>
                    <div className="text-[10px] text-ground-500 font-mono">
                      {h.homeTileId} · 成家於 tick {h.formedAtTick}
                    </div>
                  </header>
                  <div className="text-[11px] text-ground-400 font-mono">{h.householdId}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {h.partners.map((p) => (
                      <span
                        key={p.npcId}
                        className={[
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-sharp text-[10px] border',
                          p.deceased
                            ? 'border-rust-700/50 text-rust-400 bg-rust-900/20 line-through'
                            : 'border-ground-700 text-ground-300',
                        ].join(' ')}
                      >
                        伴 · {p.nameZh}
                        {p.deceased && ' †'}
                      </span>
                    ))}
                  </div>
                  {h.children.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {h.children.map((c) => (
                        <span
                          key={c.childId}
                          className={[
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-sharp text-[10px] border',
                            c.deceased
                              ? 'border-rust-700/50 text-rust-400 bg-rust-900/20 line-through'
                              : c.matured
                                ? 'border-moss-600 text-moss-300 bg-moss-900/20'
                                : 'border-ember-700/50 text-ember-400 bg-ember-900/15',
                          ].join(' ')}
                          title={`born@${c.bornAtTick}${c.matured ? ' · 已成熟' : ''}${c.deceased ? ' · 已逝' : ''}`}
                        >
                          {c.matured ? '青' : '兒'} · {c.nameZh}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
