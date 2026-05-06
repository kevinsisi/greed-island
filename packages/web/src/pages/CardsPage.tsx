import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { useWorldState } from '../state/WorldStateContext'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n'
import type { CardCatalogEntry } from '../state/types'

const RANK_ORDER: Array<CardCatalogEntry['rank']> = ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const RANK_TONE: Record<CardCatalogEntry['rank'], string> = {
  SS: 'border-ember-500 text-ember-300 bg-ember-500/15',
  S: 'border-ember-600 text-ember-400 bg-ember-500/10',
  A: 'border-ember-700 text-ember-500 bg-ember-500/5',
  B: 'border-ground-500 text-ground-200',
  C: 'border-ground-600 text-ground-300',
  D: 'border-ground-600 text-ground-400',
  E: 'border-ground-700 text-ground-400',
  F: 'border-ground-700 text-ground-500',
  G: 'border-ground-800 text-ground-500',
  H: 'border-ground-800 text-ground-600',
}

interface CardFilter {
  id: 'all' | 'owned' | 'missing'
  labelKey: TranslationKey
}

const FILTERS: CardFilter[] = [
  { id: 'all',     labelKey: 'cards.filter.all' },
  { id: 'owned',   labelKey: 'cards.filter.owned' },
  { id: 'missing', labelKey: 'cards.filter.missing' },
]

export function CardsPage() {
  const { cards } = useWorldState()
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState<number | null>(cards.find((c) => c.owned)?.id ?? null)
  const [filterId, setFilterId] = useState<CardFilter['id']>('all')

  const visible = useMemo(() => {
    if (filterId === 'owned') return cards.filter((c) => c.owned)
    if (filterId === 'missing') return cards.filter((c) => !c.owned)
    return cards
  }, [cards, filterId])

  const owned = cards.filter((c) => c.owned).length
  const completion = Math.round((owned / cards.length) * 100)
  const selected = cards.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('cards.eyebrow')}
        title={t('cards.title')}
        description={t('cards.description', { owned, total: cards.length, percent: completion })}
      />

      <div className="flex flex-wrap gap-2 items-center">
        {RANK_ORDER.slice(0, 5).map((rank) => {
          const total = cards.filter((c) => c.rank === rank).length
          const ownedRank = cards.filter((c) => c.rank === rank && c.owned).length
          if (total === 0) return null
          return (
            <span key={rank} className={`gi-tag ${RANK_TONE[rank]}`}>
              {rank} · {ownedRank}/{total}
            </span>
          )
        })}
        <div className="ml-auto flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterId(f.id)}
              className={[
                'gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
                filterId === f.id
                  ? 'border-ember-600 text-ember-400 bg-ember-500/5'
                  : 'border-ground-700 text-ground-300 hover:border-ground-500',
              ].join(' ')}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-1.5">
          {visible.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setSelectedId(card.id)}
              title={card.name}
              className={[
                'aspect-[3/4] flex flex-col items-center justify-between p-1.5 border rounded-sharp transition-colors text-[10px] font-display tracking-tightest',
                card.owned
                  ? RANK_TONE[card.rank]
                  : 'border-ground-800 text-ground-700 bg-ground-900',
                selectedId === card.id ? 'ring-2 ring-ember-500 ring-offset-1 ring-offset-ground-900' : '',
              ].join(' ')}
            >
              <span className="text-[10px]">#{String(card.id).padStart(3, '0')}</span>
              <span className="font-extrabold text-base">{card.rank}</span>
              <span className={card.owned ? 'text-current' : 'text-ground-700'}>
                {card.owned ? '●' : '○'}
              </span>
            </button>
          ))}
        </div>

        <aside className="gi-panel p-5 flex flex-col gap-3 lg:sticky lg:top-20 self-start">
          {selected ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
                  #{String(selected.id).padStart(3, '0')}
                </span>
                <span className={`gi-tag ${RANK_TONE[selected.rank]}`}>
                  Rank {selected.rank}
                </span>
              </div>
              <h2 className="font-display font-extrabold text-2xl tracking-tightest text-ground-100">
                {selected.name}
              </h2>
              <p className="text-sm text-ground-400 leading-relaxed">{selected.description}</p>
              <div className="gi-divider" />
              <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
                {t('cards.detail.lore')}
              </div>
              <p className="text-sm text-ground-200 leading-relaxed">{selected.story}</p>
              {selected.owned && selected.discoveredAtTick !== undefined && (
                <>
                  <div className="gi-divider" />
                  <div className="text-[11px] font-display uppercase tracking-tightest text-moss-400">
                    {t('cards.detail.discoveredAt', { tick: selected.discoveredAtTick })}
                  </div>
                </>
              )}
              {!selected.owned && (
                <>
                  <div className="gi-divider" />
                  <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                    {t('cards.detail.notDiscovered')}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-sm text-ground-500">{t('cards.detail.empty')}</div>
          )}
        </aside>
      </div>
    </div>
  )
}
