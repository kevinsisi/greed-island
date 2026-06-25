import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { useAuth } from '../state/AuthContext'
import { NpcDialog } from '../components/game/NpcDialog'
import { SinceLastVisitPanel } from '../components/game/SinceLastVisitPanel'
import { PlayerCivilizationPanel } from '../components/game/PlayerCivilizationPanel'
import { PhaserGame } from '../game/PhaserGame'
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

const HUB_TILE_ID = 'hub'
const HUB_PRESENCE_REFRESH_MS = 8_000
const SINCE_PANEL_DISMISSED_KEY = 'gi:hub:since-panel-dismissed:v1'
type HubPosition = { x: number; y: number; z: number }

/**
 * HubPage 採用「地圖主視覺 + 輕量 overlay」設計：
 * - 地圖 (PhaserGame) 是主視覺
 * - 「進入 XXX →」按鈕放在地圖外下方，避免蓋住 NPC 與最下方街區
 * - 城市標題列放在地圖外上方，避免遮住主地圖
 * - 行動裝置仍保留 44px 以上觸控目標
 */
export function HubPage() {
  const { t, locale } = useI18n()
  const { npcs, map, events, source, world } = useWorldState()
  const { token, account } = useAuth()
  // v0.95.1 hotfix: mount immediately with fixture data, then keep the one-way latch once authoritative server data arrives
  // once, keep the Phaser canvas mounted forever — even if SSE/poll
  // briefly flips `source` back to 'fixture' on a transient error.
  // Without this latch, every short network blip tears down + recreates
  // the entire scene, which is what the user saw as "卡住、要頻繁重整".
  const [hasServerWorld, setHasServerWorld] = useState(true)
  useEffect(() => {
    if (source === 'server' && !hasServerWorld) setHasServerWorld(true)
  }, [hasServerWorld, source])
  const navigate = useNavigate()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [currentDistrict, setCurrentDistrict] = useState<DistrictId | null>(null)
  // v0.15.45: only show 不在時的潮鳴市 panel when the user actually returns
  // after being offline — not on every HubPage mount, route change, or
  // forced reload. The dismissal latches into sessionStorage, which is
  // cleared when the tab closes, so a fresh "re-enter the world" still
  // shows the catch-up panel.
  const [showSincePanel, setShowSincePanel] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.sessionStorage.getItem(SINCE_PANEL_DISMISSED_KEY) !== '1'
    } catch {
      return true
    }
  })
  const dismissSincePanel = useCallback(() => {
    setShowSincePanel(false)
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(SINCE_PANEL_DISMISSED_KEY, '1')
    } catch {
      // sessionStorage may be unavailable in some embedded webviews — non-fatal.
    }
  }, [])
  const [areaStates, setAreaStates] = useState<ServerAreaState[]>([])
  const [nearbyPlayers, setNearbyPlayers] = useState<ServerNearbyPlayer[]>([])
  const latestPositionRef = useRef<HubPosition | null>(null)
  const [showCivPanel, setShowCivPanel] = useState(false)

  // 每 30 秒拉一次 area state 用來上 tile 色（治安/經濟/派系外框）
  // 5 秒 tick + 區域狀態變化緩慢 → 30 秒 polling 足夠，不會把 server 打爆。
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
    const t = window.setInterval(fetchAreas, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  const activeDistrictIds = useMemo<DistrictId[]>(() => {
    return activeDistrictIdsForHub(map, world.facts['lifeExpansion'])
  }, [map, world.facts])

  const activeDistrictSet = useMemo(() => new Set(activeDistrictIds), [activeDistrictIds])

  const areaOverlays = useMemo<MapAreaOverlay[]>(() => {
    return areaStates
      .filter((a) => activeDistrictSet.has(a.tileId as DistrictId))
      .map((a) => ({
        districtId: a.tileId as DistrictId,
        safety: a.resources.safety,
        economy: a.resources.economy,
        food: a.resources.food,
        dominantFaction: (a.dominantFaction as FactionLeanId | null) ?? null
      }))
  }, [activeDistrictSet, areaStates])

  // 主地圖是世界總覽：只顯示跨區移動中的 NPC route。
  // 已落在某個區域或建築內的 NPC 只在該子層地圖渲染，避免同一 NPC 分身。
  const mapNpcs = useMemo<MapNpc[]>(() => {
    return hubMapNpcs(npcs, locale)
  }, [locale, npcs])

  // v0.15.40：當 React 端有 routed traveller 時，把這次 Hub 投影規模送進
  // console.debug。配合 MapScene 內的 sprite diagnostic 與 window.__giHubTravellerDiagnostics()，
  // 可在 live 上直接定位「資料是否進 React state」「投影是否丟掉」「sprite 是否建出」三段。
  useEffect(() => {
    const routed = mapNpcs.filter((n) => n.travelRoute)
    if (routed.length === 0) return
    console.debug('[gi:hub-traveller:react]', {
      reactNpcCount: npcs.length,
      mapNpcCount: mapNpcs.length,
      routedMapNpcCount: routed.length,
      routedIds: routed.map((n) => n.id)
    })
  }, [mapNpcs, npcs])

  const constructionActivities = useMemo<MapConstructionActivity[]>(() => {
    return constructionActivitiesFor(events, npcs, constructionProjectsFromWorldFact(world.facts['lifeExpansion']))
  }, [events, npcs, world.facts])

  // Sprint 2A — derive per-tile ecology summaries from WorldSnapshot.facts
  // so the Hub map can paint species badges, predator warning rings, and
  // migration arrows alongside the existing district visuals.
  const ecologyByTile = useMemo<readonly HubEcologySummary[]>(() => {
    const animals = (world.facts['animalPopulation'] as readonly AnimalGroupRow[] | undefined) ?? []
    const migrations = (world.facts['migrationRoutes'] as readonly MigrationRow[] | undefined) ?? []
    const predatorHunger = (world.facts['predatorHunger'] as readonly PredatorWarningRow[] | undefined) ?? []
    return buildHubEcologySummaries({ animals, migrations, predatorHunger })
  }, [world.facts])

  const mapPlayers = useMemo<MapPlayer[]>(() => {
    return nearbyPlayers.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      shortName: shortNameFor(player.displayName),
      x: player.x,
      y: player.y
    }))
  }, [nearbyPlayers])

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
    [refreshHubPresence]
  )

  const hudStrings = useMemo(
    () => ({
      interact: t('hub.interactHint'),
      enterArea: t('hub.enterArea')
    }),
    [t]
  )

  const handleAreaEnter = useCallback((districtId: DistrictId) => {
    if (!token) return
    if (!isDistrict(districtId)) return
    if (!activeDistrictSet.has(districtId)) return
    setCurrentDistrict(districtId)
  }, [activeDistrictSet, token])

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      if (!token) return
      const npc = npcs.find((n) => n.id === npcId)
      if (npc) setActiveNpc(npc)
    },
    [npcs, token]
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

  return (
    <div className="relative w-full max-w-[800px] mx-auto">
      <div className="mb-2 mx-2 border border-ground-700 bg-ground-900/90 rounded-sharp px-3 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0 flex flex-col">
          <span className="font-display text-[10px] uppercase tracking-tightest text-ember-500 leading-tight">
            {t('hub.eyebrow')}
          </span>
          <span className="font-display font-extrabold text-lg tracking-tightest text-ground-100 leading-tight truncate">
            {t('hub.title')}
          </span>
        </div>
        <span className="shrink-0 font-display text-[10px] uppercase tracking-tightest text-ground-500">
          800 x 600
        </span>
      </div>

      <div className="relative w-full">
        {hasServerWorld ? (
          // v0.15.45: once mounted, stay mounted. `hasServerWorld` is a
          // one-way latch — transient SSE/poll failures cannot tear the
          // scene down. Per-prop updates still flow through
          // `applyExternalUpdate` so NPC / map updates land normally.
          <PhaserGame
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
          <div className="w-full max-w-[800px] mx-auto aspect-[4/3] rounded-sharp border border-ground-700 bg-ground-900 flex items-center justify-center text-ground-400 text-sm">
            {locale === 'zh' ? '載入潮鳴市…' : 'Loading Tide Hum City…'}
          </div>
        )}
      </div>

      {!token && (
        <div className="mt-3 mx-2 gi-panel border-ember-700/60 p-3 text-[12px] text-ground-300 leading-relaxed">
          登入後才能移動、進入街區與互動；目前是只讀瀏覽模式。
        </div>
      )}

      {/* 地圖外：進入街區按鈕 (玩家在街區內時才顯示)，不覆蓋 NPC / 碼頭區 */}
      {token && currentName && currentDistrict && (
        <div className="mt-3 px-2 flex justify-center">
          <button
            type="button"
            onClick={handleOpenCurrentArea}
            className="gi-touch min-h-[44px] w-full max-w-[360px] px-5 py-2 inline-flex flex-col items-center gap-0 bg-ground-900 border-2 border-ember-500 rounded-sharp text-ember-100 hover:bg-ember-500/15 hover:border-ember-400 transition-colors shadow-lg shadow-ember-900/30"
          >
            <span className="font-display text-[9px] uppercase tracking-tightest text-ember-400 leading-tight">
              {t('hub.currentArea')}
            </span>
            <span className="font-display font-extrabold text-sm tracking-tightest leading-tight">
              {t('hub.openArea', { name: currentName })}
            </span>
          </button>
        </div>
      )}

      {token && (
        <div className="mt-2 mx-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowCivPanel((v) => !v)}
            className="gi-touch px-3 py-1.5 bg-ground-900 border border-ground-700 rounded-sharp text-[11px] text-ground-400 hover:border-ember-600 hover:text-ember-300 transition-colors"
          >
            ⚔ 文明面板
          </button>
        </div>
      )}

      {token && showCivPanel && (
        <PlayerCivilizationPanel
          tileId={currentDistrict as string | null}
          onClose={() => setShowCivPanel(false)}
        />
      )}

      {token && showSincePanel && (
        <SinceLastVisitPanel token={token} onClose={dismissSincePanel} />
      )}

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}

function shortNameFor(displayName: string): string {
  return (displayName.trim().charAt(0) || '?').toUpperCase()
}
