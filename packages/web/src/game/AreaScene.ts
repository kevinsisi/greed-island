import Phaser from 'phaser'
import { DISTRICTS, PLAYER_COLOR, PLAYER_OUTLINE, type DistrictId } from './districts'
import { AREA_DECORATIONS, AREA_ROAD_COLOR, AREA_ROAD_SHADE } from './decorations'
import { activityGlyphFor, textColorForBg } from './npcVisuals'
import type { NpcActivity } from '../state/types'

// 區域內地圖：比城市地圖小，給玩家在單一街區裡走動。
export const AREA_TILE_SIZE = 40
export const AREA_GRID_COLS = 15
export const AREA_GRID_ROWS = 10
export const AREA_CANVAS_WIDTH = AREA_TILE_SIZE * AREA_GRID_COLS // 600
export const AREA_CANVAS_HEIGHT = AREA_TILE_SIZE * AREA_GRID_ROWS // 400

const PLAYER_SPRITE_SIZE = 22
const NPC_SPRITE_SIZE = 26
const PLAYER_SPEED = 160 // px/s
const INTERACT_RADIUS = AREA_TILE_SIZE * 1.6
const POSITION_SAVE_INTERVAL_MS = 500
// 後端 tick 為 5 秒；NPC 從上次位置 tween 到新位置花 ≈4.5 秒，剛好接到下個 tick
const NPC_MOVE_TWEEN_MS = 4500

/** AreaScene 對外保留的型別 alias；和 NpcActivity 完全等價，給 React 層使用。 */
export type AreaNpcActivity = NpcActivity

/**
 * 後端 weather string enum（runtime.ts WEATHERS）；前端純粹用來決定 VFX 風格。
 * 任何外傳的字串都先 normalise 成下面這一份；不認得的值就視同 'clear'。
 */
export type AreaWeather = 'clear' | 'overcast' | 'mist' | 'storm' | 'breeze'

const WEATHER_BY_ZH: Readonly<Record<string, AreaWeather>> = {
  晴: 'clear',
  陰: 'overcast',
  霧雨: 'mist',
  驟雨: 'storm',
  微風: 'breeze'
}

export function normaliseWeather(raw: string | null | undefined): AreaWeather {
  if (!raw) return 'clear'
  return WEATHER_BY_ZH[raw] ?? 'clear'
}

export interface AreaMapNpc {
  id: string
  /** 顯示在 sprite 上方的完整名字 */
  name: string
  /** sprite 內部的單字 badge / aria 用途 */
  shortName: string
  /** 當前活動，用 i18n 字串顯示在名字下方；缺值就不顯示活動行 */
  activityLabel?: string
  /** 後端權威子格座標（0..14, 0..9）。由 server 決定 NPC 在 area canvas 的位置 */
  subCol: number
  subRow: number
  /** sprite 主色（24-bit RGB，例 0xff8a4a）。後端依 faction + id 決定 */
  color: number
  /** 活動 enum，用來顯示活動圖示 emoji */
  activity: AreaNpcActivity
  /** v0.14.0：mood < 30 時 name label 用灰色顯示低落感 */
  mood?: number
  /** v0.14.0：health < 30 時 sprite 旁加 🤕 圖示 */
  health?: number
}

/** 區域地圖上閃爍的紋卡 drop。x/y 是 canvas 像素座標 (0..AREA_CANVAS_*)。 */
export interface AreaMapDrop {
  id: number
  cardId: number
  rank: string
  x: number
  y: number
  /** 此 drop 在 server 上的剩餘 tick 數，用來決定 sprite 顏色閃爍 */
  ticksRemaining: number
}

export interface AreaSceneCallbacks {
  onNpcInteract: (npcId: string) => void
  onDropPickup: (dropId: number) => void
  onPositionChange: (pos: { x: number; y: number }) => void
  /** 玩家附近 (距離 ≤ INTERACT_RADIUS) 的 NPC ids；set 變動時才 fire。 */
  onNearbyNpcsChange?: (ids: string[]) => void
  /** 玩家點了一個太遠的 NPC sprite。React 層可以彈個 toast。 */
  onInteractTooFar?: (npcId: string) => void
  /** 玩家走進建築物提示範圍 → 點該建築可進入。React 層應 navigate。 */
  onBuildingEnter?: (buildingId: string) => void
}

export interface AreaMapBuilding {
  id: string
  nameZh: string
  type: string
  col: number
  row: number
  glyph: string
  size: number
  enterable: boolean
}

export interface AreaSceneInit {
  callbacks: AreaSceneCallbacks
  tileId: DistrictId
  npcs: AreaMapNpc[]
  drops: AreaMapDrop[]
  locale: 'zh' | 'en'
  hudStrings: {
    interact: string
    pickup: string
    tooFar: string
    enterBuilding?: string
  }
  /** 該 tile 上的建築物（從 server catalog 來）。可選。 */
  buildings?: AreaMapBuilding[]
  /** 從 localStorage 讀回的位置；若無則 null。座標必須在 canvas 範圍內。 */
  startPosition: { x: number; y: number } | null
  /** v0.15.1：當前世界天氣（後端 fact）；用於 Phaser VFX 切換 */
  weather?: AreaWeather
}

const DROP_SPRITE_SIZE = 22
const DROP_PICKUP_RADIUS = AREA_TILE_SIZE * 1.4

const RANK_COLOR: Record<string, number> = {
  SS: 0xffd966,
  S: 0xffb84d,
  A: 0xff9966,
  B: 0xffe066,
  C: 0xb6e3ff,
  D: 0x9ee0c7,
  E: 0xa3c9ff,
  F: 0xc9b8ff,
  G: 0xb0b0b0,
  H: 0x8a8a8a
}

/**
 * 區域內地圖：
 * - 15x10 格子 (40px tile)，背景用對應街區的色系做棋盤格
 * - 玩家方向鍵 / WASD / pointer 拖曳移動
 * - 該街區的 NPC 以 sprite 排成一圈，靠近顯示提示，按 E / Space / 點 sprite 觸發互動
 * - 玩家位置每 500ms 同步給外面 (React) 寫入 localStorage，刷新或回來都會回到同一位置
 */
export class AreaScene extends Phaser.Scene {
  static readonly KEY = 'AreaScene'

