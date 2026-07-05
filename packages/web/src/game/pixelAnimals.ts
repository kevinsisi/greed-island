// 8-bit 像素動物 + 環境生命層。
//
// 動物 sprite 以「白底灰階」繪製、執行期用物種色 setTint 上色 — 23 個物種
// 共用 5 種體型原型（四足獸 / 鳥 / 魚 / 蟹 / 蛇），每原型兩幀（站立 / 跨步）。
// AnimalActor 是顯示層行為機（server 仍是族群數量的權威來源）：
//   * 漫遊：每 2~4 秒往附近一點移動，途中雙幀交替 = 走路動畫
//   * 吃草：移動間歇低頭 bob
//   * 逃離：玩家靠近（<72px）且非掠食者 → 往反方向快速移動
//   * 潛行：掠食者物種 → 緩慢逼近玩家到 ~56px 為止
// 環境生命：飛鳥橫越畫面、蝴蝶遊蕩、（森林）落葉 — 全程序化，無外部資產。

import Phaser from 'phaser'
import { PX } from './pixelWorld'

export type AnimalArchetype = 'quadruped' | 'bird' | 'fish' | 'crab' | 'serpent'

const ARCHETYPE_BY_SPECIES: Readonly<Record<string, AnimalArchetype>> = {
  marsh_fish: 'fish',
  salt_crab: 'crab',
  reed_eel: 'fish',
  marsh_heron: 'bird',
  white_marsh_leviathan: 'serpent',
  marsh_yak: 'quadruped',
  forest_deer: 'quadruped',
  moss_boar: 'quadruped',
  fog_wolf: 'quadruped',
  ember_owl: 'bird',
  bark_mantis: 'crab',
  cliff_goat: 'quadruped',
  iron_beak_vulture: 'bird',
  stone_lizard: 'serpent',
  mountain_bear: 'quadruped',
  dune_lizard: 'serpent',
  ash_serpent: 'serpent',
  sand_runner: 'bird',
  mirage_hawk: 'bird',
  ruin_rat: 'quadruped',
  mimic_mold: 'crab',
  iron_hound: 'quadruped',
  lantern_moth: 'bird',
}

/** 顯示層掠食者鏡像（server species catalog 的 aggression 高物種）。 */
const PREDATOR_SPECIES = new Set([
  'fog_wolf',
  'mountain_bear',
  'iron_hound',
  'ash_serpent',
  'iron_beak_vulture',
  'mirage_hawk',
  'white_marsh_leviathan',
  'bark_mantis',
])

export function archetypeForSpecies(speciesId: string): AnimalArchetype {
  return ARCHETYPE_BY_SPECIES[speciesId] ?? 'quadruped'
}

export function isPredatorSpecies(speciesId: string): boolean {
  return PREDATOR_SPECIES.has(speciesId)
}

export function animalTextureKey(arch: AnimalArchetype, frame: 0 | 1): string {
  return `pxa-${arch}-${frame}`
}

type Px = (x: number, y: number, w: number, h: number, color: number, alpha?: number) => void

