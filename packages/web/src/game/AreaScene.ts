import Phaser from 'phaser'
import { DISTRICTS, PLAYER_COLOR, PLAYER_OUTLINE, type DistrictId } from './districts'
import { AREA_DECORATIONS, AREA_ROAD_COLOR, AREA_ROAD_SHADE } from './decorations'
import { activityGlyphFor, textColorForBg } from './npcVisuals'
import { applyProceduralAvatarPose, createProceduralHumanoidAvatar, type ProceduralAvatar } from './characterAvatar'
import {
  characterVisualStateForAreaLocalPlayer,
  characterVisualStateForAreaNpc,
  characterVisualStateForAreaPeerPlayer,
} from './areaCharacterVisualState'
import type { CharacterFacing, CharacterPoint } from './characterVisualState'
import { labelForSpecies, visualForSpecies } from './speciesPalette'
import {
  COLOR_FOR_TERRAIN,
  isWalkableTerrain,
  terrainAt,
  terrainMaskForDistrict,
  type SubcellTerrain,
} from './terrainMask'
import type { NpcActivity } from '../state/types'
import type { AreaEcologyView } from '../api/client'

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
const EXIT_RADIUS = AREA_TILE_SIZE * 1.45
const POSITION_SAVE_INTERVAL_MS = 500
// 後端 tick 為 5 秒；NPC 從上次位置 tween 到新位置花 ≈4.5 秒，剛好接到下個 tick
const NPC_MOVE_TWEEN_MS = 4500
// Nearby players are refreshed every 8 秒；用略短 tween 讓畫面平滑接上下一次 server presence。
const PEER_PLAYER_MOVE_TWEEN_MS = 7500

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
  /** 高度 / 樓層座標。現在不影響 2D 畫面，但保留給互動規則與未來高低差。 */
  subZ?: number
  /** sprite 主色（24-bit RGB，例 0xff8a4a）。後端依 faction + id 決定 */
  color: number
  /** 活動 enum，用來顯示活動圖示 emoji */
  activity: AreaNpcActivity
  /** v0.14.0：mood < 30 時 name label 用灰色顯示低落感 */
  mood?: number
  /** v0.14.0：health < 30 時 sprite 旁加 🤕 圖示 */
  health?: number
  /** Short deterministic task text from the server projection. */
  intentLine?: string
}

export interface AreaMapPlayer {
  id: number
  displayName: string
  shortName: string
  x?: number | null
  y?: number | null
  z?: number | null
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
  onPositionChange: (pos: { x: number; y: number; z: number }) => void
  /** 玩家附近 (距離 ≤ INTERACT_RADIUS) 的 NPC ids；set 變動時才 fire。 */
  onNearbyNpcsChange?: (ids: string[]) => void
  /** 玩家點了一個太遠的 NPC sprite。React 層可以彈個 toast。 */
  onInteractTooFar?: (npcId: string) => void
  /** 玩家走進建築物提示範圍 → 點該建築可進入。React 層應 navigate。 */
  onBuildingEnter?: (buildingId: string) => void
  /** v0.15.2：玩家最近的可進入建築變動時 fire；React 渲染地圖外面的「進入 X」HTML 按鈕。 */
  onNearbyBuildingChange?: (buildingId: string | null) => void
  /** 子地圖出口：回到上一層場景。 */
  onExit?: () => void
  /** 玩家點擊了一個動物 dot/cluster → 送出獵捕動作。 */
  onAnimalHunt?: (speciesId: string, animalId: string) => void
  /** 玩家點擊了漁場 bar → 送出捕魚動作。 */
  onFish?: () => void
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
  players?: AreaMapPlayer[]
  drops: AreaMapDrop[]
  locale: 'zh' | 'en'
  playerName?: string | null
  hudStrings: {
    interact: string
    pickup: string
    tooFar: string
    enterBuilding?: string
    exit?: string
  }
  /** 該 tile 上的建築物（從 server catalog 來）。可選。 */
  buildings?: AreaMapBuilding[]
  /** 從 localStorage 讀回的位置；若無則 null。座標必須在 canvas 範圍內。 */
  startPosition: { x: number; y: number } | null
  /** v0.15.1：當前世界天氣（後端 fact）；用於 Phaser VFX 切換 */
  weather?: AreaWeather
  /** Sprint 2A — server-authoritative ecology rollup for this tile. */
  ecology?: AreaEcologyView | null
  /** Guests can browse the map, but player movement/actions require login. */
  controlsEnabled?: boolean
}

const DROP_SPRITE_SIZE = 22
const DROP_PICKUP_RADIUS = AREA_TILE_SIZE * 1.4

/**
 * Sprint 4 — pixel-level darken used by the per-sub-cell terrain
 * rendering to give every other cell a slightly darker shade so the
 * grid lines stay legible. Subtracts the same delta from each RGB
 * channel and clamps at 0.
 */
function darken(color: number, delta: number): number {
  const dr = (delta >> 16) & 0xff
  const dg = (delta >> 8) & 0xff
  const db = delta & 0xff
  const r = Math.max(0, ((color >> 16) & 0xff) - dr)
  const g = Math.max(0, ((color >> 8) & 0xff) - dg)
  const b = Math.max(0, (color & 0xff) - db)
  return (r << 16) | (g << 8) | b
}

/**
 * Sprint 2A — deterministic sub-cell placement for ecology sprites.
 *
 * FNV-1a 32-bit hash over `tileId|salt|key`. Bigger numbers map to
 * (col, row) inside the area canvas with a 1-cell margin so sprites
 * don't sit on the very edge.
 */
