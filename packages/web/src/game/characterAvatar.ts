import Phaser from 'phaser'
import type { CharacterVisualState } from './characterVisualState'
import { textColorForBg } from './npcVisuals'

// 2.5D 程序化人形：地面陰影 + 軀幹體積陰影 + 播種的膚色/髮型/褲色 + 關節
// 原點手腳 + 場景 update 驅動的連續動作循環（走路 / 呼吸 / 工作 / 吃 / 交易）。
// 對外合約（三個場景共用）保持不變：
//   * createProceduralHumanoidAvatar / applyProceduralAvatarPose 簽名不變
//   * ProceduralAvatar 仍暴露 body / 手 / 腳為 Rectangle、head 為 Arc、label
//     為 Text，場景的 applyNpcAvatarColor 直接 setFillStyle 重新上色。

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
const OUTLINE_COLOR = 0x1c1300
const LOW_HEALTH_ALPHA = 0.78
const LOW_HEALTH_THRESHOLD = 30

// 播種用調色盤 — 同一個 id 在三個場景永遠長同一張臉。
const SKIN_TONES: readonly number[] = [0xffd3a6, 0xf2c191, 0xe2a878, 0xc98a5b, 0xffe0b8]
const HAIR_COLORS: readonly number[] = [0x2b2118, 0x191613, 0x5b3a1e, 0x6e7079, 0x3d2c4f, 0x6e3b25, 0x8a6b3f]
const PANTS_COLORS: readonly number[] = [0x2b2138, 0x33312b, 0x27343a, 0x3a2a22]
const HAIR_STYLE_COUNT = 3

// 動作循環參數（ms 週期的倒數刻度）。
const WALK_CYCLE_SPEED = 1 / 130
const IDLE_BREATH_SPEED = 1 / 620
const WORK_SWING_SPEED = 1 / 210
const EAT_CYCLE_SPEED = 1 / 280
const TRADE_GESTURE_SPEED = 1 / 340

type AvatarRigParts = Readonly<{
  rig: Phaser.GameObjects.Container
  shadow: Phaser.GameObjects.Ellipse
  body: Phaser.GameObjects.Rectangle
  head: Phaser.GameObjects.Arc
  leftArm: Phaser.GameObjects.Rectangle
  rightArm: Phaser.GameObjects.Rectangle
  leftLeg: Phaser.GameObjects.Rectangle
  rightLeg: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text | null
  size: number
  phase: number
}>

