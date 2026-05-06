import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { EventRow } from '../components/common/EventRow'
import { useWorldState } from '../state/WorldStateContext'

const FILTERS: Array<{ id: string; label: string; match: (eventType: string) => boolean }> = [
  { id: 'all', label: '全部', match: () => true },
  { id: 'cards', label: '卡片', match: (t) => t.startsWith('CARD_') },
  { id: 'npc', label: 'NPC', match: (t) => t.startsWith('NPC_') },
  { id: 'world', label: '世界', match: (t) => t.startsWith('WORLD_') },
]

export function EventsPage() {
  const { events, liveConnected } = useWorldState()
  const [filterId, setFilterId] = useState<string>('all')

  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0]!
  const visible = useMemo(() => events.filter((e) => filter.match(e.eventType)), [events, filter])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="WORLD TIMELINE"
        title="事件時間軸"
        description="EventLog 是這個世界唯一的真相來源。"
        actions={
          <span
            className={`gi-tag ${liveConnected ? 'gi-tag-moss' : ''}`}
            title="connection state of /api/events/stream"
          >
            ● {liveConnected ? 'LIVE' : 'OFFLINE'}
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
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((event) => (
          <EventRow key={event.sequence} event={event} />
        ))}
        {visible.length === 0 && (
          <div className="gi-panel p-6 text-center text-ground-500 text-sm">
            沒有符合的事件。
          </div>
        )}
      </div>
    </div>
  )
}