  private callbacks!: AreaSceneCallbacks
  private tileId!: DistrictId
  private npcs: AreaMapNpc[] = []
  private drops: AreaMapDrop[] = []
  private buildings: AreaMapBuilding[] = []
  private hudStrings: AreaSceneInit['hudStrings'] = {
    interact: '',
    pickup: '',
    tooFar: '',
    enterBuilding: '進入'
  }
  private startPosition: { x: number; y: number } | null = null
  private nearbyNpcIdsCache = ''
  private tooFarHintTimer: Phaser.Time.TimerEvent | null = null
  private weather: AreaWeather = 'clear'
  /** v0.15.1：天氣 VFX layer，applyWeather 切換時整批 destroy 重畫。 */
  private weatherLayer: Phaser.GameObjects.Container | null = null
  /** v0.15.1：環境動畫的 tween 池（裝飾物擺動 / 燈火閃爍 / 水波漣漪）。 */
  private envTweens: Phaser.Tweens.Tween[] = []
  private envSprites: Phaser.GameObjects.Text[] = []

  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null
  private nearbyNpcId: string | null = null
  private nearbyDropId: number | null = null
  private nearbyBuildingId: string | null = null
  private buildingSprites: Map<string, Phaser.GameObjects.Container> = new Map()
  /** 玩家剛點到 NPC sprite 的時候設成 true，下一個 scene-level pointerdown
   *  就忽略掉 (避免點完 NPC 之後，玩家還繼續走向那個位置)。 */
  private suppressNextPointerTarget = false

  private interactPrompt!: Phaser.GameObjects.Container
  private npcSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map()
  private dropSprites: Map<number, Phaser.GameObjects.Container> = new Map()

  private positionSaveTimer = 0
  private lastSavedPosition: { x: number; y: number } = { x: 0, y: 0 }

  constructor() {
    super({ key: AreaScene.KEY })
  }

  init(data: AreaSceneInit): void {
    this.callbacks = data.callbacks
    this.tileId = data.tileId
    this.npcs = data.npcs
    this.drops = data.drops
    this.buildings = data.buildings ?? []
    this.hudStrings = data.hudStrings
    this.startPosition = data.startPosition
    this.weather = data.weather ?? 'clear'
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12141a)
    this.drawBackground()
    this.spawnPlayer()
    this.spawnBuildings()
    this.spawnNpcs()
    this.spawnDrops()
    this.setupInput()
    this.setupHud()
    this.applyWeather(this.weather)

