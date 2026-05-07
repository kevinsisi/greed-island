import { useMemo, useState } from 'react'
import { useI18n, type TranslationKey } from '../../i18n'
import { useWorldState } from '../../state/WorldStateContext'
import type { ServerActiveWorldEvent } from '../../api/client'

const TYPE_TONE: Record<ServerActiveWorldEvent['type'], string> = {
  weather: 'border-ember-700/40 bg-ember-500/5 text-ember-400',
  npc: 'border-moss-600/40 bg-moss-500/5 text-moss-400',
  card: 'border-ember-600/60 bg-ember-500/10 text-ember-500',
  city: 'border-rust-600/40 bg-rust-500/5 text-rust-500',
}

const TYPE_LABEL: Record<ServerActiveWorldEvent['type'], TranslationKey> = {
  weather: 'worldEvent.type.weather',
  npc: 'worldEvent.type.npc',
  card: 'worldEvent.type.card',
  city: 'worldEvent.type.city',
}

export function WorldEventsBanner() {
  const { worldEvents, world, map } = useWorldState()
  const { t, locale } = useI18n()
  // 預設收合：地圖才是主要視覺空間，事件列表只在玩家點開時展開。
  const [expanded, setExpanded] = useState(false)

  const tileNameById = useMemo(() => {
    const acc: Record<string, string> = {}
    for (const tile of map.tiles) acc[tile.id] = tile.name
    return acc
  }, [map.tiles])

  if (!worldEvents || worldEvents.length === 0) return null

  return (
    <section
      aria-label={t('worldEvent.heading')}
      className="border border-ground-800 rounded-sharp bg-ground-900/95"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full px-3 py-2 flex items-center justify-between text-left font-display text-[11px] uppercase tracking-tightest text-ember-500 hover:text-ember-400 transition-colors"
      >
        <span>
          {expanded ? '▾' : '▸'} {t('worldEvent.heading')}{' '}
          <span className="text-ground-600">({worldEvents.length})</span>
        </span>
        <span className="text-ground-500 normal-case tracking-normal text-[10px]">
          {expanded ? t('worldEvent.collapse') : t('worldEvent.expand')}
        </span>
      </button>
      {!expanded ? null : (
      <ul className="px-3 pb-3 flex flex-col gap-2 lg:grid lg:grid-cols-2 xl:grid-cols-3">
        {worldEvents.map((event) => {
          const remaining = Math.max(0, event.endsAtTick - world.tick)
          const tone = TYPE_TONE[event.type] ?? TYPE_TONE.city
          const scopeLabel =
            event.scope.kind === 'world'
              ? t('worldEvent.scopeWorld')
              : t('worldEvent.scopeRegion', {
                  regions: event.scope.tileIds.map((id) => tileNameById[id] ?? id).join('、'),
                })
          return (
            <li
              key={event.id}
              className={[
                'rounded-sharp border p-3 leading-relaxed',
                tone,
              ].join(' ')}
            >
              <div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-tightest mb-1">
                <span>{t(TYPE_LABEL[event.type])}</span>
                <span className="text-ground-700">·</span>
                <span className="text-ground-500">{scopeLabel}</span>
                <span className="text-ground-700">·</span>
                <span className="text-ground-500">{t('worldEvent.endsInTicks', { ticks: remaining })}</span>
              </div>
              <p className="text-[13px] text-ground-100">{event.text[locale]}</p>
            </li>
          )
        })}
      </ul>
      )}
    </section>
  )
}
