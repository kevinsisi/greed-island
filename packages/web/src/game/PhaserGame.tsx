import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { CANVAS_HEIGHT, CANVAS_WIDTH, type DistrictId } from './districts'
import { MapScene, type MapAreaOverlay, type MapNpc, type MapSceneInit } from './MapScene'

export interface PhaserGameProps {
  npcs: MapNpc[]
  locale: 'zh' | 'en'
  hudStrings: MapSceneInit['hudStrings']
  onAreaEnter: (districtId: DistrictId) => void
  onNpcInteract: (npcId: string) => void
  /** v0.14.0：每 tile 的派系 / 治安 / 經濟 overlay。空陣列 = 無 overlay。 */
  areaOverlays?: MapAreaOverlay[]
}

const PLAYER_POS_STORAGE_KEY = 'gi:hub:player-pos:v1'
const PLAYER_POS_AUTOSAVE_MS = 2_000

function loadPlayerPosition(): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PLAYER_POS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
    const x = typeof parsed.x === 'number' ? parsed.x : NaN
    const y = typeof parsed.y === 'number' ? parsed.y : NaN
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
      x: Math.min(Math.max(x, 0), CANVAS_WIDTH),
      y: Math.min(Math.max(y, 0), CANVAS_HEIGHT)
    }
  } catch {
    return null
  }
}

function savePlayerPosition(pos: { x: number; y: number } | null): void {
  if (typeof window === 'undefined' || !pos) return
  try {
    window.localStorage.setItem(
      PLAYER_POS_STORAGE_KEY,
      JSON.stringify({ x: pos.x, y: pos.y })
    )
  } catch {
    // localStorage may be full or disabled — non-fatal for the prototype.
  }
}

/**
 * 把 Phaser 場景嵌進 React。生命週期：mount 建一次 game，unmount 才 destroy。
 * Props 變動 (npcs / locale / hud strings) 會以 emit 形式餵進 scene，避免重建整個 game。
 */
export function PhaserGame({ npcs, locale, hudStrings, onAreaEnter, onNpcInteract, areaOverlays }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  // callback ref：讓 scene 內部呼叫時拿到最新版的 React handlers，避免閉包過期。
  const callbacksRef = useRef({ onAreaEnter, onNpcInteract })
  callbacksRef.current.onAreaEnter = onAreaEnter
  callbacksRef.current.onNpcInteract = onNpcInteract

  useEffect(() => {
    if (!containerRef.current) return
    if (gameRef.current) return

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: '#12141a',
      pixelArt: true,
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT
      },
      scene: [MapScene],
      // 阻止 Phaser 的 keyboard 預設行為 (例如方向鍵捲動頁面)
      input: {
        keyboard: true,
        mouse: true,
        touch: true
      },
      banner: false
    }

    const game = new Phaser.Game(config)
    gameRef.current = game

    const init: MapSceneInit = {
      callbacks: {
        onAreaEnter: (id) => callbacksRef.current.onAreaEnter(id),
        onNpcInteract: (id) => callbacksRef.current.onNpcInteract(id)
      },
      npcs,
      locale,
      hudStrings,
      initialPosition: loadPlayerPosition()
    }
    if (areaOverlays) init.areaOverlays = areaOverlays
    game.scene.start(MapScene.KEY, init)

    // 每 2 秒把玩家當前位置寫進 localStorage，避免 tab 突然關閉時遺失。
    const autosaveTimer = window.setInterval(() => {
      const scene = game.scene.getScene(MapScene.KEY) as MapScene | null
      if (scene && scene.scene.isActive()) {
        savePlayerPosition(scene.getPlayerPosition())
      }
    }, PLAYER_POS_AUTOSAVE_MS)

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        const scene = game.scene.getScene(MapScene.KEY) as MapScene | null
        if (scene && scene.scene.isActive()) {
          savePlayerPosition(scene.getPlayerPosition())
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      const scene = game.scene.getScene(MapScene.KEY) as MapScene | null
      if (scene) savePlayerPosition(scene.getPlayerPosition())
      window.clearInterval(autosaveTimer)
      document.removeEventListener('visibilitychange', handleVisibility)
      game.destroy(true)
      gameRef.current = null
    }
    // 只在 mount 時跑一次：locale / npcs 變動透過下面的 effect 餵進場景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // npcs / locale / hud 字串 / area overlay 變動 → 通知場景刷新
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    const scene = game.scene.getScene(MapScene.KEY) as MapScene | null
    if (!scene || !scene.scene.isActive()) return
    const update: Parameters<MapScene['applyExternalUpdate']>[0] = {
      npcs,
      locale,
      hudStrings
    }
    if (areaOverlays) update.areaOverlays = areaOverlays
    scene.applyExternalUpdate(update)
  }, [npcs, locale, hudStrings, areaOverlays])

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[800px] mx-auto aspect-[4/3] rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
      style={{ touchAction: 'none' }}
    />
  )
}
