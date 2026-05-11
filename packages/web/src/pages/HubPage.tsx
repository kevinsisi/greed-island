import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { useAuth } from '../state/AuthContext'
import { NpcDialog } from '../components/game/NpcDialog'
import { SinceLastVisitPanel } from '../components/game/SinceLastVisitPanel'
import { PhaserGame } from '../game/PhaserGame'
import { api, type ServerAreaState, type ServerNearbyPlayer } from '../api/client'
import {
  DISTRICTS,
  type DistrictId,
  isDistrict,
} from '../game/districts'
import type { FactionLeanId, MapAreaOverlay, MapNpc, MapPlayer } from '../game/MapScene'
import type { NpcSummary } from '../state/types'
import { hubMapNpcs } from './npcProjection'

const KNOWN_DISTRICTS = new Set<DistrictId>([
  't_forest',
  't_mountain',
  't_temple',
  't_dimai',
  't_desert',
  't_central',
  't_ruin',
  't_dock'
])

const HUB_TILE_ID = 'hub'
const HUB_PRESENCE_REFRESH_MS = 8_000
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
  const { npcs } = useWorldState()
  const { token, account } = useAuth()
  const navigate = useNavigate()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [currentDistrict, setCurrentDistrict] = useState<DistrictId | null>(null)
  const [showSincePanel, setShowSincePanel] = useState(true)
  const [areaStates, setAreaStates] = useState<ServerAreaState[]>([])
  const [nearbyPlayers, setNearbyPlayers] = useState<ServerNearbyPlayer[]>([])
  const latestPositionRef = useRef<HubPosition | null>(null)

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

  const areaOverlays = useMemo<MapAreaOverlay[]>(() => {
    return areaStates
      .filter((a) => KNOWN_DISTRICTS.has(a.tileId as DistrictId))
      .map((a) => ({
        districtId: a.tileId as DistrictId,
        safety: a.resources.safety,
        economy: a.resources.economy,
        food: a.resources.food,
        dominantFaction: (a.dominantFaction as FactionLeanId | null) ?? null
      }))
  }, [areaStates])

  // 主地圖是世界總覽：顯示各區戶外 NPC；建築內 NPC 由 BuildingPage 顯示。
  // 正在跨區移動的 NPC 仍以 travelRoute 呈現在世界線上。
  const mapNpcs = useMemo<MapNpc[]>(() => {
    return hubMapNpcs(npcs, locale)
  }, [locale, npcs])

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
    setCurrentDistrict(districtId)
  }, [token])

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
          controlsEnabled={!!token}
        />

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

      {token && showSincePanel && (
        <SinceLastVisitPanel token={token} onClose={() => setShowSincePanel(false)} />
      )}

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}

function shortNameFor(displayName: string): string {
  return (displayName.trim().charAt(0) || '?').toUpperCase()
}
