import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type TranslationKey } from '../i18n'
import { useAuth } from '../state/AuthContext'
import { useWorldState } from '../state/WorldStateContext'
import {
  api,
  ApiError,
  type ServerCodexEntry,
  type ServerCodexResponse
} from '../api/client'
import type { CardCatalogEntry } from '../state/types'
import { CardImage } from '../components/game/CardImage'
import { CardArt } from '../components/game/cardArt'

const RANK_ORDER: Array<CardCatalogEntry['rank']> = ['S', 'A', 'B', 'C', 'D']

const RANK_TONE: Record<CardCatalogEntry['rank'], string> = {
  S: 'border-ember-500 text-ember-300 bg-ember-500/15',
  A: 'border-ember-600 text-ember-400 bg-ember-500/10',
  B: 'border-ember-700 text-ember-500 bg-ember-500/5',
  C: 'border-ground-500 text-ground-200',
  D: 'border-ground-700 text-ground-400'
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

const DEFAULT_SEQUENCING_SLOT_COUNT = 100
const DEFAULT_CARRY_SLOT_COUNT = 45

export function CodexPage() {
  const { cards } = useWorldState()
  const { t } = useI18n()
  const { account, token } = useAuth()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filterId, setFilterId] = useState<CardFilter['id']>('all')
  const [codex, setCodex] = useState<ServerCodexResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) {
      setCodex(null)
      return
    }
    try {
      const r = await api.codex(token)
      setCodex(r)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else if (err instanceof Error) setError(err.message)
    }
  }, [token])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, 5000)
    return () => window.clearInterval(id)
  }, [refresh])

  const sequencingCount = codex?.sequencingSlotCount ?? DEFAULT_SEQUENCING_SLOT_COUNT
  const carryCount = codex?.carrySlotCount ?? DEFAULT_CARRY_SLOT_COUNT

  // 把 codex entries 投影到 cards：cardId -> CodexRow，與 catalog 合成 owned 狀態
  const codexByCardId = useMemo(() => {
    const m = new Map<number, ServerCodexEntry>()
    if (!codex) return m
    for (const e of codex.entries) {
      // 優先取 sequencing；若同卡有兩張，先顯示 sequencing
      const existing = m.get(e.cardId)
      if (!existing || (existing.slotType === 'carry' && e.slotType === 'sequencing')) {
        m.set(e.cardId, e)
      }
    }
    return m
  }, [codex])

  const cardsWithOwnership = useMemo<CardCatalogEntry[]>(() => {
    return cards.map((c) => {
      const e = codexByCardId.get(c.id)
      if (!e) return { ...c, owned: false }
      return { ...c, owned: true, discoveredAtTick: e.obtainedTick }
    })
  }, [cards, codexByCardId])

  const visible = useMemo(() => {
    if (filterId === 'owned') return cardsWithOwnership.filter((c) => c.owned)
    if (filterId === 'missing') return cardsWithOwnership.filter((c) => !c.owned)
    return cardsWithOwnership
  }, [cardsWithOwnership, filterId])

  const owned = cardsWithOwnership.filter((c) => c.owned).length
  const completion = cardsWithOwnership.length > 0 ? Math.round((owned / cardsWithOwnership.length) * 100) : 0
  const selected = cardsWithOwnership.find((c) => c.id === selectedId) ?? null
  const selectedCodexEntry = selected ? codexByCardId.get(selected.id) ?? null : null

  // v0.13.0：長按 2 秒實體化 — 比 window.confirm 更符合「不可逆」操作的
  // 物理感。手指放開或滑開就取消。整個動作期間進度條從 0 → 100%。
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTickRef = useRef<number | null>(null)
  const [longPressProgress, setLongPressProgress] = useState(0)
  const [longPressCodexId, setLongPressCodexId] = useState<number | null>(null)

  const startMaterializeLongPress = useCallback(
    (codexId: number) => {
      if (!token) return
      setLongPressCodexId(codexId)
      setLongPressProgress(0)
      const startedAt = Date.now()
      const HOLD_MS = 2000
      longPressTickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt
        setLongPressProgress(Math.min(1, elapsed / HOLD_MS))
      }, 50)
      longPressTimerRef.current = window.setTimeout(async () => {
        if (longPressTickRef.current !== null) {
          window.clearInterval(longPressTickRef.current)
          longPressTickRef.current = null
        }
        setLongPressProgress(1)
        setBusy(true)
        try {
          await api.codexMaterialize(token, codexId)
          await refresh()
        } catch (err) {
          if (err instanceof ApiError) setError(err.message)
          else if (err instanceof Error) setError(err.message)
        } finally {
          setBusy(false)
          setLongPressCodexId(null)
          setLongPressProgress(0)
        }
      }, HOLD_MS)
    },
    [token, refresh]
  )
  const cancelMaterializeLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (longPressTickRef.current !== null) {
      window.clearInterval(longPressTickRef.current)
      longPressTickRef.current = null
    }
    setLongPressCodexId(null)
    setLongPressProgress(0)
  }, [])
  // unmount 時清理避免 leak
  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
      if (longPressTickRef.current !== null) window.clearInterval(longPressTickRef.current)
    },
    []
  )

  // Build sequencing slots (1..sequencingCount) — slot_index === card_id
  const sequencingByIndex = useMemo(() => {
    const m = new Map<number, ServerCodexEntry>()
    if (codex) {
      for (const e of codex.entries) {
        if (e.slotType === 'sequencing') m.set(e.slotIndex, e)
      }
    }
    return m
  }, [codex])

  const carryByIndex = useMemo(() => {
    const m = new Map<number, ServerCodexEntry>()
    if (codex) {
      for (const e of codex.entries) {
        if (e.slotType === 'carry') m.set(e.slotIndex, e)
      }
    }
    return m
  }, [codex])

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
          {t('codex.description', { owned, total: cardsWithOwnership.length, percent: completion })}
        </p>
      </header>

      {!account && (
        <div className="gi-panel border-ember-700/40 p-4 text-[12px] text-ground-300 leading-relaxed">
          {t('codex.loginGate')}
        </div>
      )}

      {error && (
        <button
          type="button"
          onClick={() => setError(null)}
          className="self-start gi-panel border-rust-700 px-3 py-2 text-[12px] text-rust-300"
        >
          {error} ×
        </button>
      )}

      <SlotPanel
        title={t('codex.sequencingSlots')}
        hint={t('codex.slotSequencingHeader')}
        count={sequencingCount}
        slots={sequencingByIndex}
        catalog={cardsWithOwnership}
        accent="ember"
        onSelect={setSelectedId}
        selectedId={selectedId}
      />

      <SlotPanel
        title={t('codex.carrySlots')}
        hint={t('codex.slotCarryHeader')}
        count={carryCount}
        slots={carryByIndex}
        catalog={cardsWithOwnership}
        accent="moss"
        onSelect={setSelectedId}
        selectedId={selectedId}
        labelByCardId
      />

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
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
            const total = cardsWithOwnership.filter((c) => c.rank === rank).length
            const ownedRank = cardsWithOwnership.filter((c) => c.rank === rank && c.owned).length
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
                  'aspect-[3/4] relative overflow-hidden border rounded-sharp transition-colors',
                  card.owned
                    ? RANK_TONE[card.rank]
                    : 'border-ground-800 bg-ground-900',
                  selectedId === card.id ? 'ring-2 ring-ember-500 ring-offset-1 ring-offset-ground-900' : ''
                ].join(' ')}
              >
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className={`h-full w-full object-cover ${card.owned ? '' : 'opacity-25 grayscale'}`}
                  />
                ) : (
                  <CardArt
                    cardId={card.id}
                    rank={card.rank}
                    showRankBadge={false}
                    className={`h-full w-full ${card.owned ? '' : 'opacity-25 grayscale'}`}
                  />
                )}
                {!card.owned && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display font-extrabold text-sm text-ground-600">{card.rank}</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          <aside className="gi-panel p-5 flex flex-col gap-3 lg:sticky lg:top-20 self-start min-h-[200px]">
            {selected ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-16 shrink-0 aspect-[3/4] overflow-hidden rounded-sharp bg-ground-800">
                    <CardImage
                      rank={selected.rank}
                      nameZh={selected.name}
                      cardId={selected.id}
                      {...(selected.imageUrl ? { imageUrl: selected.imageUrl } : {})}
                      className="w-full h-full object-cover"
                      placeholderSize={32}
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
                        #{String(selected.id).padStart(3, '0')}
                      </span>
                      <span className={`gi-tag ${RANK_TONE[selected.rank]}`}>
                        {selected.rank}
                      </span>
                    </div>
                    <h2 className="font-display font-extrabold text-xl tracking-tightest text-ground-100 leading-tight">
                      {selected.name}
                    </h2>
                  </div>
                </div>
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
                {selected.owned && selectedCodexEntry && (
                  <div className="self-start flex flex-col gap-1">
                    <button
                      type="button"
                      onPointerDown={() =>
                        startMaterializeLongPress(selectedCodexEntry.id)
                      }
                      onPointerUp={cancelMaterializeLongPress}
                      onPointerLeave={cancelMaterializeLongPress}
                      onPointerCancel={cancelMaterializeLongPress}
                      onContextMenu={(e) => e.preventDefault()}
                      disabled={busy}
                      title="長按 2 秒實體化（不可逆）"
                      className="relative gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-rust-300 border border-rust-700 hover:bg-rust-500/10 rounded-sharp disabled:opacity-60 select-none overflow-hidden"
                    >
                      <span className="relative z-10">
                        {busy
                          ? t('codex.materializing')
                          : longPressCodexId === selectedCodexEntry.id
                            ? '按住中… 放開取消'
                            : `${t('codex.materialize')} · 長按 2 秒`}
                      </span>
                      {longPressCodexId === selectedCodexEntry.id && (
                        <span
                          className="absolute inset-y-0 left-0 bg-rust-500/30 transition-[width] duration-75 ease-linear z-0"
                          style={{ width: `${longPressProgress * 100}%` }}
                        />
                      )}
                    </button>
                    <span className="text-[10px] text-ground-500 italic">
                      {t('codex.materializeWarning')}
                    </span>
                  </div>
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
  slots: Map<number, ServerCodexEntry>
  catalog: CardCatalogEntry[]
  accent: 'ember' | 'moss'
  onSelect: (cardId: number) => void
  selectedId: number | null
  /** carry: slot 索引顯示 cardId（不是 slotIndex），讓玩家看得出每格放什麼 */
  labelByCardId?: boolean
}

function SlotPanel({
  title,
  hint,
  count,
  slots,
  catalog,
  accent,
  onSelect,
  selectedId,
  labelByCardId
}: SlotPanelProps) {
  const accentBorder = accent === 'ember' ? 'border-ember-700/50' : 'border-moss-600/40'
  const catalogById = useMemo(() => {
    const m = new Map<number, CardCatalogEntry>()
    for (const c of catalog) m.set(c.id, c)
    return m
  }, [catalog])
  return (
    <section className={`gi-panel ${accentBorder} p-5 flex flex-col gap-3`}>
      <header>
        <div className={`font-display text-[11px] uppercase tracking-tightest ${accent === 'ember' ? 'text-ember-500' : 'text-moss-400'}`}>
          {title}
        </div>
        <p className="mt-1 text-[11px] text-ground-500 leading-relaxed">{hint}</p>
      </header>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))' }}
      >
        {Array.from({ length: count }, (_, i) => {
          const idx = i + 1
          const entry = slots.get(idx)
          const card = entry ? catalogById.get(entry.cardId) : null
          if (entry && card) {
            const isSelected = selectedId === card.id
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelect(card.id)}
                title={`${card.name} · #${idx}`}
                className={[
                  'aspect-[3/4] flex flex-col items-center justify-between p-0.5 border rounded-sharp text-[9px] font-display tracking-tightest',
                  RANK_TONE[card.rank],
                  isSelected ? 'ring-2 ring-ember-500 ring-offset-1 ring-offset-ground-900' : ''
                ].join(' ')}
              >
                <span className="text-[9px]">{labelByCardId ? `#${entry.cardId}` : `#${idx}`}</span>
                <span className="font-extrabold text-[12px]">{card.rank}</span>
              </button>
            )
          }
          return (
            <span
              key={idx}
              title={`#${idx}`}
              className="aspect-[3/4] flex items-center justify-center border border-dashed border-ground-700 rounded-sharp text-[9px] font-display tracking-tightest text-ground-700"
            >
              {idx}
            </span>
          )
        })}
      </div>
    </section>
  )
}
