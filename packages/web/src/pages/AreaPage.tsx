import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { biomeLabel, loreFor } from '../state/areaLore'
import { NpcDialog } from '../components/game/NpcDialog'
import { NearbyPlayers, usePresenceTouch } from '../components/game/NearbyPlayers'
import { useAreaCards } from '../components/game/CardDropPanel'
import { AreaPhaserGame } from '../game/AreaPhaserGame'
import {
  normaliseWeather,
  type AreaMapBuilding,
  type AreaMapNpc,
  type AreaNpcActivity
} from '../game/AreaScene'
import type { DistrictId } from '../game/districts'
import type { NpcSummary, NpcActivity } from '../state/types'
import type { TranslationKey } from '../i18n/types'
import {
  api,
  type ServerAmbient,
  type ServerAreaState,
  type ServerBuildingView
} from '../api/client'

const ACTIVITY_KEY: Readonly<Record<NpcActivity, TranslationKey>> = {
  idle: 'npc.activity.idle',
  move: 'npc.activity.move',
  work: 'npc.activity.work',
  eat: 'npc.activity.eat',
  sleep: 'npc.activity.sleep',
  trade: 'npc.activity.trade',
  patrol: 'npc.activity.patrol'
}

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
  const { map, npcs, events, world } = useWorldState()
  const weather = useMemo(
    () => normaliseWeather(typeof world.facts['weather'] === 'string' ? (world.facts['weather'] as string) : null),
    [world.facts]
  )
  const navigate = useNavigate()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab | null>(null)
  const [nearbyNpcIds, setNearbyNpcIds] = useState<Set<string>>(new Set())
  const [tooFarFlash, setTooFarFlash] = useState<string | null>(null)
  const [areaState, setAreaState] = useState<ServerAreaState | null>(null)
  const [ambient, setAmbient] = useState<ServerAmbient | null>(null)
  const [buildings, setBuildings] = useState<ServerBuildingView[]>([])

  useEffect(() => {
    let cancelled = false
    if (!tileId) return
    api
      .areaState(tileId)
      .then((r) => {
        if (cancelled) return
        setAreaState(r.areaState)
        setAmbient(r.ambient)
      })
      .catch(() => {
        // ignore — areaState 是錦上添花
      })
    api
      .buildings(tileId)
      .then((r) => {
        if (!cancelled) setBuildings(r.buildings)
      })
      .catch(() => {})
    const id = window.setInterval(() => {
      api
        .areaState(tileId)
        .then((r) => {
          if (cancelled) return
          setAreaState(r.areaState)
          setAmbient(r.ambient)
        })
        .catch(() => {})
      api
        .buildings(tileId)
        .then((r) => {
          if (!cancelled) setBuildings(r.buildings)
        })
        .catch(() => {})
    }, 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [tileId])

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
      occupants.map((npc) => {
        const activity: AreaNpcActivity = npc.activity ?? 'idle'
        const base: AreaMapNpc = {
          id: npc.id,
          name: npc.name,
          shortName: npc.name.charAt(0),
          // 後端權威：v0.12 之後 server 一定會帶這些欄位；舊資料缺少時用 sane fallback
          subCol: typeof npc.subCol === 'number' ? npc.subCol : 7,
          subRow: typeof npc.subRow === 'number' ? npc.subRow : 5,
          color: typeof npc.color === 'number' ? npc.color : 0xfff5b8,
          activity
        }
        if (npc.activity) base.activityLabel = t(ACTIVITY_KEY[npc.activity])
        // v0.14.0：mood/health 給 AreaScene 視覺化用
        if (typeof npc.mood === 'number') base.mood = npc.mood
        if (typeof npc.health === 'number') base.health = npc.health
        return base
      }),
    [occupants, t]
  )

  const hudStrings = useMemo(
    () => ({
      interact: t('hub.interactHint'),
      pickup: t('cards.pickup'),
      tooFar: t('npc.tooFarHint'),
      enterBuilding: '進入'
    }),
    [t]
  )

  const mapBuildings = useMemo<AreaMapBuilding[]>(
    () =>
      buildings.map((view) => ({
        id: view.def.id,
        nameZh: view.def.nameZh,
        type: view.def.type,
        col: view.def.placement.col,
        row: view.def.placement.row,
        glyph: view.def.placement.glyph,
        size: view.def.placement.size,
        enterable: view.def.enterable
      })),
    [buildings]
  )

  const handleBuildingEnter = useCallback(
    (buildingId: string) => {
      navigate(`/building/${buildingId}`)
    },
    [navigate]
  )

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      const npc = npcs.find((n) => n.id === npcId)
      if (npc) setActiveNpc(npc)
    },
    [npcs]
  )

  // 從 AreaScene 接收當前在玩家身邊（INTERACT_RADIUS 內）的 NPC ids
  const handleNearbyNpcsChange = useCallback((ids: string[]) => {
    setNearbyNpcIds(new Set(ids))
  }, [])

  // 玩家點了一個太遠的 NPC sprite — flash 1.5s 提示在 React 層也顯示
  const handleInteractTooFar = useCallback((npcId: string) => {
    setTooFarFlash(npcId)
    window.setTimeout(() => {
      // 只有當前 flash 仍是這顆才清掉，避免後一個 click 的 timer 把後一個 toast 提早關
      setTooFarFlash((prev) => (prev === npcId ? null : prev))
    }, 1500)
  }, [])

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
          buildings={mapBuildings}
          locale={locale}
          hudStrings={hudStrings}
          weather={weather}
          onNpcInteract={handleNpcInteract}
          onDropPickup={cardOverlay.pickupDrop}
          onNearbyNpcsChange={handleNearbyNpcsChange}
          onInteractTooFar={handleInteractTooFar}
          onBuildingEnter={handleBuildingEnter}
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

        {/* 下方留個空 anchor，讓建築物提示氣泡不會被 tab 蓋到 */}
      </div>

      {/* tab 區（已移出地圖，避免蓋住建築 / NPC） */}
      <div className="mt-2 px-2 pb-3 flex flex-col gap-2">
        {drawerTab && (
          <div className="bg-ground-900/95 border border-ground-700 rounded-sharp p-3 max-h-[44vh] overflow-y-auto flex flex-col gap-2">
              {drawerTab === 'scene' && (
                <div className="flex flex-col gap-2">
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500 flex items-center gap-2">
                    <span>{t('area.scene')}</span>
                    {ambient && (
                      <span className={[
                        'text-[9px] tracking-tight px-1.5 py-0.5 rounded',
                        ambient.source === 'ai'
                          ? 'bg-ember-700/40 text-ember-200'
                          : 'bg-ground-800 text-ground-400'
                      ].join(' ')}>
                        {ambient.source === 'ai' ? 'AI' : '靜態'}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-ground-100 leading-relaxed">
                    {ambient?.text ?? lore.scene[locale]}
                  </p>
                  <p className="text-[11px] text-ground-500 italic leading-relaxed">{lore.whisper[locale]}</p>

                  {areaState && (
                    <div className="mt-2 pt-2 border-t border-ground-700 flex flex-col gap-1.5">
                      <div className="font-display text-[10px] uppercase tracking-tightest text-ground-400">
                        區域狀態
                      </div>
                      <ResourceBar label="糧食" value={areaState.resources.food} colorOk="#9ee0c7" />
                      <ResourceBar label="治安" value={areaState.resources.safety} colorOk="#b6e3ff" />
                      <ResourceBar label="經濟" value={areaState.resources.economy} colorOk="#ffd966" />
                      {areaState.dominantFaction && (
                        <div className="text-[10px] text-rust-300 mt-1">
                          ⚑ 此區由「{factionLabel(areaState.dominantFaction)}」掌控
                        </div>
                      )}
                      {areaState.recentEvents.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          <div className="text-[9px] uppercase tracking-tightest text-ground-500">
                            本地事件
                          </div>
                          {areaState.recentEvents.slice(-3).reverse().map((ev, i) => (
                            <div key={i} className="text-[11px] text-ground-200 leading-snug">
                              · {ev.narration}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'npcs' && (
                <div className="flex flex-col gap-2">
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ground-400 flex items-center justify-between">
                    <span>{t('area.npcs')}</span>
                    <span className="text-ground-600 normal-case tracking-normal">
                      {t('npc.nearbyHint')}
                    </span>
                  </div>
                  {occupants.length === 0 ? (
                    <div className="text-[12px] text-ground-500 italic">{t('area.npcsEmpty')}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {occupants.map((npc) => {
                        const isNearby = nearbyNpcIds.has(npc.id)
                        return (
                          <button
                            key={npc.id}
                            type="button"
                            disabled={!isNearby}
                            onClick={() =>
                              isNearby ? setActiveNpc(npc) : handleInteractTooFar(npc.id)
                            }
                            className={[
                              'text-left flex items-center gap-3 px-2 py-2 rounded-sharp border transition-colors',
                              isNearby
                                ? 'border-ground-700 hover:border-ember-600 cursor-pointer'
                                : 'border-ground-800 opacity-50 cursor-not-allowed'
                            ].join(' ')}
                            title={isNearby ? '' : t('npc.tooFarHint')}
                          >
                            <span
                              className={[
                                'w-9 h-9 inline-flex items-center justify-center rounded-full border bg-ground-900 text-[14px] font-display font-extrabold shrink-0',
                                isNearby
                                  ? 'border-ember-600/60 text-ember-300'
                                  : 'border-ground-700 text-ground-500'
                              ].join(' ')}
                            >
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
                                {!isNearby && (
                                  <span className="ml-2 text-ground-600 normal-case tracking-normal">
                                    · {t('npc.tooFarBadge')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
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

        {/* tab 列（已移到地圖外面） */}
        <div className="flex items-stretch gap-1 bg-ground-900/85 border border-ground-700 rounded-sharp p-1">
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

      {tooFarFlash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-sharp bg-rust-900/95 border border-rust-600 text-rust-100 text-[12px] font-display tracking-tight shadow-lg pointer-events-none">
          {t('npc.tooFarHint')}
        </div>
      )}

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}

function ResourceBar({ label, value, colorOk }: { label: string; value: number; colorOk: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const low = v < 30
  const fill = low ? '#ff6b6b' : colorOk
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-display uppercase tracking-tightest text-ground-400 w-8 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 bg-ground-800 rounded-full overflow-hidden">
        <div
          style={{ width: `${v}%`, backgroundColor: fill }}
          className="h-full transition-all"
        />
      </div>
      <span className="text-[10px] text-ground-300 w-8 text-right">{v}</span>
    </div>
  )
}

function factionLabel(faction: string): string {
  switch (faction) {
    case 'tide_hunters':
      return '潮獵會'
    case 'free_runners':
      return '自由潮感者'
    case 'guild':
      return '公會'
    case 'civilian':
      return '平民'
    default:
      return faction
  }
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
