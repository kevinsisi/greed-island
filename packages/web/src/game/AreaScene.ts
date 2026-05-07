import Phaser from 'phaser'
import {
  DISTRICTS,
  NPC_BADGE_COLOR,
  NPC_BADGE_TEXT,
  PLAYER_COLOR,
  PLAYER_OUTLINE,
  type DistrictId
} from './districts'
import { AREA_DECORATIONS, AREA_ROAD_COLOR, AREA_ROAD_SHADE } from './decorations'

/** 後端 NPC 的活動，決定 sprite 顯示什麼 emoji 與要不要動 */
export type AreaNpcActivity =
  | 'idle'
  | 'move'
  | 'work'
  | 'eat'
  | 'sleep'
  | 'trade'
  | 'patrol'

const ACTIVITY_ICON: Readonly<Partial<Record<AreaNpcActivity, string>>> = {
  work: '🔨',
  sleep: '💤',
  eat: '🍜',
  trade: '💬'
  // move / idle / patrol → 不顯示圖示，靠移動或站立區分
}

/** sprite 的相對速度（決定 tween 時長），單位 px/s */
const ACTIVITY_SPEED: Readonly<Record<AreaNpcActivity, number>> = {
  move: 70,
  patrol: 30,
  idle: 0,
  work: 0,
  eat: 0,
  sleep: 0,
  trade: 0
}

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

export interface AreaMapNpc {
  id: string
  /** 顯示在 sprite 上方的完整名字 */
  name: string
  /** sprite 內部的單字 badge / aria 用途 */
  shortName: string
  /** 當前活動，用 i18n 字串顯示在名字下方；缺值就不顯示活動行 */
  activityLabel?: string
  /** 後端 activity，驅動 sprite 的位置與圖示 */
  activity?: AreaNpcActivity
  /** sprite 主色（依 role / faction 決定，由 React 層算好傳入） */
  spriteColor?: number
  /** sprite badge 內字色 — 配合 spriteColor 對比 */
  spriteTextColor?: string
  /**
   * 當 activity === 'move' 時，朝這個方向走出 tile（unit vector）。
   * 由 React 層用世界地圖座標 (currentTile → targetTile) 算好傳入。
   * 缺值 + move 視為原地繞圈
   */
  moveDirection?: { dx: number; dy: number }
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

