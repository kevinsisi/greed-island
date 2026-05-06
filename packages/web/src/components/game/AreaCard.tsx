import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { biomeLabel, loreFor } from '../../state/areaLore'
import type { MapTile, NpcSummary } from '../../state/types'

const BIOME_BG: Record<MapTile['biome'], string> = {
  grass: 'from-moss-600/20 via-ground-900 to-ground-900',
  forest: 'from-emerald-900/30 via-ground-900 to-ground-900',
  mountain: 'from-ground-700/40 via-ground-900 to-ground-900',
  desert: 'from-ember-700/20 via-ground-900 to-ground-900',
  water: 'from-cyan-900/30 via-ground-900 to-ground-900',
  ruin: 'from-rust-600/20 via-ground-900 to-ground-900'
}

interface AreaCardProps {
  tile: MapTile
  npcs: NpcSummary[]
}

export function AreaCard({ tile, npcs }: AreaCardProps) {
  const { t, locale } = useI18n()
  const lore = loreFor(tile.id)
  const sceneText = lore.scene[locale]

  return (
    <Link
      to={`/area/${tile.id}`}
      className={`group relative overflow-hidden rounded-sharp border border-ground-700 bg-gradient-to-br ${BIOME_BG[tile.biome]} hover:border-ember-600 transition-colors p-5 flex flex-col gap-3 min-h-[200px]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500 mb-1">
            {biomeLabel(tile.biome, locale)}
          </div>
          <h3 className="font-display font-extrabold text-xl tracking-tightest text-ground-100">
            {tile.name}
          </h3>
        </div>
        <span
          aria-hidden="true"
          className="text-3xl text-ember-500/80 group-hover:text-ember-400 transition-colors"
        >
          {lore.glyph}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-ground-300 line-clamp-3">{sceneText}</p>

      <footer className="mt-auto flex items-center justify-between text-[11px] font-display uppercase tracking-tightest">
        <span className="text-ground-500">
          {tile.npcIds.length > 0
            ? t('hub.npcCount', { count: tile.npcIds.length })
            : t('hub.empty')}
        </span>
        <span className="text-ember-400 group-hover:text-ember-300 transition-colors">
          {t('hub.enter')}
        </span>
      </footer>

      {tile.npcIds.length > 0 && (
        <div className="absolute top-3 right-3 flex -space-x-1">
          {tile.npcIds.slice(0, 3).map((id) => {
            const npc = npcs.find((n) => n.id === id)
            const initial = npc?.name?.charAt(0) ?? '?'
            return (
              <span
                key={id}
                title={npc?.name ?? id}
                className="w-6 h-6 inline-flex items-center justify-center rounded-full border border-ember-600/60 bg-ground-900 text-[11px] text-ember-300 font-display font-extrabold"
              >
                {initial}
              </span>
            )
          })}
        </div>
      )}
    </Link>
  )
}