export function createProceduralHumanoidAvatar(
  scene: Phaser.Scene,
  state: CharacterVisualState,
  options: ProceduralAvatarOptions = {}
): ProceduralAvatar {
  const size = options.size ?? DEFAULT_AVATAR_SIZE
  const seed = hashId(state.id)
  const skin = SKIN_TONES[seed % SKIN_TONES.length] ?? SKIN_TONES[0]!
  const hairColor = HAIR_COLORS[(seed >> 3) % HAIR_COLORS.length] ?? HAIR_COLORS[0]!
  const pantsColor = PANTS_COLORS[(seed >> 6) % PANTS_COLORS.length] ?? PANTS_COLORS[0]!
  const hairStyle = (seed >> 9) % HAIR_STYLE_COUNT
  const strokeW = Math.max(1, Math.round(size * 0.06))
  const textColor = textColorForBg(state.color)

  // 地面陰影：立體感的錨點，跟著步伐微縮放。不放進 rig，bob 時留在地面。
  const shadow = scene.add.ellipse(0, size * 0.5, size * 0.7, size * 0.2, 0x000000, 0.28)

  // rig：所有身體部位的內層容器 — 走路 bob / 呼吸 / 睡姿都動 rig，不動陰影。
  const leftLeg = scene.add.rectangle(-size * 0.13, size * 0.06, size * 0.15, size * 0.44, pantsColor, 1)
  leftLeg.setOrigin(0.5, 0.06)
  leftLeg.setStrokeStyle(strokeW, OUTLINE_COLOR, 1)
  const rightLeg = scene.add.rectangle(size * 0.13, size * 0.06, size * 0.15, size * 0.44, pantsColor, 1)
  rightLeg.setOrigin(0.5, 0.06)
  rightLeg.setStrokeStyle(strokeW, OUTLINE_COLOR, 1)

  const body = scene.add.rectangle(0, -size * 0.06, size * 0.5, size * 0.6, state.color, 1)
  body.setStrokeStyle(strokeW, OUTLINE_COLOR, 1)
  // 體積陰影：固定半透明黑覆蓋在軀幹背側，任何 setFillStyle 重上色都不受影響。
  const bodyShade = scene.add.rectangle(-size * 0.135, -size * 0.06, size * 0.18, size * 0.55, 0x000000, 0.16)
  const belt = scene.add.rectangle(0, size * 0.17, size * 0.48, size * 0.07, 0x000000, 0.25)

  const leftArm = scene.add.rectangle(-size * 0.31, -size * 0.3, size * 0.13, size * 0.44, state.color, 1)
  leftArm.setOrigin(0.5, 0.08)
  leftArm.setStrokeStyle(strokeW, OUTLINE_COLOR, 1)
  const rightArm = scene.add.rectangle(size * 0.31, -size * 0.3, size * 0.13, size * 0.44, state.color, 1)
  rightArm.setOrigin(0.5, 0.08)
  rightArm.setStrokeStyle(strokeW, OUTLINE_COLOR, 1)

  const head = scene.add.circle(0, -size * 0.52, size * 0.21, skin, 1)
  head.setStrokeStyle(strokeW, OUTLINE_COLOR, 1)
  const hairParts = createHair(scene, size, hairColor, hairStyle)
  // 雙眼放在 +x（朝右）側；container 翻面時自動跟著面向。
  const leftEye = scene.add.circle(size * 0.05, -size * 0.53, size * 0.024, OUTLINE_COLOR, 1)
  const rightEye = scene.add.circle(size * 0.135, -size * 0.53, size * 0.024, OUTLINE_COLOR, 1)

  const rig = scene.add.container(0, 0, [
    leftLeg,
    rightLeg,
    bodyShade,
    body,
    belt,
    leftArm,
    rightArm,
    head,
    ...hairParts,
    leftEye,
    rightEye,
  ])

  const label = options.showLabel === false
    ? null
    : scene.add.text(0, -size * 0.98, state.shortLabel, {
        fontFamily: 'Inter, "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: `${Math.max(10, Math.round(size * 0.42))}px`,
        color: textColor,
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)

  const container = scene.add.container(state.x, state.y, [shadow, rig, ...(label ? [label] : [])])
  container.setDepth(options.depth ?? 70)
  container.setData('characterId', state.id)
  container.setData('characterKind', state.kind)
  container.setData('characterAction', state.action)

  const parts: AvatarRigParts = {
    rig,
    shadow,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    label,
    size,
    // 每個角色相位錯開，避免全場 NPC 同步齊步走。
    phase: (seed % 628) / 100,
  }
  container.setData('avatarParts', parts)

  // 連續動作循環：掛在場景 update 上，銷毀時自動解除。
  const onSceneUpdate = () => {
    if (!container.active) return
    animateAvatar(container, parts, scene.time.now)
  }
  scene.events.on(Phaser.Scenes.Events.UPDATE, onSceneUpdate)
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onSceneUpdate)
  })

  applyProceduralAvatarPose(container, state)
  animateAvatar(container, parts, scene.time.now)

  return { container, body, head, leftArm, rightArm, leftLeg, rightLeg, label }
}

export function applyProceduralAvatarPose(
  container: Phaser.GameObjects.Container,
  state: CharacterVisualState
): void {
  container.setPosition(state.x, state.y)
  container.setScale(state.facing === 'left' ? -1 : 1, 1)
  container.setData('characterAction', state.action)
  container.setAlpha(
    state.health !== undefined && state.health < LOW_HEALTH_THRESHOLD ? LOW_HEALTH_ALPHA : 1
  )

  const parts = container.getData('avatarParts') as AvatarRigParts | undefined
  if (!parts) return
  // label 反向縮放，翻面時文字不鏡像。
  parts.label?.setScale(state.facing === 'left' ? -1 : 1, 1)
}

