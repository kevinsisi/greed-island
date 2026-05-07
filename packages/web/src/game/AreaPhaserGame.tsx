import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import {
  AREA_CANVAS_HEIGHT,
  AREA_CANVAS_WIDTH,
  AreaScene,
  type AreaMapDrop,
  type AreaMapNpc,
  type AreaSceneInit
} from './AreaScene'
import type { DistrictId } from './districts'

const POSITION_STORAGE_PREFIX = 'gi:areaPos:'

function loadPosition(tileId: string): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_PREFIX + tileId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { x?: unknown }).x === 'number' &&
      typeof (parsed as { y?: unknown }).y === 'number'
    ) {
      return { x: (parsed as { x: number }).x, y: (parsed as { y: number }).y }
    }
    return null
  } catch {
    return null
  }
}

function savePosition(tileId: string, pos: { x: number; y: number }): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(POSITION_STORAGE_PREFIX + tileId, JSON.stringify(pos))
  } catch {
    // 配額或無權限：忽略，下一次再試
  }
}

export interface AreaPhaserGameProps {
  tileId: DistrictId
  npcs: AreaMapNpc[]
  drops: AreaMapDrop[]
  locale: 'zh' | 'en'
  hudStrings: { interact: string; pickup: string; tooFar: string }
  onNpcInteract: (npcId: string) => void
  onDropPickup: (dropId: number) => void
  onNearbyNpcsChange?: (ids: string[]) => void
  onInteractTooFar?: (npcId: string) => void
}

/**
 * 把區域內地圖的 Phaser 場景嵌進 React。
 * - 玩家位置以 localStorage 持久化，鍵：gi:areaPos:<tileId>
 * - tileId 變動會把整個 game 重建，把位置從新 tile 的記錄載入
 */
export function AreaPhaserGame({
  tileId,
  npcs,
  drops,
  locale,
  hudStrings,
  onNpcInteract,
  onDropPickup,
  onNearbyNpcsChange,
  onInteractTooFar
}: AreaPhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  const callbacksRef = useRef({
    onNpcInteract,
    onDropPickup,
    tileId,
    onNearbyNpcsChange,
    onInteractTooFar
  })
  callbacksRef.current.onNpcInteract = onNpcInteract
  callbacksRef.current.onDropPickup = onDropPickup
  callbacksRef.current.tileId = tileId
  callbacksRef.current.onNearbyNpcsChange = onNearbyNpcsChange
  callbacksRef.current.onInteractTooFar = onInteractTooFar

  // tileId 變動 → 重建場景以套用新的 startPosition
  useEffect(() => {
    if (!containerRef.current) return

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

    const init: AreaSceneInit = {
      callbacks: {
        onNpcInteract: (id) => callbacksRef.current.onNpcInteract(id),
        onDropPickup: (id) => callbacksRef.current.onDropPickup(id),
        onPositionChange: (pos) => savePosition(callbacksRef.current.tileId, pos),
        onNearbyNpcsChange: (ids) => callbacksRef.current.onNearbyNpcsChange?.(ids),
        onInteractTooFar: (id) => callbacksRef.current.onInteractTooFar?.(id)
      },
      tileId,
      npcs,
      drops,
      locale,
      hudStrings,
      startPosition: loadPosition(tileId)
    }
    game.scene.start(AreaScene.KEY, init)

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
    // 只在 mount 與 tileId 變動時跑一次：locale / npcs 變動透過下面的 effect 餵進場景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId])

  // npcs / drops / locale / hud 字串變動 → 通知場景刷新
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    const scene = game.scene.getScene(AreaScene.KEY) as AreaScene | null
    if (!scene || !scene.scene.isActive()) return
    scene.applyExternalUpdate({ npcs, drops, locale, hudStrings })
  }, [npcs, drops, locale, hudStrings])

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[600px] mx-auto aspect-[3/2] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
      style={{ touchAction: 'none' }}
    />
  )
}
