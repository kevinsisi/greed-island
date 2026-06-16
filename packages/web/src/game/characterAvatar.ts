import Phaser from 'phaser'
import type { CharacterVisualState } from './characterVisualState'
import { textColorForBg } from './npcVisuals'

// 8-bit 像素小人 — 與 pixelWorld 的樹/屋道具同一種 chunky 像素語彙。
//
// 結構（全部 texture-based，不再用向量方塊拼裝）：
//   * legs  ：白底灰階雙幀（立正 / 跨步）→ setTint 褲色
//   * body  ：白底灰階軀幹+手臂雙幀（垂手 / 擺臂）+ 工作幀（舉鎚）→ setTint 衣色
//   * head  ：膚色直繪（5 種膚色 texture），眼睛偏右 → flipX 即轉向
//   * hair  ：髮色×髮型 lazy 生成
// 動作循環掛在場景 UPDATE：走路換幀+bob、待機呼吸、工作舉鎚、睡姿側躺。
//
// 對外合約：
//   * createProceduralHumanoidAvatar / applyProceduralAvatarPose 簽名不變
//   * ProceduralAvatar 改為 texture 欄位；場景重新上色一律走
//     applyAvatarOutfitColor(avatar, color)（取代舊的 body.setFillStyle）。

export type ProceduralAvatar = Readonly<{
  container: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Image
  head: Phaser.GameObjects.Image
  legs: Phaser.GameObjects.Image
  hair: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text | null
}>

export type ProceduralAvatarOptions = Readonly<{
  size?: number
  showLabel?: boolean
  depth?: number
}>

const DEFAULT_AVATAR_SIZE = 28
const LOW_HEALTH_ALPHA = 0.78
const LOW_HEALTH_THRESHOLD = 30

const SKIN_TONES: readonly number[] = [0xffd9b0, 0xf2c191, 0xe2a878, 0xc98a5b, 0xffe4c0]
const HAIR_COLORS: readonly number[] = [0x2b2118, 0x191613, 0x5b3a1e, 0x6e7079, 0x3d2c4f, 0x6e3b25, 0x8a6b3f]
const PANTS_COLORS: readonly number[] = [0x4a4458, 0x55524a, 0x47585e, 0x5e4a3e]
const HAIR_STYLE_COUNT = 3

// 角色邏輯像素：3px。整體 10×15 units（30×45px），對 28px 基準再由 size 縮放。
const HU = 3
const CHAR_W = 10
const CHAR_H = 15
const BASE_SPRITE_HEIGHT = CHAR_H * HU // 45

const WALK_CYCLE_MS = 170
const IDLE_BREATH_SPEED = 1 / 620
const WORK_SWING_SPEED = 1 / 230

type Px = (x: number, y: number, w: number, h: number, color: number, alpha?: number) => void

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  wUnits: number,
  hUnits: number,
  draw: (px: Px) => void
): void {
  if (scene.textures.exists(key)) return
  const g = scene.add.graphics()
  const px: Px = (x, y, w, h, color, alpha = 1) => {
    g.fillStyle(color, alpha)
    g.fillRect(x * HU, y * HU, w * HU, h * HU)
  }
  draw(px)
  g.generateTexture(key, wUnits * HU, hUnits * HU)
  g.destroy()
}

const BODY_W = 0xffffff
const BODY_S = 0xb4b4b4 // 暗面（tint 後變深色）
const DARKPX = 0x232323

