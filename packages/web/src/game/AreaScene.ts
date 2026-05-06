import Phaser from 'phaser'
import {
  DISTRICTS,
  NPC_BADGE_COLOR,
  NPC_BADGE_TEXT,
  PLAYER_COLOR,
  PLAYER_OUTLINE,
  type DistrictId
} from './districts'

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
  name: string
  shortName: string
}

export interface AreaSceneCallbacks {
  onNpcInteract: (npcId: string) => void
  onPositionChange: (pos: { x: number; y: number }) => void
}

export interface AreaSceneInit {
  callbacks: AreaSceneCallbacks
  tileId: DistrictId
  npcs: AreaMapNpc[]
  locale: 'zh' | 'en'
  hudStrings: { interact: string }
  /** 從 localStorage 讀回的位置；若無則 null。座標必須在 canvas 範圍內。 */
  startPosition: { x: number; y: number } | null
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
  private hudStrings: AreaSceneInit['hudStrings'] = { interact: '' }
  private startPosition: { x: number; y: number } | null = null

  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null
  private nearbyNpcId: string | null = null

  private interactPrompt!: Phaser.GameObjects.Container
  private npcSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map()

  private positionSaveTimer = 0
  private lastSavedPosition: { x: number; y: number } = { x: 0, y: 0 }

  constructor() {
    super({ key: AreaScene.KEY })
  }

  init(data: AreaSceneInit): void {
    this.callbacks = data.callbacks
    this.tileId = data.tileId
    this.npcs = data.npcs
    this.hudStrings = data.hudStrings
    this.startPosition = data.startPosition
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12141a)
    this.drawBackground()
    this.spawnPlayer()
    this.spawnNpcs()
    this.setupInput()
    this.setupHud()

    this.physics.world.setBounds(0, 0, AREA_CANVAS_WIDTH, AREA_CANVAS_HEIGHT)
    this.player.setCollideWorldBounds(true)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.flushPositionSave())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.flushPositionSave())
  }

  applyExternalUpdate(payload: { npcs?: AreaMapNpc[]; locale?: 'zh' | 'en'; hudStrings?: AreaSceneInit['hudStrings'] }): void {
    if (payload.hudStrings) this.hudStrings = payload.hudStrings
    if (payload.npcs) {
      this.npcs = payload.npcs
      this.refreshNpcSprites()
    }
  }

  update(_time: number, delta: number): void {
    this.handleMovement(delta)
    this.checkNpcProximity()
    this.tickPositionSave(delta)
  }

  // ---------- 背景 ----------

  private drawBackground(): void {
    const def = DISTRICTS[this.tileId] ?? DISTRICTS.t_road
    const g = this.add.graphics()
    for (let row = 0; row < AREA_GRID_ROWS; row += 1) {
      for (let col = 0; col < AREA_GRID_COLS; col += 1) {
        const checker = (col + row) % 2 === 0
        g.fillStyle(checker ? def.color : def.shade, 1)
        g.fillRect(col * AREA_TILE_SIZE, row * AREA_TILE_SIZE, AREA_TILE_SIZE, AREA_TILE_SIZE)
        g.lineStyle(1, def.border, 0.35)
        g.strokeRect(
          col * AREA_TILE_SIZE + 0.5,
          row * AREA_TILE_SIZE + 0.5,
          AREA_TILE_SIZE - 1,
          AREA_TILE_SIZE - 1
        )
      }
    }
    // 街區外框
    g.lineStyle(2, 0xfff5b8, 0.55)
    g.strokeRect(1, 1, AREA_CANVAS_WIDTH - 2, AREA_CANVAS_HEIGHT - 2)
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

  private refreshNpcSprites(): void {
    for (const sprite of this.npcSprites.values()) {
      const label = sprite.getData('label') as Phaser.GameObjects.Text | undefined
      if (label) label.destroy()
      sprite.destroy()
    }
    this.npcSprites.clear()

    if (this.npcs.length === 0) return

    // 將 NPC 平均散佈在以畫布中心為圓心的圓上，避免疊在玩家出生點
    const cx = AREA_CANVAS_WIDTH / 2
    const cy = AREA_CANVAS_HEIGHT / 2
    const radius = Math.min(AREA_CANVAS_WIDTH, AREA_CANVAS_HEIGHT) * 0.32
    const total = this.npcs.length

    this.npcs.forEach((npc, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      const x = cx + Math.cos(angle) * radius
      const y = cy + Math.sin(angle) * radius

      const tex = this.npcTextureKey(npc.id)
      this.makeSquareTexture(tex, NPC_SPRITE_SIZE, NPC_BADGE_COLOR, 0x1c1300, 2)
      const sprite = this.physics.add.sprite(x, y, tex)
      sprite.setDepth(70)
      sprite.setData('npcId', npc.id)
      sprite.setInteractive({ useHandCursor: true })
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        this.callbacks.onNpcInteract(npc.id)
      })

      const label = this.add.text(x, y, npc.shortName, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '14px',
        color: NPC_BADGE_TEXT,
        fontStyle: 'bold'
      })
      label.setOrigin(0.5, 0.5)
      label.setDepth(71)
      sprite.setData('label', label)

      this.npcSprites.set(npc.id, sprite)
    })
  }

  private npcTextureKey(npcId: string): string {
    return `area-npc-tex-${npcId}`
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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
      }
    })
    this.input.on('pointerup', () => {
      this.pointerTarget = null
    })
  }

  private tryInteract(): void {
    if (this.nearbyNpcId) {
      this.callbacks.onNpcInteract(this.nearbyNpcId)
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
      if (dist > 4) {
        vx = dx / dist
        vy = dy / dist
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
    for (const [id, sprite] of this.npcSprites) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = id
      }
    }
    this.nearbyNpcId = nearestId

    if (nearestId) {
      const npc = this.npcs.find((n) => n.id === nearestId)
      const promptText = this.interactPrompt.getData('text') as Phaser.GameObjects.Text
      const promptBg = this.interactPrompt.getData('bg') as Phaser.GameObjects.Rectangle
      const text = npc ? `${this.hudStrings.interact}: ${npc.shortName}` : this.hudStrings.interact
      promptText.setText(text)
      const w = Math.max(120, promptText.width + 20)
      promptBg.setSize(w, 26)
      this.interactPrompt.setPosition(this.player.x, this.player.y - PLAYER_SPRITE_SIZE * 1.4)
      this.interactPrompt.setVisible(true)
    } else {
      this.interactPrompt.setVisible(false)
    }
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
