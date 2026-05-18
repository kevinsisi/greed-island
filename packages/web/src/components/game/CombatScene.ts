// CombatScene — Phase C real-time combat Phaser scene (v0.25.0).
//
// Visual canvas driven by CombatProjection state pushed from CombatHudPhaseC.
// All state mutations arrive via applyState() / pushFloatingNumber().
// No network calls; pure view.
//
// Pure card-hand logic lives in combatHand.ts (no Phaser, safe for tests).

import Phaser from 'phaser'
import type { CombatProjectionState } from '../../state/CombatProjection.js'
export {
  PLAYER_HAND_CARDS,
  getCombatHandCardMeta,
  shouldShowRejectToast,
  type PlayerHandCard,
  type CombatHandCardMeta,
} from './combatHand.js'

// ── Canvas layout ────────────────────────────────────────────────────────────
export const COMBAT_SCENE_W = 480
export const COMBAT_SCENE_H = 200

const PLAYER_X = 90
const NPC_X = 390
const ACTOR_Y = 80
const BAR_Y = 130
const BAR_W = 80
const BAR_H = 10
const PLAYER_BAR_COLOR = 0x4caf72
const NPC_BAR_COLOR = 0xe05040
const BAR_BG_COLOR = 0x2a2a2a

// ── Phaser Scene ─────────────────────────────────────────────────────────────

export type CombatSceneInit = {
  playerActorId: string
  npcActorId: string
  playerMaxHp: number
  npcMaxHp: number
  onReady?: () => void
}

export class CombatScene extends Phaser.Scene {
  static readonly KEY = 'CombatScene'

  private playerActorId = ''
  private npcActorId = ''
  private playerMaxHp = 100
  private npcMaxHp = 100
  private onReadyCallback: (() => void) | undefined = undefined

  private playerHpBar: Phaser.GameObjects.Graphics | undefined = undefined
  private npcHpBar: Phaser.GameObjects.Graphics | undefined = undefined
  private playerHpCurrent = 100
  private npcHpCurrent = 100
  private playerHpTween: Phaser.Tweens.Tween | undefined = undefined
  private npcHpTween: Phaser.Tweens.Tween | undefined = undefined

  constructor() {
    super({ key: CombatScene.KEY })
  }

  init(data: CombatSceneInit): void {
    this.playerActorId = data.playerActorId
    this.npcActorId = data.npcActorId
    this.playerMaxHp = data.playerMaxHp
    this.npcMaxHp = data.npcMaxHp
    if (data.onReady !== undefined) this.onReadyCallback = data.onReady
    this.playerHpCurrent = data.playerMaxHp
    this.npcHpCurrent = data.npcMaxHp
  }

  create(): void {
    this.add.rectangle(COMBAT_SCENE_W / 2, COMBAT_SCENE_H / 2, COMBAT_SCENE_W, COMBAT_SCENE_H, 0x0d0f14)

    // Actor labels
    this.add.text(PLAYER_X, ACTOR_Y, '⚔', { fontSize: '36px' }).setOrigin(0.5)
    this.add.text(NPC_X, ACTOR_Y, '👹', { fontSize: '36px' }).setOrigin(0.5)

    // HP bar backgrounds
    const bg = this.add.graphics()
    bg.fillStyle(BAR_BG_COLOR)
    bg.fillRect(PLAYER_X - BAR_W / 2, BAR_Y, BAR_W, BAR_H)
    bg.fillRect(NPC_X - BAR_W / 2, BAR_Y, BAR_W, BAR_H)

    // HP bar fills
    this.playerHpBar = this.add.graphics()
    this.npcHpBar = this.add.graphics()
    this._drawHpBar(this.playerHpBar, PLAYER_X, this.playerHpCurrent, this.playerMaxHp, PLAYER_BAR_COLOR)
    this._drawHpBar(this.npcHpBar, NPC_X, this.npcHpCurrent, this.npcMaxHp, NPC_BAR_COLOR)

    this.onReadyCallback?.()
  }

  applyState(state: CombatProjectionState): void {
    const player = state.actors.find((a) => a.actorId === this.playerActorId)
    const npc = state.actors.find((a) => a.actorId === this.npcActorId)
    if (player && player.hp !== this.playerHpCurrent) this._tweenHp('player', player.hp)
    if (npc && npc.hp !== this.npcHpCurrent) this._tweenHp('npc', npc.hp)
  }

  pushFloatingNumber(actorId: string, delta: number): void {
    const x = actorId === this.playerActorId ? PLAYER_X : NPC_X
    const color = delta < 0 ? '#ff6b6b' : '#7bc47b'
    const label = delta < 0 ? String(delta) : `+${delta}`
    const text = this.add.text(x, ACTOR_Y - 20, label, {
      fontSize: '16px',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5)
    this.tweens.add({
      targets: text,
      y: ACTOR_Y - 60,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    })
  }

  private _tweenHp(side: 'player' | 'npc', newHp: number): void {
    const isPlayer = side === 'player'
    const bar = isPlayer ? this.playerHpBar : this.npcHpBar
    const max = isPlayer ? this.playerMaxHp : this.npcMaxHp
    const prev = isPlayer ? this.playerHpTween : this.npcHpTween
    prev?.stop()

    const current = { hp: isPlayer ? this.playerHpCurrent : this.npcHpCurrent }
    const t = this.tweens.add({
      targets: current,
      hp: newHp,
      duration: 300,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (bar) this._drawHpBar(bar, isPlayer ? PLAYER_X : NPC_X, current.hp, max, isPlayer ? PLAYER_BAR_COLOR : NPC_BAR_COLOR)
      },
      onComplete: () => {
        if (isPlayer) { this.playerHpCurrent = newHp; this.playerHpTween = undefined }
        else { this.npcHpCurrent = newHp; this.npcHpTween = undefined }
      },
    })
    if (isPlayer) this.playerHpTween = t
    else this.npcHpTween = t
  }

  private _drawHpBar(g: Phaser.GameObjects.Graphics, cx: number, hp: number, maxHp: number, color: number): void {
    const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
    g.clear()
    g.fillStyle(color)
    g.fillRect(cx - BAR_W / 2, BAR_Y, Math.round(BAR_W * pct), BAR_H)
  }
}
