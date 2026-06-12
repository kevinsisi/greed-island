import Phaser from 'phaser'
import type { ServerBuildingDef } from '../api/client'
import { activityGlyphFor } from './npcVisuals'
import { applyAvatarOutfitColor, applyProceduralAvatarPose, createProceduralHumanoidAvatar, type ProceduralAvatar } from './characterAvatar'
import {
  BUILDING_NPC_FALLBACK_COLOR,
  BUILDING_PLAYER_COLOR,
  characterVisualStateForBuildingLocalPlayer,
  characterVisualStateForBuildingNpc,
} from './buildingCharacterVisualState'
import type { CharacterFacing } from './characterVisualState'
import type { NpcActivity } from '../state/types'

// 建築物室內小場景：10x6 cell、每 cell 32px。內部裝飾從 building.interior
// 來；NPC（owner / 室內僱員）以 sprite 在椅子或櫃台旁出現。
export const INTERIOR_CELL = 36
const PLAYER_SPRITE_SIZE = 20
const NPC_SPRITE_SIZE = 22
const PLAYER_SPEED = 130
const EXIT_RADIUS = INTERIOR_CELL * 1.15

const PLAYER_OUTLINE = 0x1a1407
/** 後端沒給 color 時的 fallback */
const NPC_FALLBACK_COLOR = BUILDING_NPC_FALLBACK_COLOR
/** Owner 多一道金邊 */
const OWNER_OUTLINE = 0xffd966
const FLOOR_LIGHT = 0x2a2438
const FLOOR_DARK = 0x1f1a2c
const FLOOR_RESTAURANT = 0x4a2a1a
const FLOOR_LIBRARY = 0x2a3030
const FLOOR_FACTORY = 0x282525
const FLOOR_TEMPLE = 0x252535
const FLOOR_RESIDENTIAL = 0x2e2520

function floorColorsFor(type: string): [number, number] {
  switch (type) {
    case 'restaurant':
      return [FLOOR_RESTAURANT, 0x3a2010]
    case 'library':
      return [FLOOR_LIBRARY, 0x202828]
    case 'factory':
      return [FLOOR_FACTORY, 0x1e1c1c]
    case 'temple':
      return [FLOOR_TEMPLE, 0x1c1c2c]
    case 'residential':
      return [FLOOR_RESIDENTIAL, 0x251e1a]
    default:
      return [FLOOR_LIGHT, FLOOR_DARK]
  }
}

export interface BuildingSceneNpc {
  id: string
  name: string
  shortName: string
  isOwner: boolean
  activityLabel?: string
  /** 24-bit RGB sprite 主色（後端 v0.12+ 推；缺值用 NPC_FALLBACK_COLOR） */
  color?: number
  /** 後端 activity → sprite 上方 emoji icon */
  activity?: NpcActivity
  /** Short deterministic task text from the server projection. */
  intentLine?: string
}

export interface BuildingSceneInit {
  building: ServerBuildingDef
  npcs: BuildingSceneNpc[]
  /** Guests can browse interiors, but movement/actions require login. */
  controlsEnabled?: boolean
  callbacks: {
    onNpcInteract: (npcId: string) => void
    onExit: () => void
  }
}

export class BuildingScene extends Phaser.Scene {
  static readonly KEY = 'BuildingScene'

  private building!: ServerBuildingDef
  private npcs: BuildingSceneNpc[] = []
  private callbacks!: BuildingSceneInit['callbacks']
  private controlsEnabled = true

  private player!: Phaser.Physics.Arcade.Sprite
  private playerAvatar: ProceduralAvatar | null = null
  private playerFacing: CharacterFacing = 'right'
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'SPACE', Phaser.Input.Keyboard.Key>

  private pointerTarget: { x: number; y: number } | null = null
  private suppressNextPointerTarget = false
  private npcSprites = new Map<string, Phaser.Physics.Arcade.Sprite>()
  private exitHotspot!: Phaser.GameObjects.Container
  private exitPos!: { x: number; y: number }

  constructor() {
    super({ key: BuildingScene.KEY })
  }

  init(data: BuildingSceneInit): void {
    this.building = data.building
    this.npcs = data.npcs
    this.callbacks = data.callbacks
    this.controlsEnabled = data.controlsEnabled ?? true
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0a0710)
    this.drawFloor()
    this.drawProps()
    this.drawExitHotspot()
    this.spawnPlayer()
    this.refreshNpcs()
    this.setupInput()

