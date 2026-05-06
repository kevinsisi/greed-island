import { PageHeader } from '../components/common/PageHeader'
import { EventRow } from '../components/common/EventRow'
import { useWorldState } from '../state/WorldStateContext'

export function SinceLastVisitPage() {
  const { dashboard, events } = useWorldState()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="WHILE YOU WERE AWAY"
        title="你不在的時候"
        description={`世界跳了 ${dashboard.ticksSinceLastVisit} 刻。以下是發生過的事。`}
      />
      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <EventRow key={event.sequence} event={event} />
        ))}
      </div>
    </div>
  )
}
