// CombatHud — Phase B + Phase C 戰鬥介面（v0.25.0）。
//
// Phase B (CombatHud): 純 React + Tailwind，三按鈕（攻擊/防禦/逃跑）+ 雙方 hp bar。
// Phase C (CombatHudPhaseC): SSE-driven real-time HUD + card hand + client prediction.

import { useCallback, useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { api, ApiError, type ServerCombatHandCard, type ServerCombatSession } from '../../api/client'
import { useAuth } from '../../state/AuthContext'
import { CombatProjection, type CombatSseSnapshot } from '../../state/CombatProjection.js'
import {
  CombatScene,
  COMBAT_SCENE_W,
  COMBAT_SCENE_H,
  type CombatSceneInit,
} from './CombatScene.js'
import {
  PLAYER_HAND_CARDS,
  getCombatHandCardMeta,
  shouldShowRejectToast,
} from './combatHand.js'

type CombatAction = 'attack' | 'defend' | 'flee'

interface CombatHudProps {
  npcName: string
  initialSession: ServerCombatSession
  onClose: () => void
  enemyType?: 'npc' | 'animal'
  /** v0.90.0 — 術式卡手牌（基本牌 + 已購術式卡）；缺值時只顯示三按鈕。 */
  hand?: ServerCombatHandCard[]
  /** 此戰鬥已施放過的卡（每場每張限用一次）。 */
  initialUsedCardClasses?: string[]
}

export function CombatHud({ npcName, initialSession, onClose, enemyType = 'npc', hand, initialUsedCardClasses }: CombatHudProps) {
  const { token } = useAuth()
  const [session, setSession] = useState<ServerCombatSession>(initialSession)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastEvents, setLastEvents] = useState<
    Array<{ eventType: string; payload: Record<string, unknown> }>
  >([])
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [usedCards, setUsedCards] = useState<Set<string>>(
    () => new Set(initialUsedCardClasses ?? [])
  )

  // ESC 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = useCallback(
    async (action: CombatAction) => {
      if (!token || busy) return
      setBusy(true)
      setError(null)
      const cardClass = selectedCard ?? undefined
      try {
        const r = await api.combatAction(token, session.combatId, action, undefined, cardClass)
        setSession(r.session)
        setLastEvents(r.events)
        if (cardClass) {
          setUsedCards((prev) => new Set(prev).add(cardClass))
          setSelectedCard(null)
        }
      } catch (err) {
        const msg =
          err instanceof ApiError && err.code
            ? `${err.code} · ${err.message}`
            : err instanceof Error
              ? err.message
              : 'unknown error'
        setError(msg)
      } finally {
        setBusy(false)
      }
    },
    [token, session.combatId, busy, selectedCard]
  )

  const isResolved = session.state === 'resolved'
  const playerPct = Math.round((session.playerHp / session.initialHp) * 100)
  const npcPct = Math.round((session.npcHp / session.initialHp) * 100)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`戰鬥：${npcName}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/85 backdrop-blur-sm px-3 pb-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-lg gi-panel border-ember-700/60 p-5 flex flex-col gap-4"
      >
        <header className="flex items-start justify-between">
          <div>
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
              戰鬥 / Combat
            </div>
            <h2 className="font-display font-extrabold text-2xl text-ground-100">
              {npcName}
            </h2>
            <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
              回合 {session.combatRound} · {isResolved ? `已結束 / ${session.outcome}` : '進行中'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
          >
            關閉
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <HpBar label="你 / You" value={session.playerHp} max={session.initialHp} pct={playerPct} colorClass="bg-moss-500" />
          <HpBar label={npcName} value={session.npcHp} max={session.initialHp} pct={npcPct} colorClass="bg-ember-500" />
        </div>

        {lastEvents.length > 0 && (
          <div className="border border-ground-800 rounded-sharp p-3 text-[12px] text-ground-300 flex flex-col gap-1 max-h-32 overflow-y-auto">
            <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-1">
              本回合：
            </div>
            {lastEvents.map((ev, idx) => (
              <div key={idx}>
                <span className="text-ember-400">{ev.eventType}</span>
                <span className="ml-2 text-ground-400">{describeEvent(ev)}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-ember-700/60 rounded-sharp p-3 text-[12px] text-ember-300">
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1">
              錯誤
            </div>
            <div className="text-ground-300">{error}</div>
          </div>
        )}

        {!isResolved && hand && hand.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
              術式卡（每場每張限用一次；點選後隨下一個行動施放）
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {hand.map((card) => {
                const used = usedCards.has(card.cardClass)
                const selected = selectedCard === card.cardClass
                return (
                  <button
                    key={card.cardClass}
                    type="button"
                    disabled={busy || used}
                    onClick={() => setSelectedCard(selected ? null : card.cardClass)}
                    className={[
                      'gi-touch px-2 py-1.5 text-left text-[11px] font-display tracking-tightest border rounded-sharp',
                      used
                        ? 'border-ground-800 text-ground-600 line-through cursor-not-allowed'
                        : selected
                          ? 'border-ember-500 text-ember-200 bg-ember-500/15'
                          : 'border-ground-700 text-ground-300 hover:border-ground-500 hover:text-ground-100',
                    ].join(' ')}
                  >
                    <span className="block text-[9px] uppercase text-ground-500">
                      {card.source === 'basic' ? '基本' : '術式'}{used ? ' ✓' : ''}
                    </span>
                    <span>{card.labelZh}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!isResolved ? (
          <div className="grid grid-cols-3 gap-2">
            <ActionButton label={selectedCard ? '攻擊＋施放' : '攻擊'} tone="ember" disabled={busy} onClick={() => submit('attack')} />
            <ActionButton label={selectedCard ? '防禦＋施放' : '防禦'} tone="moss" disabled={busy} onClick={() => submit('defend')} />
            <ActionButton label="逃跑" tone="ground" disabled={busy} onClick={() => submit('flee')} />
          </div>
        ) : (
          <div className="text-[12px] text-ground-300 leading-relaxed">
            {session.outcome === 'player_victory' && (enemyType === 'animal' ? `你獵殺了 ${npcName}。` : '你贏了。NPC 倒地，5 秒後甦醒。')}
            {session.outcome === 'npc_victory' && '你輸了。energy 歸零；找個地方休息。'}
            {session.outcome === 'fled' && '你成功逃脫。'}
          </div>
        )}
      </div>
    </div>
  )
}

function HpBar({
  label,
  value,
  max,
  pct,
  colorClass,
}: {
  label: string
  value: number
  max: number
  pct: number
  colorClass: string
}) {
  const clampedPct = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] font-display uppercase tracking-tightest text-ground-400">
        <span>{label}</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div className="w-full h-3 bg-ground-900 border border-ground-800 rounded-sharp overflow-hidden">
        <div
          className={`h-full ${colorClass}`}
          style={{ width: `${clampedPct}%`, transition: 'width 200ms ease' }}
        />
      </div>
    </div>
  )
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string
  tone: 'ember' | 'moss' | 'ground'
  disabled: boolean
  onClick: () => void
}) {
  const toneClass =
    tone === 'ember'
      ? 'border-ember-600 text-ember-300 hover:bg-ember-500/10'
      : tone === 'moss'
        ? 'border-moss-600 text-moss-300 hover:bg-moss-500/10'
        : 'border-ground-600 text-ground-300 hover:bg-ground-700/30'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gi-touch px-4 py-2 text-[12px] font-display uppercase tracking-tightest border rounded-sharp ${toneClass} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  )
}

function describeEvent(ev: { eventType: string; payload: Record<string, unknown> }): string {
  const p = ev.payload
  switch (ev.eventType) {
    case 'COMBAT_DAMAGE': {
      const amount = typeof p.amount === 'number' ? p.amount : 0
      const crit = p.crit === true
      const src = String(p.sourceActorId ?? '?')
      return `${src} → ${amount} 傷害${crit ? '（暴擊）' : ''}`
    }
    case 'COMBAT_DEFEND': {
      const recovered = typeof p.recoveredHp === 'number' ? p.recoveredHp : 0
      return `防禦${recovered > 0 ? `（恢復 ${recovered} hp）` : ''}`
    }
    case 'COMBAT_FLEE':
      return '逃跑'
    case 'COMBAT_RESOLVE':
      return `結束：${p.outcome}`
    case 'COMBAT_CARD_IGNORED':
      return `紋卡 #${p.cardId} 暫未支援（Phase C）`
    case 'COMBAT_CARD_USED':
      return `施放術式：${p.cardClass}`
    case 'COMBAT_HEAL': {
      const amount = typeof p.amount === 'number' ? p.amount : 0
      return `恢復 ${amount} hp`
    }
    default:
      return ''
  }
}

