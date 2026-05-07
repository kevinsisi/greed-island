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

export interface MapNpc {
  id: string
  name: string
  shortName: string
  /** 對應 fixtureMap.tiles[].id */
  districtId: DistrictId
}

export interface MapSceneCallbacks {
  onAreaEnter: (districtId: DistrictId) => void
  onNpcInteract: (npcId: string) => void
}

export interface MapSceneInit {
  callbacks: MapSceneCallbacks
  npcs: MapNpc[]
  locale: 'zh' | 'en'
  /** 「Press E / 點我互動」一類的提示文字 (i18n 過後的字串)。 */
  hudStrings: {
    interact: string
    enterArea: string
  }
  /** 上次離開時的玩家座標，用來在重新進場景時還原位置。 */
  initialPosition?: { x: number; y: number } | null
}

const PLAYER_SPEED = 180 // px/s
const INTERACT_RADIUS = TILE_SIZE * 1.6
const NPC_SPRITE_SIZE = 26
const PLAYER_SPRITE_SIZE = 22

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
  private locale: 'zh' | 'en' = 'zh'
  private hudStrings: MapSceneInit['hudStrings'] = { interact: '', enterArea: '' }

  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null

  private currentDistrict: DistrictId = 't_road'
  private nearbyNpcId: string | null = null

  private interactPrompt!: Phaser.GameObjects.Container
  private districtBanner!: Phaser.GameObjects.Container
  private districtBannerText!: Phaser.GameObjects.Text
  private districtBannerTimer: number = 0

  private npcSprites: Map<string, Phaser.Physics.Arcade.Sprite> = new Map()

  private initialPosition: { x: number; y: number } | null = null

  constructor() {
    super({ key: MapScene.KEY })
  }

  init(data: MapSceneInit): void {
    this.callbacks = data.callbacks
    this.npcs = data.npcs
    this.locale = data.locale
    this.hudStrings = data.hudStrings
    this.initialPosition = data.initialPosition ?? null
  }

  /** 給外部 (PhaserGame) 在 unmount 前讀出玩家當前座標，以便寫入 localStorage。 */
  getPlayerPosition(): { x: number; y: number } | null {
    if (!this.player) return null
    return { x: this.player.x, y: this.player.y }
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12141a)

    this.drawTiles()
    this.drawDistrictLabels()
    this.spawnPlayer()
    this.spawnNpcs()
    this.setupInput()
    this.setupHud()

    this.physics.world.setBounds(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    this.player.setCollideWorldBounds(true)

    // 如果玩家從還原的座標一開始就站在某街區裡，立刻同步給 React 端，
    // 否則「進入 XXX →」按鈕得等到玩家踏出街區再走回來才會出現。
    // 不放 banner — banner 是「剛走進」的通知，重整頁面時不該再演一次。
    if (isDistrict(this.currentDistrict)) {
      this.callbacks.onAreaEnter(this.currentDistrict)
    }
  }

  /**
   * 公開的 API，讓外面 (React 端) 可以更新 NPC 列表 / locale，不必 re-create
   * 整個 game 物件。
   */
  applyExternalUpdate(payload: { npcs?: MapNpc[]; locale?: 'zh' | 'en'; hudStrings?: MapSceneInit['hudStrings'] }): void {
    if (payload.hudStrings) this.hudStrings = payload.hudStrings
    if (payload.locale) this.locale = payload.locale
    if (payload.npcs) {
      this.npcs = payload.npcs
      this.refreshNpcSprites()
    } else if (payload.locale) {
      // 只有 locale 變了，刷新 sprite 上的文字
      this.refreshNpcSprites()
    }
    this.redrawDistrictLabels()
  }

  update(_time: number, delta: number): void {
    this.handleMovement(delta)
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
        // 棋盤格紋路：偶數格用主色，奇數格略深，做出像素風的小變化
        const checker = (col + row) % 2 === 0
        g.fillStyle(checker ? def.color : def.shade, 1)
        g.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        // 街區內側細邊框 (讓街區整體看起來像一個方塊)
        g.lineStyle(1, def.border, 0.35)
        g.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1)
      }
    }
    // 街區外框
    this.drawDistrictBoundaries(g)
  }

  private drawDistrictBoundaries(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(2, 0xfff5b8, 0.55)
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const here = DISTRICT_GRID[row]![col]!
        if (!isDistrict(here)) continue
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
    return this.locale === 'zh' ? def.nameZh : def.nameEn
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
    // 觀察玩家進入起始地塊
    this.currentDistrict = districtAtPixel(this.player.x, this.player.y)
  }

  private spawnNpcs(): void {
    this.refreshNpcSprites()
  }

  private refreshNpcSprites(): void {
    // 全部清掉重建。Prototype 等級夠用。
    for (const sprite of this.npcSprites.values()) {
      const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
      const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
      if (badge) badge.destroy()
      if (nameLabel) nameLabel.destroy()
      sprite.destroy()
    }
    this.npcSprites.clear()

    for (const npc of this.npcs) {
      const def = DISTRICTS[npc.districtId]
      if (!def) continue
      const tex = this.npcTextureKey(npc.id)
      this.makeSquareTexture(tex, NPC_SPRITE_SIZE, NPC_BADGE_COLOR, 0x1c1300, 2)
      const x = def.anchor.col * TILE_SIZE + TILE_SIZE / 2
      const y = def.anchor.row * TILE_SIZE + TILE_SIZE / 2
      const sprite = this.physics.add.sprite(x, y, tex)
      sprite.setDepth(70)
      sprite.setData('npcId', npc.id)
      sprite.setInteractive({ useHandCursor: true })
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        // 防止 pointerdown 同時觸發地圖 tap-to-move
        pointer.event?.stopPropagation?.()
        this.callbacks.onNpcInteract(npc.id)
      })

      // sprite 中央的單字 badge
      const badge = this.add.text(x, y, npc.shortName, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '14px',
        color: NPC_BADGE_TEXT,
        fontStyle: 'bold'
      })
      badge.setOrigin(0.5, 0.5)
      badge.setDepth(71)
      sprite.setData('badge', badge)

      // 完整名字浮在 sprite 上方，不必走近就讀得到
      const nameLabel = this.add.text(x, y - NPC_SPRITE_SIZE * 0.85, npc.name, {
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

      this.npcSprites.set(npc.id, sprite)
    }
  }

  private npcTextureKey(npcId: string): string {
    return `npc-tex-${npcId}`
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
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.pointerTarget = { x: pointer.worldX, y: pointer.worldY }
      }
    })
  }

  private tryInteract(): void {
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
    const here = districtAtPixel(this.player.x, this.player.y)
    if (here !== this.currentDistrict) {
      this.currentDistrict = here
      if (isDistrict(here)) {
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
}
