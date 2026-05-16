import Phaser from 'phaser'
import type { CharacterVisualState } from './characterVisualState'
import { textColorForBg } from './npcVisuals'

export type ProceduralAvatar = Readonly<{
  container: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Rectangle
  head: Phaser.GameObjects.Arc
  leftArm: Phaser.GameObjects.Rectangle
  rightArm: Phaser.GameObjects.Rectangle
  leftLeg: Phaser.GameObjects.Rectangle
  rightLeg: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text | null
}>

export type ProceduralAvatarOptions = Readonly<{
  size?: number
  showLabel?: boolean
  depth?: number
}>

const DEFAULT_AVATAR_SIZE = 28

export function createProceduralHumanoidAvatar(
  scene: Phaser.Scene,
  state: CharacterVisualState,
  options: ProceduralAvatarOptions = {}
): ProceduralAvatar {
  const size = options.size ?? DEFAULT_AVATAR_SIZE
  const outline = 0x1c1300
  const skin = 0xffd3a6
  const textColor = textColorForBg(state.color)

  const leftLeg = scene.add.rectangle(-size * 0.18, size * 0.28, size * 0.16, size * 0.36, outline, 1)
  const rightLeg = scene.add.rectangle(size * 0.18, size * 0.28, size * 0.16, size * 0.36, outline, 1)
  const body = scene.add.rectangle(0, 0, size * 0.5, size * 0.62, state.color, 1)
  body.setStrokeStyle(Math.max(1, Math.round(size * 0.07)), outline, 1)
  const leftArm = scene.add.rectangle(-size * 0.38, -size * 0.02, size * 0.14, size * 0.42, state.color, 1)
  const rightArm = scene.add.rectangle(size * 0.38, -size * 0.02, size * 0.14, size * 0.42, state.color, 1)
  const head = scene.add.circle(0, -size * 0.46, size * 0.22, skin, 1)
  head.setStrokeStyle(Math.max(1, Math.round(size * 0.06)), outline, 1)

  const label = options.showLabel === false
    ? null
    : scene.add.text(0, -size * 0.86, state.shortLabel, {
        fontFamily: 'Inter, "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: `${Math.max(10, Math.round(size * 0.42))}px`,
        color: textColor,
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)

  const children = [leftLeg, rightLeg, body, leftArm, rightArm, head, ...(label ? [label] : [])]
  const container = scene.add.container(state.x, state.y, children)
  container.setDepth(options.depth ?? 70)
  container.setData('characterId', state.id)
  container.setData('characterKind', state.kind)
  container.setData('characterAction', state.action)
  applyProceduralAvatarPose(container, state)

  return { container, body, head, leftArm, rightArm, leftLeg, rightLeg, label }
}

export function applyProceduralAvatarPose(
  container: Phaser.GameObjects.Container,
  state: CharacterVisualState
): void {
  container.setPosition(state.x, state.y)
  container.setScale(state.facing === 'left' ? -1 : 1, 1)
  container.setData('characterAction', state.action)

  const leftArm = findChild<Phaser.GameObjects.Rectangle>(container, 3)
  const rightArm = findChild<Phaser.GameObjects.Rectangle>(container, 4)
  const leftLeg = findChild<Phaser.GameObjects.Rectangle>(container, 0)
  const rightLeg = findChild<Phaser.GameObjects.Rectangle>(container, 1)
  const label = findChild<Phaser.GameObjects.Text>(container, 6)

  if (leftArm) leftArm.setRotation(0)
  if (rightArm) rightArm.setRotation(0)
  if (leftLeg) leftLeg.setRotation(0)
  if (rightLeg) rightLeg.setRotation(0)
  if (label) label.setScale(state.facing === 'left' ? -1 : 1, 1)
  container.setAlpha(state.health !== undefined && state.health < 30 ? 0.78 : 1)

  switch (state.action) {
    case 'walk':
      leftLeg?.setRotation(-0.28)
      rightLeg?.setRotation(0.28)
      leftArm?.setRotation(0.22)
      rightArm?.setRotation(-0.22)
      break
    case 'work':
      rightArm?.setRotation(-0.75)
      break
    case 'eat':
      rightArm?.setRotation(-1.1)
      break
    case 'sleep':
      container.setRotation(-Math.PI / 2)
      return
    case 'trade':
      rightArm?.setRotation(-0.45)
      leftArm?.setRotation(0.45)
      break
    case 'patrol':
      leftArm?.setRotation(-0.18)
      rightArm?.setRotation(-0.18)
      break
    case 'idle':
    default:
      break
  }
  container.setRotation(0)
}

function findChild<T extends Phaser.GameObjects.GameObject>(
  container: Phaser.GameObjects.Container,
  index: number
): T | null {
  return (container.list[index] as T | undefined) ?? null
}