/** 軀幹（含手臂）三幀 + 腿兩幀 — 白底灰階，tint 上色。 */
function ensureHumanBaseTextures(scene: Phaser.Scene): void {
  // 腿：frame 0 立正、frame 1 跨步
  makeTexture(scene, 'pxh-legs-0', CHAR_W, 5, (px) => {
    px(3, 0, 2, 4, BODY_W)
    px(5, 0, 2, 4, BODY_S)
    px(2, 4, 3, 1, DARKPX)
    px(5, 4, 3, 1, DARKPX)
  })
  makeTexture(scene, 'pxh-legs-1', CHAR_W, 5, (px) => {
    px(2, 0, 2, 3, BODY_W)
    px(1, 3, 2, 1, BODY_W)
    px(0, 4, 3, 1, DARKPX)
    px(6, 0, 2, 3, BODY_S)
    px(7, 3, 2, 1, BODY_S)
    px(7, 4, 3, 1, DARKPX)
  })
  // 軀幹：frame 0 垂手、frame 1 擺臂、work 舉鎚
  makeTexture(scene, 'pxh-body-0', CHAR_W, 6, (px) => {
    px(2, 0, 6, 5, BODY_W)
    px(6, 0, 2, 5, BODY_S)
    px(0, 1, 2, 4, BODY_W)
    px(8, 1, 2, 4, BODY_S)
    px(2, 5, 6, 1, BODY_S) // 腰帶
  })
  makeTexture(scene, 'pxh-body-1', CHAR_W, 6, (px) => {
    px(2, 0, 6, 5, BODY_W)
    px(6, 0, 2, 5, BODY_S)
    px(0, 0, 2, 3, BODY_W) // 前臂上擺
    px(8, 2, 2, 4, BODY_S) // 後臂下擺
    px(2, 5, 6, 1, BODY_S)
  })
  makeTexture(scene, 'pxh-body-work', CHAR_W, 8, (px) => {
    px(2, 2, 6, 5, BODY_W)
    px(6, 2, 2, 5, BODY_S)
    px(0, 3, 2, 4, BODY_W)
    px(8, 0, 2, 4, BODY_S) // 舉起的手臂
    px(8, 0, 2, 1, 0x3a3a3a) // 工具頭（深色不受 tint 影響太多）
    px(2, 7, 6, 1, BODY_S)
  })
}

function headTextureKey(skinIdx: number): string {
  return `pxh-head-${skinIdx}`
}

function ensureHeadTexture(scene: Phaser.Scene, skinIdx: number): void {
  const skin = SKIN_TONES[skinIdx] ?? SKIN_TONES[0]!
  makeTexture(scene, headTextureKey(skinIdx), 8, 7, (px) => {
    px(1, 0, 6, 6, skin)
    px(6, 0, 1, 6, shadeOf(skin))
    px(0, 2, 1, 3, skin) // 左耳
    px(7, 2, 1, 3, shadeOf(skin)) // 右耳
    // 眼睛偏右（角色朝右）；flipX 即面向左
    px(4, 2, 1, 1, DARKPX)
    px(6, 2, 1, 1, DARKPX)
    px(5, 4, 1, 1, shadeOf(skin)) // 嘴影
  })
}

function hairTextureKey(colorIdx: number, style: number): string {
  return `pxh-hair-${colorIdx}-${style}`
}

function ensureHairTexture(scene: Phaser.Scene, colorIdx: number, style: number): void {
  const color = HAIR_COLORS[colorIdx] ?? HAIR_COLORS[0]!
  makeTexture(scene, hairTextureKey(colorIdx, style), 8, 5, (px) => {
    // 共通髮頂
    px(1, 0, 6, 2, color)
    px(0, 1, 1, 2, color)
    px(7, 1, 1, 2, shadeOf(color))
    if (style === 1) {
      // 後梳馬尾
      px(0, 2, 1, 3, color)
      px(0, 4, 1, 1, shadeOf(color))
    } else if (style === 2) {
      // 側分瀏海
      px(4, 2, 3, 1, color)
    } else {
      // 圓蓋
      px(1, 2, 2, 1, color)
    }
  })
}

function shadeOf(color: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - 40)
  const g = Math.max(0, ((color >> 8) & 0xff) - 40)
  const b = Math.max(0, (color & 0xff) - 40)
  return (r << 16) | (g << 8) | b
}

type AvatarParts = Readonly<{
  rig: Phaser.GameObjects.Container
  shadow: Phaser.GameObjects.Ellipse
  body: Phaser.GameObjects.Image
  legs: Phaser.GameObjects.Image
  head: Phaser.GameObjects.Image
  hair: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text | null
  outfitColor: number
  phase: number
  lastStepAt: number
  stepFrame: 0 | 1
}>

type MutableAvatarParts = {
  -readonly [K in keyof AvatarParts]: AvatarParts[K]
}