    this.physics.world.setBounds(0, 0, AREA_CANVAS_WIDTH, AREA_CANVAS_HEIGHT)
    this.player.setCollideWorldBounds(true)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.flushPositionSave())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.flushPositionSave())
  }

  applyExternalUpdate(payload: {
    npcs?: AreaMapNpc[]
    drops?: AreaMapDrop[]
    locale?: 'zh' | 'en'
    hudStrings?: AreaSceneInit['hudStrings']
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
      const text = this.add.text(
        deco.col * AREA_TILE_SIZE + AREA_TILE_SIZE / 2,
        deco.row * AREA_TILE_SIZE + AREA_TILE_SIZE / 2,
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
    }
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
   * 把當前 npcs 列表 sync 到場景。
   * - 位置完全由後端 activity 驅動 (詳見 driveSpriteByActivity)
   * - sprite 主色由 spriteColor 決定，依 role / faction 由 React 層算好
   * - sprite 不再有「亂走 wander」假動畫；站著不動代表後端真的說他在工作 / 休息 / 聊天
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
      const home = this.npcHomeAnchor(npc.id)

      const existing = this.npcSprites.get(npc.id)
      if (existing) {
        // 既有 sprite — 更新文字、判斷是否要重啟 activity tween
        const nameLabel = existing.getData('nameLabel') as Phaser.GameObjects.Text | undefined
        const activityLabel = existing.getData('activityLabel') as
          | Phaser.GameObjects.Text
          | undefined
        const activityIcon = existing.getData('activityIcon') as
          | Phaser.GameObjects.Text
          | undefined
        if (nameLabel && nameLabel.text !== npc.name) nameLabel.setText(npc.name)
        if (activityLabel) {
          const desired = npc.activityLabel ?? ''
          if (activityLabel.text !== desired) activityLabel.setText(desired)
          activityLabel.setVisible(desired.length > 0)
        }
        if (activityIcon) {
          const icon = npc.activity ? (ACTIVITY_ICON[npc.activity] ?? '') : ''
          if (activityIcon.text !== icon) activityIcon.setText(icon)
          activityIcon.setVisible(icon.length > 0)
        }
        existing.setData('anchorX', home.x)
        existing.setData('anchorY', home.y)
        this.driveSpriteByActivity(existing, npc, home)
        continue
      }

      // 新增 sprite — 用 spriteColor 生成專屬 texture，避免共用同一塊方塊
      const color = npc.spriteColor ?? NPC_BADGE_COLOR
      const tex = this.npcTextureKey(npc.id, color)
      this.makeSquareTexture(tex, NPC_SPRITE_SIZE, color, 0x1c1300, 2)
      const sprite = this.physics.add.sprite(home.x, home.y, tex)
      sprite.setDepth(70)
      sprite.setData('npcId', npc.id)
      sprite.setData('anchorX', home.x)
      sprite.setData('anchorY', home.y)
      sprite.setData('spriteColor', color)
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

      // sprite 中央的單字 badge
      const badge = this.add.text(home.x, home.y, npc.shortName, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '14px',
        color: npc.spriteTextColor ?? NPC_BADGE_TEXT,
        fontStyle: 'bold'
      })
      badge.setOrigin(0.5, 0.5)
      badge.setDepth(71)
      sprite.setData('badge', badge)

      const nameLabel = this.add.text(home.x, home.y - NPC_SPRITE_SIZE * 0.85, npc.name, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '11px',
        color: '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 3
      })
      nameLabel.setOrigin(0.5, 1)
      nameLabel.setDepth(72)
      sprite.setData('nameLabel', nameLabel)

      const activityLabel = this.add.text(
        home.x,
        home.y + NPC_SPRITE_SIZE * 0.65,
        npc.activityLabel ?? '',
        {
          fontFamily:
            '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
          fontSize: '10px',
          color: '#b6e3ff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      activityLabel.setOrigin(0.5, 0)
      activityLabel.setDepth(72)
      activityLabel.setVisible((npc.activityLabel ?? '').length > 0)
      sprite.setData('activityLabel', activityLabel)

      // activity 圖示（🔨 / 💤 / 💬 / 🍜）放在名字上方一階
      const initialIcon = npc.activity ? (ACTIVITY_ICON[npc.activity] ?? '') : ''
      const activityIcon = this.add.text(
        home.x,
        home.y - NPC_SPRITE_SIZE * 1.45,
        initialIcon,
        {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", system-ui, sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      activityIcon.setOrigin(0.5, 1)
      activityIcon.setDepth(74)
      activityIcon.setVisible(initialIcon.length > 0)
      sprite.setData('activityIcon', activityIcon)

      // 玩家走進 INTERACT_RADIUS 後，sprite 正上方 (比 activity 圖示再高一階) 浮出 💬
      const chatBubble = this.add.text(
        home.x,
        home.y - NPC_SPRITE_SIZE * 2.1,
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
      chatBubble.setDepth(73)
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
      this.driveSpriteByActivity(sprite, npc, home)
    }

    // 清掉本 tick 之後不再存在的 NPC
    for (const [id, sprite] of this.npcSprites) {
      if (!seen.has(id)) this.disposeNpcSprite(id, sprite)
    }
  }

  /**
   * 依後端 activity 決定 sprite 該怎麼動：
   * - move：朝 moveDirection 走出 home，慢慢漂向 tile 邊緣（直到後端把 location 換了，
   *   sprite 就會從 occupants 中消失）
   * - patrol：在 home 附近做 yoyo 小範圍巡邏
   * - work / eat / sleep / trade / idle：站著不動，sprite 直接歸位 home
   * 既有的 tween 會被 kill，避免動畫疊加。
   */
  private driveSpriteByActivity(
    sprite: Phaser.Physics.Arcade.Sprite,
    npc: AreaMapNpc,
    home: { x: number; y: number }
  ): void {
    const activity: AreaNpcActivity = npc.activity ?? 'idle'
    const prevActivity = sprite.getData('activityState') as AreaNpcActivity | undefined
    const prevDirKey = sprite.getData('moveDirKey') as string | undefined
    const dirKey = npc.moveDirection
      ? `${npc.moveDirection.dx.toFixed(2)},${npc.moveDirection.dy.toFixed(2)}`
      : ''
    if (prevActivity === activity && prevDirKey === dirKey) {
      // activity 沒變、方向也沒變 → tween 已經在跑，不重啟
      return
    }
    sprite.setData('activityState', activity)
    sprite.setData('moveDirKey', dirKey)

    // 殺掉現有 tween，避免動畫疊加
    const prev = sprite.getData('positionTween') as Phaser.Tweens.Tween | undefined
    if (prev) {
      this.tweens.remove(prev)
      sprite.setData('positionTween', undefined)
    }

    if (activity === 'move') {
      // 朝 moveDirection 走出 home。沒有方向 → 在 home 附近輕微繞一下（fallback）
      const dir = npc.moveDirection ?? { dx: 0, dy: 0 }
      const len = Math.hypot(dir.dx, dir.dy) || 1
      const ux = dir.dx / len
      const uy = dir.dy / len
      const exitDist = AREA_TILE_SIZE * 3 // 走 3 tiles 後接近邊緣
      const targetX = Phaser.Math.Clamp(
        home.x + ux * exitDist,
        NPC_SPRITE_SIZE,
        AREA_CANVAS_WIDTH - NPC_SPRITE_SIZE
      )
      const targetY = Phaser.Math.Clamp(
        home.y + uy * exitDist,
        NPC_SPRITE_SIZE,
        AREA_CANVAS_HEIGHT - NPC_SPRITE_SIZE
      )
      const dist = Math.hypot(targetX - sprite.x, targetY - sprite.y)
      const duration = Math.max(800, (dist / ACTIVITY_SPEED.move) * 1000)
      const tween = this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        duration,
        ease: 'Sine.easeInOut',
        onUpdate: () => this.repositionNpcLabels(sprite),
        onComplete: () => this.repositionNpcLabels(sprite)
      })
      sprite.setData('positionTween', tween)
      sprite.setFlipX(ux < 0)
      return
    }

    if (activity === 'patrol') {
      // 在 home 周圍做小範圍 yoyo（30~40 px 半徑）
      let h = 5381
      for (const ch of npc.id) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
      const angle = ((h >>> 4) % 360) * (Math.PI / 180)
      const radius = 28 + (h % 14)
      const targetX = Phaser.Math.Clamp(
        home.x + Math.cos(angle) * radius,
        NPC_SPRITE_SIZE,
        AREA_CANVAS_WIDTH - NPC_SPRITE_SIZE
      )
      const targetY = Phaser.Math.Clamp(
        home.y + Math.sin(angle) * radius,
        NPC_SPRITE_SIZE,
        AREA_CANVAS_HEIGHT - NPC_SPRITE_SIZE
      )
      const dist = Math.hypot(targetX - home.x, targetY - home.y)
      const duration = Math.max(1500, (dist / ACTIVITY_SPEED.patrol) * 1000)
      const tween = this.tweens.add({
        targets: sprite,
        x: { from: home.x, to: targetX },
        y: { from: home.y, to: targetY },
        duration,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        onUpdate: () => this.repositionNpcLabels(sprite)
      })
      sprite.setData('positionTween', tween)
      sprite.setFlipX(Math.cos(angle) < 0)
      return
    }

    // 站著不動的 activities — sprite 平滑回到 home
    const dist = Math.hypot(home.x - sprite.x, home.y - sprite.y)
    if (dist < 1) {
      sprite.setPosition(home.x, home.y)
      this.repositionNpcLabels(sprite)
      return
    }
    const tween = this.tweens.add({
      targets: sprite,
      x: home.x,
      y: home.y,
      duration: Math.min(900, Math.max(200, dist * 6)),
      ease: 'Sine.easeOut',
      onUpdate: () => this.repositionNpcLabels(sprite),
      onComplete: () => this.repositionNpcLabels(sprite)
    })
    sprite.setData('positionTween', tween)
  }

  /** sprite 動的時候，把所有附屬 label 同步搬過去 */
  private repositionNpcLabels(sprite: Phaser.Physics.Arcade.Sprite): void {
    const x = sprite.x
    const y = sprite.y
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityLabel = sprite.getData('activityLabel') as
      | Phaser.GameObjects.Text
      | undefined
    const activityIcon = sprite.getData('activityIcon') as
      | Phaser.GameObjects.Text
      | undefined
    const chatBubble = sprite.getData('chatBubble') as
      | Phaser.GameObjects.Text
      | undefined
    if (badge) badge.setPosition(x, y)
    if (nameLabel) nameLabel.setPosition(x, y - NPC_SPRITE_SIZE * 0.85)
    if (activityLabel) activityLabel.setPosition(x, y + NPC_SPRITE_SIZE * 0.65)
    if (activityIcon) activityIcon.setPosition(x, y - NPC_SPRITE_SIZE * 1.45)
    if (chatBubble) chatBubble.setPosition(x, y - NPC_SPRITE_SIZE * 2.1)
  }

  /**
   * 用 NPC id 算出在 area canvas 上的 home 座標 (穩定、跨 render 不變)。
   * 圍繞畫布中心 (玩家初始位置) 散佈在半徑 3.2~4.6 tile 的圓上，
   * 避開玩家正中央。
   */
  private npcHomeAnchor(npcId: string): { x: number; y: number } {
    let h = 5381
    for (const ch of npcId) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
    const angle = ((h % 1000) / 1000) * Math.PI * 2 - Math.PI / 2
    const radiusJitter = ((h >>> 8) % 1000) / 1000
    const radius = AREA_TILE_SIZE * (3.2 + radiusJitter * 1.4)
    const cx = AREA_CANVAS_WIDTH / 2
    const cy = AREA_CANVAS_HEIGHT / 2
    return {
      x: Phaser.Math.Clamp(
        cx + Math.cos(angle) * radius,
        NPC_SPRITE_SIZE,
        AREA_CANVAS_WIDTH - NPC_SPRITE_SIZE
      ),
      y: Phaser.Math.Clamp(
        cy + Math.sin(angle) * radius,
        NPC_SPRITE_SIZE,
        AREA_CANVAS_HEIGHT - NPC_SPRITE_SIZE
      )
    }
  }

  private disposeNpcSprite(id: string, sprite: Phaser.Physics.Arcade.Sprite): void {
    const tween = sprite.getData('positionTween') as Phaser.Tweens.Tween | undefined
    if (tween) {
      this.tweens.remove(tween)
    }
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityLabel = sprite.getData('activityLabel') as Phaser.GameObjects.Text | undefined
    const activityIcon = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
    const chatBubble = sprite.getData('chatBubble') as Phaser.GameObjects.Text | undefined
    if (badge) badge.destroy()
    if (nameLabel) nameLabel.destroy()
    if (activityLabel) activityLabel.destroy()
    if (activityIcon) activityIcon.destroy()
    if (chatBubble) chatBubble.destroy()
    sprite.destroy()
    this.npcSprites.delete(id)
  }

  private npcTextureKey(npcId: string, color: number): string {
    return `area-npc-tex-${npcId}-${color.toString(16)}`
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