function areaSubcellFromHash(key: string, tileId: string, salt: string): { x: number; y: number } {
  let h = 2166136261 >>> 0
  const s = `${tileId}|${salt}|${key}`
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const colRange = AREA_GRID_COLS - 2
  const rowRange = AREA_GRID_ROWS - 2
  const col = 1 + (h % colRange)
  const row = 1 + (Math.floor(h / colRange) % rowRange)
  return {
    x: col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2,
    y: row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2,
  }
}

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
  private players: AreaMapPlayer[] = []
  private playerName: string | null = null
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
  private controlsEnabled = true
  /** Sprint 2A — ecology rollup (animals/fishery/migration/predator) for this tile. */
  private ecology: AreaEcologyView | null = null
  /** Sprint 2A — animal sprites + fishery bar layer, replaced when ecology updates. */
  private ecologyLayer: Phaser.GameObjects.Container | null = null
  /** v0.15.1：天氣 VFX layer，applyWeather 切換時整批 destroy 重畫。 */
  private weatherLayer: Phaser.GameObjects.Container | null = null
  /** v0.15.1：環境動畫的 tween 池（裝飾物擺動 / 燈火閃爍 / 水波漣漪）。 */
  private envTweens: Phaser.Tweens.Tween[] = []
  private envSprites: Phaser.GameObjects.Text[] = []

  private player!: Phaser.Physics.Arcade.Sprite
  private playerAvatar: ProceduralAvatar | null = null
  private playerFacing: CharacterFacing = 'right'
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null
  private nearbyNpcId: string | null = null
  private nearbyDropId: number | null = null
  private nearbyBuildingId: string | null = null
  private nearExit = false
  private exitHotspot!: Phaser.GameObjects.Container
  private exitPos!: { x: number; y: number }
  private buildingSprites: Map<string, Phaser.GameObjects.Container> = new Map()
  private buildingsSignature = ''
  /** 玩家剛點到 NPC sprite 的時候設成 true，下一個 scene-level pointerdown
   *  就忽略掉 (避免點完 NPC 之後，玩家還繼續走向那個位置)。 */
  private suppressNextPointerTarget = false

  private interactPrompt!: Phaser.GameObjects.Container
  private npcSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map()
  private peerSprites: Map<number, Phaser.GameObjects.Container> = new Map()
  private dropSprites: Map<number, Phaser.GameObjects.Container> = new Map()
  private playerNameLabel: Phaser.GameObjects.Text | null = null

  private positionSaveTimer = 0
  private lastSavedPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }

  constructor() {
    super({ key: AreaScene.KEY })
  }

  init(data: AreaSceneInit): void {
    this.callbacks = data.callbacks
    this.tileId = data.tileId
    this.npcs = data.npcs
    this.players = data.players ?? []
    this.playerName = data.playerName ?? null
    this.drops = data.drops
    this.buildings = data.buildings ?? []
    this.hudStrings = data.hudStrings
    this.startPosition = data.startPosition
    this.weather = data.weather ?? 'clear'
    this.ecology = data.ecology ?? null
    this.controlsEnabled = data.controlsEnabled ?? true
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12141a)
    this.drawBackground()
    this.drawExitHotspot()
    this.spawnPlayer()
    this.spawnPeerPlayers()
    this.spawnBuildings()
    this.spawnNpcs()
    this.spawnDrops()
    this.setupInput()
    this.setupHud()
    this.applyWeather(this.weather)
    this.drawEcologyOverlay()

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
    players?: AreaMapPlayer[]
    playerName?: string | null
    locale?: 'zh' | 'en'
    hudStrings?: AreaSceneInit['hudStrings']
    buildings?: AreaMapBuilding[]
    weather?: AreaWeather
    ecology?: AreaEcologyView | null
    controlsEnabled?: boolean
  }): void {
    if (payload.controlsEnabled !== undefined) {
      this.controlsEnabled = payload.controlsEnabled
      if (!this.controlsEnabled) {
        this.pointerTarget = null
        this.player?.setVelocity(0, 0)
        this.interactPrompt?.setVisible(false)
      }
    }
    if (payload.hudStrings) this.hudStrings = payload.hudStrings
    if (payload.npcs) {
      this.npcs = payload.npcs
      this.refreshNpcSprites()
    }
    if (payload.players) {
      this.players = payload.players
      this.refreshPeerSprites()
    }
    if (payload.playerName !== undefined) {
      this.playerName = payload.playerName
      this.refreshPlayerNameLabel()
    }
    if (payload.drops) {
      this.drops = payload.drops
      this.refreshDropSprites()
    }
    if (payload.buildings) {
      this.buildings = payload.buildings
      this.refreshBuildingSprites()
    }
    if (payload.weather && payload.weather !== this.weather) {
      this.weather = payload.weather
      this.applyWeather(payload.weather)
    }
    if (payload.ecology !== undefined) {
      this.ecology = payload.ecology
      this.drawEcologyOverlay()
    }
  }

  update(_time: number, delta: number): void {
    if (!this.controlsEnabled) {
      this.pointerTarget = null
      this.player?.setVelocity(0, 0)
      this.syncPlayerAvatar()
      this.syncPlayerNameLabel()
      return
    }
    this.handleMovement(delta)
    this.syncPlayerAvatar()
    this.checkDropProximity()
    this.checkBuildingProximity()
    this.checkExitProximity()
    this.checkNpcProximity()
    this.syncPlayerNameLabel()
    this.tickPositionSave(delta)
  }

  // ---------- 背景 ----------

  private drawBackground(): void {
    const def = DISTRICTS[this.tileId] ?? DISTRICTS.t_road
    const decoSet = AREA_DECORATIONS[this.tileId] ?? AREA_DECORATIONS.t_road
    // 把道路 cell 做成 set 方便 O(1) 查
    const roadKeys = new Set<string>()
    for (const cell of decoSet.roadCells) roadKeys.add(`${cell.col},${cell.row}`)

    // Sprint 4 — per-sub-cell terrain mask for water-biome districts.
    // Land districts return `null` and fall through to the existing
    // single-color checker path.
    const mask = terrainMaskForDistrict(this.tileId)

    const g = this.add.graphics()
    for (let row = 0; row < AREA_GRID_ROWS; row += 1) {
      for (let col = 0; col < AREA_GRID_COLS; col += 1) {
        const checker = (col + row) % 2 === 0
        const isRoad = roadKeys.has(`${col},${row}`)
        const terrain: SubcellTerrain | null = mask ? mask[row]?.[col] ?? 'land' : null
        let fill: number
        if (terrain && terrain !== 'land') {
          const base = COLOR_FOR_TERRAIN[terrain]
          // Darken the checker cells by a small fixed amount so the
          // sub-cell grid stays visible without losing the terrain hue.
          fill = checker ? base : darken(base, 0x101010)
        } else if (isRoad) {
          fill = checker ? AREA_ROAD_COLOR : AREA_ROAD_SHADE
        } else {
          fill = checker ? def.color : def.shade
        }
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
      this.createInspectZone(cx, cy, AREA_TILE_SIZE, AREA_TILE_SIZE, this.labelForDecoration(deco.glyph), 41)
      this.attachEnvAnimation(text, deco.glyph, cx, cy, deco.col, deco.row)
    }
  }

  private createInspectZone(
    x: number,
    y: number,
    width: number,
    height: number,
    message: string,
    depth?: number,
    onPointerDown?: () => void,
  ): Phaser.GameObjects.Zone {
    const zone = this.add.zone(x, y, width, height)
    if (depth !== undefined) zone.setDepth(depth)
    zone.setInteractive({ useHandCursor: true })
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation?.()
      this.suppressNextPointerTarget = true
      this.flashInspectHint(message, x, y)
      onPointerDown?.()
    })
    return zone
  }

  private labelForDecoration(glyph: string): string {
    const labels: Readonly<Record<string, string>> = {
      '🌲': '針葉林',
      '🌳': '林木',
      '🌵': '沙地植物',
      '🌿': '濕地植被',
      '🌾': '野生穀草',
      '🪵': '木材堆',
      '🪨': '岩石',
      '⛰': '山岩',
      '🏔': '雪峰',
      '🏚': '遺跡殘屋',
      '🏠': '民居外觀',
      '🏪': '商鋪外觀',
      '🛖': '棚屋',
      '🪔': '燈火',
      '⛩': '神社外觀',
      '🏯': '塔樓外觀',
      '🪧': '告示牌',
      '⚓': '船錨',
      '⛵': '小船',
      '🛟': '救生圈',
      '🪝': '釣具',
      '🐟': '魚群跡象',
      '🐚': '貝殼',
      '✦': '異常光點',
      '✧': '微光殘響',
      '◈': '結晶標記',
    }
    return labels[glyph] ?? `環境物件 ${glyph}`
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
   * Sprint 2A — world-visibility-ecology.
   *
   * For the current tile's ecology rollup:
   *  - ≤ 5 animals of a species: render one small dot sprite per
   *    animalId, anchored at sub-cell coords deterministically derived
   *    from a FNV-1a hash of `(animalId, tileId, salt)`.
   *  - ≥ 6 animals: render a single cluster sprite + count label.
   *  - if a fishery row exists: paint a thin density bar at the bottom
   *    edge, length proportional to density / 100.
   *  - if migration waves touch this tile: show read-only trail markers so
   *    Hub ecology hints do not disappear when the player enters the area.
   *
   * Idempotent — destroys the previous overlay before re-rendering.
   */
  private drawEcologyOverlay(): void {
    if (this.ecologyLayer) {
      this.ecologyLayer.destroy(true)
      this.ecologyLayer = null
    }
    const eco = this.ecology
    if (!eco) return

    const layer = this.add.container(0, 0)
    layer.setDepth(44)
    this.ecologyLayer = layer

    // v0.41.0 — plant sprites: trees / reeds / herbs / fungi visibly placed on
    // the area canvas with a density-driven size + saturation bar. When NPCs
    // chop trees the density drops, the tree shrinks, and the bar empties.
    const plantGlyph: Record<string, string> = {
      oak: '🌳', pine: '🌲', reed: '🌾', wild_herb: '🌿', cave_fungus: '🍄',
    }
    const plantNameZh: Record<string, string> = {
      oak: '橡樹', pine: '松木', reed: '蘆葦', wild_herb: '野草藥', cave_fungus: '洞穴菌',
    }
    eco.plants.forEach((plant, plantIdx) => {
      // Spread plant nodes deterministically across the inner canvas.
      const slots = eco.plants.length
      const colStep = (AREA_CANVAS_WIDTH - 80) / Math.max(1, slots)
      const px = 40 + colStep * (plantIdx + 0.5)
      const py = 40
      const glyph = plantGlyph[plant.speciesId] ?? '🌱'
      const nameZh = plantNameZh[plant.speciesId] ?? plant.speciesId
      // Size scales with saturation: 14px when depleted, 26px when full.
      const sizePx = 14 + Math.round((plant.saturationPct / 100) * 12)
      const tree = this.add.text(px, py, glyph, {
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
        fontSize: `${sizePx}px`,
        color: '#ffffff',
      })
      tree.setOrigin(0.5, 0.5)
      layer.add(tree)
      // Density bar under the plant glyph: width scales 0..32 px.
      const barWidth = 32
      const fillWidth = Math.max(1, Math.round((plant.density / Math.max(1, plant.capacity)) * barWidth))
      const barBg = this.add.rectangle(px, py + 18, barWidth, 3, 0x0a0a0a, 0.6)
      barBg.setOrigin(0.5, 0.5)
      layer.add(barBg)
      const barColor = plant.saturationPct < 30 ? 0xe04a3a : plant.saturationPct < 70 ? 0xd6a04a : 0x4ad682
      const fill = this.add.rectangle(px - barWidth / 2, py + 18, fillWidth, 3, barColor, 0.95)
      fill.setOrigin(0, 0.5)
      layer.add(fill)
      // Always-visible label so the player knows what it is + density %.
      const label = this.add.text(px, py + 24, `${nameZh} ${plant.saturationPct}%`, {
        fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif',
        fontSize: '9px',
        color: '#c8d4a6',
        stroke: '#0a0a0a',
        strokeThickness: 2,
      })
      label.setOrigin(0.5, 0)
      layer.add(label)
      layer.add(this.createInspectZone(px, py, 36, 40, `${nameZh} ${plant.density.toFixed(0)}/${plant.capacity}`))
    })

    for (const row of eco.animals) {
      const visual = visualForSpecies(row.speciesId)
      if (row.animalIds.length <= 5) {
        for (const animalId of row.animalIds) {
          const { x, y } = areaSubcellFromHash(animalId, eco.tileId, 'ecology-placement')
          const dot = this.add.circle(x, y, 9, visual.color, 0.9)
          dot.setStrokeStyle(1.5, 0x0a0a0a, 0.8)
          // v0.40.0: bigger hit radius (was 15) — small ecology dots were
          // unreliably tappable on touch + mouse alike. 26px is the same
          // ratio as the cluster bg, which works well in playtests.
          dot.setInteractive(new Phaser.Geom.Circle(0, 0, 26), Phaser.Geom.Circle.Contains)
          dot.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event?.stopPropagation?.()
            this.suppressNextPointerTarget = true
            this.flashInspectHint(`獵 ${labelForSpecies(row.speciesId)}`, x, y)
            this.callbacks.onAnimalHunt?.(row.speciesId, animalId)
          })
          layer.add(dot)
          const glyph = this.add.text(x, y - 1, visual.emoji, {
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
            fontSize: '12px',
            color: '#ffffff',
          })
          glyph.setOrigin(0.5, 0.5)
          layer.add(glyph)
          // v0.40.0: always show species nameZh under each animal so the
          // user knows WHAT they're about to hunt before clicking.
          const nameLabel = this.add.text(x, y + 11, labelForSpecies(row.speciesId), {
            fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif',
            fontSize: '9px',
            color: '#fff5b8',
            stroke: '#0a0a0a',
            strokeThickness: 2,
          })
          nameLabel.setOrigin(0.5, 0)
          layer.add(nameLabel)
          // v0.41.1 — inspect zone now actually triggers the hunt (used to
          // only show the hint label; the underlying dot's 26px hit area was
          // shadowed by this larger zone). Closing over animalId so each
          // zone hunts the specific animal it covers.
          const _animalId = animalId
          layer.add(
            this.createInspectZone(
              x, y, AREA_TILE_SIZE, AREA_TILE_SIZE,
              `獵 ${labelForSpecies(row.speciesId)}`,
              undefined,
              () => {
                this.callbacks.onAnimalHunt?.(row.speciesId, _animalId)
              }
            )
          )
        }
      } else {
        // Cluster at a deterministic spot derived from speciesId + tileId.
        const { x, y } = areaSubcellFromHash(row.speciesId, eco.tileId, 'ecology-cluster')
        const bg = this.add.circle(x, y, 16, 0x141820, 0.85)
        bg.setStrokeStyle(2, visual.color, 0.95)
        bg.setInteractive(new Phaser.Geom.Circle(0, 0, 32), Phaser.Geom.Circle.Contains)
        bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event?.stopPropagation?.()
          this.suppressNextPointerTarget = true
          this.flashInspectHint(`獵 ${labelForSpecies(row.speciesId)} ×${row.count}`, x, y)
          const firstId = row.animalIds[0]
          if (firstId !== undefined) {
            this.callbacks.onAnimalHunt?.(row.speciesId, firstId)
          }
        })
        layer.add(bg)
        const glyph = this.add.text(x, y, visual.emoji, {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
          fontSize: '20px',
          color: '#ffffff',
        })
        glyph.setOrigin(0.5, 0.5)
        layer.add(glyph)
        // v0.40.0: species name + count, both visible. The old "x8" alone
        // gave no clue what the cluster actually was.
        const speciesLabel = this.add.text(x, y + 19, `${labelForSpecies(row.speciesId)} ×${row.count}`, {
          fontFamily: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif',
          fontSize: '10px',
          color: '#fff5b8',
          stroke: '#0a0a0a',
          strokeThickness: 2,
        })
        speciesLabel.setOrigin(0.5, 0)
        layer.add(speciesLabel)
        // v0.41.1 — inspect zone fires the hunt for the cluster's first
        // animal, mirroring the bg circle's pointerdown behaviour. Without
        // this, players who clicked outside the 32px circle but inside the
        // 1.4-tile zone saw the hint but no action.
        const _firstAnimalId = row.animalIds[0]
        layer.add(
          this.createInspectZone(
            x, y, AREA_TILE_SIZE * 1.4, AREA_TILE_SIZE * 1.4,
            `獵 ${labelForSpecies(row.speciesId)} ×${row.count}`,
            undefined,
            () => {
              if (_firstAnimalId !== undefined) {
                this.callbacks.onAnimalHunt?.(row.speciesId, _firstAnimalId)
              }
            }
          )
        )
      }
    }

    for (const wave of eco.migrationsArriving) {
      this.addMigrationMarker(layer, wave, 'arriving')
    }
    for (const wave of eco.migrationsDeparting) {
      this.addMigrationMarker(layer, wave, 'departing')
    }

    if (eco.fishery) {
      const maxWidth = AREA_CANVAS_WIDTH - 80
      const widthPx = Math.max(0, Math.min(eco.fishery.density / 100, 1)) * maxWidth
      const barY = AREA_CANVAS_HEIGHT - 12
      const bg = this.add.rectangle(40, barY, maxWidth, 6, 0x0a0a0a, 0.6)
      bg.setOrigin(0, 0.5)
      layer.add(bg)
      const fill = this.add.rectangle(40, barY, widthPx, 6, eco.fishery.collapsed ? 0xe04a3a : 0x4a9cd6, 0.9)
      fill.setOrigin(0, 0.5)
      layer.add(fill)
      const fishHitArea = this.add.rectangle(40 + maxWidth / 2, barY, maxWidth, 36, 0xffffff, 0)
      fishHitArea.setOrigin(0.5, 0.5)
      fishHitArea.setInteractive()
      fishHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        this.flashInspectHint(this.fisheryLabel(eco.fishery!.density, eco.fishery!.collapsed), 40 + maxWidth / 2, barY - 20)
        this.callbacks.onFish?.()
      })
      layer.add(fishHitArea)
      layer.add(
        this.createInspectZone(
          40 + maxWidth / 2,
          barY,
          maxWidth,
          36,
          this.fisheryLabel(eco.fishery.density, eco.fishery.collapsed)
        )
      )
      const label = this.add.text(40, barY - 12, this.fisheryLabel(eco.fishery.density, eco.fishery.collapsed), {
        fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
        fontSize: '10px',
        color: '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 2,
      })
      label.setOrigin(0, 0.5)
      layer.add(label)
    }
  }

  private addMigrationMarker(
    layer: Phaser.GameObjects.Container,
    wave: AreaEcologyView['migrationsArriving'][number],
    direction: 'arriving' | 'departing'
  ): void {
    const visual = visualForSpecies(wave.speciesId)
    const { x, y } = areaSubcellFromHash(wave.waveId, this.tileId, `migration-${direction}`)
    const isArriving = direction === 'arriving'
    const color = isArriving ? 0x9cc36b : 0x9c6b3c
    const arrow = isArriving ? '↘' : '↗'
    const label = `${isArriving ? '遷徙抵達' : '遷徙離開'}：${labelForSpecies(wave.speciesId)} ×${wave.count}`

    const bg = this.add.circle(x, y, 14, 0x0d1117, 0.8)
    bg.setStrokeStyle(2, color, 0.95)
    layer.add(bg)

    const glyph = this.add.text(x - 2, y, visual.emoji, {
      fontFamily:
        '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
    })
    glyph.setOrigin(0.5, 0.5)
    layer.add(glyph)

    const arrowText = this.add.text(x + 12, y - 12, arrow, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: isArriving ? '#b9f28b' : '#d6a15c',
      stroke: '#0a0a0a',
      strokeThickness: 2,
    })
    arrowText.setOrigin(0.5, 0.5)
    layer.add(arrowText)

    const count = this.add.text(x + 14, y + 8, `×${wave.count}`, {
      fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
      fontSize: '11px',
      color: '#fff5b8',
      stroke: '#0a0a0a',
      strokeThickness: 2,
    })
    count.setOrigin(0, 0.5)
    layer.add(count)
    layer.add(this.createInspectZone(x, y, AREA_TILE_SIZE * 1.5, AREA_TILE_SIZE * 1.2, label))
  }

  private fisheryLabel(density: number, collapsed: boolean): string {
    if (collapsed) return '魚場崩潰'
    if (density < 20) return `漁場枯竭（${density}/100）`
    if (density < 40) return `漁場稀少（${density}/100）`
    if (density < 66) return `漁場中等（${density}/100）`
    return `漁場豐富（${density}/100）`
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
    this.buildingsSignature = this.signatureForBuildings(this.buildings)
    this.clearBuildingSprites()
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
        if (!this.controlsEnabled) {
          this.suppressNextPointerTarget = false
          return
        }
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

  private refreshBuildingSprites(): void {
    const nextSignature = this.signatureForBuildings(this.buildings)
    if (nextSignature === this.buildingsSignature) return
    this.nearbyBuildingId = null
    this.callbacks.onNearbyBuildingChange?.(null)
    this.spawnBuildings()
  }

  private signatureForBuildings(buildings: readonly AreaMapBuilding[]): string {
    return buildings
      .map((b) => `${b.id}:${b.nameZh}:${b.type}:${b.col},${b.row}:${b.glyph}:${b.size}:${b.enterable}`)
      .sort()
      .join('|')
  }

  private clearBuildingSprites(): void {
    for (const sprite of this.buildingSprites.values()) {
      sprite.destroy(true)
    }
    this.buildingSprites.clear()
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

  private flashInspectHint(message: string, x: number, y: number): void {
    const promptText = this.interactPrompt.getData('text') as Phaser.GameObjects.Text
    const promptBg = this.interactPrompt.getData('bg') as Phaser.GameObjects.Rectangle
    promptText.setText(message)
    promptText.setColor('#d9fff0')
    const w = Math.max(140, promptText.width + 24)
    promptBg.setSize(w, 26)
    promptBg.setStrokeStyle(1, 0x9ee0c7, 0.95)
    const promptX = Math.max(w / 2 + 4, Math.min(AREA_CANVAS_WIDTH - w / 2 - 4, x))
    const promptY = Math.max(18, y - AREA_TILE_SIZE * 0.7)
    this.interactPrompt.setPosition(promptX, promptY)
    this.interactPrompt.setVisible(true)
    this.interactPrompt.setData('lockedUntil', this.time.now + 1400)
    this.interactPrompt.setData('lockedX', promptX)
    this.interactPrompt.setData('lockedY', promptY)
    if (this.tooFarHintTimer) this.tooFarHintTimer.remove(false)
    this.tooFarHintTimer = this.time.delayedCall(1400, () => {
      promptText.setColor('#fff5b8')
      promptBg.setStrokeStyle(1, 0xfff5b8, 0.9)
      this.interactPrompt.setData('lockedUntil', 0)
      this.interactPrompt.setData('lockedX', undefined)
      this.interactPrompt.setData('lockedY', undefined)
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
    this.player.setVisible(false)
    this.player.setDepth(80)
    this.player.setCollideWorldBounds(true)
    const state = characterVisualStateForAreaLocalPlayer({
      playerName: this.playerName,
      x: start.x,
      y: start.y,
      previousFacing: this.playerFacing,
    })
    this.playerFacing = state.facing
    this.playerAvatar = createProceduralHumanoidAvatar(this, state, { size: PLAYER_SPRITE_SIZE + 6, depth: 80 })
    this.refreshPlayerNameLabel()
    this.lastSavedPosition = { x: start.x, y: start.y, z: 0 }
  }

  private refreshPlayerNameLabel(): void {
    if (!this.player) return
    const label = this.playerName?.trim()
    if (!label) {
      if (this.playerNameLabel) {
        this.playerNameLabel.destroy()
        this.playerNameLabel = null
      }
      return
    }
    if (!this.playerNameLabel) {
      this.playerNameLabel = this.add.text(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.25, label, {
        fontFamily:
          'Inter, "Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 4
      })
      this.playerNameLabel.setOrigin(0.5, 1)
      this.playerNameLabel.setDepth(84)
      return
    }
    if (this.playerNameLabel.text !== label) this.playerNameLabel.setText(label)
    if (this.playerAvatar?.label) this.playerAvatar.label.setText(label.charAt(0).toUpperCase())
    this.syncPlayerNameLabel()
  }

  private syncPlayerNameLabel(): void {
    if (!this.player || !this.playerNameLabel) return
    this.playerNameLabel.setPosition(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.25)
  }

  private syncPlayerAvatar(): void {
    if (!this.player || !this.playerAvatar) return
    const body = this.player.body as Phaser.Physics.Arcade.Body | null
    const state = characterVisualStateForAreaLocalPlayer({
      playerName: this.playerName,
      x: this.player.x,
      y: this.player.y,
      velocityX: body?.velocity.x ?? 0,
      velocityY: body?.velocity.y ?? 0,
      previousFacing: this.playerFacing,
    })
    this.playerFacing = state.facing
    applyProceduralAvatarPose(this.playerAvatar.container, state)
    if (this.playerAvatar.label && this.playerAvatar.label.text !== state.shortLabel) {
      this.playerAvatar.label.setText(state.shortLabel)
    }
  }

  private spawnPeerPlayers(): void {
    this.refreshPeerSprites()
  }

  private refreshPeerSprites(): void {
    const seen = new Set<number>()
    const sorted = [...this.players].sort((a, b) => a.id - b.id)
    for (let i = 0; i < sorted.length; i += 1) {
      const player = sorted[i]!
      seen.add(player.id)
      const target = this.peerTarget(player, i)
      const existing = this.peerSprites.get(player.id)
      if (existing) {
        const label = existing.getData('label') as Phaser.GameObjects.Text | undefined
        if (label && label.text !== player.displayName) label.setText(player.displayName)
        const avatar = existing.getData('avatar') as ProceduralAvatar | undefined
        const previousZ = existing.getData('z') as number | null | undefined
        const previous: CharacterPoint = previousZ !== undefined
          ? { x: existing.x, y: existing.y, z: previousZ }
          : { x: existing.x, y: existing.y }
        const fallback: CharacterPoint = player.z !== undefined ? { ...target, z: player.z } : target
        const state = characterVisualStateForAreaPeerPlayer(
          player,
          fallback,
          previous,
          this.facingForAvatar(existing)
        )
        applyProceduralAvatarPose(existing, { ...state, x: existing.x, y: existing.y })
        if (avatar?.label && avatar.label.text !== state.shortLabel) avatar.label.setText(state.shortLabel)
        existing.setData('z', state.z)
        this.tweenPeerTo(existing, target.x, target.y)
        continue
      }
      const fallback: CharacterPoint = player.z !== undefined ? { ...target, z: player.z } : target
      const state = characterVisualStateForAreaPeerPlayer(player, fallback)
      const avatar = createProceduralHumanoidAvatar(this, state, { size: PLAYER_SPRITE_SIZE + 6, depth: 78 })
      const container = avatar.container
      const label = this.add.text(target.x, target.y - PLAYER_SPRITE_SIZE * 1.25, player.displayName, {
        fontFamily:
          'Inter, "Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: '#d9fff0',
        stroke: '#0a0a0a',
        strokeThickness: 4
      })
      label.setOrigin(0.5, 1)
      label.setDepth(82)
      container.setData('avatar', avatar)
      container.setData('label', label)
      container.setData('targetX', target.x)
      container.setData('targetY', target.y)
      container.setData('z', state.z)
      this.peerSprites.set(player.id, container)
    }
    for (const [id, sprite] of this.peerSprites) {
      if (!seen.has(id)) {
        this.disposePeerSprite(sprite)
        this.peerSprites.delete(id)
      }
    }
  }

  private tweenPeerTo(container: Phaser.GameObjects.Container, x: number, y: number): void {
    const currentTargetX = container.getData('targetX') as number | undefined
    const currentTargetY = container.getData('targetY') as number | undefined
    if (
      typeof currentTargetX === 'number' &&
      typeof currentTargetY === 'number' &&
      Math.abs(currentTargetX - x) < 0.5 &&
      Math.abs(currentTargetY - y) < 0.5
    ) {
      return
    }

    const prev = container.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (prev) this.tweens.remove(prev)

    container.setData('targetX', x)
    container.setData('targetY', y)

    const startX = container.x
    const startY = container.y
    const label = container.getData('label') as Phaser.GameObjects.Text | undefined
    const distance = Phaser.Math.Distance.Between(startX, startY, x, y)
    if (distance < 0.5) {
      container.setPosition(x, y)
      if (label) label.setPosition(x, y - PLAYER_SPRITE_SIZE * 1.25)
      container.setData('moveTween', undefined)
      return
    }

    const tween = this.tweens.add({
      targets: { px: startX, py: startY },
      px: x,
      py: y,
      duration: PEER_PLAYER_MOVE_TWEEN_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (_t, t: { px: number; py: number }) => {
        container.setPosition(t.px, t.py)
        if (label) label.setPosition(t.px, t.py - PLAYER_SPRITE_SIZE * 1.25)
      },
      onComplete: () => {
        container.setPosition(x, y)
        if (label) label.setPosition(x, y - PLAYER_SPRITE_SIZE * 1.25)
        container.setData('moveTween', undefined)
      }
    })
    container.setData('moveTween', tween)
  }

  private disposePeerSprite(container: Phaser.GameObjects.Container): void {
    const moveTween = container.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (moveTween) this.tweens.remove(moveTween)
    const label = container.getData('label') as Phaser.GameObjects.Text | undefined
    if (label) label.destroy()
    container.destroy(true)
  }

  private facingForAvatar(container: Phaser.GameObjects.Container): CharacterFacing {
    return container.scaleX < 0 ? 'left' : 'right'
  }

  private peerTarget(player: AreaMapPlayer, index: number): { x: number; y: number } {
    if (typeof player.x === 'number' && typeof player.y === 'number') {
      return this.clampToCanvas({ x: player.x, y: player.y })
    }
    const slots = [
      { col: 1, row: 1 },
      { col: 13, row: 1 },
      { col: 1, row: 8 },
      { col: 13, row: 8 },
      { col: 7, row: 1 },
      { col: 2, row: 5 },
      { col: 12, row: 5 },
      { col: 7, row: 8 }
    ]
    const slot = slots[index % slots.length]!
    const lap = Math.floor(index / slots.length)
    return this.clampToCanvas({
      x: slot.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2 + lap * 12,
      y: slot.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2 + lap * 10
    })
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
        const avatar = existing.getData('avatar') as ProceduralAvatar | undefined
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
        if (avatar?.label && avatar.label.text !== npc.shortName) avatar.label.setText(npc.shortName)
        // 平滑移動到後端的新位置
        this.tweenNpcTo(existing, target.x, target.y, npc)
        this.applyOpenWaterHint(existing, npc)
        continue
      }

      // 新增 sprite — 直接落在後端指定位置
      const tex = this.makeNpcTexture(npc.id, npc.color)
      const sprite = this.physics.add.sprite(target.x, target.y, tex)
      sprite.setVisible(false)
      sprite.setDepth(70)
      sprite.setData('npcId', npc.id)
      sprite.setData('npcColor', npc.color)

      const state = characterVisualStateForAreaNpc(npc, target)
      const avatar = createProceduralHumanoidAvatar(this, state, { size: NPC_SPRITE_SIZE + 4, depth: 70 })
      avatar.container.setSize(NPC_SPRITE_SIZE * 1.7, NPC_SPRITE_SIZE * 2.2)
      avatar.container.setInteractive(
        new Phaser.Geom.Rectangle(
          -NPC_SPRITE_SIZE * 0.85,
          -NPC_SPRITE_SIZE * 1.25,
          NPC_SPRITE_SIZE * 1.7,
          NPC_SPRITE_SIZE * 2.2
        ),
        Phaser.Geom.Rectangle.Contains
      )
      avatar.container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        if (!this.controlsEnabled) {
          this.suppressNextPointerTarget = false
          return
        }
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
      sprite.setData('avatar', avatar)

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
        if (!this.controlsEnabled) {
          this.suppressNextPointerTarget = false
          return
        }
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

      this.attachNpcIdleAnimation(sprite, npc.id)
      this.applyOpenWaterHint(sprite, npc)
      this.npcSprites.set(npc.id, sprite)
    }

    for (const [id, sprite] of this.npcSprites) {
      if (!seen.has(id)) this.disposeNpcSprite(id, sprite)
    }
  }

  /**
   * v0.15.2：給 NPC sprite 套上一個微微「呼吸」的 idle tween (scaleY 0.95-1.05)。
   * 解決問題：玩家進場景時，沒下一輪 polling 之前 NPC subCol/subRow 不會變，
   * 沒有位置 tween 觸發 → sprite 完全靜止 → 場景看起來像截圖。idle tween
   * 是純視覺、跟位置 tween 走不同 axis (scaleY vs x/y)，不互相干擾。
   * phase delay 用 npcId hash，避免每位 NPC 完全同步呼吸。
   */
  private attachNpcIdleAnimation(
    sprite: Phaser.Physics.Arcade.Sprite,
    npcId: string
  ): void {
    const existing = sprite.getData('idleTween') as Phaser.Tweens.Tween | undefined
    if (existing) return
    const avatar = sprite.getData('avatar') as ProceduralAvatar | undefined
    let h = 5381
    for (const ch of npcId) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
    const delay = h % 800
    const tween = this.tweens.add({
      targets: avatar?.body ?? sprite,
      scaleY: { from: 0.93, to: 1.06 },
      duration: 1200 + (h % 400),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay
    })
    sprite.setData('idleTween', tween)
  }

  /** 把當前 sprite + 旁邊所有 label 從現在位置 tween 到目標 (x,y)。 */
  private tweenNpcTo(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number, npc: AreaMapNpc): void {
    const prev = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (prev) prev.stop()
    const avatar = sprite.getData('avatar') as ProceduralAvatar | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const healthIcon = sprite.getData('healthIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    const boatOverlay = sprite.getData('boatOverlay') as Phaser.GameObjects.Text | undefined
    const startX = sprite.x
    const startY = sprite.y
    const targetPoint: CharacterPoint = npc.subZ !== undefined ? { x, y, z: npc.subZ } : { x, y }
    const visualState = characterVisualStateForAreaNpc(npc, targetPoint, { x: startX, y: startY })
    const distance = Phaser.Math.Distance.Between(startX, sprite.y, x, y)
    if (distance < 0.5) {
      sprite.setPosition(x, y)
      if (avatar) applyProceduralAvatarPose(avatar.container, visualState)
      if (nameLabel) nameLabel.setPosition(x, y - NPC_SPRITE_SIZE * 0.85)
      if (activityIcon)
        activityIcon.setPosition(x + NPC_SPRITE_SIZE * 0.55, y - NPC_SPRITE_SIZE * 0.55)
      if (healthIcon)
        healthIcon.setPosition(x - NPC_SPRITE_SIZE * 0.55, y - NPC_SPRITE_SIZE * 0.55)
      if (chatBubble) chatBubble.setPosition(x, y - NPC_SPRITE_SIZE * 1.6)
      if (boatOverlay) boatOverlay.setPosition(x, y - NPC_SPRITE_SIZE * 1.35)
      return
    }
    const tween = this.tweens.add({
      targets: { px: startX, py: startY },
      px: x,
      py: y,
      duration: NPC_MOVE_TWEEN_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (_t, t: { px: number; py: number }) => {
        sprite.setPosition(t.px, t.py)
        if (avatar) applyProceduralAvatarPose(avatar.container, { ...visualState, x: t.px, y: t.py })
        if (nameLabel) nameLabel.setPosition(t.px, t.py - NPC_SPRITE_SIZE * 0.85)
        if (activityIcon)
          activityIcon.setPosition(t.px + NPC_SPRITE_SIZE * 0.55, t.py - NPC_SPRITE_SIZE * 0.55)
        if (healthIcon)
          healthIcon.setPosition(t.px - NPC_SPRITE_SIZE * 0.55, t.py - NPC_SPRITE_SIZE * 0.55)
        if (chatBubble) chatBubble.setPosition(t.px, t.py - NPC_SPRITE_SIZE * 1.6)
        if (boatOverlay) boatOverlay.setPosition(t.px, t.py - NPC_SPRITE_SIZE * 1.35)
      },
      onComplete: () => {
        sprite.setPosition(x, y)
        if (avatar) applyProceduralAvatarPose(avatar.container, visualState)
        if (boatOverlay) boatOverlay.setPosition(x, y - NPC_SPRITE_SIZE * 1.35)
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
    const avatar = sprite.getData('avatar') as ProceduralAvatar | undefined
    if (avatar) {
      avatar.body.setFillStyle(color, 1)
      avatar.leftArm.setFillStyle(color, 1)
      avatar.rightArm.setFillStyle(color, 1)
      if (avatar.label) avatar.label.setColor(textColorForBg(color))
    }
  }

  private disposeNpcSprite(id: string, sprite: Phaser.Physics.Arcade.Sprite): void {
    const moveTween = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (moveTween) this.tweens.remove(moveTween)
    const idleTween = sprite.getData('idleTween') as Phaser.Tweens.Tween | undefined
    if (idleTween) this.tweens.remove(idleTween)
    const avatar = sprite.getData('avatar') as ProceduralAvatar | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const healthIcon = sprite.getData('healthIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    const boatOverlay = sprite.getData('boatOverlay') as Phaser.GameObjects.Text | undefined
    if (avatar) avatar.container.destroy(true)
    if (nameLabel) nameLabel.destroy()
    if (activityIcon) activityIcon.destroy()
    if (healthIcon) healthIcon.destroy()
    if (chatBubble) chatBubble.destroy()
    if (boatOverlay) boatOverlay.destroy()
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
        if (!this.controlsEnabled) {
          this.suppressNextPointerTarget = false
          return
        }
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
    if (nearestId !== this.nearbyBuildingId) {
      this.nearbyBuildingId = nearestId
      this.callbacks.onNearbyBuildingChange?.(nearestId)
    }
  }

  private drawExitHotspot(): void {
    const cell = this.pickExitCell()
    const x = cell.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
    const y = cell.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2
    this.exitPos = { x, y }

    const tileMark = this.add.rectangle(0, 0, AREA_TILE_SIZE - 6, AREA_TILE_SIZE - 6, 0xfff5b8, 0.08)
    tileMark.setStrokeStyle(1, 0xfff5b8, 0.4)
    const sign = this.add.rectangle(0, -4, AREA_TILE_SIZE * 0.82, AREA_TILE_SIZE * 0.55, 0x6b4a23, 0.94)
    sign.setStrokeStyle(2, 0xfff5b8, 0.9)
    const icon = this.add.text(-AREA_TILE_SIZE * 0.22, -5, '↩', {
      fontFamily:
        '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      fontSize: '16px',
      color: '#fff5b8',
      fontStyle: 'bold',
      stroke: '#0a0a0a',
      strokeThickness: 2
    })
    icon.setOrigin(0.5, 0.5)
    const label = this.add.text(AREA_TILE_SIZE * 0.15, -5, '出口', {
      fontFamily:
        '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      fontSize: '11px',
      color: '#fff5b8',
      fontStyle: 'bold'
    })
    label.setOrigin(0.5, 0.5)
    const pole = this.add.rectangle(0, AREA_TILE_SIZE * 0.18, 4, AREA_TILE_SIZE * 0.3, 0x3b2815, 0.95)

    this.exitHotspot = this.add.container(x, y, [tileMark, pole, sign, icon, label])
    this.exitHotspot.setDepth(46)
    this.exitHotspot.setSize(AREA_TILE_SIZE, AREA_TILE_SIZE)
    this.exitHotspot.setInteractive(
      new Phaser.Geom.Rectangle(
        -AREA_TILE_SIZE / 2,
        -AREA_TILE_SIZE / 2,
        AREA_TILE_SIZE,
        AREA_TILE_SIZE
      ),
      Phaser.Geom.Rectangle.Contains
    )
    this.exitHotspot.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation?.()
      this.suppressNextPointerTarget = true
      if (!this.controlsEnabled) {
        this.suppressNextPointerTarget = false
        return
      }
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y)
      if (d > EXIT_RADIUS) {
        this.pointerTarget = { x, y }
        this.suppressNextPointerTarget = false
        this.flashApproachHint('出口')
        return
      }
      this.callbacks.onExit?.()
    })
    this.exitHotspot.setData('sign', sign)
  }

  private pickExitCell(): { col: number; row: number } {
    const roadCells = AREA_DECORATIONS[this.tileId]?.roadCells ?? []
    const byEdge =
      roadCells.find((cell) => cell.col === 0) ??
      roadCells.find((cell) => cell.row === AREA_GRID_ROWS - 1) ??
      roadCells.find((cell) => cell.row === 0) ??
      roadCells.find((cell) => cell.col === AREA_GRID_COLS - 1)
    if (byEdge) return byEdge
    return { col: 0, row: Math.floor(AREA_GRID_ROWS / 2) }
  }

  private checkExitProximity(): void {
    if (!this.exitPos) return
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitPos.x, this.exitPos.y)
    this.nearExit = d <= EXIT_RADIUS
    const sign = this.exitHotspot?.getData('sign') as Phaser.GameObjects.Rectangle | undefined
    if (sign) {
      sign.setStrokeStyle(this.nearExit ? 3 : 2, this.nearExit ? 0xffb84d : 0xfff5b8, this.nearExit ? 1 : 0.9)
    }
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
      if (!this.controlsEnabled) return
      if (this.suppressNextPointerTarget) {
        this.suppressNextPointerTarget = false
        return
      }
      // Sprint 4 — reject pointer targets that land on open water; no
      // quiet drift onto unwalkable cells.
      if (!this.isAreaWalkable(pointer.worldX, pointer.worldY)) return
      this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.controlsEnabled) return
      if (pointer.isDown) {
        if (!this.isAreaWalkable(pointer.worldX, pointer.worldY)) return
        this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
      }
    })
  }

  private tryInteract(): void {
    if (!this.controlsEnabled) return
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
      return
    }
    if (this.nearExit) {
      this.callbacks.onExit?.()
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
    if (!this.controlsEnabled) {
      this.player.setVelocity(0, 0)
      return
    }
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

    // Sprint 4 — sub-tile terrain walkability gate. Look ahead one
    // half-tile and zero each axis if the projected sub-cell falls on
    // open water. Drops the pointer target as well so the player
    // doesn't slide into a wet cell on autopilot.
    if (vx !== 0 || vy !== 0) {
      const lookahead = AREA_TILE_SIZE * 0.5
      const probeX = this.player.x + Math.sign(vx) * lookahead
      const probeY = this.player.y + Math.sign(vy) * lookahead
      if (vx !== 0 && !this.isAreaWalkable(probeX, this.player.y)) vx = 0
      if (vy !== 0 && !this.isAreaWalkable(this.player.x, probeY)) vy = 0
      if (vx === 0 && vy === 0) this.pointerTarget = null
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1
      this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED)
    } else {
      this.player.setVelocity(0, 0)
    }
  }

  /**
   * Sprint 4 — walkability gate. Returns false only when the pixel
   * coords map to a sub-cell whose terrain is `open_water` (per the
   * district's hand-authored mask). Land districts have no mask and
   * always return true.
   */
  private isAreaWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0) return false
    if (x >= AREA_CANVAS_WIDTH || y >= AREA_CANVAS_HEIGHT) return false
    const col = Math.floor(x / AREA_TILE_SIZE)
    const row = Math.floor(y / AREA_TILE_SIZE)
    return isWalkableTerrain(terrainAt(this.tileId, col, row))
  }

  /**
   * Sprint 4 — boat overlay for NPCs whose server-given sub-cell lands
   * on open water. We do not snap their sprite to land (that would
   * invent positional state); instead we fade the sprite slightly and
   * attach a `⛵` glyph above the name label so the player reads it
   * as "fishing from a small boat".
   */
  private applyOpenWaterHint(
    sprite: Phaser.Physics.Arcade.Sprite,
    npc: AreaMapNpc,
  ): void {
    const cellTerrain = terrainAt(this.tileId, npc.subCol ?? 0, npc.subRow ?? 0)
    const onOpenWater = cellTerrain === 'open_water'
    const avatar = sprite.getData('avatar') as ProceduralAvatar | undefined
    const existingOverlay = sprite.getData('boatOverlay') as Phaser.GameObjects.Text | undefined
    const baseAlpha = typeof npc.health === 'number' && npc.health < 30 ? 0.78 : 1
    if (onOpenWater) {
      avatar?.container.setAlpha(Math.min(baseAlpha, 0.85))
      if (!existingOverlay) {
        const overlay = this.add.text(sprite.x, sprite.y - NPC_SPRITE_SIZE * 1.35, '⛵', {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2,
        })
        overlay.setOrigin(0.5, 1)
        overlay.setDepth(73)
        sprite.setData('boatOverlay', overlay)
      } else {
        existingOverlay.setPosition(sprite.x, sprite.y - NPC_SPRITE_SIZE * 1.35)
        existingOverlay.setVisible(true)
      }
    } else {
      avatar?.container.setAlpha(baseAlpha)
      if (existingOverlay) {
        existingOverlay.destroy()
        sprite.setData('boatOverlay', undefined)
      }
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
      text = npc ? `${this.hudStrings.interact}: ${npc.name}` : this.hudStrings.interact
    } else if (this.nearbyBuildingId) {
      const b = this.buildings.find((bb) => bb.id === this.nearbyBuildingId)
      const enterLabel = this.hudStrings.enterBuilding ?? '進入'
      text = b ? `${enterLabel}：${b.nameZh}` : enterLabel
    } else if (this.nearExit) {
      text = this.hudStrings.exit ?? '回上一層'
    }

    // 如果 flashTooFarHint 正在顯示，這 1.2s 內不蓋掉文字
    const lockedUntil = (this.interactPrompt.getData('lockedUntil') as number | undefined) ?? 0
    if (lockedUntil > this.time.now) {
      // 仍在閃示警告中：keep prompt visible at player head position
      const lockedX = this.interactPrompt.getData('lockedX') as number | undefined
      const lockedY = this.interactPrompt.getData('lockedY') as number | undefined
      this.interactPrompt.setPosition(
        lockedX ?? this.player.x,
        lockedY ?? this.player.y - PLAYER_SPRITE_SIZE * 1.4
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
    const pos = { x: Math.round(this.player.x), y: Math.round(this.player.y), z: 0 }
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