    this.physics.world.setBounds(0, 0, this.canvasWidth(), this.canvasHeight())
    this.player.setCollideWorldBounds(true)
  }

  update(_time: number, _delta: number): void {
    if (!this.controlsEnabled) {
      this.pointerTarget = null
      this.player?.setVelocity(0, 0)
      this.syncPlayerAvatar()
      return
    }
    this.handleMovement()
    this.syncPlayerAvatar()
  }

  applyExternalUpdate(payload: { npcs?: BuildingSceneNpc[]; controlsEnabled?: boolean }): void {
    if (payload.controlsEnabled !== undefined) {
      this.controlsEnabled = payload.controlsEnabled
      if (!this.controlsEnabled) {
        this.pointerTarget = null
        this.player?.setVelocity(0, 0)
      }
    }
    if (payload.npcs) {
      this.npcs = payload.npcs
      this.refreshNpcs()
    }
  }

  private canvasWidth(): number {
    return this.building.interior.cols * INTERIOR_CELL
  }
  private canvasHeight(): number {
    return this.building.interior.rows * INTERIOR_CELL
  }

  private drawFloor(): void {
    const [light, dark] = floorColorsFor(this.building.type)
    const g = this.add.graphics()
    for (let row = 0; row < this.building.interior.rows; row += 1) {
      for (let col = 0; col < this.building.interior.cols; col += 1) {
        const checker = (col + row) % 2 === 0
        const fill = checker ? light : dark
        g.fillStyle(fill, 1)
        g.fillRect(col * INTERIOR_CELL, row * INTERIOR_CELL, INTERIOR_CELL, INTERIOR_CELL)
        g.lineStyle(1, 0x000000, 0.18)
        g.strokeRect(
          col * INTERIOR_CELL + 0.5,
          row * INTERIOR_CELL + 0.5,
          INTERIOR_CELL - 1,
          INTERIOR_CELL - 1
        )
      }
    }
    // 邊界框
    g.lineStyle(3, 0xfff5b8, 0.7)
    g.strokeRect(1.5, 1.5, this.canvasWidth() - 3, this.canvasHeight() - 3)
  }

  private drawProps(): void {
    for (const prop of this.building.interior.props) {
      const text = this.add.text(
        prop.col * INTERIOR_CELL + INTERIOR_CELL / 2,
        prop.row * INTERIOR_CELL + INTERIOR_CELL / 2,
        prop.glyph,
        {
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
          fontSize: `${prop.size ?? 22}px`,
          color: '#ffffff',
          stroke: '#0a0a0a',
          strokeThickness: 2
        }
      )
      text.setOrigin(0.5, 0.5)
      text.setDepth(40)
      if (prop.label) {
        const tip = this.add.text(
          prop.col * INTERIOR_CELL + INTERIOR_CELL / 2,
          prop.row * INTERIOR_CELL + INTERIOR_CELL / 2 + 16,
          prop.label,
          {
            fontFamily:
              '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
            fontSize: '9px',
            color: '#fff5b888'
          }
        )
        tip.setOrigin(0.5, 0)
        tip.setDepth(41)
      }
    }
  }

  private spawnPlayer(): void {
    const tex = this.makeSquareTexture('bld-player', PLAYER_SPRITE_SIZE, BUILDING_PLAYER_COLOR, PLAYER_OUTLINE, 2)
    const sx = INTERIOR_CELL * 1.5
    const sy = this.canvasHeight() - INTERIOR_CELL * 0.8
    this.player = this.physics.add.sprite(sx, sy, tex)
    this.player.setVisible(false)
    this.player.setDepth(80)
    const state = characterVisualStateForBuildingLocalPlayer({
      x: sx,
      y: sy,
      previousFacing: this.playerFacing,
    })
    this.playerFacing = state.facing
    this.playerAvatar = createProceduralHumanoidAvatar(this, state, { size: PLAYER_SPRITE_SIZE + 6, depth: 80 })
  }

  private syncPlayerAvatar(): void {
    if (!this.player || !this.playerAvatar) return
    const body = this.player.body as Phaser.Physics.Arcade.Body | null
    const state = characterVisualStateForBuildingLocalPlayer({
      x: this.player.x,
      y: this.player.y,
      velocityX: body?.velocity.x ?? 0,
      velocityY: body?.velocity.y ?? 0,
      previousFacing: this.playerFacing,
    })
    this.playerFacing = state.facing
    applyProceduralAvatarPose(this.playerAvatar.container, state)
  }

  private drawExitHotspot(): void {
    const x = INTERIOR_CELL * 1.5
    const y = this.canvasHeight() - INTERIOR_CELL * 0.8
    this.exitPos = { x, y }
    const halo = this.add.rectangle(0, 0, INTERIOR_CELL * 1.35, INTERIOR_CELL * 0.82, 0x000000, 0.62)
    halo.setStrokeStyle(2, 0xfff5b8, 0.85)
    const icon = this.add.text(-INTERIOR_CELL * 0.38, 0, '🚪', {
      fontFamily:
        '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", system-ui, sans-serif',
      fontSize: '17px',
      color: '#ffffff',
      stroke: '#0a0a0a',
      strokeThickness: 2
    })
    icon.setOrigin(0.5, 0.5)
    const label = this.add.text(5, 0, '離開', {
      fontFamily:
        '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
      fontSize: '11px',
      color: '#fff5b8',
      fontStyle: 'bold'
    })
    label.setOrigin(0.5, 0.5)
    this.exitHotspot = this.add.container(x, y, [halo, icon, label])
    this.exitHotspot.setDepth(65)
    this.exitHotspot.setSize(INTERIOR_CELL * 1.35, INTERIOR_CELL * 0.82)
    this.exitHotspot.setInteractive(
      new Phaser.Geom.Rectangle(
        -INTERIOR_CELL * 0.675,
        -INTERIOR_CELL * 0.41,
        INTERIOR_CELL * 1.35,
        INTERIOR_CELL * 0.82
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
      this.callbacks.onExit()
    })
  }

  private refreshNpcs(): void {
    const seen = new Set<string>()
    const cy = this.canvasHeight() / 2 + 8
    const cx = this.canvasWidth() / 2
    const radius = Math.min(this.canvasWidth(), this.canvasHeight()) * 0.28
    this.npcs.forEach((npc, idx) => {
      seen.add(npc.id)
      const angle = (idx / Math.max(1, this.npcs.length)) * Math.PI * 2 - Math.PI / 2
      const ax = cx + Math.cos(angle) * radius
      const ay = cy + Math.sin(angle) * radius

      const existing = this.npcSprites.get(npc.id)
      if (existing) {
        const avatar = existing.getData('avatar') as ProceduralAvatar | undefined
        const ownerHalo = existing.getData('ownerHalo') as Phaser.GameObjects.Ellipse | undefined
        const activityIcon = existing.getData('activityIcon') as Phaser.GameObjects.Text | undefined
        existing.setData('anchorX', ax)
        existing.setData('anchorY', ay)
        const nameLabel = existing.getData('nameLabel') as Phaser.GameObjects.Text | undefined
        if (nameLabel && nameLabel.text !== npc.name) nameLabel.setText(npc.name)
        const state = characterVisualStateForBuildingNpc(npc, { x: existing.x, y: existing.y }, { x: existing.x, y: existing.y })
        existing.setData('visualState', state)
        if (avatar) {
          this.applyNpcAvatarColor(avatar, state.color)
          applyProceduralAvatarPose(avatar.container, state)
          if (avatar.label && avatar.label.text !== npc.shortName) avatar.label.setText(npc.shortName)
        }
        if (ownerHalo) ownerHalo.setVisible(npc.isOwner)
        if (activityIcon) {
          const iconGlyph = activityGlyphFor(npc.activity)
          activityIcon.setText(iconGlyph)
          activityIcon.setVisible(iconGlyph.length > 0)
        }
        return
      }

      const fillColor = npc.color ?? NPC_FALLBACK_COLOR
      const tex = this.npcTextureKey(npc.id, fillColor)
      this.makeSquareTexture(tex, NPC_SPRITE_SIZE, fillColor, 0x1a1407, 2)
      const sprite = this.physics.add.sprite(ax, ay, tex)
      sprite.setVisible(false)
      sprite.setDepth(70)

      const state = characterVisualStateForBuildingNpc(npc, { x: ax, y: ay })
      const ownerHalo = this.add.ellipse(ax, ay + NPC_SPRITE_SIZE * 0.12, NPC_SPRITE_SIZE * 1.18, NPC_SPRITE_SIZE * 1.45, 0x000000, 0)
      ownerHalo.setStrokeStyle(2, OWNER_OUTLINE, 0.95)
      ownerHalo.setDepth(69)
      ownerHalo.setVisible(npc.isOwner)
      sprite.setData('ownerHalo', ownerHalo)

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
        this.callbacks.onNpcInteract(npc.id)
      })
      sprite.setData('avatar', avatar)
      sprite.setData('visualState', state)

      const label = this.add.text(ax, ay - NPC_SPRITE_SIZE * 0.85, npc.name, {
        fontFamily:
          '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
        fontSize: '10px',
        color: '#fff5b8',
        stroke: '#0a0a0a',
        strokeThickness: 2
      })
      label.setOrigin(0.5, 1)
      label.setDepth(72)
      sprite.setData('nameLabel', label)
      sprite.setData('anchorX', ax)
      sprite.setData('anchorY', ay)

      // 活動 emoji（idle 不顯示） — 釘在 sprite 右上肩，跟著 bob tween 一起更新
      const iconGlyph = activityGlyphFor(npc.activity)
      const iconText = this.add.text(
        ax + NPC_SPRITE_SIZE * 0.55,
        ay - NPC_SPRITE_SIZE * 0.55,
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
      iconText.setOrigin(0.5, 0.5)
      iconText.setDepth(73)
      iconText.setVisible(iconGlyph.length > 0)
      sprite.setData('activityIcon', iconText)

      // gentle bob tween（每位 NPC 不同節奏；idle 呼吸動畫，不是 wander）
      const tween = this.tweens.add({
        targets: { t: 0 },
        t: { from: -2, to: 2 },
        duration: 1200 + (idx % 5) * 250,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: (_, target: { t: number }) => {
          const ax2 = sprite.getData('anchorX') as number
          const ay2 = sprite.getData('anchorY') as number
          const ny = ay2 + target.t
          const currentState = sprite.getData('visualState') as ReturnType<typeof characterVisualStateForBuildingNpc> | undefined
          sprite.setPosition(ax2, ny)
          ownerHalo.setPosition(ax2, ny + NPC_SPRITE_SIZE * 0.12)
          applyProceduralAvatarPose(avatar.container, { ...(currentState ?? state), x: ax2, y: ny })
          label.setPosition(ax2, ny - NPC_SPRITE_SIZE * 0.85)
          iconText.setPosition(ax2 + NPC_SPRITE_SIZE * 0.55, ny - NPC_SPRITE_SIZE * 0.55)
        }
      })
      sprite.setData('tween', tween)

      this.npcSprites.set(npc.id, sprite)
    })
    for (const [id, sprite] of this.npcSprites) {
      if (seen.has(id)) continue
      const tween = sprite.getData('tween') as Phaser.Tweens.Tween | undefined
      if (tween) this.tweens.remove(tween)
      const avatar = sprite.getData('avatar') as ProceduralAvatar | undefined
      const ownerHalo = sprite.getData('ownerHalo') as Phaser.GameObjects.Ellipse | undefined
      const nameLabel = sprite.getData('nameLabel') as Phaser.GameObjects.Text | undefined
      const iconText = sprite.getData('activityIcon') as Phaser.GameObjects.Text | undefined
      avatar?.container.destroy(true)
      ownerHalo?.destroy()
      nameLabel?.destroy()
      iconText?.destroy()
      sprite.destroy()
      this.npcSprites.delete(id)
    }
  }

  private applyNpcAvatarColor(avatar: ProceduralAvatar, color: number): void {
    applyAvatarOutfitColor(avatar, color)
  }

  private npcTextureKey(id: string, color?: number): string {
    if (color === undefined) return `bld-npc-${id}`
    return `bld-npc-${id}-${color.toString(16)}`
  }

  private makeSquareTexture(
    key: string,
    size: number,
    fill: number,
    outline: number,
    width: number
  ): string {
    if (this.textures.exists(key)) this.textures.remove(key)
    const g = this.add.graphics({ x: 0, y: 0 })
    g.fillStyle(fill, 1)
    g.fillRect(0, 0, size, size)
    g.lineStyle(width, outline, 1)
    g.strokeRect(width / 2, width / 2, size - width, size - width)
    g.generateTexture(key, size, size)
    g.destroy()
    return key
  }

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
    this.wasd.E.on('down', () => this.tryExit())
    this.wasd.SPACE.on('down', () => this.tryExit())
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

  private tryExit(): void {
    if (!this.controlsEnabled) return
    if (!this.player || !this.exitPos) return
    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.exitPos.x,
      this.exitPos.y
    )
    if (distance <= EXIT_RADIUS) this.callbacks.onExit()
  }

  private handleMovement(): void {
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
}
