import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { EventRow } from '../components/common/EventRow'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n'

interface EventFilter {
  id: 'all' | 'cards' | 'npc' | 'world'
  labelKey: TranslationKey
  match: (eventType: string) => boolean
}

const FILTERS: EventFilter[] = [
  { id: 'all',   labelKey: 'events.filter.all',   match: () => true },
  { id: 'cards', labelKey: 'events.filter.cards', match: (t) => t.startsWith('CARD_') },
  { id: 'npc',   labelKey: 'events.filter.npc',   match: (t) => t.startsWith('NPC_') },
  { id: 'world', labelKey: 'events.filter.world', match: (t) => t.startsWith('WORLD_') },
]

export function EventsPage() {
  const { events, liveConnected } = useWorldState()
  const { t } = useI18n()
  const [filterId, setFilterId] = useState<EventFilter['id']>('all')

  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0]!
  const visible = useMemo(() => events.filter((e) => filter.match(e.eventType)), [events, filter])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('events.eyebrow')}
        title={t('events.title')}
        description={t('events.description')}
        actions={
          <span
            className={`gi-tag ${liveConnected ? 'gi-tag-moss' : ''}`}
            title="connection state of /api/events/stream"
          >
            ● {liveConnected ? t('events.live') : t('events.offline')}
          </span>
        }
      />

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
                : 'border-ground-700 text-ground-300 hover:border-ground-500',
            ].join(' ')}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((event) => (
          <EventRow key={event.sequence} event={event} />
        ))}
        {visible.length === 0 && (
          <div className="gi-panel p-6 text-center text-ground-500 text-sm">
            {t('events.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