/** 白底灰階動物 texture（執行期 setTint 上物種色）。 */
export function ensurePixelAnimalTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(animalTextureKey('quadruped', 0))) return
  const u = Math.max(2, Math.round(PX * 0.6)) // 動物用更小的邏輯像素

  const make = (key: string, wUnits: number, hUnits: number, draw: (px: Px) => void): void => {
    const g = scene.add.graphics()
    const px: Px = (x, y, w, h, color, alpha = 1) => {
      g.fillStyle(color, alpha)
      g.fillRect(x * u, y * u, w * u, h * u)
    }
    draw(px)
    g.generateTexture(key, wUnits * u, hUnits * u)
    g.destroy()
  }

  const BODY = 0xffffff
  const SHADE = 0xb8b8b8
  const DARK = 0x222222

  // 四足獸：身體 + 頭(朝右) + 四腿（frame 0/1 交替）
  for (const frame of [0, 1] as const) {
    make(animalTextureKey('quadruped', frame), 9, 7, (px) => {
      px(1, 1, 6, 3, BODY)
      px(1, 3, 6, 1, SHADE)
      px(6, 0, 2, 3, BODY)
      px(7, 1, 1, 1, DARK) // 眼
      px(8, 1, 1, 1, SHADE) // 鼻
      if (frame === 0) {
        px(1, 4, 1, 3, BODY)
        px(3, 4, 1, 2, SHADE)
        px(5, 4, 1, 3, BODY)
        px(6, 4, 1, 2, SHADE)
      } else {
        px(2, 4, 1, 2, SHADE)
        px(3, 4, 1, 3, BODY)
        px(5, 4, 1, 2, SHADE)
        px(7, 4, 1, 3, BODY)
      }
      px(0, 1, 1, 2, SHADE) // 尾
    })
  }

  // 鳥：身體 + 翅膀（上下兩幀）+ 喙
  for (const frame of [0, 1] as const) {
    make(animalTextureKey('bird', frame), 8, 6, (px) => {
      px(2, 2, 4, 2, BODY)
      px(5, 1, 2, 2, BODY)
      px(6, 1, 1, 1, DARK)
      px(7, 2, 1, 1, 0xd9a23c) // 喙
      if (frame === 0) {
        px(1, 0, 4, 2, SHADE) // 翅上揚
      } else {
        px(2, 4, 4, 1, SHADE) // 翅下壓
      }
      px(3, 4, 1, 2, 0xd9a23c)
      px(4, 4, 1, 2, 0xd9a23c)
    })
  }

  // 魚：橢圓身 + 尾鰭（frame 擺動）
  for (const frame of [0, 1] as const) {
    make(animalTextureKey('fish', frame), 8, 4, (px) => {
      px(2, 0, 4, 1, SHADE)
      px(1, 1, 6, 2, BODY)
      px(2, 3, 4, 1, SHADE)
      px(6, 1, 1, 1, DARK)
      if (frame === 0) {
        px(0, 0, 1, 2, SHADE)
      } else {
        px(0, 2, 1, 2, SHADE)
      }
    })
  }

  // 蟹：寬身 + 雙螯（frame 開合）
  for (const frame of [0, 1] as const) {
    make(animalTextureKey('crab', frame), 9, 5, (px) => {
      px(2, 1, 5, 3, BODY)
      px(3, 1, 1, 1, DARK)
      px(5, 1, 1, 1, DARK)
      if (frame === 0) {
        px(0, 0, 2, 2, SHADE)
        px(7, 0, 2, 2, SHADE)
      } else {
        px(0, 1, 2, 2, SHADE)
        px(7, 1, 2, 2, SHADE)
      }
      px(2, 4, 1, 1, SHADE)
      px(4, 4, 1, 1, SHADE)
      px(6, 4, 1, 1, SHADE)
    })
  }

  // 蛇/蜥：低長身（frame S 形擺動）
  for (const frame of [0, 1] as const) {
    make(animalTextureKey('serpent', frame), 10, 4, (px) => {
      if (frame === 0) {
        px(0, 1, 3, 2, BODY)
        px(3, 0, 3, 2, BODY)
        px(6, 1, 3, 2, BODY)
      } else {
        px(0, 1, 3, 2, BODY)
        px(3, 2, 3, 2, BODY)
        px(6, 1, 3, 2, BODY)
      }
      px(8, 1, 2, 2, BODY)
      px(9, 1, 1, 1, DARK)
    })
  }

  // 蝴蝶（環境生命用，不 tint）
  for (const frame of [0, 1] as const) {
    make(`pxa-butterfly-${frame}`, 4, 3, (px) => {
      px(1, 0, 1, 3, 0x3a3a3a)
      if (frame === 0) {
        px(0, 0, 1, 2, 0xf0a8c8)
        px(2, 0, 1, 2, 0xf0a8c8)
      } else {
        px(0, 1, 1, 1, 0xf0a8c8)
        px(2, 1, 1, 1, 0xf0a8c8)
      }
    })
  }

  // 遠景飛鳥（環境生命用）
  for (const frame of [0, 1] as const) {
    make(`pxa-flybird-${frame}`, 6, 3, (px) => {
      px(2, 1, 2, 1, 0x2c3038)
      if (frame === 0) {
        px(0, 0, 2, 1, 0x2c3038)
        px(4, 0, 2, 1, 0x2c3038)
      } else {
        px(0, 2, 2, 1, 0x2c3038)
        px(4, 2, 2, 1, 0x2c3038)
      }
    })
  }

  // 落葉
  make('pxa-leaf', 2, 2, (px) => {
    px(0, 0, 1, 1, 0xc9a85a)
    px(1, 1, 1, 1, 0xa8843c)
  })
}

export type AnimalActorConfig = Readonly<{
  speciesId: string
  animalId: string
  x: number
  y: number
  color: number
  nameZh: string
  behaviorLabel?: string
  intent?: 'foraging' | 'herding' | 'migrating' | 'hunting'
  bounds: Phaser.Geom.Rectangle
  /** 顯示層移動可行性（避免走進開放水域 / 建築）。 */
  canStandAt: (x: number, y: number) => boolean
  getPlayerXY: () => { x: number; y: number } | null
  onHunt: () => void
}>

const FLEE_RADIUS = 72
const STALK_STOP_RADIUS = 56
const WANDER_RADIUS = 56
const BEHAVIOR_POLL_MS = 600

/**
 * 顯示層動物行為 actor。destroy() 必須在 overlay 重繪 / 場景關閉時呼叫。
 */
