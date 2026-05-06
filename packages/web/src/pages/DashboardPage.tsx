import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Stat } from '../components/common/Stat'
import { EventRow } from '../components/common/EventRow'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n } from '../i18n'

export function DashboardPage() {
  const { dashboard, npcs } = useWorldState()
  const { t } = useI18n()
  const { world, cardsOwned, cardsTotal, recentEvents, rareWindowOpen, ticksSinceLastVisit } =
    dashboard
  const completion = Math.round((cardsOwned / cardsTotal) * 100)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          rareWindowOpen ? (
            <Link
              to="/events"
              className="gi-touch px-4 inline-flex items-center text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600/60 hover:bg-ember-500/10 transition-colors rounded-sharp animate-flicker"
            >
              {t('dashboard.rareWindowOpen')}
            </Link>
          ) : null
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label={t('dashboard.stats.tick')}
          value={world.tick.toLocaleString()}
          tone="ember"
          hint={t('dashboard.stats.tick.hint')}
        />
        <Stat
          label={t('dashboard.stats.events')}
          value={world.eventCount.toLocaleString()}
          hint={t('dashboard.stats.events.hint', { seq: world.lastSequence })}
        />
        <Stat
          label={t('dashboard.stats.npcs')}
          value={npcs.length}
          hint={t('dashboard.stats.npcs.hint')}
        />
        <Stat
          label={t('dashboard.stats.cards')}
          value={`${cardsOwned} / ${cardsTotal}`}
          tone="ember"
          hint={t('dashboard.stats.cards.hint', { percent: completion })}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Stat
          label={t('dashboard.stats.weather')}
          value={String(world.facts.weather ?? '—')}
          hint={t('dashboard.stats.weather.hint')}
        />
        <Stat
          label={t('dashboard.stats.season')}
          value={String(world.facts.season ?? '—')}
          hint={t('dashboard.stats.season.hint')}
        />
        <Stat
          label={t('dashboard.stats.sinceLast')}
          value={t('time.tickUnit', { n: ticksSinceLastVisit })}
          tone="moss"
          hint={t('dashboard.stats.sinceLast.hint')}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
            {t('dashboard.recent.heading')}
          </h2>
          <Link to="/events" className="gi-link text-[11px] font-display uppercase tracking-tightest">
            {t('dashboard.recent.viewAll')}
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {recentEvents.map((event) => (
            <EventRow key={event.sequence} event={event} />
          ))}
        </div>
      </section>
    </div>
  )
}
