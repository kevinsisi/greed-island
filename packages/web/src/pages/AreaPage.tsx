import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useWorldState } from '../state/WorldStateContext'
import { useAuth } from '../state/AuthContext'
import { biomeLabel, loreFor } from '../state/areaLore'
import { NpcDialog } from '../components/game/NpcDialog'
import { CombatHud } from '../components/game/CombatHud'
import { NearbyPlayers, usePresenceTouch } from '../components/game/NearbyPlayers'
import { useAreaCards } from '../components/game/CardDropPanel'
import { AreaPhaserGame } from '../game/AreaPhaserGame'
import {
  normaliseWeather,
  type AreaMapBuilding,
  type AreaMapNpc,
  type AreaMapPlayer,
  type AreaNpcActivity
} from '../game/AreaScene'
import type { DistrictId } from '../game/districts'
import type { NpcSummary, NpcActivity } from '../state/types'
import type { TranslationKey } from '../i18n/types'
import {
  api,
  type AreaEcologyView,
  type ServerAmbient,
  type ServerAreaState,
  type ServerBuildingView,
  type ServerCombatHandCard,
  type ServerCombatSession,
  type ServerNearbyPlayer
} from '../api/client'

/** Species that require Phase B combat instead of instant hunt (aggression ≥ 50). */
const AGGRESSIVE_SPECIES_IDS = new Set([
  'moss_boar', 'fog_wolf', 'ash_serpent', 'mountain_bear', 'iron_hound', 'white_marsh_leviathan'
])
import { areaOutdoorNpcs, areaVisibleNpcs } from './npcProjection'
import { eventBelongsToArea } from './areaEvents'
import { formatNpcInteractionEvent, isNpcInteractionEvent } from './areaSocial'
import { animalBehaviorLabel, behaviorToneClass, npcBehaviorBadge } from './areaBehavior'
import { areaSubtitleLines, ambientNpcChatterLines, dedupeSubtitleLines, nearbySpeechRecipients, optimisticLocalShoutLines, type AreaSubtitleLine } from './areaSubtitles'

const ACTIVITY_KEY: Readonly<Record<NpcActivity, TranslationKey>> = {
  idle:    'npc.activity.idle',
  move:    'npc.activity.move',
  work:    'npc.activity.work',
  eat:     'npc.activity.eat',
  sleep:   'npc.activity.sleep',
  trade:   'npc.activity.trade',
  patrol:  'npc.activity.patrol',
  read:    'npc.activity.read',
  perform: 'npc.activity.perform',
  craft:   'npc.activity.craft',
  study:   'npc.activity.study',
  pray:    'npc.activity.pray',
  write:   'npc.activity.write',
  guard:   'npc.activity.guard'
}

type DrawerTab = 'scene' | 'npcs' | 'cards' | 'events' | 'players'
const AREA_PEER_REFRESH_MS = 8_000

/**
 * AreaPage 採用「地圖佔滿可視區域 + 浮動 overlay」設計：
 * - 中央：Phaser 區域地圖 (含紋卡 drop sprite)，玩家點地圖任一點就走過去
 * - 上方：返回鈕 + 區域名稱 pill
 * - 下方：永遠可見的 tab 列；展開內容固定在 tab 下方
 *   tabs：場景敘事 / NPC / 紋卡 / 事件 / 鄰近玩家
 *
 * 互動入口必須先於長內容顯示，避免使用者切換 tab 時被 panel 擋住。
 */
