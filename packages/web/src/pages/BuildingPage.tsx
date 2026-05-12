import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { useAuth } from '../state/AuthContext'
import {
  api,
  type ServerBuildingView,
  type ServerPlayerJob,
  type ServerPlayerWallet,
  type ServerShift
} from '../api/client'
import { BuildingPhaserGame } from '../game/BuildingPhaserGame'
import type { BuildingSceneNpc } from '../game/BuildingScene'
import { NpcDialog } from '../components/game/NpcDialog'
import type { NpcSummary } from '../state/types'

const SHIFT_LABEL_ZH: Record<ServerShift, string> = {
  morning: '早班 (06–12)',
  afternoon: '午班 (12–18)',
  night: '夜班 (18–24)'
}

const TYPE_LABEL_ZH: Record<string, string> = {
  residential: '住所',
  shop: '商店',
  restaurant: '餐廳',
  office: '辦公',
  factory: '工坊',
  library: '圖書館',
  exchange: '紋卡交易所',
  temple: '神殿',
  landmark: '地標',
  construction: '工地'
}

export function BuildingPage() {
  const { buildingId = '' } = useParams<{ buildingId: string }>()
  const { t: _t, locale } = useI18n()
  const { token } = useAuth()
  const navigate = useNavigate()
  const { npcs } = useWorldState()

  const [view, setView] = useState<ServerBuildingView | null>(null)
  const [wallet, setWallet] = useState<ServerPlayerWallet | null>(null)
  const [jobs, setJobs] = useState<ServerPlayerJob[]>([])
  const [currentShift, setCurrentShift] = useState<ServerShift | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [activeNpc, setActiveNpc] = useState<NpcSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const def = view?.def

  // refresh helpers
  const refreshBuilding = useCallback(async () => {
    try {
      const r = await api.buildingDetail(buildingId)
      setView(r.building)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load building')
    }
  }, [buildingId])

  const refreshWallet = useCallback(async () => {
    if (!token) {
      setWallet(null)
      setJobs([])
      setCurrentShift(null)
      return
    }
    try {
      const r = await api.wallet(token)
      setWallet(r.wallet)
      setJobs(r.jobs)
      setCurrentShift(r.currentShift)
    } catch {
      // ignore
    }
  }, [token])

  useEffect(() => {
    refreshBuilding()
  }, [refreshBuilding])

  useEffect(() => {
    refreshWallet()
  }, [refreshWallet])

  // Poll occupants every 8s so NPCs entering / leaving show up
  useEffect(() => {
    const id = window.setInterval(refreshBuilding, 8_000)
    return () => window.clearInterval(id)
  }, [refreshBuilding])

  const presentNpcs = useMemo(() => {
    if (!view) return []
    return npcs
      .filter((npc) => npc.buildingId === view.def.id)
      .map((npc) => ({
        npc,
        occupant: view.occupants.find((occ) => occ.npcId === npc.id) ?? {
          npcId: npc.id,
          shift: null,
          isOwner: false
        }
      }))
  }, [view, npcs])

  const sceneNpcs = useMemo<BuildingSceneNpc[]>(() => {
    return presentNpcs.map(({ npc, occupant }) => {
      const fullName = npc?.name ?? occupant.npcId
      const base: BuildingSceneNpc = {
        id: occupant.npcId,
        name: fullName,
        shortName: fullName.charAt(0),
        isOwner: occupant.isOwner
      }
      if (npc?.activity) {
        base.activity = npc.activity
        base.activityLabel = npc.activity
      }
      if (npc?.intentLine) base.intentLine = locale === 'zh' ? npc.intentLine.zh : npc.intentLine.en
      if (typeof npc?.color === 'number') base.color = npc.color
      return base
    })
  }, [locale, presentNpcs])

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      if (!token) return
      const npc = npcs.find((n) => n.id === npcId)
      if (npc) setActiveNpc(npc)
    },
    [npcs, token]
  )

  const handleExit = useCallback(() => {
    if (!def) return
    navigate(`/area/${def.tileId}`)
  }, [navigate, def])

  const flashMessage = useCallback((msg: string) => {
    setActionMessage(msg)
    window.setTimeout(() => setActionMessage((prev) => (prev === msg ? null : prev)), 3000)
  }, [])

  const apply = useCallback(
    async (shift: ServerShift) => {
      if (!token || busy) return
      setBusy(true)
      try {
        await api.buildingApply(token, buildingId, shift)
        flashMessage(`已成功應徵 ${SHIFT_LABEL_ZH[shift]}！明天就可以來上班。`)
        await refreshWallet()
      } catch (err) {
        flashMessage(err instanceof Error ? err.message : '應徵失敗')
      } finally {
        setBusy(false)
      }
    },
    [token, busy, buildingId, refreshWallet, flashMessage]
  )

  const work = useCallback(async () => {
    if (!token || busy) return
    setBusy(true)
    try {
      const r = await api.buildingWork(token, buildingId)
      flashMessage(`完成一輪工作！獲得 ${r.wage} 潮幣。`)
      setWallet(r.wallet)
      await refreshWallet()
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : '無法打卡')
    } finally {
      setBusy(false)
    }
  }, [token, busy, buildingId, refreshWallet, flashMessage])

  const rest = useCallback(async () => {
    if (!token || busy) return
    setBusy(true)
    try {
      const r = await api.buildingRest(token, buildingId)
      flashMessage('在這裡休息了一陣，體力恢復了。')
      setWallet(r.wallet)
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : '無法休息')
    } finally {
      setBusy(false)
    }
  }, [token, busy, buildingId, flashMessage])

  const quit = useCallback(
    async (shift: ServerShift) => {
      if (!token || busy) return
      setBusy(true)
      try {
        await api.buildingQuit(token, buildingId, shift)
        flashMessage(`已辭去 ${SHIFT_LABEL_ZH[shift]}。`)
        await refreshWallet()
      } catch (err) {
        flashMessage(err instanceof Error ? err.message : '辭職失敗')
      } finally {
        setBusy(false)
      }
    },
    [token, busy, buildingId, refreshWallet, flashMessage]
  )

  if (error) {
    return (
      <div className="p-4 text-rust-300">
        無法載入建築：{error}{' '}
        <button onClick={() => navigate(-1)} className="underline ml-2">
          返回
        </button>
      </div>
    )
  }

  if (!view || !def) {
    return <div className="p-4 text-ground-300">載入中…</div>
  }

  if (!def.enterable) {
    return <Navigate to={`/area/${def.tileId}`} replace />
  }

  const myJobs = jobs.filter((j) => j.buildingId === def.id)

  return (
    <div className="relative w-full max-w-[600px] mx-auto p-3 flex flex-col gap-3">
      {/* 頂部：返回 + 標題 */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/area/${def.tileId}`}
          className="px-3 py-1.5 text-[11px] font-display uppercase tracking-tightest text-ground-200 bg-ground-900 border border-ground-700 hover:border-ember-600 hover:text-ember-400 rounded-sharp"
        >
          ← 離開
        </Link>
        <div className="flex flex-col items-end max-w-[60%]">
          <span className="font-display text-[10px] uppercase tracking-tightest text-ember-500">
            {TYPE_LABEL_ZH[def.type] ?? def.type}
          </span>
          <span className="font-display font-extrabold text-base tracking-tightest text-ground-100 truncate">
            {def.nameZh}
          </span>
        </div>
      </div>

      {/* 描述 */}
      <p className="text-[12px] text-ground-200 leading-relaxed bg-ground-900/70 border border-ground-700 rounded-sharp px-3 py-2">
        {def.descriptionZh}
      </p>

      {/* 室內小場景 */}
      <BuildingPhaserGame
        building={def}
        npcs={sceneNpcs}
        onNpcInteract={handleNpcInteract}
        onExit={handleExit}
        controlsEnabled={!!token}
      />

      {!token && (
        <div className="gi-panel border-ember-700/60 p-3 text-[12px] text-ground-300 leading-relaxed">
          登入後才能在室內移動、離開或互動；目前是只讀瀏覽模式。
        </div>
      )}

      {/* 在場 NPC list */}
      <div className="flex flex-col gap-2 bg-ground-900/85 border border-ground-700 rounded-sharp p-3">
        <div className="font-display text-[10px] uppercase tracking-tightest text-ground-400">
          室內人員 {presentNpcs.length}
        </div>
        {presentNpcs.length === 0 ? (
          <div className="text-[12px] text-ground-500 italic">目前沒有人在這裡。</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {presentNpcs.map(({ npc, occupant }) => {
              const name = npc?.name ?? occupant.npcId
              return (
                <li key={occupant.npcId}>
                  <button
                    type="button"
                    onClick={() => token && npc && setActiveNpc(npc)}
                    disabled={!token}
                    className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-sharp border border-ground-700 hover:border-ember-600 transition-colors"
                  >
                    <span
                      className={[
                        'w-9 h-9 inline-flex items-center justify-center rounded-full border bg-ground-900 text-[14px] font-display font-extrabold shrink-0',
                        occupant.isOwner ? 'border-ember-500 text-ember-300' : 'border-ground-700 text-ground-200'
                      ].join(' ')}
                    >
                      {name.charAt(0)}
                    </span>
                    <div className="min-w-0 flex flex-col">
                      <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
                        {npc?.role ?? (occupant.isOwner ? '老闆' : '室內人員')}
                      </div>
                      <div className="font-display font-extrabold text-[13px] tracking-tightest text-ground-100 truncate">
                        {name}
                      </div>
                      {npc?.intentLine && (
                        <div className="text-[11px] text-ember-300 truncate">
                          {locale === 'zh' ? npc.intentLine.zh : npc.intentLine.en}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 招聘 / 工作 / 休息 */}
      {def.hiring.length > 0 && (
        <div className="flex flex-col gap-2 bg-ground-900/85 border border-ground-700 rounded-sharp p-3">
          <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500">
            招聘中
          </div>
          {def.hiring.map((slot) => {
            const myJob = myJobs.find((j) => j.shift === slot.shift)
            const hasOtherJob = jobs.some((j) => j.buildingId !== def.id || j.shift !== slot.shift)
            const isCurrentShift = currentShift === slot.shift
            const workButtonLabel = isCurrentShift ? '打卡' : '非上班時間'
            return (
              <div
                key={slot.shift}
                className="flex items-center justify-between gap-2 border border-ground-700 rounded-sharp px-2 py-2"
              >
                <div className="min-w-0 flex flex-col">
                  <span className="font-display text-[10px] uppercase tracking-tightest text-ground-400">
                    {SHIFT_LABEL_ZH[slot.shift]} · 上限 {slot.capacity} 人
                  </span>
                  <span className="text-[12px] text-ground-100">{slot.taskZh}</span>
                  <span className="text-[10px] text-ember-400">每班薪資 {slot.wage} 潮幣</span>
                </div>
                <div className="flex flex-col gap-1">
                  {myJob ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || !token || !isCurrentShift}
                        onClick={work}
                        className={[
                          'px-2 py-1 text-[11px] rounded-sharp border',
                          isCurrentShift
                            ? 'bg-ember-600/30 hover:bg-ember-600/50 border-ember-500 text-ember-100'
                            : 'bg-ground-800 border-ground-700 text-ground-500 cursor-not-allowed'
                        ].join(' ')}
                        title={isCurrentShift ? '' : '要等這個班別的上班時間才能打卡。'}
                      >
                        {workButtonLabel}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !token}
                        onClick={() => quit(slot.shift)}
                        className="px-2 py-1 text-[11px] rounded-sharp bg-ground-800 hover:bg-rust-900 border border-ground-700 text-ground-200"
                      >
                        辭職
                      </button>
                    </>
                  ) : hasOtherJob ? (
                    <button
                      type="button"
                      disabled
                      className="px-2 py-1 text-[11px] rounded-sharp bg-ground-800 border border-ground-700 text-ground-500 cursor-not-allowed"
                      title="同時間只能有一份工作，請先辭去原工作。"
                    >
                      已有工作
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || !token}
                      onClick={() => apply(slot.shift)}
                      className="px-2 py-1 text-[11px] rounded-sharp bg-ember-600/20 hover:bg-ember-600/40 border border-ember-700 text-ember-200"
                    >
                      應徵
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {def.restorative && token && (
        <button
          type="button"
          disabled={busy || !token}
          onClick={rest}
          className="w-full px-3 py-2 text-[12px] rounded-sharp bg-ember-700/20 border border-ember-600 text-ember-200 hover:bg-ember-700/40"
        >
          在這裡休息（補體力）
        </button>
      )}

      {/* 玩家錢包 */}
      {wallet && (
        <div className="flex items-center justify-between gap-3 bg-ground-900/85 border border-ground-700 rounded-sharp px-3 py-2">
          <div className="text-[11px] text-ground-400">
            <span className="text-ember-400 font-bold mr-1">{wallet.gold}</span> 潮幣
          </div>
          <div className="text-[11px] text-ground-400">
            體力 <span className="text-ground-100">{wallet.energy}</span> / 100
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-sharp bg-ember-900/95 border border-ember-500 text-ember-100 text-[12px] font-display tracking-tight shadow-lg pointer-events-none">
          {actionMessage}
        </div>
      )}

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />
    </div>
  )
}
