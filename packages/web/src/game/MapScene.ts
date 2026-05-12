import Phaser from 'phaser'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DISTRICTS,
  DISTRICT_GRID,
  DISTRICT_IDS,
  GRID_COLS,
  GRID_ROWS,
  NPC_BADGE_COLOR,
  NPC_BADGE_TEXT,
  PLAYER_COLOR,
  PLAYER_OUTLINE,
  TILE_SIZE,
  districtAtPixel,
  isDistrict,
  type DistrictDef,
  type DistrictId
} from './districts'
import { CITY_DECORATIONS } from './decorations'
import { activityGlyphFor, textColorForBg } from './npcVisuals'
import type { NpcActivity } from '../state/types'

export interface MapNpc {
  id: string
  name: string
  shortName: string
  /** 對應 fixtureMap.tiles[].id */
  districtId: DistrictId
  /** 24-bit RGB sprite 主色（後端 v0.12+ 會帶；缺值用 NPC_BADGE_COLOR fallback） */
  color?: number
  /** 後端 activity → 上方 emoji 圖示（idle/move 不顯示） */
  activity?: NpcActivity
  /** 後端 sub-tile (0..14, 0..9)；用來在 district 內微移，讓世界地圖看得到位置變動 */
  subCol?: number
  subRow?: number
  /** v0.14.0：mood / health 給跨區移動中的 NPC 顯示視覺暗示用 */
  mood?: number
  health?: number
  /** v0.15.12：跨區移動時的 worldline segment，Hub 用它畫在路上而不是區域內。 */
  travelRoute?: {
    fromDistrictId: DistrictId
    toDistrictId: DistrictId
    targetDistrictId: DistrictId
  }
  /** Short deterministic task text from the server projection. */
  intentLine?: string
}

/**
 * v0.14.0：每 district 一份的 area state overlay。MapScene 用來：
 * - 治安低 (safety < 40) → 加暗紅色 30% alpha 矩形覆蓋
 * - 經濟好 (economy > 70) → 加金色 20% alpha 矩形覆蓋
 * - dominantFaction 不為 null → 加對應派系外框（紫/金/綠/灰）
 *
 * districtId 必須對應 DistrictId；不認識的會被忽略。
 */
export type FactionLeanId = 'tide_hunters' | 'free_runners' | 'guild' | 'civilian'

export interface MapAreaOverlay {
  districtId: DistrictId
  safety: number
  economy: number
  food: number
  dominantFaction: FactionLeanId | null
}

export interface MapPlayer {
  id: number
  displayName: string
  shortName: string
  x?: number | null
  y?: number | null
}

export interface MapSceneCallbacks {
  onAreaEnter: (districtId: DistrictId) => void
  onNpcInteract: (npcId: string) => void
}

export interface MapSceneInit {
  callbacks: MapSceneCallbacks
  npcs: MapNpc[]
  players?: MapPlayer[]
  playerName?: string | null
  locale: 'zh' | 'en'
  /** 「Press E / 點我互動」一類的提示文字 (i18n 過後的字串)。 */
  hudStrings: {
    interact: string
    enterArea: string
  }
  /** 上次離開時的玩家座標，用來在重新進場景時還原位置。 */
  initialPosition?: { x: number; y: number } | null
  /** v0.14.0：每 district 的派系 / 治安 / 經濟 overlay。 */
  areaOverlays?: MapAreaOverlay[]
  /** District ids returned by `/api/map`; expansion districts are locked until present. */
  activeDistrictIds?: DistrictId[]
  /** Guests can browse the world, but player movement/actions require login. */
  controlsEnabled?: boolean
}

const PLAYER_SPEED = 180 // px/s
const INTERACT_RADIUS = TILE_SIZE * 1.6
const NPC_SPRITE_SIZE = 26
const PLAYER_SPRITE_SIZE = 22
/** NPC tween 時長：後端 5s/tick，前端 4.5s 平滑 → 4.5s 抵達下個 server 推的位置 */
const NPC_MOVE_TWEEN_MS = 4500
const PEER_MOVE_TWEEN_MS = 1800
const SPRITE_FADE_MS = 450
/** Sub-tile 子格 → district 內的相對偏移半徑（避免擠在 anchor 上） */
const NPC_SUBTILE_RADIUS = TILE_SIZE * 0.9

/** 派系外框色：v0.14.0 area state overlay 用。 */
function factionFrameColor(faction: FactionLeanId): number {
  switch (faction) {
    case 'tide_hunters':
      return 0xb55ee0 // 紫
    case 'guild':
      return 0xf6c560 // 金
    case 'free_runners':
      return 0x4cc370 // 綠
    case 'civilian':
    default:
      return 0xc6c6c6 // 灰
  }
}

/**
 * 潮鳴市 Phaser 場景。Prototype 用色塊 + 幾何圖形，先把流程跑通。
 *
 * - 20x15 格子地圖 (40px tile)，八個街區 + 街道
 * - 玩家方向鍵 / WASD / pointer 拖曳移動
 * - 走進街區邊界會 emit `area:enter`
 * - 靠近 NPC sprite 出現互動提示，按 E / Space / 點 NPC sprite 觸發 emit `npc:interact`
 */
