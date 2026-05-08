import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { useAuth } from '../state/AuthContext'
import { NpcDialog } from '../components/game/NpcDialog'
import { SinceLastVisitPanel } from '../components/game/SinceLastVisitPanel'
import { PhaserGame } from '../game/PhaserGame'
import { api, type ServerAreaState } from '../api/client'
import {
  DISTRICTS,
  type DistrictId,
  isDistrict,
} from '../game/districts'
import type { FactionLeanId, MapAreaOverlay, MapNpc } from '../game/MapScene'
import type { NpcSummary } from '../state/types'

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

/**
 * HubPage 採用「地圖主視覺 + 輕量 overlay」設計：
 * - 地圖 (PhaserGame) 是主視覺
 * - 「進入 XXX →」按鈕放在地圖外下方，避免蓋住 NPC 與最下方街區
 * - 城市標題 pill 浮在地圖左上
 * - 行動裝置仍保留 44px 以上觸控目標
 */
export function HubPage() {
  const { t, locale } = useI18n()
  const { npcs } = useWorldState()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [currentDistrict, setCurrentDistrict] = useState<DistrictId | null>(null)
  const [showSincePanel, setShowSincePanel] = useState(true)
  const [areaStates, setAreaStates] = useState<ServerAreaState[]>([])

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

  // 主地圖只顯示「正在跨區移動中」的 NPC。在區域內工作 / 休息 / 聊天的
  // NPC 只會出現在該區域的 AreaPage scene 裡，避免主地圖被一堆站著的方塊塞滿。
  // v0.14.0：activity === 'move' 才畫；其它狀態的 NPC 從主地圖隱藏。
  const mapNpcs = useMemo<MapNpc[]>(() => {
    return npcs
      .filter((n) => KNOWN_DISTRICTS.has(n.location as DistrictId))
      .filter((n) => n.activity === 'move')
      .map((n) => {
        const base: MapNpc = {
          id: n.id,
          name: n.name,
          shortName: n.name.charAt(0),
          districtId: n.location as DistrictId
        }
        if (typeof n.color === 'number') base.color = n.color
        if (n.activity) base.activity = n.activity
        // 後端 sub-tile：MapScene 用來把 NPC 在 district 範圍裡微移動
        if (typeof n.subCol === 'number') base.subCol = n.subCol
        if (typeof n.subRow === 'number') base.subRow = n.subRow
        if (typeof n.mood === 'number') base.mood = n.mood
        if (typeof n.health === 'number') base.health = n.health
        return base
      })
  }, [npcs])

  const hudStrings = useMemo(
    () => ({
      interact: t('hub.interactHint'),
      enterArea: t('hub.enterArea')
    }),
    [t]
  )

  const handleAreaEnter = useCallback((districtId: DistrictId) => {
    if (!isDistrict(districtId)) return
    setCurrentDistrict(districtId)
  }, [])

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      const npc = npcs.find((n) => n.id === npcId)
      if (npc) setActiveNpc(npc)
    },
    [npcs]
  )

  const handleOpenCurrentArea = useCallback(() => {
    if (currentDistrict) navigate(`/area/${currentDistrict}`)
  }, [currentDistrict, navigate])

  const currentDef = currentDistrict ? DISTRICTS[currentDistrict] : null
  const currentName =
    currentDef && isDistrict(currentDef.id)
      ? locale === 'zh'
        ? currentDef.nameZh
        : currentDef.nameEn
      : null

  return (
    <div className="relative w-full max-w-[800px] mx-auto">
      <div className="relative w-full">
        <PhaserGame
          npcs={mapNpcs}
          locale={locale}
          hudStrings={hudStrings}
          onAreaEnter={handleAreaEnter}
          onNpcInteract={handleNpcInteract}
          areaOverlays={areaOverlays}
        />

        {/* 上方：城市標題 pill */}
        <div className="absolute top-2 left-2 z-10 pointer-events-none">
          <div className="bg-ground-900/85 backdrop-blur border border-ground-700 rounded-sharp px-3 py-1.5 flex flex-col">
            <span className="font-display text-[10px] uppercase tracking-tightest text-ember-500 leading-tight">
              {t('hub.eyebrow')}
            </span>
            <span className="font-display font-extrabold text-base tracking-tightest text-ground-100 leading-tight">
              {t('hub.title')}
            </span>
          </div>
        </div>

      </div>

      {/* 地圖外：進入街區按鈕 (玩家在街區內時才顯示)，不覆蓋 NPC / 碼頭區 */}
      {currentName && currentDistrict && (
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
