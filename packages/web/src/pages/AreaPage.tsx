import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { biomeLabel, loreFor } from '../state/areaLore'
import { NpcDialog } from '../components/game/NpcDialog'
import { NearbyPlayers, usePresenceTouch } from '../components/game/NearbyPlayers'
import { useAreaCards } from '../components/game/CardDropPanel'
import { AreaPhaserGame } from '../game/AreaPhaserGame'
import type { AreaMapNpc } from '../game/AreaScene'
import type { DistrictId } from '../game/districts'
import type { NpcSummary } from '../state/types'

type DrawerTab = 'scene' | 'npcs' | 'cards' | 'events' | 'players'

/**
 * AreaPage 採用「地圖佔滿可視區域 + 浮動 overlay」設計：
 * - 中央：Phaser 區域地圖 (含紋卡 drop sprite)，玩家點地圖任一點就走過去
 * - 上方：返回鈕 + 區域名稱 pill
 * - 下方：永遠可見的 tab 列；展開的內容區放在地圖上面，半透明浮動
 *   tabs：場景敘事 / NPC / 紋卡 / 事件 / 鄰近玩家
 *
 * 整個畫面不需要捲動就能完成所有互動，行動裝置上特別重要。
 */
export function AreaPage() {
  const { tileId = '' } = useParams<{ tileId: string }>()
  const { t, locale } = useI18n()
  const { map, npcs, events } = useWorldState()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab | null>(null)

  const tile = map.tiles.find((entry) => entry.id === tileId)
  const lore = loreFor(tileId)
  usePresenceTouch(tile ? tileId : null)

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
    return events
      .filter((event) => {
        if (occupantIds.has(event.actorId)) return true
        const payload = event.payload ?? {}
        const from = String((payload as { from?: unknown }).from ?? '')
        const to = String((payload as { to?: unknown }).to ?? '')
        return from === tileId || to === tileId
      })
      .slice(0, 12)
  }, [events, occupants, tile, tileId])

  const mapNpcs = useMemo<AreaMapNpc[]>(
    () =>
      occupants.map((npc) => ({
        id: npc.id,
        name: npc.name,
        shortName: npc.name.charAt(0)
      })),
    [occupants]
  )

  const hudStrings = useMemo(
    () => ({ interact: t('hub.interactHint'), pickup: t('cards.pickup') }),
    [t]
  )

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      const npc = npcs.find((n) => n.id === npcId)
      if (npc) setActiveNpc(npc)
    },
    [npcs]
  )

  const cardOverlay = useAreaCards(tileId)

  const toggleTab = useCallback((tab: DrawerTab) => {
    setDrawerTab((prev) => (prev === tab ? null : tab))
  }, [])

  if (!tile) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      <div className="relative w-full">
        <AreaPhaserGame
          tileId={tileId as DistrictId}
          npcs={mapNpcs}
          drops={cardOverlay.drops}
          locale={locale}
          hudStrings={hudStrings}
          onNpcInteract={handleNpcInteract}
          onDropPickup={cardOverlay.pickupDrop}
        />

        {/* 上方：返回鈕 + 區域名稱 */}
        <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between gap-2 pointer-events-none">
          <Link
            to="/"
            className="pointer-events-auto gi-touch px-3 inline-flex items-center text-[11px] font-display uppercase tracking-tightest text-ground-200 bg-ground-900/85 backdrop-blur border border-ground-700 hover:border-ember-600 hover:text-ember-400 rounded-sharp transition-colors"
          >
            {t('area.back')}
          </Link>
          <div className="pointer-events-none flex flex-col items-end bg-ground-900/85 backdrop-blur border border-ground-700 rounded-sharp px-3 py-1.5 max-w-[60%]">
            <span className="font-display text-[10px] uppercase tracking-tightest text-ember-500 leading-tight">
              {t('area.eyebrow', { biome: biomeLabel(tile.biome, locale) })}
            </span>
            <span className="flex items-center gap-1 font-display font-extrabold text-base tracking-tightest text-ground-100 leading-tight">
              <span aria-hidden="true" className="text-ember-500/80">
                {lore.glyph}
              </span>
              <span className="truncate">{tile.name}</span>
            </span>
          </div>
        </div>

        {/* 下方：可收合的分頁抽屜。預設收合，只露 tab 列。 */}
        <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-col gap-2 pointer-events-none">
          {drawerTab && (
            <div className="pointer-events-auto bg-ground-900/95 backdrop-blur border border-ground-700 rounded-sharp p-3 max-h-[44vh] overflow-y-auto flex flex-col gap-2">
              {drawerTab === 'scene' && (
                <div className="flex flex-col gap-2">
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500">
                    {t('area.scene')}
                  </div>
                  <p className="text-[13px] text-ground-100 leading-relaxed">{lore.scene[locale]}</p>
                  <p className="text-[11px] text-ground-500 italic leading-relaxed">{lore.whisper[locale]}</p>
                </div>
              )}

              {drawerTab === 'npcs' && (
                <div className="flex flex-col gap-2">
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ground-400">
                    {t('area.npcs')}
                  </div>
                  {occupants.length === 0 ? (
                    <div className="text-[12px] text-ground-500 italic">{t('area.npcsEmpty')}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {occupants.map((npc) => (
                        <button
                          key={npc.id}
                          type="button"
                          onClick={() => setActiveNpc(npc)}
                          className="text-left flex items-center gap-3 px-2 py-2 rounded-sharp border border-ground-700 hover:border-ember-600 transition-colors"
                        >
                          <span className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-ember-600/60 bg-ground-900 text-[14px] text-ember-300 font-display font-extrabold shrink-0">
                            {npc.name.charAt(0)}
                          </span>
                          <div className="min-w-0 flex flex-col">
                            <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 truncate">
                              {npc.role}
                            </div>
                            <div className="font-display font-extrabold text-[13px] tracking-tightest text-ground-100 truncate">
                              {npc.name}
                            </div>
                            <div className="text-[10px] font-display uppercase tracking-tightest text-ground-500">
                              {t('npc.relationship')}{' '}
                              <span className="text-ground-200">{npc.relationshipScore}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'cards' && cardOverlay.panel}

              {drawerTab === 'events' && (
                <div className="flex flex-col gap-2">
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ground-400">
                    {t('area.events')}
                  </div>
                  {localEvents.length === 0 ? (
                    <div className="text-[12px] text-ground-500 italic">{t('area.eventsEmpty')}</div>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {localEvents.map((event) => {
                        const payload = event.payload ?? {}
                        const from = (payload as { from?: unknown }).from
                        const to = (payload as { to?: unknown }).to
                        const fromName = typeof from === 'string' ? (tileNameById[from] ?? from) : null
                        const toName = typeof to === 'string' ? (tileNameById[to] ?? to) : null
                        return (
                          <li
                            key={event.sequence}
                            className="px-2 py-1.5 border border-ground-700 rounded-sharp text-[12px] text-ground-200 leading-relaxed"
                          >
                            <div className="font-display text-[9px] uppercase tracking-tightest text-ground-500 mb-0.5">
                              tick {event.tick} · {event.actorId}
                            </div>
                            {event.narration ? (
                              <div className="text-ground-100">{event.narration}</div>
                            ) : (
                              <div className="text-ground-300">
                                {event.eventType}
                                {fromName && toName ? (
                                  <span className="text-ground-500">
                                    {' '}
                                    · {fromName} → {toName}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

              {drawerTab === 'players' && (
                <NearbyPlayers tileId={tileId} tileName={tile.name} />
              )}
            </div>
          )}

          {/* tab 列 (永遠可見) */}
          <div className="pointer-events-auto flex items-stretch gap-1 bg-ground-900/85 backdrop-blur border border-ground-700 rounded-sharp p-1">
            <DrawerTabButton
              label={t('area.scene')}
              active={drawerTab === 'scene'}
              onClick={() => toggleTab('scene')}
            />
            <DrawerTabButton
              label={`${t('area.npcs')} ${occupants.length}`}
              active={drawerTab === 'npcs'}
              onClick={() => toggleTab('npcs')}
            />
            <DrawerTabButton
              label={t('cards.tabLabel')}
              active={drawerTab === 'cards'}
              onClick={() => toggleTab('cards')}
            />
            <DrawerTabButton
              label={`${t('area.events')} ${localEvents.length}`}
              active={drawerTab === 'events'}
              onClick={() => toggleTab('events')}
            />
            <DrawerTabButton
              label={t('social.peerNearby')}
              active={drawerTab === 'players'}
              onClick={() => toggleTab('players')}
            />
          </div>
        </div>
      </div>

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}

function DrawerTabButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 min-h-[36px] px-2 text-[10px] font-display uppercase tracking-tightest rounded-sharp transition-colors truncate',
        active
          ? 'bg-ember-500/15 text-ember-300 border border-ember-600'
          : 'text-ground-300 hover:text-ground-100 border border-transparent'
      ].join(' ')}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
