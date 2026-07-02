import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { useAuth } from '../state/AuthContext'
import { NpcDialog } from '../components/game/NpcDialog'
import { WhenYouWereGone } from '../components/game/WhenYouWereGone'
import { ActionBar } from '../components/game/ActionBar'
import { PlayerCivilizationPanel } from '../components/game/PlayerCivilizationPanel'
import { WorldCivilizationPanel } from '../components/game/WorldCivilizationPanel'
import { WorldMapSvg } from '../components/map/WorldMapSvg'
import { api, type ServerAreaState, type ServerNearbyPlayer } from '../api/client'
import {
  DISTRICTS,
  type DistrictId,
  isDistrict,
} from '../game/districts'
import type { FactionLeanId, MapAreaOverlay, MapConstructionActivity, MapNpc, MapPlayer } from '../game/MapScene'
import type { NpcSummary } from '../state/types'
import { hubMapNpcs } from './npcProjection'
import { constructionActivitiesFor, constructionProjectsFromWorldFact } from './constructionActivity'
import { buildHubEcologySummaries, type HubEcologySummary } from './hubEcology'
import type { AnimalGroupRow, MigrationRow, PredatorWarningRow } from '../api/client'
import { activeDistrictIdsForHub } from './hubDistricts'
import {
  canEnterArea,
  shouldRenderHubCivilizationButton,
  shouldRenderHubWorldCivilizationPanel,
  shouldRenderPlayerCivilizationPanel,
  shouldShowWhenYouWereGone,
} from './hubPanelVisibility'
import { SurvivalHud } from '../components/game/SurvivalHud'

const HUB_TILE_ID = 'hub'
const HUB_PRESENCE_REFRESH_MS = 8_000
const SINCE_PANEL_DISMISSED_KEY = 'gi:hub:since-panel-dismissed:v1'
type HubPosition = { x: number; y: number; z: number }

