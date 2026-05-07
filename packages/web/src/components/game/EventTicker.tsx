import { useState } from 'react'
import { useI18n } from '../../i18n'
import { useWorldState } from '../../state/WorldStateContext'

const TICKER_LIMIT = 8

export function EventTicker() {
  const { events } = useWorldState()
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)

  const visible = events.slice(0, TICKER_LIMIT)

  return (
    <aside
      aria-label={t('ticker.heading')}
      className="hidden lg:flex flex-col w-72 shrink-0 border-l border-ground-800 bg-ground-900/95 px-4 pt-4 pb-6 gap-3"
    >
      <header className="flex items-center justify-between text-[11px] font-display uppercase tracking-tightest">
        <span className="text-ember-500">▾ {t('ticker.heading')}</span>
        <span className="text-ground-600">{visible.length}</span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto pr-1">
        {visible.length === 0 && (
          <div className="text-[12px] text-ground-500 italic">{t('ticker.empty')}</div>
        )}
        {visible.map((event) => (
          <article
            key={event.sequence}
            className="border-l-2 border-ember-700/40 pl-3 py-1 text-[12px] text-ground-300 leading-relaxed"
          >
            <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-0.5">
              tick {event.tick} · #{event.sequence}
            </div>
            {event.narration ? (
              <div className="text-ground-100">{event.narration}</div>
            ) : (
              <div className="italic text-ground-500">{event.eventType}</div>
            )}
          </article>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="mt-auto self-start text-[10px] font-display uppercase tracking-tightest text-ground-500 hover:text-ground-200"
      >
        {collapsed ? t('ticker.expand') : t('ticker.collapse')}
      </button>
    </aside>
  )
}

// 行動裝置上，EventTickerStrip 必須浮在 MobileTabBar (fixed bottom-0, ~56px 高)
// 之上，否則會被 nav bar 遮住。改用 fixed 定位 + 對齊 nav 高度。
// MobileTabBar：py-2.5 + 內含 18px glyph + 2px gap + 12px text-[10px] ≈ 56px。
// 留一點容差用 bottom-[60px]。z-20 比 main 高、比 nav (z-30) 低，方便 tap nav。
export function EventTickerStrip() {
  const { events } = useWorldState()
  const { t } = useI18n()
  const head = events[0]
  return (
    <div className="lg:hidden fixed bottom-[60px] inset-x-0 z-20 border-t border-b border-ground-800 bg-ground-900/95 backdrop-blur px-4 py-2 text-[12px] font-display tracking-tight text-ground-300">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase text-ember-500 shrink-0">{t('ticker.heading')}</span>
        {head ? (
          <span className="truncate">{head.narration ?? head.eventType}</span>
        ) : (
          <span className="italic text-ground-500">{t('ticker.empty')}</span>
        )}
      </div>
    </div>
  )
}
