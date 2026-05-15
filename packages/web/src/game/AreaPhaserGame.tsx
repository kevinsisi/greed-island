import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import type { AreaEcologyView } from '../api/client'
import {
  AREA_CANVAS_HEIGHT,
  AREA_CANVAS_WIDTH,
  AreaScene,
  type AreaMapBuilding,
  type AreaMapDrop,
  type AreaMapNpc,
  type AreaMapPlayer,
  type AreaSceneInit,
  type AreaWeather
} from './AreaScene'
import type { DistrictId } from './districts'

const POSITION_STORAGE_PREFIX = 'gi:areaPos:'
const LEGACY_POSITION_STORAGE_PREFIX = 'gi:areaPos:'
type AreaPosition = { x: number; y: number; z: number }

function positionStorageKey(tileId: string, playerId?: number | null): string {
  return `${POSITION_STORAGE_PREFIX}${playerId ? `u${playerId}:` : 'guest:'}${tileId}`
}

function loadPosition(tileId: string, playerId?: number | null): AreaPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw =
      window.localStorage.getItem(positionStorageKey(tileId, playerId)) ??
      window.localStorage.getItem(LEGACY_POSITION_STORAGE_PREFIX + tileId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { x?: unknown }).x === 'number' &&
      typeof (parsed as { y?: unknown }).y === 'number'
    ) {
      const z = (parsed as { z?: unknown }).z
      return {
        x: (parsed as { x: number }).x,
        y: (parsed as { y: number }).y,
        z: typeof z === 'number' && Number.isFinite(z) ? z : 0
      }
    }
    return null
  } catch {
    return null
  }
}

function savePosition(tileId: string, playerId: number | null | undefined, pos: AreaPosition): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(positionStorageKey(tileId, playerId), JSON.stringify(pos))
  } catch {
    // 配額或無權限：忽略，下一次再試
  }
}

export interface AreaPhaserGameProps {
  tileId: DistrictId
  npcs: AreaMapNpc[]
  players?: AreaMapPlayer[]
  drops: AreaMapDrop[]
  buildings?: AreaMapBuilding[]
  locale: 'zh' | 'en'
  playerId?: number | null
  playerName?: string | null
  hudStrings: { interact: string; pickup: string; tooFar: string; enterBuilding?: string }
  /** v0.15.1：當前世界天氣（已 normalise）；AreaScene 用來切換 VFX */
  weather?: AreaWeather
  /** Sprint 2A — ecology rollup for the current tile (server-authoritative). */
  ecology?: AreaEcologyView | null
  controlsEnabled?: boolean
  onNpcInteract: (npcId: string) => void
  onDropPickup: (dropId: number) => void
  onNearbyNpcsChange?: (ids: string[]) => void
  onInteractTooFar?: (npcId: string) => void
  onBuildingEnter?: (buildingId: string) => void
  onExit?: () => void
  onPositionChange?: (pos: AreaPosition) => void
  /** v0.15.2：玩家最近的可進入建築變動時 fire；React 渲染地圖外面的「進入 X」按鈕 */
  onNearbyBuildingChange?: (buildingId: string | null) => void
}

/**
 * 把區域內地圖的 Phaser 場景嵌進 React。
 * - 玩家位置以 localStorage 持久化，鍵：gi:areaPos:u<accountId>:<tileId>
 * - tileId 變動會把整個 game 重建，把位置從新 tile 的記錄載入
 */
