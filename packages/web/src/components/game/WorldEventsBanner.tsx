import { useMemo } from 'react'
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

  const tileNameById = useMemo(() => {
    const acc: Record<string, string> = {}
    for (const tile of map.tiles) acc[tile.id] = tile.name
    return acc
  }, [map.tiles])

  if (!worldEvents || worldEvents.length === 0) return null

  return (
    <section
      aria-label={t('worldEvent.heading')}
      className="border-b border-ground-800 bg-ground-900/95 px-4 sm:px-6 lg:px-10 py-3"
    >
      <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-2">
        ▾ {t('worldEvent.heading')} <span className="text-ground-600">({worldEvents.length})</span>
      </div>
      <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 xl:grid-cols-3">
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
    </section>
  )
}