export function AreaPage() {
  const { tileId = '' } = useParams<{ tileId: string }>()
  const { t, locale } = useI18n()
  const { token, account } = useAuth()
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
  // v0.87.3 — surfaces when a player tries to interact with a deceased NPC that
  // slipped through the world-state filter via an SSE/poll race.
  const [deceasedFlash, setDeceasedFlash] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [areaState, setAreaState] = useState<ServerAreaState | null>(null)
  const [ambient, setAmbient] = useState<ServerAmbient | null>(null)
  const [buildings, setBuildings] = useState<ServerBuildingView[]>([])
  const [nearbyBuildingId, setNearbyBuildingId] = useState<string | null>(null)
  const [nearbyPlayers, setNearbyPlayers] = useState<ServerNearbyPlayer[]>([])
  const [playerPosition, setPlayerPosition] = useState<{ tileId: string; x: number; y: number; z: number } | null>(null)
  const [ecology, setEcology] = useState<AreaEcologyView | null>(null)
  const [animalCombatConfirm, setAnimalCombatConfirm] = useState<{ speciesId: string; animalId: string } | null>(null)
  const [animalCombatSession, setAnimalCombatSession] = useState<ServerCombatSession | null>(null)
  const [animalCombatHand, setAnimalCombatHand] = useState<ServerCombatHandCard[] | null>(null)
  const [subtitleDraft, setSubtitleDraft] = useState('')
  const [subtitleBusy, setSubtitleBusy] = useState(false)
  const [subtitleError, setSubtitleError] = useState<string | null>(null)
  const [optimisticSubtitles, setOptimisticSubtitles] = useState<AreaSubtitleLine[]>([])

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
    api
      .areaEcology(tileId)
      .then((r) => {
        if (!cancelled) setEcology(r)
      })
      .catch(() => {
        // ignore — ecology overlay is best-effort
      })
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
      api
        .areaEcology(tileId)
        .then((r) => {
          if (!cancelled) setEcology(r)
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

  useEffect(() => {
    setPlayerPosition(null)
    setSubtitleDraft('')
    setSubtitleError(null)
    setOptimisticSubtitles([])
  }, [tileId])

  usePresenceTouch(tile ? tileId : null, playerPosition?.tileId === tileId ? playerPosition : null)

  useEffect(() => {
    if (!token || !tile) {
      setNearbyPlayers([])
      return
    }
    let cancelled = false
    const refresh = () => {
      api
        .socialNearby(token, tileId)
        .then((r) => {
          if (!cancelled) setNearbyPlayers(r.players)
        })
        .catch(() => {
          if (!cancelled) setNearbyPlayers([])
        })
    }
    refresh()
    const timer = window.setInterval(refresh, AREA_PEER_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [token, tile, tileId])

  const tileNameById = useMemo(() => {
    const acc: Record<string, string> = {}
    for (const entry of map.tiles) acc[entry.id] = entry.name
    return acc
  }, [map.tiles])

  const npcNameById = useMemo(() => new Map(npcs.map((npc) => [npc.id, npc.name] as const)), [npcs])

  const occupants = useMemo(
    () => npcs.filter((npc) => npc.location === tileId),
    [npcs, tileId]
  )
  const allOutdoorOccupants = useMemo(() => areaOutdoorNpcs(npcs, tileId), [npcs, tileId])
  const outdoorOccupants = useMemo(() => areaVisibleNpcs(npcs, tileId, weather), [npcs, tileId, weather])

  const localEvents = useMemo(() => {
    if (!tile) return []
    const occupantIds = new Set(occupants.map((n) => n.id))
    return events
      .filter((event) => eventBelongsToArea(event, tileId, occupantIds))
      .slice(0, 12)
  }, [events, occupants, tile, tileId])

  const localSocialEvents = useMemo(
    () => localEvents.filter(isNpcInteractionEvent).slice(0, 3),
    [localEvents]
  )

  const nearbyNpcIdList = useMemo(
    () => outdoorOccupants.filter((npc) => nearbyNpcIds.has(npc.id)).map((npc) => npc.id),
    [nearbyNpcIds, outdoorOccupants]
  )
  const subtitleRecipientIds = useMemo(
    () => nearbySpeechRecipients(nearbyNpcIdList, outdoorOccupants.map((npc) => npc.id)),
    [nearbyNpcIdList, outdoorOccupants]
  )
  const subtitleRecipients = useMemo(
    () => subtitleRecipientIds
      .map((id) => outdoorOccupants.find((npc) => npc.id === id) ?? null)
      .filter((npc): npc is NonNullable<typeof npc> => npc !== null),
    [outdoorOccupants, subtitleRecipientIds]
  )
  const subtitleTargetNpc = subtitleRecipients[0] ?? null
  const subtitleAudienceLabel = subtitleRecipients.length > 1
    ? `附近 ${subtitleRecipients.length} 人`
    : subtitleTargetNpc?.name ?? '附近 NPC'
  const subtitleAudiencePlaceholder = subtitleRecipients.length > 1
    ? `向附近 ${subtitleRecipients.length} 人說話…`
    : subtitleTargetNpc ? `對 ${subtitleTargetNpc.name} 說話…` : '靠近 NPC 後說話…'
  const liveSubtitles = useMemo(
    () => areaSubtitleLines({
      events: localEvents,
      npcNameById,
      nearbyNpcIds: new Set(nearbyNpcIdList.length > 0 ? nearbyNpcIdList : outdoorOccupants.map((npc) => npc.id)),
      playerAccountId: account ? String(account.id) : null,
      limit: 6,
    }),
    [account, localEvents, nearbyNpcIdList, npcNameById, outdoorOccupants]
  )
  const ambientSubtitles = useMemo(
    () => ambientNpcChatterLines({
      npcs: outdoorOccupants,
      nearbyNpcIds: new Set(nearbyNpcIdList.length > 0 ? nearbyNpcIdList : subtitleRecipientIds),
      tick: world.tick,
      limit: 3,
    }),
    [nearbyNpcIdList, outdoorOccupants, subtitleRecipientIds, world.tick]
  )
  const subtitleFeed = useMemo(
    () => dedupeSubtitleLines([
      ...(liveSubtitles.length > 0 ? liveSubtitles : ambientSubtitles),
      ...optimisticSubtitles,
    ]),
    [ambientSubtitles, liveSubtitles, optimisticSubtitles]
  )

  const interactionReadyCount = outdoorOccupants.length

  const mapNpcs = useMemo<AreaMapNpc[]>(
    () =>
      outdoorOccupants.map((npc) => {
        const activity: AreaNpcActivity = npc.activity ?? 'idle'
        const behavior = npcBehaviorBadge(npc, localEvents)
        const base: AreaMapNpc = {
          id: npc.id,
          name: npc.name,
          shortName: npc.name.charAt(0),
          // 後端權威：v0.12 之後 server 一定會帶這些欄位；舊資料缺少時用 sane fallback
          subCol: typeof npc.subCol === 'number' ? npc.subCol : 7,
          subRow: typeof npc.subRow === 'number' ? npc.subRow : 5,
          ...(typeof npc.subZ === 'number' ? { subZ: npc.subZ } : {}),
          color: typeof npc.color === 'number' ? npc.color : 0xfff5b8,
          activity,
          behaviorLabel: behavior.primary,
          ...(behavior.tone === 'conflict' ? { behaviorIcon: '💢' } : {}),
          ...(behavior.tone === 'food' ? { behaviorIcon: '🍚' } : {}),
          ...(weather === 'storm' && behavior.tone === 'idle' ? { behaviorIcon: '☂️', behaviorLabel: '正在避雨' } : {})
        }
        if (npc.activity) base.activityLabel = t(ACTIVITY_KEY[npc.activity])
        // v0.14.0：mood/health 給 AreaScene 視覺化用
        if (typeof npc.mood === 'number') base.mood = npc.mood
        if (typeof npc.health === 'number') base.health = npc.health
        if (npc.intentLine) base.intentLine = locale === 'zh' ? npc.intentLine.zh : npc.intentLine.en
        if (npc.cognitiveLine) base.cognitiveLine = locale === 'zh' ? npc.cognitiveLine.zh : npc.cognitiveLine.en
        if (npc.recentUtterance?.text) base.recentUtterance = npc.recentUtterance.text
        return base
      }),
    [locale, localEvents, outdoorOccupants, t, weather]
  )

  const mapPlayers = useMemo<AreaMapPlayer[]>(
    () =>
      nearbyPlayers.map((player) => ({
        id: player.id,
        displayName: player.displayName,
        shortName: player.displayName.charAt(0).toUpperCase(),
        x: player.x,
        y: player.y,
        z: player.z
      })),
    [nearbyPlayers]
  )

  const hudStrings = useMemo(
    () => ({
      interact: t('hub.interactHint'),
      pickup: t('cards.pickup'),
      tooFar: t('npc.tooFarHint'),
      enterBuilding: '進入',
      exit: '回上一層'
    }),
    [t]
  )

  const mapBuildings = useMemo<AreaMapBuilding[]>(
    () =>
      buildings.map((view) => {
        const building: AreaMapBuilding = {
          id: view.def.id,
          nameZh: view.def.nameZh,
          type: view.def.type,
          col: view.def.placement.col,
          row: view.def.placement.row,
          glyph: view.def.placement.glyph,
          size: view.def.placement.size,
          enterable: view.def.enterable,
          // v0.49.0 — building lifecycle state
          state: view.def.state ?? 'operational',
          health: view.def.health ?? 100
        }
        // only set constructionProgress if present
        if (view.def.constructionProgress !== undefined) {
          building.constructionProgress = view.def.constructionProgress
        }
        return building
      }),
    [buildings]
  )

  const handleBuildingEnter = useCallback(
    (buildingId: string) => {
      if (!token) return
      navigate(`/building/${buildingId}`)
    },
    [navigate, token]
  )

  const handleExit = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleNearbyBuildingChange = useCallback((id: string | null) => {
    setNearbyBuildingId(id)
  }, [])

  const nearbyBuilding = useMemo(
    () => (nearbyBuildingId ? buildings.find((b) => b.def.id === nearbyBuildingId) ?? null : null),
    [nearbyBuildingId, buildings]
  )

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      if (!token) return
      const npc = npcs.find((n) => n.id === npcId)
      if (!npc) return
      // v0.87.3 — race-window protection. Server already 410s, but blocking the
      // open before the request avoids opening an immediately-failing drawer.
      if (npc.deceased) {
        setDeceasedFlash(npcId)
        window.setTimeout(() => {
          setDeceasedFlash((prev) => (prev === npcId ? null : prev))
        }, 2000)
        return
      }
      setActiveNpc(npc)
    },
    [npcs, token]
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

  const showFeedback = useCallback((ok: boolean, msg: string) => {
    setActionFeedback({ ok, msg })
    window.setTimeout(() => setActionFeedback(null), 2000)
  }, [])

  const handleSubtitleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!token || subtitleRecipients.length === 0 || subtitleBusy) return
      const message = subtitleDraft.trim()
      if (!message) return
      setSubtitleBusy(true)
      setSubtitleError(null)
      const pendingBaseId = `pending-${Date.now()}`
      const pendingTick = events[0]?.tick ?? world.tick ?? 0
      const recipients = subtitleRecipients
      setOptimisticSubtitles((prev) => [
        ...prev.filter((line) => !line.id.startsWith(`${pendingBaseId}:`)),
        ...optimisticLocalShoutLines({
          baseId: pendingBaseId,
          tick: pendingTick,
          playerMessage: message,
          recipients: recipients.map((npc) => ({ id: npc.id, name: npc.name, replyZh: null })),
        })
      ].slice(-8))
      setSubtitleDraft('')
      try {
        const respondent = recipients[0]
        if (!respondent) return
        const result = await api.npcInteract(token, respondent.id, { message }, { timeoutMs: 8000 })
        const baseId = result.worldEventId ?? `local-${Date.now()}`
        const replacement = optimisticLocalShoutLines({
          baseId,
          tick: result.tick ?? pendingTick,
          playerMessage: message,
          recipients: [{
            id: respondent.id,
            name: respondent.name,
            replyZh: result.line.zh,
          }],
        })
        setOptimisticSubtitles((prev) => [
          ...prev.filter((line) => !line.id.startsWith(`${pendingBaseId}:`)),
          ...replacement,
        ].slice(-8))
      } catch (err) {
        const msg = err instanceof DOMException && err.name === 'AbortError'
          ? 'NPC 回應逾時，稍後再試。'
          : 'NPC 暫時沒有回應，稍後再試。'
        setSubtitleError(msg)
        setOptimisticSubtitles((prev) => prev.map((line) =>
          line.id.startsWith(`${pendingBaseId}:npc`)
            ? { ...line, text: msg, tone: 'system' }
            : line
        ))
        showFeedback(false, msg)
      } finally {
        setSubtitleBusy(false)
      }
    },
    [events, showFeedback, subtitleBusy, subtitleDraft, subtitleRecipients, token, world.tick]
  )

  const refreshEcology = useCallback(() => {
    api.areaEcology(tileId).then((eco) => setEcology(eco)).catch(() => {})
  }, [tileId])

  const handleAnimalHunt = useCallback(
    (speciesId: string, animalId: string) => {
      if (!token) {
        showFeedback(false, '請先登入再狩獵')
        return
      }
      if (AGGRESSIVE_SPECIES_IDS.has(speciesId)) {
        // Strong animal — show combat confirm dialog
        setAnimalCombatConfirm({ speciesId, animalId })
        return
      }
      api
        .playerAction(token, 'PLAYER_HUNTED_ANIMAL', { tileId, speciesId, animalId })
        .then((r) => {
          showFeedback(r.accepted, r.accepted ? `獵捕成功：${speciesId}` : (r.reason ?? `未能獵捕：${speciesId}`))
          if (r.accepted) refreshEcology()
        })
        .catch((err) => {
          console.warn('[area] hunt failed', err)
          showFeedback(false, `動作失敗：${err?.message ?? '未知錯誤'}`)
        })
    },
    [token, tileId, showFeedback, refreshEcology]
  )

  const handleAnimalCombatConfirm = useCallback(async () => {
    if (!token || !animalCombatConfirm) return
    setAnimalCombatConfirm(null)
    try {
      const r = await api.combatInitiateAnimal(token, animalCombatConfirm.animalId, animalCombatConfirm.speciesId)
      setAnimalCombatSession(r.session)
      setAnimalCombatHand(r.hand ?? null)
    } catch (err) {
      showFeedback(false, `無法發起戰鬥：${err instanceof Error ? err.message : '未知錯誤'}`)
    }
  }, [token, animalCombatConfirm, showFeedback])

  const handleFish = useCallback(() => {
    if (!token) return
    api
      .playerAction(token, 'PLAYER_FISHED', { tileId, quantity: 1 })
      .then((r) => {
        showFeedback(r.accepted, r.accepted ? '捕魚成功' : (r.reason ?? '漁場無魚'))
        if (r.accepted) refreshEcology()
      })
      .catch(() => showFeedback(false, '動作失敗'))
  }, [token, tileId, showFeedback, refreshEcology])

  const toggleTab = useCallback((tab: DrawerTab) => {
    setDrawerTab((prev) => (prev === tab ? null : tab))
  }, [])

  if (!tile) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative w-full max-w-[600px] mx-auto">
      {/* 上方 chrome：返回鈕 + 區域名稱（在地圖上方，不再蓋住地圖內容） */}
      <div className="px-2 py-2 flex items-center justify-between gap-2">
        <Link
          to="/"
          className="gi-touch px-3 inline-flex items-center text-[11px] font-display uppercase tracking-tightest text-ground-200 bg-ground-900/85 border border-ground-700 hover:border-ember-600 hover:text-ember-400 rounded-sharp transition-colors"
        >
          {t('area.back')}
        </Link>
        <div className="flex flex-col items-end bg-ground-900/85 border border-ground-700 rounded-sharp px-3 py-1.5 max-w-[70%]">
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

      {/* 地圖 — 純畫面，沒有疊任何 HTML 按鈕 */}
      <div className="w-full">
        <AreaPhaserGame
          tileId={tileId as DistrictId}
          npcs={mapNpcs}
          players={mapPlayers}
          drops={cardOverlay.drops}
          buildings={mapBuildings}
          locale={locale}
          playerId={account?.id ?? null}
          playerName={account?.displayName ?? null}
          hudStrings={hudStrings}
          weather={weather}
          ecology={ecology}
          onNpcInteract={handleNpcInteract}
          onDropPickup={cardOverlay.pickupDrop}
          onNearbyNpcsChange={handleNearbyNpcsChange}
          onInteractTooFar={handleInteractTooFar}
          onBuildingEnter={handleBuildingEnter}
          onExit={handleExit}
          onNearbyBuildingChange={handleNearbyBuildingChange}
          onPositionChange={(pos) => setPlayerPosition({ tileId, ...pos })}
          onAnimalHunt={handleAnimalHunt}
          onFish={handleFish}
          controlsEnabled={!!token}
        />
        {allOutdoorOccupants.length > outdoorOccupants.length && (
          <div className="mt-1 px-2 text-[10px] text-ground-500 leading-snug">
            {weather === 'storm'
              ? `驟雨中，多數人進騎樓或室內避雨；街上只顯示 ${outdoorOccupants.length}/${allOutdoorOccupants.length} 位。`
              : `此區人潮擁擠；街景只顯示 ${outdoorOccupants.length}/${allOutdoorOccupants.length} 位。`}
          </div>
        )}
      </div>

      <div className="mt-2 mx-2 border border-cyan-800/70 bg-ground-950/90 rounded-sharp p-2 shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="font-display text-[10px] uppercase tracking-tightest text-cyan-300">
            附近對話字幕
          </div>
          <div className="text-[10px] text-ground-500 truncate">
            {subtitleRecipients.length > 0
              ? `向 ${subtitleAudienceLabel} 發話`
              : '靠近 NPC 就能聽見與發話'}
          </div>
        </div>
        <div className="max-h-28 overflow-y-auto flex flex-col gap-1 pr-1">
          {subtitleFeed.length > 0 ? (
            subtitleFeed.map((line) => (
              <div key={line.id} className="text-[12px] leading-snug text-ground-200">
                <span className={[
                  'font-display text-[10px] uppercase tracking-tightest mr-1',
                  line.tone === 'player' ? 'text-ember-300' : line.tone === 'npc' ? 'text-cyan-200' : 'text-ground-500'
                ].join(' ')}>
                  {line.speaker}
                </span>
                <span>{line.text}</span>
              </div>
            ))
          ) : (
            <div className="text-[12px] text-ground-500 italic">
              走近 NPC 後，附近說話、NPC 對談、玩家發話都會出現在這裡。
            </div>
          )}
        </div>
        <form onSubmit={handleSubtitleSubmit} className="mt-2 flex gap-2">
          <input
            value={subtitleDraft}
            onChange={(event) => setSubtitleDraft(event.target.value)}
            disabled={!token || subtitleRecipients.length === 0 || subtitleBusy}
            placeholder={subtitleAudiencePlaceholder}
            className="min-w-0 flex-1 bg-ground-900 border border-ground-700 focus:border-cyan-500 rounded-sharp px-2 py-2 text-[13px] text-ground-100 placeholder:text-ground-600 outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!token || subtitleRecipients.length === 0 || subtitleBusy || subtitleDraft.trim().length === 0}
            className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-cyan-600 text-cyan-200 hover:bg-cyan-500/10 rounded-sharp disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {subtitleBusy ? '發話中' : '發話'}
          </button>
        </form>
        {subtitleError && <div className="mt-1 text-[11px] text-rust-300">{subtitleError}</div>}
      </div>

      {!token && (
        <div className="mt-2 mx-2 gi-panel border-ember-700/60 p-3 text-[12px] text-ground-300 leading-relaxed">
          登入後才能移動、拾取紋卡、進入建築與互動；目前是只讀瀏覽模式。
        </div>
      )}

      {/* 下方：建築物進入按鈕 + tab 區 */}
      {/* flex-col-reverse: mobile — panel appears above sticky tab bar; lg:flex-col: desktop normal order */}
      <div className="mt-2 px-2 flex flex-col-reverse lg:flex-col gap-2">
        {/* sticky tab bar wrapper — sticks just above MobileTabBar on mobile */}
        <div className="sticky bottom-[56px] z-[25] lg:static lg:z-auto pb-3 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0 bg-ground-900/98 lg:bg-transparent backdrop-blur lg:backdrop-blur-none border-t lg:border-0 border-ground-800/50 pt-2 lg:pt-0">
        <div className="min-h-[44px]">
          <button
            type="button"
            disabled={!token || !nearbyBuilding?.def.enterable}
            onClick={() => {
              if (token && nearbyBuilding?.def.enterable) handleBuildingEnter(nearbyBuilding.def.id)
            }}
            className={[
              'gi-touch w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-sharp bg-ember-600 hover:bg-ember-500 text-ground-950 font-display font-extrabold text-sm tracking-tightest transition-colors',
              token && nearbyBuilding?.def.enterable ? 'opacity-100' : 'opacity-0 pointer-events-none'
            ].join(' ')}
            aria-hidden={!token || !nearbyBuilding?.def.enterable}
            tabIndex={token && nearbyBuilding?.def.enterable ? 0 : -1}
          >
            <span aria-hidden="true">{nearbyBuilding?.def.placement.glyph ?? '▣'}</span>
            <span>進入 {nearbyBuilding?.def.nameZh ?? '建築'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        {/* tab 列放在彈出內容上方，避免使用者每次切換都要先捲過 panel */}
        <div className="flex items-stretch gap-1 bg-ground-900/85 border border-ground-700 rounded-sharp p-1">
          <DrawerTabButton
            label={t('area.scene')}
            active={drawerTab === 'scene'}
            onClick={() => toggleTab('scene')}
          />
          <DrawerTabButton
            label={`${t('area.npcs')} ${outdoorOccupants.length}${allOutdoorOccupants.length > outdoorOccupants.length ? `/${allOutdoorOccupants.length}` : ''}`}
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
        </div>{/* end sticky tab bar wrapper */}

        {drawerTab && (
          <div className="bg-ground-900/95 border border-ground-700 rounded-sharp p-3 max-h-[44vh] overflow-y-auto flex flex-col gap-2">
              {drawerTab === 'scene' && (
                <div className="flex flex-col gap-2">
                  <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500">
                    {t('area.scene')}
                  </div>
                  <p className="text-[13px] text-ground-100 leading-relaxed">
                    {ambient?.text ?? lore.scene[locale]}
                  </p>
                  <p className="text-[11px] text-ground-500 italic leading-relaxed">{lore.whisper[locale]}</p>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="border border-ember-800/70 rounded-sharp px-2 py-2 bg-ground-950/50">
                      <div className="font-display text-[9px] uppercase tracking-tightest text-ember-500">
                        可互動 NPC
                      </div>
                      <div className="mt-1 text-[12px] text-ground-100 leading-snug">
                        {token
                          ? interactionReadyCount > 0
                            ? allOutdoorOccupants.length > outdoorOccupants.length
                              ? `此區有 ${allOutdoorOccupants.length} 位室外 NPC；街景目前顯示 ${outdoorOccupants.length} 位可互動代表。`
                              : `此區有 ${interactionReadyCount} 位室外 NPC，可在 NPC 分頁直接點名字對話。`
                            : '此區室外暫時沒有人；進入有人的建築可以對話。'
                          : '登入後可以點 NPC 名字對話、問事情或交易。'}
                      </div>
                    </div>
                    <div className="border border-cyan-900/70 rounded-sharp px-2 py-2 bg-ground-950/50">
                      <div className="font-display text-[9px] uppercase tracking-tightest text-cyan-300">
                        NPC 互動證據
                      </div>
                      {localSocialEvents.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-1">
                          {localSocialEvents.map((event) => (
                            <li key={event.sequence} className="text-[11px] text-ground-200 leading-snug">
                              · {formatNpcInteractionEvent(event, npcNameById)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-1 text-[11px] text-ground-500 leading-snug">
                          這一區最近沒有 NPC 對談或爭執；切到「事件」可以看所有活動紀錄。
                        </div>
                      )}
                    </div>
                    <div className="border border-lime-900/70 rounded-sharp px-2 py-2 bg-ground-950/50 sm:col-span-2">
                      <div className="font-display text-[9px] uppercase tracking-tightest text-lime-300">
                        動物行為證據
                      </div>
                      {ecology?.animals.length ? (
                        <ul className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {ecology.animals.slice(0, 4).map((row) => {
                            const behavior = animalBehaviorLabel(row)
                            return (
                              <li key={row.speciesId} className="text-[11px] text-ground-200 leading-snug">
                                · {speciesLabel(row.speciesId)} ×{row.count}：{behavior.primary}
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <div className="mt-1 text-[11px] text-ground-500 leading-snug">
                          這一區沒有動物族群資料。
                        </div>
                      )}
                    </div>
                  </div>

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
                  {outdoorOccupants.length === 0 ? (
                    <div className="text-[12px] text-ground-500 italic">{t('area.npcsEmpty')}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {outdoorOccupants.map((npc) => {
                        const isNearby = nearbyNpcIds.has(npc.id)
                        const behavior = npcBehaviorBadge(npc, localEvents)
                        return (
                          <button
                            key={npc.id}
                            type="button"
                            disabled={!token}
                            onClick={() =>
                              token ? setActiveNpc(npc) : handleInteractTooFar(npc.id)
                            }
                            className={[
                              'text-left flex items-center gap-3 px-2 py-2 rounded-sharp border transition-colors',
                              token
                                ? 'border-ground-700 hover:border-ember-600 cursor-pointer'
                                : 'border-ground-800 opacity-50 cursor-not-allowed'
                            ].join(' ')}
                            title={!token ? '登入後才能互動' : '點擊對話'}
                          >
                            <span
                              className={[
                                'w-9 h-9 inline-flex items-center justify-center rounded-full border bg-ground-900 text-[14px] font-display font-extrabold shrink-0',
                                token
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
                              <div className={[
                                'mt-1 w-fit rounded-sharp border px-1.5 py-0.5 text-[10px] leading-none',
                                behaviorToneClass(behavior.tone)
                              ].join(' ')}>
                                {behavior.primary}
                              </div>
                              {npc.intentLine && (
                                <div className="text-[11px] text-ember-300 truncate">
                                  {locale === 'zh' ? npc.intentLine.zh : npc.intentLine.en}
                                </div>
                              )}
                              {npc.cognitiveLine && (
                                <div className="text-[10px] text-cyan-200/80 truncate">
                                  {locale === 'zh' ? npc.cognitiveLine.zh : npc.cognitiveLine.en}
                                </div>
                              )}
                              {npc.cognitiveEvolution && (
                                <div className="text-[10px] text-violet-200/80 truncate">
                                  {npc.cognitiveEvolution.personalityTraceZh ?? npc.cognitiveEvolution.lastReflectionZh ?? npc.cognitiveEvolution.currentThoughtZh}
                                </div>
                              )}
                              <div className="text-[10px] font-display uppercase tracking-tightest text-ground-500">
                                {t('npc.relationship')}{' '}
                                <span className="text-ground-200">{npc.relationshipScore}</span>
                                {isNearby ? (
                                  <span className="ml-2 text-ember-400 normal-case tracking-normal">
                                    · 身邊，可地圖點擊
                                  </span>
                                ) : token ? (
                                  <span className="ml-2 text-ground-400 normal-case tracking-normal">
                                    · 可點名字對話
                                  </span>
                                ) : null}
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
      </div>

      {tooFarFlash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-sharp bg-rust-900/95 border border-rust-600 text-rust-100 text-[12px] font-display tracking-tight shadow-lg pointer-events-none">
          {t('npc.tooFarHint')}
        </div>
      )}

      {deceasedFlash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-sharp bg-rust-900/95 border border-rust-600 text-rust-100 text-[12px] font-display tracking-tight shadow-lg pointer-events-none">
          這位 NPC 已經不在了。
        </div>
      )}

      {actionFeedback && (
        <div className={[
          'fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-sharp text-[12px] font-display tracking-tight shadow-lg pointer-events-none',
          actionFeedback.ok
            ? 'bg-ground-900/95 border border-ground-600 text-ground-100'
            : 'bg-rust-900/95 border border-rust-600 text-rust-100'
        ].join(' ')}>
          {actionFeedback.msg}
        </div>
      )}

      <NpcDialog npc={activeNpc} onClose={() => setActiveNpc(null)} />

      {/* Animal combat confirm dialog */}
      {animalCombatConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/85 backdrop-blur-sm px-3 pb-3 sm:p-6"
          onClick={() => setAnimalCombatConfirm(null)}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            className="w-full max-w-sm gi-panel border-ember-700/60 p-5 flex flex-col gap-4"
          >
            <div>
              <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">危險 / Danger</div>
              <h2 className="font-display font-extrabold text-xl text-ground-100 mt-1">
                對 {animalCombatConfirm.speciesId} 發起戰鬥？
              </h2>
              <p className="text-[12px] text-ground-400 mt-1">此物種具有攻擊性，需透過戰鬥擊殺。</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleAnimalCombatConfirm()}
                className="gi-touch px-4 py-2 text-[12px] font-display uppercase tracking-tightest border border-ember-600 text-ember-300 hover:bg-ember-500/10 rounded-sharp"
              >
                開戰
              </button>
              <button
                type="button"
                onClick={() => setAnimalCombatConfirm(null)}
                className="gi-touch px-4 py-2 text-[12px] font-display uppercase tracking-tightest border border-ground-600 text-ground-300 hover:bg-ground-700/30 rounded-sharp"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animal combat HUD */}
      {animalCombatSession && animalCombatSession.state === 'active' && (
        <CombatHud
          npcName={animalCombatSession.speciesId ?? '野生動物'}
          initialSession={animalCombatSession}
          enemyType="animal"
          {...(animalCombatHand ? { hand: animalCombatHand } : {})}
          onClose={() => {
            setAnimalCombatSession(null)
            setAnimalCombatHand(null)
            refreshEcology()
          }}
        />
      )}
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

function speciesLabel(speciesId: string): string {
  const words = speciesId.split('_').filter(Boolean)
  if (words.length === 0) return speciesId
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
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