export class MapScene extends Phaser.Scene {
  static readonly KEY = 'MapScene'

  private callbacks!: MapSceneCallbacks
  private npcs: MapNpc[] = []
  private players: MapPlayer[] = []
  private playerName: string | null = null
  private locale: 'zh' | 'en' = 'zh'
  private hudStrings: MapSceneInit['hudStrings'] = { interact: '', enterArea: '' }
  private controlsEnabled = true
  private activeDistrictIds = new Set<DistrictId>(DISTRICT_IDS)

  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null

  private currentDistrict: DistrictId = 't_road'
  private nearbyNpcId: string | null = null
  /** 玩家剛點到 NPC sprite 的時候設成 true，下一個 scene-level pointerdown
   *  就忽略掉，避免點 NPC 後玩家還走過去。 */
  private suppressNextPointerTarget = false

  private interactPrompt!: Phaser.GameObjects.Container
  private districtBanner!: Phaser.GameObjects.Container
  private districtBannerText!: Phaser.GameObjects.Text
  private districtBannerTimer: number = 0

  private npcSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map()
  private peerSprites: Map<number, Phaser.GameObjects.Container> = new Map()
  private playerNameLabel: Phaser.GameObjects.Text | null = null
  private envTweens: Phaser.Tweens.Tween[] = []
  private envSprites: Phaser.GameObjects.Text[] = []

  private initialPosition: { x: number; y: number } | null = null

  constructor() {
    super({ key: MapScene.KEY })
  }

  init(data: MapSceneInit): void {
    this.callbacks = data.callbacks
    this.npcs = data.npcs
    this.players = data.players ?? []
    this.playerName = data.playerName ?? null
    this.locale = data.locale
    this.hudStrings = data.hudStrings
    this.initialPosition = data.initialPosition ?? null
    this.controlsEnabled = data.controlsEnabled ?? true
    this.activeDistrictIds = new Set(data.activeDistrictIds ?? DISTRICT_IDS)
    if (data.areaOverlays) this.areaOverlays = data.areaOverlays
  }

  private areaOverlays: MapAreaOverlay[] = []
  private overlayGraphics: Phaser.GameObjects.Graphics | null = null

  /** 給外部 (PhaserGame) 在 unmount 前讀出玩家當前座標，以便寫入 localStorage。 */
  getPlayerPosition(): { x: number; y: number } | null {
    if (!this.player) return null
    return { x: this.player.x, y: this.player.y }
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12141a)

    this.drawTiles()
    this.drawDecorations()
    this.refreshAreaOverlay()
    this.drawDistrictLabels()
    this.spawnPlayer()
    this.refreshPeerSprites()
    this.spawnNpcs()
    this.setupInput()
    this.setupHud()