export class AnimalActor {
  readonly container: Phaser.GameObjects.Container
  private readonly sprite: Phaser.GameObjects.Image
  private readonly scene: Phaser.Scene
  private readonly cfg: AnimalActorConfig
  private readonly arch: AnimalArchetype
  private frame: 0 | 1 = 0
  private moveTween: Phaser.Tweens.Tween | null = null
  private frameTimer: Phaser.Time.TimerEvent | null = null
  private behaviorTimer: Phaser.Time.TimerEvent | null = null
  private grazeTween: Phaser.Tweens.Tween | null = null
  private destroyed = false

  constructor(scene: Phaser.Scene, cfg: AnimalActorConfig) {
    this.scene = scene
    this.cfg = cfg
    this.arch = archetypeForSpecies(cfg.speciesId)

    const shadow = scene.add.ellipse(0, 7, 18, 5, 0x000000, 0.22)
    this.sprite = scene.add.image(0, 0, animalTextureKey(this.arch, 0))
    this.sprite.setTint(cfg.color)
    const label = scene.add.text(0, 9, cfg.nameZh, {
      fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif',
      fontSize: '9px',
      color: '#fff5b8',
      stroke: '#0a0a0a',
      strokeThickness: 2,
    }).setOrigin(0.5, 0)
    const behaviorLabel = cfg.behaviorLabel
      ? scene.add.text(0, 19, cfg.behaviorLabel, {
          fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif',
          fontSize: '8px',
          color: cfg.intent === 'hunting' ? '#ffb4a8' : cfg.intent === 'migrating' ? '#b6e3ff' : '#c8d4a6',
          stroke: '#0a0a0a',
          strokeThickness: 2,
        }).setOrigin(0.5, 0)
      : null

    this.container = scene.add.container(cfg.x, cfg.y, [shadow, this.sprite, label, ...(behaviorLabel ? [behaviorLabel] : [])])
    this.container.setDepth(44)
    this.container.setSize(36, 36)
    this.container.setInteractive(new Phaser.Geom.Circle(0, 0, 22), Phaser.Geom.Circle.Contains)
    this.container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation?.()
      cfg.onHunt()
    })

    // 行為輪詢：決定逃離 / 潛行 / 漫遊。
    const seed = hashString(cfg.animalId)
    this.behaviorTimer = scene.time.addEvent({
      delay: BEHAVIOR_POLL_MS + (seed % 400),
      loop: true,
      callback: () => this.decide(),
    })
    // 覓食/成群才低頭吃草；狩獵與遷徙不要顯示成「正在吃」。
    if (cfg.intent === 'foraging' || cfg.intent === 'herding' || !cfg.intent) {
      this.grazeTween = scene.tweens.add({
        targets: this.sprite,
        y: { from: 0, to: 1.5 },
        duration: 700 + (seed % 500),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  private decide(): void {
    if (this.destroyed) return
    const player = this.cfg.getPlayerXY()
    const cx = this.container.x
    const cy = this.container.y
    if (player) {
      const dist = Phaser.Math.Distance.Between(cx, cy, player.x, player.y)
      if (isPredatorSpecies(this.cfg.speciesId)) {
        if (dist > STALK_STOP_RADIUS && dist < 200) {
          // 潛行逼近：朝玩家移動一小步。
          const angle = Math.atan2(player.y - cy, player.x - cx)
          this.moveTo(cx + Math.cos(angle) * 26, cy + Math.sin(angle) * 26, 1400)
          return
        }
      } else if (dist < FLEE_RADIUS) {
        // 逃離：反方向快步。
        const angle = Math.atan2(cy - player.y, cx - player.x)
        this.moveTo(cx + Math.cos(angle) * 64, cy + Math.sin(angle) * 64, 650)
        return
      }
    }
    // 漫遊：低機率挑附近一點走過去。
    if (!this.moveTween && Math.random() < 0.35) {
      const angle = Math.random() * Math.PI * 2
      const dist = 16 + Math.random() * WANDER_RADIUS
      this.moveTo(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 1200 + Math.random() * 900)
    }
  }

  private moveTo(targetX: number, targetY: number, durationMs: number): void {
    const b = this.cfg.bounds
    const x = Phaser.Math.Clamp(targetX, b.left, b.right)
    const y = Phaser.Math.Clamp(targetY, b.top, b.bottom)
    if (!this.cfg.canStandAt(x, y)) return
    this.moveTween?.stop()
    this.sprite.setFlipX(x < this.container.x)
    this.startStepFrames()
    this.moveTween = this.scene.tweens.add({
      targets: this.container,
      x,
      y,
      duration: durationMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.moveTween = null
        this.stopStepFrames()
      },
    })
  }

  private startStepFrames(): void {
    if (this.frameTimer) return
    this.frameTimer = this.scene.time.addEvent({
      delay: 160,
      loop: true,
      callback: () => {
        this.frame = this.frame === 0 ? 1 : 0
        this.sprite.setTexture(animalTextureKey(this.arch, this.frame))
        this.sprite.setTint(this.cfg.color)
      },
    })
  }

  private stopStepFrames(): void {
    this.frameTimer?.remove()
    this.frameTimer = null
    this.frame = 0
    this.sprite.setTexture(animalTextureKey(this.arch, 0))
    this.sprite.setTint(this.cfg.color)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.moveTween?.stop()
    this.grazeTween?.stop()
    this.frameTimer?.remove()
    this.behaviorTimer?.remove()
    this.container.destroy(true)
  }
}

// ---------------------------------------------------------------------------
// 環境生命：飛鳥 / 蝴蝶 / 落葉
// ---------------------------------------------------------------------------

export type AmbientLifeHandle = { destroy: () => void }

/**
 * 啟動環境生命層。回傳 handle，場景 shutdown 時 destroy。
 * forestFeel=true（森林/丘陵類 tile）會加落葉。
 */
export function startAmbientLife(
  scene: Phaser.Scene,
  width: number,
  height: number,
  forestFeel: boolean
): AmbientLifeHandle {
  ensurePixelAnimalTextures(scene)
  const timers: Phaser.Time.TimerEvent[] = []
  const liveObjects = new Set<Phaser.GameObjects.GameObject>()

  // 飛鳥橫越：每 7~14 秒一隻，從畫面外左/右飛過上方三分之一。
  const spawnBird = (): void => {
    const fromLeft = Math.random() < 0.5
    const y = 20 + Math.random() * (height / 3)
    const bird = scene.add.image(fromLeft ? -10 : width + 10, y, 'pxa-flybird-0')
    bird.setDepth(120)
    liveObjects.add(bird)
    const flap = scene.time.addEvent({
      delay: 140,
      loop: true,
      callback: () => bird.setTexture(bird.texture.key === 'pxa-flybird-0' ? 'pxa-flybird-1' : 'pxa-flybird-0'),
    })
    timers.push(flap)
    bird.setFlipX(!fromLeft)
    scene.tweens.add({
      targets: bird,
      x: fromLeft ? width + 12 : -12,
      y: y + (Math.random() * 30 - 15),
      duration: 6000 + Math.random() * 3000,
      onComplete: () => {
        flap.remove()
        liveObjects.delete(bird)
        bird.destroy()
      },
    })
  }
  timers.push(
    scene.time.addEvent({ delay: 9000, loop: true, callback: spawnBird, startAt: Math.random() * 5000 })
  )

  // 蝴蝶：常駐 2 隻，隨機遊走。
  for (let i = 0; i < 2; i += 1) {
    const fly = scene.add.image(40 + Math.random() * (width - 80), 40 + Math.random() * (height - 80), 'pxa-butterfly-0')
    fly.setDepth(118)
    liveObjects.add(fly)
    const flap = scene.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => fly.setTexture(fly.texture.key === 'pxa-butterfly-0' ? 'pxa-butterfly-1' : 'pxa-butterfly-0'),
    })
    timers.push(flap)
    const drift = (): void => {
      if (!fly.active) return
      scene.tweens.add({
        targets: fly,
        x: Phaser.Math.Clamp(fly.x + (Math.random() * 120 - 60), 20, width - 20),
        y: Phaser.Math.Clamp(fly.y + (Math.random() * 80 - 40), 20, height - 20),
        duration: 1800 + Math.random() * 1500,
        ease: 'Sine.easeInOut',
        onComplete: drift,
      })
    }
    drift()
  }

  // 落葉（森林感 tile）：每 3~6 秒一片，從上緣飄落。
  if (forestFeel) {
    const spawnLeaf = (): void => {
      const leaf = scene.add.image(20 + Math.random() * (width - 40), -6, 'pxa-leaf')
      leaf.setDepth(117)
      liveObjects.add(leaf)
      scene.tweens.add({
        targets: leaf,
        y: height + 8,
        x: leaf.x + (Math.random() * 80 - 40),
        angle: 360 * (Math.random() < 0.5 ? 1 : -1),
        duration: 7000 + Math.random() * 4000,
        onComplete: () => {
          liveObjects.delete(leaf)
          leaf.destroy()
        },
      })
    }
    timers.push(
      scene.time.addEvent({ delay: 4500, loop: true, callback: spawnLeaf, startAt: 2000 })
    )
  }

  return {
    destroy: () => {
      for (const t of timers) t.remove()
      for (const obj of liveObjects) obj.destroy()
      liveObjects.clear()
    },
  }
}

function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash
}
