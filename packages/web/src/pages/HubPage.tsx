import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { NpcDialog } from '../components/game/NpcDialog'
import { PhaserGame } from '../game/PhaserGame'
import {
  DISTRICTS,
  type DistrictId,
  isDistrict,
} from '../game/districts'
import type { MapNpc } from '../game/MapScene'
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
 * HubPage 採用「地圖佔滿可視區域 + 浮動 overlay」設計：
 * - 地圖 (PhaserGame) 是主視覺
 * - 「進入 XXX →」按鈕浮在地圖下方中央 (玩家在街區內時才顯示)
 * - 城市標題 pill 浮在地圖左上
 * - 行動裝置不必捲動就能完成所有操作
 */
export function HubPage() {
  const { t, locale } = useI18n()
  const { npcs } = useWorldState()
  const navigate = useNavigate()
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [currentDistrict, setCurrentDistrict] = useState<DistrictId | null>(null)

  // 把世界狀態裡的 NPC 做成 Phaser 場景需要的形狀。
  const mapNpcs = useMemo<MapNpc[]>(() => {
    return npcs
      .filter((n) => KNOWN_DISTRICTS.has(n.location as DistrictId))
      .map((n) => ({
        id: n.id,
        name: n.name,
        shortName: n.name.charAt(0),
        districtId: n.location as DistrictId
      }))
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

        {/* 下方：進入街區按鈕 (玩家在街區內時才顯示) */}
        {currentName && currentDistrict && (
          <div className="absolute bottom-2 left-2 right-2 z-10 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={handleOpenCurrentArea}
              className="pointer-events-auto gi-touch px-5 py-2 inline-flex flex-col items-center gap-0 bg-ember-500/20 backdrop-blur border-2 border-ember-500 rounded-sharp text-ember-100 hover:bg-ember-500/30 hover:border-ember-400 transition-colors shadow-lg shadow-ember-900/40"
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
      </div>

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}
