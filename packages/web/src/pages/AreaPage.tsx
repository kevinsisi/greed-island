import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { biomeLabel, loreFor } from '../state/areaLore'
import { NpcDialog } from '../components/game/NpcDialog'
import type { NpcSummary } from '../state/types'

export function AreaPage() {
  const { tileId = '' } = useParams<{ tileId: string }>()
  const { t, locale } = useI18n()
  const { map, npcs, events } = useWorldState()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)

  const tile = map.tiles.find((entry) => entry.id === tileId)
  const lore = loreFor(tileId)
  const tileNameById = useMemo(() => {
    const acc: Record<string, string> = {}
    for (const entry of map.tiles) acc[entry.id] = entry.name
    return acc
  }, [map.tiles])

  const occupants = useMemo(
    () => npcs.filter((npc) => npc.location === tileId),
    [npcs, tileId]
  )

  const localEvents = useMemo(() => {
    if (!tile) return []
    const occupantIds = new Set(occupants.map((n) => n.id))
    return events.filter((event) => {
      if (occupantIds.has(event.actorId)) return true
      const payload = event.payload ?? {}
      const from = String((payload as { from?: unknown }).from ?? '')
      const to = String((payload as { to?: unknown }).to ?? '')
      return from === tileId || to === tileId
    }).slice(0, 12)
  }, [events, occupants, tile, tileId])

  if (!tile) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="self-start text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ember-400 transition-colors">
        {t('area.back')}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('area.eyebrow', { biome: biomeLabel(tile.biome, locale) })}
        </div>
        <div className="flex items-end gap-3">
          <span aria-hidden="true" className="text-4xl text-ember-500/80 leading-none">
            {lore.glyph}
          </span>
          <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
            {tile.name}
          </h1>
        </div>
      </header>

      <section className="gi-panel p-5 flex flex-col gap-3">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('area.scene')}
        </div>
        <p className="text-[15px] text-ground-100 leading-relaxed">{lore.scene[locale]}</p>
        <p className="text-[12px] text-ground-500 italic leading-relaxed">{lore.whisper[locale]}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('area.npcs')}
        </h2>
        {occupants.length === 0 ? (
          <div className="gi-panel p-5 text-sm text-ground-500 italic">
            {t('area.npcsEmpty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {occupants.map((npc) => (
              <button
                key={npc.id}
                type="button"
                onClick={() => setActiveNpc(npc)}
                className="gi-panel p-5 text-left flex flex-col gap-2 hover:border-ember-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-ember-600/60 bg-ground-900 text-[15px] text-ember-300 font-display font-extrabold">
                    {npc.name.charAt(0)}
                  </span>
                  <div>
                    <div className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
                      {npc.role}
                    </div>
                    <div className="font-display font-extrabold text-base tracking-tightest text-ground-100">
                      {npc.name}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                  {t('npc.relationship')} <span className="text-ground-200">{npc.relationshipScore}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('area.events')}
        </h2>
        {localEvents.length === 0 ? (
          <div className="gi-panel p-5 text-sm text-ground-500 italic">
            {t('area.eventsEmpty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {localEvents.map((event) => {
              const payload = event.payload ?? {}
              const from = (payload as { from?: unknown }).from
              const to = (payload as { to?: unknown }).to
              const fromName = typeof from === 'string' ? (tileNameById[from] ?? from) : null
              const toName = typeof to === 'string' ? (tileNameById[to] ?? to) : null
              return (
                <li
                  key={event.sequence}
                  className="gi-panel p-3 text-[13px] text-ground-200 leading-relaxed"
                >
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-1">
                    tick {event.tick} · {event.actorId}
                  </div>
                  {event.narration ? (
                    <div className="text-ground-100">{event.narration}</div>
                  ) : (
                    <div className="text-ground-300">
                      {event.eventType}
                      {fromName && toName ? (
                        <span className="text-ground-500"> · {fromName} → {toName}</span>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}