export function createProceduralHumanoidAvatar(
  scene: Phaser.Scene,
  state: CharacterVisualState,
  options: ProceduralAvatarOptions = {}
): ProceduralAvatar {
  const size = options.size ?? DEFAULT_AVATAR_SIZE
  const seed = hashId(state.id)
  const skinIdx = seed % SKIN_TONES.length
  const hairIdx = (seed >> 3) % HAIR_COLORS.length
  const hairStyle = (seed >> 9) % HAIR_STYLE_COUNT
  const pantsColor = PANTS_COLORS[(seed >> 6) % PANTS_COLORS.length] ?? PANTS_COLORS[0]!
  const textColor = textColorForBg(state.color)

  ensureHumanBaseTextures(scene)
  ensureHeadTexture(scene, skinIdx)
  ensureHairTexture(scene, hairIdx, hairStyle)

  // 以 size 為「目標總高」縮放（28px 基準 → scale ≈ 0.78；hub 34px → ~0.93）。
  const scale = (size * 1.55) / BASE_SPRITE_HEIGHT

  const shadow = scene.add.ellipse(0, size * 0.5, size * 0.72, size * 0.2, 0x000000, 0.28)

  // rig 內以「腳底 = size*0.5」對齊：legs 底部貼地。
  const footY = size * 0.5
  const legs = scene.add.image(0, footY, 'pxh-legs-0').setOrigin(0.5, 1).setScale(scale)
  legs.setTint(pantsColor)
  const legsH = 5 * HU * scale
  const body = scene.add.image(0, footY - legsH + 1, 'pxh-body-0').setOrigin(0.5, 1).setScale(scale)
  body.setTint(state.color)
  const bodyH = 6 * HU * scale
  const headY = footY - legsH - bodyH + 2
  const head = scene.add.image(0, headY, headTextureKey(skinIdx)).setOrigin(0.5, 1).setScale(scale)
  const headH = 7 * HU * scale
  const hair = scene.add.image(0, headY - headH + 2 * HU * scale, hairTextureKey(hairIdx, hairStyle))
    .setOrigin(0.5, 1)
    .setScale(scale)

  const rig = scene.add.container(0, 0, [legs, body, head, hair])

  const label = options.showLabel === false
    ? null
    : scene.add.text(0, headY - headH - 4, state.shortLabel, {
        fontFamily: 'Inter, "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: `${Math.max(10, Math.round(size * 0.42))}px`,
        color: textColor,
        fontStyle: 'bold',
      }).setOrigin(0.5, 1)

  const container = scene.add.container(state.x, state.y, [shadow, rig, ...(label ? [label] : [])])
  container.setDepth(options.depth ?? 70)
  container.setData('characterId', state.id)
  container.setData('characterKind', state.kind)
  container.setData('characterAction', state.action)

  const parts: MutableAvatarParts = {
    rig,
    shadow,
    body,
    legs,
    head,
    hair,
    label,
    outfitColor: state.color,
    phase: (seed % 628) / 100,
    lastStepAt: 0,
    stepFrame: 0,
  }
  container.setData('avatarParts', parts)

  const onSceneUpdate = (): void => {
    if (!container.active) return
    animateAvatar(container, parts, scene.time.now, size)
  }
  scene.events.on(Phaser.Scenes.Events.UPDATE, onSceneUpdate)
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onSceneUpdate)
  })

  applyProceduralAvatarPose(container, state)
  animateAvatar(container, parts, scene.time.now, size)

  return { container, body, head, legs, hair, label }
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
  const parts = container.getData('avatarParts') as MutableAvatarParts | undefined
  if (!parts) return
  parts.label?.setScale(state.facing === 'left' ? -1 : 1, 1)
}

/** 場景換裝（faction 重新上色等）— 取代舊的 body.setFillStyle 路徑。 */
export function applyAvatarOutfitColor(avatar: ProceduralAvatar, color: number): void {
  avatar.body.setTint(color)
  const parts = avatar.container.getData('avatarParts') as MutableAvatarParts | undefined
  if (parts) parts.outfitColor = color
  avatar.label?.setColor(textColorForBg(color))
}