    this.physics.world.setBounds(0, 0, AREA_CANVAS_WIDTH, AREA_CANVAS_HEIGHT)
    this.player.setCollideWorldBounds(true)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.flushPositionSave()
      this.disposeWeather()
      this.disposeEnvAnimations()
    })
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.flushPositionSave()
      this.disposeWeather()
      this.disposeEnvAnimations()
    })
  }

  applyExternalUpdate(payload: {
    npcs?: AreaMapNpc[]
    drops?: AreaMapDrop[]
    locale?: 'zh' | 'en'
    hudStrings?: AreaSceneInit['hudStrings']
    weather?: AreaWeather
  }): void {
    if (payload.hudStrings) this.hudStrings = payload.hudStrings
    if (payload.npcs) {
      this.npcs = payload.npcs
      this.refreshNpcSprites()
    }
    if (payload.drops) {
      this.drops = payload.drops
      this.refreshDropSprites()
    }
    if (payload.weather && payload.weather !== this.weather) {
      this.weather = payload.weather
      this.applyWeather(payload.weather)
    }
  }

  update(_time: number, delta: number): void {
    this.handleMovement(delta)
    this.checkNpcProximity()
    this.checkDropProximity()
    this.checkBuildingProximity()
    this.tickPositionSave(delta)
  }

  // ---------- 背景 ----------

  private drawBackground(): void {
    const def = DISTRICTS[this.tileId] ?? DISTRICTS.t_road
    const decoSet = AREA_DECORATIONS[this.tileId] ?? AREA_DECORATIONS.t_road
    // 把道路 cell 做成 set 方便 O(1) 查
    const roadKeys = new Set<string>()
    for (const cell of decoSet.roadCells) roadKeys.add(`${cell.col},${cell.row}`)

    const g = this.add.graphics()
    for (let row = 0; row < AREA_GRID_ROWS; row += 1) {
      for (let col = 0; col < AREA_GRID_COLS; col += 1) {
        const checker = (col + row) % 2 === 0
        const isRoad = roadKeys.has(`${col},${row}`)
        const fill = isRoad
          ? checker
            ? AREA_ROAD_COLOR
            : AREA_ROAD_SHADE
          : checker
            ? def.color
            : def.shade
        g.fillStyle(fill, 1)
        g.fillRect(col * AREA_TILE_SIZE, row * AREA_TILE_SIZE, AREA_TILE_SIZE, AREA_TILE_SIZE)
        g.lineStyle(1, def.border, 0.35)
        g.strokeRect(
          col * AREA_TILE_SIZE + 0.5,
          row * AREA_TILE_SIZE + 0.5,
          AREA_TILE_SIZE - 1,
          AREA_TILE_SIZE - 1
        )
        // 道路再加上中央車道虛線，跟普通 tile 區隔開
        if (isRoad) {
          g.fillStyle(0xfff5b8, 0.45)
          g.fillRect(
            col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2 - 1,
            row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2 - 4,
            2,
            8
          )
        }
      }
    }
    // 街區外框 — 黃白色高亮，明顯區隔
    g.lineStyle(3, 0xfff5b8, 0.85)
    g.strokeRect(1.5, 1.5, AREA_CANVAS_WIDTH - 3, AREA_CANVAS_HEIGHT - 3)

    // 環境物件 (建築 / 樹 / 地標)：用 emoji text 當 placeholder。
    // 注意：建築物 cell（即將被 spawnBuildings 接管）會被略過，避免重疊。
    const buildingCells = new Set(this.buildings.map((b) => `${b.col},${b.row}`))
    for (const deco of decoSet.props) {
      if (buildingCells.has(`${deco.col},${deco.row}`)) continue
      const cx = deco.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
      const cy = deco.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
      const text = this.add.text(cx, cy, deco.glyph, {
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
        fontSize: `${deco.size}px`,
        color: '#ffffff',
        stroke: '#0a0a0a',
        strokeThickness: 2
      })
      text.setOrigin(0.5, 0.5)
      text.setDepth(40)
      this.attachEnvAnimation(text, deco.glyph, cx, cy, deco.col, deco.row)
    }
  }

  /**
   * v0.15.1：依 emoji 類型給裝飾物套不同的 idle tween，讓區域不再像靜態棋盤。
   * - 樹 / 草：左右搖擺（風）
   * - 燈籠 / 神社：alpha 閃爍（火光）
   * - 水 / 船 / 海洋物件：上下漂浮（浪）
   * - 結晶 / 星：scale + alpha 同步脈動（能量）
   * - 廢墟 / 岩石：偶爾微抖（地動）
   * 全部 tween 都是 deterministic seed by (col,row)，避免相鄰物件動作完全同步。
   */
  private attachEnvAnimation(
    sprite: Phaser.GameObjects.Text,
    glyph: string,
    cx: number,
    cy: number,
    col: number,
    row: number
  ): void {
    this.envSprites.push(sprite)
    // hash (col,row) 算 deterministic phase delay，0..2000ms
    const seed = (col * 31 + row * 17) & 0xff
    const delay = (seed * 8) % 2000

    // 樹 & 植物 → 左右搖擺
    if (/[🌲🌳🌵🪵🌾🌿]/u.test(glyph)) {
      const tween = this.tweens.add({
        targets: sprite,
        angle: { from: -4, to: 4 },
        duration: 1800 + (seed % 600),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay
      })
      this.envTweens.push(tween)
      return
    }
    // 燈籠 / 神社 / 招牌 / 火光 → alpha 閃爍
    if (/[🪔⛩🏯🪧]/u.test(glyph)) {
      const tween = this.tweens.add({
        targets: sprite,
        alpha: { from: 0.7, to: 1 },
        duration: 700 + (seed % 500),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay
      })
      this.envTweens.push(tween)
      return
    }
    // 海 / 船 / 港 → 上下漂浮（水波感）
    if (/[⚓⛵🛟🪝🐟🐚]/u.test(glyph)) {
      const tween = this.tweens.add({
        targets: sprite,
        y: { from: cy - 2, to: cy + 2 },
        duration: 1500 + (seed % 700),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay
      })
      this.envTweens.push(tween)
      return
    }
    // 結晶 / 星 / 能量 → scale + alpha 脈動
    if (/[✦✧◈]/u.test(glyph)) {
      const tween = this.tweens.add({
        targets: sprite,
        scale: { from: 0.85, to: 1.15 },
        alpha: { from: 0.6, to: 1 },
        duration: 1100 + (seed % 600),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay
      })
      this.envTweens.push(tween)
      return
    }
    // 廢墟 / 岩石 → 久久才微抖一次（隨機）
    if (/[🪨🏚⛰🏔]/u.test(glyph)) {
      const tween = this.tweens.add({
        targets: sprite,
        x: { from: cx - 0.8, to: cx + 0.8 },
        duration: 4000 + (seed % 1500),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: delay + 1000
      })
      this.envTweens.push(tween)
      return
    }
    // 普通建築 / 商店 / 一般房子 → 不動（保留靜態 silhouette）
  }

  private disposeEnvAnimations(): void {
    for (const tween of this.envTweens) {
      try {
        tween.stop()
      } catch {
        // 場景銷毀時 tweens manager 可能已 nuked
      }
    }
    this.envTweens = []
    this.envSprites = []
  }

  /**
   * v0.15.1：依後端 weather string 套上 Phaser VFX 圖層。
   * - clear → 微暖陽光暈（覆蓋層 + glow）
   * - overcast → 灰色輕罩
   * - mist → 薄白雲狀霧 + 細雨點
   * - storm → 較深藍灰罩 + 密集雨線
   * - breeze → 飄落的葉片
   * 所有 VFX 都加在 weatherLayer container（depth=200），切換時整批 destroy 重畫。
   */
  applyWeather(weather: AreaWeather): void {
    this.weather = weather
    this.disposeWeather()
    const layer = this.add.container(0, 0)
    layer.setDepth(200)
    layer.setName('weatherLayer')
    this.weatherLayer = layer

    if (weather === 'clear') {
      // 暖色覆蓋層 + 緩緩呼吸的太陽暈
      const overlay = this.add.rectangle(
        AREA_CANVAS_WIDTH / 2,
        AREA_CANVAS_HEIGHT / 2,
        AREA_CANVAS_WIDTH,
        AREA_CANVAS_HEIGHT,
        0xfff5b8,
        0.06
      )
      const sun = this.add.circle(AREA_CANVAS_WIDTH * 0.78, 40, 56, 0xfff2a8, 0.18)
      sun.setStrokeStyle(2, 0xfff5b8, 0.25)
      this.tweens.add({
        targets: sun,
        scale: { from: 0.95, to: 1.1 },
        alpha: { from: 0.18, to: 0.32 },
        duration: 3500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
      })
      layer.add([overlay, sun])
      return
    }

    if (weather === 'overcast') {
      const overlay = this.add.rectangle(
        AREA_CANVAS_WIDTH / 2,
        AREA_CANVAS_HEIGHT / 2,
        AREA_CANVAS_WIDTH,
        AREA_CANVAS_HEIGHT,
        0x4a525e,
        0.18
      )
      // 緩慢飄移的雲層 — 三條淺灰矩形，左右回拉
      for (let i = 0; i < 3; i += 1) {
        const cloud = this.add.rectangle(
          AREA_CANVAS_WIDTH * (0.2 + i * 0.3),
          40 + i * 30,
          AREA_CANVAS_WIDTH * 0.55,
          24,
          0x9aa3ad,
          0.12
        )
        this.tweens.add({
          targets: cloud,
          x: { from: cloud.x - 24, to: cloud.x + 24 },
          duration: 6000 + i * 1500,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1
        })
        layer.add(cloud)
      }
      layer.add(overlay)
      return
    }

    if (weather === 'mist') {
      const overlay = this.add.rectangle(
        AREA_CANVAS_WIDTH / 2,
        AREA_CANVAS_HEIGHT / 2,
        AREA_CANVAS_WIDTH,
        AREA_CANVAS_HEIGHT,
        0xc8d2dc,
        0.18
      )
      layer.add(overlay)
      // 霧斑 5 個
      for (let i = 0; i < 5; i += 1) {
        const fog = this.add.circle(
          AREA_CANVAS_WIDTH * (0.15 + i * 0.18),
          AREA_CANVAS_HEIGHT * (0.2 + (i % 2) * 0.5),
          60 + (i % 3) * 18,
          0xffffff,
          0.08
        )
        this.tweens.add({
          targets: fog,
          x: { from: fog.x - 18, to: fog.x + 18 },
          alpha: { from: 0.05, to: 0.14 },
          duration: 4500 + i * 700,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1
        })
        layer.add(fog)
      }
      // 細雨：30 條短斜線，循環下落
      for (let i = 0; i < 30; i += 1) {
        const x = (i * 47) % AREA_CANVAS_WIDTH
        const y = (i * 31) % AREA_CANVAS_HEIGHT
        const drop = this.add.rectangle(x, y, 1, 5, 0xb6e3ff, 0.55)
        drop.setOrigin(0.5, 0.5)
        this.tweens.add({
          targets: drop,
          y: { from: y - AREA_CANVAS_HEIGHT, to: y + AREA_CANVAS_HEIGHT },
          x: { from: x, to: x + 18 },
          duration: 1200 + (i % 5) * 250,
          ease: 'Linear',
          repeat: -1,
          delay: (i * 60) % 1500
        })
        layer.add(drop)
      }
      return
    }

    if (weather === 'storm') {
      const overlay = this.add.rectangle(
        AREA_CANVAS_WIDTH / 2,
        AREA_CANVAS_HEIGHT / 2,
        AREA_CANVAS_WIDTH,
        AREA_CANVAS_HEIGHT,
        0x18243a,
        0.32
      )
      layer.add(overlay)
      // 大雨：60 條較長雨線
      for (let i = 0; i < 60; i += 1) {
        const x = (i * 23) % AREA_CANVAS_WIDTH
        const y = (i * 17) % AREA_CANVAS_HEIGHT
        const drop = this.add.rectangle(x, y, 1.5, 9, 0xa3c9ff, 0.7)
        drop.setOrigin(0.5, 0.5)
        this.tweens.add({
          targets: drop,
          y: { from: y - AREA_CANVAS_HEIGHT, to: y + AREA_CANVAS_HEIGHT },
          x: { from: x, to: x + 32 },
          duration: 700 + (i % 5) * 130,
          ease: 'Linear',
          repeat: -1,
          delay: (i * 28) % 900
        })
        layer.add(drop)
      }
      // 偶發閃電：每 6-12 秒一次
      const flash = this.add.rectangle(
        AREA_CANVAS_WIDTH / 2,
        AREA_CANVAS_HEIGHT / 2,
        AREA_CANVAS_WIDTH,
        AREA_CANVAS_HEIGHT,
        0xffffff,
        0
      )
      layer.add(flash)
      const triggerFlash = (): void => {
        if (!this.weatherLayer) return
        this.tweens.add({
          targets: flash,
          alpha: { from: 0, to: 0.55 },
          duration: 80,
          yoyo: true,
          onComplete: () => {
            if (!this.weatherLayer) return
            this.time.delayedCall(6000 + Math.floor(Math.random() * 7000), triggerFlash)
          }
        })
      }
      this.time.delayedCall(3500 + Math.floor(Math.random() * 4000), triggerFlash)
      return
    }

    if (weather === 'breeze') {
      const overlay = this.add.rectangle(
        AREA_CANVAS_WIDTH / 2,
        AREA_CANVAS_HEIGHT / 2,
        AREA_CANVAS_WIDTH,
        AREA_CANVAS_HEIGHT,
        0xd4e8ff,
        0.06
      )
      layer.add(overlay)
      // 飄葉 / 花瓣：14 顆，從左飄到右
      for (let i = 0; i < 14; i += 1) {
        const startY = (i * 31) % AREA_CANVAS_HEIGHT
        const leaf = this.add.text(
          -10,
          startY,
          i % 2 === 0 ? '🍃' : '🌸',
          {
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
            fontSize: '14px',
            color: '#ffffff'
          }
        )
        leaf.setOrigin(0.5, 0.5)
        leaf.setAlpha(0.85)
        this.tweens.add({
          targets: leaf,
          x: { from: -20, to: AREA_CANVAS_WIDTH + 20 },
          y: { from: startY, to: startY + 30 + (i % 3) * 12 },
          angle: { from: 0, to: 360 },
          duration: 5000 + (i % 5) * 600,
          ease: 'Linear',
          repeat: -1,
          delay: i * 320
        })
        layer.add(leaf)
      }
      return
    }
  }

  private disposeWeather(): void {
    if (!this.weatherLayer) return
    // 關閉所有 tween 後 destroy。每個子物件可能還有 tween 連到它
    const layer = this.weatherLayer
    for (const child of layer.getAll()) {
      this.tweens.killTweensOf(child)
    }
    layer.destroy(true)
    this.weatherLayer = null
  }

  /** 把伺服器送來的 buildings 畫成 interactive sprite。 */
  private spawnBuildings(): void {
    for (const b of this.buildings) {
      const cx = b.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
      const cy = b.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2

      // hit area：覆蓋約 2 個 tile 的範圍，方便手機點擊
      const hitW = AREA_TILE_SIZE * 1.5
      const hitH = AREA_TILE_SIZE * 1.5
      const hitRect = this.add.rectangle(cx, cy, hitW, hitH, 0x000000, 0)
      hitRect.setOrigin(0.5, 0.5)

      const glyph = this.add.text(cx, cy, b.glyph, {
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
        fontSize: `${b.size + 4}px`,
        color: '#ffffff',
        stroke: '#0a0a0a',
        strokeThickness: 3
      })
      glyph.setOrigin(0.5, 0.5)

      const nameLabel = this.add.text(cx, cy + b.size * 0.7, b.nameZh, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '10px',
        color: '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 2
      })
      nameLabel.setOrigin(0.5, 0)

      // 互動提示氣泡（玩家走進範圍時 浮出）
      const bubble = this.add.text(cx, cy - b.size * 0.95, b.enterable ? '✋' : '🔍', {
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#0a0a0a',
        strokeThickness: 2
      })
      bubble.setOrigin(0.5, 1)
      bubble.setVisible(false)

      const container = this.add.container(0, 0, [hitRect, glyph, nameLabel, bubble])
      container.setDepth(45)
      container.setData('buildingId', b.id)
      container.setData('bubble', bubble)
      container.setData('cx', cx)
      container.setData('cy', cy)

      // hitRect 接收 input
      hitRect.setInteractive({ useHandCursor: true })
      hitRect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        // 距離檢查：必須走近才能進入
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy)
        if (d > AREA_TILE_SIZE * 2) {
          // 太遠 — 玩家點了遠處的建築 → 自動走過去
          this.pointerTarget = { x: cx, y: cy + AREA_TILE_SIZE }
          this.suppressNextPointerTarget = false
          this.flashApproachHint(b.nameZh)
          return
        }
        if (b.enterable && this.callbacks.onBuildingEnter) {
          this.callbacks.onBuildingEnter(b.id)
        }
      })

      this.buildingSprites.set(b.id, container)
    }
  }

  private flashApproachHint(name: string): void {
    const promptText = this.interactPrompt.getData('text') as Phaser.GameObjects.Text
    const promptBg = this.interactPrompt.getData('bg') as Phaser.GameObjects.Rectangle
    const msg = `走近 ${name}…`
    promptText.setText(msg)
    promptText.setColor('#fff5b8')
    const w = Math.max(140, promptText.width + 24)
    promptBg.setSize(w, 26)
    promptBg.setStrokeStyle(1, 0xfff5b8, 0.9)
    this.interactPrompt.setPosition(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.4)
    this.interactPrompt.setVisible(true)
    this.interactPrompt.setData('lockedUntil', this.time.now + 1000)
    if (this.tooFarHintTimer) this.tooFarHintTimer.remove(false)
    this.tooFarHintTimer = this.time.delayedCall(1000, () => {
      this.interactPrompt.setData('lockedUntil', 0)
      this.tooFarHintTimer = null
    })
  }

  // ---------- 玩家 / NPC sprite ----------

  private spawnPlayer(): void {
    const tex = this.makeSquareTexture('area-player', PLAYER_SPRITE_SIZE, PLAYER_COLOR, PLAYER_OUTLINE, 2)
    const start = this.clampToCanvas(
      this.startPosition ?? { x: AREA_CANVAS_WIDTH / 2, y: AREA_CANVAS_HEIGHT / 2 }
    )
    this.player = this.physics.add.sprite(start.x, start.y, tex)
    this.player.setDepth(80)
    this.player.setCollideWorldBounds(true)
    this.lastSavedPosition = { x: start.x, y: start.y }
  }

  private clampToCanvas(p: { x: number; y: number }): { x: number; y: number } {
    const margin = PLAYER_SPRITE_SIZE / 2 + 2
    return {
      x: Math.max(margin, Math.min(AREA_CANVAS_WIDTH - margin, p.x)),
      y: Math.max(margin, Math.min(AREA_CANVAS_HEIGHT - margin, p.y))
    }
  }

  private spawnNpcs(): void {
    this.refreshNpcSprites()
  }

  /**
   * 把當前 npcs 列表 sync 到場景。位置完全由後端 (subCol, subRow) 驅動：
   *   - 已存在的 NPC：tween sprite + label 從目前位置 → 後端新位置（≈4500ms 平滑）
   *   - 新增 NPC：直接放在後端指定子格，建 sprite + 名字 + 活動 emoji
   *   - 移除 NPC：destroy sprite + 連帶 label / tween
   * 不再有前端假 wander。
   */
  private refreshNpcSprites(): void {
    const seen = new Set<string>()

    if (this.npcs.length === 0) {
      for (const [id, sprite] of this.npcSprites) {
        this.disposeNpcSprite(id, sprite)
      }
      return
    }

    for (const npc of this.npcs) {
      seen.add(npc.id)
      const target = this.subTileToCanvas(npc.subCol, npc.subRow)

      const existing = this.npcSprites.get(npc.id)
      if (existing) {
        const nameLabel = existing.getData('nameLabel') as Phaser.GameObjects.Text | undefined
        const activityIcon = existing.getData('activityIcon') as
          | Phaser.GameObjects.Text
          | undefined
        const healthIcon = existing.getData('healthIcon') as
          | Phaser.GameObjects.Text
          | undefined
        if (nameLabel && nameLabel.text !== npc.name) nameLabel.setText(npc.name)
        // mood < 30 → name label 變灰；其餘維持 cream
        if (nameLabel) {
          const moodLow = typeof npc.mood === 'number' && npc.mood < 30
          const targetColor = moodLow ? '#8a8a8a' : '#fff5b8'
          if (nameLabel.style.color !== targetColor) nameLabel.setColor(targetColor)
        }
        if (activityIcon) {
          const glyph = activityGlyphFor(npc.activity)
          if (activityIcon.text !== glyph) activityIcon.setText(glyph)
          activityIcon.setVisible(glyph.length > 0)
        }
        if (healthIcon) {
          const injured = typeof npc.health === 'number' && npc.health < 30
          healthIcon.setVisible(injured)
        }
        // sprite 顏色（faction 變更也跟著換）
        const currentColor = existing.getData('npcColor') as number | undefined
        if (currentColor !== npc.color) {
          this.applyNpcColor(existing, npc.id, npc.color)
        }
        // 平滑移動到後端的新位置
        this.tweenNpcTo(existing, target.x, target.y)
        continue
      }

      // 新增 sprite — 直接落在後端指定位置
      const tex = this.makeNpcTexture(npc.id, npc.color)
      const sprite = this.physics.add.sprite(target.x, target.y, tex)
      sprite.setDepth(70)
      sprite.setData('npcId', npc.id)
      sprite.setData('npcColor', npc.color)
      sprite.setInteractive({ useHandCursor: true })
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          sprite.x,
          sprite.y
        )
        if (d > INTERACT_RADIUS) {
          this.flashTooFarHint()
          this.callbacks.onInteractTooFar?.(npc.id)
          return
        }
        this.callbacks.onNpcInteract(npc.id)
      })

      // sprite 中央的單字 badge — 字色用 sprite 互補色，避免被同色吃掉
      const badgeColor = textColorForBg(npc.color)
      const badge = this.add.text(target.x, target.y, npc.shortName, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '14px',
        color: badgeColor,
        fontStyle: 'bold'
      })
      badge.setOrigin(0.5, 0.5)
      badge.setDepth(71)
      sprite.setData('badge', badge)

      // 完整名字（mood < 30 → 灰；其餘 cream）
      const moodLow = typeof npc.mood === 'number' && npc.mood < 30
      const nameLabel = this.add.text(target.x, target.y - NPC_SPRITE_SIZE * 0.85, npc.name, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: moodLow ? '#8a8a8a' : '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 3
      })
      nameLabel.setOrigin(0.5, 1)
      nameLabel.setDepth(72)
      sprite.setData('nameLabel', nameLabel)

      // health < 30 → sprite 左上角加 🤕，視覺上標示「受傷」
      const injured = typeof npc.health === 'number' && npc.health < 30
      const healthIcon = this.add.text(
        target.x - NPC_SPRITE_SIZE * 0.55,
        target.y - NPC_SPRITE_SIZE * 0.55,
        '🤕',
        {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      healthIcon.setOrigin(0.5, 0.5)
      healthIcon.setDepth(73)
      healthIcon.setVisible(injured)
      sprite.setData('healthIcon', healthIcon)

      // sprite 右上角的活動 emoji
      const glyph = activityGlyphFor(npc.activity)
      const activityIcon = this.add.text(
        target.x + NPC_SPRITE_SIZE * 0.55,
        target.y - NPC_SPRITE_SIZE * 0.55,
        glyph,
        {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      activityIcon.setOrigin(0.5, 0.5)
      activityIcon.setDepth(73)
      activityIcon.setVisible(glyph.length > 0)
      sprite.setData('activityIcon', activityIcon)

      // 走進範圍後浮出的 💬
      const chatBubble = this.add.text(
        target.x,
        target.y - NPC_SPRITE_SIZE * 1.6,
        '💬',
        {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      chatBubble.setOrigin(0.5, 1)
      chatBubble.setDepth(74)
      chatBubble.setVisible(false)
      sprite.setData('chatBubble', chatBubble)
      chatBubble.setInteractive({ useHandCursor: true })
      chatBubble.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          sprite.x,
          sprite.y
        )
        if (d > INTERACT_RADIUS) {
          this.flashTooFarHint()
          this.callbacks.onInteractTooFar?.(npc.id)
          return
        }
        this.callbacks.onNpcInteract(npc.id)
      })

      this.npcSprites.set(npc.id, sprite)
    }

    for (const [id, sprite] of this.npcSprites) {
      if (!seen.has(id)) this.disposeNpcSprite(id, sprite)
    }
  }

  /** 把當前 sprite + 旁邊所有 label 從現在位置 tween 到目標 (x,y)。 */
  private tweenNpcTo(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number): void {
    const prev = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (prev) prev.stop()
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const healthIcon = sprite.getData('healthIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    const startX = sprite.x
    const distance = Phaser.Math.Distance.Between(startX, sprite.y, x, y)
    if (distance < 0.5) {
      sprite.setPosition(x, y)
      if (badge) badge.setPosition(x, y)
      if (nameLabel) nameLabel.setPosition(x, y - NPC_SPRITE_SIZE * 0.85)
      if (activityIcon)
        activityIcon.setPosition(x + NPC_SPRITE_SIZE * 0.55, y - NPC_SPRITE_SIZE * 0.55)
      if (healthIcon)
        healthIcon.setPosition(x - NPC_SPRITE_SIZE * 0.55, y - NPC_SPRITE_SIZE * 0.55)
      if (chatBubble) chatBubble.setPosition(x, y - NPC_SPRITE_SIZE * 1.6)
      return
    }
    if (x > startX + 0.5) sprite.setFlipX(false)
    else if (x < startX - 0.5) sprite.setFlipX(true)
    const tween = this.tweens.add({
      targets: { px: startX, py: sprite.y },
      px: x,
      py: y,
      duration: NPC_MOVE_TWEEN_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (_t, t: { px: number; py: number }) => {
        sprite.setPosition(t.px, t.py)
        if (badge) badge.setPosition(t.px, t.py)
        if (nameLabel) nameLabel.setPosition(t.px, t.py - NPC_SPRITE_SIZE * 0.85)
        if (activityIcon)
          activityIcon.setPosition(t.px + NPC_SPRITE_SIZE * 0.55, t.py - NPC_SPRITE_SIZE * 0.55)
        if (healthIcon)
          healthIcon.setPosition(t.px - NPC_SPRITE_SIZE * 0.55, t.py - NPC_SPRITE_SIZE * 0.55)
        if (chatBubble) chatBubble.setPosition(t.px, t.py - NPC_SPRITE_SIZE * 1.6)
      }
    })
    sprite.setData('moveTween', tween)
  }

  /** 子格 (col,row) → canvas 中心 (px,py)。 */
  private subTileToCanvas(col: number, row: number): { x: number; y: number } {
    const c = Math.max(0, Math.min(AREA_GRID_COLS - 1, col))
    const r = Math.max(0, Math.min(AREA_GRID_ROWS - 1, row))
    return {
      x: c * AREA_TILE_SIZE + AREA_TILE_SIZE / 2,
      y: r * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
    }
  }

  /** 為 NPC 產 sprite texture：每個 npcId 各自一張 cached texture（顏色不同）。 */
  private makeNpcTexture(npcId: string, color: number): string {
    const key = `area-npc-tex-${npcId}-${color.toString(16)}`
    if (!this.textures.exists(key)) {
      this.makeSquareTexture(key, NPC_SPRITE_SIZE, color, 0x1c1300, 2)
    }
    return key
  }

  private applyNpcColor(
    sprite: Phaser.Physics.Arcade.Sprite,
    npcId: string,
    color: number
  ): void {
    const key = this.makeNpcTexture(npcId, color)
    sprite.setTexture(key)
    sprite.setData('npcColor', color)
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    if (badge) badge.setColor(textColorForBg(color))
  }

  private disposeNpcSprite(id: string, sprite: Phaser.Physics.Arcade.Sprite): void {
    const moveTween = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (moveTween) this.tweens.remove(moveTween)
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const healthIcon = sprite.getData('healthIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    if (badge) badge.destroy()
    if (nameLabel) nameLabel.destroy()
    if (activityIcon) activityIcon.destroy()
    if (healthIcon) healthIcon.destroy()
    if (chatBubble) chatBubble.destroy()
    sprite.destroy()
    this.npcSprites.delete(id)
  }

  // ---------- 紋卡 drop sprite ----------

  private spawnDrops(): void {
    this.refreshDropSprites()
  }

  private refreshDropSprites(): void {
    const seenIds = new Set<number>()
    for (const drop of this.drops) {
      seenIds.add(drop.id)
      const existing = this.dropSprites.get(drop.id)
      if (existing) {
        existing.setPosition(drop.x, drop.y)
        // 殘餘時間越短，顏色越紅；用 alpha 動畫已經透過 tween 套上，這裡不重建
        const fillRect = existing.getData('fill') as Phaser.GameObjects.Rectangle | undefined
        if (fillRect) {
          fillRect.setFillStyle(this.dropColorForRemaining(drop), 1)
        }
        continue
      }
      const color = this.dropColorForRemaining(drop)
      const fill = this.add.rectangle(0, 0, DROP_SPRITE_SIZE, DROP_SPRITE_SIZE, color, 1)
      fill.setStrokeStyle(2, 0xffffff, 0.9)
      fill.setOrigin(0.5, 0.5)
      const halo = this.add.circle(0, 0, DROP_SPRITE_SIZE * 0.95, color, 0.25)
      halo.setStrokeStyle(1, color, 0.6)
      const label = this.add.text(0, 0, drop.rank, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: '#1a1407',
        fontStyle: 'bold'
      })
      label.setOrigin(0.5, 0.5)
      const container = this.add.container(drop.x, drop.y, [halo, fill, label])
      container.setDepth(60)
      container.setData('dropId', drop.id)
      container.setData('fill', fill)
      container.setData('halo', halo)
      // hit area 加大，方便手機點擊（DROP_SPRITE_SIZE+8 太小常常點不到）
      const HIT_PAD = 14
      container.setSize(DROP_SPRITE_SIZE + HIT_PAD * 2, DROP_SPRITE_SIZE + HIT_PAD * 2)
      container.setInteractive(
        new Phaser.Geom.Rectangle(
          -(DROP_SPRITE_SIZE / 2 + HIT_PAD),
          -(DROP_SPRITE_SIZE / 2 + HIT_PAD),
          DROP_SPRITE_SIZE + HIT_PAD * 2,
          DROP_SPRITE_SIZE + HIT_PAD * 2
        ),
        Phaser.Geom.Rectangle.Contains
      )
      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        // 玩家點擊 drop 的位置：先確認玩家是否已經夠近，否則自動走過去
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y)
        if (d > DROP_PICKUP_RADIUS) {
          this.pointerTarget = { x: drop.x, y: drop.y }
          this.suppressNextPointerTarget = false
          return
        }
        this.callbacks.onDropPickup(drop.id)
      })
      // 閃光 tween：halo 縮放 + alpha
      this.tweens.add({
        targets: halo,
        scale: { from: 0.7, to: 1.4 },
        alpha: { from: 0.5, to: 0.05 },
        duration: 1100,
        repeat: -1,
        ease: 'Sine.easeInOut',
        yoyo: true
      })
      this.tweens.add({
        targets: fill,
        angle: { from: -8, to: 8 },
        duration: 900,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      })
      this.dropSprites.set(drop.id, container)
    }
    // 清理消失的 drops
    for (const [id, container] of this.dropSprites) {
      if (!seenIds.has(id)) {
        this.tweens.killTweensOf(container)
        container.destroy(true)
        this.dropSprites.delete(id)
      }
    }
  }

  private dropColorForRemaining(drop: AreaMapDrop): number {
    if (drop.ticksRemaining <= 2) return 0xff5555
    if (drop.ticksRemaining <= 5) return 0xffa64d
    return RANK_COLOR[drop.rank] ?? 0xfff5b8
  }

  private checkDropProximity(): void {
    let nearestId: number | null = null
    let nearestDist = DROP_PICKUP_RADIUS
    for (const drop of this.drops) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = drop.id
      }
    }
    this.nearbyDropId = nearestId
  }

  /** 檢查最接近的建築物（距離 ≤ 2 tiles），更新 nearbyBuildingId 並切 bubble。 */
  private checkBuildingProximity(): void {
    const NEAR = AREA_TILE_SIZE * 2
    let nearestId: string | null = null
    let nearestDist = NEAR
    for (const b of this.buildings) {
      const sprite = this.buildingSprites.get(b.id)
      if (!sprite) continue
      const cx = sprite.getData('cx') as number
      const cy = sprite.getData('cy') as number
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy)
      const inRange = d < NEAR
      const bubble = sprite.getData('bubble') as Phaser.GameObjects.Text | undefined
      if (bubble) bubble.setVisible(inRange)
      if (inRange && d < nearestDist) {
        nearestDist = d
        nearestId = b.id
      }
    }
    this.nearbyBuildingId = nearestId
  }

  private makeSquareTexture(
    key: string,
    size: number,
    fill: number,
    outline: number,
    outlineWidth: number
  ): string {
    if (this.textures.exists(key)) {
      this.textures.remove(key)
    }
    const g = this.add.graphics({ x: 0, y: 0 })
    g.fillStyle(fill, 1)
    g.fillRect(0, 0, size, size)
    g.lineStyle(outlineWidth, outline, 1)
    g.strokeRect(outlineWidth / 2, outlineWidth / 2, size - outlineWidth, size - outlineWidth)
    g.generateTexture(key, size, size)
    g.destroy()
    return key
  }

  // ---------- 輸入 ----------

  private setupInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys()
    const keyboard = this.input.keyboard!
    this.wasd = {
      W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      E: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      SPACE: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    }

    this.wasd.E.on('down', () => this.tryInteract())
    this.wasd.SPACE.on('down', () => this.tryInteract())

    // 點地圖上某點 -> 玩家走過去 (sticky)。手機上單擊一次也能持續移動，
    // 走到目標附近 (handleMovement 內判斷) 才清掉 target。
    // suppressNextPointerTarget：當這次 pointerdown 是落在 NPC sprite / 紋卡 sprite
    // 上時，sprite 的 handler 會設此 flag，這裡就不要把目標設成那個座標
    // (避免點 NPC 後玩家還繼續走過去 / 雙觸)。
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.suppressNextPointerTarget) {
        this.suppressNextPointerTarget = false
        return
      }
      this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
      }
    })
  }

  private tryInteract(): void {
    // 紋卡 drop 比 NPC 優先（玩家會踩在 drop 上面，靠近兩者時優先撿卡）
    if (this.nearbyDropId !== null) {
      this.callbacks.onDropPickup(this.nearbyDropId)
      return
    }
    if (this.nearbyNpcId) {
      this.callbacks.onNpcInteract(this.nearbyNpcId)
      return
    }
    if (this.nearbyBuildingId && this.callbacks.onBuildingEnter) {
      this.callbacks.onBuildingEnter(this.nearbyBuildingId)
    }
  }

  // ---------- HUD ----------

  private setupHud(): void {
    const promptBg = this.add.rectangle(0, 0, 120, 26, 0x000000, 0.7)
    promptBg.setStrokeStyle(1, 0xfff5b8, 0.9)
    const promptText = this.add.text(0, 0, '', {
      fontFamily:
        '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      fontSize: '12px',
      color: '#fff5b8'
    })
    promptText.setOrigin(0.5, 0.5)
    this.interactPrompt = this.add.container(0, 0, [promptBg, promptText])
    this.interactPrompt.setDepth(120)
    this.interactPrompt.setVisible(false)
    this.interactPrompt.setData('text', promptText)
    this.interactPrompt.setData('bg', promptBg)
  }

  // ---------- 移動 / 觸發 / 持久化 ----------

  private handleMovement(_delta: number): void {
    let vx = 0
    let vy = 0

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1

    if (vx === 0 && vy === 0 && this.pointerTarget) {
      const dx = this.pointerTarget.x - this.player.x
      const dy = this.pointerTarget.y - this.player.y
      const dist = Math.hypot(dx, dy)
      if (dist > 6) {
        vx = dx / dist
        vy = dy / dist
      } else {
        // 抵達目標附近，停下並清掉 target，避免抖動
        this.pointerTarget = null
      }
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1
      this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED)
    } else {
      this.player.setVelocity(0, 0)
    }
  }

  private checkNpcProximity(): void {
    let nearestId: string | null = null
    let nearestDist = INTERACT_RADIUS
    const allNearby: string[] = []
    for (const [id, sprite] of this.npcSprites) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y)
      const inRange = d < INTERACT_RADIUS
      if (inRange) allNearby.push(id)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = id
      }
      // 顯示 / 隱藏 sprite 上方的 💬 提示氣泡。只在玩家進入互動半徑時才浮出。
      const bubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
      if (bubble) bubble.setVisible(inRange)
    }
    this.nearbyNpcId = nearestId

    // 通知 React 層 nearby 集合變動（穩定排序後比字串）
    allNearby.sort()
    const key = allNearby.join('|')
    if (key !== this.nearbyNpcIdsCache) {
      this.nearbyNpcIdsCache = key
      this.callbacks.onNearbyNpcsChange?.(allNearby)
    }

    const promptText = this.interactPrompt.getData('text') as Phaser.GameObjects.Text
    const promptBg = this.interactPrompt.getData('bg') as Phaser.GameObjects.Rectangle

    let text: string | null = null
    if (this.nearbyDropId !== null) {
      const drop = this.drops.find((d) => d.id === this.nearbyDropId)
      text = drop ? `${this.hudStrings.pickup}: ${drop.rank}` : this.hudStrings.pickup
    } else if (nearestId) {
      const npc = this.npcs.find((n) => n.id === nearestId)
      text = npc ? `${this.hudStrings.interact}: ${npc.shortName}` : this.hudStrings.interact
    } else if (this.nearbyBuildingId) {
      const b = this.buildings.find((bb) => bb.id === this.nearbyBuildingId)
      const enterLabel = this.hudStrings.enterBuilding ?? '進入'
      text = b ? `${enterLabel}：${b.nameZh}` : enterLabel
    }

    // 如果 flashTooFarHint 正在顯示，這 1.2s 內不蓋掉文字
    const lockedUntil = (this.interactPrompt.getData('lockedUntil') as number | undefined) ?? 0
    if (lockedUntil > this.time.now) {
      // 仍在閃示警告中：keep prompt visible at player head position
      this.interactPrompt.setPosition(
        this.player.x,
        this.player.y - PLAYER_SPRITE_SIZE * 1.4
      )
      this.interactPrompt.setVisible(true)
      return
    }

    if (text !== null) {
      promptText.setText(text)
      const w = Math.max(120, promptText.width + 20)
      promptBg.setSize(w, 26)
      this.interactPrompt.setPosition(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.4)
      this.interactPrompt.setVisible(true)
    } else {
      this.interactPrompt.setVisible(false)
    }
  }

  /**
   * 玩家點了一個太遠的 NPC sprite — 在 player 頭頂 flash 1.2s 警告。
   * 用既有的 interactPrompt 容器，但暫時鎖內容 + 用紅色，避免 proximity 檢查
   * 在這 1.2s 內把它蓋掉。
   */
  private flashTooFarHint(): void {
    const promptText = this.interactPrompt.getData('text') as Phaser.GameObjects.Text
    const promptBg = this.interactPrompt.getData('bg') as Phaser.GameObjects.Rectangle
    const msg = this.hudStrings.tooFar
    promptText.setText(msg)
    promptText.setColor('#ffb4a8')
    const w = Math.max(140, promptText.width + 24)
    promptBg.setSize(w, 26)
    promptBg.setStrokeStyle(1, 0xff6b6b, 1)
    this.interactPrompt.setPosition(
      this.player.x,
      this.player.y - PLAYER_SPRITE_SIZE * 1.4
    )
    this.interactPrompt.setVisible(true)
    this.interactPrompt.setData('lockedUntil', this.time.now + 1200)
    if (this.tooFarHintTimer) {
      this.tooFarHintTimer.remove(false)
    }
    this.tooFarHintTimer = this.time.delayedCall(1200, () => {
      promptText.setColor('#fff5b8')
      promptBg.setStrokeStyle(1, 0xfff5b8, 0.9)
      this.interactPrompt.setData('lockedUntil', 0)
      this.tooFarHintTimer = null
    })
  }

  private tickPositionSave(delta: number): void {
    this.positionSaveTimer += delta
    if (this.positionSaveTimer < POSITION_SAVE_INTERVAL_MS) return
    this.positionSaveTimer = 0
    this.flushPositionSave()
  }

  private flushPositionSave(): void {
    if (!this.player) return
    const pos = { x: Math.round(this.player.x), y: Math.round(this.player.y) }
    if (
      Math.abs(pos.x - this.lastSavedPosition.x) < 1 &&
      Math.abs(pos.y - this.lastSavedPosition.y) < 1
    ) {
      return
    }
    this.lastSavedPosition = pos
    this.callbacks.onPositionChange(pos)
  }
}