export function HubPage() {
  const { t, locale } = useI18n()
  const { npcs, map, events, source, world } = useWorldState()
  const { token, account } = useAuth()

  // v0.95.1: one-way latch — keeps Phaser canvas mounted through transient SSE errors
  const [hasServerWorld, setHasServerWorld] = useState(true)
  useEffect(() => {
    if (source === 'server' && !hasServerWorld) setHasServerWorld(true)
  }, [hasServerWorld, source])

  const navigate = useNavigate()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [currentDistrict, setCurrentDistrict] = useState<DistrictId | null>(null)

  // WhenYouWereGone — one-per-session dismiss via sessionStorage (same key as old SinceLastVisitPanel)
  const [wygDismissed, setWygDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.sessionStorage.getItem(SINCE_PANEL_DISMISSED_KEY) === '1'
    } catch {
      return true
    }
  })
  const dismissWyg = useCallback(() => {
    setWygDismissed(true)
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(SINCE_PANEL_DISMISSED_KEY, '1')
    } catch {
      // sessionStorage unavailable in some embedded webviews — non-fatal
    }
  }, [])

  const [areaStates, setAreaStates] = useState<ServerAreaState[]>([])
  const [nearbyPlayers, setNearbyPlayers] = useState<ServerNearbyPlayer[]>([])
  const latestPositionRef = useRef<HubPosition | null>(null)
  const [showCivPanel, setShowCivPanel] = useState(false)

  // ActionBar eat result — SurvivalHud picks up the change on next tick via polling

  const isSignedIn = !!token

  // Area states for tile overlays (safety/economy/faction colours), polled every 30s
  useEffect(() => {
    let cancelled = false
    const fetchAreas = () => {
      api
        .areaStates()
        .then((r) => {
          if (cancelled) return
          setAreaStates(r.areas)
        })
        .catch(() => {})
    }
    fetchAreas()
    const id = window.setInterval(fetchAreas, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const activeDistrictIds = useMemo<DistrictId[]>(
    () => activeDistrictIdsForHub(map, world.facts['lifeExpansion']),
    [map, world.facts],
  )
  const activeDistrictSet = useMemo(() => new Set(activeDistrictIds), [activeDistrictIds])

  const areaOverlays = useMemo<MapAreaOverlay[]>(
    () =>
      areaStates
        .filter((a) => activeDistrictSet.has(a.tileId as DistrictId))
        .map((a) => ({
          districtId: a.tileId as DistrictId,
          safety: a.resources.safety,
          economy: a.resources.economy,
          food: a.resources.food,
          dominantFaction: (a.dominantFaction as FactionLeanId | null) ?? null,
        })),
    [activeDistrictSet, areaStates],
  )

  const mapNpcs = useMemo<MapNpc[]>(() => hubMapNpcs(npcs, locale), [locale, npcs])

  useEffect(() => {
    const routed = mapNpcs.filter((n) => n.travelRoute)
    if (routed.length === 0) return
    console.debug('[gi:hub-traveller:react]', {
      reactNpcCount: npcs.length,
      mapNpcCount: mapNpcs.length,
      routedMapNpcCount: routed.length,
      routedIds: routed.map((n) => n.id),
    })
  }, [mapNpcs, npcs])

  const constructionActivities = useMemo<MapConstructionActivity[]>(
    () => constructionActivitiesFor(events, npcs, constructionProjectsFromWorldFact(world.facts['lifeExpansion'])),
    [events, npcs, world.facts],
  )

  const ecologyByTile = useMemo<readonly HubEcologySummary[]>(() => {
    const animals = (world.facts['animalPopulation'] as readonly AnimalGroupRow[] | undefined) ?? []
    const migrations = (world.facts['migrationRoutes'] as readonly MigrationRow[] | undefined) ?? []
    const predatorHunger = (world.facts['predatorHunger'] as readonly PredatorWarningRow[] | undefined) ?? []
    return buildHubEcologySummaries({ animals, migrations, predatorHunger })
  }, [world.facts])

  const mapPlayers = useMemo<MapPlayer[]>(
    () =>
      nearbyPlayers.map((player) => ({
        id: player.id,
        displayName: player.displayName,
        shortName: shortNameFor(player.displayName),
        x: player.x,
        y: player.y,
      })),
    [nearbyPlayers],
  )

  const refreshHubPresence = useCallback(async () => {
    if (!token) {
      setNearbyPlayers([])
      return
    }
    try {
      await api.socialPresence(token, HUB_TILE_ID, latestPositionRef.current)
      const r = await api.socialNearby(token, HUB_TILE_ID)
      setNearbyPlayers(r.players)
    } catch {
      setNearbyPlayers([])
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      setNearbyPlayers([])
      latestPositionRef.current = null
      return
    }
    void refreshHubPresence()
    const timer = window.setInterval(() => {
      void refreshHubPresence()
    }, HUB_PRESENCE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshHubPresence, token])

  const handleHubPositionChange = useCallback(
    (pos: HubPosition) => {
      const hadPosition = latestPositionRef.current !== null
      latestPositionRef.current = pos
      if (!hadPosition) void refreshHubPresence()
    },
    [refreshHubPresence],
  )

  const hudStrings = useMemo(
    () => ({ interact: t('hub.interactHint'), enterArea: t('hub.enterArea') }),
    [t],
  )

  const handleAreaEnter = useCallback(
    (districtId: DistrictId) => {
      if (!token) return
      if (!isDistrict(districtId)) return
      if (!activeDistrictSet.has(districtId)) return
      setCurrentDistrict(districtId)
    },
    [activeDistrictSet, token],
  )

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      if (!token) return
      const npc = npcs.find((n) => n.id === npcId)
      if (npc) setActiveNpc(npc)
    },
    [npcs, token],
  )

  const handleOpenCurrentArea = useCallback(() => {
    if (!token) return
    if (currentDistrict) navigate(`/area/${currentDistrict}`)
  }, [currentDistrict, navigate, token])

  const currentDef = currentDistrict ? DISTRICTS[currentDistrict] : null
  const currentName =
    currentDef && isDistrict(currentDef.id)
      ? locale === 'zh'
        ? currentDef.nameZh
        : currentDef.nameEn
      : null

  const showWyg = shouldShowWhenYouWereGone(token, wygDismissed)

  const phaserMap = hasServerWorld ? (
    <WorldMapSvg
      npcs={mapNpcs}
      players={mapPlayers}
      locale={locale}
      playerName={account?.displayName ?? null}
      hudStrings={hudStrings}
      onAreaEnter={handleAreaEnter}
      onNpcInteract={handleNpcInteract}
      onPositionChange={handleHubPositionChange}
      areaOverlays={areaOverlays}
      activeDistrictIds={activeDistrictIds}
      constructionActivities={constructionActivities}
      ecologyByTile={ecologyByTile}
      controlsEnabled={!!token}
    />
  ) : (
    <div className="w-full aspect-[4/3] rounded-sharp border border-ground-700 bg-ground-900 flex items-center justify-center text-ground-400 text-sm">
      {locale === 'zh' ? '載入潮鳴市…' : 'Loading Tide Hum City…'}
    </div>
  )

  return (
    <div className="relative w-full">

      {/* ── 精簡頂列（36px）─────────────────────────────────────── */}
      <div className="h-9 px-3 border-b border-ground-700 bg-ground-900/90 flex items-center gap-2 shrink-0">
        <span className="font-display text-[10px] uppercase tracking-eyebrow text-ember-500">
          {t('hub.eyebrow')}
        </span>
        <span className="font-display font-extrabold text-sm tracking-tightest text-ground-100 truncate">
          {t('hub.title')}
        </span>
        <span className="ml-auto font-data text-[10px] text-ground-500 shrink-0">● 世界運轉中</span>
      </div>

      {/* ── 主體：手機 = 單欄，桌機 ≥ sm = 三欄 ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:min-h-[600px]">

        {/* ── 左側面板（桌機專屬，220px）────────────────────────── */}
        <aside className="hidden sm:flex sm:flex-col sm:w-[220px] sm:shrink-0 sm:border-r sm:border-ground-700 sm:bg-ground-900/40 sm:p-3 sm:gap-3">
          {token && (
            <SurvivalHud compact token={token} tick={world.tick} />
          )}

          {/* WorldSignal 佔位（Phase 2 實裝即時流） */}
          <div className="gi-panel px-2 py-2 flex flex-col gap-1 flex-1">
            <div className="gi-eyebrow">世界現在</div>
            <p className="text-[11px] text-ground-500 leading-relaxed">即時事件流 Phase 2 實裝</p>
          </div>
        </aside>

        {/* ── 中央欄（地圖 + 嵌入元件）─────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Phaser 地圖 */}
          <div className="relative w-full">
            {phaserMap}
          </div>

          {/* WhenYouWereGone — 地圖下方、HUD 上方，非彈窗 */}
          {token && showWyg && (
            <WhenYouWereGone token={token} onDismiss={dismissWyg} />
          )}

          {/* 手機：SurvivalHud 緊貼地圖下（桌機在左側面板） */}
          {token && (
            <div className="sm:hidden">
              <SurvivalHud compact token={token} tick={world.tick} />
            </div>
          )}

          {/* 手機：WorldSignal 折疊條佔位 */}
          <div className="sm:hidden px-3 py-2 border-t border-b border-ground-700 bg-ground-900/60 flex items-center gap-2">
            <span className="gi-eyebrow">世界現在</span>
            <span className="text-[11px] text-ground-500">即時事件流 Phase 2 實裝</span>
          </div>

          {/* 文明面板 / 無登入提示（僅需在頁面內任意位置就行） */}
          {shouldRenderHubWorldCivilizationPanel(showCivPanel) && (
            <WorldCivilizationPanel snapshot={world.worldCivilization} />
          )}

          {!token && (
            <div className="mt-3 mx-2 gi-panel border-ember-700/60 p-3 text-[12px] text-ground-300 leading-relaxed">
              登入後才能移動、進入街區與互動；目前是只讀瀏覽模式。
            </div>
          )}

          {shouldRenderPlayerCivilizationPanel(showCivPanel, isSignedIn) && (
            <PlayerCivilizationPanel
              tileId={currentDistrict as string | null}
              onClose={() => setShowCivPanel(false)}
            />
          )}

          {/* ActionBar — 手機固定底部 / 桌機嵌入地圖下方 */}
          <ActionBar
            token={token}
            currentDistrictName={currentName}
            canEnter={canEnterArea(token, currentDistrict)}
            onEnterArea={handleOpenCurrentArea}
          />

        </div>

        {/* ── 右側情境面板（桌機專屬，280px）──────────────────── */}
        <aside className="hidden sm:flex sm:flex-col sm:w-[280px] sm:shrink-0 sm:border-l sm:border-ground-700 sm:bg-ground-900/40 sm:p-3 sm:gap-3">
          {/* 文明面板切換按鈕 */}
          {shouldRenderHubCivilizationButton(isSignedIn) && (
            <button
              type="button"
              onClick={() => setShowCivPanel((v) => !v)}
              aria-expanded={showCivPanel}
              className="gi-touch px-3 py-2 bg-ground-900 border border-ground-700 rounded-sharp text-[11px] text-ground-400 hover:border-ember-600 hover:text-ember-300 transition-colors text-left"
            >
              ⚔ 文明面板
            </button>
          )}

          {/* 選中區域資訊（Phase 0 佔位；NpcMindSheet 在 Phase 1 接入） */}
          <div className="gi-panel p-3 flex flex-col gap-2 flex-1">
            <div className="gi-eyebrow">情境面板</div>
            {currentName ? (
              <>
                <p className="text-[11px] text-ground-500">目前選中區域</p>
                <p className="font-display font-bold text-[14px] tracking-tightest text-ground-200">
                  {currentName}
                </p>
                <button
                  type="button"
                  onClick={handleOpenCurrentArea}
                  className="gi-touch mt-1 px-3 py-1.5 border border-ember-600 rounded-sharp text-[11px] font-display tracking-eyebrow uppercase text-ember-300 bg-ember-500/10 hover:bg-ember-500/20 transition-colors"
                >
                  前往 {currentName}
                </button>
              </>
            ) : (
              <p className="text-[11px] text-ground-500 leading-relaxed">
                點選地圖區域以查看詳情
              </p>
            )}
          </div>
        </aside>
      </div>

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}

function shortNameFor(displayName: string): string {
  return (displayName.trim().charAt(0) || '?').toUpperCase()
}
