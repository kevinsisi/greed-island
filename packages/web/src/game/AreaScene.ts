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
  /** 顯示在 sprite 上方的完整名字 */
  name: string
  /** sprite 內部的單字 badge / aria 用途 */
  shortName: string
  /** 當前活動，用 i18n 字串顯示在名字下方；缺值就不顯示活動行 */
  activityLabel?: string
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
}

export interface AreaSceneInit {
  callbacks: AreaSceneCallbacks
  tileId: DistrictId
  npcs: AreaMapNpc[]
  drops: AreaMapDrop[]
  locale: 'zh' | 'en'
  hudStrings: { interact: string; pickup: string; tooFar: string }
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
  private hudStrings: AreaSceneInit['hudStrings'] = { interact: '', pickup: '', tooFar: '' }
  private startPosition: { x: number; y: number } | null = null
  private nearbyNpcIdsCache = ''
  private tooFarHintTimer: Phaser.Time.TimerEvent | null = null

  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null
  private nearbyNpcId: string | null = null
  private nearbyDropId: number | null = null

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
    this.hudStrings = data.hudStrings
    this.startPosition = data.startPosition
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x12141a)
    this.drawBackground()
    this.spawnPlayer()
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

  /**
   * 把當前 npcs 列表 sync 到場景。
   * - 已存在的 NPC sprite：原地保留（連帶 wander tween 與位置），只更新名字 / 活動字串
   * - 新增 NPC：建立 sprite + label + idle wander tween
   * - 移除 NPC：清掉 sprite + label + tween
   * 這樣 SSE 觸發 mapNpcs 重組時，sprite 不會閃爍重生。
   */
  private refreshNpcSprites(): void {
    const seen = new Set<string>()

    if (this.npcs.length === 0) {
      // 沒有 NPC：全部清掉
      for (const [id, sprite] of this.npcSprites) {
        this.disposeNpcSprite(id, sprite)
      }
      return
    }

    // 將 NPC 平均散佈在以畫布中心為圓心的圓上，做為 anchor 位置（wander 起點）
    const cx = AREA_CANVAS_WIDTH / 2
    const cy = AREA_CANVAS_HEIGHT / 2
    const radius = Math.min(AREA_CANVAS_WIDTH, AREA_CANVAS_HEIGHT) * 0.32
    const total = this.npcs.length

    this.npcs.forEach((npc, idx) => {
      seen.add(npc.id)
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      const anchorX = cx + Math.cos(angle) * radius
      const anchorY = cy + Math.sin(angle) * radius

      const existing = this.npcSprites.get(npc.id)
      if (existing) {
        // 既有 sprite — 只更新名字 / 活動 label，保留位置與 tween
        const nameLabel = existing.getData('nameLabel') as Phaser.GameObjects.Text | undefined
        const activityLabel = existing.getData('activityLabel') as
          | Phaser.GameObjects.Text
          | undefined
        if (nameLabel && nameLabel.text !== npc.name) nameLabel.setText(npc.name)
        if (activityLabel) {
          const desired = npc.activityLabel ?? ''
          if (activityLabel.text !== desired) activityLabel.setText(desired)
          activityLabel.setVisible(desired.length > 0)
        }
        existing.setData('anchorX', anchorX)
        existing.setData('anchorY', anchorY)
        return
      }

      // 新增 sprite
      const tex = this.npcTextureKey(npc.id)
      this.makeSquareTexture(tex, NPC_SPRITE_SIZE, NPC_BADGE_COLOR, 0x1c1300, 2)
      const sprite = this.physics.add.sprite(anchorX, anchorY, tex)
      sprite.setDepth(70)
      sprite.setData('npcId', npc.id)
      sprite.setData('anchorX', anchorX)
      sprite.setData('anchorY', anchorY)
      sprite.setInteractive({ useHandCursor: true })
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
        // 距離檢查：玩家必須在 INTERACT_RADIUS 內才能點開對話。
        // 太遠就閃一段 HUD 提示「走近一點才能交談」並通知 React 層。
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
      const badge = this.add.text(anchorX, anchorY, npc.shortName, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '14px',
        color: NPC_BADGE_TEXT,
        fontStyle: 'bold'
      })
      badge.setOrigin(0.5, 0.5)
      badge.setDepth(71)
      sprite.setData('badge', badge)

      // sprite 正上方顯示完整名字
      const nameLabel = this.add.text(anchorX, anchorY - NPC_SPRITE_SIZE * 0.85, npc.name, {
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

      // sprite 下方顯示活動狀態（工作中 / 用餐 / 移動 …）
      const activityLabel = this.add.text(
        anchorX,
        anchorY + NPC_SPRITE_SIZE * 0.65,
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

      // idle wander tween：sprite 在 anchor 周圍 ±18px 內漂移；label 隨之移動
      const wanderRadius = 18 + (idx % 3) * 4
      const wanderDuration = 1800 + (idx % 5) * 200
      const tween = this.tweens.add({
        targets: { tx: 0, ty: 0 },
        tx: { from: -wanderRadius, to: wanderRadius },
        ty: { from: -wanderRadius * 0.5, to: wanderRadius * 0.5 },
        duration: wanderDuration,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        onUpdate: (_t, target: { tx: number; ty: number }) => {
          const ax = sprite.getData('anchorX') as number
          const ay = sprite.getData('anchorY') as number
          const newX = ax + target.tx
          const newY = ay + target.ty
          // 朝向：依水平移動方向左右翻轉
          const lastX = (sprite.getData('lastX') as number | undefined) ?? newX
          if (newX > lastX + 0.05) sprite.setFlipX(false)
          else if (newX < lastX - 0.05) sprite.setFlipX(true)
          sprite.setData('lastX', newX)
          sprite.setPosition(newX, newY)
          badge.setPosition(newX, newY)
          nameLabel.setPosition(newX, newY - NPC_SPRITE_SIZE * 0.85)
          activityLabel.setPosition(newX, newY + NPC_SPRITE_SIZE * 0.65)
        }
      })
      sprite.setData('wanderTween', tween)

      this.npcSprites.set(npc.id, sprite)
    })

    // 清掉本 tick 之後不再存在的 NPC
    for (const [id, sprite] of this.npcSprites) {
      if (!seen.has(id)) this.disposeNpcSprite(id, sprite)
    }
  }

  private disposeNpcSprite(id: string, sprite: Phaser.Physics.Arcade.Sprite): void {
    const tween = sprite.getData('wanderTween') as Phaser.Tweens.Tween | undefined
    if (tween) {
      this.tweens.remove(tween)
    }
    const badge = sprite.getData('badge') as Phaser.GameObjects.Text | undefined
    const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
    const activityLabel = sprite.getData('activityLabel') as Phaser.GameObjects.Text | undefined
    if (badge) badge.destroy()
    if (nameLabel) nameLabel.destroy()
    if (activityLabel) activityLabel.destroy()
    sprite.destroy()
    this.npcSprites.delete(id)
  }

  private npcTextureKey(npcId: string): string {
    return `area-npc-tex-${npcId}`
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
      container.setSize(DROP_SPRITE_SIZE + 8, DROP_SPRITE_SIZE + 8)
      container.setInteractive(
        new Phaser.Geom.Rectangle(
          -DROP_SPRITE_SIZE / 2 - 4,
          -DROP_SPRITE_SIZE / 2 - 4,
          DROP_SPRITE_SIZE + 8,
          DROP_SPRITE_SIZE + 8
        ),
        Phaser.Geom.Rectangle.Contains
      )
      container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation?.()
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
    // 紋卡 drop 比 NPC 優先（玩家會踩在 drop 上面，靠近兩者時優先撿卡）
    if (this.nearbyDropId !== null) {
      this.callbacks.onDropPickup(this.nearbyDropId)
      return
    }
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
      if (d < INTERACT_RADIUS) allNearby.push(id)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = id
      }
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
