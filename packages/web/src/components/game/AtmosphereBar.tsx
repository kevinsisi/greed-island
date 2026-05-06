import { useI18n } from '../../i18n'
import { useWorldState } from '../../state/WorldStateContext'

export function AtmosphereBar() {
  const { world, liveConnected, source } = useWorldState()
  const { t } = useI18n()
  const weather = String(world.facts['weather'] ?? '—')
  const season = String(world.facts['season'] ?? '—')
  const rareOpen = Boolean(world.facts['rareWindowOpen'])
  const closesAtTick = Number(world.facts['rareWindowClosesAtTick'] ?? 0)
  const remaining = rareOpen && closesAtTick > world.tick ? closesAtTick - world.tick : 0

  return (
    <div className="border-b border-ground-800 bg-gradient-to-b from-ground-900 to-ground-900/40 px-4 sm:px-6 lg:px-10 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-display uppercase tracking-tightest">
        <span className="text-ember-400">{t('atmos.tick', { tick: world.tick.toLocaleString() })}</span>
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
