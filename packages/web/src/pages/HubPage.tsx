import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { AreaCard } from '../components/game/AreaCard'

export function HubPage() {
  const { map, npcs } = useWorldState()
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('hub.eyebrow')}
        </div>
        <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
          {t('hub.title')}
        </h1>
        <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">{t('hub.description')}</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {map.tiles.map((tile) => (
          <AreaCard key={tile.id} tile={tile} npcs={npcs} />
        ))}
      </section>
    </div>
  )
}
