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
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('hub.eyebrow')}
        </div>
        <h1 className="font-display font-extrabold text-3xl tracking-tightest text-ground-100">
          {t('hub.title')}
        </h1>
        <p className="text-sm text-ground-400 max-w-2xl leading-relaxed">{t('hub.description')}</p>
      </header>

      {currentName && currentDistrict && (
        <div className="max-w-[800px] mx-auto w-full flex items-center justify-between gap-3 gi-panel p-4">
          <div className="flex flex-col">
            <div className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
              {t('hub.currentArea')}
            </div>
            <div className="font-display font-extrabold text-base tracking-tightest text-ground-100">
              {currentName}
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenCurrentArea}
            className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:border-ember-500 hover:bg-ember-500/10 rounded-sharp transition-colors"
          >
            {t('hub.openArea', { name: currentName })}
          </button>
        </div>
      )}

      <PhaserGame
        npcs={mapNpcs}
        locale={locale}
        hudStrings={hudStrings}
        onAreaEnter={handleAreaEnter}
        onNpcInteract={handleNpcInteract}
      />

      <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500 leading-relaxed max-w-[800px] mx-auto w-full">
        {t('hub.controlsHint')}
      </div>

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}
