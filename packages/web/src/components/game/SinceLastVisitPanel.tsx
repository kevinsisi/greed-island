// v0.14.0：玩家登入後的「不在時發生了什麼」彈窗。
// 顯示：紋卡摘要 + 重大壓力事件 + 跨區世界事件 + 一行 AI digest summary。
// 每個事件 row 點擊可以跳到對應區域 (/area/:tileId)。
//
// 後端有兩支 API：
//   GET /api/cards/since-last-visit   紋卡 spawn / pickup / expire 計數
//   GET /api/world/since-last-visit   完整 living-world catch-up summary
// 我們同時拉這兩個，把結果聚合成一個面板顯示。

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  api,
  type ServerCatchUpSummary,
  type ServerSinceLastVisit
} from '../../api/client'

const TILE_NAME_ZH: Readonly<Record<string, string>> = {
  t_forest: '潮見丘',
  t_mountain: '煙嵐山',
  t_temple: '霓港區',
  t_dimai: '地脈層',
  t_desert: '潮聲區',
  t_central: '夜潮區',
  t_ruin: '鏽灣區',
  t_dock: '碼頭區'
}

const PRESSURE_LABEL: Readonly<Record<string, string>> = {
  'pressure.food_shortage': '食物短缺',
  'pressure.crime_spike': '治安惡化',
  'pressure.price_hike': '物價飆漲',
  'recovery.food_restored': '糧倉回穩',
  'recovery.safety_restored': '治安回穩',
  'recovery.economy_restored': '市況回暖',
  'faction.dominance': '派系掌控',
  'faction.lost': '派系失勢',
  'faction.rising': '派系崛起'
}

interface SinceLastVisitPanelProps {
  token: string
  onClose: () => void
}

