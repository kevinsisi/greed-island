import { useMemo, useState } from 'react'
import { useI18n, type TranslationKey } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { useWorldState } from '../state/WorldStateContext'
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
  H: 'border-ground-800 text-ground-600'
}

interface CardFilter {
  id: 'all' | 'owned' | 'missing'
  labelKey: TranslationKey
}

const FILTERS: CardFilter[] = [
  { id: 'all', labelKey: 'codex.filter.all' },
  { id: 'owned', labelKey: 'codex.filter.owned' },
  { id: 'missing', labelKey: 'codex.filter.missing' }
]

const SEQUENCING_SLOT_COUNT = 5
const CARRY_SLOT_COUNT = 3

export function CodexPage() {
  const { cards } = useWorldState()
  const { t } = useI18n()
  const { account } = useAuth()
  const [selectedId, setSelectedId] = useState<number | null>(cards.find((c) => c.owned)?.id ?? null)
  const [filterId, setFilterId] = useState<CardFilter['id']>('all')

  const visible = useMemo(() => {
    if (filterId === 'owned') return cards.filter((c) => c.owned)
    if (filterId === 'missing') return cards.filter((c) => !c.owned)
    return cards
  }, [cards, filterId])

  const ownedCards = useMemo(() => cards.filter((c) => c.owned), [cards])
  const sequencingPicks = ownedCards.slice(0, SEQUENCING_SLOT_COUNT)
  const carryPicks = ownedCards.slice(SEQUENCING_SLOT_COUNT, SEQUENCING_SLOT_COUNT + CARRY_SLOT_COUNT)
  const owned = ownedCards.length
  const completion = cards.length > 0 ? Math.round((owned / cards.length) * 100) : 0
  const selected = cards.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('codex.eyebrow')}
        </div>
        <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
          {t('codex.title')}
        </h1>
        <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">
          {t('codex.description', { owned, total: cards.length, percent: completion })}
        </p>
      </header>

      {!account && (
        <div className="gi-panel border-ember-700/40 p-4 text-[12px] text-ground-300 leading-relaxed">
          {t('codex.loginGate')}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SlotPanel
          title={t('codex.sequencingSlots')}
          hint={t('codex.sequencingSlotsHint')}
          count={SEQUENCING_SLOT_COUNT}
          picks={sequencingPicks}
          emptyLabel={t('codex.slotEmpty')}
          accent="ember"
        />
        <SlotPanel
          title={t('codex.carrySlots')}
          hint={t('codex.carrySlotsHint')}
          count={CARRY_SLOT_COUNT}
          picks={carryPicks}
          emptyLabel={t('codex.slotEmpty')}
          accent="moss"
        />
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-[14px] tracking-tightest text-ground-100">
              {t('codex.catalog')}
            </h2>
            <p className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
              {t('codex.catalogHint')}
            </p>
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterId(f.id)}
                className={[
                  'gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border rounded-sharp transition-colors',
                  filterId === f.id
                    ? 'border-ember-600 text-ember-400 bg-ember-500/5'
                    : 'border-ground-700 text-ground-300 hover:border-ground-500'
                ].join(' ')}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        </header>

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
                  selectedId === card.id ? 'ring-2 ring-ember-500 ring-offset-1 ring-offset-ground-900' : ''
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

          <aside className="gi-panel p-5 flex flex-col gap-3 lg:sticky lg:top-20 self-start min-h-[200px]">
            {selected ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
                    #{String(selected.id).padStart(3, '0')}
                  </span>
                  <span className={`gi-tag ${RANK_TONE[selected.rank]}`}>
                    {selected.rank}
                  </span>
                </div>
                <h2 className="font-display font-extrabold text-2xl tracking-tightest text-ground-100">
                  {selected.name}
                </h2>
                <p className="text-sm text-ground-400 leading-relaxed">{selected.description}</p>
                <div className="gi-divider" />
                <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
                  {t('codex.detail.lore')}
                </div>
                <p className="text-sm text-ground-200 leading-relaxed">{selected.story}</p>
                {selected.owned && selected.discoveredAtTick !== undefined && (
                  <>
                    <div className="gi-divider" />
                    <div className="text-[11px] font-display uppercase tracking-tightest text-moss-400">
                      {t('codex.detail.discoveredAt', { tick: selected.discoveredAtTick })}
                    </div>
                  </>
                )}
                {!selected.owned && (
                  <>
                    <div className="gi-divider" />
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                      {t('codex.detail.notDiscovered')}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="text-sm text-ground-500">{t('codex.detail.empty')}</div>
            )}
          </aside>
        </div>
      </section>
    </div>
  )
}

interface SlotPanelProps {
  title: string
  hint: string
  count: number
  picks: CardCatalogEntry[]
  emptyLabel: string
  accent: 'ember' | 'moss'
}

function SlotPanel({ title, hint, count, picks, emptyLabel, accent }: SlotPanelProps) {
  const accentBorder = accent === 'ember' ? 'border-ember-700/50' : 'border-moss-600/40'
  return (
    <div className={`gi-panel ${accentBorder} p-5 flex flex-col gap-3`}>
      <header>
        <div className={`font-display text-[11px] uppercase tracking-tightest ${accent === 'ember' ? 'text-ember-500' : 'text-moss-400'}`}>
          {title}
        </div>
        <p className="mt-1 text-[11px] text-ground-500 leading-relaxed">{hint}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }, (_, index) => {
          const card = picks[index]
          if (card) {
            return (
              <div
                key={card.id}
                className={`w-16 aspect-[3/4] flex flex-col items-center justify-between p-1.5 border rounded-sharp text-[10px] font-display tracking-tightest ${RANK_TONE[card.rank]}`}
              >
                <span>#{String(card.id).padStart(3, '0')}</span>
                <span className="font-extrabold text-base">{card.rank}</span>
                <span>●</span>
              </div>
            )
          }
          return (
            <div
              key={`empty-${index}`}
              className="w-16 aspect-[3/4] flex items-center justify-center border border-dashed border-ground-700 rounded-sharp text-[10px] font-display uppercase tracking-tightest text-ground-600"
            >
              {emptyLabel}
            </div>
          )
        })}
      </div>
    </div>
  )
}