// ── Phase C: real-time SSE-driven HUD ─────────────────────────────────────────

export interface CombatHudPhaseCProps {
  combatId: string
  playerActorId: string
  npcActorId: string
  npcName: string
  onClose: () => void
}

export function CombatHudPhaseC({ combatId, playerActorId, npcActorId, npcName, onClose }: CombatHudPhaseCProps) {
  const { token } = useAuth()
  const [projection] = useState(() => new CombatProjection())
  const [hpDisplay, setHpDisplay] = useState<{ playerHp: number; npcHp: number; maxHp: number } | null>(null)
  const [statusLabels, setStatusLabels] = useState<string[]>([])
  const [resolved, setResolved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingCmds, setPendingCmds] = useState<Map<string, string>>(new Map())

  const sceneRef = useRef<CombatScene | null>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Boot Phaser scene
  useEffect(() => {
    if (!containerRef.current) return
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: COMBAT_SCENE_W,
      height: COMBAT_SCENE_H,
      backgroundColor: '#0d0f14',
      pixelArt: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: [CombatScene],
      banner: false,
    })
    gameRef.current = game

    const init: CombatSceneInit = {
      playerActorId,
      npcActorId,
      playerMaxHp: 100,
      npcMaxHp: 100,
      onReady: () => {
        const scene = game.scene.getScene(CombatScene.KEY) as CombatScene
        sceneRef.current = scene
      },
    }
    game.scene.start(CombatScene.KEY, init)

    return () => {
      game.destroy(true)
      gameRef.current = null
      sceneRef.current = null
    }
  }, [playerActorId, npcActorId])

  // Sync state to HpDisplay + scene
  const syncState = useCallback(() => {
    const s = projection.state
    if (!s) return
    const player = s.actors.find((a) => a.actorId === playerActorId)
    const npc = s.actors.find((a) => a.actorId === npcActorId)
    if (player && npc) {
      setHpDisplay({ playerHp: player.hp, npcHp: npc.hp, maxHp: player.maxHp })
    }
    setResolved(s.resolved)
    const labels = s.statuses
      .filter((st) => st.targetActorId === playerActorId)
      .map((st) => `${st.statusId}(${st.remainingTicks})`)
    setStatusLabels(labels)
    sceneRef.current?.applyState(s)
  }, [projection, playerActorId, npcActorId])

  // Fetch initial snapshot + subscribe SSE
  useEffect(() => {
    if (!token) return
    let es: EventSource | null = null
    let closed = false

    void api.combatSnapshot(token, combatId).then((snap: CombatSseSnapshot) => {
      if (closed) return
      projection.applySnapshot(snap)
      syncState()
    })

    const streamUrl = api.combatStreamUrl(combatId)
    es = new EventSource(streamUrl)

    es.addEventListener('snapshot', (e) => {
      try {
        const snap = JSON.parse((e as MessageEvent).data) as CombatSseSnapshot
        projection.applySnapshot(snap)
        syncState()
      } catch { /* ignore malformed */ }
    })

    es.addEventListener('event', (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as { eventType: string; payload: unknown; tickDigest: string }
        const prev = projection.state
        projection.applyEvent(msg)
        const next = projection.state

        // Show floating number for damage/heal
        if (msg.eventType === 'COMBAT_DAMAGE' || msg.eventType === 'COMBAT_HEAL') {
          const d = extractPayloadData(msg.payload)
          const targetId = typeof d.targetActorId === 'string' ? d.targetActorId : null
          const amount = typeof d.amount === 'number' ? d.amount : 0
          if (targetId && amount !== 0 && sceneRef.current) {
            const delta = msg.eventType === 'COMBAT_DAMAGE' ? -amount : amount
            sceneRef.current.pushFloatingNumber(targetId, delta)
          }
        }

        // Stale check — re-fetch snapshot if tickDigest drifted
        if (token && next && prev && projection.isStale(msg.tickDigest)) {
          void api.combatSnapshot(token, combatId).then((snap: CombatSseSnapshot) => {
            if (closed) return
            projection.applySnapshot(snap)
            syncState()
          })
        } else {
          syncState()
        }
      } catch { /* ignore malformed */ }
    })

    return () => {
      closed = true
      es?.close()
    }
  }, [token, combatId, projection, syncState])

  // Show dismiss toast after 2s
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2000)
    return () => window.clearTimeout(t)
  }, [toast])

  const playCard = useCallback(async (cardClass: string) => {
    if (!token || resolved) return
    const meta = getCombatHandCardMeta(cardClass)
    if (!meta) return
    const targetActorId = meta.targetSelf ? playerActorId : npcActorId

    // Start optimistic prediction
    const commandId = `cmd_${Date.now()}_${cardClass}`
    if (meta.predictedHpDelta !== 0) {
      projection.predict({ commandId, targetActorId, predictedHpDelta: meta.predictedHpDelta })
      syncState()
    }
    setPendingCmds((m) => new Map(m).set(commandId, cardClass))

    try {
      const r = await api.combatPlay(token, combatId, cardClass, targetActorId)
      const result = projection.reconcile(commandId, true)
      if (shouldShowRejectToast(result)) setToast(`${meta.labelZh} 被拒絕`)
      setPendingCmds((m) => { const n = new Map(m); n.delete(r.commandId); return n })
    } catch {
      // Server rejected
      const result = projection.reconcile(commandId, false)
      if (shouldShowRejectToast(result)) setToast(`${meta.labelZh} 無法施放`)
      setPendingCmds((m) => { const n = new Map(m); n.delete(commandId); return n })
    }
    syncState()
  }, [token, resolved, combatId, playerActorId, npcActorId, projection, syncState])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`戰鬥（Phase C）：${npcName}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/85 backdrop-blur-sm px-3 pb-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-lg gi-panel border-ember-700/60 p-4 flex flex-col gap-3"
      >
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">戰鬥 / Combat C</div>
            <h2 className="font-display font-extrabold text-xl text-ground-100">{npcName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
          >
            關閉
          </button>
        </header>

        {/* HP display */}
        {hpDisplay && (
          <div className="flex flex-col gap-2">
            <HpBar label="你 / You" value={hpDisplay.playerHp} max={hpDisplay.maxHp} pct={Math.round((hpDisplay.playerHp / hpDisplay.maxHp) * 100)} colorClass="bg-moss-500" />
            <HpBar label={npcName} value={hpDisplay.npcHp} max={hpDisplay.maxHp} pct={Math.round((hpDisplay.npcHp / hpDisplay.maxHp) * 100)} colorClass="bg-ember-500" />
          </div>
        )}

        {/* Phaser combat canvas */}
        <div
          ref={containerRef}
          className="w-full rounded-sharp overflow-hidden border border-ground-800 bg-ground-900 select-none"
          style={{ height: 160 }}
        />

        {/* Active status icons */}
        {statusLabels.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {statusLabels.map((label) => (
              <span key={label} className="text-[10px] font-display uppercase tracking-tightest border border-ground-700 rounded-sharp px-2 py-0.5 text-ground-400">
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Reject toast */}
        {toast && (
          <div className="border border-ember-700/60 rounded-sharp px-3 py-2 text-[12px] text-ember-300 font-display">
            {toast}
          </div>
        )}

        {/* Card hand */}
        {!resolved ? (
          <div className="grid grid-cols-3 gap-1.5">
            {PLAYER_HAND_CARDS.map((cardClass) => {
              const meta = getCombatHandCardMeta(cardClass)
              const busy = pendingCmds.size > 0
              return (
                <button
                  key={cardClass}
                  type="button"
                  disabled={busy}
                  onClick={() => void playCard(cardClass)}
                  className="gi-touch px-2 py-2 text-[11px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-ground-500 hover:text-ground-100 rounded-sharp disabled:opacity-40 disabled:cursor-not-allowed text-left"
                >
                  <span className="block text-[10px] text-ground-500">{meta?.labelEn}</span>
                  <span>{meta?.labelZh}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-[12px] text-ground-300">戰鬥結束。</div>
        )}
      </div>
    </div>
  )
}

function extractPayloadData(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {}
  const p = payload as Record<string, unknown>
  if (typeof p.data === 'object' && p.data !== null) return p.data as Record<string, unknown>
  return p
}