export function SinceLastVisitPanel({ token, onClose }: SinceLastVisitPanelProps) {
  const navigate = useNavigate()
  const [cards, setCards] = useState<ServerSinceLastVisit | null>(null)
  const [world, setWorld] = useState<ServerCatchUpSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.allSettled([
      api.cardsSinceLastVisit(token),
      api.worldSinceLastVisit(token)
    ]).then((results) => {
      if (cancelled) return
      const c = results[0].status === 'fulfilled' ? results[0].value : null
      const w = results[1].status === 'fulfilled' ? results[1].value.summary : null
      setCards(c)
      setWorld(w)
      const hasCards =
        !!c && (c.dropsSpawned > 0 || c.dropsCollectedByOthers > 0 || c.dropsExpired > 0)
      const hasWorld =
        !!w &&
        (w.pressureMoments.length > 0 ||
          (w.productiveActions?.length ?? 0) > 0 ||
          w.worldEvents.length > 0 ||
          w.weatherChanges.length > 0 ||
          w.seasonChanges.length > 0 ||
          w.totalEvents > 0)
      setHasContent(hasCards || hasWorld)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const digest = useMemo(() => buildDigest(cards, world), [cards, world])

  const goToArea = (tileId: string) => {
    onClose()
    navigate(`/area/${tileId}`)
  }

  if (loading || !hasContent) return null

  const pressureMoments = world?.pressureMoments ?? []
  const productiveActions = world?.productiveActions ?? []
  const worldEvents = world?.worldEvents ?? []
  const weatherChanges = world?.weatherChanges ?? []

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="不在時發生的事"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/85 backdrop-blur-sm px-3 pb-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl gi-panel border-ember-700/60 p-5 sm:p-6 flex flex-col gap-4 max-h-[88vh] overflow-hidden"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
              While you were gone
            </div>
            <h2 className="font-display font-extrabold text-2xl tracking-tightest text-ground-100">
              不在時的潮鳴市
            </h2>
            <div className="mt-1 text-[12px] leading-snug text-ground-300">{digest}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gi-touch shrink-0 px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
            aria-label="close"
          >
            關閉
          </button>
        </header>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1 flex flex-col gap-4">
          {cards && (cards.dropsSpawned > 0 || cards.dropsCollectedByOthers > 0 || cards.dropsExpired > 0) && (
            <Section title="紋卡">
              <div className="flex gap-3 flex-wrap text-[12px] text-ground-200">
                <Stat label="掉落" value={cards.dropsSpawned} tone="ember" />
                <Stat label="被別人撿" value={cards.dropsCollectedByOthers} tone="rust" />
                <Stat label="自然消失" value={cards.dropsExpired} tone="muted" />
              </div>
            </Section>
          )}

          {pressureMoments.length > 0 && (
            <Section title="區域壓力 / 回穩">
              <ul className="flex flex-col gap-1.5">
                {pressureMoments.slice(0, 8).map((m, idx) => (
                  <li key={`${m.tick}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => goToArea(m.tileId)}
                      className="w-full text-left border border-ground-800 hover:border-ember-700 rounded-sharp p-2 text-[12px] text-ground-200 hover:bg-ground-800/50 transition-colors"
                    >
                      <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500 mb-1">
                        tick {m.tick} · {TILE_NAME_ZH[m.tileId] ?? m.tileId} ·{' '}
                        {PRESSURE_LABEL[m.kind] ?? m.kind}
                      </div>
                      <div className="leading-snug">{m.narration}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {productiveActions.length > 0 && (
            <Section title="城市進展">
              <ul className="flex flex-col gap-1.5">
                {productiveActions.slice(0, 8).map((a, idx) => (
                  <li key={`${a.tick}-${a.npcId}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => goToArea(a.tile)}
                      className="w-full text-left border border-ground-800 hover:border-moss-700 rounded-sharp p-2 text-[12px] text-ground-200 hover:bg-ground-800/50 transition-colors"
                    >
                      <div className="font-display text-[10px] uppercase tracking-tightest text-moss-500 mb-1">
                        tick {a.tick} | {TILE_NAME_ZH[a.tile] ?? a.tile} | {a.domain}/{a.metric} +{a.delta}
                      </div>
                      <div className="leading-snug">{a.narration}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {worldEvents.length > 0 && (
            <Section title="世界事件">
              <ul className="flex flex-col gap-1.5">
                {worldEvents.slice(0, 6).map((ev, idx) => {
                  const tile = parseTileFromScope(ev.scope)
                  return (
                    <li key={`${ev.tick}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => (tile ? goToArea(tile) : onClose())}
                        className="w-full text-left border border-ground-800 hover:border-moss-700 rounded-sharp p-2 text-[12px] text-ground-200 hover:bg-ground-800/50 transition-colors"
                      >
                        <div className="font-display text-[10px] uppercase tracking-tightest text-moss-500 mb-1">
                          tick {ev.tick} · {ev.type} · {ev.scope}
                        </div>
                        <div className="leading-snug">{ev.narration}</div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}

          {weatherChanges.length > 0 && (
            <Section title="天候 / 季節">
              <div className="text-[12px] text-ground-300 leading-relaxed">
                {weatherChanges.slice(-3).map((w, i) => (
                  <span key={i}>
                    {i > 0 ? ' · ' : ''}
                    tick {w.tick}: {w.from} → {w.to}
                  </span>
                ))}
                {(world?.seasonChanges ?? []).slice(-2).map((s, i) => (
                  <span key={`s${i}`} className="ml-2 text-ember-300">
                    · 季節：{s.from} → {s.to}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ember' | 'rust' | 'muted' }) {
  const colorClass =
    tone === 'ember'
      ? 'text-ember-300'
      : tone === 'rust'
        ? 'text-rust-300'
        : 'text-ground-400'
  return (
    <span className="border border-ground-800 rounded-sharp px-2 py-1">
      <span className="text-ground-500 mr-1">{label}</span>
      <b className={colorClass}>{value}</b>
    </span>
  )
}

function buildDigest(
  cards: ServerSinceLastVisit | null,
  world: ServerCatchUpSummary | null
): string {
  const parts: string[] = []
  if (cards && cards.dropsSpawned > 0) {
    parts.push(`世界掉了 ${cards.dropsSpawned} 張紋卡`)
    if (cards.dropsCollectedByOthers > 0) {
      parts.push(`其中 ${cards.dropsCollectedByOthers} 張被別人撿走`)
    }
  }
  if (world) {
    if (world.pressureMoments.length > 0) {
      parts.push(`${world.pressureMoments.length} 起區域壓力 / 回穩事件`)
    }
    if (world.worldEvents.length > 0) {
      parts.push(`${world.worldEvents.length} 件世界事件`)
    }
    if (world.weatherChanges.length > 0) {
      parts.push(`天氣轉了 ${world.weatherChanges.length} 次`)
    }
  }
  if (parts.length === 0) return '世界一切如常。'
  return parts.join('；') + '。'
}

function parseTileFromScope(scope: string): string | null {
  if (scope === 'world') return null
  if (scope.startsWith('region:')) {
    const list = scope.slice('region:'.length).split(',')
    return list[0] ?? null
  }
  return null
}
