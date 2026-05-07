import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { BuildingScene, INTERIOR_CELL, type BuildingSceneInit, type BuildingSceneNpc } from './BuildingScene'
import type { ServerBuildingDef } from '../api/client'

export interface BuildingPhaserGameProps {
  building: ServerBuildingDef
  npcs: BuildingSceneNpc[]
  onNpcInteract: (npcId: string) => void
}

export function BuildingPhaserGame({ building, npcs, onNpcInteract }: BuildingPhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const callbacksRef = useRef({ onNpcInteract })
  callbacksRef.current.onNpcInteract = onNpcInteract

  const width = building.interior.cols * INTERIOR_CELL
  const height = building.interior.rows * INTERIOR_CELL

  useEffect(() => {
    if (!containerRef.current) return
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width,
      height,
      backgroundColor: '#0a0710',
      pixelArt: true,
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY, width, height },
      scene: [BuildingScene],
      input: { keyboard: true, mouse: true, touch: true },
      banner: false
    }
    const game = new Phaser.Game(config)
    gameRef.current = game

    const init: BuildingSceneInit = {
      building,
      npcs,
      callbacks: { onNpcInteract: (id) => callbacksRef.current.onNpcInteract(id) }
    }
    game.scene.start(BuildingScene.KEY, init)

    return () => {
      game.destroy(true)
      gameRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building.id])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    const scene = game.scene.getScene(BuildingScene.KEY) as BuildingScene | null
    if (!scene || !scene.scene.isActive()) return
    scene.applyExternalUpdate({ npcs })
  }, [npcs])

  return (
    <div
      ref={containerRef}
      className="w-full mx-auto rounded-sharp overflow-hidden border border-ground-700 bg-ground-900 select-none"
      style={{ touchAction: 'none', maxWidth: width, aspectRatio: `${width} / ${height}` }}
    />
  )
}