function animateAvatar(
  container: Phaser.GameObjects.Container,
  parts: MutableAvatarParts,
  timeMs: number,
  size: number
): void {
  const action = (container.getData('characterAction') as CharacterVisualState['action']) ?? 'idle'
  const { rig, shadow, body, legs } = parts

  rig.setRotation(0)
  rig.setScale(1, 1)
  rig.y = 0
  shadow.setScale(1, 1)

  switch (action) {
    case 'walk':
    case 'patrol': {
      const interval = action === 'walk' ? WALK_CYCLE_MS : WALK_CYCLE_MS * 1.8
      if (timeMs - parts.lastStepAt > interval) {
        parts.lastStepAt = timeMs
        parts.stepFrame = parts.stepFrame === 0 ? 1 : 0
      }
      legs.setTexture(parts.stepFrame === 0 ? 'pxh-legs-0' : 'pxh-legs-1')
      body.setTexture(parts.stepFrame === 0 ? 'pxh-body-0' : 'pxh-body-1')
      body.setTint(parts.outfitColor)
      const bob = Math.abs(Math.sin(timeMs / interval + parts.phase))
      rig.y = -bob * size * 0.05
      shadow.setScale(1 - bob * 0.12, 1)
      break
    }
    case 'work': {
      const swing = Math.sin(timeMs * WORK_SWING_SPEED + parts.phase)
      body.setTexture(swing > 0 ? 'pxh-body-work' : 'pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.y = Math.max(0, swing) * size * 0.02
      break
    }
    case 'eat':
    case 'trade': {
      const cycle = Math.sin(timeMs / 320 + parts.phase)
      body.setTexture(cycle > 0 ? 'pxh-body-1' : 'pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      break
    }
    case 'sleep': {
      body.setTexture('pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.setRotation(-Math.PI / 2)
      rig.y = size * 0.32
      shadow.setScale(1.25, 1)
      break
    }
    case 'read': {
      // Forward lean, slow page-turn rhythm (one frame every ~1.5s)
      const pageTurn = Math.floor(timeMs / 1500 + parts.phase) % 2
      body.setTexture(pageTurn === 0 ? 'pxh-body-0' : 'pxh-body-1')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.setRotation(0.08)
      rig.y = size * 0.04
      break
    }
    case 'perform': {
      // Upbeat rhythm sway — faster than eat/trade, with bounce
      const beat = Math.sin(timeMs / 220 + parts.phase)
      body.setTexture(beat > 0.3 ? 'pxh-body-1' : 'pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.y = Math.abs(beat) * size * 0.04
      break
    }
    case 'craft': {
      // Two-handed motion — slower than work, emphasises upswing hold
      const press = Math.sin(timeMs * (WORK_SWING_SPEED * 0.7) + parts.phase)
      body.setTexture(press > 0.2 ? 'pxh-body-work' : 'pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.y = Math.max(0, press * 0.5) * size * 0.03
      break
    }
    case 'study': {
      // Concentrated lean with subtle head-bob
      const bob = Math.sin(timeMs / 900 + parts.phase)
      body.setTexture('pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.setRotation(0.06)
      rig.y = bob * size * 0.025 + size * 0.03
      break
    }
    case 'pray': {
      // Slow rise-and-fall, slight forward tilt
      const rise = Math.sin(timeMs / 1200 + parts.phase)
      body.setTexture('pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.setScale(1, 1 + rise * 0.02)
      rig.setRotation(rise * 0.05)
      break
    }
    case 'write': {
      // Slow arm sweep — one stroke every ~2s
      const stroke = Math.sin(timeMs / 600 + parts.phase)
      body.setTexture(stroke > 0 ? 'pxh-body-work' : 'pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.setRotation(0.04)
      rig.y = size * 0.03
      break
    }
    case 'guard': {
      // Alert upright stance — very slow scan (nearly static, subtle breath)
      const scan = Math.sin(timeMs / 2400 + parts.phase)
      body.setTexture('pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      rig.setScale(1, 1 + scan * 0.01)
      break
    }
    case 'idle':
    default: {
      body.setTexture('pxh-body-0')
      body.setTint(parts.outfitColor)
      legs.setTexture('pxh-legs-0')
      const breath = Math.sin(timeMs * IDLE_BREATH_SPEED + parts.phase)
      rig.setScale(1, 1 + breath * 0.015)
      break
    }
  }
}

function hashId(id: string): number {
  let hash = 5381
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0
  }
  return hash
}
