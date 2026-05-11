import { useEffect, useMemo, useState } from 'react'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n, type TranslationKey, type Translator } from '../i18n'
import type { EventSummary } from '../state/types'
import { api, type ServerChronicleResponse } from '../api/client'
import { isPublicNarrativeEvent } from '../state/eventVisibility'

interface EventFilter {
  id: 'all' | 'cards' | 'npc' | 'world'
  labelKey: TranslationKey
  match: (eventType: string) => boolean
}

const FILTERS: EventFilter[] = [
  { id: 'all', labelKey: 'timeline.filter.all', match: () => true },
  { id: 'cards', labelKey: 'timeline.filter.cards', match: (t) => t.startsWith('CARD_') },
  { id: 'npc', labelKey: 'timeline.filter.npc', match: (t) => t.startsWith('NPC_') },
  { id: 'world', labelKey: 'timeline.filter.world', match: (t) => t.startsWith('WORLD_') }
]

export function TimelinePage() {
  const { events, liveConnected } = useWorldState()
  const { t, locale } = useI18n()
  const [filterId, setFilterId] = useState<EventFilter['id']>('all')
  const [chronicle, setChronicle] = useState<ServerChronicleResponse | null>(null)
  const [chronicleError, setChronicleError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .worldChronicle(40, true)
      .then((res) => {
        if (cancelled) return
        setChronicle(res)
        setChronicleError(null)
      })
      .catch((err) => {
        if (!cancelled) setChronicleError(err instanceof Error ? err.message : 'failed to load chronicle')
      })
    return () => {
      cancelled = true
    }
  }, [events.length])

  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0]!
  const visible = useMemo(
    () => events.filter((e) => isPublicNarrativeEvent(e) && filter.match(e.eventType)),
    [events, filter]
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            {t('timeline.eyebrow')}
          </div>
          <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
            {t('timeline.title')}
          </h1>
          <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">{t('timeline.description')}</p>
        </div>
        <span className={`gi-tag ${liveConnected ? 'gi-tag-moss' : ''}`}>
          ● {liveConnected ? t('timeline.live') : t('timeline.offline')}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterId(f.id)}
            className={[
              'gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
              f.id === filterId
                ? 'border-ember-600 text-ember-400 bg-ember-500/5'
                : 'border-ground-700 text-ground-300 hover:border-ground-500'
            ].join(' ')}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <section className="gi-panel border-ember-700/50 p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
            編年摘要
          </div>
          {chronicle && (
            <span className="gi-tag">{chronicle.chronicle.source} · tick {chronicle.latestTick}</span>
          )}
        </div>
        {chronicle ? (
          <p className="text-sm text-ground-100 leading-relaxed whitespace-pre-line">
            {locale === 'zh' ? chronicle.chronicle.textZh : chronicle.chronicle.textEn}
          </p>
        ) : chronicleError ? (
          <p className="text-sm text-rust-300 leading-relaxed">{chronicleError}</p>
        ) : (
          <p className="text-sm text-ground-500 italic">載入編年摘要…</p>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {visible.map((event) => (
          <TimelineRow key={event.sequence} event={event} t={t} />
        ))}
        {visible.length === 0 && (
          <div className="gi-panel p-6 text-center text-ground-500 text-sm">
            {t('timeline.empty')}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineRow({ event, t }: { event: EventSummary; t: Translator }) {
  const occurredAt = new Date(event.occurredAt)
  const tag = event.eventType.replace(/_/g, ' ')
  return (
    <article className="gi-panel p-4 lg:p-5 flex flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2 text-[11px] font-display uppercase tracking-tightest text-ground-500">
        <span className="gi-tag">{tag}</span>
        <span className="text-ember-500">#{event.sequence}</span>
        <span className="text-ground-600">·</span>
        <span>tick {event.tick}</span>
        <span className="text-ground-600">·</span>
        <span>{event.actorId}</span>
        <span className="ml-auto text-ground-500" title={occurredAt.toISOString()}>
          {formatRelative(occurredAt, t)}
        </span>
      </header>
      <p className="text-sm text-ground-200 leading-relaxed">{event.narration}</p>
      <details className="text-[11px] font-display text-ground-500">
        <summary className="cursor-pointer hover:text-ground-300 transition-colors">
          {t('timeline.payload')}
        </summary>
        <pre className="mt-2 p-2 bg-ground-900 border border-ground-700 rounded-sharp overflow-x-auto text-[11px] text-ground-300">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </details>
    </article>
  )
}

function formatRelative(at: Date, t: Translator): string {
  const diffMs = Date.now() - at.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { n: hours })
  const days = Math.round(hours / 24)
  return t('time.daysAgo', { n: days })
}