    this.physics.world.setBounds(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    this.player.setCollideWorldBounds(true)

    // 如果玩家從還原的座標一開始就站在某街區裡，立刻同步給 React 端，
    // 否則「進入 XXX →」按鈕得等到玩家踏出街區再走回來才會出現。
    // 不放 banner — banner 是「剛走進」的通知，重整頁面時不該再演一次。
    if (this.controlsEnabled && this.isActiveDistrict(this.currentDistrict)) {
      this.callbacks.onAreaEnter(this.currentDistrict)
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.disposeEnvAnimations())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.disposeEnvAnimations())
  }

  /**
   * 公開的 API，讓外面 (React 端) 可以更新 NPC 列表 / locale，不必 re-create
   * 整個 game 物件。
   */
  applyExternalUpdate(payload: {
    npcs?: MapNpc[]
    players?: MapPlayer[]
    playerName?: string | null
    locale?: 'zh' | 'en'
    hudStrings?: MapSceneInit['hudStrings']
    areaOverlays?: MapAreaOverlay[]
    activeDistrictIds?: DistrictId[]
    controlsEnabled?: boolean
  }): void {
    if (payload.controlsEnabled !== undefined) {
      const wasControlsEnabled = this.controlsEnabled
      this.controlsEnabled = payload.controlsEnabled
      if (!this.controlsEnabled) {
        this.pointerTarget = null
        this.player?.setVelocity(0, 0)
        this.interactPrompt?.setVisible(false)
      } else if (!wasControlsEnabled && this.isActiveDistrict(this.currentDistrict)) {
        this.callbacks.onAreaEnter(this.currentDistrict)
      }
    }
    if (payload.hudStrings) this.hudStrings = payload.hudStrings
    if (payload.players) {
      this.players = payload.players
      this.refreshPeerSprites()
    }
    if (payload.playerName !== undefined) {
      this.playerName = payload.playerName
      this.refreshPlayerNameLabel()
    }
    if (payload.locale) this.locale = payload.locale
    if (payload.npcs) {
      this.npcs = payload.npcs
      this.refreshNpcSprites()
    } else if (payload.locale) {
      // 只有 locale 變了，刷新 sprite 上的文字
      this.refreshNpcSprites()
    }
    if (payload.areaOverlays) {
      this.areaOverlays = payload.areaOverlays
      this.refreshAreaOverlay()
    }
    if (payload.activeDistrictIds) this.activeDistrictIds = new Set(payload.activeDistrictIds)
    this.redrawDistrictLabels()
  }

  update(_time: number, delta: number): void {
    if (!this.controlsEnabled) {
      this.pointerTarget = null
      this.player?.setVelocity(0, 0)
      this.syncPlayerNameLabel()
      return
    }
    this.handleMovement(delta)
    this.syncPlayerNameLabel()
    this.checkDistrictTransition()
    this.checkNpcProximity()
    this.tickDistrictBanner(delta)
  }

  // ---------- 地圖渲染 ----------

  private drawTiles(): void {
    const g = this.add.graphics()
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const id = DISTRICT_GRID[row]![col]!
        const def = DISTRICTS[id]
        const x = col * TILE_SIZE
        const y = row * TILE_SIZE
        const active = id === 't_road' || this.isActiveDistrict(id)
        // 棋盤格紋路：偶數格用主色，奇數格略深，做出像素風的小變化
        const checker = (col + row) % 2 === 0
        g.fillStyle(active ? (checker ? def.color : def.shade) : 0x1f2429, 1)
        g.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        // 街區內側細邊框 (讓街區整體看起來像一個方塊)
        g.lineStyle(1, active ? def.border : 0x3b4248, active ? 0.35 : 0.55)
        g.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1)
        if (!active && (col + row) % 3 === 0) {
          g.fillStyle(0xf6c560, 0.2)
          g.fillRect(x + 6, y + TILE_SIZE / 2 - 1, TILE_SIZE - 12, 2)
        }
        // 街道再加上中央車道虛線，讓「可走的路」一眼就分辨出來
        if (id === 't_road') {
          g.fillStyle(0xfff5b8, 0.55)
          g.fillRect(x + TILE_SIZE / 2 - 1, y + TILE_SIZE / 2 - 4, 2, 8)
        }
      }
    }
    // 街區外框 — 黃白色高亮，明顯區隔不同街區
    this.drawDistrictBoundaries(g)
  }

  /**
   * v0.14.0：依 areaOverlays 把每個 district 加上：
   * - 治安低 (safety < 40) → 暗紅 30% 矩形覆蓋（讓玩家看到「治安差」）
   * - 經濟好 (economy > 70) → 金色 20% 矩形覆蓋（讓玩家看到「金光區」）
   * - dominantFaction → 派系色外框（紫=潮獵會 / 金=公會 / 綠=自由潮感者 / 灰=平民）
   *
   * 每次 overlay 變動全部重畫；district 數量只有 8 + road，工作量很小。
   */
  private refreshAreaOverlay(): void {
    if (!this.overlayGraphics) {
      this.overlayGraphics = this.add.graphics()
      this.overlayGraphics.setDepth(20)
    }
    const g = this.overlayGraphics
    g.clear()
    if (this.areaOverlays.length === 0) return

    // 預先把 districtId → 一份 overlay，方便查找。
    const byId = new Map<DistrictId, MapAreaOverlay>()
    for (const o of this.areaOverlays) byId.set(o.districtId, o)

    // 對每個 district 算出涵蓋矩形（minCol/Row → maxCol/Row of cells matching id）
    type DistrictBox = { id: DistrictId; minCol: number; minRow: number; maxCol: number; maxRow: number }
    const boxes = new Map<DistrictId, DistrictBox>()
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const id = DISTRICT_GRID[row]![col]!
        if (!this.isActiveDistrict(id)) continue
        const existing = boxes.get(id)
        if (!existing) {
          boxes.set(id, { id, minCol: col, minRow: row, maxCol: col, maxRow: row })
        } else {
          if (col < existing.minCol) existing.minCol = col
          if (col > existing.maxCol) existing.maxCol = col
          if (row < existing.minRow) existing.minRow = row
          if (row > existing.maxRow) existing.maxRow = row
        }
      }
    }

    for (const box of boxes.values()) {
      const overlay = byId.get(box.id)
      if (!overlay) continue
      const x = box.minCol * TILE_SIZE
      const y = box.minRow * TILE_SIZE
      const w = (box.maxCol - box.minCol + 1) * TILE_SIZE
      const h = (box.maxRow - box.minRow + 1) * TILE_SIZE

      // Safety < 40 → 暗紅蓋層
      if (overlay.safety < 40) {
        const intensity = Math.max(0, Math.min(1, (40 - overlay.safety) / 40))
        g.fillStyle(0x8a2030, 0.18 + intensity * 0.22)
        g.fillRect(x, y, w, h)
      }
      // Economy > 70 → 金色蓋層
      if (overlay.economy > 70) {
        const intensity = Math.max(0, Math.min(1, (overlay.economy - 70) / 30))
        g.fillStyle(0xf6c560, 0.1 + intensity * 0.12)
        g.fillRect(x, y, w, h)
      }
      // Dominant faction → 外框色
      if (overlay.dominantFaction) {
        const factionColor = factionFrameColor(overlay.dominantFaction)
        g.lineStyle(4, factionColor, 0.9)
        g.strokeRect(x + 2, y + 2, w - 4, h - 4)
      }
    }
  }

  /**
   * 在街區色塊上灑點建築 / 樹 / 地標 emoji，避免地圖看起來只是一堆色塊。
   * 每個街區的位置由 decorations.ts deterministically 配置好，跨 reload
   * 一致。glyph 用 Text object 直接畫，不需要美術資產。
   */
  private drawDecorations(): void {
    for (const id of DISTRICT_IDS) {
      if (!this.isActiveDistrict(id)) continue
      const list = CITY_DECORATIONS[id]
      if (!list) continue
      for (const deco of list) {
        const text = this.add.text(
          deco.col * TILE_SIZE + TILE_SIZE / 2,
          deco.row * TILE_SIZE + TILE_SIZE / 2,
          deco.glyph,
          {
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
            fontSize: `${deco.size}px`,
            color: '#ffffff',
            stroke: '#0a0a0a',
            strokeThickness: 2
          }
        )
        text.setOrigin(0.5, 0.5)
        text.setDepth(40)
        this.attachEnvAnimation(text, deco.glyph, deco.col, deco.row)
      }
    }
  }

  private attachEnvAnimation(
    sprite: Phaser.GameObjects.Text,
    glyph: string,
    col: number,
    row: number
  ): void {
    this.envSprites.push(sprite)
    const seed = ((col + 1) * 73856093) ^ ((row + 1) * 19349663) ^ glyph.charCodeAt(0)
    const delay = Math.abs(seed) % 900
    const duration = 1400 + (Math.abs(seed) % 700)

    if (glyph === '🌲' || glyph === '🌳' || glyph === '🌵') {
      this.envTweens.push(
        this.tweens.add({
          targets: sprite,
          angle: { from: -3, to: 3 },
          duration,
          delay,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      )
      return
    }
    if (glyph === '⚓' || glyph === '⛵' || glyph === '🛟' || glyph === '🐚') {
      this.envTweens.push(
        this.tweens.add({
          targets: sprite,
          y: sprite.y + 3,
          duration,
          delay,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      )
      return
    }
    if (glyph === '✦' || glyph === '✧' || glyph === '◈' || glyph === '❖') {
      this.envTweens.push(
        this.tweens.add({
          targets: sprite,
          scale: { from: 0.92, to: 1.12 },
          alpha: { from: 0.65, to: 1 },
          duration,
          delay,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      )
      return
    }
    if (glyph === '🪨' || glyph === '🏚' || glyph === '⛰') {
      this.envTweens.push(
        this.tweens.add({
          targets: sprite,
          x: sprite.x + 1.5,
          duration: 120 + (Math.abs(seed) % 80),
          delay: 1800 + delay,
          yoyo: true,
          repeat: -1,
          repeatDelay: 2200 + (Math.abs(seed) % 900),
          ease: 'Sine.easeInOut'
        })
      )
      return
    }
    this.envTweens.push(
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.78, to: 1 },
        duration,
        delay,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    )
  }

  private disposeEnvAnimations(): void {
    for (const tween of this.envTweens) tween.stop()
    this.envTweens = []
    for (const sprite of this.envSprites) {
      if (!sprite.active) continue
      this.tweens.killTweensOf(sprite)
    }
    this.envSprites = []
  }

  private drawDistrictBoundaries(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(3, 0xfff5b8, 0.85)
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const here = DISTRICT_GRID[row]![col]!
        if (!this.isActiveDistrict(here)) continue
        const x = col * TILE_SIZE
        const y = row * TILE_SIZE
        // 跟相鄰格子比較：如果鄰居是不同街區 (或地圖外)，畫一條邊
        const neighbours: Array<{ dx: number; dy: number; line: [number, number, number, number] }> = [
          { dx: 0, dy: -1, line: [x, y, x + TILE_SIZE, y] },                       // 上
          { dx: 0, dy: 1, line: [x, y + TILE_SIZE, x + TILE_SIZE, y + TILE_SIZE] }, // 下
          { dx: -1, dy: 0, line: [x, y, x, y + TILE_SIZE] },                       // 左
          { dx: 1, dy: 0, line: [x + TILE_SIZE, y, x + TILE_SIZE, y + TILE_SIZE] }  // 右
        ]
        for (const n of neighbours) {
          const ncol = col + n.dx
          const nrow = row + n.dy
          const there =
            ncol < 0 || ncol >= GRID_COLS || nrow < 0 || nrow >= GRID_ROWS
              ? null
              : DISTRICT_GRID[nrow]![ncol]!
          if (there !== here) {
            g.beginPath()
            g.moveTo(n.line[0], n.line[1])
            g.lineTo(n.line[2], n.line[3])
            g.strokePath()
          }
        }
      }
    }
  }

  private districtLabels: Phaser.GameObjects.Text[] = []

  private drawDistrictLabels(): void {
    for (const id of DISTRICT_IDS) {
      const def = DISTRICTS[id]
      const text = this.add.text(
        def.anchor.col * TILE_SIZE + TILE_SIZE / 2,
        def.anchor.row * TILE_SIZE + TILE_SIZE / 2 - TILE_SIZE * 1.2,
        this.labelFor(def),
        {
          fontFamily:
            'Inter, "Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
          fontSize: '14px',
          color: '#fff5b8',
          stroke: '#0a0a0a',
          strokeThickness: 4,
          align: 'center'
        }
      )
      text.setOrigin(0.5, 0.5)
      text.setDepth(50)
      this.districtLabels.push(text)
    }
  }

  private redrawDistrictLabels(): void {
    let i = 0
    for (const id of DISTRICT_IDS) {
      const t = this.districtLabels[i]
      if (!t) continue
      t.setText(this.labelFor(DISTRICTS[id]))
      i += 1
    }
  }

  private labelFor(def: DistrictDef): string {
    if (!this.isActiveDistrict(def.id)) return this.locale === 'zh' ? '施工中' : 'Under construction'
    return this.locale === 'zh' ? def.nameZh : def.nameEn
  }

  private isActiveDistrict(id: DistrictId): boolean {
    return isDistrict(id) && this.activeDistrictIds.has(id)
  }

  // ---------- 玩家 / NPC sprite ----------

  private spawnPlayer(): void {
    const tex = this.makeSquareTexture('player', PLAYER_SPRITE_SIZE, PLAYER_COLOR, PLAYER_OUTLINE, 2)
    // 預設出生點：中央地脈層附近的街道。如果有上次離開時的座標，
    // 就把玩家還原到那邊；座標會被 clamp 到地圖內以避免無效值。
    const defaultX = CANVAS_WIDTH / 2
    const defaultY = CANVAS_HEIGHT / 2 - TILE_SIZE
    const saved = this.initialPosition
    const startX = saved
      ? Math.min(Math.max(saved.x, 0), CANVAS_WIDTH)
      : defaultX
    const startY = saved
      ? Math.min(Math.max(saved.y, 0), CANVAS_HEIGHT)
      : defaultY
    this.player = this.physics.add.sprite(startX, startY, tex)
    this.player.setDepth(80)
    this.player.setCollideWorldBounds(true)
    this.refreshPlayerNameLabel()
    // 觀察玩家進入起始地塊
    this.currentDistrict = districtAtPixel(this.player.x, this.player.y)
  }

  private refreshPlayerNameLabel(): void {
    if (!this.player) return
    const label = this.playerName?.trim()
    if (!label) {
      this.playerNameLabel?.destroy()
      this.playerNameLabel = null
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
    this.syncPlayerNameLabel()
  }

  private syncPlayerNameLabel(): void {
    if (!this.player || !this.playerNameLabel) return
    this.playerNameLabel.setPosition(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.25)
  }

  private refreshPeerSprites(): void {
    const seen = new Set<number>()
    for (const player of this.players) {
      seen.add(player.id)
      const target = this.peerTarget(player)
      const existing = this.peerSprites.get(player.id)
      if (existing) {
        this.tweenPeerTo(existing, target.x, target.y)
        const label = existing.getData('label') as Phaser.GameObjects.Text | undefined
        const badge = existing.getData('badge') as Phaser.GameObjects.Text | undefined
        if (label && label.text !== player.displayName) label.setText(player.displayName)
        if (badge && badge.text !== player.shortName) badge.setText(player.shortName)
        continue
      }
      const body = this.add.rectangle(0, 0, PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE, 0x9ee0c7, 1)
      body.setStrokeStyle(2, 0x1c1300, 1)
      const badge = this.add.text(0, 0, player.shortName, {
        fontFamily:
          'Inter, "Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '13px',
        color: '#103226',
        fontStyle: 'bold'
      })
      badge.setOrigin(0.5, 0.5)
      const label = this.add.text(0, -PLAYER_SPRITE_SIZE * 0.85, player.displayName, {
        fontFamily:
          'Inter, "Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: '#d9fff0',
        stroke: '#0a0a0a',
        strokeThickness: 4
      })
      label.setOrigin(0.5, 1)
      const container = this.add.container(target.x, target.y, [body, badge, label])
      container.setDepth(78)
      container.setAlpha(0)
      container.setData('badge', badge)
      container.setData('label', label)
      this.peerSprites.set(player.id, container)
      this.tweens.add({ targets: container, alpha: 1, duration: SPRITE_FADE_MS, ease: 'Sine.easeOut' })
    }
    for (const [id, sprite] of this.peerSprites) {
      if (!seen.has(id)) {
        const tween = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
        if (tween) this.tweens.remove(tween)
        this.peerSprites.delete(id)
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: SPRITE_FADE_MS,
          ease: 'Sine.easeIn',
          onComplete: () => sprite.destroy(true)
        })
      }
    }
  }

  private tweenPeerTo(container: Phaser.GameObjects.Container, x: number, y: number): void {
    const prev = container.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (prev) this.tweens.remove(prev)
    const distance = Math.hypot(x - container.x, y - container.y)
    if (distance < 0.5) {
      container.setPosition(x, y)
      return
    }
    const tween = this.tweens.add({
      targets: container,
      x,
      y,
      duration: PEER_MOVE_TWEEN_MS,
      ease: 'Sine.easeInOut'
    })
    container.setData('moveTween', tween)
  }

  private peerTarget(player: MapPlayer): { x: number; y: number } {
    if (typeof player.x === 'number' && typeof player.y === 'number') {
      return {
        x: Math.min(Math.max(player.x, PLAYER_SPRITE_SIZE), CANVAS_WIDTH - PLAYER_SPRITE_SIZE),
        y: Math.min(Math.max(player.y, PLAYER_SPRITE_SIZE), CANVAS_HEIGHT - PLAYER_SPRITE_SIZE)
      }
    }
    return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
  }

  private spawnNpcs(): void {
    this.refreshNpcSprites()
  }

  /**
   * 把後端推的 NPC list sync 到場景。
   * - 已存在的 NPC：tween 從目前位置 → 新位置（依 districtId + sub-tile 計算）
   * - 新 NPC：直接落在目標位置，建立 sprite + label + activity emoji
   * - 不再 destroy+recreate；切換 district 時看得到 sprite 平滑滑過去，
   *   也讓 NPC 在同 district 內因 sub-tile 變動微移（vs. v0.12.1 的釘在 anchor）
   */
  private refreshNpcSprites(): void {
    const seen = new Set<string>()
    // 同 districtId 多人時依 npcId hash 排成 ring offset，避免重疊。Hash
    // 來源是 npcId，不是陣列順序 → 跨 poll 穩定，不會因為陣列重排而抖
    const seqByDistrict = new Map<DistrictId, number>()

    for (const npc of this.npcs) {
      const def = DISTRICTS[npc.districtId]
      if (!def) continue
      seen.add(npc.id)
      const seq = seqByDistrict.get(npc.districtId) ?? 0
      seqByDistrict.set(npc.districtId, seq + 1)

      const target = this.computeNpcTarget(npc, def, seq)
      const fillColor = npc.color ?? NPC_BADGE_COLOR
      const badgeColor = npc.color === undefined ? NPC_BADGE_TEXT : textColorForBg(fillColor)

      const existing = this.npcSprites.get(npc.id)
      if (existing) {
        // 字色 / 顏色變更：同 npcId 切 faction 也要重貼 texture
        const currentColor = existing.getData('npcColor') as number | undefined
        if (currentColor !== fillColor) {
          const tex = this.npcTextureKey(npc.id, fillColor)
          this.makeSquareTexture(tex, NPC_SPRITE_SIZE, fillColor, 0x1c1300, 2)
          existing.setTexture(tex)
          existing.setData('npcColor', fillColor)
          const badge = existing.getData('badge') as Phaser.GameObjects.Text | undefined
          if (badge) badge.setColor(badgeColor)
        }
        const nameLabel = existing.getData('nameLabel') as Phaser.GameObjects.Text | undefined
        if (nameLabel && nameLabel.text !== npc.name) nameLabel.setText(npc.name)
        this.attachNpcIdleAnimation(existing, npc.id)
        // 活動 emoji 同步
        const iconGlyph = activityGlyphFor(npc.activity)
        const iconText = existing.getData('activityIcon') as Phaser.GameObjects.Text | undefined
        if (iconText) {
          if (iconGlyph) {
            iconText.setText(iconGlyph)
            iconText.setVisible(true)
          } else {
            iconText.setVisible(false)
          }
        }
        this.tweenNpcTo(existing, target.x, target.y)
        continue
      }

      // 新增 sprite — 直接落在目標位置
      const tex = this.npcTextureKey(npc.id, fillColor)
      this.makeSquareTexture(tex, NPC_SPRITE_SIZE, fillColor, 0x1c1300, 2)
      const sprite = this.physics.add.sprite(target.x, target.y, tex)
      sprite.setDepth(70)
      sprite.setAlpha(0)
      sprite.setData('npcId', npc.id)
      sprite.setData('npcColor', fillColor)
      sprite.setInteractive({ useHandCursor: true })
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        if (!this.controlsEnabled) {
          this.suppressNextPointerTarget = false
          return
        }
        this.callbacks.onNpcInteract(npc.id)
      })

      const badge = this.add.text(target.x, target.y, npc.shortName, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '14px',
        color: badgeColor,
        fontStyle: 'bold'
      })
      badge.setOrigin(0.5, 0.5)
      badge.setDepth(71)
      badge.setAlpha(0)
      sprite.setData('badge', badge)

      const nameLabel = this.add.text(target.x, target.y - NPC_SPRITE_SIZE * 0.85, npc.name, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 3
      })
      nameLabel.setOrigin(0.5, 1)
      nameLabel.setDepth(72)
      nameLabel.setAlpha(0)
      sprite.setData('nameLabel', nameLabel)

      const iconGlyph = activityGlyphFor(npc.activity)
      const activityIconText = this.add.text(
        target.x + NPC_SPRITE_SIZE * 0.55,
        target.y - NPC_SPRITE_SIZE * 0.55,
        iconGlyph,
        {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
          fontSize: '13px',
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      activityIconText.setOrigin(0.5, 0.5)
      activityIconText.setDepth(73)
      activityIconText.setVisible(iconGlyph.length > 0)
      activityIconText.setAlpha(0)
      sprite.setData('activityIcon', activityIconText)

      const chatBubble = this.add.text(target.x, target.y - NPC_SPRITE_SIZE * 1.6, '💬', {
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#0a0a0a',
        strokeThickness: 2
      })
      chatBubble.setOrigin(0.5, 1)
      chatBubble.setDepth(73)
      chatBubble.setVisible(false)
      chatBubble.setAlpha(0)
      chatBubble.setInteractive({ useHandCursor: true })
      chatBubble.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.suppressNextPointerTarget = true
        if (!this.controlsEnabled) {
          this.suppressNextPointerTarget = false
          return
        }
        this.callbacks.onNpcInteract(npc.id)
      })
      sprite.setData('chatBubble', chatBubble)
      this.attachNpcIdleAnimation(sprite, npc.id)
      this.fadeNpcSprite(sprite, 1)

      this.npcSprites.set(npc.id, sprite)
    }

    // 清掉這次沒看到的 sprites（NPC 不再出現在世界地圖上 — 例如進了建築物）
    for (const [id, sprite] of this.npcSprites) {
      if (seen.has(id)) continue
      this.disposeNpcSprite(id, sprite)
    }
  }

  private attachNpcIdleAnimation(sprite: Phaser.Physics.Arcade.Sprite, npcId: string): void {
    const existing = sprite.getData('idleTween') as Phaser.Tweens.Tween | undefined
    if (existing) return
    let h = 5381
    for (const ch of npcId) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
    const tween = this.tweens.add({
      targets: sprite,
      scaleY: { from: 0.93, to: 1.06 },
      duration: 1200 + (h % 400),
      delay: h % 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })
    sprite.setData('idleTween', tween)
  }

  /** 計算 NPC 在世界地圖上應該出現的座標：district anchor + sub-tile 微偏移 */
  private computeNpcTarget(
    npc: MapNpc,
    def: DistrictDef,
    seq: number
  ): { x: number; y: number } {
    if (npc.travelRoute) {
      const from = DISTRICTS[npc.travelRoute.fromDistrictId]
      const to = DISTRICTS[npc.travelRoute.toDistrictId]
      if (from && to) {
        const a = this.districtCenter(from)
        const b = this.districtCenter(to)
        return { x: a.x + (b.x - a.x) * 0.5, y: a.y + (b.y - a.y) * 0.5 }
      }
    }
    // 基準：district anchor 中心
    const center = this.districtCenter(def)
    const baseX = center.x
    const baseY = center.y
    // 後端 sub-tile (0..14, 0..9)：把它對應到以 anchor 為中心的小範圍偏移，
    // 用百分比把 0..14 → -1..+1，乘上半徑後加到 anchor 上。這樣同 district
    // 的 NPC 不再擠在一點，且 sub-tile 真的變了 → 世界地圖上就看得到動。
    if (typeof npc.subCol === 'number' && typeof npc.subRow === 'number') {
      const cx = (npc.subCol / 14) * 2 - 1 // -1..+1
      const cy = (npc.subRow / 9) * 2 - 1
      return {
        x: baseX + cx * NPC_SUBTILE_RADIUS,
        y: baseY + cy * NPC_SUBTILE_RADIUS
      }
    }
    // Fallback：缺 sub-tile 時用 hash 60° ring 排（v0.12.1 的舊行為）
    const ringAngle = (seq * 60 * Math.PI) / 180
    const ringR = seq === 0 ? 0 : 12
    return {
      x: baseX + Math.cos(ringAngle) * ringR,
      y: baseY + Math.sin(ringAngle) * ringR
    }
  }

  private districtCenter(def: DistrictDef): { x: number; y: number } {
    return {
      x: def.anchor.col * TILE_SIZE + TILE_SIZE / 2,
      y: def.anchor.row * TILE_SIZE + TILE_SIZE / 2
    }
  }

  /** 把 sprite + 所有 attached label tween 到目標 (x,y)。短距離直接 set。 */
  private tweenNpcTo(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number): void {
    const prev = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (prev) prev.stop()
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    const startX = sprite.x
    const startY = sprite.y
    const distance = Math.hypot(x - startX, y - startY)
    if (distance < 0.5) {
      sprite.setPosition(x, y)
      if (badge) badge.setPosition(x, y)
      if (nameLabel) nameLabel.setPosition(x, y - NPC_SPRITE_SIZE * 0.85)
      if (activityIcon)
        activityIcon.setPosition(x + NPC_SPRITE_SIZE * 0.55, y - NPC_SPRITE_SIZE * 0.55)
      if (chatBubble) chatBubble.setPosition(x, y - NPC_SPRITE_SIZE * 1.6)
      return
    }
    if (x > startX + 0.5) sprite.setFlipX(false)
    else if (x < startX - 0.5) sprite.setFlipX(true)
    // 跨 district 距離可以非常遠（最遠 ≈ 600px），維持 4.5s tween：
    // 接到下個 server tick 前剛好走完、看起來就是「正在路上」
    const tween = this.tweens.add({
      targets: { px: startX, py: startY },
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
        if (chatBubble) chatBubble.setPosition(t.px, t.py - NPC_SPRITE_SIZE * 1.6)
      }
    })
    sprite.setData('moveTween', tween)
  }

  private disposeNpcSprite(id: string, sprite: Phaser.Physics.Arcade.Sprite): void {
    const moveTween = sprite.getData('moveTween') as Phaser.Tweens.Tween | undefined
    if (moveTween) this.tweens.remove(moveTween)
    const idleTween = sprite.getData('idleTween') as Phaser.Tweens.Tween | undefined
    if (idleTween) this.tweens.remove(idleTween)
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    this.npcSprites.delete(id)
    this.tweens.add({
      targets: [sprite, badge, nameLabel, activityIcon, chatBubble].filter(Boolean),
      alpha: 0,
      duration: SPRITE_FADE_MS,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (badge) badge.destroy()
        if (nameLabel) nameLabel.destroy()
        if (activityIcon) activityIcon.destroy()
        if (chatBubble) chatBubble.destroy()
        sprite.destroy()
      }
    })
  }

  private fadeNpcSprite(sprite: Phaser.Physics.Arcade.Sprite, alpha: number): void {
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    this.tweens.add({
      targets: [sprite, badge, nameLabel, activityIcon, chatBubble].filter(Boolean),
      alpha,
      duration: SPRITE_FADE_MS,
      ease: 'Sine.easeOut'
    })
  }

  private npcTextureKey(npcId: string, color?: number): string {
    if (color === undefined) return `npc-tex-${npcId}`
    return `npc-tex-${npcId}-${color.toString(16)}`
  }

  /**
   * 在記憶體生成一個方形實心 sprite 紋理。Prototype 用幾何方塊代替美術。
   */
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

    // 點擊或拖曳 -> 朝目標移動。手機上單擊也會持續移動到該點，
    // 走到目標附近 (handleMovement 內判斷) 才清掉 target。
    // suppressNextPointerTarget：點到 NPC sprite 時 sprite handler 會設此 flag，
    // 這次 pointerdown 就不要把目標設成那個座標 (避免雙觸)。
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.controlsEnabled) return
      if (this.suppressNextPointerTarget) {
        this.suppressNextPointerTarget = false
        return
      }
      this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.controlsEnabled) return
      if (pointer.isDown) {
        this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
      }
    })
  }

  private tryInteract(): void {
    if (!this.controlsEnabled) return
    if (this.nearbyNpcId) {
      this.callbacks.onNpcInteract(this.nearbyNpcId)
    }
  }

  // ---------- HUD ----------

  private setupHud(): void {
    // 互動提示 (浮在玩家頭上)
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

    // 進入街區的橫幅
    const bannerBg = this.add.rectangle(CANVAS_WIDTH / 2, 50, 280, 38, 0x000000, 0.65)
    bannerBg.setStrokeStyle(1, 0xfff5b8, 0.8)
    this.districtBannerText = this.add.text(CANVAS_WIDTH / 2, 50, '', {
      fontFamily:
        '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      fontSize: '15px',
      color: '#fff5b8',
      fontStyle: 'bold'
    })
    this.districtBannerText.setOrigin(0.5, 0.5)
    this.districtBanner = this.add.container(0, 0, [bannerBg, this.districtBannerText])
    this.districtBanner.setDepth(110)
    this.districtBanner.setAlpha(0)
  }

  private showDistrictBanner(districtId: DistrictId): void {
    const def = DISTRICTS[districtId]
    const name = this.labelFor(def)
    this.districtBannerText.setText(`${this.hudStrings.enterArea} · ${name}`)
    this.districtBanner.setAlpha(1)
    this.districtBannerTimer = 1800
  }

  private tickDistrictBanner(delta: number): void {
    if (this.districtBannerTimer <= 0) return
    this.districtBannerTimer -= delta
    if (this.districtBannerTimer <= 0) {
      this.districtBanner.setAlpha(0)
      return
    }
    // 在最後 600ms 淡出
    if (this.districtBannerTimer < 600) {
      this.districtBanner.setAlpha(this.districtBannerTimer / 600)
    }
  }

  // ---------- 移動 / 觸發 ----------

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

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1
      const nx = vx / len
      const ny = vy / len
      this.player.setVelocity(nx * PLAYER_SPEED, ny * PLAYER_SPEED)
    } else {
      this.player.setVelocity(0, 0)
    }
  }

  private checkDistrictTransition(): void {
    if (!this.controlsEnabled) return
    const here = districtAtPixel(this.player.x, this.player.y)
    if (here !== this.currentDistrict) {
      this.currentDistrict = here
      if (this.isActiveDistrict(here)) {
        this.showDistrictBanner(here)
        this.callbacks.onAreaEnter(here)
      }
    }
  }

  private checkNpcProximity(): void {
    let nearestId: string | null = null
    let nearestDist = INTERACT_RADIUS
    for (const [id, sprite] of this.npcSprites) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y)
      const inRange = d < INTERACT_RADIUS
      if (d < nearestDist) {
        nearestDist = d
        nearestId = id
      }
      // 顯示 / 隱藏 sprite 上方的 💬 提示氣泡
      const bubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
      if (bubble) bubble.setVisible(inRange)
    }
    this.nearbyNpcId = nearestId

    if (nearestId) {
      const npc = this.npcs.find((n) => n.id === nearestId)
      const promptText = this.interactPrompt.getData('text') as Phaser.GameObjects.Text
      const promptBg = this.interactPrompt.getData('bg') as Phaser.GameObjects.Rectangle
      const text = npc ? `${this.hudStrings.interact}: ${npc.name}` : this.hudStrings.interact
      promptText.setText(text)
      const w = Math.max(120, promptText.width + 20)
      promptBg.setSize(w, 26)
      this.interactPrompt.setPosition(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.4)
      this.interactPrompt.setVisible(true)
    } else {
      this.interactPrompt.setVisible(false)
    }
  }
}
