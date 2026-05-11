import { useEffect } from 'react'
import { useI18n } from '../../i18n'
import { useWorldState } from '../../state/WorldStateContext'
import { startFixtureSourceRecovery } from '../../state/visibleFixtureRecovery'

const WORLD_MINUTES_PER_HOUR = 60
const WORLD_HOURS_PER_DAY = 24

export function AtmosphereBar() {
  const { world, liveConnected, source, refreshWorld } = useWorldState()
  const { t } = useI18n()
  const weather = String(world.facts['weather'] ?? '—')
  const season = String(world.facts['season'] ?? '—')
  const time = formatWorldTime(world.tick, world.worldConfig)
  const rareOpen = Boolean(world.facts['rareWindowOpen'])
  const closesAtTick = Number(world.facts['rareWindowClosesAtTick'] ?? 0)
  const remaining = rareOpen && closesAtTick > world.tick ? closesAtTick - world.tick : 0

  useEffect(() => {
    return startFixtureSourceRecovery({ source, refreshWorld, windowTarget: window })
  }, [source, refreshWorld])

  return (
    <div className="border-b border-ground-800 bg-gradient-to-b from-ground-900 to-ground-900/40 px-4 sm:px-6 lg:px-10 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-display uppercase tracking-tightest">
        <span className="text-ember-400">{t('atmos.tick', { tick: world.tick.toLocaleString() })}</span>
        <span className="text-ground-700">|</span>
        <span className="text-ground-400">
          時間 <span className="text-ground-100">{time}</span>{' '}
          <span className="text-ground-500">{world.worldConfig.timezone}</span>
        </span>
        <span className="text-ground-700">|</span>
        <span className="text-ground-400">
          {t('atmos.weather')} <span className="text-ground-100">{weather}</span>
        </span>
        <span className="text-ground-700">|</span>
        <span className="text-ground-400">
          {t('atmos.season')} <span className="text-ground-100">{season}</span>
        </span>
        <span className="text-ground-700">|</span>
        <span className={liveConnected ? 'text-moss-400' : 'text-ground-500'}>
          {liveConnected ? t('atmos.live') : t('atmos.idle')}
        </span>
        {source === 'fixture' && (
          <>
            <span className="text-ground-700">|</span>
            <span className="text-rust-500">{t('atmos.fixture')}</span>
          </>
        )}
        {rareOpen && (
          <span className="ml-auto inline-flex items-center gap-2 px-3 py-1 border border-ember-600/60 bg-ember-500/10 text-ember-300 rounded-sharp animate-flicker">
            <span>{t('atmos.rareWindow')}</span>
            {remaining > 0 && (
              <span className="text-ember-200/80">{t('atmos.rareWindowClosesIn', { ticks: remaining })}</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function formatWorldTime(
  tick: number,
  config: Readonly<{ tickDurationMs: number; ticksPerDay: number; timezone: string; timezoneOffsetMinutes: number }>
): string {
  const offsetTicks =
    (config.timezoneOffsetMinutes / (WORLD_HOURS_PER_DAY * WORLD_MINUTES_PER_HOUR)) *
    config.ticksPerDay
  const tickOfDay = ((tick + offsetTicks) % config.ticksPerDay + config.ticksPerDay) % config.ticksPerDay
  const ticksPerWorldHour = config.ticksPerDay / WORLD_HOURS_PER_DAY
  const hour = Math.floor(tickOfDay / ticksPerWorldHour)
  const minute = Math.floor((tickOfDay % ticksPerWorldHour) / (ticksPerWorldHour / WORLD_MINUTES_PER_HOUR))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