export function AreaPhaserGame({
  tileId,
  npcs,
  players,
  drops,
  buildings,
  locale,
  playerId,
  playerName,
  hudStrings,
  weather,
  ecology,
  controlsEnabled = true,
  onNpcInteract,
  onDropPickup,
  onNearbyNpcsChange,
  onInteractTooFar,
  onBuildingEnter,
  onExit,
  onPositionChange,
  onNearbyBuildingChange
}: AreaPhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  const callbacksRef = useRef({
    onNpcInteract,
    onDropPickup,
    tileId,
    onNearbyNpcsChange,
    onInteractTooFar,
    onBuildingEnter,
    onExit,
    onPositionChange,
    onNearbyBuildingChange
  })
  callbacksRef.current.onNpcInteract = onNpcInteract
  callbacksRef.current.onDropPickup = onDropPickup
  callbacksRef.current.tileId = tileId
  callbacksRef.current.onNearbyNpcsChange = onNearbyNpcsChange
  callbacksRef.current.onInteractTooFar = onInteractTooFar
  callbacksRef.current.onBuildingEnter = onBuildingEnter
  callbacksRef.current.onExit = onExit
  callbacksRef.current.onPositionChange = onPositionChange
  callbacksRef.current.onNearbyBuildingChange = onNearbyBuildingChange

  // tileId 變動 → 重建場景以套用新的 startPosition
  useEffect(() => {
    if (!containerRef.current) return
    const sceneTileId = tileId
    const scenePlayerId = playerId
    const sceneOnPositionChange = onPositionChange

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: AREA_CANVAS_WIDTH,
      height: AREA_CANVAS_HEIGHT,
      backgroundColor: '#12141a',
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
        width: AREA_CANVAS_WIDTH,
        height: AREA_CANVAS_HEIGHT
      },
      scene: [AreaScene],
      input: { keyboard: true, mouse: true, touch: true },
      banner: false
    }

    const game = new Phaser.Game(config)
    gameRef.current = game

    const startPosition = controlsEnabled ? loadPosition(sceneTileId, scenePlayerId) : null
    const initialPosition = startPosition ?? { x: AREA_CANVAS_WIDTH / 2, y: AREA_CANVAS_HEIGHT / 2, z: 0 }
    const init: AreaSceneInit = {
      callbacks: {
        onNpcInteract: (id) => callbacksRef.current.onNpcInteract(id),
        onDropPickup: (id) => callbacksRef.current.onDropPickup(id),
        onPositionChange: (pos) => {
          if (!controlsEnabled) return
          savePosition(sceneTileId, scenePlayerId, pos)
          sceneOnPositionChange?.(pos)
        },
        onNearbyNpcsChange: (ids) => callbacksRef.current.onNearbyNpcsChange?.(ids),
        onInteractTooFar: (id) => callbacksRef.current.onInteractTooFar?.(id),
        onBuildingEnter: (id) => callbacksRef.current.onBuildingEnter?.(id),
        onExit: () => callbacksRef.current.onExit?.(),
        onNearbyBuildingChange: (id) => callbacksRef.current.onNearbyBuildingChange?.(id)
      },
      tileId: sceneTileId,
      npcs,
      ...(players ? { players } : {}),
      drops,
      ...(buildings ? { buildings } : {}),
      locale,
      ...(playerName !== undefined ? { playerName } : {}),
      hudStrings,
      startPosition,
      controlsEnabled,
      ...(weather ? { weather } : {}),
      ...(ecology !== undefined ? { ecology } : {})
    }
    game.scene.start(AreaScene.KEY, init)
    if (controlsEnabled) sceneOnPositionChange?.(initialPosition)

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
    // 只在 mount 與 tileId 變動時跑一次：locale / npcs 變動透過下面的 effect 餵進場景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId, playerId, controlsEnabled])

  // npcs / players / drops / buildings / locale / hud / weather 變動 → 通知場景刷新
  useEffect(() => {
    let retryTimer: number | null = null
    let attempts = 0
    const update: Parameters<AreaScene['applyExternalUpdate']>[0] = {
      npcs,
      drops,
      locale,
      hudStrings,
      controlsEnabled,
      ...(weather ? { weather } : {}),
      ...(ecology !== undefined ? { ecology } : {})
    }
    if (players) update.players = players
    if (playerName !== undefined) update.playerName = playerName
    if (buildings) update.buildings = buildings
    const apply = () => {
      const game = gameRef.current
      if (!game) return
      const scene = game.scene.getScene(AreaScene.KEY) as AreaScene | null
      if (!scene || !scene.scene.isActive()) {
        if (attempts < 10) {
          attempts += 1
          retryTimer = window.setTimeout(apply, 16)
        }
        return
      }
      scene.applyExternalUpdate(update)
    }
    apply()
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [npcs, players, playerName, drops, buildings, locale, hudStrings, weather, ecology, controlsEnabled])

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[600px] mx-auto aspect-[3/2] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
      style={{ touchAction: 'none' }}
    />
  )
}
