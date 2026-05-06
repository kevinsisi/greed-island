import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Stat } from '../components/common/Stat'
import { EventRow } from '../components/common/EventRow'
import { useWorldState } from '../state/WorldStateContext'

export function DashboardPage() {
  const { dashboard, npcs } = useWorldState()
  const { world, cardsOwned, cardsTotal, recentEvents, rareWindowOpen, ticksSinceLastVisit } =
    dashboard
  const completion = Math.round((cardsOwned / cardsTotal) * 100)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="WORLD PULSE"
        title="貪婪之島 · 總覽"
        description="世界從不為你停下。這裡是它正在發生的一切。"
        actions={
          rareWindowOpen ? (
            <Link
              to="/events"
              className="gi-touch px-4 inline-flex items-center text-[11px] font-display uppercase tracking-tightest text-ember-400 border border-ember-600/60 hover:bg-ember-500/10 transition-colors rounded-sharp animate-flicker"
            >
              ◆ 稀有窗口開啟中
            </Link>
          ) : null
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="當前刻度" value={world.tick.toLocaleString()} tone="ember" hint="ticks since genesis" />
        <Stat
          label="事件總數"
          value={world.eventCount.toLocaleString()}
          hint={`seq #${world.lastSequence}`}
        />
        <Stat label="活躍 NPC" value={npcs.length} hint="autonomous actors" />
        <Stat
          label="收藏進度"
          value={`${cardsOwned} / ${cardsTotal}`}
          tone="ember"
          hint={`${completion}% complete`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Stat label="天氣" value={String(world.facts.weather ?? '—')} hint="world fact: weather" />
        <Stat label="季節" value={String(world.facts.season ?? '—')} hint="world fact: season" />
        <Stat
          label="不在期間經過"
          value={`${ticksSinceLastVisit} 刻`}
          tone="moss"
          hint="since you last visited"
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
            最近事件
          </h2>
          <Link to="/events" className="gi-link text-[11px] font-display uppercase tracking-tightest">
            完整時間軸 →
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