/** 由場景 update 每幀驅動的動作循環。pose 只記錄 action，這裡負責動起來。 */
function animateAvatar(
  container: Phaser.GameObjects.Container,
  parts: AvatarRigParts,
  timeMs: number
): void {
  const action = (container.getData('characterAction') as CharacterVisualState['action']) ?? 'idle'
  const { rig, shadow, leftArm, rightArm, leftLeg, rightLeg, size, phase } = parts

  rig.setRotation(0)
  rig.setScale(1, 1)
  rig.y = 0
  shadow.setScale(1, 1)

  switch (action) {
    case 'walk': {
      const swing = Math.sin(timeMs * WALK_CYCLE_SPEED + phase)
      leftLeg.setRotation(swing * 0.5)
      rightLeg.setRotation(-swing * 0.5)
      leftArm.setRotation(-swing * 0.42)
      rightArm.setRotation(swing * 0.42)
      const bob = Math.abs(Math.sin(timeMs * WALK_CYCLE_SPEED + phase))
      rig.y = -bob * size * 0.06
      shadow.setScale(1 - bob * 0.14, 1)
      break
    }
    case 'patrol': {
      const swing = Math.sin(timeMs * WALK_CYCLE_SPEED * 0.6 + phase)
      leftLeg.setRotation(swing * 0.22)
      rightLeg.setRotation(-swing * 0.22)
      leftArm.setRotation(-0.16 + swing * 0.1)
      rightArm.setRotation(-0.16 - swing * 0.1)
      break
    }
    case 'work': {
      const hammer = Math.sin(timeMs * WORK_SWING_SPEED + phase)
      rightArm.setRotation(-0.95 + hammer * 0.5)
      leftArm.setRotation(0.12)
      leftLeg.setRotation(0)
      rightLeg.setRotation(0)
      rig.y = Math.max(0, hammer) * size * 0.02
      break
    }
    case 'eat': {
      const lift = Math.sin(timeMs * EAT_CYCLE_SPEED + phase)
      rightArm.setRotation(-1.05 + lift * 0.22)
      leftArm.setRotation(0.18)
      leftLeg.setRotation(0)
      rightLeg.setRotation(0)
      break
    }
    case 'trade': {
      const gesture = Math.sin(timeMs * TRADE_GESTURE_SPEED + phase)
      rightArm.setRotation(-0.5 + gesture * 0.18)
      leftArm.setRotation(0.5 - gesture * 0.18)
      leftLeg.setRotation(0)
      rightLeg.setRotation(0)
      break
    }
    case 'sleep': {
      rig.setRotation(-Math.PI / 2)
      rig.y = size * 0.32
      leftArm.setRotation(0)
      rightArm.setRotation(0)
      leftLeg.setRotation(0)
      rightLeg.setRotation(0)
      shadow.setScale(1.25, 1)
      break
    }
    case 'idle':
    default: {
      const breath = Math.sin(timeMs * IDLE_BREATH_SPEED + phase)
      rig.setScale(1, 1 + breath * 0.015)
      leftArm.setRotation(breath * 0.035)
      rightArm.setRotation(-breath * 0.035)
      leftLeg.setRotation(0)
      rightLeg.setRotation(0)
      break
    }
  }
}

function createHair(
  scene: Phaser.Scene,
  size: number,
  hairColor: number,
  style: number
): Phaser.GameObjects.GameObject[] {
  // 頂部髮頂（上半圓弧）所有造型共用。
  const dome = scene.add.arc(0, -size * 0.555, size * 0.215, 180, 360, false, hairColor, 1)
  switch (style) {
    case 1: {
      // 後梳馬尾：腦後加一束下垂髮。
      const tail = scene.add.rectangle(-size * 0.19, -size * 0.45, size * 0.09, size * 0.26, hairColor, 1)
      tail.setOrigin(0.5, 0)
      return [dome, tail]
    }
    case 2: {
      // 側分瀏海：額前加一小片斜蓋。
      const fringe = scene.add.rectangle(size * 0.06, -size * 0.6, size * 0.22, size * 0.08, hairColor, 1)
      fringe.setRotation(0.18)
      return [dome, fringe]
    }
    default:
      return [dome]
  }
}

function hashId(id: string): number {
  let hash = 5381
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0
  }
  return hash
}
