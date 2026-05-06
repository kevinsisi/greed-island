import { PageHeader } from '../components/common/PageHeader'
import { EventRow } from '../components/common/EventRow'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n } from '../i18n'

export function SinceLastVisitPage() {
  const { dashboard, events } = useWorldState()
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('since.eyebrow')}
        title={t('since.title')}
        description={t('since.description', { ticks: dashboard.ticksSinceLastVisit })}
      />
      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <EventRow key={event.sequence} event={event} />
        ))}
      </div>
    </div>
  )
}
