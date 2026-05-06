import type { EventSummary } from '../../state/types'

const EVENT_TONE: Record<string, 'ember' | 'moss' | 'rust' | 'neutral'> = {
  CARD_DISCOVERED: 'ember',
  CARD_TRANSFERRED: 'ember',
  WORLD_RARE_WINDOW_OPENED: 'ember',
  NPC_RELATIONSHIP_DECAYED: 'rust',
  NPC_MOVE: 'neutral',
  NPC_TRADE: 'moss',
  WORLD_WEATHER_CHANGED: 'neutral',
}

const TONE_CLASS = {
  ember: 'gi-tag-ember',
  moss: 'gi-tag-moss',
  rust: 'gi-tag-rust',
  neutral: '',
}

interface EventRowProps {
  event: EventSummary
}

export function EventRow({ event }: EventRowProps) {
  const tone = EVENT_TONE[event.eventType] ?? 'neutral'
  const occurredAt = new Date(event.occurredAt)
  const relative = formatRelative(occurredAt)
  const tag = event.eventType.replace(/_/g, ' ')

  return (
    <article className="gi-panel p-4 lg:p-5 flex flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2 text-[11px] font-display uppercase tracking-tightest text-ground-500">
        <span className={`gi-tag ${TONE_CLASS[tone]}`}>{tag}</span>
        <span className="text-ember-500">#{event.sequence}</span>
        <span className="text-ground-600">·</span>
        <span>tick {event.tick}</span>
        <span className="text-ground-600">·</span>
        <span>{event.actorId}</span>
        <span className="ml-auto text-ground-500" title={occurredAt.toISOString()}>
          {relative}
        </span>
      </header>
      {event.narration ? (
        <p className="text-sm text-ground-200 leading-relaxed">{event.narration}</p>
      ) : (
        <p className="text-sm text-ground-500 italic">尚未生成敘事 · waiting on narration runtime</p>
      )}
      <details className="text-[11px] font-display text-ground-500">
        <summary className="cursor-pointer hover:text-ground-300 transition-colors">
          payload
        </summary>
        <pre className="mt-2 p-2 bg-ground-900 border border-ground-700 rounded-sharp overflow-x-auto text-[11px] text-ground-300">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </details>
    </article>
  )
}

function formatRelative(at: Date): string {
  const diffMs = Date.now() - at.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return '剛才'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.round(hours / 24)
  return `${days} 天前`
}
